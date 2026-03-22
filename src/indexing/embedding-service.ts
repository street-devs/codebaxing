/**
 * Embedding service using @huggingface/transformers (Transformers.js).
 *
 * Runs ONNX models locally in Node.js — no external server needed.
 * Default model: Xenova/all-MiniLM-L6-v2 (384 dims, fast, well-supported)
 */

import { EmbeddingError } from '../core/exceptions.js';

// Lazy import transformers (heavy dependency)
// Using any types for transformers.js as its types are complex and version-dependent
/* eslint-disable @typescript-eslint/no-explicit-any */
let pipeline: any;
let env: any;
let transformersLoaded = false;
/* eslint-enable @typescript-eslint/no-explicit-any */

async function importTransformers() {
  if (transformersLoaded) return;
  const transformers = await import('@huggingface/transformers');
  pipeline = transformers.pipeline;
  env = transformers.env;

  // Disable remote model downloads warning
  env.allowLocalModels = true;
  env.allowRemoteModels = true;
  transformersLoaded = true;
}

// ─── Model Configs ───────────────────────────────────────────────────────────

export interface EmbeddingModelConfig {
  modelId: string;
  dimensions: number;
  maxSeqLength: number;
  queryPrefix: string;
  documentPrefix: string;
}

export const EMBEDDING_MODELS: Record<string, EmbeddingModelConfig> = {
  'all-MiniLM-L6-v2': {
    modelId: 'Xenova/all-MiniLM-L6-v2',
    dimensions: 384,
    maxSeqLength: 256,
    queryPrefix: '',
    documentPrefix: '',
  },
  'coderankembed': {
    modelId: 'nomic-ai/CodeRankEmbed',
    dimensions: 768,
    maxSeqLength: 8192,
    queryPrefix: 'Represent this query for searching relevant code: ',
    documentPrefix: '',
  },
};

export const DEFAULT_MODEL = 'all-MiniLM-L6-v2';

// ─── EmbeddingService ────────────────────────────────────────────────────────

export class EmbeddingService {
  private modelName: string;
  private config: EmbeddingModelConfig;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private extractor: any = null;
  private loading: Promise<void> | null = null;
  private showProgress: boolean;

  // LRU cache
  private cache: Map<string, number[]> = new Map();
  private cacheMaxSize = 5000;

  // Stats
  stats = {
    totalEmbeddings: 0,
    totalBatches: 0,
    totalTime: 0,
    cacheHits: 0,
    cacheMisses: 0,
  };

  constructor(
    modelName: string = DEFAULT_MODEL,
    options: { showProgress?: boolean } = {}
  ) {
    this.modelName = modelName;
    this.showProgress = options.showProgress ?? false;

    if (modelName in EMBEDDING_MODELS) {
      this.config = { ...EMBEDDING_MODELS[modelName] };
    } else {
      // Assume it's a HuggingFace model ID
      this.config = {
        modelId: modelName,
        dimensions: 384,
        maxSeqLength: 512,
        queryPrefix: '',
        documentPrefix: '',
      };
    }
  }

  get dimensions(): number {
    return this.config.dimensions;
  }

  private async loadModel(): Promise<void> {
    if (this.extractor) return;
    if (this.loading) return this.loading;

    this.loading = (async () => {
      await importTransformers();

      if (this.showProgress) {
        console.log(`Loading embedding model: ${this.config.modelId}`);
      }

      try {
        this.extractor = await pipeline('feature-extraction', this.config.modelId, {
          quantized: true,
        });
      } catch (e) {
        // Fall back to default model if custom model fails
        if (this.modelName !== DEFAULT_MODEL) {
          console.warn(
            `Failed to load model ${this.config.modelId}: ${(e as Error).message}. ` +
            `Falling back to ${DEFAULT_MODEL}`
          );
          this.config = { ...EMBEDDING_MODELS[DEFAULT_MODEL] };
          this.extractor = await pipeline('feature-extraction', this.config.modelId, {
            quantized: true,
          });
        } else {
          throw new EmbeddingError(`Failed to load embedding model: ${(e as Error).message}`);
        }
      }

      if (this.showProgress) {
        console.log(`Model loaded: ${this.config.modelId} (${this.config.dimensions} dims)`);
      }
      this.loading = null;
    })();

    return this.loading;
  }

