# Codebaxing (Node.js)

MCP server cho semantic code search. Index codebase và tìm kiếm bằng ngôn ngữ tự nhiên.

## Tính năng

- **Semantic Code Search**: Tìm code bằng cách mô tả những gì bạn cần
- **24+ Ngôn ngữ**: Python, TypeScript, JavaScript, Go, Rust, Java, C/C++, và nhiều hơn nữa
- **Memory Layer**: Lưu trữ và truy xuất context dự án qua các session
- **Incremental Indexing**: Chỉ re-index các file đã thay đổi

## Yêu cầu

- Node.js >= 20.0.0
- ~500MB dung lượng đĩa cho embedding model (tải xuống lần chạy đầu tiên)

## Cài đặt

```bash
npm install
```

## Sử dụng

### Như MCP Server

Thêm vào config Claude Desktop (`~/Library/Application Support/Claude/claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "codebaxing": {
      "command": "npx",
      "args": ["tsx", "/path/to/codebaxing-node/src/mcp/server.ts"]
    }
  }
}
```

Hoặc với bản đã compile:

```json
{
  "mcpServers": {
    "codebaxing": {
      "command": "node",
      "args": ["/path/to/codebaxing-node/dist/mcp/server.js"]
    }
  }
}
```

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

1. Index codebase:
   ```
   index(path="/path/to/your/project")
   ```

2. Tìm kiếm code:
   ```
   search(question="authentication middleware")
   search(question="database connection", language="typescript")
   ```

3. Lưu context:
   ```
   remember(content="Sử dụng PostgreSQL với Prisma ORM", memory_type="decision")
   ```

## Development

```bash
npm run dev       # Chạy với tsx (không cần build)
npm run build     # Compile TypeScript
npm start         # Chạy bản đã compile
npm test          # Chạy tests
npm run typecheck # Type check không emit
```

## Ngôn ngữ được hỗ trợ

Python, JavaScript, TypeScript, C, C++, Bash, Go, Java, Kotlin, Rust, Ruby, C#, PHP, Scala, Swift, Lua, Dart, Elixir, Haskell, OCaml, Zig, Perl, CSS, HTML, Vue, JSON, YAML, TOML, Makefile

## Cách hoạt động

1. **Parsing**: Tree-sitter trích xuất functions, classes, và methods từ source files
2. **Embedding**: Code chunks được chuyển thành vectors sử dụng `all-MiniLM-L6-v2` (384 dims)
3. **Storage**: Vectors được lưu trong ChromaDB cho fast similarity search
4. **Search**: Query được embed và matched với stored vectors

## Lưu trữ

Mặc định, index được lưu trong memory và mất khi server restart.

Để lưu trữ vĩnh viễn, chạy ChromaDB server:

```bash
docker run -p 8000:8000 chromadb/chroma
```

Sau đó set biến môi trường:

```bash
export CHROMADB_URL=http://localhost:8000
```

Metadata được lưu trong thư mục `.codebaxing/` trong project:
- `metadata.json` - Index metadata và file timestamps

## License

MIT
