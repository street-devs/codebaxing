/**
 * Core data models for Codebaxing.
 *
 * Defines the fundamental data structures used throughout the system
 * for representing code symbols, parsed files, and codebase indices.
 */

// ─── Symbol Types ────────────────────────────────────────────────────────────

export enum SymbolType {
  FUNCTION = 'function',
  CLASS = 'class',
  METHOD = 'method',
  VARIABLE = 'variable',
}

export function symbolTypeFromString(value: string): SymbolType {
  const lower = value.toLowerCase();
  const entries = Object.values(SymbolType) as string[];
  if (entries.includes(lower)) {
    return lower as SymbolType;
  }
  throw new Error(`Invalid SymbolType: ${value}`);
}

// ─── Symbol ──────────────────────────────────────────────────────────────────

export interface SymbolData {
  name: string;
  type: SymbolType;
  filepath: string;
  lineStart: number;
  lineEnd: number;
  language: string;
  signature: string;
  docstring?: string;
  parent?: string;
  codeSnippet?: string;
  imports?: string[];
  calls?: string[];
  metadata?: Record<string, unknown>;
}

export class Symbol {
  readonly name: string;
  readonly type: SymbolType;
  readonly filepath: string;
  readonly lineStart: number;
  readonly lineEnd: number;
  readonly language: string;
  readonly signature: string;
  readonly docstring: string;
  readonly parent: string | undefined;
  readonly codeSnippet: string;
  readonly imports: string[];
  readonly calls: string[];
  readonly metadata: Record<string, unknown>;

  constructor(data: SymbolData) {
    if (!data.name) throw new Error('Symbol name cannot be empty');
    if (!data.filepath) throw new Error('Symbol filepath cannot be empty');
    if (data.lineStart < 1) throw new Error(`lineStart must be >= 1, got ${data.lineStart}`);
    if (data.lineEnd < data.lineStart) throw new Error(`lineEnd (${data.lineEnd}) must be >= lineStart (${data.lineStart})`);
    if (!data.language) throw new Error('Symbol language cannot be empty');

    this.name = data.name;
    this.type = data.type;
    this.filepath = data.filepath;
    this.lineStart = data.lineStart;
    this.lineEnd = data.lineEnd;
    this.language = data.language;
    this.signature = data.signature;
    this.docstring = data.docstring ?? '';
    this.parent = data.parent;
    this.codeSnippet = data.codeSnippet ?? '';
    this.imports = data.imports ?? [];
    this.calls = data.calls ?? [];
    this.metadata = data.metadata ?? {};
  }

  get qualifiedName(): string {
    return this.parent ? `${this.parent}.${this.name}` : this.name;
  }

  get lineCount(): number {
    return this.lineEnd - this.lineStart + 1;
  }

  toDict(): Record<string, unknown> {
    return {
      name: this.name,
      type: this.type,
      filepath: this.filepath,
      lineStart: this.lineStart,
      lineEnd: this.lineEnd,
      language: this.language,
      signature: this.signature,
      docstring: this.docstring,
      parent: this.parent ?? null,
      codeSnippet: this.codeSnippet,
      imports: this.imports,
      calls: this.calls,
      metadata: this.metadata,
    };
  }

  static fromDict(data: Record<string, unknown>): Symbol {
    return new Symbol({
      name: data.name as string,
      type: typeof data.type === 'string' ? symbolTypeFromString(data.type) : data.type as SymbolType,
      filepath: data.filepath as string,
      lineStart: (data.lineStart ?? data.line_start) as number,
      lineEnd: (data.lineEnd ?? data.line_end) as number,
      language: data.language as string,
      signature: data.signature as string,
      docstring: (data.docstring as string) ?? '',
      parent: data.parent as string | undefined,
      codeSnippet: (data.codeSnippet ?? data.code_snippet) as string | undefined,
      imports: data.imports as string[] | undefined,
      calls: data.calls as string[] | undefined,
      metadata: data.metadata as Record<string, unknown> | undefined,
    });
  }
}

