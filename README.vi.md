# Codebaxing

MCP server cho **semantic code search**. Index codebase và tìm kiếm bằng ngôn ngữ tự nhiên.

## Ý tưởng

Tìm kiếm code truyền thống (grep, ripgrep) chỉ match exact text. Nhưng lập trình viên suy nghĩ theo khái niệm:

- *"Logic xác thực người dùng ở đâu?"* - không phải `grep "authentication"`
- *"Tìm code kết nối database"* - không phải `grep "database"`
- *"Xử lý lỗi hoạt động như thế nào?"* - không phải `grep "error"`

**Codebaxing** giải quyết vấn đề này bằng **semantic search**:

```
Query: "user authentication"
         ↓
Tìm được: login(), validateCredentials(), checkPassword(), authMiddleware()
          (dù chúng không chứa từ "authentication")
```

## Cơ chế hoạt động

### Kiến trúc tổng quan

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
│                        Classes, etc.       (384 chiều)          │
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

### Quy trình chi tiết

#### 1. Parsing (Tree-sitter)

Tree-sitter parse source code thành Abstract Syntax Tree (AST), trích xuất các symbols có ý nghĩa:

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

Mỗi code chunk được chuyển thành vector 384 chiều bằng neural network:

```
"def login(username, password): authenticate user..."
                    ↓
    Embedding Model (chạy local, ONNX)
                    ↓
    [0.12, -0.34, 0.56, 0.08, ..., -0.22]  (384 số)
```

Model hiểu được quan hệ ngữ nghĩa:
- `"authentication"` ≈ `"login"` ≈ `"credentials"` (vectors gần nhau)
- `"database"` ≈ `"query"` ≈ `"SQL"` (vectors gần nhau)
- `"authentication"` ≠ `"database"` (vectors xa nhau)

#### 3. Lưu trữ (ChromaDB)

Vectors được lưu trong ChromaDB, database tối ưu cho similarity search:

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

#### 4. Tìm kiếm (Cosine Similarity)

Khi bạn search, query được embed và so sánh với tất cả vectors đã lưu:

```
Query: "user authentication"
              ↓
Query Vector: [0.15, -0.31, 0.52, ...]
              ↓
So sánh với tất cả vectors bằng cosine similarity:
  - chunk_001 (login): similarity = 0.89  ← CAO
  - chunk_002 (db):    similarity = 0.23  ← THẤP
  - chunk_003 (auth):  similarity = 0.85  ← CAO
              ↓
Trả về top-k chunks tương tự nhất
```

### Tại sao Semantic Search hoạt động

Embedding model được train trên hàng triệu cặp text, học được rằng:

| Khái niệm A | ≈ Tương tự với | Khoảng cách |
|-------------|----------------|-------------|
| authentication | login, credentials, auth, signin | Gần |
| database | query, SQL, connection, ORM | Gần |
| error | exception, failure, catch, throw | Gần |
| parse | tokenize, lexer, AST, syntax | Gần |

Điều này cho phép tìm code theo **ý nghĩa**, không chỉ từ khóa.

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

## Cài đặt

### Cách 1: Qua npx (Khuyến nghị)

Không cần cài đặt! Chỉ cần cấu hình Claude Desktop trực tiếp.

### Cách 2: Qua npm (Cài global)

```bash
npm install -g codebaxing
```

### Cách 3: Clone từ source

```bash
git clone https://github.com/street-devs/codebaxing.git
cd codebaxing
npm install
npm run build
```

### (Tùy chọn) Cài đặt persistent storage

Mặc định, index được lưu trong memory và mất khi server restart.

Để lưu trữ vĩnh viễn, chạy ChromaDB:

```bash
# Dùng Docker (khuyến nghị)
docker run -d -p 8000:8000 chromadb/chroma

# Set biến môi trường
export CHROMADB_URL=http://localhost:8000
```

### Cấu hình Claude Desktop

Thêm vào file config của Claude Desktop:

**macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
**Windows**: `%APPDATA%\Claude\claude_desktop_config.json`

#### Qua npx (không cần cài):

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

#### Qua global install:

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

#### Với persistent storage (ChromaDB):

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

#### Từ source (development):

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

