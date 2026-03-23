/**
 * Worker pool for parallel embedding processing.
 *
 * Each worker loads its own embedding model, enabling true parallelism
 * since ONNX inference blocks the thread.
 */

import { Worker } from 'node:worker_threads';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import os from 'node:os';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface PoolOptions {
  numWorkers?: number;
  modelName?: string;
}

interface PendingTask {
  resolve: (embeddings: number[][]) => void;
  reject: (error: Error) => void;
}

export class EmbeddingWorkerPool {
  private workers: Worker[] = [];
  private taskQueue: Array<{ texts: string[]; resolve: (e: number[][]) => void; reject: (e: Error) => void }> = [];
  private pendingTasks: Map<number, PendingTask> = new Map();
  private workerBusy: boolean[] = [];
  private nextTaskId = 0;
  private modelName: string;
  private initialized = false;
  private initPromise: Promise<void> | null = null;

  constructor(options: PoolOptions = {}) {
    const numWorkers = options.numWorkers ?? Math.min(os.cpus().length, 4);
    this.modelName = options.modelName ?? 'all-MiniLM-L6-v2';

    for (let i = 0; i < numWorkers; i++) {
      this.workerBusy.push(false);
    }
  }

  private async createWorker(index: number): Promise<Worker> {
    // Use tsx to run TypeScript workers directly
    const workerPath = path.join(__dirname, 'embedding-worker.ts');

    // Find tsx path - it might be in local node_modules or global
    const tsxPath = path.join(__dirname, '../../node_modules/tsx/dist/esm/index.mjs');

    return new Promise((resolve, reject) => {
      const worker = new Worker(workerPath, {
        workerData: { modelName: this.modelName },
        execArgv: ['--import', tsxPath],
      });

      let ready = false;
      const timeout = setTimeout(() => {
        if (!ready) {
          worker.terminate();
          reject(new Error(`Worker ${index} initialization timeout`));
        }
      }, 120000); // 2 min timeout for model loading

      worker.on('message', (msg) => {
        if (msg.type === 'pong' && !ready) {
          ready = true;
          clearTimeout(timeout);
          resolve(worker);
        } else if (msg.type === 'result' || msg.type === 'error') {
          const task = this.pendingTasks.get(msg.id);
          if (task) {
            this.pendingTasks.delete(msg.id);
            this.workerBusy[index] = false;
            if (msg.type === 'result') {
              task.resolve(msg.embeddings);
            } else {
              task.reject(new Error(msg.error));
            }
            this.processQueue();
          }
        }
      });

      worker.on('error', (err) => {
        clearTimeout(timeout);
        if (!ready) {
          reject(err);
        } else {
          console.error(`Worker ${index} error:`, err);
        }
      });

      // Ping to check if worker is ready
      worker.postMessage({ type: 'ping' });
    });
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;
    if (this.initPromise) return this.initPromise;

    this.initPromise = (async () => {
      const numWorkers = this.workerBusy.length;
      console.log(`[codebaxing] Initializing ${numWorkers} embedding workers...`);

      const workerPromises = [];
      for (let i = 0; i < numWorkers; i++) {
        workerPromises.push(this.createWorker(i));
      }

      try {
        this.workers = await Promise.all(workerPromises);
        this.initialized = true;
        console.log(`[codebaxing] ${numWorkers} workers ready`);
      } catch (e) {
        console.error('[codebaxing] Failed to initialize workers, falling back to single-threaded');
        throw e;
      }
    })();

    return this.initPromise;
  }

  private processQueue(): void {
    while (this.taskQueue.length > 0) {
      const freeWorkerIdx = this.workerBusy.findIndex(busy => !busy);
      if (freeWorkerIdx === -1) break;

      const task = this.taskQueue.shift()!;
      const taskId = this.nextTaskId++;

      this.workerBusy[freeWorkerIdx] = true;
      this.pendingTasks.set(taskId, { resolve: task.resolve, reject: task.reject });
      this.workers[freeWorkerIdx].postMessage({ type: 'embed', texts: task.texts, id: taskId });
    }
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    if (!this.initialized) {
      await this.initialize();
    }

    return new Promise((resolve, reject) => {
      this.taskQueue.push({ texts, resolve, reject });
      this.processQueue();
    });
  }

  async terminate(): Promise<void> {
    await Promise.all(this.workers.map(w => w.terminate()));
    this.workers = [];
    this.initialized = false;
  }

  get isInitialized(): boolean {
    return this.initialized;
  }

  get workerCount(): number {
    return this.workers.length;
  }
}

// Singleton pool
let pool: EmbeddingWorkerPool | null = null;

export function getEmbeddingPool(options?: PoolOptions): EmbeddingWorkerPool {
  if (!pool) {
    pool = new EmbeddingWorkerPool(options);
  }
  return pool;
}

export async function resetEmbeddingPool(): Promise<void> {
  if (pool) {
    await pool.terminate();
    pool = null;
  }
}
