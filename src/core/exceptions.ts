/**
 * Custom exceptions for Codebaxing.
 */

export class CodebaxingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CodebaxingError';
  }
}

export class ParseError extends CodebaxingError {
  filepath: string;
  language: string;
  details: string;

  constructor(filepath: string, language: string, details: string) {
    super(`Failed to parse ${filepath} (${language}): ${details}`);
    this.name = 'ParseError';
    this.filepath = filepath;
    this.language = language;
    this.details = details;
  }
}

export class IndexingError extends CodebaxingError {
  constructor(message: string) {
    super(message);
    this.name = 'IndexingError';
  }
}

export class EmbeddingError extends CodebaxingError {
  constructor(message: string) {
    super(message);
    this.name = 'EmbeddingError';
  }
}

export class SearchError extends CodebaxingError {
  constructor(message: string) {
    super(message);
    this.name = 'SearchError';
  }
}

export class ConfigurationError extends CodebaxingError {
  constructor(message: string) {
    super(message);
    this.name = 'ConfigurationError';
  }
}
