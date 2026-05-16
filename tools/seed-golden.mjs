#!/usr/bin/env node
// For each <id>.ocr.json under tests/fixtures/bill-splitter/, write a
// <id>.golden.json with the current canonical parser output as `baseline` and
// `truth` left null for hand entry.
//
// See tools/lib/golden.mjs for the contract between the two fields. This
// script is one-shot per fixture (existing goldens are preserved unless
// --force is passed) so it doesn't clobber hand-edited `truth` values.

import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseReceipt } from '../public/bill-splitter/parser.js';
import { canonicalize } from './lib/golden.mjs';

const FIXTURE_DIR = new URL('../tests/fixtures/bill-splitter/', import.meta.url).pathname;

const force = process.argv.slice(2).includes('--force');

const ocrFiles = readdirSync(FIXTURE_DIR).filter((n) => n.endsWith('.ocr.json'));

let written = 0;
let skipped = 0;
for (const ocrName of ocrFiles) {
    const id = ocrName.replace(/\.ocr\.json$/, '');
    const goldenPath = join(FIXTURE_DIR, `${id}.golden.json`);
    if (!force && exists(goldenPath)) {
        console.log(`skip   ${id}`);
        skipped++;
        continue;
    }
    const ocr = JSON.parse(readFileSync(join(FIXTURE_DIR, ocrName), 'utf-8'));
    const baseline = canonicalize(parseReceipt(ocr));
    const golden = { fixture: id, truth: null, baseline };
    writeFileSync(goldenPath, JSON.stringify(golden, null, 2) + '\n');
    console.log(`write  ${id}`);
    written++;
}
console.log(`\nwritten ${written}, skipped ${skipped}`);

function exists(path) {
    try {
        statSync(path);
        return true;
    } catch {
        return false;
    }
}
