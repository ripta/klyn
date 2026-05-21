import * as History from "./history.js";
import { Tools, applyCrop, applyResize, syncOverlay, cancelGesture } from "./tools.js";

const fileInput     = document.getElementById("file-input");
const dropZone      = document.getElementById("drop-zone");
const emptyState    = document.getElementById("empty-state");
const canvasWrap    = document.getElementById("canvas-wrap");
const mainCanvas    = document.getElementById("main-canvas");
const overlayCanvas = document.getElementById("overlay-canvas");
const errorOverlay  = document.getElementById("error-overlay");
const errorMessage  = document.getElementById("error-message");
const downloadBtn   = document.getElementById("download-btn");
const statusEl      = document.getElementById("status");
const themeToggle   = document.getElementById("theme-toggle");
const toolRail      = document.getElementById("tool-rail");
const toolButtons   = document.querySelectorAll(".tool-btn");
const colorInput    = document.getElementById("color-input");
const strokeRow     = document.getElementById("stroke-row");
const strokeInput   = document.getElementById("stroke-input");
const strokeOutput  = document.getElementById("stroke-output");
const fillRow       = document.getElementById("fill-row");
const fillInput     = document.getElementById("fill-input");
const cropActions   = document.getElementById("crop-actions");
const cropApply     = document.getElementById("crop-apply");
const cropCancel    = document.getElementById("crop-cancel");
const stampStyleRow = document.getElementById("stamp-style-row");
const stampStyleBtns = document.querySelectorAll(".stamp-style-btn");
const stampSizeRow  = document.getElementById("stamp-size-row");
const stampSizeInput = document.getElementById("stamp-size-input");
const stampSizeOutput = document.getElementById("stamp-size-output");
const imageInfo     = document.getElementById("image-info");
const infoSize      = document.getElementById("info-size");
const infoRatio     = document.getElementById("info-ratio");
const infoFile      = document.getElementById("info-file");
const infoFormat    = document.getElementById("info-format");
const resizeToggle  = document.getElementById("resize-toggle");
const resizeControls = document.getElementById("resize-controls");
const resizeW       = document.getElementById("resize-w");
const resizeH       = document.getElementById("resize-h");
const resizeLock    = document.getElementById("resize-lock");
const resizeApply   = document.getElementById("resize-apply");
const resizeCancel  = document.getElementById("resize-cancel");
const historyList   = document.getElementById("history-list");
const historyCount  = document.getElementById("history-count");

const mainCtx    = mainCanvas.getContext("2d");
const overlayCtx = overlayCanvas.getContext("2d");

let currentObjectUrl = null;
let activeTool = "rect";
let pointerActive = false;
let pointerId = null;

const SAVED_STAMP_STYLE = ["solid", "cutout", "outline"].includes(localStorage.getItem("stamp-style"))
    ? localStorage.getItem("stamp-style") : "solid";
const SAVED_STAMP_SIZE = (() => {
    const n = Number(localStorage.getItem("stamp-size"));
    return Number.isFinite(n) && n >= 8 && n <= 64 ? n : 16;
})();
stampSizeInput.value = SAVED_STAMP_SIZE;
stampSizeOutput.value = SAVED_STAMP_SIZE;

const state = {
    mainCanvas,
    mainCtx,
    overlayCanvas,
    overlayCtx,
    color: colorInput.value,
    stroke: Number(strokeInput.value),
    fill: fillInput.checked,
    start: null,
    cropRect: null,
    stampStyle: SAVED_STAMP_STYLE,
    stampSize: SAVED_STAMP_SIZE,
    nextStampNumber: 1,
    lastStampNumber: null,
    fileName: null,
    fileType: null,
};

stampSizeInput.addEventListener("input", () => {
    const n = Number(stampSizeInput.value);
    state.stampSize = n;
    stampSizeOutput.value = String(n);
    localStorage.setItem("stamp-size", String(n));
});

for (const btn of stampStyleBtns) {
    btn.setAttribute("aria-checked", btn.dataset.style === state.stampStyle ? "true" : "false");
    btn.addEventListener("click", () => {
        state.stampStyle = btn.dataset.style;
        localStorage.setItem("stamp-style", state.stampStyle);
        for (const b of stampStyleBtns) {
            b.setAttribute("aria-checked", b.dataset.style === state.stampStyle ? "true" : "false");
        }
    });
}

