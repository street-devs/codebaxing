# Codebaxing

[![npm version](https://img.shields.io/npm/v/codebaxing.svg)](https://www.npmjs.com/package/codebaxing)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

[English](README.md) | **[Tiếng Việt](README.vi.md)**

MCP server cho **semantic code search**. Index codebase và tìm kiếm bằng ngôn ngữ tự nhiên.

## Mục lục

- [Ý tưởng](#ý-tưởng)
- [Bắt đầu nhanh](#bắt-đầu-nhanh)
- [Cách sử dụng](#cách-sử-dụng)
  - [Qua AI Agents (MCP)](#qua-ai-agents-mcp)
  - [Qua CLI (Terminal)](#qua-cli-terminal)
- [Cài đặt](#cài-đặt)
- [Cơ chế hoạt động](#cơ-chế-hoạt-động)
- [Cấu hình](#cấu-hình)
- [Ngôn ngữ hỗ trợ](#ngôn-ngữ-hỗ-trợ)

## Ý tưởng

Tìm kiếm code truyền thống (grep, ripgrep) chỉ match exact text. Nhưng lập trình viên suy nghĩ theo khái niệm:

- *"Logic xác thực người dùng ở đâu?"* - không phải `grep "authentication"`
- *"Tìm code kết nối database"* - không phải `grep "database"`

**Codebaxing** giải quyết vấn đề này bằng **semantic search**:

```
Query: "user authentication"
         ↓
Tìm được: login(), validateCredentials(), checkPassword(), authMiddleware()
          (dù chúng không chứa từ "authentication")
```

## Bắt đầu nhanh

### 1. Cài vào AI editor của bạn

```bash
npx codebaxing install              # Claude Desktop
npx codebaxing install --cursor     # Cursor
npx codebaxing install --windsurf   # Windsurf
npx codebaxing install --all        # Tất cả editors
```

### 2. Khởi động lại editor

### 3. Bắt đầu sử dụng

Trong Claude Desktop (hoặc Cursor, Windsurf...):

```
Bạn: Index project của tôi tại /path/to/myproject
Claude: [gọi index tool]

Bạn: Tìm logic xác thực
Claude: [gọi search tool, trả về code liên quan]
```

## Cách sử dụng

### Qua AI Agents (MCP)

Sau khi cài vào AI editor, bạn tương tác qua hội thoại tự nhiên:

#### Bước 1: Index codebase (Bắt buộc đầu tiên)

```
Bạn: Index codebase tại /Users/me/projects/myapp
```

Claude sẽ gọi `index(path="/Users/me/projects/myapp")` và hiển thị tiến trình.

> **Lưu ý:** Lần đầu chạy sẽ download embedding model (~90MB), mất 1-2 phút.

#### Bước 2: Tìm kiếm code

```
Bạn: Tìm code xử lý xác thực người dùng
Bạn: Logic kết nối database ở đâu?
Bạn: Cho tôi xem patterns xử lý lỗi
```

#### Bước 3: Sử dụng memory (tùy chọn)

```
Bạn: Ghi nhớ rằng chúng ta dùng PostgreSQL với Prisma ORM
Bạn: Những quyết định nào đã được đưa ra về database?
```

#### Bảng tham chiếu MCP Tools

| Tool | Mô tả | Ví dụ |
|------|-------|-------|
| `index` | Index codebase (**bắt buộc đầu tiên**) | `index(path="/project")` |
| `search` | Tìm kiếm code semantic | `search(question="auth middleware")` |
| `stats` | Thống kê index | `stats()` |
| `languages` | Extensions hỗ trợ | `languages()` |
| `remember` | Lưu memory | `remember(content="Dùng Redis", memory_type="decision")` |
| `recall` | Truy xuất memories | `recall(query="database")` |
| `forget` | Xóa memories | `forget(memory_type="note")` |
| `memory-stats` | Thống kê memory | `memory-stats()` |

### Qua CLI (Terminal)

Bạn có thể dùng Codebaxing trực tiếp từ terminal mà không cần AI agents:

#### Bước 1: Index codebase (Bắt buộc đầu tiên)

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

#### Bước 2: Tìm kiếm code

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

#### Bước 3: Xem thống kê

```bash
npx codebaxing stats /path/to/project
```

#### Bảng tham chiếu CLI Commands

| Command | Mô tả |
|---------|-------|
| `npx codebaxing install [--editor]` | Cài MCP server vào AI editor |
| `npx codebaxing uninstall [--editor]` | Gỡ MCP server |
| `npx codebaxing index <path>` | Index codebase |
| `npx codebaxing search <query> [options]` | Tìm kiếm codebase đã index |
| `npx codebaxing stats [path]` | Hiển thị thống kê index |
| `npx codebaxing --help` | Hiển thị help |

**Search options:**
- `--path, -p <path>` - Đường dẫn codebase (mặc định: thư mục hiện tại)
- `--limit, -n <number>` - Số kết quả (mặc định: 5)

## Cài đặt

### Cách 1: Cài nhanh (Khuyến nghị)

```bash
npx codebaxing install              # Claude Desktop (mặc định)
npx codebaxing install --cursor     # Cursor
npx codebaxing install --windsurf   # Windsurf (Codeium)
npx codebaxing install --zed        # Zed
npx codebaxing install --all        # Tất cả editors
```

Sau đó restart editor.

### Cách 2: Cấu hình thủ công

#### Claude Desktop

Thêm vào `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS) hoặc `%APPDATA%\Claude\claude_desktop_config.json` (Windows):

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

Thêm vào `~/.cursor/mcp.json`:

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

Thêm vào `~/.codeium/windsurf/mcp_config.json`:

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

Thêm vào `~/.config/zed/settings.json`:

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

Thêm vào `~/.continue/config.json`:

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

### Gỡ cài đặt

```bash
npx codebaxing uninstall            # Claude Desktop
npx codebaxing uninstall --all      # Tất cả editors
```

## Cơ chế hoạt động

### Kiến trúc

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
│                        Classes, etc.        (384 chiều)         │
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

### Tại sao Semantic Search hoạt động

Embedding model hiểu rằng:

| Query | Tìm được (dù không match exact) |
|-------|----------------------------------|
| "authentication" | login, credentials, auth, signin, validateUser |
| "database" | query, SQL, connection, ORM, repository |
| "error handling" | try/catch, exception, throw, ErrorBoundary |

## Cấu hình

### Biến môi trường

| Biến | Mô tả | Mặc định |
|------|-------|----------|
| `CHROMADB_URL` | URL ChromaDB server để lưu trữ vĩnh viễn | (in-memory) |
| `CODEBAXING_DEVICE` | Thiết bị tính toán: `cpu`, `webgpu`, `cuda`, `auto` | `cpu` |
| `CODEBAXING_MAX_FILE_SIZE` | Kích thước file tối đa để index (MB) | `1` |

### Lưu trữ vĩnh viễn

Mặc định, index được lưu trong memory và mất khi server restart.

Để lưu trữ vĩnh viễn:

```bash
# Khởi động ChromaDB
docker run -d -p 8000:8000 chromadb/chroma

# Set biến môi trường
export CHROMADB_URL=http://localhost:8000
```

Hoặc trong MCP config:

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

### Tăng tốc GPU

```bash
export CODEBAXING_DEVICE=webgpu  # macOS (Metal)
export CODEBAXING_DEVICE=cuda    # Linux/Windows (NVIDIA)
export CODEBAXING_DEVICE=auto    # Tự động detect
```

**Lưu ý:** macOS không hỗ trợ CUDA. Dùng `webgpu` để tăng tốc trên Mac.

## Ngôn ngữ hỗ trợ

Python, JavaScript, TypeScript, C, C++, Bash, Go, Java, Kotlin, Rust, Ruby, C#, PHP, Scala, Swift, Lua, Dart, Elixir, Haskell, OCaml, Zig, Perl, CSS, HTML, Vue, JSON, YAML, TOML, Makefile

## Tính năng

- **Semantic Code Search**: Tìm code bằng cách mô tả những gì bạn cần
- **24+ Ngôn ngữ**: Python, TypeScript, JavaScript, Go, Rust, Java, C/C++, và nhiều hơn nữa
- **Memory Layer**: Lưu trữ và truy xuất context dự án qua các session
- **Incremental Indexing**: Chỉ re-index các file đã thay đổi
- **100% Local**: Không gọi API, không cloud, hoạt động offline
- **GPU Acceleration**: Hỗ trợ WebGPU/CUDA tùy chọn

## Yêu cầu

- Node.js >= 20.0.0
- ~500MB dung lượng đĩa cho embedding model (tải xuống lần chạy đầu tiên)

## Chi tiết kỹ thuật

| Component | Công nghệ |
|-----------|-----------|
| Embedding Model | `all-MiniLM-L6-v2` (384 chiều) |
| Model Runtime | `@huggingface/transformers` (ONNX) |
| Vector Database | ChromaDB |
| Code Parser | Tree-sitter |
| MCP SDK | `@modelcontextprotocol/sdk` |

## Development

```bash
npm install           # Cài dependencies
npm run dev           # Chạy với tsx (không cần build)
npm run build         # Compile TypeScript
npm test              # Chạy tests
```

## License

MIT