  async embed(text: string, isQuery: boolean = false): Promise<number[]> {
    // Check cache
    const cacheKey = `${isQuery ? 'q:' : 'd:'}${text}`;
    const cached = this.cache.get(cacheKey);
    if (cached) {
      this.stats.cacheHits++;
      return cached;
    }

    await this.loadModel();

    const prefix = isQuery ? this.config.queryPrefix : this.config.documentPrefix;
    const inputText = prefix ? prefix + text : text;

    const output = await this.extractor(inputText, {
      pooling: 'mean',
      normalize: true,
    });

    const embedding = Array.from(output.data) as number[];

    // Update cache
    this.stats.cacheMisses++;
    this.stats.totalEmbeddings++;
    if (this.cache.size >= this.cacheMaxSize) {
      // Remove oldest entry
      const firstKey = this.cache.keys().next().value!;
      this.cache.delete(firstKey);
    }
    this.cache.set(cacheKey, embedding);

    return embedding;
  }

  async embedBatch(texts: string[], isQuery: boolean = false): Promise<number[][]> {
    if (texts.length === 0) return [];

    await this.loadModel();

    const startTime = performance.now();
    const prefix = isQuery ? this.config.queryPrefix : this.config.documentPrefix;
    const inputTexts = prefix ? texts.map(t => prefix + t) : texts;

    // Process in sub-batches to manage memory
    const batchSize = 32;
    const allEmbeddings: number[][] = [];

    for (let i = 0; i < inputTexts.length; i += batchSize) {
      const batch = inputTexts.slice(i, i + batchSize);

      // Process each text individually (Transformers.js handles batching internally)
      for (const text of batch) {
        try {
          const output = await this.extractor(text, {
            pooling: 'mean',
            normalize: true,
          });
          allEmbeddings.push(Array.from(output.data) as number[]);
        } catch (e) {
          console.warn(`Embedding error for text: ${(e as Error).message}. Skipping.`);
          // Push zero vector as fallback
          allEmbeddings.push(new Array(this.config.dimensions).fill(0));
        }
      }
    }

    const elapsed = (performance.now() - startTime) / 1000;
    this.stats.totalEmbeddings += texts.length;
    this.stats.totalBatches++;
    this.stats.totalTime += elapsed;

    return allEmbeddings;
  }

  getStats(): Record<string, unknown> {
    return {
      ...this.stats,
      embeddingsPerSecond: this.stats.totalTime > 0
        ? this.stats.totalEmbeddings / this.stats.totalTime
        : 0,
    };
  }

  clearCache(): void {
    this.cache.clear();
    this.stats.cacheHits = 0;
    this.stats.cacheMisses = 0;
  }

  async unload(): Promise<void> {
    if (this.extractor) {
      this.extractor = null;
      this.cache.clear();
    }
  }
}

// ─── Singleton Management ────────────────────────────────────────────────────

const embeddingServices: Map<string, EmbeddingService> = new Map();

export function getEmbeddingService(
  modelName: string = DEFAULT_MODEL,
  options: { showProgress?: boolean } = {}
): EmbeddingService {
  if (!embeddingServices.has(modelName)) {
    embeddingServices.set(modelName, new EmbeddingService(modelName, options));
  }
  return embeddingServices.get(modelName)!;
}

export async function resetEmbeddingService(modelName?: string): Promise<void> {
  if (modelName) {
    const service = embeddingServices.get(modelName);
    if (service) {
      await service.unload();
      embeddingServices.delete(modelName);
    }
  } else {
    for (const service of embeddingServices.values()) {
      await service.unload();
    }
    embeddingServices.clear();
  }
}
