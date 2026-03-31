/**
 * Cloud embedding service using OpenAI or Voyage APIs.
 *
 * Sends texts to a cloud embedding API instead of running ONNX locally.
 * Significantly faster for large codebases (~10,000+ texts/sec vs ~400 on CPU).
 */

import type { IEmbeddingService } from '../core/interfaces.js';
import { EmbeddingError } from '../core/exceptions.js';

// ─── Types ───────────────────────────────────────────────────────────────────

export type CloudProvider = 'openai' | 'voyage' | 'gemini' | 'ollama';

export interface CloudEmbeddingConfig {
  provider: CloudProvider;
  apiKey: string;
  model?: string;
  dimensions?: number;
  baseUrl?: string;
  batchSize?: number;
  concurrency?: number;
}

interface ProviderDefaults {
  model: string;
  dimensions: number;
  batchSize: number;
  baseUrl: string;
}

const PROVIDER_DEFAULTS: Record<CloudProvider, ProviderDefaults> = {
  openai: {
    model: 'text-embedding-3-small',
    dimensions: 384,
    batchSize: 2048,
    baseUrl: 'https://api.openai.com/v1/embeddings',
  },
  voyage: {
    model: 'voyage-code-3',
    dimensions: 1024,
    batchSize: 128,
    baseUrl: 'https://api.voyageai.com/v1/embeddings',
  },
  gemini: {
    model: 'gemini-embedding-001',
    dimensions: 3072,
    batchSize: 100, // Gemini batch limit: 100 texts per request
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
  },
  ollama: {
    model: 'nomic-embed-text',
    dimensions: 768,
    batchSize: 512,
    baseUrl: 'http://localhost:11434/v1/embeddings',
  },
};

// ─── CloudEmbeddingService ───────────────────────────────────────────────────

export class CloudEmbeddingService implements IEmbeddingService {
  private provider: CloudProvider;
  private apiKey: string;
  private model: string;
  private _dimensions: number;
  private baseUrl: string;
  private batchSize: number;
  private concurrency: number;

  // LRU cache
  private cache: Map<string, number[]> = new Map();
  private cacheMaxSize = 5000;

  // Stats
  private stats = {
    totalEmbeddings: 0,
    totalBatches: 0,
    totalTime: 0,
    cacheHits: 0,
    cacheMisses: 0,
    apiCalls: 0,
    totalTokens: 0,
  };

  constructor(config: CloudEmbeddingConfig) {
    this.provider = config.provider;
    this.apiKey = config.apiKey;

    const defaults = PROVIDER_DEFAULTS[config.provider];
    this.model = config.model ?? defaults.model;
    this._dimensions = config.dimensions ?? defaults.dimensions;
    this.baseUrl = config.baseUrl ?? defaults.baseUrl;
    this.batchSize = config.batchSize ?? defaults.batchSize;
    this.concurrency = config.concurrency ?? 5;

    console.error(
      `[codebaxing] Using cloud embeddings: ${this.provider} (model: ${this.model}, dims: ${this._dimensions})`
    );
  }

  get dimensions(): number {
    return this._dimensions;
  }

  async embed(text: string, isQuery: boolean = false): Promise<number[]> {
    const cacheKey = `${isQuery ? 'q:' : 'd:'}${text}`;
    const cached = this.cache.get(cacheKey);
    if (cached) {
      this.stats.cacheHits++;
      return cached;
    }

    const results = await this.embedBatch([text], isQuery);
    return results[0];
  }

  async embedBatch(texts: string[], _isQuery: boolean = false): Promise<number[][]> {
    if (texts.length === 0) return [];

    const startTime = performance.now();

    // Split into API-sized batches
    const batches: string[][] = [];
    for (let i = 0; i < texts.length; i += this.batchSize) {
      batches.push(texts.slice(i, i + this.batchSize));
    }

    // Process with concurrency limit
    const allEmbeddings: number[][] = new Array(texts.length);
    let offset = 0;

    for (let i = 0; i < batches.length; i += this.concurrency) {
      const concurrent = batches.slice(i, i + this.concurrency);
      const promises = concurrent.map(batch => this.callApi(batch));
      const results = await Promise.all(promises);

      for (const embeddings of results) {
        for (const embedding of embeddings) {
          allEmbeddings[offset++] = embedding;
        }
      }
    }

    // Update cache
    for (let i = 0; i < texts.length; i++) {
      const cacheKey = `d:${texts[i]}`;
      this.stats.cacheMisses++;
      if (this.cache.size >= this.cacheMaxSize) {
        const firstKey = this.cache.keys().next().value!;
        this.cache.delete(firstKey);
      }
      this.cache.set(cacheKey, allEmbeddings[i]);
    }

    const elapsed = (performance.now() - startTime) / 1000;
    this.stats.totalEmbeddings += texts.length;
    this.stats.totalBatches++;
    this.stats.totalTime += elapsed;

    return allEmbeddings;
  }

