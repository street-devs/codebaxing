import { describe, it, expect } from 'vitest';
import {
  CodebaxingError,
  ParseError,
  IndexingError,
  EmbeddingError,
  SearchError,
  ConfigurationError,
} from '../../src/core/exceptions.js';

describe('Exceptions', () => {
  it('should create CodebaxingError', () => {
    const err = new CodebaxingError('test message');
    expect(err.name).toBe('CodebaxingError');
    expect(err.message).toBe('test message');
    expect(err).toBeInstanceOf(Error);
  });

  it('should create ParseError with details', () => {
    const err = new ParseError('/path/to/file.ts', 'typescript', 'Syntax error');
    expect(err.name).toBe('ParseError');
    expect(err.filepath).toBe('/path/to/file.ts');
    expect(err.language).toBe('typescript');
    expect(err.details).toBe('Syntax error');
    expect(err).toBeInstanceOf(CodebaxingError);
  });

  it('should create IndexingError', () => {
    const err = new IndexingError('Index failed');
    expect(err.name).toBe('IndexingError');
    expect(err).toBeInstanceOf(CodebaxingError);
  });

  it('should create EmbeddingError', () => {
    const err = new EmbeddingError('Model load failed');
    expect(err.name).toBe('EmbeddingError');
    expect(err).toBeInstanceOf(CodebaxingError);
  });

  it('should create SearchError', () => {
    const err = new SearchError('Search failed');
    expect(err.name).toBe('SearchError');
    expect(err).toBeInstanceOf(CodebaxingError);
  });

  it('should create ConfigurationError', () => {
    const err = new ConfigurationError('Invalid config');
    expect(err.name).toBe('ConfigurationError');
    expect(err).toBeInstanceOf(CodebaxingError);
  });
});
