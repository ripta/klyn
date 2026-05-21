// Tool implementations. Each tool exports:
//   onDown(state, ev)  — starts a gesture, optional return
//   onMove(state, ev)  — updates the preview on the overlay
//   onUp(state, ev)    — commits to the main canvas (or finalizes), returns
//                        { commit: bool, label?: string, ephemeral?: bool }
//
// `ev` carries canvas-space coords (x, y) plus the original DOM event for
// modifier-key inspection (shiftKey).

function clearOverlay(state) {
    const c = state.overlayCanvas;
    state.overlayCtx.clearRect(0, 0, c.width, c.height);
}

function normRect(x0, y0, x1, y1, square) {
    let dx = x1 - x0;
    let dy = y1 - y0;
    if (square) {
        const m = Math.max(Math.abs(dx), Math.abs(dy));
        dx = Math.sign(dx || 1) * m;
        dy = Math.sign(dy || 1) * m;
    }
    const x = Math.min(x0, x0 + dx);
    const y = Math.min(y0, y0 + dy);
    return { x, y, w: Math.abs(dx), h: Math.abs(dy) };
}

function strokeRect(ctx, r, color, stroke, fill) {
    if (fill) {
        ctx.fillStyle = color;
        ctx.fillRect(r.x, r.y, r.w, r.h);
    }
    ctx.lineWidth = stroke;
    ctx.strokeStyle = color;
    ctx.strokeRect(r.x, r.y, r.w, r.h);
}

function strokeEllipse(ctx, r, color, stroke, fill) {
    const cx = r.x + r.w / 2;
    const cy = r.y + r.h / 2;
    const rx = r.w / 2;
    const ry = r.h / 2;
    if (rx <= 0 || ry <= 0) return;
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
    if (fill) {
        ctx.fillStyle = color;
        ctx.fill();
    }
    ctx.lineWidth = stroke;
    ctx.strokeStyle = color;
    ctx.stroke();
}

function drawArrow(ctx, x0, y0, x1, y1, color, stroke) {
    const dx = x1 - x0;
    const dy = y1 - y0;
    const len = Math.hypot(dx, dy);
    if (len < 1) return;
    const head = Math.max(stroke * 3, 8);
    const ang = Math.atan2(dy, dx);
    // Shorten the shaft so the head doesn't render over its tip.
    const sx = x1 - Math.cos(ang) * head * 0.85;
    const sy = y1 - Math.sin(ang) * head * 0.85;

    ctx.lineWidth = stroke;
    ctx.strokeStyle = color;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(sx, sy);
    ctx.stroke();

    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x1 - Math.cos(ang - Math.PI / 7) * head,
               y1 - Math.sin(ang - Math.PI / 7) * head);
    ctx.lineTo(x1 - Math.cos(ang + Math.PI / 7) * head,
               y1 - Math.sin(ang + Math.PI / 7) * head);
    ctx.closePath();
    ctx.fill();
}

