/**
 * TreeSitterParser - Multi-language code parser using tree-sitter.
 *
 * Supported Languages: Python, JavaScript, TypeScript, C, C++, Bash, Go, Java, Kotlin
 */

import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import Parser from 'tree-sitter';
import type { SyntaxNode } from 'tree-sitter';
import type { IParser } from '../core/interfaces.js';
import { Symbol, ParsedFile, SymbolType } from '../core/models.js';
import {
  getLanguageForFile,
  getConfigForLanguage,
  getSupportedExtensions,
  type LanguageConfig,
} from './language-configs.js';

// Use createRequire for synchronous grammar loading in ESM
const require = createRequire(import.meta.url);

const GRAMMAR_PACKAGES: Record<string, string> = {
  // Core languages
  python: 'tree-sitter-python',
  javascript: 'tree-sitter-javascript',
  typescript: 'tree-sitter-typescript',
  c: 'tree-sitter-c',
  cpp: 'tree-sitter-cpp',
  bash: 'tree-sitter-bash',
  go: 'tree-sitter-go',
  java: 'tree-sitter-java',
  kotlin: 'tree-sitter-kotlin',
  // Extended languages
  rust: 'tree-sitter-rust',
  ruby: 'tree-sitter-ruby',
  csharp: 'tree-sitter-c-sharp',
  php: 'tree-sitter-php',
  scala: 'tree-sitter-scala',
  swift: 'tree-sitter-swift',
  lua: 'tree-sitter-lua',
  dart: 'tree-sitter-dart',
  elixir: 'tree-sitter-elixir',
  haskell: 'tree-sitter-haskell',
  ocaml: 'tree-sitter-ocaml',
  zig: 'tree-sitter-zig',
  perl: 'tree-sitter-perl',
  // Markup/Config
  css: 'tree-sitter-css',
  html: 'tree-sitter-html',
  vue: 'tree-sitter-vue',
  json: 'tree-sitter-json',
  yaml: 'tree-sitter-yaml',
  toml: 'tree-sitter-toml',
  make: 'tree-sitter-make',
};

// ─── TreeSitterParser ────────────────────────────────────────────────────────

/** Maximum characters for code snippets (~1000-1300 tokens). */
const MAX_CODE_SNIPPET_CHARS = 4000;
/** Maximum file size before warning (10 MB). */
const MAX_FILE_SIZE_MB = 10;

// Pre-loaded grammars from async import (ESM-only packages like tree-sitter-css)
const preloadedGrammars = new Map<string, unknown>();

export class TreeSitterParser implements IParser {
  private parsers: Map<string, Parser> = new Map();
  private failedLanguages: Set<string> = new Set();

  canParse(filepath: string): boolean {
    return getLanguageForFile(filepath) !== undefined;
  }

  parseFile(filepath: string): ParsedFile {
    const startTime = performance.now();

    // Validate file exists
    if (!fs.existsSync(filepath)) {
      throw new Error(`File not found: ${filepath}`);
    }

    // Detect language
    const language = getLanguageForFile(filepath);
    if (!language) {
      const ext = path.extname(filepath);
      return new ParsedFile({
        filepath,
        language: 'unknown',
        error: `Unsupported file type: ${ext}`,
        parseTime: (performance.now() - startTime) / 1000,
      });
    }

    // Check file size
    const stat = fs.statSync(filepath);
    const fileSizeMb = stat.size / (1024 * 1024);
    if (fileSizeMb > MAX_FILE_SIZE_MB) {
      console.warn(`Large file (${fileSizeMb.toFixed(2)}MB): ${filepath}. Parsing may be slow.`);
    }

    // Read file content
    let content: Buffer;
    try {
      content = fs.readFileSync(filepath);
      if (isBinaryFile(content)) {
        return new ParsedFile({
          filepath,
          language,
          error: 'Binary file detected - cannot parse',
          parseTime: (performance.now() - startTime) / 1000,
        });
      }
    } catch (e) {
      return new ParsedFile({
        filepath,
        language,
        error: `Error reading file: ${(e as Error).message}`,
        parseTime: (performance.now() - startTime) / 1000,
      });
    }

    // Skip languages that already failed (don't retry every file)
    if (this.failedLanguages.has(language)) {
      return new ParsedFile({
        filepath,
        language,
        parseTime: (performance.now() - startTime) / 1000,
      });
    }

    // Get or create parser
    let parser: Parser;
    let config: LanguageConfig;
    try {
      parser = this.getParser(language);
      config = getConfigForLanguage(language);
    } catch (e) {
      this.failedLanguages.add(language);
      return new ParsedFile({
        filepath,
        language,
        error: `Failed to initialize parser: ${(e as Error).message}`,
        parseTime: (performance.now() - startTime) / 1000,
      });
    }

    // Parse the file
    try {
      const tree = parser.parse(content.toString('utf-8'));
      const rootNode = tree.rootNode;

      const symbols = this.extractSymbols(rootNode, content, filepath, language, config);
      const imports = this.extractImports(rootNode, content, config);

      return new ParsedFile({
        filepath,
        language,
        symbols,
        imports,
        parseTime: (performance.now() - startTime) / 1000,
      });
    } catch (e) {
      return new ParsedFile({
        filepath,
        language,
        error: `Parsing error: ${(e as Error).message}`,
        parseTime: (performance.now() - startTime) / 1000,
      });
    }
  }

