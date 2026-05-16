// Tesseract.js wrapper. Assumes `Tesseract` is loaded as a global via the
// jsDelivr UMD bundle in index.html.
//
// Normalizes Tesseract's nested result into a flat shape with stable ids:
//   { words: [{id, lineId, text, bbox:{x0,y0,x1,y1}, confidence}],
//     lines: [{id, text, bbox, confidence, wordIds:[]}] }

export async function createOcrSession({ onProgress } = {}) {
    if (typeof Tesseract === 'undefined') {
        throw new Error('Tesseract.js not loaded. Check the <script> tag in index.html.');
    }

    const worker = await Tesseract.createWorker('eng', 1, {
        logger: (m) => {
            if (onProgress) onProgress(m);
        },
    });

    // PSM 4 = SINGLE_COLUMN. Pass the literal so we don't depend on
    // Tesseract.PSM being exposed on the global across versions.
    await worker.setParameters({
        tessedit_pageseg_mode: 4,
        tessedit_char_whitelist: "0-9A-Za-z.,$%/#@:&'\"() -",
        preserve_interword_spaces: '1',
    });

    return {
        async recognize(blob) {
            const result = await worker.recognize(blob);
            return normalize(result.data);
        },
        async terminate() {
            await worker.terminate();
        },
    };
}

function normalize(data) {
    const lines = [];
    const words = [];
    let lineCounter = 0;
    let wordCounter = 0;

    const linesArr = data.lines || [];
    for (const tline of linesArr) {
        const lineId = `l-${++lineCounter}`;
        const wordIds = [];
        const tWords = tline.words || [];
        for (const tword of tWords) {
            const wordId = `w-${++wordCounter}`;
            wordIds.push(wordId);
            words.push({
                id: wordId,
                lineId,
                text: tword.text,
                bbox: { ...tword.bbox },
                confidence: tword.confidence,
            });
        }
        lines.push({
            id: lineId,
            text: tline.text.replace(/\n+$/, ''),
            bbox: { ...tline.bbox },
            confidence: tline.confidence,
            wordIds,
        });
    }

    return { words, lines, rawText: data.text || '' };
}
