#!/usr/bin/env node
// Re-accept the current parser output as the regression baseline for every
// fixture. Run this after an intentional parser change once you've eyeballed
// the new behavior and decided it's the new normal.
//
// Only the `baseline` field is overwritten — `truth` (the hand-curated ground
// truth) is preserved so that the truth-vs-baseline accuracy report keeps
// working across re-blessings.

import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseReceipt } from '../public/bill-splitter/parser.js';
import { canonicalize } from './lib/golden.mjs';

const FIXTURE_DIR = new URL('../tests/fixtures/bill-splitter/', import.meta.url).pathname;

const goldens = readdirSync(FIXTURE_DIR).filter((n) => n.endsWith('.golden.json'));

for (const name of goldens) {
    const id = name.replace(/\.golden\.json$/, '');
    const goldenPath = join(FIXTURE_DIR, name);
    const ocrPath = join(FIXTURE_DIR, `${id}.ocr.json`);
    const golden = JSON.parse(readFileSync(goldenPath, 'utf-8'));
    if (golden.unblessed) {
        console.log(`skip   ${id} (unblessed)`);
        continue;
    }
    const ocr = JSON.parse(readFileSync(ocrPath, 'utf-8'));
    golden.baseline = canonicalize(parseReceipt(ocr));
    writeFileSync(goldenPath, JSON.stringify(golden, null, 2) + '\n');
    console.log(`bless  ${id}`);
}
