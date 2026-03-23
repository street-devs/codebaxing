# Codebaxing

[![npm version](https://img.shields.io/npm/v/codebaxing.svg)](https://www.npmjs.com/package/codebaxing)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

**[English](README.md)** | [Tiếng Việt](README.vi.md)

MCP server for **semantic code search**. Index your codebase once, then search using natural language.

## How It Works

```
Your Code → Tree-sitter Parser → Symbols → Embedding Model → Vectors → ChromaDB
                                                                           ↓
"find auth logic" → Embedding → Query Vector → Similarity Search → Results
```

Traditional search matches exact text. Codebaxing understands meaning:

| Query | Finds (even without exact match) |
|-------|----------------------------------|
| "authentication" | login(), validateCredentials(), authMiddleware() |
| "database connection" | connectDB(), prismaClient, repository.query() |

## Quick Start

### 1. Start ChromaDB

```bash
docker run -d -p 8000:8000 --name chromadb chromadb/chroma
```

### 2. Index Your Codebase (CLI)

```bash
npx codebaxing@latest index /path/to/your/project
```

This creates a `.codebaxing/` folder with the index. Only needs to be done once per project.

### 3. Install MCP Server for AI Editors

```bash
npx codebaxing@latest install              # Claude Desktop
npx codebaxing@latest install --cursor     # Cursor
npx codebaxing@latest install --windsurf   # Windsurf
npx codebaxing@latest install --all        # All editors
```

Restart your editor. Now you can ask: *"Find the authentication logic"*

## CLI Commands

| Command | Description |
|---------|-------------|
| `npx codebaxing@latest index <path>` | Index a codebase (**required first**) |
| `npx codebaxing@latest search <query>` | Search indexed code |
| `npx codebaxing@latest stats [path]` | Show index statistics |
| `npx codebaxing@latest install [--editor]` | Install MCP server |
| `npx codebaxing@latest uninstall [--editor]` | Uninstall MCP server |

> **Tip:** Use `@latest` to always get the newest version.

### Search Options

```bash
npx codebaxing@latest search "auth middleware" --path ./src --limit 10
```

- `--path, -p` - Codebase path (default: current directory)
- `--limit, -n` - Number of results (default: 5)

## MCP Tools (for AI Agents)

After installing, AI agents can use these tools:

| Tool | Description |
|------|-------------|
| `search` | Semantic code search |
| `stats` | Index statistics |
| `languages` | Supported file extensions |
| `remember` | Store project memory |
| `recall` | Retrieve memories |
| `forget` | Delete memories |

> **Note:** The `index` tool is disabled for AI agents. Use CLI: `npx codebaxing@latest index <path>`

## Configuration

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `CHROMADB_URL` | ChromaDB server URL | `http://localhost:8000` |
| `CODEBAXING_DEVICE` | Compute: `cpu`, `webgpu`, `cuda` | `cpu` |
| `CODEBAXING_MAX_FILE_SIZE` | Max file size in MB | `1` |
| `CODEBAXING_MAX_CHUNKS` | Max chunks to index | `100000` |
| `CODEBAXING_FILES_PER_BATCH` | Files per batch (lower = less RAM) | `50` |

### Manual Editor Config

<details>
<summary>Claude Desktop</summary>

`~/Library/Application Support/Claude/claude_desktop_config.json`

```json
{
  "mcpServers": {
    "codebaxing": {
      "command": "npx",
      "args": ["-y", "codebaxing"],
      "env": { "CHROMADB_URL": "http://localhost:8000" }
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
      "env": { "CHROMADB_URL": "http://localhost:8000" }
    }
  }
}
```
</details>

<details>
<summary>Other Editors</summary>

**Windsurf:** `~/.codeium/windsurf/mcp_config.json`
**Zed:** `~/.config/zed/settings.json` (use `context_servers` key)
**VS Code + Continue:** `~/.continue/config.json`

</details>

## Supported Languages

Python, JavaScript, TypeScript, Go, Rust, Java, C/C++, C#, Ruby, PHP, Kotlin, Swift, Scala, Lua, Dart, Elixir, Haskell, OCaml, Zig, Perl, Bash, HTML, CSS, Vue, JSON, YAML, TOML, Makefile

## Requirements

- Node.js >= 20.0.0
- Docker (for ChromaDB)
- ~500MB disk space (embedding model)

## Technical Details

| Component | Technology |
|-----------|------------|
| Embedding Model | `all-MiniLM-L6-v2` (384 dimensions) |
| Vector Database | ChromaDB |
| Code Parser | Tree-sitter |
| MCP SDK | `@modelcontextprotocol/sdk` |

## License

MIT
