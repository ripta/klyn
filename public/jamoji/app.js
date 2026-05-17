import { createPicker } from './picker.js';

const MAX_EMOJIS = 6;
const LAYOUT_KEYS = [
    'auto',
    '1',
    '2h', '2v',
    '3t', '3b', '3v',
    '4',
    '5l', '5c', '5r',
    '6v', '6h',
];
const LAYOUT_CELL_COUNT = {
    '1': 1,
    '2h': 2, '2v': 2,
    '3t': 3, '3b': 3, '3v': 3,
    '4': 4,
    '5l': 5, '5c': 5, '5r': 5,
    '6v': 6, '6h': 6,
};

const SEGMENTER = new Intl.Segmenter(undefined, { granularity: 'grapheme' });

const state = {
    emojis: [],
    layout: 'auto',
    label: '',
};

const els = {
    activeBlock: document.getElementById('active-block'),
    slots: document.getElementById('emoji-slots'),
    layoutOptions: document.getElementById('layout-options'),
    labelInput: document.getElementById('label-input'),
    copyEmbed: document.getElementById('copy-embed'),
    copyLink: document.getElementById('copy-link'),
    embedOutput: document.getElementById('embed-output'),
    pickerSearch: document.getElementById('picker-search'),
    pickerStatus: document.getElementById('picker-status'),
    tabs: document.getElementById('category-tabs'),
    grid: document.getElementById('emoji-grid'),
    previewBlocks: document.querySelectorAll('.preview-block'),
    toast: document.getElementById('toast'),
    helpDialog: document.getElementById('help-dialog'),
    showHelp: document.getElementById('show-help'),
    helpClose: document.getElementById('help-close'),
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

function activeLayout() {
    if (state.layout === 'auto') return inferLayout(state.emojis.length);
    return state.layout;
}

function updateBlock(block) {
    if (!block) return;
    block.textContent = state.emojis.join('');
    block.setAttribute('layout', activeLayout());
    if (state.label) block.setAttribute('label', state.label);
    else block.removeAttribute('label');
}

let dragSourceIndex = null;
let dragMoved = false;

function renderSlots() {
    els.slots.replaceChildren();
    for (let i = 0; i < MAX_EMOJIS; i += 1) {
        const li = document.createElement('li');
        const emoji = state.emojis[i];
        if (emoji) {
            li.className = 'emoji-slot filled';
            li.textContent = emoji;
            li.title = 'Drag to reorder · click to remove';
            li.draggable = true;
            li.dataset.index = String(i);

            li.addEventListener('click', () => {
                // Suppress click that fires immediately after a successful drop.
                if (dragMoved) { dragMoved = false; return; }
                state.emojis.splice(i, 1);
                onStateChange();
            });

            li.addEventListener('dragstart', (e) => {
                dragSourceIndex = i;
                dragMoved = false;
                e.dataTransfer.effectAllowed = 'move';
                e.dataTransfer.setData('text/plain', String(i));
                li.classList.add('dragging');
            });

            li.addEventListener('dragend', () => {
                li.classList.remove('dragging');
                els.slots.querySelectorAll('.drop-target')
                    .forEach((el) => el.classList.remove('drop-target'));
                dragSourceIndex = null;
            });
        } else {
            li.className = 'emoji-slot empty';
            li.textContent = '+';
            li.title = 'Pick an emoji from the grid';
        }

        // Both filled and empty slots can be drop targets — dropping on an
        // empty slot moves the dragged emoji to the end (its visible position).
        li.addEventListener('dragover', (e) => {
            if (dragSourceIndex === null) return;
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
            li.classList.add('drop-target');
        });

        li.addEventListener('dragleave', () => {
            li.classList.remove('drop-target');
        });

        li.addEventListener('drop', (e) => {
            e.preventDefault();
            li.classList.remove('drop-target');
            const from = dragSourceIndex;
            if (from === null) return;
            // Empty slot drop → target index is clamped to current length.
            const targetVisibleIndex = Number(li.dataset.index ?? state.emojis.length);
            const to = Math.min(targetVisibleIndex, state.emojis.length - 1);
            if (from === to) return;
            const [moved] = state.emojis.splice(from, 1);
            state.emojis.splice(to, 0, moved);
            dragMoved = true;
            onStateChange();
        });

        // Empty slots still need a dataset.index for the drop target math.
        if (!emoji) li.dataset.index = String(i);

        els.slots.appendChild(li);
    }
}

function renderLayoutOptions() {
    els.layoutOptions.replaceChildren();
    const count = state.emojis.length;
    for (const key of LAYOUT_KEYS) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'layout-option';
        if (state.layout === key) btn.classList.add('active');

        const glyph = document.createElement('span');
        glyph.className = key === 'auto' ? 'layout-glyph lg-auto' : `layout-glyph lg-${key}`;
        if (key !== 'auto') {
            for (let i = 0; i < LAYOUT_CELL_COUNT[key]; i += 1) glyph.appendChild(document.createElement('span'));
        }
        btn.appendChild(glyph);

        const label = document.createElement('span');
        label.textContent = key;
        btn.appendChild(label);

        // Disable layouts whose cell count doesn't match the current selection.
        if (count === 0 && key !== 'auto') {
            btn.disabled = true;
        } else if (key !== 'auto' && LAYOUT_CELL_COUNT[key] !== count) {
            btn.disabled = true;
        }

        btn.addEventListener('click', () => {
            state.layout = key;
            onStateChange();
        });
        els.layoutOptions.appendChild(btn);
    }
}

