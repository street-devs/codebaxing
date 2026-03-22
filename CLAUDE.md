# Codebaxing (Node.js/TypeScript)

MCP server for semantic code search. Node.js port of the Python codebaxing.

## Structure

```
src/
├── core/models.ts              # Symbol, ParsedFile, CodebaseIndex + Memory, MemoryType
├── core/interfaces.ts          # IParser interface
├── core/exceptions.ts          # Error hierarchy
├── parsers/treesitter-parser.ts  # Multi-language AST parsing (9 languages)
├── parsers/language-configs.ts   # Tree-sitter node mappings
├── indexing/embedding-service.ts # @huggingface/transformers wrapper
├── indexing/parallel-indexer.ts  # File parsing
├── indexing/source-retriever.ts  # Code indexing + semantic search
├── indexing/memory-retriever.ts  # Memory storage + semantic recall
└── mcp/
    ├── state.ts                # Global singleton (SourceRetriever + MemoryRetriever)
    └── server.ts               # MCP server (8 tools)
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

## Key Differences from Python version

- **Embedding Model**: `Xenova/all-MiniLM-L6-v2` (384 dims) instead of CodeRankEmbed (768 dims)
- **Embedding Backend**: `@huggingface/transformers` (ONNX) instead of SentenceTransformers+PyTorch
- **MCP SDK**: `@modelcontextprotocol/sdk` instead of FastMCP
- **Tree-sitter**: Native Node.js bindings via npm packages
- **No GPU support**: Runs on CPU only (ONNX in Node.js)
- **ChromaDB**: Node.js client requires server for persistence (see below)

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `CHROMADB_URL` | ChromaDB server URL for persistent storage | (ephemeral mode) |

Note: Without `CHROMADB_URL`, data is stored in memory and lost on restart.
To persist data, run ChromaDB server: `docker run -p 8000:8000 chromadb/chroma`
then set `CHROMADB_URL=http://localhost:8000`.

## Commands

```bash
npm install               # Install dependencies
npm run build             # Compile TypeScript
npm start                 # Run MCP server
npm run dev               # Run with tsx (no build needed)
npm test                  # Run tests
```

## MCP Config

```json
{
  "codebaxing": {
    "command": "node",
    "args": ["/path/to/codebaxing-node/dist/mcp/server.js"]
  }
}
```

Or with tsx (no build):
```json
{
  "codebaxing": {
    "command": "npx",
    "args": ["tsx", "/path/to/codebaxing-node/src/mcp/server.ts"]
  }
}
```