function drawStamp(ctx, x, y, n, color, size, style) {
    const radius = Math.max(8, size);
    const fontPx = Math.round(radius * 1.15);
    const font = `bold ${fontPx}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;
    const label = String(n);
    const ringWidth = Math.max(2, Math.round(radius * 0.18));

    if (style === "outline") {
        ctx.lineWidth = ringWidth;
        ctx.strokeStyle = color;
        ctx.beginPath();
        ctx.arc(x, y, radius, 0, Math.PI * 2);
        ctx.stroke();
        ctx.fillStyle = color;
        ctx.font = font;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(label, x, y);
        return;
    }

    if (style === "cutout") {
        // Render the stamp on an offscreen canvas with destination-out to
        // punch the digit out of the disc, then blit. The hole reveals
        // whatever's on the main canvas underneath (the image).
        const size = Math.ceil(radius * 2 + 4);
        const off = document.createElement("canvas");
        off.width = size; off.height = size;
        const octx = off.getContext("2d");
        octx.fillStyle = color;
        octx.beginPath();
        octx.arc(size / 2, size / 2, radius, 0, Math.PI * 2);
        octx.fill();
        octx.globalCompositeOperation = "destination-out";
        octx.font = font;
        octx.textAlign = "center";
        octx.textBaseline = "middle";
        octx.fillStyle = "#000";
        octx.fillText(label, size / 2, size / 2);
        ctx.drawImage(off, x - size / 2, y - size / 2);
        return;
    }

    // Solid (default): filled disc + white digit + white ring.
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.lineWidth = Math.max(2, Math.round(radius * 0.12));
    ctx.strokeStyle = "#ffffff";
    ctx.stroke();
    ctx.fillStyle = "#ffffff";
    ctx.font = font;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(label, x, y);
}

function pixelateRegion(canvas, ctx, r) {
    const x = Math.max(0, Math.floor(r.x));
    const y = Math.max(0, Math.floor(r.y));
    const w = Math.min(canvas.width - x, Math.floor(r.w));
    const h = Math.min(canvas.height - y, Math.floor(r.h));
    if (w < 1 || h < 1) return;
    // Block size scales with the smaller dimension; ~16 blocks across.
    const block = Math.max(4, Math.round(Math.min(w, h) / 16));
    const sw = Math.max(1, Math.floor(w / block));
    const sh = Math.max(1, Math.floor(h / block));
    const tmp = document.createElement("canvas");
    tmp.width = sw; tmp.height = sh;
    tmp.getContext("2d").drawImage(canvas, x, y, w, h, 0, 0, sw, sh);
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(tmp, 0, 0, sw, sh, x, y, w, h);
    ctx.restore();
}

function drawMarquee(ctx, r) {
    if (r.w < 1 || r.h < 1) return;
    ctx.save();
    ctx.fillStyle = "rgba(0, 0, 0, 0.35)";
    const c = ctx.canvas;
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.clearRect(r.x, r.y, r.w, r.h);
    ctx.setLineDash([6, 4]);
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = "#ffffff";
    ctx.strokeRect(r.x + 0.5, r.y + 0.5, r.w - 1, r.h - 1);
    ctx.restore();
}

export const Tools = {
    rect: {
        cursor: "crosshair",
        onDown(state, ev) {
            state.start = { x: ev.x, y: ev.y };
        },
        onMove(state, ev) {
            if (!state.start) return;
            clearOverlay(state);
            const r = normRect(state.start.x, state.start.y, ev.x, ev.y, ev.event.shiftKey);
            strokeRect(state.overlayCtx, r, state.color, state.stroke, state.fill);
        },
        onUp(state, ev) {
            if (!state.start) return null;
            clearOverlay(state);
            const r = normRect(state.start.x, state.start.y, ev.x, ev.y, ev.event.shiftKey);
            state.start = null;
            if (r.w < 1 || r.h < 1) return null;
            strokeRect(state.mainCtx, r, state.color, state.stroke, state.fill);
            return { commit: true, label: "Rect", meta: `${Math.round(r.w)}×${Math.round(r.h)}` };
        },
    },

    circle: {
        cursor: "crosshair",
        onDown(state, ev) {
            state.start = { x: ev.x, y: ev.y };
        },
        onMove(state, ev) {
            if (!state.start) return;
            clearOverlay(state);
            const r = normRect(state.start.x, state.start.y, ev.x, ev.y, ev.event.shiftKey);
            strokeEllipse(state.overlayCtx, r, state.color, state.stroke, state.fill);
        },
        onUp(state, ev) {
            if (!state.start) return null;
            clearOverlay(state);
            const r = normRect(state.start.x, state.start.y, ev.x, ev.y, ev.event.shiftKey);
            state.start = null;
            if (r.w < 1 || r.h < 1) return null;
            strokeEllipse(state.mainCtx, r, state.color, state.stroke, state.fill);
            return { commit: true, label: "Circle", meta: `${Math.round(r.w)}×${Math.round(r.h)}` };
        },
    },

    arrow: {
        cursor: "crosshair",
        onDown(state, ev) {
            state.start = { x: ev.x, y: ev.y };
        },
        onMove(state, ev) {
            if (!state.start) return;
            clearOverlay(state);
            drawArrow(state.overlayCtx, state.start.x, state.start.y, ev.x, ev.y, state.color, state.stroke);
        },
        onUp(state, ev) {
            if (!state.start) return null;
            clearOverlay(state);
            const dx = ev.x - state.start.x;
            const dy = ev.y - state.start.y;
            const len = Math.hypot(dx, dy);
            const { x: x0, y: y0 } = state.start;
            state.start = null;
            if (len < 2) return null;
            drawArrow(state.mainCtx, x0, y0, ev.x, ev.y, state.color, state.stroke);
            return { commit: true, label: "Arrow", meta: `${Math.round(len)} px` };
        },
    },

    crop: {
        cursor: "crosshair",
        onDown(state, ev) {
            state.start = { x: ev.x, y: ev.y };
        },
        onMove(state, ev) {
            if (!state.start) return;
            clearOverlay(state);
            const r = normRect(state.start.x, state.start.y, ev.x, ev.y, false);
            drawMarquee(state.overlayCtx, r);
            state.cropRect = r;
        },
        onUp(state, ev) {
            if (!state.start) return null;
            const r = normRect(state.start.x, state.start.y, ev.x, ev.y, false);
            state.start = null;
            if (r.w < 2 || r.h < 2) {
                clearOverlay(state);
                state.cropRect = null;
                return null;
            }
            // Leave the marquee on the overlay until Apply/Cancel.
            state.cropRect = r;
            return { commit: false, ephemeral: true };
        },
    },

    stamp: {
        cursor: "crosshair",
        onDown(state, ev) {
            const n = state.nextStampNumber++;
            drawStamp(state.mainCtx, ev.x, ev.y, n, state.color, state.stampSize, state.stampStyle);
            state.lastStampNumber = n;
        },
        onMove() {},
        onUp(state) {
            if (state.lastStampNumber == null) return null;
            const n = state.lastStampNumber;
            state.lastStampNumber = null;
            return { commit: true, label: "Stamp", meta: `#${n}` };
        },
    },

    pixelate: {
        cursor: "crosshair",
        onDown(state, ev) {
            state.start = { x: ev.x, y: ev.y };
        },
        onMove(state, ev) {
            if (!state.start) return;
            clearOverlay(state);
            const r = normRect(state.start.x, state.start.y, ev.x, ev.y, false);
            drawMarquee(state.overlayCtx, r);
        },
        onUp(state, ev) {
            if (!state.start) return null;
            clearOverlay(state);
            const r = normRect(state.start.x, state.start.y, ev.x, ev.y, false);
            state.start = null;
            if (r.w < 4 || r.h < 4) return null;
            pixelateRegion(state.mainCanvas, state.mainCtx, r);
            return { commit: true, label: "Pixelate", meta: `${Math.round(r.w)}×${Math.round(r.h)}` };
        },
    },

    dropper: {
        cursor: "copy",
        onDown() {},
        onMove() {},
        onUp(state, ev) {
            const x = Math.max(0, Math.min(state.mainCanvas.width - 1, Math.round(ev.x)));
            const y = Math.max(0, Math.min(state.mainCanvas.height - 1, Math.round(ev.y)));
            const data = state.mainCtx.getImageData(x, y, 1, 1).data;
            const hex = "#" + [data[0], data[1], data[2]]
                .map((n) => n.toString(16).padStart(2, "0")).join("");
            return { commit: false, ephemeral: true, picked: hex };
        },
    },
};