  private async callApi(texts: string[], retries = 3): Promise<number[][]> {
    if (this.provider === 'gemini') {
      return this.callGeminiApi(texts, retries);
    }
    return this.callOpenAiCompatibleApi(texts, retries);
  }

  // OpenAI and Voyage share the same API format
  private async callOpenAiCompatibleApi(texts: string[], retries: number): Promise<number[][]> {
    const body: Record<string, unknown> = {
      model: this.model,
      input: texts,
    };

    if (this.provider === 'openai' && this._dimensions) {
      body.dimensions = this._dimensions;
    }
    if (this.provider === 'voyage') {
      body.input_type = 'document';
    }

    for (let attempt = 0; attempt < retries; attempt++) {
      try {
        const headers: Record<string, string> = {
          'Content-Type': 'application/json',
        };
        if (this.apiKey) {
          headers['Authorization'] = `Bearer ${this.apiKey}`;
        }

        const response = await fetch(this.baseUrl, {
          method: 'POST',
          headers,
          body: JSON.stringify(body),
        });

        if (response.status === 429 || response.status >= 500) {
          const retryAfter = response.headers.get('retry-after');
          const waitMs = retryAfter ? parseInt(retryAfter, 10) * 1000 : Math.pow(2, attempt) * 1000;
          console.error(`[codebaxing] API rate limited (${response.status}), retrying in ${waitMs}ms...`);
          await new Promise(r => setTimeout(r, waitMs));
          continue;
        }

        if (!response.ok) {
          const errorText = await response.text();
          throw new EmbeddingError(
            `${this.provider} API error (${response.status}): ${errorText.slice(0, 200)}`
          );
        }

        const json = await response.json() as {
          data: Array<{ embedding: number[]; index: number }>;
          usage?: { total_tokens?: number; prompt_tokens?: number };
        };

        this.stats.apiCalls++;
        if (json.usage) {
          this.stats.totalTokens += json.usage.total_tokens ?? json.usage.prompt_tokens ?? 0;
        }

        const sorted = json.data.sort((a, b) => a.index - b.index);
        return sorted.map(d => d.embedding);
      } catch (e) {
        if (e instanceof EmbeddingError) throw e;
        if (attempt === retries - 1) {
          throw new EmbeddingError(`${this.provider} API call failed: ${(e as Error).message}`);
        }
        const waitMs = Math.pow(2, attempt) * 1000;
        console.error(`[codebaxing] API error, retrying in ${waitMs}ms: ${(e as Error).message}`);
        await new Promise(r => setTimeout(r, waitMs));
      }
    }

    throw new EmbeddingError(`${this.provider} API failed after ${retries} retries`);
  }

  // Gemini uses a different API format (batchEmbedContents)
  private async callGeminiApi(texts: string[], retries: number): Promise<number[][]> {
    const url = `${this.baseUrl}/models/${this.model}:batchEmbedContents?key=${this.apiKey}`;
    const body = {
      requests: texts.map(text => ({
        model: `models/${this.model}`,
        content: { parts: [{ text }] },
        taskType: 'RETRIEVAL_DOCUMENT',
        outputDimensionality: this._dimensions,
      })),
    };

    for (let attempt = 0; attempt < retries; attempt++) {
      try {
        const response = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });

        if (response.status === 429 || response.status >= 500) {
          const retryAfter = response.headers.get('retry-after');
          const waitMs = retryAfter ? parseInt(retryAfter, 10) * 1000 : Math.pow(2, attempt) * 1000;
          console.error(`[codebaxing] Gemini rate limited (${response.status}), retrying in ${waitMs}ms...`);
          await new Promise(r => setTimeout(r, waitMs));
          continue;
        }

        if (!response.ok) {
          const errorText = await response.text();
          throw new EmbeddingError(
            `Gemini API error (${response.status}): ${errorText.slice(0, 200)}`
          );
        }

        const json = await response.json() as {
          embeddings: Array<{ values: number[] }>;
        };

        this.stats.apiCalls++;
        return json.embeddings.map(e => e.values);
      } catch (e) {
        if (e instanceof EmbeddingError) throw e;
        if (attempt === retries - 1) {
          throw new EmbeddingError(`Gemini API call failed: ${(e as Error).message}`);
        }
        const waitMs = Math.pow(2, attempt) * 1000;
        console.error(`[codebaxing] Gemini error, retrying in ${waitMs}ms: ${(e as Error).message}`);
        await new Promise(r => setTimeout(r, waitMs));
      }
    }

    throw new EmbeddingError(`Gemini API failed after ${retries} retries`);
  }

  getStats(): Record<string, unknown> {
    return {
      ...this.stats,
      provider: this.provider,
      model: this.model,
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
    this.cache.clear();
  }
}
