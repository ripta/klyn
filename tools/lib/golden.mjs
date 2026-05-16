// Golden-file helpers shared by the harness (seed/bless) and the test runner.
//
// A golden file pairs two views of a fixture:
//   - `truth`    — what's actually on the receipt, hand-curated. Aspirational.
//                  Used to compute the parser's accuracy gap, not asserted.
//   - `baseline` — the canonical pipeline output we currently accept. Asserted
//                  for regression. Re-blessed when intentional parser changes
//                  ship. May lag `truth` until the parser catches up.
//
// `canonicalize` produces the comparable shape for both: items and fees only,
// trimmed names, prices rounded to cents. Confidence scores and word/line
// provenance live on the live parser output but aren't part of the golden
// contract — they're noise from a regression-testing perspective.

export function canonicalize(parsed) {
    return {
        detectedLocale: parsed.detectedLocale,
        items: (parsed.items ?? []).map(({ name, price }) => ({
            name: normalizeName(name),
            price: roundCents(price),
        })),
        fees: (parsed.fees ?? []).map(({ type, amount, label }) => ({
            type,
            amount: roundCents(amount),
            label: normalizeName(label ?? ''),
        })),
    };
}

// Compare a hand-curated `truth` against an `actual` canonicalized output and
// return per-section match counts plus human-readable notes. Matching is by
// (normalized name, price) for items and (type, amount) for fees, both with a
// half-cent tolerance to absorb rounding.
export function diff(truth, actual) {
    const items = matchPairs(
        truth.items ?? [],
        actual.items ?? [],
        (a, b) => normalizeName(a.name) === normalizeName(b.name) && nearlyEqual(a.price, b.price),
    );
    const fees = matchPairs(
        truth.fees ?? [],
        actual.fees ?? [],
        (a, b) => a.type === b.type && nearlyEqual(a.amount, b.amount),
    );

    const notes = [];
    for (const t of items.missing) notes.push(`missing item: ${t.name} @ ${t.price}`);
    for (const a of items.extra) notes.push(`extra item: ${a.name} @ ${a.price}`);
    for (const t of fees.missing) notes.push(`missing fee: ${t.type} @ ${t.amount}`);
    for (const a of fees.extra) notes.push(`extra fee: ${a.type} @ ${a.amount}`);

    return {
        items: { matched: items.matched, expected: (truth.items ?? []).length },
        fees: { matched: fees.matched, expected: (truth.fees ?? []).length },
        notes,
    };
}

function matchPairs(truth, actual, eq) {
    const used = new Set();
    let matched = 0;
    const missing = [];
    for (const t of truth) {
        const idx = actual.findIndex((a, i) => !used.has(i) && eq(t, a));
        if (idx >= 0) {
            used.add(idx);
            matched++;
        } else {
            missing.push(t);
        }
    }
    const extra = actual.filter((_, i) => !used.has(i));
    return { matched, missing, extra };
}

function normalizeName(s) {
    return String(s).toLowerCase().replace(/\s+/g, ' ').trim();
}

function nearlyEqual(a, b) {
    return Math.abs(Number(a) - Number(b)) < 0.005;
}

function roundCents(n) {
    return Math.round(Number(n) * 100) / 100;
}