export function applyCrop(state) {
    if (!state.cropRect) return null;
    const { x, y, w, h } = state.cropRect;
    const sx = Math.max(0, Math.floor(x));
    const sy = Math.max(0, Math.floor(y));
    const sw = Math.min(state.mainCanvas.width - sx, Math.floor(w));
    const sh = Math.min(state.mainCanvas.height - sy, Math.floor(h));
    if (sw < 1 || sh < 1) return null;

    // Render the subregion onto a fresh canvas, then copy back. We can't
    // resize and drawImage in place because drawImage of a canvas onto
    // itself with a resized buffer would read from cleared pixels.
    const tmp = document.createElement("canvas");
    tmp.width = sw;
    tmp.height = sh;
    tmp.getContext("2d").drawImage(state.mainCanvas, sx, sy, sw, sh, 0, 0, sw, sh);

    state.mainCanvas.width = sw;
    state.mainCanvas.height = sh;
    state.mainCtx.drawImage(tmp, 0, 0);
    syncOverlay(state);
    state.cropRect = null;
    return { label: "Crop", meta: `${sw}×${sh}` };
}

export function applyResize(state, w, h) {
    w = Math.max(1, Math.floor(w));
    h = Math.max(1, Math.floor(h));
    if (w === state.mainCanvas.width && h === state.mainCanvas.height) return null;

    const tmp = document.createElement("canvas");
    tmp.width = w;
    tmp.height = h;
    const tctx = tmp.getContext("2d");
    tctx.imageSmoothingQuality = "high";
    tctx.drawImage(state.mainCanvas, 0, 0, w, h);

    state.mainCanvas.width = w;
    state.mainCanvas.height = h;
    state.mainCtx.drawImage(tmp, 0, 0);
    syncOverlay(state);
    return { label: "Resize", meta: `${w}×${h}` };
}

export function syncOverlay(state) {
    state.overlayCanvas.width = state.mainCanvas.width;
    state.overlayCanvas.height = state.mainCanvas.height;
}

export function cancelGesture(state) {
    state.start = null;
    state.cropRect = null;
    const c = state.overlayCanvas;
    state.overlayCtx.clearRect(0, 0, c.width, c.height);
}
