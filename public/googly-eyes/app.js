import { loadDetector } from "./detector.js";
import { drawGooglyEye } from "./googly.js";

const fileInput     = document.getElementById("file-input");
const dropZone      = document.getElementById("drop-zone");
const canvas        = document.getElementById("preview-canvas");
const ctx           = canvas.getContext("2d");
const emptyState    = document.getElementById("empty-state");
const errorOverlay  = document.getElementById("error-overlay");
const errorMessage  = document.getElementById("error-message");
const downloadBtn   = document.getElementById("download-btn");
const statusEl      = document.getElementById("status");
const themeToggle   = document.getElementById("theme-toggle");

let currentObjectUrl = null;

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
        showError("No eyes detected. Try a clearer photo with visible faces.");
        return;
    }

    for (const face of faces) {
        const radius = face.faceSize * 0.13;
        for (const eye of face.eyes) {
            drawGooglyEye(ctx, eye.x, eye.y, radius);
        }
    }

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
