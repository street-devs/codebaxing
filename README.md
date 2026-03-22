# Codebaxing

[![npm version](https://img.shields.io/npm/v/codebaxing.svg)](https://www.npmjs.com/package/codebaxing)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

**[English](README.md)** | [Tiếng Việt](README.vi.md)

MCP server for **semantic code search**. Index your codebase and search using natural language queries.

## Table of Contents

- [The Idea](#the-idea)
- [Quick Start](#quick-start)
- [Usage](#usage)
  - [Via AI Agents (MCP)](#via-ai-agents-mcp)
  - [Via CLI (Terminal)](#via-cli-terminal)
- [Installation](#installation)
- [How It Works](#how-it-works)
- [Configuration](#configuration)
- [Supported Languages](#supported-languages)

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

### 1. Install to your AI editor

```bash
npx codebaxing install              # Claude Desktop
npx codebaxing install --cursor     # Cursor
npx codebaxing install --windsurf   # Windsurf
npx codebaxing install --all        # All editors
```

### 2. Restart your editor

### 3. Start using

In Claude Desktop (or Cursor, Windsurf...):

```
You: Index my project at /path/to/myproject
Claude: [calls index tool]

You: Find the authentication logic
Claude: [calls search tool, returns relevant code]
```

## Usage

### Via AI Agents (MCP)

After installing to your AI editor, you interact through natural conversation:

#### Step 1: Index your codebase (Required first)

```
You: Index the codebase at /Users/me/projects/myapp
```

Claude will call `index(path="/Users/me/projects/myapp")` and show progress.

> **Note:** First run downloads the embedding model (~90MB), takes 1-2 minutes.

#### Step 2: Search for code

```
You: Find code that handles user authentication
You: Where is the database connection logic?
You: Show me error handling patterns
```

#### Step 3: Use memory (optional)

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

You can use Codebaxing directly from terminal without AI agents:

#### Step 1: Index your codebase (Required first)

```bash
npx codebaxing index /path/to/project
```

Output:
```
🔧 Codebaxing - Index Codebase

📁 Path: /path/to/project

================================================================================
INDEXING CODEBASE
================================================================================
Found 47 files
Parsed 645 symbols from 47 files
Generating embeddings for 645 chunks...
Model loaded: Xenova/all-MiniLM-L6-v2 (384 dims, CPU)

================================================================================
INDEXING COMPLETE
================================================================================
Files parsed:      47
Symbols extracted: 645
Chunks created:    645
Time elapsed:      21.9s
```

#### Step 2: Search for code

```bash
npx codebaxing search "authentication middleware"
npx codebaxing search "database connection" --path ./src --limit 10
```

Output:
```
🔧 Codebaxing - Search

📁 Path:  /path/to/project
🔍 Query: "authentication middleware"
📊 Limit: 5

────────────────────────────────────────────────────────────
Results:

1. src/middleware/auth.ts:15 - authMiddleware()
2. src/services/auth.ts:42 - validateToken()
3. src/routes/login.ts:8 - loginHandler()

────────────────────────────────────────────────────────────
```

#### Step 3: Check statistics

```bash
npx codebaxing stats /path/to/project
```

#### CLI Commands Reference

| Command | Description |
|---------|-------------|
| `npx codebaxing install [--editor]` | Install MCP server to AI editor |
| `npx codebaxing uninstall [--editor]` | Uninstall MCP server |
| `npx codebaxing index <path>` | Index a codebase |
| `npx codebaxing search <query> [options]` | Search indexed codebase |
| `npx codebaxing stats [path]` | Show index statistics |
| `npx codebaxing --help` | Show help |

**Search options:**
- `--path, -p <path>` - Codebase path (default: current directory)
- `--limit, -n <number>` - Number of results (default: 5)

## Installation

### Option 1: Quick Install (Recommended)

```bash
npx codebaxing install              # Claude Desktop (default)
npx codebaxing install --cursor     # Cursor
npx codebaxing install --windsurf   # Windsurf (Codeium)
npx codebaxing install --zed        # Zed
npx codebaxing install --all        # All supported editors
```

Then restart your editor.

### Option 2: Manual Configuration

#### Claude Desktop

Add to `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS) or `%APPDATA%\Claude\claude_desktop_config.json` (Windows):

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

#### Cursor

Add to `~/.cursor/mcp.json`:

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

#### Windsurf

Add to `~/.codeium/windsurf/mcp_config.json`:

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

#### Zed

Add to `~/.config/zed/settings.json`:

```json
{
  "context_servers": {
    "codebaxing": {
      "command": {
        "path": "npx",
        "args": ["-y", "codebaxing"]
      }
    }
  }
}
```

#### VS Code + Continue

Add to `~/.continue/config.json`:

```json
{
  "experimental": {
    "modelContextProtocolServers": [
      {
        "transport": {
          "type": "stdio",
          "command": "npx",
          "args": ["-y", "codebaxing"]
        }
      }
    ]
  }
}
```

### Uninstall

```bash
npx codebaxing uninstall            # Claude Desktop
npx codebaxing uninstall --all      # All editors
```

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

┌─────────────────────────────────────────────────────────────────┐
│                          SEARCH                                 │
├─────────────────────────────────────────────────────────────────┤
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
└─────────────────────────────────────────────────────────────────┘
```

### Why Semantic Search Works

The embedding model understands that:

| Query | Finds (even without exact match) |
|-------|----------------------------------|
| "authentication" | login, credentials, auth, signin, validateUser |
| "database" | query, SQL, connection, ORM, repository |
| "error handling" | try/catch, exception, throw, ErrorBoundary |

## Configuration

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `CHROMADB_URL` | ChromaDB server URL for persistent storage | (in-memory) |
| `CODEBAXING_DEVICE` | Compute device: `cpu`, `webgpu`, `cuda`, `auto` | `cpu` |
| `CODEBAXING_MAX_FILE_SIZE` | Max file size to index (in MB) | `1` |

### Persistent Storage

By default, the index is stored in memory and lost when the server restarts.

For persistent storage:

```bash
# Start ChromaDB
docker run -d -p 8000:8000 chromadb/chroma

# Set environment variable
export CHROMADB_URL=http://localhost:8000
```

Or in MCP config:

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

### GPU Acceleration

```bash
export CODEBAXING_DEVICE=webgpu  # macOS (Metal)
export CODEBAXING_DEVICE=cuda    # Linux/Windows (NVIDIA)
export CODEBAXING_DEVICE=auto    # Auto-detect
```

**Note:** macOS does not support CUDA. Use `webgpu` for GPU acceleration on Mac.

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
