import { loadDetector } from "./detector.js";
import { STYLES, GROUP_LABELS, DEFAULT_STYLE } from "./googly.js";

const fileInput        = document.getElementById("file-input");
const dropZone         = document.getElementById("drop-zone");
const canvas           = document.getElementById("preview-canvas");
const ctx              = canvas.getContext("2d");
const emptyState       = document.getElementById("empty-state");
const errorOverlay     = document.getElementById("error-overlay");
const errorMessage     = document.getElementById("error-message");
const downloadBtn      = document.getElementById("download-btn");
const statusEl         = document.getElementById("status");
const themeToggle      = document.getElementById("theme-toggle");
const styleSelect      = document.getElementById("style-select");
const faceRail         = document.getElementById("face-rail");
const faceRailList     = document.getElementById("face-rail-list");
const faceRailToggleAll = document.getElementById("face-rail-toggle-all");

let currentObjectUrl = null;
let lastImage = null;
let lastFaces = null;
let selectedFaces = new Set();

const savedStyle = localStorage.getItem("eye-style");
let currentStyle = STYLES[savedStyle] ? savedStyle : DEFAULT_STYLE;

const grouped = {};
for (const [key, style] of Object.entries(STYLES)) {
    (grouped[style.group] ||= []).push({ key, label: style.label });
}
for (const list of Object.values(grouped)) {
    list.sort((a, b) => a.label.localeCompare(b.label));
}
if (grouped.wobbly) {
    const classicIdx = grouped.wobbly.findIndex((s) => s.key === DEFAULT_STYLE);
    if (classicIdx > 0) {
        const [classic] = grouped.wobbly.splice(classicIdx, 1);
        grouped.wobbly.unshift(classic);
    }
}
for (const groupKey of Object.keys(GROUP_LABELS)) {
    const items = grouped[groupKey];
    if (!items?.length) continue;
    const optgroup = document.createElement("optgroup");
    optgroup.label = GROUP_LABELS[groupKey];
    for (const item of items) {
        const opt = document.createElement("option");
        opt.value = item.key;
        opt.textContent = item.label;
        if (item.key === currentStyle) opt.selected = true;
        optgroup.appendChild(opt);
    }
    styleSelect.appendChild(optgroup);
}

styleSelect.addEventListener("change", () => {
    currentStyle = STYLES[styleSelect.value] ? styleSelect.value : DEFAULT_STYLE;
    localStorage.setItem("eye-style", currentStyle);
    renderEyes();
});

function renderEyes() {
    if (!lastImage) return;
    ctx.drawImage(lastImage, 0, 0);
    if (!lastFaces || !lastFaces.length) return;
    const style = STYLES[currentStyle] || STYLES[DEFAULT_STYLE];
    for (let fi = 0; fi < lastFaces.length; fi++) {
        if (!selectedFaces.has(fi)) continue;
        const face = lastFaces[fi];
        const radius = face.faceSize * 0.13;
        const midX = face.eyes.reduce((s, e) => s + e.x, 0) / face.eyes.length;
        const faceSeed = Math.random();
        for (let i = 0; i < face.eyes.length; i++) {
            const eye = face.eyes[i];
            const side = Math.sign(eye.x - midX) || 1;
            const rotation = style.fan === false ? 0 : side * (Math.PI / 12);
            const opts = {
                inwardX: -side * Math.cos(rotation),
                inwardY: Math.abs(Math.sin(rotation)),
                side,
                eyeIndex: i,
                eyeCount: face.eyes.length,
                faceSeed,
            };
            ctx.save();
            ctx.translate(eye.x, eye.y);
            ctx.rotate(rotation);
            style.draw(ctx, 0, 0, radius, opts);
            ctx.restore();
        }
    }
}

function buildFaceRail() {
    faceRailList.innerHTML = "";
    if (!lastFaces || lastFaces.length < 2) {
        faceRail.hidden = true;
        return;
    }
    faceRail.hidden = false;

    for (let i = 0; i < lastFaces.length; i++) {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "face-rail-item";
        btn.dataset.index = String(i);
        btn.setAttribute("aria-pressed", selectedFaces.has(i) ? "true" : "false");
        btn.setAttribute("aria-label", `Face ${i + 1}`);

        const thumb = document.createElement("canvas");
        thumb.className = "face-rail-thumb";
        thumb.width = 96;
        thumb.height = 96;
        drawFaceThumb(thumb, lastFaces[i]);
        btn.appendChild(thumb);

        const check = document.createElement("span");
        check.className = "face-rail-check";
        check.textContent = "✓";
        check.setAttribute("aria-hidden", "true");
        btn.appendChild(check);

        btn.addEventListener("click", () => toggleFace(i, btn));
        faceRailList.appendChild(btn);
    }
    updateToggleAllLabel();
}

