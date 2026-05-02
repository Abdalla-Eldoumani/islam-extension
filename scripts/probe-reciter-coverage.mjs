// One-shot CLI runner for the reciter coverage probe. Useful when verifying
// the catalogue against the public CDNs without waiting for the in-extension
// alarm to fire.
//
// Usage: node scripts/probe-reciter-coverage.mjs [--json]

import { fetchReciters } from '../shared/reciter-catalogue.js';
import { probeCoverage } from '../shared/reciter-coverage.js';

const printJson = process.argv.includes('--json');

const reciters = await fetchReciters();
console.error(`probing ${reciters.length} reciters...`);
const coverage = await probeCoverage(reciters);

if (printJson) {
  console.log(JSON.stringify(coverage, null, 2));
} else {
  let complete = 0;
  let limited = 0;
  for (const r of reciters) {
    const label = coverage.map[r.id];
    if (label === 'complete') complete++;
    else if (label === 'limited') limited++;
    console.log(`${label.padEnd(8)}  ${r.id.padEnd(28)}  ${r.reciter_name}`);
  }
  console.error(`done: ${complete} complete, ${limited} limited, ${reciters.length - complete - limited} other`);
}
