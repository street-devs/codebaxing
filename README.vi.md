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

### 3. Cài MCP Server cho AI Editors

```bash
npx codebaxing@latest install              # Claude Desktop
npx codebaxing@latest install --cursor     # Cursor
npx codebaxing@latest install --windsurf   # Windsurf
npx codebaxing@latest install --all        # Tất cả editors
```

Restart editor. Giờ bạn có thể hỏi: *"Tìm logic xác thực người dùng"*

## CLI Commands

| Lệnh | Mô tả |
|------|-------|
| `npx codebaxing@latest index <path>` | Index codebase (**bắt buộc đầu tiên**) |
| `npx codebaxing@latest search <query>` | Tìm kiếm code |
| `npx codebaxing@latest stats [path]` | Xem thống kê index |
| `npx codebaxing@latest install [--editor]` | Cài MCP server |
| `npx codebaxing@latest uninstall [--editor]` | Gỡ MCP server |

> **Tip:** Dùng `@latest` để luôn lấy version mới nhất.

### Search Options

```bash
npx codebaxing@latest search "auth middleware" --path ./src --limit 10
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

### Biến Môi Trường

| Biến | Mô tả | Mặc định |
|------|-------|----------|
| `CHROMADB_URL` | URL ChromaDB server | `http://localhost:8000` |
| `CODEBAXING_DEVICE` | Compute: `cpu`, `webgpu`, `cuda` | `cpu` |
| `CODEBAXING_MAX_FILE_SIZE` | Kích thước file tối đa (MB) | `1` |
| `CODEBAXING_MAX_CHUNKS` | Số chunks tối đa | `100000` |
| `CODEBAXING_FILES_PER_BATCH` | Files mỗi batch (thấp = ít RAM) | `50` |

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
| Embedding Model | `all-MiniLM-L6-v2` (384 dimensions) |
| Vector Database | ChromaDB |
| Code Parser | Tree-sitter |
| MCP SDK | `@modelcontextprotocol/sdk` |

## License

MIT
