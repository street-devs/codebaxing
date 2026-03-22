# Codebaxing

MCP server for **semantic code search**. Index your codebase and search using natural language queries.

## The Idea

Traditional code search (grep, ripgrep) matches exact text. But developers think in concepts:

- *"Where is the authentication logic?"* - not `grep "authentication"`
- *"Find database connection code"* - not `grep "database"`
- *"How does error handling work?"* - not `grep "error"`

**Codebaxing** bridges this gap using **semantic search**:

```
Query: "user authentication"
         ↓
Finds: login(), validateCredentials(), checkPassword(), authMiddleware()
       (even if they don't contain the word "authentication")
```

## How It Works

### Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                         INDEXING                                │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│   Source Files (.py, .ts, .js, .go, .rs, ...)                  │
│         │                                                       │
│         ▼                                                       │
│   ┌──────────────┐    ┌──────────────┐    ┌──────────────┐     │
│   │ Tree-sitter  │───▶│   Symbols    │───▶│  Embedding   │     │
│   │   Parser     │    │  Extraction  │    │    Model     │     │
│   └──────────────┘    └──────────────┘    └──────────────┘     │
│         │                    │                    │             │
│    Parse AST            Functions,          Text → Vector       │
│                        Classes, etc.        (384 dimensions)    │
│                                                  │              │
│                                                  ▼              │
│                                          ┌──────────────┐      │
│                                          │   ChromaDB   │      │
│                                          │  (vectors)   │      │
│                                          └──────────────┘      │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                          SEARCH                                 │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│   "find auth code"                                              │
│         │                                                       │
│         ▼                                                       │
│   ┌──────────────┐         ┌──────────────┐                    │
│   │  Embedding   │────────▶│   ChromaDB   │                    │
│   │    Model     │  query  │    Query     │                    │
│   └──────────────┘  vector └──────────────┘                    │
│                                   │                             │
│                                   ▼                             │
│                            Cosine Similarity                    │
│                                   │                             │
│                                   ▼                             │
│                            Top-k Results                        │
│                       (login.py, auth.ts, ...)                  │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Step-by-Step Process

#### 1. Parsing (Tree-sitter)

Tree-sitter parses source code into an Abstract Syntax Tree (AST), extracting meaningful symbols:

```python
# Input: auth.py
def login(username, password):
    """Authenticate user credentials"""
    if validate(username, password):
        return create_session(username)
    raise AuthError("Invalid credentials")
```

```
# Output: Symbol
{
  name: "login",
  type: "function",
  signature: "def login(username, password)",
  code: "def login(username, password):...",
  filepath: "auth.py",
  lineStart: 1,
  lineEnd: 6
}
```

#### 2. Embedding (all-MiniLM-L6-v2)

Each code chunk is converted to a 384-dimensional vector using a neural network:

```
"def login(username, password): authenticate user..."
                    ↓
    Embedding Model (runs locally, ONNX)
                    ↓
    [0.12, -0.34, 0.56, 0.08, ..., -0.22]  (384 numbers)
```

The model understands semantic relationships:
- `"authentication"` ≈ `"login"` ≈ `"credentials"` (vectors are close)
- `"database"` ≈ `"query"` ≈ `"SQL"` (vectors are close)
- `"authentication"` ≠ `"database"` (vectors are far apart)

#### 3. Storage (ChromaDB)

Vectors are stored in ChromaDB, a vector database optimized for similarity search:

```
ChromaDB Collection:
┌─────────────────────────────────────────────────────┐
│ ID          │ Vector (384d)      │ Metadata         │
├─────────────────────────────────────────────────────┤
│ chunk_001   │ [0.12, -0.34, ...] │ {file: auth.py}  │
│ chunk_002   │ [0.45, 0.23, ...]  │ {file: db.py}    │
│ chunk_003   │ [-0.11, 0.67, ...] │ {file: api.ts}   │
│ ...         │ ...                │ ...              │
└─────────────────────────────────────────────────────┘
```

#### 4. Search (Cosine Similarity)

When you search, your query is embedded and compared against all stored vectors:

```
Query: "user authentication"
              ↓
Query Vector: [0.15, -0.31, 0.52, ...]
              ↓
Compare with all vectors using cosine similarity:
  - chunk_001 (login): similarity = 0.89  ← HIGH
  - chunk_002 (db):    similarity = 0.23  ← LOW
  - chunk_003 (auth):  similarity = 0.85  ← HIGH
              ↓
Return top-k most similar chunks
```

### Why Semantic Search Works

The embedding model was trained on millions of text pairs, learning that:

| Concept A | ≈ Similar To | Distance |
|-----------|--------------|----------|
| authentication | login, credentials, auth, signin | Close |
| database | query, SQL, connection, ORM | Close |
| error | exception, failure, catch, throw | Close |
| parse | tokenize, lexer, AST, syntax | Close |

This allows finding code by **meaning**, not just keywords.

## Features

