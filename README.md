# Codebaxing

[![npm version](https://img.shields.io/npm/v/codebaxing.svg)](https://www.npmjs.com/package/codebaxing)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

**[English](README.md)** | [Tiếng Việt](README.vi.md)

MCP server for **semantic code search**. Index your codebase and search using natural language queries.

## Table of Contents

- [The Idea](#the-idea)
- [Quick Start](#quick-start)
- [Installation](#installation)
- [Usage](#usage)
- [Configuration](#configuration)
- [How It Works](#how-it-works)

## The Idea

Traditional code search (grep, ripgrep) matches exact text. But developers think in concepts:

- *"Where is the authentication logic?"* - not `grep "authentication"`
- *"Find database connection code"* - not `grep "database"`

**Codebaxing** bridges this gap using **semantic search**:

```
Query: "user authentication"
         ↓
Finds: login(), validateCredentials(), checkPassword(), authMiddleware()
       (even if they don't contain the word "authentication")
```

## Quick Start

### Step 1: Start ChromaDB (Required)

ChromaDB is required for persistent storage. Start it with Docker:

```bash
docker run -d -p 8000:8000 --name chromadb chromadb/chroma

# Verify it's running
curl http://localhost:8000/api/v2/heartbeat
```

### Step 2: Install to Your Editor

```bash
npx codebaxing install              # Claude Desktop
npx codebaxing install --cursor     # Cursor
npx codebaxing install --windsurf   # Windsurf
npx codebaxing install --all        # All editors
```

### Step 3: Restart Editor and Use

Restart your editor, then ask: *"Index my project at /path/to/myproject"*

### For CLI Usage

```bash
# Set environment variable (add to ~/.bashrc or ~/.zshrc)
export CHROMADB_URL=http://localhost:8000

# Index and search
npx codebaxing index /path/to/project
npx codebaxing search "authentication logic"
```

## Installation

### Step 1: Start ChromaDB (Required)

ChromaDB is **required** for storing code indexes. Without it, Codebaxing won't work.

```bash
# Start ChromaDB with Docker
docker run -d -p 8000:8000 --name chromadb chromadb/chroma

# Verify it's running
curl http://localhost:8000/api/v2/heartbeat
# Should return: {"nanosecond heartbeat":...}
```

**Tip:** Add this to your system startup or use Docker Compose for persistence.

### Step 2: Install to AI Editor

```bash
npx codebaxing install              # Claude Desktop (default)
npx codebaxing install --cursor     # Cursor
npx codebaxing install --windsurf   # Windsurf (Codeium)
npx codebaxing install --zed        # Zed
npx codebaxing install --all        # All supported editors
```

The installer automatically configures `CHROMADB_URL=http://localhost:8000` in your editor.

### Step 3: Restart Your Editor

The Codebaxing tools are now available!

### Uninstall

```bash
npx codebaxing uninstall            # Claude Desktop
npx codebaxing uninstall --all      # All editors
```

## Usage

### Via AI Agents (Claude Desktop, Cursor, etc.)

After installing, interact through natural conversation:

#### 1. Index your codebase (Required first)

```
You: Index the codebase at /Users/me/projects/myapp
```

> **Note:** First run downloads the embedding model (~90MB), takes 1-2 minutes.

#### 2. Search for code

```
You: Find code that handles user authentication
You: Where is the database connection logic?
You: Show me error handling patterns
```

#### 3. Use memory (optional)

```
You: Remember that we're using PostgreSQL with Prisma ORM
You: What decisions have we made about the database?
```

#### MCP Tools Reference

| Tool | Description | Example |
|------|-------------|---------|
| `index` | Index a codebase (**required first**) | `index(path="/project")` |
| `search` | Semantic code search | `search(question="auth middleware")` |
| `stats` | Index statistics | `stats()` |
| `languages` | Supported extensions | `languages()` |
| `remember` | Store memory | `remember(content="Using Redis", memory_type="decision")` |
| `recall` | Retrieve memories | `recall(query="database")` |
| `forget` | Delete memories | `forget(memory_type="note")` |
| `memory-stats` | Memory statistics | `memory-stats()` |

### Via CLI (Terminal)

CLI commands **require ChromaDB** running. See [Setup ChromaDB](#step-2-optional-setup-chromadb-for-persistent-storage).

#### Prerequisites

```bash
# Start ChromaDB
docker run -d -p 8000:8000 --name chromadb chromadb/chroma

# Set environment variable (add to your ~/.bashrc or ~/.zshrc)
export CHROMADB_URL=http://localhost:8000
```

#### Commands

```bash
# Index a codebase
npx codebaxing index /path/to/project

# Search for code
npx codebaxing search "authentication middleware"
npx codebaxing search "database connection" --path ./src --limit 10

# Show index statistics
npx codebaxing stats /path/to/project

# Show help
npx codebaxing --help
```

#### CLI Reference

| Command | Description |
|---------|-------------|
| `npx codebaxing install [--editor]` | Install MCP server to AI editor |
| `npx codebaxing uninstall [--editor]` | Uninstall MCP server |
| `npx codebaxing index <path>` | Index a codebase |
| `npx codebaxing search <query> [options]` | Search indexed codebase |
| `npx codebaxing stats [path]` | Show index statistics |

**Search options:**
- `--path, -p <path>` - Codebase path (default: current directory)
- `--limit, -n <number>` - Number of results (default: 5)

## Configuration

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `CHROMADB_URL` | ChromaDB server URL (**required**) | - |
| `CODEBAXING_DEVICE` | Compute device: `cpu`, `webgpu`, `cuda`, `auto` | `cpu` |
| `CODEBAXING_MAX_FILE_SIZE` | Max file size to index (MB) | `1` |

### GPU Acceleration

```bash
export CODEBAXING_DEVICE=webgpu  # macOS (Metal)
export CODEBAXING_DEVICE=cuda    # Linux/Windows (NVIDIA)
export CODEBAXING_DEVICE=auto    # Auto-detect
```

**Note:** macOS does not support CUDA. Use `webgpu` for GPU acceleration on Mac.

### Manual Editor Configuration

If you prefer to configure manually instead of using `npx codebaxing install`:

<details>
<summary>Claude Desktop</summary>

`~/Library/Application Support/Claude/claude_desktop_config.json` (macOS)
`%APPDATA%\Claude\claude_desktop_config.json` (Windows)

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
</details>

<details>
<summary>Cursor</summary>

`~/.cursor/mcp.json`

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
</details>

<details>
<summary>Windsurf</summary>

`~/.codeium/windsurf/mcp_config.json`

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
</details>

<details>
<summary>Zed</summary>

`~/.config/zed/settings.json`

```json
{
  "context_servers": {
    "codebaxing": {
      "command": {
        "path": "npx",
        "args": ["-y", "codebaxing"]
      },
      "env": {
        "CHROMADB_URL": "http://localhost:8000"
      }
    }
  }
}
```
</details>

<details>
<summary>VS Code + Continue</summary>

`~/.continue/config.json`

```json
{
  "experimental": {
    "modelContextProtocolServers": [
      {
        "transport": {
          "type": "stdio",
          "command": "npx",
          "args": ["-y", "codebaxing"],
          "env": {
            "CHROMADB_URL": "http://localhost:8000"
          }
        }
      }
    ]
  }
}
```
</details>

## How It Works

### Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         INDEXING                                │
├─────────────────────────────────────────────────────────────────┤
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
└─────────────────────────────────────────────────────────────────┘
```

### Why Semantic Search Works

The embedding model understands that:

| Query | Finds (even without exact match) |
|-------|----------------------------------|
| "authentication" | login, credentials, auth, signin, validateUser |
| "database" | query, SQL, connection, ORM, repository |
| "error handling" | try/catch, exception, throw, ErrorBoundary |

## Supported Languages

Python, JavaScript, TypeScript, C, C++, Bash, Go, Java, Kotlin, Rust, Ruby, C#, PHP, Scala, Swift, Lua, Dart, Elixir, Haskell, OCaml, Zig, Perl, CSS, HTML, Vue, JSON, YAML, TOML, Makefile

## Features

- **Semantic Code Search**: Find code by describing what you're looking for
- **24+ Languages**: Python, TypeScript, JavaScript, Go, Rust, Java, C/C++, and more
- **Memory Layer**: Store and recall project context across sessions
- **Incremental Indexing**: Only re-index changed files
- **100% Local**: No API calls, no cloud, works offline
- **GPU Acceleration**: Optional WebGPU/CUDA support

## Requirements

- Node.js >= 20.0.0
- Docker (for ChromaDB - **required**)
- ~500MB disk space for embedding model (downloaded on first run)

## Technical Details

| Component | Technology |
|-----------|------------|
| Embedding Model | `all-MiniLM-L6-v2` (384 dimensions) |
| Model Runtime | `@huggingface/transformers` (ONNX) |
| Vector Database | ChromaDB |
| Code Parser | Tree-sitter |
| MCP SDK | `@modelcontextprotocol/sdk` |

## Development

```bash
npm install           # Install dependencies
npm run dev           # Run with tsx (no build needed)
npm run build         # Compile TypeScript
npm test              # Run tests
```

## License

MIT
