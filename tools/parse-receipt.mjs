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

import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { existsSync, readFileSync } from 'node:fs';

import { parseReceipt } from '../public/bill-splitter/parser.js';

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

// Match the browser config in ocr.js exactly.
const WHITELIST =
    'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789.,$%/#@:&\'"() -';

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
    const tsv = ocrWithAutoOrient(inputPath);
    ocr = parseTsv(tsv);
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

// Pipe the image through `magick … -auto-orient` so EXIF rotation is applied
// before tesseract sees it. The browser does the equivalent via
// createImageBitmap({ imageOrientation: 'from-image' }).
function ocrWithAutoOrient(path) {
    const magick = spawnSync('magick', [path, '-auto-orient', 'png:-'], {
        maxBuffer: 256 * 1024 * 1024,
    });
    if (magick.status !== 0) {
        throw new Error(`magick failed: ${magick.stderr?.toString() || 'no stderr'}`);
    }
    const tess = spawnSync(
        'tesseract',
        [
            'stdin',
            'stdout',
            '-l',
            'eng',
            '--psm',
            '3',
            '-c',
            `tessedit_char_whitelist=${WHITELIST}`,
            '-c',
            'preserve_interword_spaces=1',
            'tsv',
        ],
        { input: magick.stdout, maxBuffer: 64 * 1024 * 1024 },
    );
    if (tess.status !== 0) {
        throw new Error(`tesseract failed: ${tess.stderr?.toString() || 'no stderr'}`);
    }
    return tess.stdout.toString('utf-8');
}

function parseTsv(tsv) {
    const rows = tsv.split('\n');
    const header = rows[0].split('\t');
    const col = (name) => header.indexOf(name);
    const iLevel = col('level');
    const iBlock = col('block_num');
    const iPar = col('par_num');
    const iLine = col('line_num');
    const iLeft = col('left');
    const iTop = col('top');
    const iWidth = col('width');
    const iHeight = col('height');
    const iConf = col('conf');
    const iText = col('text');

    const words = [];
    const linesMap = new Map();
    let wordCounter = 0;

    for (let i = 1; i < rows.length; i++) {
        const row = rows[i].split('\t');
        if (row.length < header.length) continue;
        const level = Number(row[iLevel]);
        if (level !== 5) continue;
        const text = (row[iText] ?? '').trim();
        if (!text) continue;

        const lineId = `${row[iBlock]}.${row[iPar]}.${row[iLine]}`;
        const x0 = Number(row[iLeft]);
        const y0 = Number(row[iTop]);
        const x1 = x0 + Number(row[iWidth]);
        const y1 = y0 + Number(row[iHeight]);
        const confidence = Number(row[iConf]);

        const wordId = `w-${++wordCounter}`;
        const word = { id: wordId, lineId, text, bbox: { x0, y0, x1, y1 }, confidence };
        words.push(word);

        if (!linesMap.has(lineId)) {
            linesMap.set(lineId, {
                id: lineId,
                words: [],
                bbox: { x0, y0, x1, y1 },
                confidence,
            });
        }
        const line = linesMap.get(lineId);
        line.words.push(word);
        line.bbox.x0 = Math.min(line.bbox.x0, x0);
        line.bbox.y0 = Math.min(line.bbox.y0, y0);
        line.bbox.x1 = Math.max(line.bbox.x1, x1);
        line.bbox.y1 = Math.max(line.bbox.y1, y1);
        line.confidence = Math.min(line.confidence, confidence);
    }

    const lines = [...linesMap.values()].map((l) => ({
        id: l.id,
        text: l.words.map((w) => w.text).join(' '),
        bbox: l.bbox,
        confidence: l.confidence,
        wordIds: l.words.map((w) => w.id),
    }));

    const rawText = lines.map((l) => l.text).join('\n');
    return { words, lines, rawText };
}

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
