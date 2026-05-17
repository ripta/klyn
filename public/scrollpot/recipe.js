// Recipe loading, validation, scaling, and step body parsing.
//
// A recipe is a JSON object with the shape declared in the v1 spec. This
// module is intentionally permissive: it normalizes missing fields rather
// than rejecting recipes outright, so authors can omit anything they don't
// need (e.g., `notes`, `group`, `media`).

const REF_PATTERN = /\{(ingredient|tool):([a-z0-9][a-z0-9_-]*)\}/gi;

export async function loadRecipe(url) {
    const resp = await fetch(url, { credentials: 'omit' });
    if (!resp.ok) {
        throw new Error(`Failed to load recipe: ${resp.status} ${resp.statusText}`);
    }
    const data = await resp.json();
    return normalizeRecipe(data, resp.url);
}

export function normalizeRecipe(raw, baseUrl) {
    if (!raw || typeof raw !== 'object') {
        throw new Error('Recipe must be a JSON object.');
    }
    if (!Array.isArray(raw.steps) || raw.steps.length === 0) {
        throw new Error('Recipe is missing steps.');
    }

    const tools = (raw.tools || []).map((t, i) => ({
        id: t.id || `tool-${i}`,
        name: t.name || '(unnamed tool)',
        notes: t.notes || '',
    }));

    const ingredients = (raw.ingredients || []).map((ing, i) => ({
        id: ing.id || `ing-${i}`,
        name: ing.name || '(unnamed ingredient)',
        group: ing.group || '',
        quantities: ing.quantities || {},
        notes: ing.notes || '',
        scalable: ing.scalable !== false,
    }));

    const steps = raw.steps.map((s, i) => ({
        id: s.id || `s${i + 1}`,
        heading: s.heading || '',
        body: s.body || '',
        duration: s.duration || '',
        timer: s.timer || null,
        media: s.media ? resolveMedia(s.media, baseUrl) : null,
        notes: Array.isArray(s.notes) ? s.notes : [],
        refs: extractRefs(s.body || ''),
    }));

    return {
        baseUrl,
        title: raw.title || 'Untitled recipe',
        description: raw.description || '',
        servings_default: Math.max(1, Number(raw.servings_default) || 1),
        servings_unit: raw.servings_unit || 'serving',
        source: raw.source || '',
        tags: Array.isArray(raw.tags) ? raw.tags : [],
        tools,
        ingredients,
        steps,
    };
}

function resolveMedia(media, baseUrl) {
    if (!media || !media.src) return null;
    let src = media.src;
    if (baseUrl && !/^([a-z]+:|data:|\/\/)/i.test(src)) {
        try { src = new URL(src, baseUrl).toString(); } catch { /* leave as-is */ }
    }
    return {
        type: media.type || 'image',
        src,
        alt: media.alt || '',
    };
}

// Returns `[{ kind: 'ingredient'|'tool', id, raw, start, end }, ...]` in order.
export function extractRefs(body) {
    const refs = [];
    let m;
    REF_PATTERN.lastIndex = 0;
    while ((m = REF_PATTERN.exec(body)) !== null) {
        refs.push({
            kind: m[1].toLowerCase(),
            id: m[2],
            raw: m[0],
            start: m.index,
            end: m.index + m[0].length,
        });
    }
    return refs;
}

// Splits step body into renderable segments: text, ref tokens, and the
// minimal **bold** / *italic* inline emphasis we support.
//
// Returns an array of `{ type, ... }`:
//   { type: 'text', value }
//   { type: 'ref', kind, id }
//   { type: 'bold', value }
//   { type: 'italic', value }
export function parseBody(body) {
    const segments = [];
    let i = 0;
    const len = body.length;

    while (i < len) {
        // Try matching a ref at i.
        REF_PATTERN.lastIndex = i;
        const refMatch = REF_PATTERN.exec(body);
        const refStart = refMatch ? refMatch.index : -1;

        // Find next emphasis start.
        const boldStart = body.indexOf('**', i);
        const italicStart = findIsolatedAsterisk(body, i);

        // The next event is whichever of {ref, bold, italic} comes first.
        const candidates = [];
        if (refStart >= 0) candidates.push({ kind: 'ref', at: refStart });
        if (boldStart >= 0) candidates.push({ kind: 'bold', at: boldStart });
        if (italicStart >= 0) candidates.push({ kind: 'italic', at: italicStart });

        if (candidates.length === 0) {
            segments.push({ type: 'text', value: body.slice(i) });
            break;
        }

        candidates.sort((a, b) => a.at - b.at);
        const next = candidates[0];

        if (next.at > i) {
            segments.push({ type: 'text', value: body.slice(i, next.at) });
        }

        if (next.kind === 'ref') {
            segments.push({ type: 'ref', kind: refMatch[1].toLowerCase(), id: refMatch[2] });
            i = refMatch.index + refMatch[0].length;
        } else if (next.kind === 'bold') {
            const close = body.indexOf('**', next.at + 2);
            if (close < 0) {
                segments.push({ type: 'text', value: body.slice(next.at) });
                break;
            }
            segments.push({ type: 'bold', value: body.slice(next.at + 2, close) });
            i = close + 2;
        } else if (next.kind === 'italic') {
            const close = findIsolatedAsterisk(body, next.at + 1);
            if (close < 0) {
                segments.push({ type: 'text', value: body.slice(next.at) });
                break;
            }
            segments.push({ type: 'italic', value: body.slice(next.at + 1, close) });
            i = close + 1;
        }
    }

    return segments;
}

// Single `*` not part of `**`. Searches forward from `from`.
function findIsolatedAsterisk(body, from) {
    let i = from;
    while (i < body.length) {
        const idx = body.indexOf('*', i);
        if (idx < 0) return -1;
        const before = body[idx - 1];
        const after = body[idx + 1];
        if (before === '*' || after === '*') {
            i = idx + 1;
            continue;
        }
        return idx;
    }
    return -1;
}

// Scale a numeric amount by the ratio servings/default.
// `scalable: false` ingredients (vanilla, salt-to-taste, etc.) are passed
// through unchanged.
export function scaleAmount(amount, ratio, scalable) {
    if (!scalable) return amount;
    if (typeof amount !== 'number' || !Number.isFinite(amount)) return amount;
    return amount * ratio;
}
