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
  '.git', 'node_modules', '__pycache__', '.codebaxing', 'venv', '.venv',
  '.tox', '.mypy_cache', '.pytest_cache', 'dist', 'build', '.eggs',
  '.next', '.turbo', '.vercel', '.expo',
  'coverage', '.nyc_output',
  '.cache', '.parcel-cache',
  'out', '.output',
  'generated', '.generated',
  '.contentlayer',
  'vendor',
]);

// ─── File Discovery ──────────────────────────────────────────────────────────

export function discoverFiles(codebasePath: string, extensions?: Set<string>): string[] {
  const exts = extensions ?? SUPPORTED_EXTENSIONS_SET;
  const files: string[] = [];

  function walk(dir: string) {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (entry.isDirectory()) {
        if (!SKIP_DIRS.has(entry.name)) {
          walk(path.join(dir, entry.name));
        }
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name);
        if (exts.has(ext)) {
          files.push(path.join(dir, entry.name));
        }
      }
    }
  }

  walk(codebasePath);
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

    // Initialize ChromaDB
    // Note: ChromaDB Node.js client connects to a server.
    // Set CHROMADB_URL env var to connect to a running ChromaDB server.
    // Without it, uses ephemeral in-memory mode (data lost on restart).
    if (this.persistPath) {
      fs.mkdirSync(this.persistPath, { recursive: true });
    }
    const chromaUrl = process.env.CHROMADB_URL;
    this.chromaClient = chromaUrl
      ? new ChromaClient({ path: chromaUrl })
      : new ChromaClient();
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
      this.log('INDEXING CODEBASE');
      this.log('='.repeat(80));
    }

    const startTime = performance.now();

    // Step 1: Find all files
    const extensionsSet = new Set(fileExtensions);
    const allFiles = discoverFiles(this.codebasePath, extensionsSet);
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
    if (!options.progressCallback) this.log(`Found ${allFiles.length} files`);

    // Step 2: Parse all files
    emit('parsing_start', { total: allFiles.length });
    const { symbols: allSymbols, errorCount } = parallelParseFiles(allFiles, {
      progressCallback: options.progressCallback,
    });
    this.stats.parseErrors = errorCount;
    this.stats.totalSymbols = allSymbols.length;

    if (!options.progressCallback) {
      this.log(`Parsed ${allSymbols.length.toLocaleString()} symbols from ${allFiles.length} files`);
    }

    // Step 3: Create chunks
    const chunks = allSymbols.map(s => this.createChunk(s));
    this.stats.totalChunks = chunks.length;
    emit('chunks_created', { total: chunks.length });

    // Step 4: Create ChromaDB collection
    try {
      await this.chromaClient.deleteCollection({ name: this.collectionName });
    } catch { /* collection doesn't exist */ }

    this.collection = await this.chromaClient.createCollection({
      name: this.collectionName,
      metadata: { description: `Code embeddings for ${path.basename(this.codebasePath)}` },
    });

    // Step 5: Generate embeddings and store
    emit('embedding_start', { total: chunks.length, etaMinutes: chunks.length / 50 / 60 });
    if (!options.progressCallback) {
      this.log(`\nGenerating embeddings for ${chunks.length} chunks...`);
    }

    const batchSize = 100;
    for (let i = 0; i < chunks.length; i += batchSize) {
      const batch = chunks.slice(i, i + batchSize);

      emit('embedding_progress', {
        current: Math.min(i + batchSize, chunks.length),
        total: chunks.length,
      });

      try {
        const texts = batch.map(c => c.text);
        const embeddings = await this.embeddingService.embedBatch(texts);

        await this.collection.add({
          ids: batch.map(c => c.id),
          embeddings,
          documents: texts,
          metadatas: batch.map(c => c.metadata),
        });
      } catch (e) {
        if (!options.progressCallback) {
          this.log(`Error embedding batch ${i}: ${(e as Error).message}`);
        }
      }
    }

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
