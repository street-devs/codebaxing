#!/usr/bin/env node
/**
 * MCP Server for Codebaxing — Semantic code search and source retrieval.
 *
 * Tools:
 *   - index: Index a codebase (smart mode: auto-detects existing index)
 *   - search: Semantic search for code
 *   - stats: Get indexing statistics
 *   - languages: List supported file extensions
 *   - remember: Store a memory
 *   - recall: Retrieve memories
 *   - forget: Remove memories
 *   - memory-stats: Get memory statistics
 */

import fs from 'node:fs';
import path from 'node:path';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { EXTENSION_MAP } from '../parsers/language-configs.js';
import { SourceRetriever, SUPPORTED_EXTENSIONS } from '../indexing/source-retriever.js';
import { MemoryRetriever } from '../indexing/memory-retriever.js';
import { MemoryType } from '../core/models.js';
import {
  getState,
  getCodebaxingPaths,
  hasValidIndex,
  findIndexedParent,
  ensureLoaded,
  isIndexing,
  isLegacyIndex,
  LEGACY_INDEX_WARNING,
  saveConfig,
} from './state.js';

// ─── Initialize MCP Server ──────────────────────────────────────────────────

const server = new McpServer(
  {
    name: 'Codebaxing',
    version: '0.1.0',
  },
  {
    instructions: `Codebaxing: Semantic code search + project memory.

START: Call 'index' with codebase path to enable all features.

CODE SEARCH (after index):
- search - Find relevant code using natural language queries
- stats - Check index status (files, symbols, chunks indexed)
- languages - See supported file extensions

PROJECT MEMORY (after index):
- remember - Store decisions, preferences, notes, status updates
- recall - Retrieve memories by semantic search
- forget - Remove outdated information (destructive)
- memory-stats - View memory statistics

TYPICAL WORKFLOW:
1. index(path="/project") - Index codebase (required first step)
2. recall("user preferences") - Check existing context
3. remember("Decision: Using Redis for caching", memory_type="decision")
4. search("authentication flow") - Find relevant code`,
  }
);

// ─── Index Tool ──────────────────────────────────────────────────────────────

