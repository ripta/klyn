// Shape survey for Claude Code session transcripts
// (~/.claude/projects/<project>/<session>.jsonl).
//
// Anthropic does not publish a schema for these files. Instead, the known
// shape lives in claude-code-session-registry.js. This file walks rows and
// reports anything the registry hasn't seen: new row types, new fields on
// known types, and new XML-like tags in prompt text.
//
// Shared by claude-code-session-viewer.html and tools/session-schema.mjs.
// It is a classic script, not a module, so the page also works from file://.
(function (root) {
    // Keys whose subtrees vary by tool or server, wherever they appear. Their
    // own path is recorded, but their insides are not, so a new MCP tool
    // doesn't count as drift. Tool inputs (…tool_use].input) are opaque too.
    const OPAQUE = new Set([
        'input_schema',
        'mcpMeta',
        'serverClassifierContext',
        'toolUseResult',
        'wireToolInputs',
    ]);

    function isOpaque(path) {
        const key = path.slice(path.lastIndexOf('.') + 1);
        return OPAQUE.has(key) || /tool_use\]\.input$/.test(path);
    }

    // Objects keyed by data (model IDs, file paths, tool use IDs). Their keys
    // collapse to *.
    const MAPS = new Set([
        'modelUsage',
        'snapshot.trackedFileBackups',
        'wireIngestContext',
    ]);

    // Where XML-like tags in prompt text are collected from. Tool output is
    // left out on purpose, since it often holds HTML or XML of its own.
    function tagSources(row) {
        const out = [];
        if (row.type === 'user' && row.message) {
            const c = row.message.content;
            if (typeof c === 'string') out.push(c);
            else if (Array.isArray(c)) {
                for (const b of c) if (b && b.type === 'text' && typeof b.text === 'string') out.push(b.text);
            }
        }
        if ((row.type === 'queue-operation' || row.type === 'system') && typeof row.content === 'string') {
            out.push(row.content);
        }
        if (row.type === 'attachment' && row.attachment && typeof row.attachment.prompt === 'string') {
            out.push(row.attachment.prompt);
        }
        return out;
    }

    const OPEN_TAG = /<([a-z][a-z0-9_-]*)(?:\s[^<>]*)?>/g;

    function tagsIn(text) {
        const found = new Set();
        for (const m of text.matchAll(OPEN_TAG)) {
            if (text.includes('</' + m[1] + '>')) found.add(m[1]);
        }
        return found;
    }

    // A row's scope is its type, refined by the system subtype or attachment
    // kind. Each scope has its own set of known field paths.
    function scopeOf(row) {
        const type = typeof row.type === 'string' ? row.type : '(no type)';
        if (type === 'system' && typeof row.subtype === 'string') return 'system/' + row.subtype;
        if (type === 'attachment' && row.attachment && typeof row.attachment.type === 'string') {
            return 'attachment/' + row.attachment.type;
        }
        return type;
    }

    // Array items with a string `type` are tagged with it, as in
    // message.content[tool_use].id. Other items are tagged [].
    function walk(value, path, visit, depth) {
        if (path) visit(path);
        if (isOpaque(path) || depth > 12) return;
        if (Array.isArray(value)) {
            for (const item of value) {
                const tag = item && typeof item === 'object' && typeof item.type === 'string' ? item.type : '';
                walk(item, path + '[' + tag + ']', visit, depth + 1);
            }
        } else if (value && typeof value === 'object') {
            const isMap = MAPS.has(path);
            for (const key of Object.keys(value)) {
                walk(value[key], (path ? path + '.' : '') + (isMap ? '*' : key), visit, depth + 1);
            }
        }
    }

    function newEntry() {
        return { count: 0, rows: [] };
    }

    function note(entry, n) {
        entry.count++;
        if (entry.rows.length < 3 && entry.rows[entry.rows.length - 1] !== n) entry.rows.push(n);
    }

    // Survey parsed rows. Each item is { n, data } where n is the 1-based row
    // number. Rows that failed to parse have no data and are skipped.
    function survey(rows) {
        const scopes = new Map();
        const tags = new Map();
        const versions = new Set();
        for (const { n, data } of rows) {
            if (!data || typeof data !== 'object' || Array.isArray(data)) continue;
            if (typeof data.version === 'string') versions.add(data.version);
            const scope = scopeOf(data);
            let s = scopes.get(scope);
            if (!s) scopes.set(scope, (s = { entry: newEntry(), paths: new Map() }));
            note(s.entry, n);
            const seen = new Set();
            walk(data, '', (p) => seen.add(p), 0);
            for (const p of seen) {
                let e = s.paths.get(p);
                if (!e) s.paths.set(p, (e = newEntry()));
                note(e, n);
            }
            for (const text of tagSources(data)) {
                for (const t of tagsIn(text)) {
                    let e = tags.get(t);
                    if (!e) tags.set(t, (e = newEntry()));
                    note(e, n);
                }
            }
        }
        return { scopes, tags, versions };
    }

    // The path one level up: a.b[x].c -> a.b[x] -> a.b -> a.
    function parentPath(path) {
        const i = Math.max(path.lastIndexOf('.'), path.lastIndexOf('['));
        return i > 0 ? path.slice(0, i) : '';
    }

    // Compare a survey against a registry. New scopes are reported whole, and
    // their fields are not listed again. Within a new subtree, only its root
    // is listed, with a count of the new paths nested under it.
    function diff(registry, observed) {
        const known = registry.scopes || {};
        const knownTags = new Set(registry.tags || []);
        const newScopes = [];
        const newPaths = [];
        const newTags = [];
        for (const [scope, s] of observed.scopes) {
            if (!known[scope]) {
                newScopes.push({ scope, count: s.entry.count, rows: s.entry.rows });
                continue;
            }
            const paths = new Set(known[scope]);
            const fresh = new Map();
            for (const [path, e] of s.paths) if (!paths.has(path)) fresh.set(path, e);
            const rootOf = (p) => (fresh.has(parentPath(p)) ? rootOf(parentPath(p)) : p);
            const roots = new Map();
            for (const path of fresh.keys()) {
                const root = rootOf(path);
                if (!roots.has(root)) {
                    const e = fresh.get(root);
                    roots.set(root, { scope, path: root, count: e.count, rows: e.rows, nested: 0 });
                }
                if (root !== path) roots.get(root).nested++;
            }
            newPaths.push(...roots.values());
        }
        for (const [tag, e] of observed.tags) {
            if (!knownTags.has(tag)) newTags.push({ tag, count: e.count, rows: e.rows });
        }
        const byScope = (a, b) => (a.scope < b.scope ? -1 : a.scope > b.scope ? 1 : 0);
        newScopes.sort(byScope);
        newPaths.sort((a, b) => byScope(a, b) || (a.path < b.path ? -1 : 1));
        newTags.sort((a, b) => (a.tag < b.tag ? -1 : 1));
        return { newScopes, newPaths, newTags };
    }

    // Union of a registry and a survey, with everything sorted so that
    // regenerating the file gives a readable diff.
    function merge(registry, observed) {
        const scopes = {};
        const all = new Set([...Object.keys(registry.scopes || {}), ...observed.scopes.keys()]);
        for (const scope of [...all].sort()) {
            const paths = new Set((registry.scopes || {})[scope] || []);
            const s = observed.scopes.get(scope);
            if (s) for (const p of s.paths.keys()) paths.add(p);
            scopes[scope] = [...paths].sort();
        }
        return {
            versions: [...new Set([...(registry.versions || []), ...observed.versions])].sort(),
            tags: [...new Set([...(registry.tags || []), ...observed.tags.keys()])].sort(),
            scopes,
        };
    }

    // Source text for claude-code-session-registry.js.
    function formatRegistry(registry) {
        return [
            '// Known shape of Claude Code session transcripts. Generated by',
            '// `node tools/session-schema.mjs update <file.jsonl>...` or copied from',
            "// the viewer's schema panel. See claude-code-session-schema.js.",
            'globalThis.ccSessionRegistry = ' + JSON.stringify(registry, null, 4) + ';',
            '',
        ].join('\n');
    }

    root.ccSessionSchema = { OPAQUE, MAPS, isOpaque, scopeOf, tagsIn, survey, diff, merge, formatRegistry };
})(globalThis);