History.init({
    canvas: mainCanvas,
    listEl: historyList,
    countEl: historyCount,
    onRestore: () => {
        syncOverlay(state);
        syncResizeInputs();
        refreshImageInfo();
        exitResizeEdit();
        cancelGesture(state);
        hideCropActions();
        recalcStampCounter();
    },
});

// --- Status / errors -------------------------------------------------------

function recalcStampCounter() {
    state.nextStampNumber = History.countLabelThrough("Stamp", History.current()) + 1;
}

function setStatus(text) {
    statusEl.textContent = text || "";
    statusEl.hidden = !text;
}

function showError(msg) {
    errorMessage.textContent = msg;
    errorOverlay.hidden = false;
}

function clearError() {
    errorOverlay.hidden = true;
}

// --- Image load / file handling -------------------------------------------

function loadImageFromFile(file) {
    return new Promise((resolve, reject) => {
        if (currentObjectUrl) URL.revokeObjectURL(currentObjectUrl);
        currentObjectUrl = URL.createObjectURL(file);
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error("Failed to decode image"));
        img.src = currentObjectUrl;
    });
}

async function processFile(file) {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
        showError("That doesn't look like an image file.");
        return;
    }
    clearError();
    setStatus("Loading image…");
    let img;
    try {
        img = await loadImageFromFile(file);
    } catch {
        setStatus("");
        showError("Couldn't read that file as an image.");
        return;
    }
    setStatus("");
    state.fileName = file.name;
    state.fileType = file.type;
    await openImage(img);
}

async function openImage(img) {
    mainCanvas.width = img.naturalWidth;
    mainCanvas.height = img.naturalHeight;
    mainCtx.drawImage(img, 0, 0);
    syncOverlay(state);

    emptyState.hidden = true;
    canvasWrap.hidden = false;
    toolRail.hidden = false;
    downloadBtn.disabled = false;
    syncResizeInputs();
    refreshImageInfo();
    exitResizeEdit();
    hideCropActions();

    state.nextStampNumber = 1;
    state.lastStampNumber = null;
    History.reset();
    await History.push("Open", `${mainCanvas.width}×${mainCanvas.height}`);
}

fileInput.addEventListener("change", (e) => {
    const file = e.target.files && e.target.files[0];
    if (file) processFile(file);
    fileInput.value = "";
});

// --- Drag-and-drop --------------------------------------------------------

let dragDepth = 0;
window.addEventListener("dragenter", (e) => {
    if (!e.dataTransfer || ![...e.dataTransfer.types].includes("Files")) return;
    e.preventDefault();
    dragDepth++;
    dropZone.classList.add("drag-over");
});
window.addEventListener("dragover", (e) => {
    if (e.dataTransfer && [...e.dataTransfer.types].includes("Files")) {
        e.preventDefault();
        e.dataTransfer.dropEffect = "copy";
    }
});
window.addEventListener("dragleave", () => {
    dragDepth = Math.max(0, dragDepth - 1);
    if (dragDepth === 0) dropZone.classList.remove("drag-over");
});
window.addEventListener("drop", (e) => {
    if (!e.dataTransfer) return;
    e.preventDefault();
    dragDepth = 0;
    dropZone.classList.remove("drag-over");
    const file = e.dataTransfer.files && e.dataTransfer.files[0];
    if (file) processFile(file);
});

// --- Tool selection -------------------------------------------------------

const TOOL_OPTIONS = {
    crop:     { stroke: false, fill: false, stampStyle: false, stampSize: false },
    rect:     { stroke: true,  fill: true  },
    circle:   { stroke: true,  fill: true  },
    arrow:    { stroke: true,  fill: false },
    dropper:  {},
    stamp:    { stampStyle: true, stampSize: true },
    pixelate: {},
};

function applyToolOptions(name) {
    const o = TOOL_OPTIONS[name] || {};
    strokeRow.hidden = !o.stroke;
    fillRow.hidden = !o.fill;
    stampStyleRow.hidden = !o.stampStyle;
    stampSizeRow.hidden = !o.stampSize;
}

