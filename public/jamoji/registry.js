// Named composition registry plus the label-precedence resolver used by
// <jamoji-block>. The registry lives in module scope and is exposed on
// globalThis.jamoji from jamoji.js.

import { UNICODE_NAMES } from './unicode-names.js';

const entries = new Map();

export function define(name, { emojis, layout = null, label = null } = {}) {
    if (typeof name !== 'string' || !name) {
        throw new TypeError('jamoji.define: name must be a non-empty string');
    }
    if (!Array.isArray(emojis) || emojis.length === 0) {
        throw new TypeError(`jamoji.define("${name}"): emojis must be a non-empty array`);
    }
    entries.set(name, { emojis: emojis.slice(), layout, label });
}

export function get(name) {
    return entries.get(name) ?? null;
}

// Strip ZWJ (U+200D) and variation selectors (U+FE0F) from a grapheme's
// codepoints, then look up each remaining codepoint in the names table.
// Joins multi-codepoint emoji parts with " + ". Falls back to "U+XXXX".
function nameForGrapheme(grapheme) {
    const cps = [...grapheme]
        .map((ch) => ch.codePointAt(0))
        .filter((cp) => cp !== 0x200d && cp !== 0xfe0f);
    if (cps.length === 0) return null;
    return cps
        .map((cp) => {
            const key = cp.toString(16);
            if (UNICODE_NAMES[key]) return UNICODE_NAMES[key];
            return `U+${cp.toString(16).toUpperCase().padStart(4, '0')}`;
        })
        .join(' + ');
}

// Returns { label: string, source: 'registry' | 'attribute' | 'auto' | 'none' }.
// Source tells the caller whether to warn (auto on multi-grapheme blocks).
export function resolveLabel({ name, attrLabel, graphemes }) {
    if (name) {
        const entry = entries.get(name);
        if (entry?.label) {
            return { label: entry.label, source: 'registry' };
        }
    }
    if (attrLabel && attrLabel.trim()) {
        return { label: attrLabel.trim(), source: 'attribute' };
    }
    const parts = (graphemes ?? []).map(nameForGrapheme).filter(Boolean);
    if (parts.length === 0) {
        return { label: '', source: 'none' };
    }
    return { label: parts.join(', '), source: 'auto' };
}
