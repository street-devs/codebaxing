/**
 * Language-specific configurations for tree-sitter parsing.
 *
 * Supported Languages (24):
 *   Python, JavaScript, TypeScript, C, C++, Bash, Go, Java, Kotlin,
 *   Rust, Ruby, C#, PHP, Scala, Swift, Lua, Dart, Elixir, Haskell,
 *   OCaml, Zig, Perl, CSS, HTML
 */

import path from 'node:path';

// ─── Extension to Language Mapping ───────────────────────────────────────────

export const EXTENSION_MAP: Record<string, string> = {
  // Python
  '.py': 'python',
  '.pyi': 'python',
  '.pyw': 'python',

  // JavaScript/TypeScript
  '.js': 'javascript',
  '.jsx': 'javascript',
  '.mjs': 'javascript',
  '.cjs': 'javascript',
  '.ts': 'typescript',
  '.tsx': 'typescript',
  '.mts': 'typescript',
  '.cts': 'typescript',

  // C/C++
  '.c': 'c',
  '.h': 'c',
  '.cpp': 'cpp',
  '.cc': 'cpp',
  '.cxx': 'cpp',
  '.c++': 'cpp',
  '.hpp': 'cpp',
  '.hh': 'cpp',
  '.hxx': 'cpp',
  '.h++': 'cpp',

  // Bash
  '.sh': 'bash',
  '.bash': 'bash',
  '.zsh': 'bash',

  // Go
  '.go': 'go',

  // Java
  '.java': 'java',

  // Kotlin
  '.kt': 'kotlin',
  '.kts': 'kotlin',

  // Rust
  '.rs': 'rust',

  // Ruby
  '.rb': 'ruby',
  '.rake': 'ruby',
  '.gemspec': 'ruby',

  // C#
  '.cs': 'csharp',

  // PHP
  '.php': 'php',
  '.phtml': 'php',

  // Scala
  '.scala': 'scala',
  '.sc': 'scala',

  // Swift
  '.swift': 'swift',

  // Lua
  '.lua': 'lua',

  // Dart
  '.dart': 'dart',

  // Elixir
  '.ex': 'elixir',
  '.exs': 'elixir',

  // Haskell
  '.hs': 'haskell',
  '.lhs': 'haskell',

  // OCaml
  '.ml': 'ocaml',
  '.mli': 'ocaml',

  // Zig
  '.zig': 'zig',

  // Perl
  '.pl': 'perl',
  '.pm': 'perl',

  // CSS/SCSS
  '.css': 'css',
  '.scss': 'css',

  // HTML
  '.html': 'html',
  '.htm': 'html',

  // Vue (SFC)
  '.vue': 'vue',

  // Config/Data (indexable for search but fewer symbols)
  '.json': 'json',
  '.yaml': 'yaml',
  '.yml': 'yaml',
  '.toml': 'toml',

  // Makefile
  '.mk': 'make',
};

// ─── Language Configurations ─────────────────────────────────────────────────

export interface LanguageConfig {
  functionTypes: string[];
  classTypes: string[];
  methodTypes: string[];
  constantTypes?: string[];
  importTypes: string[];
  callTypes: string[];
  docstringField: string;
  identifierField: string;
  bodyField: string;
  [key: string]: unknown;
}