function setActiveTool(name) {
    if (!Tools[name]) return;
    activeTool = name;
    for (const btn of toolButtons) {
        btn.setAttribute("aria-checked", btn.dataset.tool === name ? "true" : "false");
    }
    cancelGesture(state);
    canvasWrap.classList.toggle("tool-dropper", name === "dropper");
    canvasWrap.classList.toggle("tool-active", true);
    hideCropActions();
    applyToolOptions(name);
}

for (const btn of toolButtons) {
    btn.addEventListener("click", () => setActiveTool(btn.dataset.tool));
}

setActiveTool(activeTool);

const SHORTCUTS = {
    c: "crop", r: "rect", o: "circle", a: "arrow",
    i: "dropper", n: "stamp", p: "pixelate",
};
document.addEventListener("keydown", (e) => {
    const t = e.target;
    const inInput = t && (t.matches?.("input, textarea, select") || t.isContentEditable);
    if (inInput) return;

    if ((e.metaKey || e.ctrlKey) && !e.altKey && e.key.toLowerCase() === "z") {
        if (toolRail.hidden) return;
        e.preventDefault();
        const target = History.current() + (e.shiftKey ? 1 : -1);
        History.select(target);
        return;
    }

    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const tool = SHORTCUTS[e.key.toLowerCase()];
    if (!tool || toolRail.hidden) return;
    e.preventDefault();
    setActiveTool(tool);
});

colorInput.addEventListener("input", () => { state.color = colorInput.value; });
strokeInput.addEventListener("input", () => {
    state.stroke = Number(strokeInput.value);
    strokeOutput.value = strokeInput.value;
});
fillInput.addEventListener("change", () => { state.fill = fillInput.checked; });

// --- Pointer handling on the overlay --------------------------------------

function toCanvasCoords(ev) {
    const rect = overlayCanvas.getBoundingClientRect();
    const sx = overlayCanvas.width / rect.width;
    const sy = overlayCanvas.height / rect.height;
    return {
        x: (ev.clientX - rect.left) * sx,
        y: (ev.clientY - rect.top) * sy,
    };
}

overlayCanvas.addEventListener("pointerdown", (e) => {
    if (canvasWrap.hidden) return;
    e.preventDefault();
    try { overlayCanvas.setPointerCapture(e.pointerId); } catch {}
    pointerActive = true;
    pointerId = e.pointerId;
    const tool = Tools[activeTool];
    const { x, y } = toCanvasCoords(e);
    tool.onDown(state, { x, y, event: e });
});

overlayCanvas.addEventListener("pointermove", (e) => {
    if (!pointerActive || e.pointerId !== pointerId) return;
    const tool = Tools[activeTool];
    const { x, y } = toCanvasCoords(e);
    tool.onMove(state, { x, y, event: e });
});

overlayCanvas.addEventListener("pointerup", async (e) => {
    if (!pointerActive || e.pointerId !== pointerId) return;
    pointerActive = false;
    pointerId = null;
    try { overlayCanvas.releasePointerCapture(e.pointerId); } catch {}
    const tool = Tools[activeTool];
    const { x, y } = toCanvasCoords(e);
    const result = tool.onUp(state, { x, y, event: e });
    if (!result) return;

    if (result.picked) {
        colorInput.value = result.picked;
        state.color = result.picked;
        return;
    }

    if (result.commit && result.label) {
        await History.push(result.label, result.meta);
    } else if (activeTool === "crop" && state.cropRect) {
        showCropActions();
    }
});

overlayCanvas.addEventListener("pointercancel", () => {
    pointerActive = false;
    pointerId = null;
    cancelGesture(state);
});

// --- Crop apply/cancel ----------------------------------------------------

function showCropActions() { cropActions.hidden = false; }
function hideCropActions() { cropActions.hidden = true; }

cropApply.addEventListener("click", async () => {
    const result = applyCrop(state);
    if (!result) {
        hideCropActions();
        return;
    }
    syncResizeInputs();
    refreshImageInfo();
    hideCropActions();
    await History.push(result.label, result.meta);
});