// ─── ParsedFile ──────────────────────────────────────────────────────────────

export interface ParsedFileData {
  filepath: string;
  language: string;
  symbols?: Symbol[];
  imports?: string[];
  parseTime?: number;
  error?: string;
}

export class ParsedFile {
  readonly filepath: string;
  readonly language: string;
  readonly symbols: Symbol[];
  readonly imports: string[];
  readonly parseTime: number;
  readonly error: string | undefined;

  constructor(data: ParsedFileData) {
    if (!data.filepath) throw new Error('ParsedFile filepath cannot be empty');
    if (!data.language) throw new Error('ParsedFile language cannot be empty');

    this.filepath = data.filepath;
    this.language = data.language;
    this.symbols = data.symbols ?? [];
    this.imports = data.imports ?? [];
    this.parseTime = data.parseTime ?? 0;
    this.error = data.error;
  }

  get isSuccessful(): boolean {
    return this.error === undefined;
  }

  get symbolCount(): number {
    return this.symbols.length;
  }

  getSymbolsByType(symbolType: SymbolType): Symbol[] {
    return this.symbols.filter(s => s.type === symbolType);
  }

  toDict(): Record<string, unknown> {
    return {
      filepath: this.filepath,
      language: this.language,
      symbols: this.symbols.map(s => s.toDict()),
      imports: this.imports,
      parseTime: this.parseTime,
      error: this.error ?? null,
    };
  }

  static fromDict(data: Record<string, unknown>): ParsedFile {
    const symbols = (data.symbols as Record<string, unknown>[])?.map(s => Symbol.fromDict(s)) ?? [];
    return new ParsedFile({
      filepath: data.filepath as string,
      language: data.language as string,
      symbols,
      imports: data.imports as string[] | undefined,
      parseTime: (data.parseTime ?? data.parse_time) as number | undefined,
      error: data.error as string | undefined,
    });
  }
}

// ─── CodebaseIndex ───────────────────────────────────────────────────────────

export interface CodebaseIndexData {
  rootPath: string;
  files?: Record<string, ParsedFile>;
  totalFiles?: number;
  totalSymbols?: number;
  indexedAt?: string;
}

export class CodebaseIndex {
  readonly rootPath: string;
  readonly files: Record<string, ParsedFile>;
  readonly totalFiles: number;
  readonly totalSymbols: number;
  readonly indexedAt: string;

  constructor(data: CodebaseIndexData) {
    if (!data.rootPath) throw new Error('CodebaseIndex rootPath cannot be empty');

    this.rootPath = data.rootPath;
    this.files = data.files ?? {};
    this.totalFiles = data.totalFiles ?? 0;
    this.totalSymbols = data.totalSymbols ?? 0;
    this.indexedAt = data.indexedAt ?? new Date().toISOString();
  }

  get successfulParses(): number {
    return Object.values(this.files).filter(f => f.isSuccessful).length;
  }

  get failedParses(): number {
    return Object.values(this.files).filter(f => !f.isSuccessful).length;
  }

  getSymbolsByName(name: string): Symbol[] {
    const results: Symbol[] = [];
    for (const parsedFile of Object.values(this.files)) {
      results.push(...parsedFile.symbols.filter(s => s.name === name));
    }
    return results;
  }

  getSymbolsByType(symbolType: SymbolType): Symbol[] {
    const results: Symbol[] = [];
    for (const parsedFile of Object.values(this.files)) {
      results.push(...parsedFile.getSymbolsByType(symbolType));
    }
    return results;
  }

  toDict(): Record<string, unknown> {
    const files: Record<string, unknown> = {};
    for (const [path, f] of Object.entries(this.files)) {
      files[path] = f.toDict();
    }
    return {
      rootPath: this.rootPath,
      files,
      totalFiles: this.totalFiles,
      totalSymbols: this.totalSymbols,
      indexedAt: this.indexedAt,
    };
  }