function renderEmbed() {
    if (state.emojis.length === 0) {
        els.embedOutput.textContent = '<jamoji-block></jamoji-block>';
        return;
    }
    const attrs = [];
    if (state.layout !== 'auto') attrs.push(`layout="${state.layout}"`);
    if (state.label) attrs.push(`label="${escapeAttr(state.label)}"`);
    const attrStr = attrs.length ? ' ' + attrs.join(' ') : '';
    els.embedOutput.textContent = `<jamoji-block${attrStr}>${state.emojis.join('')}</jamoji-block>`;
}

function escapeAttr(s) {
    return s.replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function updatePreviewBlocks() {
    updateBlock(els.activeBlock);
    for (const b of els.previewBlocks) updateBlock(b);
}

function syncControls() {
    els.labelInput.value = state.label;
}

function onStateChange() {
    // If the saved layout no longer fits the emoji count, reset to auto so
    // the rendered block stays valid and the layout selector shows the
    // user's effective choice.
    if (state.layout !== 'auto'
        && state.emojis.length > 0
        && LAYOUT_CELL_COUNT[state.layout] !== state.emojis.length) {
        state.layout = 'auto';
    }
    renderSlots();
    renderLayoutOptions();
    updatePreviewBlocks();
    renderEmbed();
    writeFragment();
    updateActionsEnabled();
}

function updateActionsEnabled() {
    const hasEmojis = state.emojis.length > 0;
    els.copyEmbed.disabled = !hasEmojis;
    els.copyLink.disabled = !hasEmojis;
}

// ─── URL fragment encoding ────────────────────────────────────────────────

function readFragment() {
    const hash = location.hash.replace(/^#/, '');
    if (!hash) return;
    const params = new URLSearchParams(hash);
    const e = params.get('e');
    if (e) state.emojis = splitGraphemes(e).slice(0, MAX_EMOJIS);
    const l = params.get('l');
    if (l && LAYOUT_KEYS.includes(l)) state.layout = l;
    const lb = params.get('lb');
    if (lb) state.label = lb;
}

function writeFragment() {
    const params = new URLSearchParams();
    if (state.emojis.length) params.set('e', state.emojis.join(''));
    if (state.layout && state.layout !== 'auto') params.set('l', state.layout);
    if (state.label) params.set('lb', state.label);
    const str = params.toString();
    const next = str ? `#${str}` : location.pathname + location.search;
    history.replaceState(null, '', str ? `${location.pathname}${location.search}#${str}` : location.pathname + location.search);
}

// ─── Clipboard + toast ─────────────────────────────────────────────────────

let toastTimer = null;
function toast(message) {
    els.toast.textContent = message;
    els.toast.classList.add('visible');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => els.toast.classList.remove('visible'), 1500);
}

async function copy(text) {
    try {
        await navigator.clipboard.writeText(text);
        return true;
    } catch (err) {
        console.warn('clipboard write failed', err);
        return false;
    }
}

// ─── Wiring ────────────────────────────────────────────────────────────────

function addEmoji(emoji) {
    if (state.emojis.length >= MAX_EMOJIS) {
        toast(`Max ${MAX_EMOJIS} emojis`);
        return;
    }
    state.emojis.push(emoji);
    onStateChange();
}

const picker = createPicker({
    tabsEl: els.tabs,
    gridEl: els.grid,
    statusEl: els.pickerStatus,
    onPick: addEmoji,
});

els.pickerSearch.addEventListener('input', (e) => {
    picker.setSearch(e.target.value);
});

els.labelInput.addEventListener('input', (e) => {
    state.label = e.target.value;
    updatePreviewBlocks();
    renderEmbed();
    writeFragment();
});

els.copyEmbed.addEventListener('click', async () => {
    const ok = await copy(els.embedOutput.textContent);
    toast(ok ? 'Embed copied' : 'Copy failed');
});

els.copyLink.addEventListener('click', async () => {
    const ok = await copy(location.href);
    toast(ok ? 'Link copied' : 'Copy failed');
});

els.showHelp.addEventListener('click', () => {
    els.helpDialog.showModal();
});

els.helpClose.addEventListener('click', () => {
    els.helpDialog.close();
});

// Click on backdrop (outside .help-dialog-body) closes the dialog.
els.helpDialog.addEventListener('click', (e) => {
    if (e.target === els.helpDialog) els.helpDialog.close();
});

window.addEventListener('hashchange', () => {
    readFragment();
    syncControls();
    onStateChange();
});

// ─── Boot ──────────────────────────────────────────────────────────────────

readFragment();
syncControls();
onStateChange();
picker.init();