server.tool(
  'index',
  `Index a codebase for semantic search. REQUIRED FIRST STEP.

Modes:
- auto (default): Smart detection. If index exists, updates incrementally.
- full: Force complete re-index.
- load-only: Just load existing index without any indexing.

Creates a .codebaxing/ folder in the codebase directory.`,
  {
    path: z.string().describe('Absolute path to the codebase directory to index'),
    mode: z.enum(['auto', 'full', 'load-only']).default('auto').describe('Indexing mode'),
    file_extensions: z.array(z.string()).optional().describe('File extensions to include'),
    embedding_model: z.string().default('all-MiniLM-L6-v2').describe('Embedding model'),
  },
  { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  async (args) => {
    const state = getState();
    let codebasePath = path.resolve(args.path);

    if (!fs.existsSync(codebasePath)) {
      return { content: [{ type: 'text' as const, text: JSON.stringify({ error: `Path does not exist: ${codebasePath}` }) }] };
    }
    if (!fs.statSync(codebasePath).isDirectory()) {
      return { content: [{ type: 'text' as const, text: JSON.stringify({ error: `Path is not a directory: ${codebasePath}` }) }] };
    }

    let paths = getCodebaxingPaths(codebasePath);
    let hasExisting = hasValidIndex(paths);

    // If no index at this path, check parent directories (up to 5 levels)
    if (!hasExisting && args.mode !== 'full') {
      const indexedParent = findIndexedParent(codebasePath);
      if (indexedParent) {
        codebasePath = indexedParent;
        paths = getCodebaxingPaths(codebasePath);
        hasExisting = true;
      }
    }

    let result: Record<string, unknown>;

    if (args.mode === 'load-only') {
      if (!hasExisting) {
        return { content: [{ type: 'text' as const, text: JSON.stringify({ error: 'No existing index found. Use mode=auto or mode=full.' }) }] };
      }
      result = await loadExistingIndex(codebasePath, paths, state, args.embedding_model);
    } else if (args.mode === 'auto' && hasExisting) {
      result = await incrementalReindex(codebasePath, paths, state, args.embedding_model);
    } else {
      result = await fullIndex(codebasePath, paths, state, args.file_extensions, args.embedding_model);
    }

    return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
  }
);

// ─── Search Tool ─────────────────────────────────────────────────────────────

server.tool(
  'search',
  `Semantic search for code. Returns ranked code chunks with file paths and line numbers.

Examples:
- search(question="authentication login flow")
- search(question="user model", language="python", symbol_type="class")`,
  {
    question: z.string().describe('Natural language search query'),
    n_results: z.number().min(1).max(50).default(10).describe('Number of results'),
    language: z.string().optional().describe('Filter by language'),
    symbol_type: z.string().optional().describe('Filter by symbol type'),
    path: z.string().optional().describe('Codebase path for auto-loading'),
  },
  { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  async (args) => {
    const state = getState();

    if (args.path) {
      // Don't auto-index, just try to load existing index
      await ensureLoaded(state, args.path, 'all-MiniLM-L6-v2', false);
    }

    if (!state.isLoaded) {
      if (args.path && isIndexing(args.path)) {
        return { content: [{ type: 'text' as const, text: JSON.stringify({
          documents: [], sources: [], indexing: true,
          message: 'Background indexing in progress. Results will be available on next call.',
        }) }] };
      }
      return { content: [{ type: 'text' as const, text: JSON.stringify({
        error: "No index found for this codebase.",
        hint: "Run index(path=\"/your/codebase\") first to index the codebase. This only needs to be done once.",
      }) }] };
    }

    try {
      const { documents, sources } = await state.retriever!.getSourcesForQuestion(
        args.question,
        { nResults: args.n_results, language: args.language, symbolType: args.symbol_type }
      );
      return { content: [{ type: 'text' as const, text: JSON.stringify({ documents, sources }) }] };
    } catch (e) {
      return { content: [{ type: 'text' as const, text: JSON.stringify({ error: `Search failed: ${(e as Error).message}` }) }] };
    }
  }
);

// ─── Stats Tool ──────────────────────────────────────────────────────────────

server.tool(
  'stats',
  'Get statistics about the currently loaded codebase index.',
  {
    path: z.string().optional().describe('Codebase path for auto-loading'),
  },
  { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  async (args) => {
    const state = getState();
    if (!state.isLoaded && args.path) await ensureLoaded(state, args.path);

    if (!state.isLoaded) {
      return { content: [{ type: 'text' as const, text: JSON.stringify({ loaded: false }) }] };
    }

    return { content: [{ type: 'text' as const, text: JSON.stringify({
      loaded: true,
      codebasePath: state.codebasePath,
      stats: state.retriever!.getStats(),
    }) }] };
  }
);

// ─── Languages Tool ──────────────────────────────────────────────────────────

server.tool(
  'languages',
  'List all supported programming languages and file extensions.',
  {},
  { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  async () => {
    const langMap: Record<string, string[]> = {};
    for (const [ext, lang] of Object.entries(EXTENSION_MAP)) {
      if (!langMap[lang]) langMap[lang] = [];
      langMap[lang].push(ext);
    }
    for (const lang of Object.keys(langMap)) {
      langMap[lang].sort();
    }

    return { content: [{ type: 'text' as const, text: JSON.stringify({
      extensions: Object.keys(EXTENSION_MAP).sort(),
      languages: langMap,
    }) }] };
  }
);

// ─── Clean Tool ──────────────────────────────────────────────────────────────

server.tool(
  'clean',
  `Clean all indexed data for a codebase. Deletes ChromaDB collection and .codebaxing/ data.
Preserves user config (ignore.json). Use this to fix corrupted indexes or start fresh.`,
  {
    path: z.string().describe('Absolute path to the codebase directory to clean'),
  },
  { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
  async (args) => {
    const codebasePath = path.resolve(args.path);
    const paths = getCodebaxingPaths(codebasePath);
    const state = getState();
    const cleaned: string[] = [];

    // 1. Delete ChromaDB collection
    try {
      const { ChromaClient } = await import('chromadb');
      const chromaUrl = process.env.CHROMADB_URL || 'http://localhost:8000';
      const client = new ChromaClient({ path: chromaUrl });
      await client.deleteCollection({ name: 'codebase' });
      cleaned.push('ChromaDB collection deleted');
    } catch {
      cleaned.push('ChromaDB collection not found (already clean)');
    }

    // 2. Delete .codebaxing/ directory but preserve ignore.json
    if (fs.existsSync(paths.codebaxingDir)) {
      const ignoreConfigPath = path.join(paths.codebaxingDir, 'ignore.json');
      let preservedIgnoreConfig: string | undefined;
      try {
        preservedIgnoreConfig = fs.readFileSync(ignoreConfigPath, 'utf-8');
        JSON.parse(preservedIgnoreConfig); // validate
      } catch {
        preservedIgnoreConfig = undefined;
      }

      fs.rmSync(paths.codebaxingDir, { recursive: true, force: true });

      if (preservedIgnoreConfig) {
        fs.mkdirSync(paths.codebaxingDir, { recursive: true });
        fs.writeFileSync(ignoreConfigPath, preservedIgnoreConfig);
        cleaned.push('.codebaxing/ cleaned (ignore.json preserved)');
      } else {
        cleaned.push('.codebaxing/ deleted');
      }
    } else {
      cleaned.push('.codebaxing/ not found (already clean)');
    }

    // 3. Reset MCP state if this was the loaded codebase
    if (state.codebasePath === codebasePath) {
      state.retriever = null;
      state.memoryRetriever = null;
      state.codebasePath = null;
      cleaned.push('MCP state reset');
    }

    return { content: [{ type: 'text' as const, text: JSON.stringify({
      success: true,
      codebasePath,
      actions: cleaned,
    }, null, 2) }] };
  }
);

// ─── Remember Tool ───────────────────────────────────────────────────────────

server.tool(
  'remember',
  `Store a memory for later retrieval.

Memory types: conversation, status, decision, preference, doc, note
TTL options: session (24h), day, week, month, permanent (default)`,
  {
    content: z.string().describe('The memory content to store'),
    memory_type: z.enum(['conversation', 'status', 'decision', 'preference', 'doc', 'note']).describe('Memory type'),
    tags: z.array(z.string()).optional().describe('Optional tags'),
    ttl: z.enum(['session', 'day', 'week', 'month', 'permanent']).default('permanent').describe('Time-to-live'),
    path: z.string().optional().describe('Codebase path for auto-loading'),
  },
  { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  async (args) => {
    const state = getState();
    if (!state.codebasePath && args.path) await ensureLoaded(state, args.path);
    if (!state.codebasePath) {
      return { content: [{ type: 'text' as const, text: JSON.stringify({ error: "No codebase loaded. Use 'index' first." }) }] };
    }

    if (!state.memoryRetriever) {
      const paths = getCodebaxingPaths(state.codebasePath);
      state.memoryRetriever = new MemoryRetriever({
        projectPath: state.codebasePath,
        persistPath: paths.chromaPath,
        verbose: false,
      });
    }

    const memory = await state.memoryRetriever.remember({
      content: args.content,
      memoryType: args.memory_type,
      tags: args.tags ?? [],
      ttl: args.ttl,
    });

    return { content: [{ type: 'text' as const, text: JSON.stringify({
      success: true,
      memoryId: memory.id,
      message: `Stored ${args.memory_type} memory`,
      tags: memory.tags,
    }) }] };
  }
);

// ─── Recall Tool ─────────────────────────────────────────────────────────────

server.tool(
  'recall',
  `Retrieve memories using semantic search.

Filters: memory_type, tags, time_range (today, week, month, all)`,
  {
    query: z.string().describe('Natural language search query'),
    memory_type: z.string().optional().describe('Filter by type'),
    tags: z.array(z.string()).optional().describe('Filter by tags'),
    n_results: z.number().min(1).max(20).default(5).describe('Number of results'),
    time_range: z.string().optional().describe('Time filter'),
    path: z.string().optional().describe('Codebase path for auto-loading'),
  },
  { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  async (args) => {
    const state = getState();
    if (!state.codebasePath && args.path) await ensureLoaded(state, args.path);
    if (!state.codebasePath) {
      return { content: [{ type: 'text' as const, text: JSON.stringify({ error: "No codebase loaded. Use 'index' first." }) }] };
    }

    if (!state.memoryRetriever) {
      const paths = getCodebaxingPaths(state.codebasePath);
      state.memoryRetriever = new MemoryRetriever({
        projectPath: state.codebasePath,
        persistPath: paths.chromaPath,
        verbose: false,
      });
    }

    const memories = await state.memoryRetriever.recall({
      query: args.query,
      memoryType: args.memory_type,
      tags: args.tags,
      nResults: args.n_results,
      timeRange: args.time_range,
    });

    return { content: [{ type: 'text' as const, text: JSON.stringify({
      success: true,
      count: memories.length,
      memories,
    }) }] };
  }
);

// ─── Forget Tool ─────────────────────────────────────────────────────────────

server.tool(
  'forget',
  `DESTRUCTIVE: Remove memories matching specified criteria.

Delete by: memory_id, memory_type, tags, older_than (1d, 7d, 30d, 1y)`,
  {
    memory_id: z.string().optional().describe('Specific memory ID to delete'),
    memory_type: z.string().optional().describe('Delete all of this type'),
    tags: z.array(z.string()).optional().describe('Delete memories with these tags'),
    older_than: z.string().optional().describe('Delete older than: 1d, 7d, 30d, 1y'),
    path: z.string().optional().describe('Codebase path for auto-loading'),
  },
  { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
  async (args) => {
    const state = getState();
    if (!state.codebasePath && args.path) await ensureLoaded(state, args.path);
    if (!state.codebasePath) {
      return { content: [{ type: 'text' as const, text: JSON.stringify({ error: "No codebase loaded. Use 'index' first." }) }] };
    }

    if (!state.memoryRetriever) {
      const paths = getCodebaxingPaths(state.codebasePath);
      state.memoryRetriever = new MemoryRetriever({
        projectPath: state.codebasePath,
        persistPath: paths.chromaPath,
        verbose: false,
      });
    }

    if (!args.memory_id && !args.memory_type && !args.tags?.length && !args.older_than) {
      return { content: [{ type: 'text' as const, text: JSON.stringify({
        error: 'Must specify at least one filter: memory_id, memory_type, tags, or older_than',
      }) }] };
    }

    const result = await state.memoryRetriever.forget({
      memoryId: args.memory_id,
      memoryType: args.memory_type,
      tags: args.tags,
      olderThan: args.older_than,
    });

    return { content: [{ type: 'text' as const, text: JSON.stringify({
      success: true,
      deleted: result.deleted,
      message: `Deleted ${result.deleted} memories`,
    }) }] };
  }
);

// ─── Memory Stats Tool ───────────────────────────────────────────────────────

server.tool(
  'memory-stats',
  'Get statistics about stored memories for the current project.',
  {
    path: z.string().optional().describe('Codebase path for auto-loading'),
  },
  { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  async (args) => {
    const state = getState();
    if (!state.codebasePath && args.path) await ensureLoaded(state, args.path);
    if (!state.codebasePath) {
      return { content: [{ type: 'text' as const, text: JSON.stringify({
        loaded: false,
        message: "No codebase loaded. Use 'index' first.",
      }) }] };
    }

    if (!state.memoryRetriever) {
      const paths = getCodebaxingPaths(state.codebasePath);
      state.memoryRetriever = new MemoryRetriever({
        projectPath: state.codebasePath,
        persistPath: paths.chromaPath,
        verbose: false,
      });
    }

    const result = await state.memoryRetriever.getStats();
    return { content: [{ type: 'text' as const, text: JSON.stringify({
      loaded: true,
      project: state.codebasePath,
      ...result,
    }) }] };
  }
);

// ─── Helper functions for index tool ─────────────────────────────────────────

async function loadExistingIndex(
  codebasePath: string,
  paths: ReturnType<typeof getCodebaxingPaths>,
  state: ReturnType<typeof getState>,
  embeddingModel: string
): Promise<Record<string, unknown>> {
  if (isLegacyIndex(paths)) {
    return {
      error: LEGACY_INDEX_WARNING,
      legacy: true,
    };
  }

  const retriever = new SourceRetriever({
    codebasePath,
    embeddingModel,
    verbose: false,
    persistPath: paths.chromaPath,
  });

  if (!await retriever.loadExistingIndex()) {
    return { error: `Failed to load index from ${paths.chromaPath}` };
  }

  const metadata = retriever.loadMetadata(paths.metadataPath);
  state.retriever = retriever;
  state.codebasePath = codebasePath;

  return {
    success: true,
    modeUsed: 'load-only',
    message: `Loaded existing index for ${path.basename(codebasePath)}`,
    stats: metadata?.stats ?? {},
    indexedAt: metadata?.indexedAt,
  };
}

async function incrementalReindex(
  codebasePath: string,
  paths: ReturnType<typeof getCodebaxingPaths>,
  state: ReturnType<typeof getState>,
  embeddingModel: string
): Promise<Record<string, unknown>> {
  if (isLegacyIndex(paths)) {
    return {
      error: LEGACY_INDEX_WARNING,
      legacy: true,
    };
  }

  const retriever = new SourceRetriever({
    codebasePath,
    embeddingModel,
    verbose: false,
    persistPath: paths.chromaPath,
  });

  if (!await retriever.loadExistingIndex()) {
    return { error: `Failed to load existing index from ${paths.chromaPath}` };
  }

  retriever.loadMetadata(paths.metadataPath);
  const result = await retriever.incrementalReindex();
  retriever.saveMetadata(paths.metadataPath);

  state.retriever = retriever;
  state.codebasePath = codebasePath;

  return {
    success: true,
    modeUsed: 'incremental',
    message: `Incremental reindex complete for ${path.basename(codebasePath)}`,
    ...result,
  };
}

async function fullIndex(
  codebasePath: string,
  paths: ReturnType<typeof getCodebaxingPaths>,
  state: ReturnType<typeof getState>,
  fileExtensions: string[] | undefined,
  embeddingModel: string
): Promise<Record<string, unknown>> {
  fs.mkdirSync(paths.codebaxingDir, { recursive: true });

  // Save config with basePath so index knows the codebase root
  saveConfig(paths.configPath, { basePath: codebasePath });

  const retriever = new SourceRetriever({
    codebasePath,
    embeddingModel,
    verbose: false,
    persistPath: paths.chromaPath,
  });

  // Full index: do NOT load previous metadata.
  // Previous metadata contains fileMtimes that would cause resume logic
  // to skip all files, resulting in 0 symbols indexed.

  // Delete existing ChromaDB collection for a clean slate
  await retriever.deleteCollection();

  await retriever.indexCodebase({
    fileExtensions: fileExtensions ?? SUPPORTED_EXTENSIONS,
  });

  retriever.saveMetadata(paths.metadataPath);
  state.retriever = retriever;
  state.codebasePath = codebasePath;

  return {
    success: true,
    modeUsed: 'full',
    message: `Successfully indexed ${path.basename(codebasePath)}`,
    stats: retriever.getStats(),
  };
}

// ─── Entry Point ─────────────────────────────────────────────────────────────

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch(console.error);
