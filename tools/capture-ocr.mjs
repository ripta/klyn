#!/usr/bin/env node
// Run tesseract on every image in tests/fixtures/bill-splitter/ and write a
// committed <id>.ocr.json snapshot of { words, lines, rawText } next to it.
//
// Committing the OCR snapshot decouples the parser regression tests from the
// host environment (tesseract version, locales, magick build), so the tests
// stay fast and deterministic. Re-run this script only when OCR config —
// PSM, char whitelist, or magick preprocessing — intentionally changes.
//
//   node tools/capture-ocr.mjs            # skip fixtures that already have ocr.json
//   node tools/capture-ocr.mjs --force    # regenerate everything

import { readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, parse as parsePath } from 'node:path';
import { ocrImage } from './lib/ocr.mjs';

const FIXTURE_DIR = new URL('../tests/fixtures/bill-splitter/', import.meta.url).pathname;
const IMAGE_EXT = new Set(['.jpg', '.jpeg', '.png', '.webp']);

const force = process.argv.slice(2).includes('--force');

const images = readdirSync(FIXTURE_DIR)
    .map((name) => ({ name, parsed: parsePath(name) }))
    .filter((e) => IMAGE_EXT.has(e.parsed.ext.toLowerCase()));

let captured = 0;
let skipped = 0;
for (const img of images) {
    const outPath = join(FIXTURE_DIR, `${img.parsed.name}.ocr.json`);
    if (!force && exists(outPath)) {
        console.log(`skip   ${img.name}`);
        skipped++;
        continue;
    }
    console.log(`ocr    ${img.name}`);
    const ocr = ocrImage(join(FIXTURE_DIR, img.name));
    writeFileSync(outPath, JSON.stringify(ocr, null, 2) + '\n');
    captured++;
}

console.log(`\ncaptured ${captured}, skipped ${skipped}`);

function exists(path) {
    try {
        statSync(path);
        return true;
    } catch {
        return false;
    }
}
