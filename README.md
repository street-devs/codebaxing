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

> **Performance note:** Local embedding is slow (~4 min for ~4,000 files). For faster indexing, use Gemini embedding (free) — see [Cloud Embedding](#cloud-embedding-fastest) below.

### 3. Install MCP Server for AI Editors

```bash
npx codebaxing install              # Claude Desktop
npx codebaxing install --cursor     # Cursor
npx codebaxing install --windsurf   # Windsurf
npx codebaxing install --all        # All editors
```

Restart your editor. Now you can ask: *"Find the authentication logic"*

## CLI Commands

| Command | Description |
|---------|-------------|
| `npx codebaxing@latest index <path>` | Index a codebase (**required first**) |
| `npx codebaxing search <query>` | Search indexed code |
| `npx codebaxing stats [path]` | Show index statistics |
| `npx codebaxing clean [path]` | Remove index (reset) |
| `npx codebaxing install [--editor]` | Install MCP server |
| `npx codebaxing uninstall [--editor]` | Uninstall MCP server |

> **Tip:** Use `@latest` for `index` to ensure you have the newest version.

### Search Options

```bash
npx codebaxing search "auth middleware" --path ./src --limit 10
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

### Cloud Embedding (Fastest)

Local embedding runs on CPU and can be slow for large codebases (~4 min for ~4,000 files). Cloud embedding is **~25x faster** and recommended for any project with 1,000+ files.

```bash
# Gemini (FREE - recommended, 1500 RPM free tier)
CODEBAXING_EMBEDDING_PROVIDER=gemini GEMINI_API_KEY=... npx codebaxing@latest index /path

# OpenAI (text-embedding-3-small, 384 dims)
CODEBAXING_EMBEDDING_PROVIDER=openai OPENAI_API_KEY=sk-... npx codebaxing@latest index /path

# Voyage (voyage-code-3, 1024 dims, code-optimized)
CODEBAXING_EMBEDDING_PROVIDER=voyage VOYAGE_API_KEY=va-... npx codebaxing@latest index /path
```

| Provider | Model | Speed | Cost |
|----------|-------|-------|------|
| **Gemini** | `text-embedding-004` (768 dims) | ~10,000 texts/sec | Free (1500 RPM) |
| **OpenAI** | `text-embedding-3-small` (384 dims) | ~10,000 texts/sec | ~$0.02 / 1M tokens |
| **Voyage** | `voyage-code-3` (1024 dims) | ~10,000 texts/sec | ~$0.06 / 1M tokens |
| **Local** | `all-MiniLM-L6-v2` (384 dims) | ~200 texts/sec | Free (CPU) |

> **Note:** Switching between providers requires full re-index (`npx codebaxing@latest index <path>`) due to dimension differences.

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `CHROMADB_URL` | ChromaDB server URL | `http://localhost:8000` |
| `CODEBAXING_EMBEDDING_PROVIDER` | Embedding backend: `local`, `gemini`, `openai`, `voyage` | `local` |
| `CODEBAXING_DEVICE` | Compute device (local only): `cpu`, `cuda` | `cpu` |
| `CODEBAXING_DTYPE` | Model quantization (local only): `fp32`, `fp16`, `q8`, `q4` | `q8` |
| `CODEBAXING_WORKERS` | Worker threads for parallel embedding (local only, 0=off) | `2` |
| `CODEBAXING_MAX_FILE_SIZE` | Max file size in MB | `1` |
| `CODEBAXING_MAX_CHUNKS` | Max chunks to index | `500000` |
| `CODEBAXING_FILES_PER_BATCH` | Files per batch (lower = less RAM) | `100` |
| `CODEBAXING_PARALLEL_BATCHES` | Concurrent batches | `3` |
| `CODEBAXING_METADATA_SAVE_INTERVAL` | Save progress every N batches | `10` |
| `CODEBAXING_MODEL_CACHE` | Model cache directory (local only) | `~/.cache/codebaxing/models` |
| `CODEBAXING_OPENAI_API_KEY` | OpenAI API key (or use `OPENAI_API_KEY`) | - |
| `CODEBAXING_VOYAGE_API_KEY` | Voyage API key (or use `VOYAGE_API_KEY`) | - |
| `CODEBAXING_GEMINI_API_KEY` | Gemini API key (or use `GEMINI_API_KEY`) | - |
| `CODEBAXING_EMBEDDING_MODEL` | Override embedding model name | per-provider default |
| `CODEBAXING_EMBEDDING_DIMENSIONS` | Override embedding dimensions | per-provider default |
| `CODEBAXING_EMBEDDING_BASE_URL` | Custom API endpoint for cloud providers | provider default |

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
| Local Embedding | `all-MiniLM-L6-v2` (384 dims, ONNX, q8 quantized) |
| Cloud Embedding | Gemini `text-embedding-004` (free), OpenAI, or Voyage |
| Model Cache | `~/.cache/codebaxing/models/` (local only, downloaded once) |
| Vector Database | ChromaDB |
| Code Parser | Tree-sitter (28 languages) |
| MCP SDK | `@modelcontextprotocol/sdk` |

**Local mode**: The embedding model is downloaded from HuggingFace on first run and cached at `~/.cache/codebaxing/models/`. Uses q8 quantization (~3x faster than fp32). No network access after initial download.

**Cloud mode**: Sends code chunks to OpenAI/Voyage API for embedding. ~25x faster than local CPU. Requires API key.

## License

MIT
