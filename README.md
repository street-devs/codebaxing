# Codebaxing (Node.js)

MCP server for semantic code search. Index your codebase and search using natural language.

## Features

- **Semantic Code Search**: Find code by describing what you're looking for
- **24+ Languages**: Python, TypeScript, JavaScript, Go, Rust, Java, C/C++, and more
- **Memory Layer**: Store and recall project context across sessions
- **Incremental Indexing**: Only re-index changed files

## Requirements

- Node.js >= 20.0.0
- ~500MB disk space for embedding model (downloaded on first run)

## Installation

```bash
npm install
```

## Usage

### As MCP Server

Add to your Claude Desktop config (`~/Library/Application Support/Claude/claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "codebaxing": {
      "command": "npx",
      "args": ["tsx", "/path/to/codebaxing-node/src/mcp/server.ts"]
    }
  }
}
```

Or with compiled version:

```json
{
  "mcpServers": {
    "codebaxing": {
      "command": "node",
      "args": ["/path/to/codebaxing-node/dist/mcp/server.js"]
    }
  }
}
```

### MCP Tools

| Tool | Description |
|------|-------------|
| `index` | Index a codebase. Modes: `auto` (incremental), `full`, `load-only` |
| `search` | Semantic search. Returns ranked code chunks |
| `stats` | Index statistics (files, symbols, chunks) |
| `languages` | List supported file extensions |
| `remember` | Store memories (conversation, status, decision, preference, doc, note) |
| `recall` | Semantic search over memories |
| `forget` | Delete memories by ID, type, tags, or age |
| `memory-stats` | Memory statistics by type |

### Example Workflow

1. Index your codebase:
   ```
   index(path="/path/to/your/project")
   ```

2. Search for code:
   ```
   search(question="authentication middleware")
   search(question="database connection", language="typescript")
   ```

3. Store context:
   ```
   remember(content="Using PostgreSQL with Prisma ORM", memory_type="decision")
   ```

## Development

```bash
npm run dev       # Run with tsx (no build)
npm run build     # Compile TypeScript
npm start         # Run compiled version
npm test          # Run tests
npm run typecheck # Type check without emitting
```

## Supported Languages

Python, JavaScript, TypeScript, C, C++, Bash, Go, Java, Kotlin, Rust, Ruby, C#, PHP, Scala, Swift, Lua, Dart, Elixir, Haskell, OCaml, Zig, Perl, CSS, HTML, Vue, JSON, YAML, TOML, Makefile

## How It Works

1. **Parsing**: Tree-sitter extracts functions, classes, and methods from source files
2. **Embedding**: Code chunks are converted to vectors using `all-MiniLM-L6-v2` (384 dims)
3. **Storage**: Vectors stored in ChromaDB for fast similarity search
4. **Search**: Query is embedded and matched against stored vectors

## Configuration

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `CHROMADB_URL` | ChromaDB server URL | (in-memory) |
| `CODEBAXING_DEVICE` | Compute device | `cpu` |

### Storage

By default, the index is stored in memory and lost when the server restarts.

For persistent storage, run a ChromaDB server:

```bash
docker run -p 8000:8000 chromadb/chroma
export CHROMADB_URL=http://localhost:8000
```

### GPU Acceleration

Enable GPU for faster embedding generation:

```bash
# WebGPU (experimental, uses Metal on macOS)
export CODEBAXING_DEVICE=webgpu

# Auto-detect best device
export CODEBAXING_DEVICE=auto

# NVIDIA GPU (Linux/Windows only)
export CODEBAXING_DEVICE=cuda
```

Default is `cpu` which works everywhere.

**Note:** macOS does not support CUDA (no NVIDIA drivers). Use `webgpu` for GPU acceleration on Mac.

Metadata is stored in `.codebaxing/` folder within your project:
- `metadata.json` - Index metadata and file timestamps

## License

MIT
