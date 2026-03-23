/**
 * Session state management for MCP server.
 *
 * Handles singleton MCP state and auto-loading of existing indexes.
 */

import fs from 'node:fs';
import path from 'node:path';
import { SourceRetriever } from '../indexing/source-retriever.js';
import type { MemoryRetriever } from '../indexing/memory-retriever.js';

// Storage constants
const CODEBAXING_DIR = '.codebaxing';
const CHROMA_DIR = 'chroma';
const METADATA_FILE = 'metadata.json';
const CONFIG_FILE = 'config.json';

// ─── MCPSessionState ─────────────────────────────────────────────────────────

export class MCPSessionState {
  retriever: SourceRetriever | null = null;
  memoryRetriever: MemoryRetriever | null = null;
  codebasePath: string | null = null;

  get isLoaded(): boolean {
    return this.retriever !== null;
  }

  get hasMemories(): boolean {
    return this.memoryRetriever !== null;
  }
}

// ─── Singleton ───────────────────────────────────────────────────────────────

let _state: MCPSessionState | null = null;

export function getState(): MCPSessionState {
  if (!_state) {
    _state = new MCPSessionState();
  }
  return _state;
}

export function resetState(): void {
  _state = null;
}

// ─── Path helpers ────────────────────────────────────────────────────────────

export interface CodebaxingPaths {
  codebaxingDir: string;
  chromaPath: string;
  metadataPath: string;
  configPath: string;
}

export function getCodebaxingPaths(codebasePath: string): CodebaxingPaths {
  const codebaxingDir = path.join(codebasePath, CODEBAXING_DIR);
  return {
    codebaxingDir,
    chromaPath: path.join(codebaxingDir, CHROMA_DIR),
    metadataPath: path.join(codebaxingDir, METADATA_FILE),
    configPath: path.join(codebaxingDir, CONFIG_FILE),
  };
}

export interface CodebaxingConfig {
  basePath: string;
}

/**
 * Load config from `.codebaxing/config.json`.
 * Returns undefined if file doesn't exist or is invalid.
 */
export function loadConfig(configPath: string): CodebaxingConfig | undefined {
  try {
    return JSON.parse(fs.readFileSync(configPath, 'utf-8'));
  } catch {
    return undefined;
  }
}

/**
 * Save config to `.codebaxing/config.json`.
 */
export function saveConfig(configPath: string, config: CodebaxingConfig): void {
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n');
}

export function hasValidIndex(paths: CodebaxingPaths): boolean {
  return (
    fs.existsSync(paths.codebaxingDir) &&
    fs.existsSync(paths.metadataPath) &&
    fs.existsSync(paths.chromaPath)
  );
}

/**
 * Check if an existing index uses the old absolute-path format.
 * Old format: metadata.json exists but config.json does not.
 */
export function isLegacyIndex(paths: CodebaxingPaths): boolean {
  return (
    fs.existsSync(paths.metadataPath) &&
    !fs.existsSync(paths.configPath)
  );
}

const LEGACY_INDEX_WARNING =
  'Existing index uses legacy absolute-path format. ' +
  'Search results may be incorrect. ' +
  'Please re-index with mode=full to upgrade: index(path="...", mode="full")';

export { LEGACY_INDEX_WARNING };

// ─── Auto-loading ────────────────────────────────────────────────────────────

const bgIndexingRunning = new Map<string, boolean>();

export function isIndexing(codePath: string): boolean {
  return bgIndexingRunning.get(path.resolve(codePath)) ?? false;
}

export async function ensureLoaded(
  state: MCPSessionState,
  codePath?: string,
  embeddingModel: string = 'all-MiniLM-L6-v2',
  autoIndex: boolean = false // Don't auto-index by default
): Promise<boolean> {
  if (!codePath) return state.isLoaded;

  const codebasePath = path.resolve(codePath);
  const paths = getCodebaxingPaths(codebasePath);

  // Already loaded for this path
  if (state.isLoaded && state.codebasePath === codebasePath) {
    // Kick off background incremental reindex (fast, only updates changed files)
    backgroundIncrementalReindex(state, codebasePath, paths, embeddingModel);
    return true;
  }

  // Check if valid index exists on disk
  if (!hasValidIndex(paths)) {
    // No index exists - only auto-index if explicitly requested
    if (autoIndex) {
      backgroundFullIndex(state, codebasePath, paths, embeddingModel);
    }
    return false;
  }

  // Switching project — clear memory retriever
  if (state.isLoaded && state.codebasePath !== codebasePath) {
    state.memoryRetriever = null;
  }

  // Load existing index
  if (!await loadIndexIntoState(state, codebasePath, paths, embeddingModel)) {
    return false;
  }

  // Kick off background incremental reindex (fast)
  backgroundIncrementalReindex(state, codebasePath, paths, embeddingModel);
  return true;
}

async function loadIndexIntoState(
  state: MCPSessionState,
  codebasePath: string,
  paths: CodebaxingPaths,
  embeddingModel: string
): Promise<boolean> {
  try {
    const retriever = new SourceRetriever({
      codebasePath,
      embeddingModel,
      verbose: false,
      persistPath: paths.chromaPath,
    });

    if (!await retriever.loadExistingIndex()) {
      console.warn(`Failed to load index from ${paths.chromaPath}`);
      return false;
    }

    retriever.loadMetadata(paths.metadataPath);
    state.retriever = retriever;
    state.codebasePath = codebasePath;
    console.log(`Auto-loaded index for ${path.basename(codebasePath)}`);
    return true;
  } catch (e) {
    console.warn(`Error loading index for ${codebasePath}: ${(e as Error).message}`);
    return false;
  }
}

function backgroundIncrementalReindex(
  state: MCPSessionState,
  codebasePath: string,
  paths: CodebaxingPaths,
  embeddingModel: string
): void {
  if (bgIndexingRunning.get(codebasePath)) return;

  bgIndexingRunning.set(codebasePath, true);

  // Run in next tick to not block
  setImmediate(async () => {
    try {
      if (!state.retriever) return;
      const result = await state.retriever.incrementalReindex();
      console.log(
        `Background reindex done for ${path.basename(codebasePath)}: ` +
        `+${result.chunksAdded} chunks, -${result.chunksRemoved} removed`
      );
    } catch (e) {
      console.warn(`Background reindex failed: ${(e as Error).message}`);
    } finally {
      bgIndexingRunning.set(codebasePath, false);
    }
  });
}

function backgroundFullIndex(
  state: MCPSessionState,
  codebasePath: string,
  paths: CodebaxingPaths,
  embeddingModel: string
): void {
  if (bgIndexingRunning.get(codebasePath)) return;

  bgIndexingRunning.set(codebasePath, true);

  setImmediate(async () => {
    try {
      fs.mkdirSync(paths.codebaxingDir, { recursive: true });
      saveConfig(paths.configPath, { basePath: codebasePath });

      const retriever = new SourceRetriever({
        codebasePath,
        embeddingModel,
        verbose: false,
        persistPath: paths.chromaPath,
      });

      await retriever.indexCodebase();
      retriever.saveMetadata(paths.metadataPath);

      state.retriever = retriever;
      state.codebasePath = codebasePath;

      console.log(`Background full index done for ${path.basename(codebasePath)}`);
    } catch (e) {
      console.error(`Background full index failed: ${(e as Error).message}`);
    } finally {
      bgIndexingRunning.set(codebasePath, false);
    }
  });
}