export const LANGUAGE_CONFIGS: Record<string, LanguageConfig> = {
  python: {
    functionTypes: ['function_definition'],
    classTypes: ['class_definition'],
    methodTypes: ['function_definition'],
    constantTypes: ['expression_statement'],
    importTypes: ['import_statement', 'import_from_statement'],
    callTypes: ['call'],
    docstringField: 'string',
    identifierField: 'name',
    bodyField: 'body',
  },

  javascript: {
    functionTypes: ['function_declaration', 'function', 'generator_function_declaration'],
    classTypes: ['class_declaration'],
    methodTypes: ['method_definition', 'function_expression', 'arrow_function'],
    constantTypes: ['lexical_declaration'],
    importTypes: ['import_statement', 'import_clause'],
    callTypes: ['call_expression', 'new_expression'],
    docstringField: 'comment',
    identifierField: 'name',
    bodyField: 'body',
  },

  typescript: {
    functionTypes: ['function_declaration', 'function_signature', 'generator_function_declaration'],
    classTypes: ['class_declaration', 'interface_declaration', 'type_alias_declaration'],
    methodTypes: ['method_definition', 'method_signature', 'arrow_function', 'function_expression'],
    importTypes: ['import_statement', 'import_clause'],
    callTypes: ['call_expression', 'new_expression'],
    docstringField: 'comment',
    identifierField: 'name',
    bodyField: 'body',
  },

  c: {
    functionTypes: ['function_definition', 'function_declarator'],
    classTypes: ['struct_specifier', 'union_specifier'],
    methodTypes: ['function_definition'],
    importTypes: ['preproc_include'],
    callTypes: ['call_expression'],
    docstringField: 'comment',
    identifierField: 'declarator',
    bodyField: 'body',
  },

  cpp: {
    functionTypes: ['function_definition'],
    classTypes: ['class_specifier', 'struct_specifier', 'union_specifier'],
    methodTypes: ['function_definition'],
    importTypes: ['preproc_include'],
    callTypes: ['call_expression'],
    docstringField: 'comment',
    identifierField: 'declarator',
    bodyField: 'body',
  },

  bash: {
    functionTypes: ['function_definition'],
    classTypes: [],
    methodTypes: [],
    constantTypes: ['declaration_command'],
    importTypes: ['command'],
    callTypes: ['command', 'command_substitution'],
    docstringField: 'comment',
    identifierField: 'name',
    bodyField: 'body',
  },

  go: {
    functionTypes: ['function_declaration'],
    classTypes: ['type_declaration'],
    methodTypes: ['method_declaration'],
    constantTypes: ['const_declaration'],
    importTypes: ['import_declaration', 'import_spec'],
    callTypes: ['call_expression'],
    docstringField: 'comment',
    identifierField: 'name',
    bodyField: 'body',
  },

  java: {
    functionTypes: ['method_declaration'],
    classTypes: ['class_declaration', 'interface_declaration', 'enum_declaration'],
    methodTypes: ['method_declaration', 'constructor_declaration'],
    constantTypes: ['field_declaration'],
    importTypes: ['import_declaration'],
    callTypes: ['method_invocation', 'object_creation_expression'],
    docstringField: 'comment',
    identifierField: 'name',
    bodyField: 'body',
  },

  kotlin: {
    functionTypes: ['function_declaration'],
    classTypes: ['class_declaration', 'object_declaration'],
    methodTypes: ['function_declaration'],
    constantTypes: ['property_declaration'],
    importTypes: ['import_header'],
    callTypes: ['call_expression'],
    docstringField: 'comment',
    identifierField: 'simple_identifier',
    bodyField: 'class_body',
  },

  // ─── New Languages ───────────────────────────────────────────────────────

  rust: {
    functionTypes: ['function_item'],
    classTypes: ['struct_item', 'enum_item', 'trait_item', 'impl_item', 'type_item'],
    methodTypes: ['function_item'],
    constantTypes: ['const_item', 'static_item'],
    importTypes: ['use_declaration'],
    callTypes: ['call_expression'],
    docstringField: 'line_comment',
    identifierField: 'name',
    bodyField: 'body',
  },

  ruby: {
    functionTypes: ['method', 'singleton_method'],
    classTypes: ['class', 'module'],
    methodTypes: ['method', 'singleton_method'],
    constantTypes: ['assignment'],
    importTypes: ['call'], // require / require_relative
    callTypes: ['call', 'method_call'],
    docstringField: 'comment',
    identifierField: 'name',
    bodyField: 'body',
  },

  csharp: {
    functionTypes: ['method_declaration'],
    classTypes: ['class_declaration', 'interface_declaration', 'struct_declaration', 'enum_declaration', 'record_declaration'],
    methodTypes: ['method_declaration', 'constructor_declaration'],
    constantTypes: ['field_declaration'],
    importTypes: ['using_directive'],
    callTypes: ['invocation_expression', 'object_creation_expression'],
    docstringField: 'comment',
    identifierField: 'name',
    bodyField: 'body',
  },

  php: {
    functionTypes: ['function_definition'],
    classTypes: ['class_declaration', 'interface_declaration', 'trait_declaration', 'enum_declaration'],
    methodTypes: ['method_declaration'],
    constantTypes: ['const_declaration'],
    importTypes: ['namespace_use_declaration'],
    callTypes: ['function_call_expression', 'member_call_expression', 'scoped_call_expression'],
    docstringField: 'comment',
    identifierField: 'name',
    bodyField: 'body',
  },

  scala: {
    functionTypes: ['function_definition', 'val_definition'],
    classTypes: ['class_definition', 'object_definition', 'trait_definition'],
    methodTypes: ['function_definition'],
    constantTypes: ['val_definition'],
    importTypes: ['import_declaration'],
    callTypes: ['call_expression'],
    docstringField: 'comment',
    identifierField: 'name',
    bodyField: 'body',
  },

  swift: {
    functionTypes: ['function_declaration'],
    classTypes: ['class_declaration', 'struct_declaration', 'protocol_declaration', 'enum_declaration'],
    methodTypes: ['function_declaration'],
    constantTypes: ['property_declaration'],
    importTypes: ['import_declaration'],
    callTypes: ['call_expression'],
    docstringField: 'comment',
    identifierField: 'name',
    bodyField: 'body',
  },

  lua: {
    functionTypes: ['function_declaration', 'function_definition_statement'],
    classTypes: [],
    methodTypes: ['function_declaration'],
    constantTypes: ['variable_declaration'],
    importTypes: ['function_call'], // require()
    callTypes: ['function_call'],
    docstringField: 'comment',
    identifierField: 'name',
    bodyField: 'body',
  },

  dart: {
    functionTypes: ['function_signature'],
    classTypes: ['class_definition', 'enum_declaration', 'mixin_declaration'],
    methodTypes: ['function_signature'],
    constantTypes: ['initialized_variable_definition'],
    importTypes: ['import_or_export'],
    callTypes: ['invocation_expression'],
    docstringField: 'comment',
    identifierField: 'name',
    bodyField: 'body',
  },

  elixir: {
    functionTypes: ['call'], // def/defp
    classTypes: ['call'], // defmodule
    methodTypes: ['call'],
    importTypes: ['call'], // import/use/require/alias
    callTypes: ['call'],
    docstringField: 'string',
    identifierField: 'name',
    bodyField: 'body',
  },

  haskell: {
    functionTypes: ['function', 'signature'],
    classTypes: ['type_class', 'datatype', 'newtype'],
    methodTypes: ['function'],
    constantTypes: ['signature'],
    importTypes: ['import'],
    callTypes: ['function_application'],
    docstringField: 'comment',
    identifierField: 'name',
    bodyField: 'body',
  },

  ocaml: {
    functionTypes: ['value_definition'],
    classTypes: ['type_definition', 'module_definition', 'class_definition'],
    methodTypes: ['method_definition'],
    importTypes: ['open_statement'],
    callTypes: ['application'],
    docstringField: 'comment',
    identifierField: 'name',
    bodyField: 'body',
  },

  zig: {
    functionTypes: ['FnProto'],
    classTypes: ['ContainerDecl'],
    methodTypes: ['FnProto'],
    constantTypes: ['VarDecl'],
    importTypes: [], // @import is a builtin call
    callTypes: ['FnCallExpr', 'BuiltinCallExpr'],
    docstringField: 'line_comment',
    identifierField: 'name',
    bodyField: 'body',
  },

  perl: {
    functionTypes: ['subroutine_declaration_statement'],
    classTypes: ['package_statement'],
    methodTypes: ['subroutine_declaration_statement'],
    importTypes: ['use_no_statement', 'require_expression'],
    callTypes: ['call_expression', 'method_call_expression'],
    docstringField: 'comment',
    identifierField: 'name',
    bodyField: 'body',
  },

  css: {
    functionTypes: [],
    classTypes: ['rule_set'],
    methodTypes: [],
    importTypes: ['import_statement'],
    callTypes: ['call_expression'],
    docstringField: 'comment',
    identifierField: 'name',
    bodyField: 'block',
  },

  html: {
    functionTypes: [],
    classTypes: ['element'],
    methodTypes: [],
    importTypes: [],
    callTypes: [],
    docstringField: 'comment',
    identifierField: 'tag_name',
    bodyField: 'body',
  },

  vue: {
    functionTypes: [],
    classTypes: ['element'],
    methodTypes: [],
    importTypes: [],
    callTypes: [],
    docstringField: 'comment',
    identifierField: 'tag_name',
    bodyField: 'body',
  },

  json: {
    functionTypes: [],
    classTypes: ['object'],
    methodTypes: [],
    importTypes: [],
    callTypes: [],
    docstringField: '',
    identifierField: 'key',
    bodyField: 'body',
  },

  yaml: {
    functionTypes: [],
    classTypes: ['block_mapping'],
    methodTypes: [],
    importTypes: [],
    callTypes: [],
    docstringField: 'comment',
    identifierField: 'key',
    bodyField: 'body',
  },

  toml: {
    functionTypes: [],
    classTypes: ['table'],
    methodTypes: [],
    importTypes: [],
    callTypes: [],
    docstringField: 'comment',
    identifierField: 'key',
    bodyField: 'body',
  },

  make: {
    functionTypes: ['rule'],
    classTypes: [],
    methodTypes: [],
    constantTypes: ['variable_assignment'],
    importTypes: ['include_directive'],
    callTypes: ['function_call'],
    docstringField: 'comment',
    identifierField: 'name',
    bodyField: 'recipe',
  },
};

// ─── Helper Functions ────────────────────────────────────────────────────────

export function getLanguageForFile(filepath: string): string | undefined {
  const ext = path.extname(filepath).toLowerCase();
  return EXTENSION_MAP[ext];
}

export function getConfigForLanguage(language: string): LanguageConfig {
  const config = LANGUAGE_CONFIGS[language];
  if (!config) {
    throw new Error(
      `Unsupported language: ${language}. Supported: ${Object.keys(LANGUAGE_CONFIGS).join(', ')}`
    );
  }
  return config;
}

export function getSupportedExtensions(): Set<string> {
  return new Set(Object.keys(EXTENSION_MAP));
}
