// Snapshot-based history stack. Each entry holds an ImageBitmap of the canvas
// plus its dimensions and a small thumbnail for the rail. Capped at MAX to
// keep memory bounded for large images.

const MAX = 20;
const THUMB_W = 56;
const THUMB_H = 42;

let canvas = null;
let ctx = null;
let listEl = null;
let countEl = null;
let onRestore = null;

let entries = [];
let currentIndex = -1;

export function init(opts) {
    canvas = opts.canvas;
    ctx = canvas.getContext("2d");
    listEl = opts.listEl;
    countEl = opts.countEl;
    onRestore = opts.onRestore || (() => {});
    render();
}

export function reset() {
    for (const e of entries) e.bitmap.close?.();
    entries = [];
    currentIndex = -1;
    render();
}

export function size() {
    return entries.length;
}

export function current() {
    return currentIndex;
}

export function countLabelThrough(label, throughIndex) {
    const upTo = Math.min(throughIndex, entries.length - 1);
    let n = 0;
    for (let i = 0; i <= upTo; i++) if (entries[i]?.label === label) n++;
    return n;
}

export async function push(label, meta) {
    const bitmap = await createImageBitmap(canvas);
    const thumb = makeThumb(canvas);
    const entry = { bitmap, width: canvas.width, height: canvas.height, label, meta, thumb };

    // Branch: dropping entries that were "future" relative to the current
    // pointer. This is the standard editor behavior — once you take a new
    // action from a restored state, you commit to that branch.
    if (currentIndex < entries.length - 1) {
        for (const e of entries.slice(currentIndex + 1)) e.bitmap.close?.();
        entries = entries.slice(0, currentIndex + 1);
    }

    entries.push(entry);
    currentIndex = entries.length - 1;

    while (entries.length > MAX) {
        const dropped = entries.shift();
        dropped.bitmap.close?.();
        currentIndex--;
    }

    render();
}

export async function select(index) {
    if (index < 0 || index >= entries.length || index === currentIndex) return;
    const e = entries[index];
    canvas.width = e.width;
    canvas.height = e.height;
    ctx.drawImage(e.bitmap, 0, 0);
    currentIndex = index;
    render();
    onRestore(e);
}

function makeThumb(src) {
    const thumb = document.createElement("canvas");
    thumb.width = THUMB_W;
    thumb.height = THUMB_H;
    const tctx = thumb.getContext("2d");
    tctx.fillStyle = "#000";
    tctx.fillRect(0, 0, THUMB_W, THUMB_H);
    const scale = Math.min(THUMB_W / src.width, THUMB_H / src.height);
    const dw = src.width * scale;
    const dh = src.height * scale;
    tctx.drawImage(src, (THUMB_W - dw) / 2, (THUMB_H - dh) / 2, dw, dh);
    return thumb.toDataURL();
}

function render() {
    if (!listEl) return;
    countEl.textContent = `${entries.length} / ${MAX}`;
    listEl.innerHTML = "";
    // Newest at top.
    for (let i = entries.length - 1; i >= 0; i--) {
        const e = entries[i];
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "history-item";
        if (i === currentIndex) btn.setAttribute("aria-current", "true");
        if (i > currentIndex) btn.classList.add("future");
        btn.setAttribute("role", "listitem");

        const img = document.createElement("img");
        img.className = "history-thumb";
        img.src = e.thumb;
        img.alt = "";
        btn.appendChild(img);

        const meta = document.createElement("div");
        meta.className = "history-meta";
        const lbl = document.createElement("span");
        lbl.className = "history-label";
        lbl.textContent = e.label;
        meta.appendChild(lbl);
        if (e.meta) {
            const sz = document.createElement("span");
            sz.className = "history-size";
            sz.textContent = e.meta;
            meta.appendChild(sz);
        }
        btn.appendChild(meta);

        btn.addEventListener("click", () => select(i));
        listEl.appendChild(btn);
    }
}
