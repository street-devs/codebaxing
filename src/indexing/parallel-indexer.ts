/**
 * Parallel indexing utilities for Codebaxing.
 *
 * Uses worker pool pattern for concurrent file parsing.
 * In Node.js, we use Promise.all with concurrency limiting
 * since tree-sitter parsing is CPU-bound but fast enough
 * that the overhead of worker_threads isn't worth it for most codebases.
 */

import { TreeSitterParser } from '../parsers/treesitter-parser.js';
import type { Symbol } from '../core/models.js';

export interface ParseResult {
  filepath: string;
  symbols: Symbol[];
  success: boolean;
  error?: string;
}

export interface ProgressCallback {
  (eventType: string, data: Record<string, unknown>): void;
}

/**
 * Parse multiple files with concurrency control.
 *
 * Unlike Python's ThreadPoolExecutor, Node.js is single-threaded.
 * Tree-sitter parsing is synchronous and fast (~200+ files/sec),
 * so we process sequentially but report progress.
 *
 * For truly parallel parsing, use worker_threads (not implemented
 * here for simplicity, but the interface supports it).
 */
export function parallelParseFiles(
  files: string[],
  options: {
    maxWorkers?: number;
    progressCallback?: ProgressCallback;
  } = {}
): { symbols: Symbol[]; errorCount: number } {
  if (files.length === 0) return { symbols: [], errorCount: 0 };

  const parser = new TreeSitterParser();
  const allSymbols: Symbol[] = [];
  let errorCount = 0;
  let completed = 0;

  for (const filepath of files) {
    try {
      const parsed = parser.parseFile(filepath);
      completed++;

      if (parsed.isSuccessful && parsed.symbols.length > 0) {
        allSymbols.push(...parsed.symbols);
        options.progressCallback?.('file_parsed', {
          path: filepath,
          symbols: parsed.symbols.length,
          index: completed,
          total: files.length,
        });
      } else if (parsed.error) {
        errorCount++;
        options.progressCallback?.('parse_error', {
          path: filepath,
          error: parsed.error,
        });
      } else {
        options.progressCallback?.('file_parsed', {
          path: filepath,
          symbols: 0,
          index: completed,
          total: files.length,
        });
      }
    } catch (e) {
      completed++;
      errorCount++;
      options.progressCallback?.('parse_error', {
        path: filepath,
        error: (e as Error).message,
      });
    }
  }

  return { symbols: allSymbols, errorCount };
}