  getSupportedExtensions(): string[] {
    return [...getSupportedExtensions()].sort();
  }

  private getParser(language: string): Parser {
    if (this.parsers.has(language)) {
      return this.parsers.get(language)!;
    }

    // Check if grammar was pre-loaded via initLanguages()
    const preloaded = preloadedGrammars.get(language);
    if (preloaded) {
      const parser = new Parser();
      parser.setLanguage(preloaded as any);
      this.parsers.set(language, parser);
      return parser;
    }

    const parser = new Parser();
    const packageName = GRAMMAR_PACKAGES[language];
    if (!packageName) {
      throw new Error(`No grammar package for language: ${language}`);
    }

    let grammar: any;
    try {
      grammar = require(packageName);
    } catch {
      throw new Error(`Grammar not loaded: ${packageName}. Call initLanguages() first.`);
    }

    // Some packages export language variants as named properties
    grammar = resolveGrammarVariant(language, grammar);

    try {
      parser.setLanguage(grammar);
    } catch {
      throw new Error(
        `Grammar for ${language} (${packageName}) is incompatible. ` +
        `Try: npm install ${packageName}@latest`
      );
    }
    this.parsers.set(language, parser);
    return parser;
  }

  /**
   * Pre-load all grammar packages (handles both CJS and ESM-only packages).
   * Call once at startup before parsing files.
   */
  async initLanguages(): Promise<{ loaded: string[]; failed: string[] }> {
    const loaded: string[] = [];
    const failed: string[] = [];

    for (const [language, packageName] of Object.entries(GRAMMAR_PACKAGES)) {
      if (this.parsers.has(language) || preloadedGrammars.has(language)) {
        loaded.push(language);
        continue;
      }

      try {
        // Try require first (CJS packages)
        let grammar: any;
        try {
          grammar = require(packageName);
        } catch {
          // Fallback to dynamic import (ESM-only packages like tree-sitter-css)
          const mod = await import(packageName);
          grammar = mod.default ?? mod;
        }

        grammar = resolveGrammarVariant(language, grammar);

        const p = new Parser();
        p.setLanguage(grammar);
        this.parsers.set(language, p);
        preloadedGrammars.set(language, grammar);
        loaded.push(language);
      } catch {
        failed.push(language);
      }
    }

    return { loaded, failed };
  }

  // ─── Symbol Extraction ───────────────────────────────────────────────────

