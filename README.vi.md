# Codebaxing

[![npm version](https://img.shields.io/npm/v/codebaxing.svg)](https://www.npmjs.com/package/codebaxing)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

[English](README.md) | **[Tiếng Việt](README.vi.md)**

MCP server cho **semantic code search**. Index codebase một lần, tìm kiếm bằng ngôn ngữ tự nhiên.

## Cách Hoạt Động

```
Code của bạn → Tree-sitter Parser → Symbols → Embedding Model → Vectors → ChromaDB
                                                                             ↓
"tìm logic xác thực" → Embedding → Query Vector → Similarity Search → Kết quả
```

Tìm kiếm truyền thống chỉ match exact text. Codebaxing hiểu ý nghĩa:

| Query | Tìm được (dù không match exact) |
|-------|----------------------------------|
| "authentication" | login(), validateCredentials(), authMiddleware() |
| "database connection" | connectDB(), prismaClient, repository.query() |

## Bắt Đầu Nhanh

### 1. Khởi động ChromaDB

```bash
docker run -d -p 8000:8000 --name chromadb chromadb/chroma
```

### 2. Index Codebase (CLI)

```bash
npx codebaxing@latest index /path/to/your/project
```

Tạo folder `.codebaxing/` chứa index. Chỉ cần làm một lần cho mỗi project.

> **Lưu ý về tốc độ:** Embedding local khá chậm (~4 phút cho ~4,000 files). Để index nhanh hơn, dùng Gemini embedding (miễn phí) — xem phần [Cloud Embedding](#cloud-embedding-nhanh-nhất) bên dưới.

### 3. Cài MCP Server cho AI Editors

```bash
npx codebaxing install              # Claude Desktop
npx codebaxing install --cursor     # Cursor
npx codebaxing install --windsurf   # Windsurf
npx codebaxing install --all        # Tất cả editors
```

Restart editor. Giờ bạn có thể hỏi: *"Tìm logic xác thực người dùng"*

## CLI Commands

| Lệnh | Mô tả |
|------|-------|
| `npx codebaxing@latest index <path>` | Index codebase (**bắt buộc đầu tiên**) |
| `npx codebaxing search <query>` | Tìm kiếm code |
| `npx codebaxing stats [path]` | Xem thống kê index |
| `npx codebaxing clean [path]` | Xóa index (reset) |
| `npx codebaxing install [--editor]` | Cài MCP server |
| `npx codebaxing uninstall [--editor]` | Gỡ MCP server |

> **Tip:** Dùng `@latest` cho `index` để luôn lấy version mới nhất.

### Search Options

```bash
npx codebaxing search "auth middleware" --path ./src --limit 10
```

- `--path, -p` - Đường dẫn codebase (mặc định: thư mục hiện tại)
- `--limit, -n` - Số kết quả (mặc định: 5)

## MCP Tools (cho AI Agents)

Sau khi cài, AI agents có thể dùng các tools:

| Tool | Mô tả |
|------|-------|
| `search` | Tìm kiếm code semantic |
| `stats` | Thống kê index |
| `languages` | Extensions hỗ trợ |
| `remember` | Lưu project memory |
| `recall` | Truy xuất memories |
| `forget` | Xóa memories |

> **Lưu ý:** Tool `index` đã tắt cho AI agents. Dùng CLI: `npx codebaxing@latest index <path>`

## Cấu Hình

### Cloud Embedding (Nhanh nhất)

Embedding local chạy trên CPU và khá chậm cho codebase lớn (~4 phút cho ~4,000 files). Cloud embedding nhanh hơn **~25x** và được khuyến khích cho project từ 1,000+ files.

```bash
# Gemini (MIỄN PHÍ - khuyên dùng, 1500 RPM free tier)
CODEBAXING_EMBEDDING_PROVIDER=gemini GEMINI_API_KEY=... npx codebaxing@latest index /path

# OpenAI (text-embedding-3-small, 384 dims)
CODEBAXING_EMBEDDING_PROVIDER=openai OPENAI_API_KEY=sk-... npx codebaxing@latest index /path

# Voyage (voyage-code-3, 1024 dims, tối ưu cho code)
CODEBAXING_EMBEDDING_PROVIDER=voyage VOYAGE_API_KEY=va-... npx codebaxing@latest index /path
```

| Provider | Model | Tốc độ | Chi phí |
|----------|-------|--------|---------|
| **Gemini** | `text-embedding-004` (768 dims) | ~10,000 texts/s | Miễn phí (1500 RPM) |
| **OpenAI** | `text-embedding-3-small` (384 dims) | ~10,000 texts/s | ~$0.02 / 1M tokens |
| **Voyage** | `voyage-code-3` (1024 dims) | ~10,000 texts/s | ~$0.06 / 1M tokens |
| **Local** | `all-MiniLM-L6-v2` (384 dims) | ~200 texts/s | Miễn phí (CPU) |

> **Lưu ý:** Chuyển đổi giữa các provider cần re-index (`npx codebaxing@latest index <path>`) do khác dimension.

### Biến Môi Trường

| Biến | Mô tả | Mặc định |
|------|-------|----------|
| `CHROMADB_URL` | URL ChromaDB server | `http://localhost:8000` |
| `CODEBAXING_EMBEDDING_PROVIDER` | Backend embedding: `local`, `gemini`, `openai`, `voyage` | `local` |
| `CODEBAXING_DEVICE` | Compute device (chỉ local): `cpu`, `cuda` | `cpu` |
| `CODEBAXING_DTYPE` | Quantization (chỉ local): `fp32`, `fp16`, `q8`, `q4` | `q8` |
| `CODEBAXING_WORKERS` | Worker threads cho embedding (chỉ local, 0=tắt) | `2` |
| `CODEBAXING_MAX_FILE_SIZE` | Kích thước file tối đa (MB) | `1` |
| `CODEBAXING_MAX_CHUNKS` | Số chunks tối đa | `500000` |
| `CODEBAXING_FILES_PER_BATCH` | Files mỗi batch (thấp = ít RAM) | `100` |
| `CODEBAXING_PARALLEL_BATCHES` | Số batches chạy song song | `3` |
| `CODEBAXING_METADATA_SAVE_INTERVAL` | Lưu tiến trình mỗi N batches | `10` |
| `CODEBAXING_OPENAI_API_KEY` | OpenAI API key (hoặc dùng `OPENAI_API_KEY`) | - |
| `CODEBAXING_VOYAGE_API_KEY` | Voyage API key (hoặc dùng `VOYAGE_API_KEY`) | - |
| `CODEBAXING_GEMINI_API_KEY` | Gemini API key (hoặc dùng `GEMINI_API_KEY`) | - |
| `CODEBAXING_EMBEDDING_MODEL` | Override tên model embedding | mặc định theo provider |
| `CODEBAXING_EMBEDDING_DIMENSIONS` | Override số dimensions | mặc định theo provider |

### Cấu Hình Editor Thủ Công

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
<summary>Editors Khác</summary>

**Windsurf:** `~/.codeium/windsurf/mcp_config.json`
**Zed:** `~/.config/zed/settings.json` (dùng key `context_servers`)
**VS Code + Continue:** `~/.continue/config.json`

</details>

## Ngôn Ngữ Hỗ Trợ

Python, JavaScript, TypeScript, Go, Rust, Java, C/C++, C#, Ruby, PHP, Kotlin, Swift, Scala, Lua, Dart, Elixir, Haskell, OCaml, Zig, Perl, Bash, HTML, CSS, Vue, JSON, YAML, TOML, Makefile

## Yêu Cầu

- Node.js >= 20.0.0
- Docker (cho ChromaDB)
- ~500MB dung lượng đĩa (embedding model)

## Chi Tiết Kỹ Thuật

| Component | Công nghệ |
|-----------|-----------|
| Local Embedding | `all-MiniLM-L6-v2` (384 dims, ONNX, q8 quantized) |
| Cloud Embedding | Gemini `text-embedding-004` (miễn phí), OpenAI, hoặc Voyage |
| Vector Database | ChromaDB |
| Code Parser | Tree-sitter (28 ngôn ngữ) |
| MCP SDK | `@modelcontextprotocol/sdk` |

**Local mode**: Model tải từ HuggingFace lần đầu, cache tại `~/.cache/codebaxing/models/`. Dùng q8 quantization (~3x nhanh hơn fp32). Không cần mạng sau lần đầu.

**Cloud mode**: Gửi code chunks đến OpenAI/Voyage API. ~25x nhanh hơn local CPU. Cần API key.

## License

MIT
