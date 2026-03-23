/**
 * Process pool for parallel embedding.
 *
 * Uses child_process.fork() instead of worker_threads to avoid ONNX WASM
 * conflicts. Each child process gets its own V8 isolate and WASM memory,
 * enabling true parallel ONNX inference.
 */

import { fork, type ChildProcess } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';
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
  private workers: ChildProcess[] = [];
  private taskQueue: Array<{ texts: string[]; resolve: (e: number[][]) => void; reject: (e: Error) => void }> = [];
  private pendingTasks: Map<number, PendingTask> = new Map();
  private workerBusy: boolean[] = [];
  private nextTaskId = 0;
  private modelName: string;
  private numWorkers: number;
  private initialized = false;
  private initPromise: Promise<void> | null = null;

  constructor(options: PoolOptions = {}) {
    this.numWorkers = options.numWorkers ?? Math.min(os.cpus().length, 4);
    this.modelName = options.modelName ?? 'all-MiniLM-L6-v2';

    for (let i = 0; i < this.numWorkers; i++) {
      this.workerBusy.push(false);
    }
  }

  private createWorker(index: number): Promise<ChildProcess> {
    // Use compiled .js in production, .ts with tsx in development
    const jsWorkerPath = path.join(__dirname, 'embedding-worker.js');
    const tsWorkerPath = path.join(__dirname, 'embedding-worker.ts');
    const useCompiledJs = fs.existsSync(jsWorkerPath);
    const workerPath = useCompiledJs ? jsWorkerPath : tsWorkerPath;

    // Build execArgv for tsx if needed
    const execArgv: string[] = [];
    if (!useCompiledJs) {
      const possibleTsxPaths = [
        path.join(__dirname, '../../node_modules/tsx/dist/esm/index.mjs'),
        path.join(__dirname, '../../../node_modules/tsx/dist/esm/index.mjs'),
      ];
      for (const p of possibleTsxPaths) {
        if (fs.existsSync(p)) {
          execArgv.push('--import', p);
          break;
        }
      }
    }

    return new Promise((resolve, reject) => {
      const child = fork(workerPath, [this.modelName, String(this.numWorkers)], {
        execArgv,
        stdio: ['pipe', 'pipe', 'pipe', 'ipc'],
        env: { ...process.env },
      });

      // Suppress worker stderr (model loading noise)
      child.stderr?.on('data', () => {});
      child.stdout?.on('data', () => {});

      let ready = false;
      const timeout = setTimeout(() => {
        if (!ready) {
          child.kill();
          reject(new Error(`Worker ${index} initialization timeout`));
        }
      }, 120000);

      child.on('message', (msg: any) => {
        if (msg.type === 'pong' && !ready) {
          ready = true;
          clearTimeout(timeout);
          resolve(child);
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

      child.on('error', (err) => {
        clearTimeout(timeout);
        if (!ready) {
          reject(err);
        } else {
          console.error(`[codebaxing] Worker ${index} error:`, err.message);
        }
      });

      child.on('exit', (code) => {
        if (!ready) {
          clearTimeout(timeout);
          reject(new Error(`Worker ${index} exited with code ${code}`));
        }
      });

      // Ping to check if worker is responsive
      child.send({ type: 'ping' });
    });
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;
    if (this.initPromise) return this.initPromise;

    this.initPromise = (async () => {
      console.log(`[codebaxing] Initializing ${this.numWorkers} embedding workers...`);

      const workerPromises = [];
      for (let i = 0; i < this.numWorkers; i++) {
        workerPromises.push(this.createWorker(i));
      }

      try {
        this.workers = await Promise.all(workerPromises);
        this.initialized = true;
        console.log(`[codebaxing] ${this.numWorkers} workers ready`);
      } catch (e) {
        // Clean up any workers that did start
        for (const w of this.workers) {
          try { w.kill(); } catch {}
        }
        this.workers = [];
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
      this.workers[freeWorkerIdx].send({ type: 'embed', texts: task.texts, id: taskId });
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
    for (const w of this.workers) {
      try { w.kill(); } catch {}
    }
    this.workers = [];
    this.initialized = false;
    this.initPromise = null;
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
