/**
 * Factory for creating embedding services based on configuration.
 *
 * Supports local ONNX inference or cloud APIs (OpenAI, Voyage).
 * Configured via CODEBAXING_EMBEDDING_PROVIDER environment variable.
 */

import type { IEmbeddingService } from '../core/interfaces.js';
import { EmbeddingError } from '../core/exceptions.js';
import { EmbeddingService, DEFAULT_MODEL, type DeviceType, type DType } from './embedding-service.js';
import { CloudEmbeddingService, type CloudProvider } from './cloud-embedding-service.js';

// ─── Types ───────────────────────────────────────────────────────────────────

export type EmbeddingProvider = 'local' | 'openai' | 'voyage' | 'gemini' | 'ollama';

const VALID_PROVIDERS: EmbeddingProvider[] = ['local', 'openai', 'voyage', 'gemini', 'ollama'];

// ─── Configuration ───────────────────────────────────────────────────────────

export function getConfiguredProvider(): EmbeddingProvider {
  const envProvider = process.env.CODEBAXING_EMBEDDING_PROVIDER?.toLowerCase();
  if (envProvider && VALID_PROVIDERS.includes(envProvider as EmbeddingProvider)) {
    return envProvider as EmbeddingProvider;
  }
  return 'local';
}

// ─── Factory ─────────────────────────────────────────────────────────────────

export interface CreateEmbeddingServiceOptions {
  modelName?: string;
  showProgress?: boolean;
  device?: DeviceType;
  dtype?: DType;
  disableCachePurge?: boolean;
}

export function createEmbeddingService(
  options: CreateEmbeddingServiceOptions = {}
): IEmbeddingService {
  const provider = getConfiguredProvider();

  if (provider === 'local') {
    return new EmbeddingService(options.modelName ?? DEFAULT_MODEL, {
      showProgress: options.showProgress,
      device: options.device,
      dtype: options.dtype,
      disableCachePurge: options.disableCachePurge,
    });
  }

  // Cloud providers
  const apiKey = provider === 'ollama' ? '' : getApiKey(provider);
  const model = process.env.CODEBAXING_EMBEDDING_MODEL;
  const dimensionsEnv = process.env.CODEBAXING_EMBEDDING_DIMENSIONS;
  const dimensions = dimensionsEnv ? parseInt(dimensionsEnv, 10) : undefined;
  const baseUrl = process.env.CODEBAXING_EMBEDDING_BASE_URL;

  return new CloudEmbeddingService({
    provider: provider as CloudProvider,
    apiKey,
    model,
    dimensions,
    baseUrl,
  });
}

function getApiKey(provider: EmbeddingProvider): string {
  let apiKey: string | undefined;

  if (provider === 'openai') {
    apiKey = process.env.CODEBAXING_OPENAI_API_KEY ?? process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new EmbeddingError(
        'OpenAI API key required. Set CODEBAXING_OPENAI_API_KEY or OPENAI_API_KEY environment variable.'
      );
    }
  } else if (provider === 'voyage') {
    apiKey = process.env.CODEBAXING_VOYAGE_API_KEY ?? process.env.VOYAGE_API_KEY;
    if (!apiKey) {
      throw new EmbeddingError(
        'Voyage API key required. Set CODEBAXING_VOYAGE_API_KEY or VOYAGE_API_KEY environment variable.'
      );
    }
  } else if (provider === 'gemini') {
    apiKey = process.env.CODEBAXING_GEMINI_API_KEY ?? process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new EmbeddingError(
        'Gemini API key required. Set CODEBAXING_GEMINI_API_KEY or GEMINI_API_KEY environment variable.'
      );
    }
  } else {
    throw new EmbeddingError(`Unknown cloud provider: ${provider}`);
  }

  return apiKey;
}
