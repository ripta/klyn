#!/usr/bin/env node
// Run the bill-splitter OCR + parse pipeline against a local image, using the
// system `tesseract` binary. Mirrors the browser path: same PSM, same char
// whitelist, same parser. Use to iterate on parser logic without the browser.
//
//   node tools/parse-receipt.mjs path/to/receipt.jpg
//   node tools/parse-receipt.mjs path/to/receipt.jpg --raw     # also print OCR text
//   node tools/parse-receipt.mjs path/to/receipt.jpg --json    # dump structured OCR + result
//   node tools/parse-receipt.mjs path/to/ocr.json --fixture    # skip OCR; load { words, lines, rawText }
//
// To grab a fixture from the browser, after picking an image, run in the
// devtools console:
//   copy(JSON.stringify(__billSplitter.state.ocr))
// then paste into a .json file and feed it back here with --fixture.

import { resolve } from 'node:path';
import { existsSync, readFileSync } from 'node:fs';

import { parseReceipt } from '../public/bill-splitter/parser.js';
import { ocrImage } from './lib/ocr.mjs';

const argv = process.argv.slice(2);
const flags = new Set(argv.filter((a) => a.startsWith('--')));
const positional = argv.filter((a) => !a.startsWith('--'));

if (positional.length < 1) {
    console.error(
        'usage: node tools/parse-receipt.mjs <image-or-json> [--raw] [--json] [--fixture]',
    );
    process.exit(2);
}

const inputPath = resolve(positional[0]);
if (!existsSync(inputPath)) {
    console.error(`file not found: ${inputPath}`);
    process.exit(2);
}

let ocr;
if (flags.has('--fixture')) {
    const raw = JSON.parse(readFileSync(inputPath, 'utf-8'));
    // Allow either a bare {words,lines,rawText} object or one wrapped under
    // .ocr (matching the --json output of this same tool, or state.ocr).
    ocr = raw.ocr ?? raw;
    if (!Array.isArray(ocr.words) || !Array.isArray(ocr.lines)) {
        console.error('fixture JSON must contain `words` and `lines` arrays');
        process.exit(2);
    }
    if (typeof ocr.rawText !== 'string') ocr.rawText = '';
} else {
    ocr = ocrImage(inputPath);
}

const result = parseReceipt(ocr);

if (flags.has('--json')) {
    console.log(JSON.stringify({ ocr, result }, replacer, 2));
    process.exit(0);
}

if (flags.has('--raw')) {
    section('OCR raw text');
    console.log(ocr.rawText.trim() || '(empty)');
}

section(`Items (${result.items.length})`);
if (result.items.length === 0) {
    console.log('  (none)');
} else {
    for (const item of result.items) {
        const conf = `${Math.round(item.confidence)}%`.padStart(4);
        console.log(`  ${pad(item.name, 38)}  ${money(item.price).padStart(9)}  ${conf}`);
    }
}

section(`Fees (${result.fees.length})`);
if (result.fees.length === 0) {
    console.log('  (none)');
} else {
    for (const fee of result.fees) {
        const label = `${fee.type}: ${fee.label}`;
        console.log(`  ${pad(label, 38)}  ${money(fee.amount).padStart(9)}`);
    }
}

if (result.warnings.length) {
    section('Warnings');
    for (const w of result.warnings) console.log(`  - ${w}`);
}

section('Diagnostics');
console.log('  locale:', result.detectedLocale);
console.log('  words:', result.diagnostics.wordCount);
console.log('  lines:', result.diagnostics.lineCount);
console.log('  priceColumnXRange:', result.diagnostics.priceColumnXRange);
console.log('  totalsRegionStartY:', result.diagnostics.totalsRegionStartY);

// ─── helpers ────────────────────────────────────────────────────────────────

function section(title) {
    console.log(`\n── ${title} ──`);
}

function pad(s, n) {
    s = String(s);
    return s.length < n ? s + ' '.repeat(n - s.length) : s.slice(0, n);
}

function money(n) {
    return Number(n).toFixed(2);
}

function replacer(_key, value) {
    if (value instanceof Set) return [...value];
    return value;
}