function drawFaceThumb(thumbCanvas, face) {
    const tctx = thumbCanvas.getContext("2d");
    tctx.fillStyle = "#000";
    tctx.fillRect(0, 0, thumbCanvas.width, thumbCanvas.height);
    if (!lastImage || !face.bbox) return;

    const pad = Math.max(face.bbox.w, face.bbox.h) * 0.15;
    const sx = Math.max(0, face.bbox.x - pad);
    const sy = Math.max(0, face.bbox.y - pad);
    const sw = Math.min(lastImage.naturalWidth - sx, face.bbox.w + pad * 2);
    const sh = Math.min(lastImage.naturalHeight - sy, face.bbox.h + pad * 2);

    const scale = Math.max(thumbCanvas.width / sw, thumbCanvas.height / sh);
    const dw = sw * scale;
    const dh = sh * scale;
    const dx = (thumbCanvas.width - dw) / 2;
    const dy = (thumbCanvas.height - dh) / 2;
    tctx.drawImage(lastImage, sx, sy, sw, sh, dx, dy, dw, dh);
}

function toggleFace(index, btn) {
    if (selectedFaces.has(index)) selectedFaces.delete(index);
    else selectedFaces.add(index);
    btn.setAttribute("aria-pressed", selectedFaces.has(index) ? "true" : "false");
    updateToggleAllLabel();
    renderEyes();
}

function updateToggleAllLabel() {
    if (!lastFaces) return;
    const allSelected = selectedFaces.size === lastFaces.length;
    faceRailToggleAll.textContent = allSelected ? "Deselect all" : "Select all";
}

faceRailToggleAll.addEventListener("click", () => {
    if (!lastFaces) return;
    const allSelected = selectedFaces.size === lastFaces.length;
    selectedFaces = new Set();
    if (!allSelected) {
        for (let i = 0; i < lastFaces.length; i++) selectedFaces.add(i);
    }
    for (const btn of faceRailList.children) {
        const idx = Number(btn.dataset.index);
        btn.setAttribute("aria-pressed", selectedFaces.has(idx) ? "true" : "false");
    }
    updateToggleAllLabel();
    renderEyes();
});

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

function loadImageFromUrl(url) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        // Required so the canvas isn't tainted and Download still works.
        // Remote host must send permissive CORS headers.
        img.crossOrigin = "anonymous";
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error("Failed to load image"));
        img.src = url;
    });
}

async function processFile(file) {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
        showError("That doesn't look like an image file.");
        return;
    }

    clearError();
    downloadBtn.disabled = true;
    setStatus("Loading image…");

    let img;
    try {
        img = await loadImageFromFile(file);
    } catch {
        setStatus("");
        showError("Couldn't read that file as an image.");
        return;
    }

    await processImage(img);
}

async function processUrl(url) {
    clearError();
    downloadBtn.disabled = true;
    setStatus("Fetching image…");

    let img;
    try {
        img = await loadImageFromUrl(url);
    } catch {
        setStatus("");
        showError("Couldn't load the image from that URL. The host may not allow cross-origin requests.");
        return;
    }

    await processImage(img);
}

async function processImage(img) {
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    ctx.drawImage(img, 0, 0);
    emptyState.hidden = true;
    canvas.hidden = false;
    faceRail.hidden = true;
    faceRailList.innerHTML = "";

    setStatus("Loading face detector…");
    let detector;
    try {
        detector = await loadDetector();
    } catch (err) {
        console.error(err);
        setStatus("");
        showError("Couldn't load the face detector. Check your connection and try again.");
        return;
    }

    setStatus("Detecting faces…");
    let faces;
    try {
        faces = await detector.detect(img);
    } catch (err) {
        console.error(err);
        setStatus("");
        showError("Detection failed: " + err.message);
        return;
    }
    setStatus("");

    if (!faces.length) {
        lastImage = img;
        lastFaces = null;
        selectedFaces = new Set();
        buildFaceRail();
        showError("No eyes detected. Try a clearer photo with visible faces.");
        return;
    }

    faces.sort((a, b) => (a.bbox?.x ?? 0) - (b.bbox?.x ?? 0));

    lastImage = img;
    lastFaces = faces;
    selectedFaces = new Set(faces.map((_, i) => i));
    buildFaceRail();
    renderEyes();

    downloadBtn.disabled = false;
}

fileInput.addEventListener("change", (e) => {
    const file = e.target.files && e.target.files[0];
    if (file) processFile(file);
    fileInput.value = "";
});

downloadBtn.addEventListener("click", () => {
    if (downloadBtn.disabled) return;
    canvas.toBlob((blob) => {
        if (!blob) return;
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "googly.png";
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
    }, "image/png");
});

// Drag-and-drop on the whole page. Track enter/leave depth to avoid the
// overlay flickering when the cursor crosses child element boundaries.
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

// Theme
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

// ?from=<url> — auto-load an image from a remote URL on page open.
const fromParam = new URLSearchParams(location.search).get("from");
if (fromParam) {
    try {
        const parsed = new URL(fromParam);
        if (parsed.protocol === "http:" || parsed.protocol === "https:") {
            processUrl(parsed.href);
        } else {
            showError("Unsupported URL scheme in ?from= parameter.");
        }
    } catch {
        showError("Invalid URL in ?from= parameter.");
    }
}
