// Real end-to-end check of the retrieval path: downloads the embedding model
// (cached after first run) and runs actual queries against the real corpora.
// Separate from the fast Vitest suite on purpose — this one is genuinely
// slow and network-dependent the first time it runs.

import { retrieve } from '../src/lib/rag/retrieve';

const QUERIES = [
  'What does ERISA require for pre-service claims?',
  'What counts as upcoding?',
  "What's the coverage rate for an out-of-network claim?",
  'Does emergency care need prior authorization?',
];

async function main() {
  for (const query of QUERIES) {
    console.log(`\nQ: ${query}`);
    const results = await retrieve(query); // default k
    results.forEach((r, i) => {
      console.log(`  ${i + 1}. [${r.score.toFixed(3)}] ${r.corpusTitle} — ${r.heading}`);
    });
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
