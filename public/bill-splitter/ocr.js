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

    // PSM 3 = AUTO. Lets Tesseract do its own page segmentation, which
    // matters when the receipt only occupies part of the frame (photo against
    // a dark surface). SINGLE_COLUMN assumed the whole image was one column
    // and dragged in too much background noise.
    //
    // The whitelist is a literal list of characters — NOT a regex. "A-Z"
    // would only allow A, -, Z. So letter ranges must be spelled out, or
    // every non-A/Z letter collapses to "A" in the output.
    await worker.setParameters({
        tessedit_pageseg_mode: 3,
        tessedit_char_whitelist:
            'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789.,$%/#@:&\'"() -',
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
