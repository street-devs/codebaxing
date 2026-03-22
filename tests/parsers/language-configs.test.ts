import { describe, it, expect } from 'vitest';
import {
  getLanguageForFile,
  getConfigForLanguage,
  getSupportedExtensions,
  EXTENSION_MAP,
  LANGUAGE_CONFIGS,
} from '../../src/parsers/language-configs.js';

describe('language-configs', () => {
  describe('getLanguageForFile', () => {
    it('should detect Python files', () => {
      expect(getLanguageForFile('/path/to/file.py')).toBe('python');
      expect(getLanguageForFile('/path/to/file.pyi')).toBe('python');
    });

    it('should detect JavaScript/TypeScript files', () => {
      expect(getLanguageForFile('/path/to/file.js')).toBe('javascript');
      expect(getLanguageForFile('/path/to/file.jsx')).toBe('javascript');
      expect(getLanguageForFile('/path/to/file.ts')).toBe('typescript');
      expect(getLanguageForFile('/path/to/file.tsx')).toBe('typescript');
    });

    it('should detect other languages', () => {
      expect(getLanguageForFile('/path/to/file.go')).toBe('go');
      expect(getLanguageForFile('/path/to/file.rs')).toBe('rust');
      expect(getLanguageForFile('/path/to/file.java')).toBe('java');
      expect(getLanguageForFile('/path/to/file.rb')).toBe('ruby');
    });

    it('should return undefined for unsupported files', () => {
      expect(getLanguageForFile('/path/to/file.xyz')).toBeUndefined();
      expect(getLanguageForFile('/path/to/file')).toBeUndefined();
    });

    it('should be case insensitive', () => {
      expect(getLanguageForFile('/path/to/FILE.PY')).toBe('python');
      expect(getLanguageForFile('/path/to/FILE.TS')).toBe('typescript');
    });
  });

  describe('getConfigForLanguage', () => {
    it('should return config for supported languages', () => {
      const pythonConfig = getConfigForLanguage('python');
      expect(pythonConfig.functionTypes).toContain('function_definition');
      expect(pythonConfig.classTypes).toContain('class_definition');

      const tsConfig = getConfigForLanguage('typescript');
      expect(tsConfig.functionTypes).toContain('function_declaration');
    });

    it('should throw for unsupported language', () => {
      expect(() => getConfigForLanguage('unsupported')).toThrow();
    });
  });

  describe('getSupportedExtensions', () => {
    it('should return all extensions', () => {
      const exts = getSupportedExtensions();
      expect(exts.has('.py')).toBe(true);
      expect(exts.has('.ts')).toBe(true);
      expect(exts.has('.js')).toBe(true);
      expect(exts.has('.go')).toBe(true);
    });
  });

  describe('EXTENSION_MAP', () => {
    it('should have consistent mappings', () => {
      // All extensions should map to a valid language config
      for (const [ext, lang] of Object.entries(EXTENSION_MAP)) {
        expect(ext.startsWith('.')).toBe(true);
        expect(LANGUAGE_CONFIGS[lang]).toBeDefined();
      }
    });
  });

  describe('LANGUAGE_CONFIGS', () => {
    it('should have required fields for all languages', () => {
      for (const [lang, config] of Object.entries(LANGUAGE_CONFIGS)) {
        expect(Array.isArray(config.functionTypes)).toBe(true);
        expect(Array.isArray(config.classTypes)).toBe(true);
        expect(Array.isArray(config.methodTypes)).toBe(true);
        expect(Array.isArray(config.importTypes)).toBe(true);
        expect(Array.isArray(config.callTypes)).toBe(true);
        expect(typeof config.identifierField).toBe('string');
        expect(typeof config.bodyField).toBe('string');
      }
    });
  });
});
