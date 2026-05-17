// <jamoji-block> — type-set multiple emojis into a single inline "character".
// Entry point and embeddable artifact for the framework.

import { define as registryDefine, get as registryGet, resolveLabel } from './registry.js';
import { rendererByName, NotoSvgRenderer } from './renderer.js';

const SEGMENTER = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
const MAX_CELLS = 6;
const AREA_LETTERS = ['a', 'b', 'c', 'd', 'e', 'f'];
const LAYOUTS = new Set(['1', '2h', '2v', '3t', '3b', '3v', '4', '5l', '5c', '5r', '6v', '6h']);
const LAYOUT_CELL_COUNT = {
    '1': 1,
    '2h': 2, '2v': 2,
    '3t': 3, '3b': 3, '3v': 3,
    '4': 4,
    '5l': 5, '5c': 5, '5r': 5,
    '6v': 6, '6h': 6,
};

function splitGraphemes(text) {
    if (!text) return [];
    const out = [];
    for (const { segment } of SEGMENTER.segment(text)) {
        if (segment.trim() !== '') out.push(segment);
    }
    return out;
}

function inferLayout(count) {
    if (count <= 1) return '1';
    if (count === 2) return '2h';
    if (count === 3) return '3t';
    if (count === 4) return '4';
    if (count === 5) return '5l';
    return '6h';
}

const SHADOW_CSS = `
:host {
    display: inline-grid;
    box-sizing: border-box;
    width: 1em;
    height: 1em;
    min-width: 0;
    min-height: 0;
    vertical-align: text-bottom;
    line-height: 1;
    user-select: none;
    overflow: hidden;
    contain: size layout;
}

.cell {
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;
    min-width: 0;
    min-height: 0;
    width: 100%;
    height: 100%;
}

.placeholder {
    color: var(--jamoji-placeholder, rgba(0, 0, 0, 0.2));
    font-size: 0.8em;
    line-height: 1;
}

.cell-native {
    font-family: "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif;
    line-height: 1;
}

.cell-svg, .cell-svg > svg {
    display: block;
    width: 100%;
    height: 100%;
}

:host([data-layout="1"])     { grid-template-areas: "a"; grid-template-columns: 1fr; grid-template-rows: 1fr; }
:host([data-layout="2h"])    { grid-template-areas: "a b"; grid-template-columns: 1fr 1fr; grid-template-rows: 1fr; }
:host([data-layout="2v"])    { grid-template-areas: "a" "b"; grid-template-columns: 1fr; grid-template-rows: 1fr 1fr; }
:host([data-layout="3t"])    { grid-template-areas: "a a" "b c"; grid-template-columns: 1fr 1fr; grid-template-rows: 2fr 1fr; }
:host([data-layout="3b"])    { grid-template-areas: "b c" "a a"; grid-template-columns: 1fr 1fr; grid-template-rows: 1fr 2fr; }
:host([data-layout="3v"])    { grid-template-areas: "a" "b" "c"; grid-template-columns: 1fr; grid-template-rows: 1fr 1fr 1fr; }
:host([data-layout="4"])     { grid-template-areas: "a b" "c d"; grid-template-columns: 1fr 1fr; grid-template-rows: 1fr 1fr; }
:host([data-layout="5l"])    { grid-template-areas: "a a" "b c" "d e"; grid-template-columns: 1fr 1fr; grid-template-rows: 1fr 1fr 1fr; }
:host([data-layout="5c"])    { grid-template-areas: "a b" "c c" "d e"; grid-template-columns: 1fr 1fr; grid-template-rows: 1fr 1fr 1fr; }
:host([data-layout="5r"])    { grid-template-areas: "a b" "c d" "e e"; grid-template-columns: 1fr 1fr; grid-template-rows: 1fr 1fr 1fr; }
:host([data-layout="6v"])    { grid-template-areas: "a b" "c d" "e f"; grid-template-columns: 1fr 1fr; grid-template-rows: 1fr 1fr 1fr; }
:host([data-layout="6h"])    { grid-template-areas: "a b c" "d e f"; grid-template-columns: 1fr 1fr 1fr; grid-template-rows: 1fr 1fr; }

.area-a { grid-area: a; }
.area-b { grid-area: b; }
.area-c { grid-area: c; }
.area-d { grid-area: d; }
.area-e { grid-area: e; }
.area-f { grid-area: f; }

/* Native emoji glyphs scale with font-size; size them to fit their cell. */
:host([data-layout="1"])  .cell { font-size: 1em; }
:host([data-layout="2h"]) .cell,
:host([data-layout="2v"]) .cell,
:host([data-layout="4"])  .cell { font-size: 0.5em; }
:host([data-layout="3t"]) .area-a,
:host([data-layout="3b"]) .area-a { font-size: 0.66em; }
:host([data-layout="3t"]) .area-b,
:host([data-layout="3t"]) .area-c,
:host([data-layout="3b"]) .area-b,
:host([data-layout="3b"]) .area-c { font-size: 0.33em; }
:host([data-layout="3v"]) .cell,
:host([data-layout="5l"]) .cell,
:host([data-layout="5c"]) .cell,
:host([data-layout="5r"]) .cell,
:host([data-layout="6v"]) .cell,
:host([data-layout="6h"]) .cell { font-size: 0.33em; }
`;