### Khởi động lại Claude Desktop

Các tool Codebaxing sẽ có sẵn trong Claude.

## Sử dụng

### MCP Tools

| Tool | Mô tả |
|------|-------|
| `index` | Index codebase. Modes: `auto` (incremental), `full`, `load-only` |
| `search` | Semantic search. Trả về ranked code chunks |
| `stats` | Thống kê index (files, symbols, chunks) |
| `languages` | Liệt kê các file extensions được hỗ trợ |
| `remember` | Lưu memories (conversation, status, decision, preference, doc, note) |
| `recall` | Semantic search trên memories |
| `forget` | Xóa memories theo ID, type, tags, hoặc tuổi |
| `memory-stats` | Thống kê memory theo type |

### Ví dụ Workflow

1. **Index codebase:**
   ```
   index(path="/path/to/your/project")
   ```

2. **Tìm kiếm code:**
   ```
   search(question="authentication middleware")
   search(question="database connection", language="typescript")
   search(question="error handling", symbol_type="function")
   ```

3. **Lưu context:**
   ```
   remember(content="Sử dụng PostgreSQL với Prisma ORM", memory_type="decision")
   remember(content="Auth dùng JWT tokens", memory_type="doc", tags=["auth", "security"])
   ```

4. **Truy xuất context:**
   ```
   recall(query="database setup")
   recall(query="authentication", memory_type="decision")
   ```

## Ngôn ngữ được hỗ trợ

Python, JavaScript, TypeScript, C, C++, Bash, Go, Java, Kotlin, Rust, Ruby, C#, PHP, Scala, Swift, Lua, Dart, Elixir, Haskell, OCaml, Zig, Perl, CSS, HTML, Vue, JSON, YAML, TOML, Makefile

## Cấu hình

### Biến môi trường

| Biến | Mô tả | Mặc định |
|------|-------|----------|
| `CHROMADB_URL` | URL ChromaDB server để lưu trữ vĩnh viễn | (in-memory) |
| `CODEBAXING_DEVICE` | Thiết bị tính toán cho embeddings | `cpu` |

### Tăng tốc GPU

Bật GPU để tạo embedding nhanh hơn:

```bash
# WebGPU (thử nghiệm, dùng Metal trên macOS)
export CODEBAXING_DEVICE=webgpu

# Tự động chọn thiết bị tốt nhất
export CODEBAXING_DEVICE=auto

# NVIDIA GPU (chỉ Linux/Windows, cần CUDA)
export CODEBAXING_DEVICE=cuda
```

Mặc định là `cpu`, hoạt động mọi nơi.

**Lưu ý:** macOS không hỗ trợ CUDA (không có NVIDIA drivers). Dùng `webgpu` để tăng tốc trên Mac.

### Lưu trữ

Metadata được lưu trong thư mục `.codebaxing/` trong project:
- `metadata.json` - Index metadata và file timestamps

## Development

```bash
npm run dev       # Chạy với tsx (không cần build)
npm run build     # Compile TypeScript
npm start         # Chạy bản đã compile
npm test          # Chạy tests
npm run typecheck # Type check không emit
```

### Testing

```bash
# Chạy unit tests
npm test

# Test indexing thủ công
CHROMADB_URL=http://localhost:8000 npx tsx test-indexing.ts
```

## So sánh: Grep vs Semantic Search

| Khía cạnh | Grep | Semantic Search |
|-----------|------|-----------------|
| Query | Match exact text | Ngôn ngữ tự nhiên |
| "authentication" | Chỉ tìm "authentication" | Tìm login, auth, credentials, v.v. |
| Hiểu context | Không | Có |
| Tìm từ đồng nghĩa | Không | Có |
| Tốc độ | Rất nhanh | Nhanh (sau khi index) |
| Setup | Không cần | Cần indexing |

## Chi tiết kỹ thuật

| Component | Công nghệ |
|-----------|-----------|
| Embedding Model | `all-MiniLM-L6-v2` (384 chiều) |
| Model Runtime | `@huggingface/transformers` (ONNX) |
| Vector Database | ChromaDB |
| Code Parser | Tree-sitter |
| MCP SDK | `@modelcontextprotocol/sdk` |

## License

MIT
