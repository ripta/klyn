// Check Claude Code session transcripts against the known-shape registry.
//
//   node tools/session-schema.mjs check <file.jsonl>...
//       Print new row types, fields, and tags. Exits 1 if there are any.
//   node tools/session-schema.mjs update <file.jsonl>...
//       Merge what the files contain into the registry and rewrite it.
//
// The walk rules live in public/claude-code-session-schema.js, which the
// viewer also uses, so the CLI and the page always agree.

import { existsSync, readFileSync, writeFileSync } from 'node:fs';

const SCHEMA = new URL('../public/claude-code-session-schema.js', import.meta.url);
const REGISTRY = new URL('../public/claude-code-session-registry.js', import.meta.url);

await import(SCHEMA.href);
const { survey, diff, merge, formatRegistry } = globalThis.ccSessionSchema;

let registry = { versions: [], tags: [], scopes: {} };
if (existsSync(REGISTRY)) {
    await import(REGISTRY.href);
    registry = globalThis.ccSessionRegistry;
}

const [cmd, ...files] = process.argv.slice(2);
if (!['check', 'update'].includes(cmd) || files.length === 0) {
    console.error('usage: node tools/session-schema.mjs check|update <file.jsonl>...');
    process.exit(2);
}

// Row numbers are per file, so each file is surveyed on its own and the
// results are reported or merged one at a time.
let drift = 0;
for (const file of files) {
    const rows = [];
    let n = 0;
    for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
        if (!line.trim()) continue;
        n++;
        try {
            rows.push({ n, data: JSON.parse(line) });
        } catch {
            console.error(`${file}: row ${n} is not valid JSON`);
        }
    }
    const observed = survey(rows);

    if (cmd === 'update') {
        registry = merge(registry, observed);
        continue;
    }

    const { newScopes, newPaths, newTags } = diff(registry, observed);
    const total = newScopes.length + newPaths.length + newTags.length;
    drift += total;
    console.log(`${file}: ${n} rows, versions ${[...observed.versions].join(', ') || 'none'}, ${total} new`);
    const at = (e) => `x${e.count} at #${e.rows.join(', #')}`;
    for (const e of newScopes) console.log(`  new type   ${e.scope}  ${at(e)}`);
    for (const e of newPaths) {
        const nested = e.nested ? ` (+${e.nested} nested)` : '';
        console.log(`  new field  ${e.scope}  ${e.path}${nested}  ${at(e)}`);
    }
    for (const e of newTags) console.log(`  new tag    <${e.tag}>  ${at(e)}`);
}

if (cmd === 'update') {
    writeFileSync(REGISTRY, formatRegistry(registry));
    const paths = Object.values(registry.scopes).reduce((a, p) => a + p.length, 0);
    console.log(`wrote ${Object.keys(registry.scopes).length} types, ${paths} fields, ${registry.tags.length} tags`);
}

process.exit(drift ? 1 : 0);
