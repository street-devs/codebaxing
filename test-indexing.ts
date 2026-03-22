/**
 * Test script to verify indexing and search functionality.
 * Run with: npx tsx test-indexing.ts
 */

import { SourceRetriever } from './src/indexing/source-retriever.js';
import path from 'node:path';

const CODEBASE_PATH = path.resolve('../codebaxing');

async function main() {
  console.log('='.repeat(60));
  console.log('CODEBAXING-NODE TEST');
  console.log('='.repeat(60));
  console.log(`\nIndexing: ${CODEBASE_PATH}\n`);

  const retriever = new SourceRetriever({
    codebasePath: CODEBASE_PATH,
    embeddingModel: 'all-MiniLM-L6-v2',
    verbose: true,
  });

  // Index the codebase
  console.log('\n--- INDEXING ---\n');
  await retriever.indexCodebase();

  // Get stats
  console.log('\n--- STATS ---\n');
  const stats = retriever.getStats();
  console.log(JSON.stringify(stats, null, 2));

  // Test search queries
  const queries = [
    'semantic search for code',
    'parse python file',
    'embedding model',
    'MCP server tools',
    'memory retriever',
  ];

  console.log('\n--- SEARCH TESTS ---\n');

  for (const query of queries) {
    console.log(`\n🔍 Query: "${query}"`);
    console.log('-'.repeat(50));

    const { documents, sources } = await retriever.getSourcesForQuestion(query, {
      nResults: 3,
    });

    if (sources.length === 0) {
      console.log('  No results found');
    } else {
      sources.forEach((source, i) => {
        console.log(`  ${i + 1}. ${source}`);
      });
    }
  }

  console.log('\n' + '='.repeat(60));
  console.log('TEST COMPLETE');
  console.log('='.repeat(60));
}

main().catch(console.error);
