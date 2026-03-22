/**
 * Codebaxing - MCP server for codebase understanding.
 *
 * A lightweight MCP server that provides code parsing and indexing capabilities
 * through the Model Context Protocol.
 */

export const VERSION = '0.1.0';

// Core models
export { Symbol, SymbolType, ParsedFile, CodebaseIndex } from './core/models.js';
export { Memory, MemoryType } from './core/models.js';
export type { IParser } from './core/interfaces.js';

// Exceptions
export {
  CodebaxingError,
  ParseError,
  IndexingError,
  EmbeddingError,
  SearchError,
  ConfigurationError,
} from './core/exceptions.js';

// Parsers
export { TreeSitterParser } from './parsers/treesitter-parser.js';
export { getLanguageForFile, getSupportedExtensions, EXTENSION_MAP } from './parsers/language-configs.js';

// Indexing
export { SourceRetriever, discoverFiles } from './indexing/source-retriever.js';
export { MemoryRetriever } from './indexing/memory-retriever.js';
export { EmbeddingService, getEmbeddingService } from './indexing/embedding-service.js';
