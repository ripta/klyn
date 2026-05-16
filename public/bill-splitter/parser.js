// Geometry-based receipt parser.
// Input: { words, lines } from ocr.js — both carry bboxes and confidence.
// Output: { items, fees, detectedLocale, warnings }.
//
// Items are detected by geometry rather than regex on raw text:
// price tokens are clustered on x-coordinate to find the price column, then
// each price is associated with words on the same y-range to form an item.

const TOTAL_KEYWORDS = {
    subtotal: ['subtotal', 'sub total', 'sub-total', 'sub'],
    tax: ['tax', 'vat', 'gst', 'hst', 'sales tax'],
    tip: ['tip', 'gratuity'],
    service: ['service', 'service charge'],
    total: ['total', 'balance', 'amount due', 'grand total'],
    discount: ['discount', 'coupon', 'promo'],
};

const MIN_WORD_CONFIDENCE = 30;

// Build a locale-aware number parser. Returns { parse, detectedLocale }.
// We try locales in order and pick the one that successfully parses the most
// price-looking tokens. Cheap to do, and bypasses the need to ask the user.
function buildNumberParser(words) {
    const candidates = ['en-US', 'de-DE', 'fr-FR'];
    const samples = words
        .map((w) => w.text)
        .filter((t) => /\d/.test(t))
        .slice(0, 80);

    let best = { locale: 'en-US', parse: makeParser('en-US'), score: -1 };
    for (const locale of candidates) {
        const parser = makeParser(locale);
        let score = 0;
        for (const s of samples) {
            const n = parser(s);
            if (Number.isFinite(n)) score++;
        }
        if (score > best.score) best = { locale, parse: parser, score };
    }
    return best;
}

function makeParser(locale) {
    const parts = new Intl.NumberFormat(locale).formatToParts(12345.6);
    const group = parts.find((p) => p.type === 'group')?.value ?? ',';
    const decimal = parts.find((p) => p.type === 'decimal')?.value ?? '.';
    const groupRe = new RegExp('\\' + group, 'g');
    return (raw) => {
        if (raw == null) return NaN;
        // Strip currency symbols, letters, and stray punctuation but keep digits + group + decimal + sign.
        // OCR on creased receipts commonly misreads a trailing digit `1` as `)`
        // (e.g. `$3.41` → `$3.4)`); coerce it back before stripping.
        const cleaned = String(raw)
            .replace(/\)/g, '1')
            .replace(/[^0-9\-+.,]/g, '')
            .replace(groupRe, '')
            .replace(decimal, '.');
        if (!cleaned || cleaned === '-' || cleaned === '+') return NaN;
        const n = Number(cleaned);
        return Number.isFinite(n) ? n : NaN;
    };
}

// A word "looks like a price" if it has at least two trailing digits separated
// by the locale's decimal mark. We accept optional currency / sign noise.
function priceRegexFor(locale) {
    const parts = new Intl.NumberFormat(locale).formatToParts(12345.6);
    const decimal = parts.find((p) => p.type === 'decimal')?.value ?? '.';
    const d = decimal === '.' ? '\\.' : decimal;
    // Match e.g. $12.34, 12,34, 1.234,56, -3.50, 4.00$. The trailing cents
    // position also accepts `)` as a misread digit `1` (creased-receipt OCR).
    return new RegExp(`^[\\-+]?[\\$€£¥]?\\d{1,3}(?:[.,]\\d{3})*${d}\\d[\\d)][\\$€£¥]?$`);
}

function lineText(line) {
    return line.text.toLowerCase();
}

function containsAnyKeyword(text, keywords) {
    if (keywords.some((kw) => text.includes(kw))) return true;
    // OCR on creased receipts often garbles the trailing character of a word,
    // e.g. `Total` → `Tota)`, `Subtotal` → `Subtota)`. Accept a keyword when
    // its first N-1 letters appear as a standalone token after stripping
    // non-letters. Restricted to keywords of ≥4 letters so that short words
    // like `tip` / `tax` don't generate 2-letter stubs that match too widely.
    const tokens = text
        .split(/\s+/)
        .map((t) => t.replace(/[^a-z]/g, ''))
        .filter((t) => t.length >= 3);
    if (tokens.length === 0) return false;
    for (const kw of keywords) {
        const compact = kw.replace(/\s+/g, '');
        if (compact.length < 4) continue;
        const stub = compact.slice(0, -1);
        if (tokens.includes(stub)) return true;
    }
    return false;
}