  private extractSymbols(
    rootNode: SyntaxNode,
    content: Buffer,
    filepath: string,
    language: string,
    config: LanguageConfig
  ): Symbol[] {
    const symbols: Symbol[] = [];
    const classStack: string[] = [];
    let currentClass: string | undefined;

    const functionTypes = config.functionTypes;
    const classTypes = config.classTypes;
    const methodTypes = config.methodTypes;
    const constantTypes = config.constantTypes ?? [];

    const traverse = (node: SyntaxNode) => {
      const nodeType = node.type;

      if (classTypes.includes(nodeType)) {
        const symbol = this.extractClassSymbol(node, content, filepath, language, config);
        if (symbol) {
          symbols.push(symbol);
          classStack.push(symbol.name);
          currentClass = symbol.name;
        }
      } else if (functionTypes.includes(nodeType) && !currentClass) {
        const symbol = this.extractFunctionSymbol(node, content, filepath, language, config);
        if (symbol) symbols.push(symbol);
      } else if (methodTypes.includes(nodeType) && currentClass) {
        const symbol = this.extractFunctionSymbol(
          node, content, filepath, language, config, currentClass, true
        );
        if (symbol) symbols.push(symbol);
      } else if (constantTypes.includes(nodeType) && !currentClass) {
        const symbol = this.extractConstantSymbol(node, content, filepath, language, config);
        if (symbol) symbols.push(symbol);
      }

      for (const child of node.children) {
        traverse(child);
      }

      if (classTypes.includes(nodeType) && classStack.length > 0) {
        classStack.pop();
        currentClass = classStack.length > 0 ? classStack[classStack.length - 1] : undefined;
      }
    };

    traverse(rootNode);
    return symbols;
  }

  private extractClassSymbol(
    node: SyntaxNode,
    content: Buffer,
    filepath: string,
    language: string,
    config: LanguageConfig
  ): Symbol | undefined {
    const name = this.getNodeName(node, content, config);
    if (!name) return undefined;

    const lineStart = node.startPosition.row + 1;
    const lineEnd = node.endPosition.row + 1;
    const signature = this.getNodeText(node, content).split('\n')[0].trim();
    const docstring = this.extractDocstring(node, content, config);
    const codeSnippet = this.getCodeSnippet(node, content);
    const imports = this.extractImportsFromNode(node, content, config);
    const calls = this.extractCallsFromNode(node, content, config);

    return new Symbol({
      name,
      type: SymbolType.CLASS,
      filepath,
      lineStart,
      lineEnd,
      language,
      signature,
      docstring,
      codeSnippet,
      imports,
      calls,
    });
  }

  private extractFunctionSymbol(
    node: SyntaxNode,
    content: Buffer,
    filepath: string,
    language: string,
    config: LanguageConfig,
    parent?: string,
    isMethod: boolean = false
  ): Symbol | undefined {
    const name = this.getNodeName(node, content, config);
    if (!name) return undefined;

    const lineStart = node.startPosition.row + 1;
    const lineEnd = node.endPosition.row + 1;
    const signature = this.getNodeText(node, content).split('\n')[0].trim();
    const docstring = this.extractDocstring(node, content, config);
    const codeSnippet = this.getCodeSnippet(node, content);
    const imports = this.extractImportsFromNode(node, content, config);
    const calls = this.extractCallsFromNode(node, content, config);

    return new Symbol({
      name,
      type: isMethod ? SymbolType.METHOD : SymbolType.FUNCTION,
      filepath,
      lineStart,
      lineEnd,
      language,
      signature,
      docstring,
      parent,
      codeSnippet,
      imports,
      calls,
    });
  }

