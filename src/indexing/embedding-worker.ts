/**
 * Embedding worker for true parallel processing.
 *
 * Runs as a child process (not worker_thread) to avoid ONNX WASM conflicts.
 * Each process gets its own V8 isolate and WASM memory.
 */

// When running as child process, listen on stdin/stdout via IPC
const isChildProcess = !!process.send;

if (isChildProcess) {
  let EmbeddingService: any;
  let service: any = null;
  const modelName = process.argv[2] ?? 'all-MiniLM-L6-v2';

  async function initialize() {
    if (service) return;
    const mod = await import('./embedding-service.js');
    EmbeddingService = mod.EmbeddingService;
    // Each worker uses fewer ONNX threads since parallelism comes from multiple processes.
    // With 2 workers x 4 threads = 8 total, matching single-threaded mode.
    const os = await import('node:os');
    const totalCpus = os.cpus().length;
    const numWorkers = parseInt(process.argv[3] ?? '2', 10);
    const threadsPerWorker = Math.max(1, Math.floor(totalCpus / numWorkers));
    process.env.CODEBAXING_ONNX_THREADS = String(threadsPerWorker);
    service = new EmbeddingService(modelName, { showProgress: false, disableCachePurge: true });
  }

  process.on('message', async (msg: { type: string; texts?: string[]; id?: number }) => {
    if (msg.type === 'embed') {
      try {
        await initialize();
        const embeddings = await service.embedBatch(msg.texts ?? []);
        process.send!({ type: 'result', id: msg.id, embeddings });
      } catch (e) {
        process.send!({ type: 'error', id: msg.id, error: (e as Error).message });
      }
    } else if (msg.type === 'ping') {
      process.send!({ type: 'pong' });
    }
  });
}