  static fromDict(data: Record<string, unknown>): CodebaseIndex {
    const filesData = data.files as Record<string, Record<string, unknown>> | undefined;
    const files: Record<string, ParsedFile> = {};
    if (filesData) {
      for (const [path, f] of Object.entries(filesData)) {
        files[path] = ParsedFile.fromDict(f);
      }
    }
    return new CodebaseIndex({
      rootPath: (data.rootPath ?? data.root_path) as string,
      files,
      totalFiles: (data.totalFiles ?? data.total_files) as number | undefined,
      totalSymbols: (data.totalSymbols ?? data.total_symbols) as number | undefined,
      indexedAt: (data.indexedAt ?? data.indexed_at) as string | undefined,
    });
  }
}

// ─── Memory Models ───────────────────────────────────────────────────────────

export enum MemoryType {
  CONVERSATION = 'conversation',
  STATUS = 'status',
  DECISION = 'decision',
  PREFERENCE = 'preference',
  DOC = 'doc',
  NOTE = 'note',
}

export function memoryTypeFromString(value: string): MemoryType {
  const lower = value.toLowerCase();
  const entries = Object.values(MemoryType) as string[];
  if (entries.includes(lower)) {
    return lower as MemoryType;
  }
  throw new Error(`Invalid MemoryType: ${value}`);
}

const VALID_TTLS = ['session', 'day', 'week', 'month', 'permanent'] as const;
export type TTL = typeof VALID_TTLS[number];

export interface MemoryData {
  id: string;
  content: string;
  memoryType: MemoryType;
  project: string;
  tags?: string[];
  createdAt?: string;
  accessedAt?: string;
  ttl?: TTL;
  source?: string;
  metadata?: Record<string, unknown>;
}

export class Memory {
  id: string;
  content: string;
  memoryType: MemoryType;
  project: string;
  tags: string[];
  createdAt: string;
  accessedAt: string;
  ttl: TTL;
  source: string;
  metadata: Record<string, unknown>;

  constructor(data: MemoryData) {
    if (!data.id) throw new Error('Memory id cannot be empty');
    if (!data.content) throw new Error('Memory content cannot be empty');
    if (!data.project) throw new Error('Memory project cannot be empty');
    if (data.ttl && !VALID_TTLS.includes(data.ttl)) {
      throw new Error(`ttl must be one of ${VALID_TTLS.join(', ')}, got ${data.ttl}`);
    }

    this.id = data.id;
    this.content = data.content;
    this.memoryType = data.memoryType;
    this.project = data.project;
    this.tags = data.tags ?? [];
    this.createdAt = data.createdAt ?? new Date().toISOString();
    this.accessedAt = data.accessedAt ?? new Date().toISOString();
    this.ttl = data.ttl ?? 'permanent';
    this.source = data.source ?? 'user';
    this.metadata = data.metadata ?? {};
  }

  toDict(): Record<string, unknown> {
    return {
      id: this.id,
      content: this.content,
      memoryType: this.memoryType,
      project: this.project,
      tags: this.tags,
      createdAt: this.createdAt,
      accessedAt: this.accessedAt,
      ttl: this.ttl,
      source: this.source,
      metadata: this.metadata,
    };
  }

  static fromDict(data: Record<string, unknown>): Memory {
    return new Memory({
      id: data.id as string,
      content: data.content as string,
      memoryType: typeof data.memoryType === 'string'
        ? memoryTypeFromString(data.memoryType)
        : (typeof data.memory_type === 'string' ? memoryTypeFromString(data.memory_type) : data.memoryType as MemoryType),
      project: data.project as string,
      tags: data.tags as string[] | undefined,
      createdAt: (data.createdAt ?? data.created_at) as string | undefined,
      accessedAt: (data.accessedAt ?? data.accessed_at) as string | undefined,
      ttl: data.ttl as TTL | undefined,
      source: data.source as string | undefined,
      metadata: data.metadata as Record<string, unknown> | undefined,
    });
  }

  touch(): void {
    this.accessedAt = new Date().toISOString();
  }
}