// 1-D k-means-ish clustering on x-coordinates. For our needs we only really
// need 1-3 clusters, so a simple iterative approach is fine.
function clusterX(values, k) {
    if (values.length === 0) return [];
    if (values.length <= k) return values.map((v) => ({ center: v, members: [v] }));
    const sorted = [...values].sort((a, b) => a - b);
    // Initialize centers by evenly partitioning the sorted list.
    let centers = [];
    for (let i = 0; i < k; i++) {
        const idx = Math.floor(((i + 0.5) / k) * sorted.length);
        centers.push(sorted[idx]);
    }
    for (let iter = 0; iter < 20; iter++) {
        const groups = centers.map(() => []);
        for (const v of values) {
            let bestI = 0;
            let bestD = Infinity;
            for (let i = 0; i < centers.length; i++) {
                const d = Math.abs(v - centers[i]);
                if (d < bestD) {
                    bestD = d;
                    bestI = i;
                }
            }
            groups[bestI].push(v);
        }
        const next = groups.map((g, i) => (g.length ? g.reduce((a, b) => a + b, 0) / g.length : centers[i]));
        if (next.every((c, i) => Math.abs(c - centers[i]) < 0.5)) {
            centers = next;
            return groups.map((g, i) => ({ center: next[i], members: g }));
        }
        centers = next;
    }
    // Fallthrough if not converged.
    const groups = centers.map(() => []);
    for (const v of values) {
        let bestI = 0;
        let bestD = Infinity;
        for (let i = 0; i < centers.length; i++) {
            const d = Math.abs(v - centers[i]);
            if (d < bestD) {
                bestD = d;
                bestI = i;
            }
        }
        groups[bestI].push(v);
    }
    return groups.map((g, i) => ({ center: centers[i], members: g }));
}