  private extractConstantSymbol(
    node: SyntaxNode,
    content: Buffer,
    filepath: string,
    language: string,
    config: LanguageConfig
  ): Symbol | undefined {
    const fullText = this.getNodeText(node, content).trim();
    let name: string | undefined;

    if (language === 'python') {
      for (const child of node.children) {
        if (child.type === 'assignment') {
          for (const subchild of child.children) {
            if (subchild.type === 'identifier') {
              const potentialName = this.getNodeText(subchild, content);
              if (isUpperCase(potentialName)) name = potentialName;
              break;
            }
          }
          break;
        }
      }
    } else if (language === 'javascript' || language === 'typescript') {
      if (fullText.startsWith('const ')) {
        for (const child of node.children) {
          if (child.type === 'variable_declarator') {
            for (const subchild of child.children) {
              if (subchild.type === 'identifier') {
                const potentialName = this.getNodeText(subchild, content);
                if (isUpperCase(potentialName)) name = potentialName;
                break;
              }
            }
            break;
          }
        }
      }
    } else if (language === 'go') {
      const constNames: string[] = [];
      for (const child of node.children) {
        if (child.type === 'const_spec') {
          for (const subchild of child.children) {
            if (subchild.type === 'identifier') {
              constNames.push(this.getNodeText(subchild, content));
              break;
            }
          }
        }
      }
      if (constNames.length > 0) name = constNames.join(', ');
    } else if (language === 'bash') {
      if (node.type === 'declaration_command') {
        for (const child of node.children) {
          if (child.type === 'variable_assignment') {
            for (const subchild of child.children) {
              if (subchild.type === 'variable_name') {
                const potentialName = this.getNodeText(subchild, content);
                if (isUpperCase(potentialName)) name = potentialName;
                break;
              }
            }
            break;
          }
        }
      }
    }

    if (!name) return undefined;

    return new Symbol({
      name,
      type: SymbolType.VARIABLE,
      filepath,
      lineStart: node.startPosition.row + 1,
      lineEnd: node.endPosition.row + 1,
      language,
      signature: fullText,
      docstring: '',
      codeSnippet: fullText,
      imports: [],
      calls: [],
    });
  }

  // ─── Imports and Calls ─────────────────────────────────────────────────

  private extractImports(
    rootNode: SyntaxNode,
    content: Buffer,
    config: LanguageConfig
  ): string[] {
    const imports: string[] = [];
    const importTypes = config.importTypes;

    const traverse = (node: SyntaxNode) => {
      if (importTypes.includes(node.type)) {
        const importText = this.getNodeText(node, content).trim();
        if (importText && !imports.includes(importText)) {
          imports.push(importText);
        }
      }
      for (const child of node.children) {
        traverse(child);
      }
    };

    traverse(rootNode);
    return imports;
  }

  private extractImportsFromNode(
    node: SyntaxNode,
    content: Buffer,
    config: LanguageConfig
  ): string[] {
    const imports: string[] = [];
    const importTypes = config.importTypes;

    const traverse = (n: SyntaxNode) => {
      if (importTypes.includes(n.type)) {
        const importText = this.getNodeText(n, content).trim();
        if (importText && !imports.includes(importText)) {
          imports.push(importText);
        }
      }
      for (const child of n.children) {
        traverse(child);
      }
    };

    traverse(node);
    return imports;
  }

  private extractCallsFromNode(
    node: SyntaxNode,
    content: Buffer,
    config: LanguageConfig
  ): string[] {
    const calls = new Set<string>();
    const callTypes = config.callTypes;

    const traverse = (n: SyntaxNode) => {
      if (callTypes.includes(n.type)) {
        const callName = this.getCallName(n, content);
        if (callName) calls.add(callName);
      }
      for (const child of n.children) {
        traverse(child);
      }
    };

    traverse(node);
    return [...calls].sort();
  }

  private getCallName(callNode: SyntaxNode, content: Buffer): string | undefined {
    for (const child of callNode.children) {
      if (['identifier', 'name', 'word', 'field_identifier'].includes(child.type)) {
        return this.getNodeText(child, content).trim();
      }
      if (child.type === 'attribute') {
        for (const subchild of child.children) {
          if (['identifier', 'property_identifier', 'field_identifier'].includes(subchild.type)) {
            return this.getNodeText(subchild, content).trim();
          }
        }
      }
      if (child.type === 'member_expression') {
        for (const subchild of child.children) {
          if (['property_identifier', 'identifier'].includes(subchild.type)) {
            return this.getNodeText(subchild, content).trim();
          }
        }
      }
      if (child.type === 'selector_expression') {
        for (const subchild of child.children) {
          if (['field_identifier', 'identifier'].includes(subchild.type)) {
            return this.getNodeText(subchild, content).trim();
          }
        }
      }
    }

    if (callNode.childCount > 0) {
      return this.getNodeText(callNode.children[0], content).trim().split('(')[0];
    }

    return undefined;
  }