cropCancel.addEventListener("click", () => {
    cancelGesture(state);
    hideCropActions();
});

// --- Size display + resize edit ------------------------------------------

let suppressResizeSync = false;

function syncResizeInputs() {
    suppressResizeSync = true;
    resizeW.value = mainCanvas.width;
    resizeH.value = mainCanvas.height;
    suppressResizeSync = false;
}

function gcd(a, b) { return b === 0 ? a : gcd(b, a % b); }

function formatRatio(w, h) {
    if (!w || !h) return "—";
    const g = gcd(w, h);
    const rw = w / g, rh = h / g;
    if (rw <= 64 && rh <= 64) return `${rw} : ${rh}`;
    return w >= h ? `${(w / h).toFixed(2)} : 1` : `1 : ${(h / w).toFixed(2)}`;
}

function formatType(mime) {
    if (!mime) return "—";
    const t = mime.replace(/^image\//i, "").toUpperCase();
    return ({ JPG: "JPEG", "SVG+XML": "SVG" }[t]) || (t === "WEBP" ? "WebP" : t);
}

function refreshImageInfo() {
    if (mainCanvas.width && mainCanvas.height) {
        infoSize.textContent = `${mainCanvas.width} × ${mainCanvas.height}`;
        infoRatio.textContent = formatRatio(mainCanvas.width, mainCanvas.height);
        resizeToggle.disabled = false;
    } else {
        infoSize.textContent = "—";
        infoRatio.textContent = "—";
        resizeToggle.disabled = true;
    }
    infoFile.textContent = state.fileName || "—";
    infoFile.title = state.fileName || "";
    infoFormat.textContent = formatType(state.fileType);
}

function enterResizeEdit() {
    syncResizeInputs();
    resizeControls.hidden = false;
    imageInfo.hidden = true;
    resizeToggle.hidden = true;
}

function exitResizeEdit() {
    resizeControls.hidden = true;
    imageInfo.hidden = false;
    resizeToggle.hidden = false;
}

resizeToggle.addEventListener("click", enterResizeEdit);
resizeCancel.addEventListener("click", exitResizeEdit);

resizeW.addEventListener("input", () => {
    if (suppressResizeSync) return;
    if (resizeLock.checked && mainCanvas.width > 0) {
        const ratio = mainCanvas.height / mainCanvas.width;
        suppressResizeSync = true;
        resizeH.value = Math.max(1, Math.round(Number(resizeW.value) * ratio));
        suppressResizeSync = false;
    }
});

resizeH.addEventListener("input", () => {
    if (suppressResizeSync) return;
    if (resizeLock.checked && mainCanvas.height > 0) {
        const ratio = mainCanvas.width / mainCanvas.height;
        suppressResizeSync = true;
        resizeW.value = Math.max(1, Math.round(Number(resizeH.value) * ratio));
        suppressResizeSync = false;
    }
});

resizeApply.addEventListener("click", async () => {
    const w = Number(resizeW.value);
    const h = Number(resizeH.value);
    if (!Number.isFinite(w) || !Number.isFinite(h) || w < 1 || h < 1) return;
    const result = applyResize(state, w, h);
    exitResizeEdit();
    if (!result) return;
    refreshImageInfo();
    await History.push(result.label, result.meta);
});

// --- Download -------------------------------------------------------------

downloadBtn.addEventListener("click", () => {
    if (downloadBtn.disabled) return;
    mainCanvas.toBlob((blob) => {
        if (!blob) return;
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "photo-edit.png";
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
    }, "image/png");
});

// --- Theme ----------------------------------------------------------------

const root = document.documentElement;

function applyTheme(theme) {
    if (theme === "dark") root.setAttribute("data-theme", "dark");
    else root.removeAttribute("data-theme");
}

const saved = localStorage.getItem("theme");
const systemDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
applyTheme(saved || (systemDark ? "dark" : "light"));

themeToggle.addEventListener("click", () => {
    const next = root.getAttribute("data-theme") === "dark" ? "light" : "dark";
    applyTheme(next);
    localStorage.setItem("theme", next);
});

window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", (e) => {
    if (!localStorage.getItem("theme")) applyTheme(e.matches ? "dark" : "light");
});
