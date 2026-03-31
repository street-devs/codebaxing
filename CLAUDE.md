# Codebaxing (Node.js/TypeScript)

MCP server for semantic code search using vector embeddings.

## How It Works

```
Source Code → Tree-sitter (AST) → Symbols → Embedding Model → Vectors → ChromaDB
                                                                            ↓
Query → Embedding Model → Query Vector → Cosine Similarity → Top-k Results
```

1. **Tree-sitter** parses code into AST, extracts functions/classes/methods
2. **all-MiniLM-L6-v2** converts code chunks to 384-dim vectors (runs locally via ONNX)
3. **ChromaDB** stores vectors for fast similarity search
4. **Search** embeds query and finds nearest neighbors by cosine similarity

## Project Structure

```
src/
├── core/
│   ├── models.ts           # Symbol, ParsedFile, CodebaseIndex, Memory, MemoryType
│   ├── interfaces.ts       # IParser interface
│   └── exceptions.ts       # Error hierarchy
├── parsers/
│   ├── treesitter-parser.ts  # Multi-language AST parsing
│   └── language-configs.ts   # Tree-sitter node mappings (24+ languages)
├── indexing/
│   ├── embedding-service.ts  # @huggingface/transformers wrapper
│   ├── embedding-pool.ts     # Worker pool for parallel embedding
│   ├── embedding-worker.ts   # Worker thread entry point
│   ├── parallel-indexer.ts   # File parsing
│   ├── source-retriever.ts   # Code indexing + semantic search
│   └── memory-retriever.ts   # Memory storage + semantic recall
└── mcp/
    ├── state.ts              # Global singleton (SourceRetriever + MemoryRetriever)
    └── server.ts             # MCP server (8 tools)
```

## MCP Tools (8 total)

### Code Search
| Tool | Purpose |
|------|---------|
| `index` | Index codebase. Modes: `auto` (incremental), `full`, `load-only`. **Required first.** |
| `search` | Semantic search. Returns ranked code chunks with filters (language, symbol_type) |
| `stats` | Index statistics (files, symbols, chunks) |
| `languages` | Supported language extensions |

### Memory Layer
| Tool | Purpose |
|------|---------|
| `remember` | Store memories (conversation, status, decision, preference, doc, note) |
| `recall` | Semantic search over memories |
| `forget` | Delete memories by ID, type, tags, or age. **Destructive.** |
| `memory-stats` | Memory statistics by type |

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `CHROMADB_URL` | ChromaDB server URL (**required**) | - |
| `CODEBAXING_EMBEDDING_PROVIDER` | Embedding backend: `local`, `openai`, `voyage`, `gemini` | `local` |
| `CODEBAXING_DEVICE` | Compute device (local only): `cpu`, `coreml`, `webgpu`, `cuda`, `auto` | `cpu` (fastest for default small model) |
| `CODEBAXING_DTYPE` | Model quantization (local only): `fp32`, `fp16`, `q8`, `q4` | `q8` |
| `CODEBAXING_WORKERS` | Worker threads for parallel embedding (local only, 0=off) | `2` |
| `CODEBAXING_FILES_PER_BATCH` | Files per batch | `100` |
| `CODEBAXING_METADATA_SAVE_INTERVAL` | Save progress every N batches | `10` |
| `CODEBAXING_MAX_FILE_SIZE` | Max file size in MB | `1` |
| `CODEBAXING_MAX_CHUNKS` | Max chunks to index | `500000` |
| `CODEBAXING_MODEL_CACHE` | Directory for embedding model cache | `~/.cache/codebaxing/models` |
| `CODEBAXING_OPENAI_API_KEY` | OpenAI API key (or use `OPENAI_API_KEY`) | - |
| `CODEBAXING_VOYAGE_API_KEY` | Voyage API key (or use `VOYAGE_API_KEY`) | - |
| `CODEBAXING_GEMINI_API_KEY` | Gemini API key (or use `GEMINI_API_KEY`) | - |
| `CODEBAXING_EMBEDDING_MODEL` | Override embedding model name | per-provider default |
| `CODEBAXING_EMBEDDING_DIMENSIONS` | Override embedding dimensions | per-provider default |
| `CODEBAXING_EMBEDDING_BASE_URL` | Custom API endpoint for cloud providers | provider default |

### ChromaDB Setup (Required)
ChromaDB server must be running. Start with Docker:
```bash
docker run -d -p 8000:8000 chromadb/chroma
export CHROMADB_URL=http://localhost:8000
```

### Cloud Embedding (Fastest)
Use cloud APIs for ~10,000+ texts/sec (vs ~200 locally):
```bash
# Gemini (FREE - recommended)
CODEBAXING_EMBEDDING_PROVIDER=gemini GEMINI_API_KEY=... npx codebaxing index /path

# OpenAI
CODEBAXING_EMBEDDING_PROVIDER=openai OPENAI_API_KEY=sk-... npx codebaxing index /path

# Voyage (code-optimized)
CODEBAXING_EMBEDDING_PROVIDER=voyage VOYAGE_API_KEY=va-... npx codebaxing index /path
```

Provider defaults:
- **Gemini**: `text-embedding-004` (768 dims, free tier: 1500 RPM)
- **OpenAI**: `text-embedding-3-small` (384 dims, matches local default)
- **Voyage**: `voyage-code-3` (1024 dims, optimized for code search)

Note: Switching providers requires full re-index (`mode=full`) due to dimension differences.

### Performance Tuning (Local)
- **Dtype** (default `q8`): Quantization level. `q8` is ~3x faster than `fp32` with negligible quality loss.
  Use `fp32` only if embedding quality issues are suspected.
- **Workers** (default 2): Each worker loads its own ONNX model for true parallel embedding.
  Set `CODEBAXING_WORKERS=0` to disable (single-threaded), or up to 8 for large codebases.
- **CoreML** (macOS): Apple Neural Engine / Metal GPU via `onnxruntime-node`.
  Set `CODEBAXING_DEVICE=coreml`. Falls back to CPU automatically if unavailable.
  Note: CPU is faster for the default small model (~720 vs ~96 texts/sec).
- **WebGPU** (macOS): Metal GPU via `onnxruntime-node` WebGPU EP.
  Set `CODEBAXING_DEVICE=webgpu`. (~343 texts/sec, slower than CPU for small model).
- **CUDA**: NVIDIA GPU acceleration on Linux/Windows. macOS does not support CUDA.

## Commands

```bash
npm install               # Install dependencies
npm run build             # Compile TypeScript
npm start                 # Run MCP server
npm run dev               # Run with tsx (no build)
npm test                  # Run tests
npm run typecheck         # Type check without emit
```

## MCP Config

```json
{
  "codebaxing": {
    "command": "npx",
    "args": ["tsx", "/path/to/codebaxing/src/mcp/server.ts"],
    "env": {
      "CHROMADB_URL": "http://localhost:8000"
    }
  }
}
```

## Key Technical Details

- **Embedding Model**: `Xenova/all-MiniLM-L6-v2` (384 dims, ONNX, local) or cloud APIs (OpenAI/Voyage)
- **Model Cache**: `~/.cache/codebaxing/models/` (~90MB, persists across npx runs, local only)
- **Parallel Embedding**: `child_process` pool (default 2 workers, local) or concurrent API calls (cloud)
- **Vector DB**: ChromaDB (Node.js client requires server for persistence)
- **Parser**: Tree-sitter with native Node.js bindings
- **MCP SDK**: `@modelcontextprotocol/sdk`