export function parseReceipt({ words = [], lines = [] } = {}) {
    const warnings = [];

    // Stage 1: drop low-confidence noise, detect locale, classify prices.
    // Detect locale on the full word set so we get a richer sample, then keep
    // words above the confidence floor PLUS any word whose text matches the
    // price regex. Tesseract.js sometimes assigns a perfectly-readable price
    // a confidence of 0 (seen on this receipt's second `$5.00`); the regex
    // shape is strict enough that a low-confidence match is almost certainly
    // a real price.
    const nonEmpty = words.filter((w) => w.text.trim().length > 0);
    const { locale: detectedLocale, parse: parseNumber } = buildNumberParser(nonEmpty);
    const priceRe = priceRegexFor(detectedLocale);
    const cleanWords = nonEmpty.filter(
        (w) => w.confidence >= MIN_WORD_CONFIDENCE || priceRe.test(w.text.trim()),
    );

    const taggedWords = cleanWords.map((w) => {
        const text = w.text.trim();
        const isPrice = priceRe.test(text);
        return {
            ...w,
            text,
            isPrice,
            value: isPrice ? parseNumber(text) : NaN,
        };
    });

    // Index words by line id for line-level operations.
    const wordsByLine = new Map();
    for (const w of taggedWords) {
        if (!wordsByLine.has(w.lineId)) wordsByLine.set(w.lineId, []);
        wordsByLine.get(w.lineId).push(w);
    }
    for (const arr of wordsByLine.values()) {
        arr.sort((a, b) => a.bbox.x0 - b.bbox.x0);
    }

    // Stage 2: identify totals region by keyword anchors. Walk lines top-down
    // and find the earliest line that mentions a totals keyword AND has a price.
    const sortedLines = [...lines].sort((a, b) => a.bbox.y0 - b.bbox.y0);

    const totalsKeywords = [
        ...TOTAL_KEYWORDS.subtotal,
        ...TOTAL_KEYWORDS.tax,
        ...TOTAL_KEYWORDS.tip,
        ...TOTAL_KEYWORDS.service,
        ...TOTAL_KEYWORDS.total,
        ...TOTAL_KEYWORDS.discount,
    ];

    let totalsRegionStartY = Infinity;
    for (const line of sortedLines) {
        const text = lineText(line);
        const hasKeyword = containsAnyKeyword(text, totalsKeywords);
        const lineWords = wordsByLine.get(line.id) || [];
        const hasPrice = lineWords.some((w) => w.isPrice);
        if (hasKeyword && hasPrice) {
            totalsRegionStartY = line.bbox.y0;
            break;
        }
    }

    // Stage 3: collect price tokens that live in the items region only.
    const itemsRegionPrices = taggedWords.filter(
        (w) => w.isPrice && w.bbox.y0 < totalsRegionStartY && Number.isFinite(w.value),
    );

    if (itemsRegionPrices.length === 0) {
        warnings.push('No prices detected above the totals region. The receipt may be unusually formatted or OCR may have failed.');
    }

    // Cluster the x-centers of price tokens; the right-most cluster is the
    // price column. Use 2 clusters: most receipts have body text mixed in
    // alongside the prices, and we just want to discriminate "price column"
    // vs "everything else with digits in it".
    const priceXCenters = itemsRegionPrices.map((w) => (w.bbox.x0 + w.bbox.x1) / 2);
    let priceColumnXRange = null;
    if (priceXCenters.length >= 2) {
        const clusters = clusterX(priceXCenters, Math.min(2, priceXCenters.length));
        const rightCluster = clusters.reduce((a, b) => (a.center > b.center ? a : b));
        const xs = rightCluster.members;
        priceColumnXRange = { min: Math.min(...xs), max: Math.max(...xs) };
    } else if (priceXCenters.length === 1) {
        const x = priceXCenters[0];
        priceColumnXRange = { min: x, max: x };
    }

    const priceColumnPrices = priceColumnXRange
        ? itemsRegionPrices.filter((w) => {
              const cx = (w.bbox.x0 + w.bbox.x1) / 2;
              const tol = 40; // pixels; receipts vary in width, but column drift is usually <40px
              return cx >= priceColumnXRange.min - tol && cx <= priceColumnXRange.max + tol;
          })
        : [];

    // Stage 4: build items by associating each price with words on the same line.
    const items = [];
    let nextItemId = 1;
    for (const priceWord of priceColumnPrices) {
        const lineWords = (wordsByLine.get(priceWord.lineId) || []).filter(
            (w) => w.id !== priceWord.id && !w.isPrice,
        );
        if (lineWords.length === 0) continue; // price-only line, probably a continuation
        const name = lineWords.map((w) => w.text).join(' ').trim();
        if (!name) continue;
        const confidence = Math.min(priceWord.confidence, ...lineWords.map((w) => w.confidence));
        items.push({
            id: `item-${nextItemId++}`,
            name,
            price: priceWord.value,
            confidence,
            sourceLineId: priceWord.lineId,
            sourceWordIds: [priceWord.id, ...lineWords.map((w) => w.id)],
            assignees: new Set(),
        });
    }

    // Stage 4b: attach continuation lines. Receipts often wrap long item names
    // across multiple lines, e.g.
    //     "1 SUSHI COMBO 1     $32.00"
    //     "   (8pcs)"
    // The continuation has no price → it never starts its own item. Find such
    // orphans in the items region and append them to the closest preceding
    // item, judging "preceding" and "close" by Y-CENTER. (Tesseract.js often
    // produces overlapping line bboxes for adjacent rows on a dense receipt;
    // a strict y1<y0 check would exclude the actual parent line.)
    const yCenter = (b) => (b.y0 + b.y1) / 2;
    const linesById = new Map(sortedLines.map((l) => [l.id, l]));
    const itemSourceLines = items
        .map((it) => linesById.get(it.sourceLineId))
        .filter(Boolean);
    const itemByLineId = new Map(items.map((it) => [it.sourceLineId, it]));

    for (const orphan of sortedLines) {
        if (orphan.bbox.y0 >= totalsRegionStartY) continue;
        if (itemByLineId.has(orphan.id)) continue;
        const orphanWords = wordsByLine.get(orphan.id) || [];
        if (orphanWords.length === 0) continue;
        if (orphanWords.some((w) => w.isPrice)) continue;

        const orphanCY = yCenter(orphan.bbox);
        let bestLine = null;
        let bestDist = Infinity;
        for (const itemLine of itemSourceLines) {
            const itemCY = yCenter(itemLine.bbox);
            if (itemCY >= orphanCY) continue;
            const dist = orphanCY - itemCY;
            if (dist < bestDist) {
                bestDist = dist;
                bestLine = itemLine;
            }
        }
        if (!bestLine) continue;
        const orphanH = orphan.bbox.y1 - orphan.bbox.y0;
        if (bestDist > orphanH * 1.5) continue;

        const item = itemByLineId.get(bestLine.id);
        if (!item) continue;
        item.name = `${item.name} ${orphanWords.map((w) => w.text).join(' ')}`.trim();
        item.sourceWordIds.push(...orphanWords.map((w) => w.id));
    }

    // Stage 5: fees / totals.
    const fees = [];
    let nextFeeId = 1;
    for (const line of sortedLines) {
        if (line.bbox.y0 < totalsRegionStartY) continue;
        const text = lineText(line);
        const lineWords = wordsByLine.get(line.id) || [];
        const priceWord = lineWords.find((w) => w.isPrice && Number.isFinite(w.value));
        if (!priceWord) continue;

        let type = null;
        const labelWords = lineWords.filter((w) => !w.isPrice);
        let label = labelWords.map((w) => w.text).join(' ').trim() || line.text.trim();
        for (const [key, keywords] of Object.entries(TOTAL_KEYWORDS)) {
            if (containsAnyKeyword(text, keywords)) {
                type = key;
                break;
            }
        }
        if (!type) continue;
        // We treat 'total' as informational only — it's not a fee to distribute,
        // it's the sum we expect to match. Keep it for cross-check display.
        fees.push({
            id: `fee-${nextFeeId++}`,
            type,
            amount: priceWord.value,
            label,
            confidence: Math.min(priceWord.confidence, ...lineWords.filter((w) => w !== priceWord).map((w) => w.confidence || 100)),
            sourceLineId: line.id,
        });
    }

    return {
        items,
        fees,
        detectedLocale,
        warnings,
        diagnostics: {
            priceColumnXRange,
            totalsRegionStartY: Number.isFinite(totalsRegionStartY) ? totalsRegionStartY : null,
            wordCount: cleanWords.length,
            lineCount: sortedLines.length,
        },
    };
}
