/**
 * Embedding service using @huggingface/transformers (Transformers.js).
 *
 * Runs ONNX models locally in Node.js — no external server needed.
 * Default model: Xenova/all-MiniLM-L6-v2 (384 dims, fast, well-supported)
 *
 * Device Support:
 *   Set CODEBAXING_DEVICE environment variable:
 *   - 'coreml': Apple Neural Engine / Metal GPU (macOS only, default on macOS)
 *   - 'cuda': NVIDIA GPU (Linux/Windows only, requires CUDA drivers)
 *   - 'cpu': CPU inference, works everywhere
 *   - 'webgpu': WebGPU backend (experimental)
 *   - 'auto': Auto-detect best available device
 *
 * Default: GPU-preferred per platform (macOS→coreml, Linux/Win→cuda), falls back to CPU.
 *
 * Note: For the small default model (all-MiniLM-L6-v2 q8), CPU is often faster
 *       due to low CPU↔GPU transfer overhead. GPU shines with larger/fp32 models.
 */

import fs from 'node:fs';
import path from 'node:path';

import { EmbeddingError } from '../core/exceptions.js';
import type { IEmbeddingService } from '../core/interfaces.js';

// ─── Device Configuration ─────────────────────────────────────────────────────

export type DeviceType = 'cpu' | 'cuda' | 'coreml' | 'webgpu' | 'auto';
export type DType = 'fp32' | 'fp16' | 'q8' | 'q4';

const VALID_DEVICES: DeviceType[] = ['cpu', 'cuda', 'coreml', 'webgpu', 'auto'];
const VALID_DTYPES: DType[] = ['fp32', 'fp16', 'q8', 'q4'];

/**
 * Detect the best available device for the current platform.
 *
 * Defaults to 'cpu' because the default model (all-MiniLM-L6-v2, q8) is a small
 * 6-layer model where CPU is fastest (~720 texts/sec vs ~343 WebGPU vs ~96 CoreML).
 * GPU overhead (data transfer, session compilation) exceeds compute savings.
 *
 * GPU options are available via CODEBAXING_DEVICE env var for larger models:
 * - macOS: 'coreml' (Apple Neural Engine / Metal GPU via onnxruntime-node)
 * - macOS: 'webgpu' (Metal GPU via onnxruntime-node WebGPU EP)
 * - Linux/Windows: 'cuda' (NVIDIA GPU, requires CUDA drivers)
 */
function detectBestDevice(): DeviceType {
  return 'cpu';
}

/**
 * Get the configured device from environment variable.
 * Defaults to GPU-preferred auto-detection (falls back to CPU on failure).
 */
export function getConfiguredDevice(): DeviceType {
  const envDevice = process.env.CODEBAXING_DEVICE?.toLowerCase();
  if (envDevice && VALID_DEVICES.includes(envDevice as DeviceType)) {
    return envDevice as DeviceType;
  }
  return detectBestDevice();
}

/**
 * Get the configured dtype from environment variable.
 * Defaults to 'q8' for best speed/quality tradeoff (~3x faster than fp32).
 */
export function getConfiguredDtype(): DType {
  const envDtype = process.env.CODEBAXING_DTYPE?.toLowerCase();
  if (envDtype && VALID_DTYPES.includes(envDtype as DType)) {
    return envDtype as DType;
  }
  return 'q8';
}

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
  const os = await import('os');
  const path = await import('path');
  pipeline = transformers.pipeline;
  env = transformers.env;

  // Disable remote model downloads warning
  env.allowLocalModels = true;
  env.allowRemoteModels = true;

  // Use a stable cache directory so models persist across npx runs.
  // Default transformers.js cache is inside node_modules (lost on every npx -y invocation).
  const cacheDir = process.env.CODEBAXING_MODEL_CACHE
    ?? path.join(os.homedir(), '.cache', 'codebaxing', 'models');
  env.cacheDir = cacheDir;

  // Configure ONNX thread count.
  // When running in worker processes, use 1 thread (parallelism via multiple processes).
  // Otherwise use all CPU cores for single-process throughput.
  const onnxThreadsEnv = process.env.CODEBAXING_ONNX_THREADS;
  const numCpus = os.cpus().length;
  const onnxThreads = onnxThreadsEnv ? parseInt(onnxThreadsEnv, 10) : Math.min(numCpus, 8);
  env.backends.onnx.wasm.numThreads = onnxThreads;

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

export class EmbeddingService implements IEmbeddingService {
  private modelName: string;
  private config: EmbeddingModelConfig;
  private device: DeviceType;
  private dtype: DType;
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