- **Semantic Code Search**: Find code by describing what you're looking for
- **24+ Languages**: Python, TypeScript, JavaScript, Go, Rust, Java, C/C++, and more
- **Memory Layer**: Store and recall project context across sessions
- **Incremental Indexing**: Only re-index changed files
- **100% Local**: No API calls, no cloud, works offline
- **GPU Acceleration**: Optional WebGPU/CUDA support

## Requirements

- Node.js >= 20.0.0
- ~500MB disk space for embedding model (downloaded on first run)

## Installation

### Option 1: Via npx (Recommended)

No installation needed! Just configure Claude Desktop directly.

### Option 2: Via npm (Global install)

```bash
npm install -g codebaxing
```

### Option 3: Clone from source

```bash
git clone https://github.com/duysolo/codebaxing.git
cd codebaxing
npm install
npm run build
```

### (Optional) Set up persistent storage

By default, the index is stored in memory and lost when the server restarts.

For persistent storage, run ChromaDB:

```bash
# Using Docker (recommended)
docker run -d -p 8000:8000 chromadb/chroma

# Set environment variable
export CHROMADB_URL=http://localhost:8000
```

### Configure Claude Desktop

Add to your Claude Desktop config file:

**macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
**Windows**: `%APPDATA%\Claude\claude_desktop_config.json`

#### Via npx (no install needed):

```json
{
  "mcpServers": {
    "codebaxing": {
      "command": "npx",
      "args": ["-y", "codebaxing"]
    }
  }
}
```

#### Via global install:

```bash
npm install -g codebaxing
```

```json
{
  "mcpServers": {
    "codebaxing": {
      "command": "codebaxing"
    }
  }
}
```

#### With persistent storage (ChromaDB):

```json
{
  "mcpServers": {
    "codebaxing": {
      "command": "npx",
      "args": ["-y", "codebaxing"],
      "env": {
        "CHROMADB_URL": "http://localhost:8000"
      }
    }
  }
}
```

#### From source (development):

```json
{
  "mcpServers": {
    "codebaxing": {
      "command": "node",
      "args": ["/path/to/codebaxing/dist/mcp/server.js"]
    }
  }
}
```

### Restart Claude Desktop

The Codebaxing tools will now be available in Claude.

## Usage

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

1. **Index your codebase:**
   ```
   index(path="/path/to/your/project")
   ```

2. **Search for code:**
   ```
   search(question="authentication middleware")
   search(question="database connection", language="typescript")
   search(question="error handling", symbol_type="function")
   ```

3. **Store context:**
   ```
   remember(content="Using PostgreSQL with Prisma ORM", memory_type="decision")
   remember(content="Auth uses JWT tokens", memory_type="doc", tags=["auth", "security"])
   ```

4. **Recall context:**
   ```
   recall(query="database setup")
   recall(query="authentication", memory_type="decision")
   ```

## Supported Languages

Python, JavaScript, TypeScript, C, C++, Bash, Go, Java, Kotlin, Rust, Ruby, C#, PHP, Scala, Swift, Lua, Dart, Elixir, Haskell, OCaml, Zig, Perl, CSS, HTML, Vue, JSON, YAML, TOML, Makefile

## Configuration

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `CHROMADB_URL` | ChromaDB server URL for persistent storage | (in-memory) |
| `CODEBAXING_DEVICE` | Compute device for embeddings | `cpu` |

### GPU Acceleration

Enable GPU for faster embedding generation:

```bash
# WebGPU (experimental, uses Metal on macOS)
export CODEBAXING_DEVICE=webgpu

# Auto-detect best device
export CODEBAXING_DEVICE=auto

# NVIDIA GPU (Linux/Windows only, requires CUDA)
export CODEBAXING_DEVICE=cuda
```

Default is `cpu` which works everywhere.

**Note:** macOS does not support CUDA (no NVIDIA drivers). Use `webgpu` for GPU acceleration on Mac.

### Storage

Metadata is stored in `.codebaxing/` folder within your project:
- `metadata.json` - Index metadata and file timestamps

## Development

```bash
npm run dev       # Run with tsx (no build needed)
npm run build     # Compile TypeScript
npm start         # Run compiled version
npm test          # Run tests
npm run typecheck # Type check without emitting
```

### Testing

```bash
# Run unit tests
npm test

# Test indexing manually
CHROMADB_URL=http://localhost:8000 npx tsx test-indexing.ts
```

## Comparison: Grep vs Semantic Search

| Aspect | Grep | Semantic Search |
|--------|------|-----------------|
| Query | Exact text match | Natural language |
| "authentication" | Only finds "authentication" | Finds login, auth, credentials, etc. |
| Understands context | No | Yes |
| Finds synonyms | No | Yes |
| Speed | Very fast | Fast (after indexing) |
| Setup | None | Requires indexing |

## Technical Details

| Component | Technology |
|-----------|------------|
| Embedding Model | `all-MiniLM-L6-v2` (384 dimensions) |
| Model Runtime | `@huggingface/transformers` (ONNX) |
| Vector Database | ChromaDB |
| Code Parser | Tree-sitter |
| MCP SDK | `@modelcontextprotocol/sdk` |

## License

MIT
