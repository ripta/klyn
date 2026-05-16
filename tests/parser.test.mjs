// Regression tests for the bill-splitter parser.
//
// For each <id>.golden.json under tests/fixtures/bill-splitter/:
//   1. Load the committed OCR snapshot (<id>.ocr.json). The snapshot is
//      tesseract output from tools/capture-ocr.mjs; we don't re-OCR in tests
//      so the run is deterministic and doesn't depend on the host's tesseract.
//   2. Run parseReceipt and assert the canonical form matches `golden.baseline`.
//      Drift means the parser changed; re-bless via `npm run bless` once the
//      new behavior is reviewed.
//   3. If `golden.truth` is filled in, also report the diff between truth and
//      baseline as a TAP diagnostic. That gap is the parser's accuracy debt —
//      it should shrink over time as the parser improves, but it never fails
//      the test on its own.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { parseReceipt } from '../public/bill-splitter/parser.js';
import { canonicalize, diff } from '../tools/lib/golden.mjs';

const FIXTURE_DIR = new URL('fixtures/bill-splitter/', import.meta.url).pathname;

const goldens = readdirSync(FIXTURE_DIR).filter((n) => n.endsWith('.golden.json'));

if (goldens.length === 0) {
    test('bill-splitter fixtures', () => {
        assert.fail('no goldens found — run `npm run capture-ocr` then `npm run seed-golden`');
    });
}

for (const name of goldens) {
    const id = name.replace(/\.golden\.json$/, '');
    test(`bill-splitter / ${id}`, (t) => {
        const golden = JSON.parse(readFileSync(join(FIXTURE_DIR, name), 'utf-8'));
        const ocr = JSON.parse(readFileSync(join(FIXTURE_DIR, `${id}.ocr.json`), 'utf-8'));
        const actual = canonicalize(parseReceipt(ocr));

        assert.deepEqual(
            actual,
            golden.baseline,
            'parser output drifted from baseline — re-bless via `npm run bless` once reviewed',
        );

        if (golden.truth) {
            const drift = diff(golden.truth, golden.baseline);
            t.diagnostic(
                `truth-vs-baseline: items ${drift.items.matched}/${drift.items.expected}, ` +
                    `fees ${drift.fees.matched}/${drift.fees.expected}`,
            );
            for (const note of drift.notes) t.diagnostic(`  ${note}`);
        } else {
            t.diagnostic('truth: (unset — fill in to enable accuracy reporting)');
        }
    });
}