  // When true, skip cache purge on corrupt model (used by workers to avoid race conditions)
  private disableCachePurge: boolean;

  constructor(
    modelName: string = DEFAULT_MODEL,
    options: { showProgress?: boolean; device?: DeviceType; dtype?: DType; disableCachePurge?: boolean } = {}
  ) {
    this.modelName = modelName;
    this.showProgress = options.showProgress ?? false;
    this.device = options.device ?? getConfiguredDevice();
    this.dtype = options.dtype ?? getConfiguredDtype();
    this.disableCachePurge = options.disableCachePurge ?? false;

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

  /** Get the device being used for inference */
  getDevice(): DeviceType {
    return this.device;
  }

  get dimensions(): number {
    return this.config.dimensions;
  }

  private async loadModel(): Promise<void> {
    if (this.extractor) return;
    if (this.loading) return this.loading;

    this.loading = (async () => {
      try {
        await importTransformers();

        const deviceLabel = this.device === 'cpu' ? 'CPU' : this.device.toUpperCase();
        // Always log model loading to stderr so MCP servers and CLI both show it
        console.error(`[codebaxing] Loading embedding model: ${this.config.modelId} (device: ${deviceLabel}, dtype: ${this.dtype}, cache: ${env.cacheDir})`);

        // Progress callback for model download
        const progressCallback = (progress: { status: string; file?: string; progress?: number; loaded?: number; total?: number }) => {
          if (progress.status === 'downloading' || progress.status === 'progress') {
            const pct = progress.progress ?? (progress.loaded && progress.total ? (progress.loaded / progress.total) * 100 : 0);
            const fileName = progress.file ? progress.file.split('/').pop() : 'model';
            process.stderr.write(`\r[codebaxing]    Downloading ${fileName}: ${pct.toFixed(1)}%`);
          } else if (progress.status === 'done') {
            process.stderr.write(`\r[codebaxing]    Download complete.                    \n`);
          }
        };

        // Build pipeline options
        // Use dtype instead of deprecated quantized flag (Transformers.js v3)
        const pipelineOptions: Record<string, unknown> = {
          dtype: this.dtype,
          progress_callback: progressCallback,
        };

        // Configure device
        // 'coreml' uses native onnxruntime-node with CoreML execution provider (macOS Metal/ANE)
        // Other GPU devices use Transformers.js device option directly
        if (this.device === 'coreml') {
          pipelineOptions.session_options = {
            executionProviders: ['coreml', 'cpu'],
          };
        } else if (this.device !== 'cpu') {
          pipelineOptions.device = this.device;
        }

        try {
          this.extractor = await pipeline('feature-extraction', this.config.modelId, pipelineOptions);
        } catch (e) {
          const errorMsg = (e as Error).message;

          // Detect corrupt cached model (e.g. incomplete download, broken ONNX protobuf)
          if (errorMsg.includes('Protobuf parsing failed') || errorMsg.includes('Load model from')) {
            // Workers skip purge to avoid race conditions — let main process handle it
            if (this.disableCachePurge) {
              throw new EmbeddingError(`Failed to load embedding model: ${errorMsg}`);
            }
            const purged = EmbeddingService.purgeModelCache(this.config.modelId);
            if (purged) {
              console.error(
                `[codebaxing] Corrupt model cache detected. Purged cache and re-downloading ${this.config.modelId}...`
              );
              try {
                this.extractor = await pipeline('feature-extraction', this.config.modelId, pipelineOptions);
              } catch (retryErr) {
                throw new EmbeddingError(
                  `Failed to load embedding model after re-download: ${(retryErr as Error).message}`
                );
              }
            } else {
              throw new EmbeddingError(`Failed to load embedding model: ${errorMsg}`);
            }
          // Non-CPU device failed — fallback to CPU (catches WebGPU unavailable, CUDA missing, etc.)
          } else if (this.device !== 'cpu') {
            console.error(
              `[codebaxing] ${deviceLabel} unavailable: ${errorMsg}. Falling back to CPU.`
            );
            this.device = 'cpu';
            try {
              this.extractor = await pipeline('feature-extraction', this.config.modelId, {
                dtype: this.dtype,
              });
            } catch (cpuErr) {
              // CPU also failed — try default model if using custom model
              if (this.modelName !== DEFAULT_MODEL) {
                console.error(
                  `[codebaxing] Failed to load model ${this.config.modelId}: ${(cpuErr as Error).message}. ` +
                  `Falling back to ${DEFAULT_MODEL}`
                );
                this.config = { ...EMBEDDING_MODELS[DEFAULT_MODEL] };
                this.extractor = await pipeline('feature-extraction', this.config.modelId, {
                  dtype: this.dtype,
                });
              } else {
                throw new EmbeddingError(`Failed to load embedding model: ${(cpuErr as Error).message}`);
              }
            }
          } else if (this.modelName !== DEFAULT_MODEL) {
            // CPU + custom model failed — fall back to default model
            console.error(
              `[codebaxing] Failed to load model ${this.config.modelId}: ${errorMsg}. ` +
              `Falling back to ${DEFAULT_MODEL}`
            );
            this.config = { ...EMBEDDING_MODELS[DEFAULT_MODEL] };
            this.extractor = await pipeline('feature-extraction', this.config.modelId, {
              dtype: this.dtype,
            });
          } else {
            throw new EmbeddingError(`Failed to load embedding model: ${errorMsg}`);
          }
        }

        const actualDevice = this.device === 'cpu' ? 'CPU' : this.device.toUpperCase();
        console.error(`[codebaxing] Model loaded: ${this.config.modelId} (${this.config.dimensions} dims, ${actualDevice}, ${this.dtype})`);
      } finally {
        this.loading = null;
      }
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

    // Truncate long texts to improve performance
    // MiniLM has max_seq_length=256 tokens (~1000 chars), longer text is truncated anyway
    // Truncating early reduces tokenization overhead significantly
    const maxChars = 1500;
    const inputTexts = texts.map(t => {
      const text = prefix ? prefix + t : t;
      return text.length > maxChars ? text.slice(0, maxChars) : text;
    });

    // Process in sub-batches to manage memory
    // TRUE batch processing - pass array to extractor instead of one by one
    // Larger batch = better throughput, but more memory
    // 128 is optimal for CPU with 8 threads (tested: 52 chunks/sec)
    const batchSize = 128;
    const allEmbeddings: number[][] = [];

    for (let i = 0; i < inputTexts.length; i += batchSize) {
      const batch = inputTexts.slice(i, i + batchSize);

      try {
        // TRUE BATCH: Pass array of texts to extractor
        // Transformers.js will process them in parallel on GPU/CPU
        const output = await this.extractor(batch, {
          pooling: 'mean',
          normalize: true,
        });

        // Extract embeddings from batched output
        // Output shape: [batch_size, dimensions] stored in output.data
        const dims = this.config.dimensions;
        const data = output.data as Float32Array;

        for (let j = 0; j < batch.length; j++) {
          const start = j * dims;
          const embedding = Array.from(data.slice(start, start + dims));
          allEmbeddings.push(embedding);
        }
      } catch (e) {
        // Fallback: process one by one if batch fails
        console.error(`[codebaxing] Batch embedding failed, falling back to sequential: ${(e as Error).message}`);
        for (const text of batch) {
          try {
            const output = await this.extractor(text, {
              pooling: 'mean',
              normalize: true,
            });
            allEmbeddings.push(Array.from(output.data) as number[]);
          } catch {
            allEmbeddings.push(new Array(this.config.dimensions).fill(0));
          }
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
      device: this.device,
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

  /**
   * Purge cached model files for a given model ID (e.g. "Xenova/all-MiniLM-L6-v2").
   * Returns true if cache was found and deleted, false otherwise.
   */
  static purgeModelCache(modelId: string): boolean {
    // Resolve cache dir: use env if transformers already loaded, otherwise compute default
    const cacheDir = env?.cacheDir
      ?? process.env.CODEBAXING_MODEL_CACHE
      ?? path.join(process.env.HOME ?? process.env.USERPROFILE ?? '/tmp', '.cache', 'codebaxing', 'models');

    const modelCacheDir = path.join(cacheDir, ...modelId.split('/'));
    try {
      if (fs.existsSync(modelCacheDir)) {
        fs.rmSync(modelCacheDir, { recursive: true, force: true });
        console.error(`[codebaxing] Purged corrupt model cache: ${modelCacheDir}`);
        return true;
      }
    } catch (e) {
      console.error(`[codebaxing] Failed to purge model cache at ${modelCacheDir}: ${(e as Error).message}`);
    }
    return false;
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
  options: { showProgress?: boolean; device?: DeviceType } = {}
): EmbeddingService {
  // Include device in cache key to support different devices per model
  const device = options.device ?? getConfiguredDevice();
  const cacheKey = `${modelName}:${device}`;

  if (!embeddingServices.has(cacheKey)) {
    embeddingServices.set(cacheKey, new EmbeddingService(modelName, { ...options, device }));
  }
  return embeddingServices.get(cacheKey)!;
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