  // ─── Helpers ───────────────────────────────────────────────────────────

  private extractDocstring(
    node: SyntaxNode,
    content: Buffer,
    config: LanguageConfig
  ): string {
    const body = this.getBodyNode(node, config);
    if (!body) return '';

    for (const child of body.children) {
      if (child.type === 'expression_statement') {
        for (const subchild of child.children) {
          if (['string', 'string_literal'].includes(subchild.type)) {
            return cleanDocstring(this.getNodeText(subchild, content));
          }
        }
      } else if (['string', 'string_literal', 'comment'].includes(child.type)) {
        return cleanDocstring(this.getNodeText(child, content));
      }
    }

    return '';
  }

  private getBodyNode(node: SyntaxNode, config: LanguageConfig): SyntaxNode | undefined {
    const bodyTypes = ['block', 'body', 'compound_statement', 'statement_block'];

    for (const child of node.children) {
      if (bodyTypes.includes(child.type)) return child;
    }

    const bodyField = config.bodyField;
    const body = node.childForFieldName(bodyField);
    if (body) return body;

    return undefined;
  }

  private getNodeName(
    node: SyntaxNode,
    content: Buffer,
    config: LanguageConfig
  ): string | undefined {
    // Try field-based access
    const nameNode = node.childForFieldName('name');
    if (nameNode) return this.getNodeText(nameNode, content).trim();

    // Try finding identifier child
    const idTypes = ['identifier', 'name', 'type_identifier', 'field_identifier', 'property_identifier'];
    for (const child of node.children) {
      if (idTypes.includes(child.type)) {
        return this.getNodeText(child, content).trim();
      }
    }

    // For C/C++ functions with declarators
    for (const child of node.children) {
      if (['declarator', 'function_declarator'].includes(child.type)) {
        return this.getNodeName(child, content, config);
      }
    }

    return undefined;
  }

  private getNodeText(node: SyntaxNode, content: Buffer): string {
    return content.subarray(node.startIndex, node.endIndex).toString('utf-8');
  }

  private getCodeSnippet(node: SyntaxNode, content: Buffer): string {
    const text = this.getNodeText(node, content);
    if (text.length > MAX_CODE_SNIPPET_CHARS) {
      return text.substring(0, MAX_CODE_SNIPPET_CHARS) + '...';
    }
    return text;
  }
}

// ─── Utility Functions ───────────────────────────────────────────────────────

function resolveGrammarVariant(language: string, grammar: any): any {
  if (language === 'typescript' && grammar.typescript) return grammar.typescript;
  if (language === 'php' && grammar.php) return grammar.php;
  if (language === 'ocaml' && grammar.ocaml) return grammar.ocaml;
  return grammar;
}

function isBinaryFile(content: Buffer): boolean {
  const sample = content.subarray(0, 8192);
  if (sample.includes(0)) return true;

  try {
    sample.toString('utf-8');
    return false;
  } catch {
    let textChars = 0;
    for (const b of sample) {
      if ((b >= 32 && b < 127) || b === 9 || b === 10 || b === 13) textChars++;
    }
    return sample.length > 0 && textChars / sample.length < 0.7;
  }
}

function isUpperCase(name: string): boolean {
  return name === name.toUpperCase() && /[A-Z]/.test(name);
}

function cleanDocstring(raw: string): string {
  let cleaned = raw.trim();

  // Remove triple quotes
  for (const quote of ['"""', "'''"]) {
    if (cleaned.startsWith(quote) && cleaned.endsWith(quote)) {
      cleaned = cleaned.slice(3, -3);
      break;
    }
  }

  // Remove single quotes
  for (const quote of ['"', "'"]) {
    if (cleaned.startsWith(quote) && cleaned.endsWith(quote)) {
      cleaned = cleaned.slice(1, -1);
      break;
    }
  }

  cleaned = cleaned.trim();

  // Extract first line/paragraph
  const lines = cleaned.split('\n').map(l => l.trim()).filter(l => l.length > 0);
  return lines.length > 0 ? lines[0] : cleaned;
}
