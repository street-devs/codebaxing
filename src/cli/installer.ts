#!/usr/bin/env node
/**
 * CLI for Codebaxing MCP server.
 *
 * Usage:
 *   npx codebaxing install          # Install to Claude Desktop
 *   npx codebaxing install --cursor # Install to Cursor
 *   npx codebaxing index <path>     # Index a codebase
 *   npx codebaxing search <query>   # Search indexed codebase
 *   npx codebaxing stats            # Show index statistics
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

// ─── Types ───────────────────────────────────────────────────────────────────

interface McpServerConfig {
  command: string;
  args?: string[];
  env?: Record<string, string>;
}

interface EditorConfig {
  name: string;
  configPath: string;
  configKey: string;
  serverConfig: McpServerConfig | Record<string, unknown>;
}

// ─── Config Paths ────────────────────────────────────────────────────────────

const HOME = os.homedir();
const PLATFORM = process.platform;

function getEditorConfigs(): EditorConfig[] {
  const configs: EditorConfig[] = [];

  // Default server config with ChromaDB URL (required)
  const defaultServerConfig = {
    command: 'npx',
    args: ['-y', 'codebaxing'],
    env: { CHROMADB_URL: 'http://localhost:8000' },
  };

  // Claude Desktop
  if (PLATFORM === 'darwin') {
    configs.push({
      name: 'Claude Desktop',
      configPath: path.join(HOME, 'Library', 'Application Support', 'Claude', 'claude_desktop_config.json'),
      configKey: 'mcpServers',
      serverConfig: defaultServerConfig,
    });
  } else if (PLATFORM === 'win32') {
    configs.push({
      name: 'Claude Desktop',
      configPath: path.join(process.env.APPDATA || '', 'Claude', 'claude_desktop_config.json'),
      configKey: 'mcpServers',
      serverConfig: defaultServerConfig,
    });
  } else {
    configs.push({
      name: 'Claude Desktop',
      configPath: path.join(HOME, '.config', 'claude', 'claude_desktop_config.json'),
      configKey: 'mcpServers',
      serverConfig: defaultServerConfig,
    });
  }

  // Cursor
  configs.push({
    name: 'Cursor',
    configPath: path.join(HOME, '.cursor', 'mcp.json'),
    configKey: 'mcpServers',
    serverConfig: defaultServerConfig,
  });

  // Windsurf
  configs.push({
    name: 'Windsurf',
    configPath: path.join(HOME, '.codeium', 'windsurf', 'mcp_config.json'),
    configKey: 'mcpServers',
    serverConfig: defaultServerConfig,
  });

  // Zed (different format)
  configs.push({
    name: 'Zed',
    configPath: path.join(HOME, '.config', 'zed', 'settings.json'),
    configKey: 'context_servers',
    serverConfig: {
      command: { path: 'npx', args: ['-y', 'codebaxing'] },
      env: { CHROMADB_URL: 'http://localhost:8000' },
    },
  });

  return configs;
}

// ─── JSON Helpers ────────────────────────────────────────────────────────────

function readJsonFile(filePath: string): Record<string, unknown> {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  } catch {
    return {};
  }
}

function writeJsonFile(filePath: string, data: Record<string, unknown>): void {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n');
}

// ─── Install/Uninstall ───────────────────────────────────────────────────────

function installToEditor(editor: EditorConfig): boolean {
  console.log(`\n📦 Installing to ${editor.name}...`);
  const config = readJsonFile(editor.configPath);
  if (!config[editor.configKey]) config[editor.configKey] = {};
  const servers = config[editor.configKey] as Record<string, unknown>;

  if (servers.codebaxing) {
    console.log(`   ✓ Already installed`);
    return true;
  }

  servers.codebaxing = editor.serverConfig;
  try {
    writeJsonFile(editor.configPath, config);
    console.log(`   ✓ Installed to ${editor.configPath}`);
    return true;
  } catch (err) {
    console.error(`   ✗ Failed: ${(err as Error).message}`);
    return false;
  }
}

function uninstallFromEditor(editor: EditorConfig): boolean {
  if (!fs.existsSync(editor.configPath)) return true;
  console.log(`\n🗑️  Uninstalling from ${editor.name}...`);

  const config = readJsonFile(editor.configPath);
  const servers = config[editor.configKey] as Record<string, unknown> | undefined;
  if (!servers?.codebaxing) {
    console.log(`   ✓ Not installed`);
    return true;
  }

  delete servers.codebaxing;
  try {
    writeJsonFile(editor.configPath, config);
    console.log(`   ✓ Removed`);
    return true;
  } catch (err) {
    console.error(`   ✗ Failed: ${(err as Error).message}`);
    return false;
  }
}

// ─── Index Command ───────────────────────────────────────────────────────────

async function runIndex(codebasePath: string): Promise<void> {
  const absolutePath = path.resolve(codebasePath);

  if (!fs.existsSync(absolutePath)) {
    console.error(`\n❌ Path does not exist: ${absolutePath}`);
    process.exit(1);
  }

  console.log('\n🔧 Codebaxing - Index Codebase\n');
  console.log(`📁 Path: ${absolutePath}\n`);

  // Check ChromaDB connection first
  await checkChromaDBConnection();

  // Dynamic import to avoid loading heavy dependencies upfront
  const { SourceRetriever } = await import('../indexing/source-retriever.js');

  try {
    const retriever = new SourceRetriever({
      codebasePath: absolutePath,
      embeddingModel: 'all-MiniLM-L6-v2',
      verbose: true,
    });

    await retriever.indexCodebase();

    const stats = retriever.getStats();
    console.log('\n📊 Index Statistics:');
    console.log(`   Files:   ${stats.totalFiles}`);
    console.log(`   Symbols: ${stats.totalSymbols}`);
    console.log(`   Chunks:  ${stats.totalChunks}`);
    console.log(`   Time:    ${stats.indexingTime?.toFixed(1)}s\n`);
  } catch (err) {
    const message = (err as Error).message;
    if (message.includes('chromadb') || message.includes('Failed to connect')) {
      showChromaDBError();
    }
    throw err;
  }
}

// ─── Search Command ──────────────────────────────────────────────────────────

function showChromaDBError(): void {
  console.error('\n❌ ChromaDB connection failed!\n');
  console.error('CLI commands require ChromaDB server running.\n');
  console.error('Quick fix:\n');
  console.error('  1. Start ChromaDB:');
  console.error('     docker run -d -p 8000:8000 chromadb/chroma\n');
  console.error('  2. Set environment variable:');
  console.error('     export CHROMADB_URL=http://localhost:8000\n');
  console.error('  3. Run again\n');
  process.exit(1);
}

async function checkChromaDBConnection(): Promise<void> {
  const chromaUrl = process.env.CHROMADB_URL;

  if (!chromaUrl) {
    console.error('\n❌ CHROMADB_URL environment variable is not set!\n');
    console.error('Quick fix:\n');
    console.error('  1. Start ChromaDB:');
    console.error('     docker run -d -p 8000:8000 chromadb/chroma\n');
    console.error('  2. Set environment variable:');
    console.error('     export CHROMADB_URL=http://localhost:8000\n');
    console.error('  3. Run again\n');
    process.exit(1);
  }

  console.log(`🔗 Checking ChromaDB connection (${chromaUrl})...`);

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000); // 3 second timeout

    // Try v2 API first, fallback to v1 for older ChromaDB versions
    let response = await fetch(`${chromaUrl}/api/v2/heartbeat`, {
      signal: controller.signal,
    });

    // Fallback to v1 if v2 not found
    if (response.status === 404) {
      response = await fetch(`${chromaUrl}/api/v1/heartbeat`, {
        signal: controller.signal,
      });
    }

    clearTimeout(timeout);

    if (!response.ok) {
      showChromaDBError();
    }

    console.log('✅ ChromaDB connected\n');
  } catch (err) {
    showChromaDBError();
  }
}

async function runSearch(query: string, options: { path?: string; limit?: number }): Promise<void> {
  const codebasePath = options.path || process.cwd();
  const absolutePath = path.resolve(codebasePath);
  const limit = options.limit || 5;

  console.log('\n🔧 Codebaxing - Search\n');
  console.log(`📁 Path:  ${absolutePath}`);
  console.log(`🔍 Query: "${query}"`);
  console.log(`📊 Limit: ${limit}\n`);

  // Check ChromaDB connection first
  await checkChromaDBConnection();

  const { SourceRetriever } = await import('../indexing/source-retriever.js');

  try {
    const retriever = new SourceRetriever({
      codebasePath: absolutePath,
      embeddingModel: 'all-MiniLM-L6-v2',
      verbose: false,
    });

    // Check if index exists, if not, index first
    const stats = retriever.getStats();
    if (stats.totalChunks === 0) {
      console.log('⚠️  No index found. Indexing first...\n');
      await retriever.indexCodebase();
      console.log('');
    }

    const { sources } = await retriever.getSourcesForQuestion(query, { nResults: limit });

    if (sources.length === 0) {
      console.log('❌ No results found.\n');
      return;
    }

    console.log('─'.repeat(60));
    console.log('Results:\n');

    sources.forEach((source, i) => {
      console.log(`${i + 1}. ${source}`);
    });

    console.log('\n' + '─'.repeat(60) + '\n');
  } catch (err) {
    const message = (err as Error).message;
    if (message.includes('chromadb') || message.includes('Failed to connect')) {
      showChromaDBError();
    }
    throw err;
  }
}

// ─── Stats Command ───────────────────────────────────────────────────────────

async function runStats(codebasePath?: string): Promise<void> {
  const absolutePath = path.resolve(codebasePath || process.cwd());

  console.log('\n🔧 Codebaxing - Statistics\n');
  console.log(`📁 Path: ${absolutePath}\n`);

  // Check ChromaDB connection first
  await checkChromaDBConnection();

  const { SourceRetriever } = await import('../indexing/source-retriever.js');

  try {
    const retriever = new SourceRetriever({
      codebasePath: absolutePath,
      embeddingModel: 'all-MiniLM-L6-v2',
      verbose: false,
    });

    const stats = retriever.getStats();

    console.log('📊 Index Statistics:');
    console.log(`   Files:       ${stats.totalFiles}`);
    console.log(`   Symbols:     ${stats.totalSymbols}`);
    console.log(`   Chunks:      ${stats.totalChunks}`);
    console.log(`   Parse Errors: ${stats.parseErrors}`);
    if (stats.indexingTime) {
      console.log(`   Index Time:  ${stats.indexingTime.toFixed(1)}s`);
    }
    console.log('');
  } catch (err) {
    const message = (err as Error).message;
    if (message.includes('chromadb') || message.includes('Failed to connect')) {
      showChromaDBError();
    }
    throw err;
  }
}

// ─── CLI ─────────────────────────────────────────────────────────────────────

function printUsage(): void {
  console.log(`
Codebaxing - Semantic code search via MCP

Usage:
  npx codebaxing install [options]     Install MCP server to editors
  npx codebaxing uninstall [options]   Uninstall MCP server
  npx codebaxing index <path>          Index a codebase
  npx codebaxing search <query> [opts] Search indexed codebase
  npx codebaxing stats [path]          Show index statistics

Install Options:
  --claude     Claude Desktop (default)
  --cursor     Cursor
  --windsurf   Windsurf (Codeium)
  --zed        Zed
  --all        All supported editors

Search Options:
  --path, -p   Codebase path (default: current directory)
  --limit, -n  Number of results (default: 5)

Examples:
  npx codebaxing install                    # Install to Claude Desktop
  npx codebaxing install --all              # Install to all editors
  npx codebaxing index ./my-project         # Index a project
  npx codebaxing search "auth middleware"   # Search current directory
  npx codebaxing search "login" -p ./src -n 10
`);
}

function parseEditorArgs(args: string[]): string[] {
  const editors: string[] = [];
  for (const arg of args) {
    if (arg === '--claude') editors.push('Claude Desktop');
    else if (arg === '--cursor') editors.push('Cursor');
    else if (arg === '--windsurf') editors.push('Windsurf');
    else if (arg === '--zed') editors.push('Zed');
    else if (arg === '--all') editors.push('all');
  }
  return editors.length ? editors : ['Claude Desktop'];
}

function parseSearchArgs(args: string[]): { query: string; path?: string; limit?: number } {
  let query = '';
  let searchPath: string | undefined;
  let limit: number | undefined;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--path' || arg === '-p') {
      searchPath = args[++i];
    } else if (arg === '--limit' || arg === '-n') {
      limit = parseInt(args[++i], 10);
    } else if (!arg.startsWith('-')) {
      query = arg;
    }
  }

  return { query, path: searchPath, limit };
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const command = args[0] || '';

  // MCP server mode (no args or unknown command)
  if (!command || !['install', 'uninstall', 'index', 'search', 'stats', 'help', '--help', '-h'].includes(command)) {
    import('../mcp/server.js').catch(() => printUsage());
    return;
  }

  // Help
  if (command === 'help' || command === '--help' || command === '-h') {
    printUsage();
    return;
  }

  // Install
  if (command === 'install') {
    const editors = parseEditorArgs(args.slice(1));
    const allEditors = getEditorConfigs();
    const selected = editors.includes('all') ? allEditors : allEditors.filter(e => editors.includes(e.name));

    console.log('\n🔧 Codebaxing MCP Server Installer\n');
    let success = 0;
    for (const editor of selected) {
      if (installToEditor(editor)) success++;
    }
    console.log('\n' + '─'.repeat(50));
    console.log(`\n✨ Done! (${success}/${selected.length})`);
    console.log('\n📝 Next steps:');
    console.log('   1. Start ChromaDB (required):');
    console.log('      docker run -d -p 8000:8000 --name chromadb chromadb/chroma');
    console.log('   2. Restart your editor');
    console.log('   3. Ask: "Index my project at /path/to/project"\n');
    return;
  }

  // Uninstall
  if (command === 'uninstall') {
    const editors = parseEditorArgs(args.slice(1));
    const allEditors = getEditorConfigs();
    const selected = editors.includes('all') ? allEditors : allEditors.filter(e => editors.includes(e.name));

    console.log('\n🔧 Codebaxing MCP Server Uninstaller\n');
    let success = 0;
    for (const editor of selected) {
      if (uninstallFromEditor(editor)) success++;
    }
    console.log('\n' + '─'.repeat(50));
    console.log(`\n✨ Done! (${success}/${selected.length})\n`);
    return;
  }

  // Index
  if (command === 'index') {
    const codebasePath = args[1];
    if (!codebasePath) {
      console.error('\n❌ Usage: npx codebaxing index <path>\n');
      process.exit(1);
    }
    await runIndex(codebasePath);
    return;
  }

  // Search
  if (command === 'search') {
    const { query, path: searchPath, limit } = parseSearchArgs(args.slice(1));
    if (!query) {
      console.error('\n❌ Usage: npx codebaxing search <query> [--path <path>] [--limit <n>]\n');
      process.exit(1);
    }
    await runSearch(query, { path: searchPath, limit });
    return;
  }

  // Stats
  if (command === 'stats') {
    await runStats(args[1]);
    return;
  }
}

main().catch((err) => {
  console.error('Error:', err.message);
  process.exit(1);
});