class JamojiBlock extends HTMLElement {
    static get observedAttributes() {
        return ['name', 'layout', 'label', 'renderer'];
    }

    constructor() {
        super();
        const shadow = this.attachShadow({ mode: 'open' });
        const style = document.createElement('style');
        style.textContent = SHADOW_CSS;
        shadow.appendChild(style);
        this._renderToken = 0;
    }

    connectedCallback() {
        this._render();
    }

    attributeChangedCallback() {
        if (this.isConnected) this._render();
    }

    _render() {
        const token = ++this._renderToken;
        const shadow = this.shadowRoot;

        const name = this.getAttribute('name');
        const layoutAttr = this.getAttribute('layout');
        const labelAttr = this.getAttribute('label');
        const rendererAttr = this.getAttribute('renderer');

        const entry = name ? registryGet(name) : null;
        if (name && !entry) {
            console.warn(`jamoji: no registered composition named "${name}"`);
        }

        let graphemes = entry ? entry.emojis.slice() : splitGraphemes(this.textContent);
        if (graphemes.length > MAX_CELLS) {
            console.warn(
                `jamoji: ${graphemes.length} emojis exceeds the v1 cap of ${MAX_CELLS}; truncating.`,
            );
            graphemes = graphemes.slice(0, MAX_CELLS);
        }

        let layout = layoutAttr || entry?.layout || inferLayout(graphemes.length);
        if (!LAYOUTS.has(layout)) {
            console.warn(`jamoji: unknown layout "${layout}"; falling back to inferred.`);
            layout = inferLayout(graphemes.length);
        } else if (LAYOUT_CELL_COUNT[layout] !== graphemes.length) {
            console.warn(
                `jamoji: layout "${layout}" expects ${LAYOUT_CELL_COUNT[layout]} emojis but got ${graphemes.length}; ` +
                'using count-inferred layout instead.',
            );
            layout = inferLayout(graphemes.length);
        }

        const { label, source } = resolveLabel({ name, attrLabel: labelAttr, graphemes });
        if (source === 'auto' && graphemes.length > 1) {
            console.warn(
                `jamoji: multi-emoji block has no name/label; using auto-derived "${label}". ` +
                'Provide name= or label= for an accessible name.',
            );
        }

        const renderer = rendererByName(rendererAttr) ?? NotoSvgRenderer;

        this.setAttribute('role', 'img');
        if (label) this.setAttribute('aria-label', label);
        this.setAttribute('data-layout', layout);

        // Clear all shadow children except the persistent <style>.
        while (shadow.children.length > 1) {
            shadow.removeChild(shadow.lastChild);
        }

        const cellEls = [];
        graphemes.forEach((_g, i) => {
            const cell = document.createElement('span');
            cell.className = `cell area-${AREA_LETTERS[i]}`;
            const placeholder = document.createElement('span');
            placeholder.className = 'placeholder';
            placeholder.textContent = '•';
            cell.appendChild(placeholder);
            shadow.appendChild(cell);
            cellEls.push(cell);
        });

        graphemes.forEach((g, i) => {
            renderer.render(g).then((node) => {
                if (token !== this._renderToken) return;
                const cell = cellEls[i];
                if (!cell.isConnected) return;
                cell.replaceChildren(node);
            }).catch((err) => {
                console.warn(`jamoji: render failed for "${g}":`, err);
            });
        });
    }
}

if (!customElements.get('jamoji-block')) {
    customElements.define('jamoji-block', JamojiBlock);
}

const api = { define: registryDefine, get: registryGet };
if (typeof globalThis !== 'undefined') {
    globalThis.jamoji = Object.assign(globalThis.jamoji ?? {}, api);
}

export { JamojiBlock };
export const define = registryDefine;
export const get = registryGet;
