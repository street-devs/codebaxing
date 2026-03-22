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
| `CHROMADB_URL` | ChromaDB server URL for persistent storage | (ephemeral mode) |
| `CODEBAXING_DEVICE` | Compute device: `cpu`, `cuda`, `webgpu`, `auto` | `cpu` |

### ChromaDB Persistence
Without `CHROMADB_URL`, data is stored in memory and lost on restart.
```bash
docker run -d -p 8000:8000 chromadb/chroma
export CHROMADB_URL=http://localhost:8000
```

### GPU/Accelerator
- `cpu` (default): Works everywhere
- `webgpu`: Uses Metal on macOS
- `cuda`: NVIDIA GPU (Linux/Windows only)
- `auto`: Auto-detect best available

Note: macOS does not support CUDA. Use `webgpu` for acceleration on Mac.

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

- **Embedding Model**: `Xenova/all-MiniLM-L6-v2` (384 dims, ONNX)
- **Model Cache**: `~/.cache/huggingface/` (~90MB)
- **Vector DB**: ChromaDB (Node.js client requires server for persistence)
- **Parser**: Tree-sitter with native Node.js bindings
- **MCP SDK**: `@modelcontextprotocol/sdk`
