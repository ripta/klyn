// OCR helpers shared by tools/parse-receipt.mjs and tools/capture-ocr.mjs.
// Pipes the image through `magick … -auto-orient` so EXIF rotation is applied
// before tesseract sees it (the browser does the equivalent via
// createImageBitmap({ imageOrientation: 'from-image' })), then runs tesseract
// with the same PSM and char whitelist as the browser config in
// public/bill-splitter/ocr.js so the parser sees the same shape.

import { spawnSync } from 'node:child_process';

export const WHITELIST =
    'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789.,$%/#@:&\'"() -';

export function ocrImage(path) {
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
    return parseTsv(tess.stdout.toString('utf-8'));
}

export function parseTsv(tsv) {
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
