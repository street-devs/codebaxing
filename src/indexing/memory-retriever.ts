/**
 * Memory retriever for semantic memory search.
 *
 * Provides semantic search over memories (conversations, status,
 * decisions, etc.) using the same embedding infrastructure as code search.
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { ChromaClient, IncludeEnum, type Collection } from 'chromadb';
import { EmbeddingService, getEmbeddingService } from './embedding-service.js';
import { Memory, MemoryType, memoryTypeFromString, type TTL } from '../core/models.js';

// TTL duration mappings (in milliseconds)
const TTL_DURATIONS: Record<string, number | null> = {
  session: 24 * 60 * 60 * 1000,      // 24 hours
  day: 24 * 60 * 60 * 1000,          // 1 day
  week: 7 * 24 * 60 * 60 * 1000,     // 1 week
  month: 30 * 24 * 60 * 60 * 1000,   // 30 days
  permanent: null,                     // Never expires
};

export class MemoryRetriever {
  static readonly COLLECTION_NAME = 'memories';
  static readonly METADATA_FILE = 'memory_metadata.json';

  private projectPath: string;
  private projectId: string;
  private embeddingService: EmbeddingService;
  private chromaClient: ChromaClient;
  private collection!: Collection;
  private persistPath: string | undefined;
  private verbose: boolean;
  private initialized = false;

  stats: Record<string, unknown> = {
    totalMemories: 0,
    byType: {} as Record<string, number>,
    lastCleanup: null as string | null,
  };

  constructor(options: {
    projectPath: string;
    embeddingModel?: string;
    verbose?: boolean;
    persistPath?: string;
    embeddingService?: EmbeddingService;
  }) {
    this.projectPath = path.resolve(options.projectPath);
    this.projectId = this.projectPath;
    this.verbose = options.verbose ?? false;
    this.persistPath = options.persistPath;

    this.embeddingService = options.embeddingService ?? getEmbeddingService(
      options.embeddingModel ?? 'all-MiniLM-L6-v2',
      { showProgress: false }
    );

    if (this.persistPath) {
      fs.mkdirSync(this.persistPath, { recursive: true });
    }

    // ChromaDB Node.js client connects to a server.
    // Set CHROMADB_URL env var to connect to a running ChromaDB server.
    const chromaUrl = process.env.CHROMADB_URL;
    this.chromaClient = chromaUrl
      ? new ChromaClient({ path: chromaUrl })
      : new ChromaClient();
  }

  private async ensureInitialized(): Promise<void> {
    if (this.initialized) return;

    this.collection = await this.chromaClient.getOrCreateCollection({
      name: MemoryRetriever.COLLECTION_NAME,
      metadata: { description: 'Memory storage for conversations, status, decisions' },
    });

    this.loadStats();
    this.initialized = true;
  }

  private log(message: string) {
    if (this.verbose) console.log(`[Memory] ${message}`);
  }

  private loadStats() {
    if (this.persistPath) {
      const metadataPath = path.join(path.dirname(this.persistPath), MemoryRetriever.METADATA_FILE);
      try {
        if (fs.existsSync(metadataPath)) {
          const data = JSON.parse(fs.readFileSync(metadataPath, 'utf-8'));
          this.stats = data.stats ?? this.stats;
        }
      } catch { /* ignore */ }
    }
  }

  private saveStats() {
    if (this.persistPath) {
      const metadataPath = path.join(path.dirname(this.persistPath), MemoryRetriever.METADATA_FILE);
      try {
        fs.writeFileSync(metadataPath, JSON.stringify({ stats: this.stats }, null, 2));
      } catch { /* ignore */ }
    }
  }

  async remember(options: {
    content: string;
    memoryType: string;
    tags?: string[];
    ttl?: string;
    source?: string;
    metadata?: Record<string, unknown>;
  }): Promise<Memory> {
    await this.ensureInitialized();

    const memory = new Memory({
      id: crypto.randomUUID(),
      content: options.content,
      memoryType: memoryTypeFromString(options.memoryType),
      project: this.projectId,
      tags: options.tags ?? [],
      ttl: (options.ttl as TTL | undefined) ?? 'permanent',
      source: options.source ?? 'user',
      metadata: options.metadata ?? {},
    });

    const embedding = await this.embeddingService.embed(options.content);

    // Flatten metadata for ChromaDB
    const chromaMetadata: Record<string, string> = {
      memory_type: memory.memoryType,
      project: memory.project,
      tags: memory.tags.join(','),
      created_at: memory.createdAt,
      accessed_at: memory.accessedAt,
      ttl: memory.ttl,
      source: memory.source,
    };

    await this.collection.add({
      ids: [memory.id],
      embeddings: [embedding],
      documents: [memory.content],
      metadatas: [chromaMetadata],
    });

    // Update stats
    const count = await this.collection.count();
    this.stats.totalMemories = count;
    const byType = this.stats.byType as Record<string, number>;
    byType[memory.memoryType] = (byType[memory.memoryType] ?? 0) + 1;
    this.saveStats();

    this.log(`Stored memory: ${memory.id.substring(0, 8)}... (${options.memoryType})`);
    return memory;
  }

  async recall(options: {
    query: string;
    memoryType?: string;
    tags?: string[];
    nResults?: number;
    timeRange?: string;
    minRelevance?: number;
  }): Promise<Record<string, unknown>[]> {
    await this.ensureInitialized();

    const count = await this.collection.count();
    if (count === 0) return [];

    const nResults = options.nResults ?? 5;
    const queryEmbedding = await this.embeddingService.embed(options.query, true);

    // Parse time range
    let timeCutoff: Date | null = null;
    if (options.timeRange && options.timeRange !== 'all') {
      const now = new Date();
      const ranges: Record<string, number> = {
        today: 24 * 60 * 60 * 1000,
        week: 7 * 24 * 60 * 60 * 1000,
        month: 30 * 24 * 60 * 60 * 1000,
      };
      if (options.timeRange in ranges) {
        timeCutoff = new Date(now.getTime() - ranges[options.timeRange]);
      }
    }

    // Build filter
    const whereClauses: Record<string, string>[] = [{ project: this.projectId }];
    if (options.memoryType) {
      whereClauses.push({ memory_type: options.memoryType });
    }

    const chromaWhere = whereClauses.length > 1
      ? { $and: whereClauses }
      : whereClauses[0];

    try {
      const results = await this.collection.query({
        queryEmbeddings: [queryEmbedding],
        nResults: Math.min(nResults * 2, 50),
        // ChromaDB types don't fully support $and operator typing
        where: chromaWhere as Record<string, unknown>,
        include: [IncludeEnum.Documents, IncludeEnum.Metadatas, IncludeEnum.Distances],
      });

      if (!results.ids?.[0]?.length) return [];

      const memories: Record<string, unknown>[] = [];
      const ids = results.ids[0];
      const docs = results.documents?.[0] ?? [];
      const metas = results.metadatas?.[0] ?? [];
      const distances = results.distances?.[0] ?? [];

      for (let i = 0; i < ids.length; i++) {
        const distance = distances[i] as number;
        const relevance = 1.0 / (1.0 + distance);
        const minRelevance = options.minRelevance ?? 0;

        if (relevance < minRelevance) continue;

        const metadata = metas[i] as Record<string, string>;

        // Time range filter
        if (timeCutoff && metadata.created_at) {
          try {
            const created = new Date(metadata.created_at);
            if (created < timeCutoff) continue;
          } catch { /* skip */ }
        }

        // Tags filter
        if (options.tags?.length) {
          const storedTags = new Set(metadata.tags?.split(',') ?? []);
          if (!options.tags.some(t => storedTags.has(t))) continue;
        }

        memories.push({
          id: ids[i],
          content: docs[i],
          memoryType: metadata.memory_type,
          tags: metadata.tags ? metadata.tags.split(',').filter(Boolean) : [],
          createdAt: metadata.created_at,
          relevance: Math.round(relevance * 1000) / 1000,
          source: metadata.source ?? 'unknown',
        });

        if (memories.length >= nResults) break;
      }

      // Update accessed_at for returned memories
      const now = new Date().toISOString();
      for (const mem of memories) {
        try {
          await this.collection.update({
            ids: [mem.id as string],
            metadatas: [{ accessed_at: now }],
          });
        } catch { /* non-critical */ }
      }

      this.log(`Recalled ${memories.length} memories for query: ${options.query.substring(0, 50)}...`);
      return memories;
    } catch (e) {
      this.log(`Query error: ${(e as Error).message}`);
      return [];
    }
  }

  async forget(options: {
    memoryId?: string;
    memoryType?: string;
    tags?: string[];
    olderThan?: string;
  }): Promise<{ deleted: number }> {
    await this.ensureInitialized();

    let deleted = 0;

    if (options.memoryId) {
      try {
        const existing = await this.collection.get({ ids: [options.memoryId] });
        if (existing.ids.length > 0) {
          await this.collection.delete({ ids: [options.memoryId] });
          deleted = 1;
        }
      } catch { /* ignore */ }
    } else if (options.olderThan || options.tags?.length) {
      // Fetch all and filter
      const allMemories = await this.collection.get({
        where: { project: this.projectId },
        include: [IncludeEnum.Metadatas],
      });

      const idsToDelete: string[] = [];

      const durationMap: Record<string, number> = {
        '1d': 24 * 60 * 60 * 1000,
        '7d': 7 * 24 * 60 * 60 * 1000,
        '30d': 30 * 24 * 60 * 60 * 1000,
        '1y': 365 * 24 * 60 * 60 * 1000,
      };

      for (let i = 0; i < allMemories.ids.length; i++) {
        const metadata = allMemories.metadatas?.[i] as Record<string, string>;
        let shouldDelete = false;

        if (options.olderThan && options.olderThan in durationMap) {
          const cutoff = Date.now() - durationMap[options.olderThan];
          const created = new Date(metadata.created_at).getTime();
          if (created < cutoff) shouldDelete = true;
        }

        if (options.tags?.length) {
          const storedTags = new Set(metadata.tags?.split(',') ?? []);
          if (options.tags.some(t => storedTags.has(t))) shouldDelete = true;
        }

        if (options.memoryType && metadata.memory_type !== options.memoryType) {
          shouldDelete = false;
        }

        if (shouldDelete) idsToDelete.push(allMemories.ids[i]);
      }

      if (idsToDelete.length > 0) {
        await this.collection.delete({ ids: idsToDelete });
        deleted = idsToDelete.length;
      }
    } else if (options.memoryType) {
      try {
        const toDelete = await this.collection.get({
          where: {
            $and: [
              { memory_type: options.memoryType },
              { project: this.projectId },
            ],
          } as Record<string, unknown>,
        });
        if (toDelete.ids.length > 0) {
          await this.collection.delete({ ids: toDelete.ids });
          deleted = toDelete.ids.length;
        }
      } catch (e) {
        this.log(`Delete error: ${(e as Error).message}`);
      }
    }

    // Update stats
    const count = await this.collection.count();
    this.stats.totalMemories = count;
    this.saveStats();

    this.log(`Forgot ${deleted} memories`);
    return { deleted };
  }

  async getStats(): Promise<Record<string, unknown>> {
    await this.ensureInitialized();

    const total = await this.collection.count();
    const byType: Record<string, number> = {};

    for (const memType of Object.values(MemoryType)) {
      try {
        const result = await this.collection.get({
          where: {
            $and: [
              { memory_type: memType },
              { project: this.projectId },
            ],
          } as Record<string, unknown>,
        });
        if (result.ids.length > 0) {
          byType[memType] = result.ids.length;
        }
      } catch { /* ignore */ }
    }

    return {
      totalMemories: total,
      byType,
      project: this.projectId,
      lastCleanup: this.stats.lastCleanup,
    };
  }
}
