/**
 * Embedding worker for true parallel processing.
 * Each worker loads its own model instance.
 */

import { parentPort, workerData } from 'node:worker_threads';

// Lazy load to avoid import issues
let EmbeddingService: any;
let service: any = null;

async function initialize() {
  if (service) return;
  const mod = await import('./embedding-service.js');
  EmbeddingService = mod.EmbeddingService;
  service = new EmbeddingService(workerData?.modelName ?? 'all-MiniLM-L6-v2', {
    showProgress: false,
  });
}

parentPort?.on('message', async (msg: { type: string; texts?: string[]; id?: number }) => {
  if (msg.type === 'embed') {
    try {
      await initialize();
      const embeddings = await service.embedBatch(msg.texts ?? []);
      parentPort?.postMessage({ type: 'result', id: msg.id, embeddings });
    } catch (e) {
      parentPort?.postMessage({ type: 'error', id: msg.id, error: (e as Error).message });
    }
  } else if (msg.type === 'ping') {
    parentPort?.postMessage({ type: 'pong' });
  }
});
