# Codebaxing

[![npm version](https://img.shields.io/npm/v/codebaxing.svg)](https://www.npmjs.com/package/codebaxing)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

[English](README.md) | **[Tiếng Việt](README.vi.md)**

MCP server cho **semantic code search**. Index codebase và tìm kiếm bằng ngôn ngữ tự nhiên.

## Mục lục

- [Ý tưởng](#ý-tưởng)
- [Bắt đầu nhanh](#bắt-đầu-nhanh)
- [Cài đặt](#cài-đặt)
- [Cách sử dụng](#cách-sử-dụng)
- [Cấu hình](#cấu-hình)
- [Cơ chế hoạt động](#cơ-chế-hoạt-động)

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

### Bước 1: Khởi động ChromaDB (Bắt buộc)

ChromaDB là **bắt buộc** để lưu trữ index. Khởi động với Docker:

```bash
docker run -d -p 8000:8000 --name chromadb chromadb/chroma

# Kiểm tra đang chạy
curl http://localhost:8000/api/v2/heartbeat
```

### Bước 2: Cài vào Editor

```bash
npx codebaxing install              # Claude Desktop
npx codebaxing install --cursor     # Cursor
npx codebaxing install --windsurf   # Windsurf
npx codebaxing install --all        # Tất cả editors
```

### Bước 3: Khởi động lại Editor và Sử dụng

Khởi động lại editor, sau đó hỏi: *"Index project của tôi tại /path/to/myproject"*

### Cho CLI (Terminal)

```bash
# Set biến môi trường (thêm vào ~/.bashrc hoặc ~/.zshrc)
export CHROMADB_URL=http://localhost:8000

# Index và tìm kiếm
npx codebaxing index /path/to/project
npx codebaxing search "authentication logic"
```

## Cài đặt

### Bước 1: Khởi động ChromaDB (Bắt buộc)

ChromaDB là **bắt buộc** để lưu trữ code index. Không có nó, Codebaxing sẽ không hoạt động.

```bash
# Khởi động ChromaDB với Docker
docker run -d -p 8000:8000 --name chromadb chromadb/chroma

# Kiểm tra đang chạy
curl http://localhost:8000/api/v2/heartbeat
# Sẽ trả về: {"nanosecond heartbeat":...}
```

**Mẹo:** Thêm vào system startup hoặc dùng Docker Compose để tự động khởi động.

### Bước 2: Cài vào AI Editor

```bash
npx codebaxing install              # Claude Desktop (mặc định)
npx codebaxing install --cursor     # Cursor
npx codebaxing install --windsurf   # Windsurf (Codeium)
npx codebaxing install --zed        # Zed
npx codebaxing install --all        # Tất cả editors
```

Installer tự động cấu hình `CHROMADB_URL=http://localhost:8000` trong editor của bạn.

### Bước 3: Khởi động lại Editor

Các tools Codebaxing đã sẵn sàng!

### Gỡ cài đặt

```bash
npx codebaxing uninstall            # Claude Desktop
npx codebaxing uninstall --all      # Tất cả editors
```

## Cách sử dụng

### Qua AI Agents (Claude Desktop, Cursor, v.v.)

Sau khi cài đặt, tương tác qua hội thoại tự nhiên:

#### 1. Index codebase (Bắt buộc đầu tiên)

```
Bạn: Index codebase tại /Users/me/projects/myapp
```

> **Lưu ý:** Lần đầu chạy sẽ download embedding model (~90MB), mất 1-2 phút.

#### 2. Tìm kiếm code

```
Bạn: Tìm code xử lý xác thực người dùng
Bạn: Logic kết nối database ở đâu?
Bạn: Cho tôi xem patterns xử lý lỗi
```

#### 3. Sử dụng memory (tùy chọn)

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

Các lệnh CLI **yêu cầu ChromaDB** đang chạy. Xem [Setup ChromaDB](#bước-2-tùy-chọn-setup-chromadb-cho-lưu-trữ-vĩnh-viễn).

#### Yêu cầu

```bash
# Khởi động ChromaDB
docker run -d -p 8000:8000 --name chromadb chromadb/chroma

# Set biến môi trường (thêm vào ~/.bashrc hoặc ~/.zshrc)
export CHROMADB_URL=http://localhost:8000
```

#### Các lệnh

```bash
# Index codebase
npx codebaxing index /path/to/project

# Tìm kiếm code
npx codebaxing search "authentication middleware"
npx codebaxing search "database connection" --path ./src --limit 10

# Xem thống kê index
npx codebaxing stats /path/to/project

# Xem help
npx codebaxing --help
```

#### Bảng tham chiếu CLI

| Lệnh | Mô tả |
|------|-------|
| `npx codebaxing install [--editor]` | Cài MCP server vào AI editor |
| `npx codebaxing uninstall [--editor]` | Gỡ MCP server |
| `npx codebaxing index <path>` | Index codebase |
| `npx codebaxing search <query> [options]` | Tìm kiếm codebase đã index |
| `npx codebaxing stats [path]` | Hiển thị thống kê index |

**Search options:**
- `--path, -p <path>` - Đường dẫn codebase (mặc định: thư mục hiện tại)
- `--limit, -n <number>` - Số kết quả (mặc định: 5)

## Cấu hình

### Biến môi trường

| Biến | Mô tả | Mặc định |
|------|-------|----------|
| `CHROMADB_URL` | URL ChromaDB server (**bắt buộc**) | - |
| `CODEBAXING_DEVICE` | Thiết bị tính toán: `cpu`, `webgpu`, `cuda`, `auto` | `cpu` |
| `CODEBAXING_MAX_FILE_SIZE` | Kích thước file tối đa để index (MB) | `1` |

### Tăng tốc GPU

```bash
export CODEBAXING_DEVICE=webgpu  # macOS (Metal)
export CODEBAXING_DEVICE=cuda    # Linux/Windows (NVIDIA)
export CODEBAXING_DEVICE=auto    # Tự động detect
```

**Lưu ý:** macOS không hỗ trợ CUDA. Dùng `webgpu` để tăng tốc trên Mac.

### Cấu hình thủ công cho Editors

Nếu bạn muốn cấu hình thủ công thay vì dùng `npx codebaxing install`:

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
```

### Tại sao Semantic Search hoạt động

Embedding model hiểu rằng:

| Query | Tìm được (dù không match exact) |
|-------|----------------------------------|
| "authentication" | login, credentials, auth, signin, validateUser |
| "database" | query, SQL, connection, ORM, repository |
| "error handling" | try/catch, exception, throw, ErrorBoundary |

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
- Docker (cho ChromaDB - **bắt buộc**)
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
