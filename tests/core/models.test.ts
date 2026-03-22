import { describe, it, expect } from 'vitest';
import {
  Symbol,
  SymbolType,
  symbolTypeFromString,
  ParsedFile,
  CodebaseIndex,
  Memory,
  MemoryType,
  memoryTypeFromString,
} from '../../src/core/models.js';

describe('SymbolType', () => {
  it('should convert string to SymbolType', () => {
    expect(symbolTypeFromString('function')).toBe(SymbolType.FUNCTION);
    expect(symbolTypeFromString('class')).toBe(SymbolType.CLASS);
    expect(symbolTypeFromString('method')).toBe(SymbolType.METHOD);
    expect(symbolTypeFromString('variable')).toBe(SymbolType.VARIABLE);
  });

  it('should throw on invalid type', () => {
    expect(() => symbolTypeFromString('invalid')).toThrow();
  });
});

describe('Symbol', () => {
  const validSymbolData = {
    name: 'testFunction',
    type: SymbolType.FUNCTION,
    filepath: '/path/to/file.ts',
    lineStart: 1,
    lineEnd: 10,
    language: 'typescript',
    signature: 'function testFunction(): void',
  };

  it('should create symbol with valid data', () => {
    const symbol = new Symbol(validSymbolData);
    expect(symbol.name).toBe('testFunction');
    expect(symbol.type).toBe(SymbolType.FUNCTION);
    expect(symbol.lineCount).toBe(10);
  });

  it('should throw on empty name', () => {
    expect(() => new Symbol({ ...validSymbolData, name: '' })).toThrow();
  });

  it('should throw on invalid line range', () => {
    expect(() => new Symbol({ ...validSymbolData, lineStart: 10, lineEnd: 5 })).toThrow();
  });

  it('should serialize to dict and back', () => {
    const symbol = new Symbol(validSymbolData);
    const dict = symbol.toDict();
    const restored = Symbol.fromDict(dict);
    expect(restored.name).toBe(symbol.name);
    expect(restored.type).toBe(symbol.type);
  });

  it('should compute qualified name with parent', () => {
    const symbol = new Symbol({ ...validSymbolData, parent: 'MyClass' });
    expect(symbol.qualifiedName).toBe('MyClass.testFunction');
  });
});

describe('ParsedFile', () => {
  it('should create parsed file', () => {
    const parsed = new ParsedFile({
      filepath: '/test.ts',
      language: 'typescript',
    });
    expect(parsed.isSuccessful).toBe(true);
    expect(parsed.symbolCount).toBe(0);
  });

  it('should mark as failed with error', () => {
    const parsed = new ParsedFile({
      filepath: '/test.ts',
      language: 'typescript',
      error: 'Parse error',
    });
    expect(parsed.isSuccessful).toBe(false);
  });
});

describe('CodebaseIndex', () => {
  it('should create index', () => {
    const index = new CodebaseIndex({
      rootPath: '/project',
    });
    expect(index.rootPath).toBe('/project');
    expect(index.successfulParses).toBe(0);
  });
});

describe('MemoryType', () => {
  it('should convert string to MemoryType', () => {
    expect(memoryTypeFromString('conversation')).toBe(MemoryType.CONVERSATION);
    expect(memoryTypeFromString('decision')).toBe(MemoryType.DECISION);
  });

  it('should throw on invalid type', () => {
    expect(() => memoryTypeFromString('invalid')).toThrow();
  });
});

describe('Memory', () => {
  it('should create memory with valid data', () => {
    const memory = new Memory({
      id: 'test-id',
      content: 'Test content',
      memoryType: MemoryType.NOTE,
      project: '/project',
    });
    expect(memory.id).toBe('test-id');
    expect(memory.ttl).toBe('permanent');
  });

  it('should throw on empty content', () => {
    expect(() => new Memory({
      id: 'test-id',
      content: '',
      memoryType: MemoryType.NOTE,
      project: '/project',
    })).toThrow();
  });

  it('should update accessedAt on touch', async () => {
    const memory = new Memory({
      id: 'test-id',
      content: 'Test',
      memoryType: MemoryType.NOTE,
      project: '/project',
      accessedAt: '2020-01-01T00:00:00.000Z', // Set old date
    });
    const before = memory.accessedAt;
    memory.touch();
    expect(memory.accessedAt).not.toBe(before);
    expect(new Date(memory.accessedAt).getTime()).toBeGreaterThan(new Date(before).getTime());
  });
});
