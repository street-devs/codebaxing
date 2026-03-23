/**
 * Source retriever for semantic code search.
 *
 * Handles indexing, storage, and retrieval of code chunks using
 * embeddings + ChromaDB for RAG applications.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ChromaClient, type Collection } from 'chromadb';
import { TreeSitterParser } from '../parsers/treesitter-parser.js';
import { getLanguageForFile, getSupportedExtensions } from '../parsers/language-configs.js';
import { EmbeddingService, getEmbeddingService } from './embedding-service.js';
import { parallelParseFiles, type ProgressCallback } from './parallel-indexer.js';
import type { Symbol } from '../core/models.js';

// ─── Constants ───────────────────────────────────────────────────────────────

export const SUPPORTED_EXTENSIONS = [...getSupportedExtensions()];
const SUPPORTED_EXTENSIONS_SET = new Set(SUPPORTED_EXTENSIONS);

const SKIP_DIRS = new Set([
  // Version control
  '.git', '.svn', '.hg',
  // Dependencies
  'node_modules', 'vendor', 'bower_components', 'jspm_packages',
  'packages', '.pnpm', '.yarn',
  // Python
  '__pycache__', 'venv', '.venv', '.tox', '.mypy_cache', '.pytest_cache',
  '.eggs', 'egg-info', '.python-version',
  // Build outputs
  'dist', 'build', 'out', '.output', 'target', 'bin', 'obj',
  // Framework specific
  '.next', '.nuxt', '.turbo', '.vercel', '.expo', '.svelte-kit',
  '.angular', '.nx',
  // Generated
  'generated', '.generated', '.contentlayer', 'auto-generated',
  // Cache
  '.cache', '.parcel-cache', '.webpack', '.eslintcache',
  // Coverage
  'coverage', '.nyc_output', 'htmlcov',
  // IDE
  '.idea', '.vscode', '.vs',
  // Misc
  '.codebaxing', 'tmp', 'temp', 'logs',
  // Test fixtures (often have many small files)
  'fixtures', '__fixtures__', '__mocks__', '__snapshots__',
]);

// Files to skip (patterns)
const SKIP_FILE_PATTERNS = [
  /\.min\.(js|css)$/,      // Minified files
  /\.bundle\.(js|ts)$/,    // Bundled files
  /\.generated\./,         // Generated files
  /\.d\.ts$/,              // TypeScript declaration files
  /\.map$/,                // Source maps
  /lock\.(json|yaml)$/,    // Lock files
  /package-lock\.json$/,
  /yarn\.lock$/,
  /pnpm-lock\.yaml$/,
];

// Default max file size: 1MB (configurable via CODEBAXING_MAX_FILE_SIZE env var in MB)
function getMaxFileSize(): number {
  const envSize = process.env.CODEBAXING_MAX_FILE_SIZE;
  if (envSize) {
    const sizeMB = parseFloat(envSize);
    if (!isNaN(sizeMB) && sizeMB > 0) {
      return sizeMB * 1024 * 1024;
    }
  }
  return 1 * 1024 * 1024; // Default 1MB
}

// Max chunks to index (configurable via CODEBAXING_MAX_CHUNKS env var)
// Default: 100000 chunks (~2 hours on CPU)
function getMaxChunks(): number {
  const envMax = process.env.CODEBAXING_MAX_CHUNKS;
  if (envMax) {
    const max = parseInt(envMax, 10);
    if (!isNaN(max) && max > 0) {
      return max;
    }
  }
  return 100000; // Default 100k chunks
}

// Batch sizes for memory-efficient streaming (configurable via env vars)
// FILES_PER_BATCH: How many files to parse before embedding+storing
// EMBED_BATCH_SIZE: How many texts to embed at once (lower = less RAM)
function getFilesPerBatch(): number {
  const envVal = process.env.CODEBAXING_FILES_PER_BATCH;
  if (envVal) {
    const val = parseInt(envVal, 10);
    if (!isNaN(val) && val > 0) return val;
  }
  return 50; // Default 50 files per batch
}

function getEmbedBatchSize(): number {
  const envVal = process.env.CODEBAXING_EMBED_BATCH_SIZE;
  if (envVal) {
    const val = parseInt(envVal, 10);
    if (!isNaN(val) && val > 0) return val;
  }
  return 32; // Default 32 texts per embed batch
}

// Parallel batches: how many batches to process concurrently
// Higher = faster but more memory. Default 3 for balance.
function getParallelBatches(): number {
  const envVal = process.env.CODEBAXING_PARALLEL_BATCHES;
  if (envVal) {
    const val = parseInt(envVal, 10);
    if (!isNaN(val) && val > 0 && val <= 10) return val;
  }
  return 3; // Default 3 concurrent batches
}

// ─── File Discovery ──────────────────────────────────────────────────────────

export interface DiscoverFilesOptions {
  extensions?: Set<string>;
  maxFileSize?: number; // in bytes, default 5MB
}

export function discoverFiles(
  codebasePath: string,
  optionsOrExtensions?: Set<string> | DiscoverFilesOptions,
  showProgress: boolean = false
): string[] {
  // Handle both old signature (Set<string>) and new signature (options object)
  let exts: Set<string>;
  let maxFileSize: number;

  if (optionsOrExtensions instanceof Set) {
    exts = optionsOrExtensions;
    maxFileSize = getMaxFileSize();
  } else {
    exts = optionsOrExtensions?.extensions ?? SUPPORTED_EXTENSIONS_SET;
    maxFileSize = optionsOrExtensions?.maxFileSize ?? getMaxFileSize();
  }

  const files: string[] = [];
  const skippedFiles: { path: string; size: number }[] = [];
  let dirsScanned = 0;

  function walk(dir: string) {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }

    dirsScanned++;
    if (showProgress && dirsScanned % 100 === 0) {
      process.stdout.write(`\rScanning directories... ${dirsScanned} dirs, ${files.length} files found`);
    }

    for (const entry of entries) {
      if (entry.isDirectory()) {
        if (!SKIP_DIRS.has(entry.name)) {
          walk(path.join(dir, entry.name));
        }
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name);
        if (exts.has(ext)) {
          // Skip files matching skip patterns
          const shouldSkip = SKIP_FILE_PATTERNS.some(pattern => pattern.test(entry.name));
          if (shouldSkip) continue;

          const filePath = path.join(dir, entry.name);
          try {
            const stat = fs.statSync(filePath);
            if (stat.size <= maxFileSize) {
              files.push(filePath);
            } else {
              skippedFiles.push({ path: filePath, size: stat.size });
            }
          } catch {
            // Skip files we can't stat
          }
        }
      }
    }
  }

  walk(codebasePath);

  if (showProgress) {
    process.stdout.write('\r' + ' '.repeat(80) + '\r'); // Clear progress line
  }

  if (skippedFiles.length > 0) {
    const maxSizeMB = (maxFileSize / 1024 / 1024).toFixed(1);
    console.log(`\nSkipped ${skippedFiles.length} file(s) larger than ${maxSizeMB}MB:`);
    // Only show first 10 skipped files to avoid spam
    const showFiles = skippedFiles.slice(0, 10);
    for (const file of showFiles) {
      const relativePath = path.relative(codebasePath, file.path);
      const sizeMB = (file.size / 1024 / 1024).toFixed(2);
      console.log(`  - ${relativePath} (${sizeMB}MB)`);
    }
    if (skippedFiles.length > 10) {
      console.log(`  ... and ${skippedFiles.length - 10} more`);
    }
    console.log(`\nTip: Set CODEBAXING_MAX_FILE_SIZE=<MB> to change the limit.`);
    console.log(`     Example: CODEBAXING_MAX_FILE_SIZE=5 npx codebaxing index /path\n`);
  }

  return files;
}

// ─── CodeChunk ───────────────────────────────────────────────────────────────

export interface CodeChunk {
  id: string;
  text: string;
  filepath: string;
  symbolName: string;
  symbolType: string;
  lineStart: number;
  metadata: Record<string, string>;
}

// ─── SourceRetriever ─────────────────────────────────────────────────────────

export class SourceRetriever {
  codebasePath: string;
  embeddingModel: string;
  collectionName: string;
  verbose: boolean;
  persistPath: string | undefined;

  private parser: TreeSitterParser;
  private embeddingService: EmbeddingService;
  private chromaClient: ChromaClient;
  private collection: Collection | null = null;

  stats: Record<string, number> = {
    totalFiles: 0,
    totalSymbols: 0,
    totalChunks: 0,
    parseErrors: 0,
    indexingTime: 0,
  };

  private metadata: Record<string, unknown> = {};

  constructor(options: {
    codebasePath: string;
    embeddingModel?: string;
    collectionName?: string;
    verbose?: boolean;
    persistPath?: string;
    parser?: TreeSitterParser;
    embeddingService?: EmbeddingService;
  }) {
    this.codebasePath = options.codebasePath;
    this.embeddingModel = options.embeddingModel ?? 'all-MiniLM-L6-v2';
    this.collectionName = options.collectionName ?? 'codebase';
    this.verbose = options.verbose ?? true;
    this.persistPath = options.persistPath;

    this.parser = options.parser ?? new TreeSitterParser();
    this.embeddingService = options.embeddingService ?? getEmbeddingService(
      this.embeddingModel,
      { showProgress: this.verbose }
    );

    // Initialize ChromaDB - defaults to localhost:8000
    // ChromaDB server must be running for persistent storage.
    const chromaUrl = process.env.CHROMADB_URL || 'http://localhost:8000';
    if (this.persistPath) {
      fs.mkdirSync(this.persistPath, { recursive: true });
    }
    this.chromaClient = new ChromaClient({ path: chromaUrl });
  }

  private log(message: string) {
    if (this.verbose) console.log(message);
  }

  private createChunkText(symbol: Symbol): string {
    const parts: string[] = [
      `# ${symbol.filepath}:${symbol.lineStart}`,
      `${symbol.type}: ${symbol.name}`,
      '',
    ];

    if (symbol.signature) {
      parts.push(symbol.signature, '');
    }
    if (symbol.docstring) {
      parts.push(symbol.docstring, '');
    }
    if (symbol.codeSnippet) {
      parts.push(symbol.codeSnippet, '');
    }
    if (symbol.imports.length > 0) {
      const importsStr = symbol.imports.slice(0, 10).join(', ');
      parts.push(`Imports: ${importsStr}`);
    }
    if (symbol.calls.length > 0) {
      const callsStr = symbol.calls.slice(0, 10).join(', ');
      parts.push(`Calls: ${callsStr}`);
    }

    return parts.join('\n');
  }

  private createChunk(symbol: Symbol): CodeChunk {
    const chunkId = `${symbol.filepath}:${symbol.name}:${symbol.lineStart}`;
    const language = getLanguageForFile(symbol.filepath) ?? 'unknown';

    return {
      id: chunkId,
      text: this.createChunkText(symbol),
      filepath: symbol.filepath,
      symbolName: symbol.name,
      symbolType: symbol.type,
      lineStart: symbol.lineStart,
      metadata: {
        filepath: symbol.filepath,
        name: symbol.name,
        type: symbol.type,
        line: String(symbol.lineStart),
        signature: symbol.signature,
        parent: symbol.parent ?? '',
        language,
      },
    };
  }

  async indexCodebase(options: {
    fileExtensions?: string[];
    progressCallback?: ProgressCallback;
  } = {}): Promise<void> {
    const fileExtensions = options.fileExtensions ?? SUPPORTED_EXTENSIONS;
    const emit = options.progressCallback ?? (() => {});

    if (!options.progressCallback) {
      this.log('\n' + '='.repeat(80));
      this.log('STREAMING INDEX (memory-efficient)');
      this.log('='.repeat(80));
    }

    const startTime = performance.now();
    const filesPerBatch = getFilesPerBatch();
    const embedBatchSize = getEmbedBatchSize();

    if (this.verbose) {
      this.log(`  File batch: ${filesPerBatch}  |  Embed batch: ${embedBatchSize}`);
    }

    // Step 1: Find all files
    const extensionsSet = new Set(fileExtensions);
    const allFiles = discoverFiles(this.codebasePath, extensionsSet, this.verbose);
    this.stats.totalFiles = allFiles.length;

    // Store file modification times
    const fileMtimes: Record<string, number> = {};
    for (const filepath of allFiles) {
      try {
        fileMtimes[filepath] = fs.statSync(filepath).mtimeMs;
      } catch { /* skip */ }
    }
    this.metadata.fileMtimes = fileMtimes;

    emit('files_found', { files: allFiles, codebasePath: this.codebasePath });
    if (!options.progressCallback) this.log(`Found ${allFiles.length.toLocaleString()} files`);

    // Warn for large codebases
    if (this.verbose && allFiles.length > 1000) {
      const estimatedMinutes = Math.ceil(allFiles.length / 300);
      console.log(`\n⚠️  Large codebase (${allFiles.length.toLocaleString()} files)`);
      console.log(`   Estimated time: ${estimatedMinutes}-${estimatedMinutes * 2} minutes`);
      console.log(`   Tip: Set CODEBAXING_FILES_PER_BATCH=30 for less RAM usage\n`);
    }

    // Step 2: Create ChromaDB collection FIRST (before loading data)
    try {
      await this.chromaClient.deleteCollection({ name: this.collectionName });
    } catch { /* collection doesn't exist */ }

    this.collection = await this.chromaClient.createCollection({
      name: this.collectionName,
      metadata: { description: `Code embeddings for ${path.basename(this.codebasePath)}` },
    });

    // Step 3: Process files in parallel batches
    // Multiple batches run concurrently: Parse → Embed → Store
    const numBatches = Math.ceil(allFiles.length / filesPerBatch);
    const maxChunks = getMaxChunks();
    const minCodeLength = 30;
    const parallelBatches = getParallelBatches();

    // Shared state (updated atomically after each batch completes)
    const seenIds = new Map<string, number>();
    let totalSymbols = 0;
    let totalChunks = 0;
    let parseErrors = 0;
    let batchesCompleted = 0;
    let reachedMaxChunks = false;
    const batchStartTime = performance.now();

    if (this.verbose) {
      console.log(`  Parallel batches: ${parallelBatches}`);
    }

    // Process a single batch - returns results to be merged
    const processBatch = async (batchIdx: number): Promise<{
      chunks: CodeChunk[];
      embeddings: number[][];
      symbols: number;
      errors: number;
      fileCount: number;
    } | null> => {
      if (reachedMaxChunks) return null;

      const batchStart = batchIdx * filesPerBatch;
      const batchEnd = Math.min(batchStart + filesPerBatch, allFiles.length);
      const batchFiles = allFiles.slice(batchStart, batchEnd);

      // Parse this batch
      const batchChunks: CodeChunk[] = [];
      let batchSymbols = 0;
      let batchErrors = 0;

      for (const filepath of batchFiles) {
        try {
          const parsed = this.parser.parseFile(filepath);
          for (const symbol of parsed.symbols) {
            batchSymbols++;
            if (!symbol.codeSnippet || symbol.codeSnippet.length < minCodeLength) continue;
            if (symbol.type === 'variable' && symbol.lineEnd - symbol.lineStart < 2) continue;
            batchChunks.push(this.createChunk(symbol));
          }
        } catch {
          batchErrors++;
        }
      }

      if (batchChunks.length === 0) {
        return { chunks: [], embeddings: [], symbols: batchSymbols, errors: batchErrors, fileCount: batchFiles.length };
      }

      // Embed in sub-batches
      const allEmbeddings: number[][] = [];
      for (let i = 0; i < batchChunks.length; i += embedBatchSize) {
        const subBatch = batchChunks.slice(i, i + embedBatchSize);
        const texts = subBatch.map(c => c.text);
        try {
          const embeddings = await this.embeddingService.embedBatch(texts);
          allEmbeddings.push(...embeddings);
        } catch {
          for (let j = 0; j < subBatch.length; j++) {
            allEmbeddings.push(new Array(384).fill(0));
          }
        }
      }

      return { chunks: batchChunks, embeddings: allEmbeddings, symbols: batchSymbols, errors: batchErrors, fileCount: batchFiles.length };
    };

    // Store batch results to ChromaDB (must be sequential to avoid race conditions)
    const storeBatchResults = async (result: NonNullable<Awaited<ReturnType<typeof processBatch>>>, batchIdx: number) => {
      if (result.chunks.length === 0) {
        totalSymbols += result.symbols;
        parseErrors += result.errors;
        batchesCompleted++;
        return;
      }

      // Deduplicate IDs (must be done sequentially)
      for (const chunk of result.chunks) {
        const existingCount = seenIds.get(chunk.id);
        if (existingCount !== undefined) {
          seenIds.set(chunk.id, existingCount + 1);
          chunk.id = `${chunk.id}#${existingCount + 1}`;
        } else {
          seenIds.set(chunk.id, 0);
        }
      }

      // Check max chunks limit
      let chunksToStore = result.chunks;
      let embeddingsToStore = result.embeddings;
      if (totalChunks + chunksToStore.length > maxChunks) {
        const remaining = maxChunks - totalChunks;
        if (remaining <= 0) {
          reachedMaxChunks = true;
          if (this.verbose) {
            console.log(`\n⚠️  Max chunks limit reached (${maxChunks.toLocaleString()}). Stopping indexing.`);
          }
          return;
        }
        // Take only what we can fit
        chunksToStore.sort((a, b) => b.text.length - a.text.length);
        chunksToStore = chunksToStore.slice(0, remaining);
        embeddingsToStore = embeddingsToStore.slice(0, remaining);
      }

      // Store in ChromaDB
      const chromaBatchSize = 5000;
      for (let i = 0; i < chunksToStore.length; i += chromaBatchSize) {
        const end = Math.min(i + chromaBatchSize, chunksToStore.length);
        const subChunks = chunksToStore.slice(i, end);
        const subEmbeddings = embeddingsToStore.slice(i, end);

        await this.collection!.add({
          ids: subChunks.map(c => c.id),
          embeddings: subEmbeddings,
          documents: subChunks.map(c => c.text),
          metadatas: subChunks.map(c => c.metadata),
        });
      }

      totalSymbols += result.symbols;
      parseErrors += result.errors;
      totalChunks += chunksToStore.length;
      batchesCompleted++;

      if (this.verbose) {
        const elapsed = (performance.now() - batchStartTime) / 1000;
        const rate = batchesCompleted / elapsed || 1;
        const remainingBatches = numBatches - batchesCompleted;
        const etaSecs = remainingBatches / rate;
        const eta = etaSecs > 60 ? `${(etaSecs / 60).toFixed(1)}m` : `${Math.round(etaSecs)}s`;
        const pct = ((batchesCompleted / numBatches) * 100).toFixed(1);
        console.log(`✓ Batch ${batchesCompleted}/${numBatches} (${pct}%) | +${chunksToStore.length} chunks | Total: ${totalChunks.toLocaleString()} | ETA: ${eta}`);
      }

      emit('embedding_progress', { current: totalChunks, total: allFiles.length * 5 });
    };

    // Process batches with concurrency limit using a sliding window
    const pendingResults: Map<number, Promise<Awaited<ReturnType<typeof processBatch>>>> = new Map();
    let nextBatchToProcess = 0;
    let nextBatchToStore = 0;

    while (nextBatchToStore < numBatches && !reachedMaxChunks) {
      // Start new batches up to the concurrency limit
      while (pendingResults.size < parallelBatches && nextBatchToProcess < numBatches && !reachedMaxChunks) {
        const batchIdx = nextBatchToProcess++;
        pendingResults.set(batchIdx, processBatch(batchIdx));
      }

      // Wait for the next batch in order to complete and store it
      if (pendingResults.has(nextBatchToStore)) {
        const result = await pendingResults.get(nextBatchToStore)!;
        pendingResults.delete(nextBatchToStore);
        if (result) {
          await storeBatchResults(result, nextBatchToStore);
        }
        nextBatchToStore++;
      } else {
        // No more batches to process
        break;
      }
    }

    // Wait for any remaining batches
    for (const [batchIdx, promise] of pendingResults) {
      const result = await promise;
      if (result && !reachedMaxChunks) {
        await storeBatchResults(result, batchIdx);
      }
    }

    this.stats.totalSymbols = totalSymbols;
    this.stats.totalChunks = totalChunks;
    this.stats.parseErrors = parseErrors;
    this.stats.indexingTime = (performance.now() - startTime) / 1000;
    emit('complete', { stats: { ...this.stats } });

    if (!options.progressCallback) {
      this.log('\n' + '='.repeat(80));
      this.log('INDEXING COMPLETE');
      this.log('='.repeat(80));
      this.log(`Files parsed:      ${this.stats.totalFiles.toLocaleString()}`);
      this.log(`Symbols extracted: ${this.stats.totalSymbols.toLocaleString()}`);
      this.log(`Chunks created:    ${this.stats.totalChunks.toLocaleString()}`);
      this.log(`Parse errors:      ${this.stats.parseErrors}`);
      this.log(`Time elapsed:      ${this.stats.indexingTime.toFixed(1)}s`);
    }
  }

  async getSourcesForQuestion(
    question: string,
    options: {
      nResults?: number;
      language?: string;
      symbolType?: string;
    } = {}
  ): Promise<{ documents: Record<string, unknown>[]; sources: string[] }> {
    if (!this.collection) return { documents: [], sources: [] };

    const nResults = options.nResults ?? 10;
    const queryEmbedding = await this.embeddingService.embed(question, true);

    // Build metadata filter
    let whereFilter: Record<string, string> | undefined;
    if (options.language || options.symbolType) {
      whereFilter = {};
      if (options.language) whereFilter.language = options.language;
      if (options.symbolType) whereFilter.type = options.symbolType;
    }

    const results = await this.collection.query({
      queryEmbeddings: [queryEmbedding],
      nResults,
      where: whereFilter,
    });

    const documents = results.documents?.[0] ?? [];
    const metadatas = results.metadatas?.[0] ?? [];

    const sources: string[] = [];
    const docResults: Record<string, unknown>[] = [];

    for (let i = 0; i < documents.length; i++) {
      const metadata = metadatas[i] as Record<string, string>;
      let filepath = metadata.filepath;
      try {
        filepath = path.relative(this.codebasePath, filepath);
      } catch { /* keep absolute */ }
      sources.push(`${filepath}:${metadata.line} - ${metadata.name}()`);

      docResults.push({
        text: documents[i],
        metadata,
      });
    }

    return { documents: docResults, sources };
  }

  getStats(): Record<string, number> {
    return { ...this.stats };
  }

  async loadExistingIndex(): Promise<boolean> {
    if (!this.persistPath) {
      this.log('No persistent storage configured');
      return false;
    }

    try {
      this.collection = await this.chromaClient.getCollection({
        name: this.collectionName,
        embeddingFunction: { generate: async (texts: string[]) => texts.map(() => []) } as any,
      });
      const count = await this.collection.count();
      this.log(`Loaded existing index with ${count.toLocaleString()} chunks`);
      return true;
    } catch (e) {
      this.log(`No existing index found: ${(e as Error).message}`);
      return false;
    }
  }

  saveMetadata(metadataPath: string): void {
    const metadata = {
      codebasePath: this.codebasePath,
      embeddingModel: this.embeddingModel,
      collectionName: this.collectionName,
      indexedAt: new Date().toISOString(),
      stats: this.stats,
      fileMtimes: (this.metadata.fileMtimes as Record<string, number>) ?? {},
    };
    fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2));
    this.log(`Metadata saved to ${metadataPath}`);
  }

  loadMetadata(metadataPath: string): Record<string, unknown> | undefined {
    try {
      const data = JSON.parse(fs.readFileSync(metadataPath, 'utf-8'));
      if (data.stats) this.stats = data.stats;
      if (data.fileMtimes) this.metadata.fileMtimes = data.fileMtimes;
      return data;
    } catch {
      return undefined;
    }
  }

  async incrementalReindex(options: {
    fileExtensions?: string[];
    progressCallback?: ProgressCallback;
  } = {}): Promise<Record<string, unknown>> {
    const startTime = performance.now();
    const emit = options.progressCallback ?? (() => {});
    const extensions = options.fileExtensions ?? SUPPORTED_EXTENSIONS;

    // Get stored file mtimes
    const storedMtimes = (this.metadata.fileMtimes as Record<string, number>) ?? {};

    // Scan current files
    const extensionsSet = new Set(extensions);
    const allCurrentPaths = discoverFiles(this.codebasePath, extensionsSet);
    const currentFiles: Record<string, number> = {};
    for (const filepath of allCurrentPaths) {
      try {
        currentFiles[filepath] = fs.statSync(filepath).mtimeMs;
      } catch { /* skip */ }
    }

    // Categorize changes
    const storedPaths = new Set(Object.keys(storedMtimes));
    const currentPaths = new Set(Object.keys(currentFiles));

    const newFiles = [...currentPaths].filter(p => !storedPaths.has(p));
    const deletedFiles = [...storedPaths].filter(p => !currentPaths.has(p));
    const modifiedFiles = [...currentPaths]
      .filter(p => storedPaths.has(p) && currentFiles[p] > (storedMtimes[p] ?? 0));

    const filesToReindex = new Set([...newFiles, ...modifiedFiles]);
    const filesToRemove = new Set([...deletedFiles, ...modifiedFiles]);

    emit('changes_detected', {
      new: newFiles.length,
      modified: modifiedFiles.length,
      deleted: deletedFiles.length,
    });

    let chunksRemoved = 0;
    let chunksAdded = 0;

    // Remove stale chunks
    if (filesToRemove.size > 0 && this.collection) {
      for (const filepath of filesToRemove) {
        try {
          await this.collection.delete({ where: { filepath } });
          chunksRemoved++;
        } catch { /* ignore */ }
      }
    }

    // Parse and index new/modified files
    if (filesToReindex.size > 0) {
      emit('parsing_start', { total: filesToReindex.size });

      const chunks: CodeChunk[] = [];
      for (const filepath of filesToReindex) {
        try {
          const parsed = this.parser.parseFile(filepath);
          for (const symbol of parsed.symbols) {
            chunks.push(this.createChunk(symbol));
          }
        } catch { /* skip */ }
      }

      if (chunks.length > 0 && this.collection) {
        emit('embedding_start', { total: chunks.length });

        const batchSize = 50;
        for (let i = 0; i < chunks.length; i += batchSize) {
          const batch = chunks.slice(i, i + batchSize);
          const texts = batch.map(c => c.text);
          const embeddings = await this.embeddingService.embedBatch(texts);

          if (embeddings.length > 0) {
            // Deduplicate IDs
            const seenIds = new Map<string, number>();
            batch.forEach((c, idx) => seenIds.set(c.id, idx));
            const uniqueIndices = [...seenIds.values()].sort((a, b) => a - b);
            const uniqueBatch = uniqueIndices.map(j => batch[j]);
            const uniqueEmb = uniqueIndices.map(j => embeddings[j]);

            if (uniqueBatch.length > 0) {
              await this.collection.add({
                ids: uniqueBatch.map(c => c.id),
                embeddings: uniqueEmb,
                documents: uniqueBatch.map(c => c.text),
                metadatas: uniqueBatch.map(c => c.metadata),
              });
            }
          }

          chunksAdded += batch.length;
        }
      }
    }

    // Update metadata
    this.metadata.fileMtimes = currentFiles;

    if (this.persistPath) {
      const metadataPath = path.join(path.dirname(this.persistPath), 'metadata.json');
      this.saveMetadata(metadataPath);
    }

    const elapsedTime = (performance.now() - startTime) / 1000;

    emit('complete', { chunksAdded });

    return {
      filesAdded: newFiles.length,
      filesModified: modifiedFiles.length,
      filesDeleted: deletedFiles.length,
      chunksAdded,
      chunksRemoved,
      timeSeconds: Math.round(elapsedTime * 100) / 100,
    };
  }
}
