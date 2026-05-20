// Each style draws a single eye centered at (cx, cy) sized to roughly fit
// within the given outer radius. Signature is shared so app.js can swap them.
// `opts` is an object; styles use what they need:
//   inwardX, inwardY — unit-ish vector in local (post-rotation) coords pointing
//                       toward the face center
//   side             — -1 for left eye, +1 for right eye (relative to face)
//   eyeIndex         — 0 or 1 within the current face
//   faceSeed         — random 0..1, identical for both eyes within a face

function drawSclera(ctx, cx, cy, radius, fill = "#ffffff") {
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.lineWidth = Math.max(1, radius * 0.08);
    ctx.strokeStyle = "#111111";
    ctx.stroke();
}

function drawPupilWithHighlight(ctx, px, py, pupilRadius, highlightAlpha = 0.85) {
    ctx.beginPath();
    ctx.arc(px, py, pupilRadius, 0, Math.PI * 2);
    ctx.fillStyle = "#111111";
    ctx.fill();

    const hr = pupilRadius * 0.3;
    ctx.beginPath();
    ctx.arc(px - pupilRadius * 0.35, py - pupilRadius * 0.35, hr, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(255, 255, 255, ${highlightAlpha})`;
    ctx.fill();
}

function randomWobblePosition(cx, cy, radius, pupilRadius) {
    const maxOffset = radius - pupilRadius - radius * 0.08;
    const angle = Math.random() * Math.PI * 2;
    const dist = Math.random() * Math.max(0, maxOffset);
    return { px: cx + Math.cos(angle) * dist, py: cy + Math.sin(angle) * dist };
}

function drawClosedLid(ctx, cx, cy, radius) {
    ctx.strokeStyle = "#111111";
    ctx.lineWidth = Math.max(2, radius * 0.15);
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(cx - radius, cy);
    ctx.quadraticCurveTo(cx, cy + radius * 0.4, cx + radius, cy);
    ctx.stroke();
}

function drawClassic(ctx, cx, cy, radius) {
    ctx.save();
    drawSclera(ctx, cx, cy, radius);
    const pupilRadius = radius * 0.45;
    const { px, py } = randomWobblePosition(cx, cy, radius, pupilRadius);
    drawPupilWithHighlight(ctx, px, py, pupilRadius);
    ctx.restore();
}

function draw3DShaded(ctx, cx, cy, radius) {
    ctx.save();

    const grad = ctx.createRadialGradient(
        cx - radius * 0.3, cy - radius * 0.3, radius * 0.1,
        cx, cy, radius
    );
    grad.addColorStop(0, "#ffffff");
    grad.addColorStop(0.65, "#f5f5f4");
    grad.addColorStop(1, "#a8a29e");
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.fillStyle = grad;
    ctx.fill();
    ctx.lineWidth = Math.max(1, radius * 0.08);
    ctx.strokeStyle = "#111111";
    ctx.stroke();

    const pupilRadius = radius * 0.45;
    const { px, py } = randomWobblePosition(cx, cy, radius, pupilRadius);

    const pupilGrad = ctx.createRadialGradient(
        px - pupilRadius * 0.3, py - pupilRadius * 0.3, pupilRadius * 0.05,
        px, py, pupilRadius
    );
    pupilGrad.addColorStop(0, "#3f3f3f");
    pupilGrad.addColorStop(0.6, "#0a0a0a");
    pupilGrad.addColorStop(1, "#000000");
    ctx.beginPath();
    ctx.arc(px, py, pupilRadius, 0, Math.PI * 2);
    ctx.fillStyle = pupilGrad;
    ctx.fill();

    ctx.beginPath();
    ctx.arc(px - pupilRadius * 0.35, py - pupilRadius * 0.35, pupilRadius * 0.28, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(255, 255, 255, 0.95)";
    ctx.fill();

    ctx.beginPath();
    ctx.arc(px + pupilRadius * 0.25, py + pupilRadius * 0.3, pupilRadius * 0.1, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(255, 255, 255, 0.5)";
    ctx.fill();

    ctx.restore();
}

function drawAnimeSparkle(ctx, cx, cy, radius) {
    ctx.save();
    drawSclera(ctx, cx, cy, radius);

    const irisRadius = radius * 0.7;
    const { px, py } = randomWobblePosition(cx, cy, radius, irisRadius);

    const irisGrad = ctx.createRadialGradient(px, py, 0, px, py, irisRadius);
    irisGrad.addColorStop(0, "#f0abfc");
    irisGrad.addColorStop(0.6, "#a855f7");
    irisGrad.addColorStop(1, "#581c87");
    ctx.beginPath();
    ctx.arc(px, py, irisRadius, 0, Math.PI * 2);
    ctx.fillStyle = irisGrad;
    ctx.fill();

    ctx.beginPath();
    ctx.arc(px, py, irisRadius * 0.4, 0, Math.PI * 2);
    ctx.fillStyle = "#1e1b4b";
    ctx.fill();

    ctx.beginPath();
    ctx.arc(px - irisRadius * 0.35, py - irisRadius * 0.4, irisRadius * 0.25, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(255, 255, 255, 0.95)";
    ctx.fill();

    ctx.beginPath();
    ctx.arc(px + irisRadius * 0.3, py + irisRadius * 0.35, irisRadius * 0.13, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(255, 255, 255, 0.75)";
    ctx.fill();

    drawSparkle(ctx, cx + radius * 0.5, cy - radius * 0.55, radius * 0.22);

    ctx.restore();
}

function drawSparkle(ctx, cx, cy, size) {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    const longArm = size;
    const shortArm = size * 0.18;
    ctx.moveTo(0, -longArm);
    ctx.lineTo(shortArm, -shortArm);
    ctx.lineTo(longArm, 0);
    ctx.lineTo(shortArm, shortArm);
    ctx.lineTo(0, longArm);
    ctx.lineTo(-shortArm, shortArm);
    ctx.lineTo(-longArm, 0);
    ctx.lineTo(-shortArm, -shortArm);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
}

function drawBloodshot(ctx, cx, cy, radius) {
    ctx.save();
    drawSclera(ctx, cx, cy, radius, "#fef2f2");

    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, radius * 0.95, 0, Math.PI * 2);
    ctx.clip();

    ctx.strokeStyle = "#dc2626";
    ctx.lineWidth = Math.max(1, radius * 0.04);
    ctx.lineCap = "round";
    const veinCount = 4 + Math.floor(Math.random() * 3);
    for (let i = 0; i < veinCount; i++) {
        const startAngle = Math.random() * Math.PI * 2;
        let x = cx + Math.cos(startAngle) * radius * 0.95;
        let y = cy + Math.sin(startAngle) * radius * 0.95;
        ctx.beginPath();
        ctx.moveTo(x, y);
        let angle = startAngle + Math.PI + (Math.random() - 0.5) * 0.6;
        const segments = 3 + Math.floor(Math.random() * 3);
        for (let j = 0; j < segments; j++) {
            x += Math.cos(angle) * radius * 0.18;
            y += Math.sin(angle) * radius * 0.18;
            ctx.lineTo(x, y);
            angle += (Math.random() - 0.5) * 0.9;
        }
        ctx.stroke();
    }
    ctx.restore();

    const pupilRadius = radius * 0.42;
    const { px, py } = randomWobblePosition(cx, cy, radius, pupilRadius);
    drawPupilWithHighlight(ctx, px, py, pupilRadius);

    ctx.restore();
}

function drawCartoon(ctx, cx, cy, radius) {
    ctx.save();
    drawSclera(ctx, cx, cy, radius);

    const irisRadius = radius * 0.6;
    const { px, py } = randomWobblePosition(cx, cy, radius, irisRadius);

    ctx.beginPath();
    ctx.arc(px, py, irisRadius, 0, Math.PI * 2);
    ctx.fillStyle = "#3b82f6";
    ctx.fill();
    ctx.lineWidth = Math.max(1, radius * 0.04);
    ctx.strokeStyle = "#1e3a8a";
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(px, py, irisRadius * 0.5, 0, Math.PI * 2);
    ctx.fillStyle = "#111111";
    ctx.fill();

    ctx.beginPath();
    ctx.arc(px - irisRadius * 0.35, py - irisRadius * 0.4, irisRadius * 0.22, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(255, 255, 255, 0.95)";
    ctx.fill();

    ctx.restore();
}

function drawCat(ctx, cx, cy, radius) {
    ctx.save();
    drawSclera(ctx, cx, cy, radius, "#fef9c3");

    const irisRadius = radius * 0.55;
    const { px, py } = randomWobblePosition(cx, cy, radius, irisRadius);

    ctx.beginPath();
    ctx.arc(px, py, irisRadius, 0, Math.PI * 2);
    ctx.fillStyle = "#65a30d";
    ctx.fill();

    ctx.beginPath();
    ctx.ellipse(px, py, irisRadius * 0.2, irisRadius * 0.95, 0, 0, Math.PI * 2);
    ctx.fillStyle = "#111111";
    ctx.fill();

    ctx.beginPath();
    ctx.arc(px - irisRadius * 0.35, py - irisRadius * 0.45, irisRadius * 0.18, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(255, 255, 255, 0.7)";
    ctx.fill();

    ctx.restore();
}

function drawCrossEyed(ctx, cx, cy, radius, opts = {}) {
    ctx.save();
    drawSclera(ctx, cx, cy, radius);

    const pupilRadius = radius * 0.45;
    const maxOffset = radius - pupilRadius - radius * 0.08;
    const inX = opts.inwardX ?? 1;
    const inY = opts.inwardY ?? 0;
    const baseAngle = Math.atan2(inY, inX);
    const angle = baseAngle + (Math.random() - 0.5) * (Math.PI / 12);
    const dist = maxOffset * (0.85 + Math.random() * 0.15);
    const px = cx + Math.cos(angle) * dist;
    const py = cy + Math.sin(angle) * dist;

    drawPupilWithHighlight(ctx, px, py, pupilRadius);
    ctx.restore();
}

function drawSleepy(ctx, cx, cy, radius) {
    ctx.save();
    drawSclera(ctx, cx, cy, radius);

    const pupilRadius = radius * 0.45;
    const { px, py } = randomWobblePosition(cx, cy, radius, pupilRadius);
    drawPupilWithHighlight(ctx, px, py, pupilRadius);

    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.clip();

    ctx.beginPath();
    ctx.moveTo(cx - radius * 1.5, cy - radius * 1.5);
    ctx.lineTo(cx + radius * 1.5, cy - radius * 1.5);
    ctx.lineTo(cx + radius * 1.5, cy - radius * 0.2);
    ctx.quadraticCurveTo(cx, cy + radius * 0.25, cx - radius * 1.5, cy - radius * 0.2);
    ctx.closePath();
    ctx.fillStyle = "#111111";
    ctx.fill();
    ctx.restore();

    ctx.restore();
}

function drawSurprised(ctx, cx, cy, radius) {
    ctx.save();
    drawSclera(ctx, cx, cy, radius);

    const pupilRadius = radius * 0.18;
    const maxOffset = radius - pupilRadius - radius * 0.12;
    const angle = Math.random() * Math.PI * 2;
    const dist = maxOffset * (0.55 + Math.random() * 0.4);
    const px = cx + Math.cos(angle) * dist;
    const py = cy + Math.sin(angle) * dist;

    ctx.beginPath();
    ctx.arc(px, py, pupilRadius, 0, Math.PI * 2);
    ctx.fillStyle = "#111111";
    ctx.fill();

    ctx.beginPath();
    ctx.arc(px - pupilRadius * 0.3, py - pupilRadius * 0.3, pupilRadius * 0.35, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(255, 255, 255, 0.9)";
    ctx.fill();

    ctx.restore();
}

function drawHeart(ctx, cx, cy, radius) {
    ctx.save();

    const w = radius;
    const lobeTopY = cy - w * 0.8;
    const dipY = cy - w * 0.2;
    const bottomY = cy + w * 1.0;

    ctx.beginPath();
    ctx.moveTo(cx, dipY);
    ctx.bezierCurveTo(cx, lobeTopY, cx - w, lobeTopY, cx - w, dipY);
    ctx.bezierCurveTo(cx - w, cy + w * 0.35, cx - w * 0.5, cy + w * 0.7, cx, bottomY);
    ctx.bezierCurveTo(cx + w * 0.5, cy + w * 0.7, cx + w, cy + w * 0.35, cx + w, dipY);
    ctx.bezierCurveTo(cx + w, lobeTopY, cx, lobeTopY, cx, dipY);
    ctx.closePath();

    ctx.fillStyle = "#e11d48";
    ctx.fill();
    ctx.lineWidth = Math.max(1, radius * 0.08);
    ctx.strokeStyle = "#7f1d1d";
    ctx.stroke();

    const hr = radius * 0.16;
    ctx.beginPath();
    ctx.arc(cx - w * 0.4, cy - w * 0.35, hr, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(255, 255, 255, 0.75)";
    ctx.fill();

    ctx.restore();
}

function drawSauron(ctx, cx, cy, radius) {
    ctx.save();

    const w = radius * 1.05;
    const h = radius * 0.45;

    ctx.beginPath();
    ctx.moveTo(cx - w, cy);
    ctx.bezierCurveTo(cx - w * 0.5, cy - h * 1.6, cx + w * 0.5, cy - h * 1.6, cx + w, cy);
    ctx.bezierCurveTo(cx + w * 0.5, cy + h * 1.6, cx - w * 0.5, cy + h * 1.6, cx - w, cy);
    ctx.closePath();

    const grad = ctx.createRadialGradient(cx, cy, radius * 0.05, cx, cy, w);
    grad.addColorStop(0, "#fef3c7");
    grad.addColorStop(0.35, "#fb923c");
    grad.addColorStop(0.75, "#dc2626");
    grad.addColorStop(1, "#7c2d12");
    ctx.fillStyle = grad;
    ctx.fill();
    ctx.lineWidth = Math.max(1, radius * 0.08);
    ctx.strokeStyle = "#451a03";
    ctx.stroke();

    ctx.beginPath();
    ctx.ellipse(cx, cy, radius * 0.08, radius * 0.55, 0, 0, Math.PI * 2);
    ctx.fillStyle = "#000000";
    ctx.fill();

    ctx.restore();
}

function drawMoney(ctx, cx, cy, radius) {
    ctx.save();
    drawSclera(ctx, cx, cy, radius);

    ctx.fillStyle = "#16a34a";
    ctx.font = `bold ${Math.round(radius * 1.7)}px -apple-system, "Segoe UI", Arial, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("$", cx, cy + radius * 0.05);

    ctx.restore();
}

function drawSleeping(ctx, cx, cy, radius) {
    ctx.save();

    drawClosedLid(ctx, cx, cy, radius);

    ctx.fillStyle = "#111111";
    ctx.font = `bold ${Math.round(radius * 0.7)}px -apple-system, "Segoe UI", Arial, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("z", cx + radius * 0.7, cy - radius * 0.65);

    ctx.restore();
}

function drawSpiral(ctx, cx, cy, radius) {
    ctx.save();
    drawSclera(ctx, cx, cy, radius);

    const turns = 3;
    const steps = 160;
    const maxR = radius * 0.85;
    ctx.beginPath();
    for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        const angle = t * turns * Math.PI * 2;
        const r = t * maxR;
        const x = cx + Math.cos(angle) * r;
        const y = cy + Math.sin(angle) * r;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
    }
    ctx.lineWidth = Math.max(2, radius * 0.16);
    ctx.strokeStyle = "#111111";
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.stroke();

    ctx.restore();
}

function drawStar(ctx, cx, cy, radius) {
    ctx.save();

    const outerR = radius * 0.95;
    const innerR = outerR * 0.4;
    const points = 5;

    ctx.beginPath();
    for (let i = 0; i < points * 2; i++) {
        const r = (i % 2 === 0) ? outerR : innerR;
        const angle = (i * Math.PI) / points - Math.PI / 2;
        const x = cx + Math.cos(angle) * r;
        const y = cy + Math.sin(angle) * r;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
    }
    ctx.closePath();

    ctx.fillStyle = "#facc15";
    ctx.fill();
    ctx.lineWidth = Math.max(1, radius * 0.06);
    ctx.strokeStyle = "#a16207";
    ctx.lineJoin = "round";
    ctx.stroke();

    ctx.restore();
}

function drawSunglasses(ctx, cx, cy, radius) {
    ctx.save();

    const w = radius * 1.15;
    const h = radius * 0.7;

    ctx.beginPath();
    ctx.ellipse(cx, cy, w, h, 0, 0, Math.PI * 2);
    ctx.fillStyle = "#0a0a0a";
    ctx.fill();
    ctx.lineWidth = Math.max(1, radius * 0.08);
    ctx.strokeStyle = "#1f1f1f";
    ctx.stroke();

    ctx.save();
    ctx.beginPath();
    ctx.ellipse(cx, cy, w * 0.95, h * 0.95, 0, 0, Math.PI * 2);
    ctx.clip();
    ctx.fillStyle = "rgba(255, 255, 255, 0.45)";
    ctx.beginPath();
    ctx.moveTo(cx - w * 0.7, cy - h * 1.5);
    ctx.lineTo(cx - w * 0.2, cy - h * 1.5);
    ctx.lineTo(cx + w * 0.7, cy + h * 1.5);
    ctx.lineTo(cx + w * 0.2, cy + h * 1.5);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    ctx.restore();
}

function drawWink(ctx, cx, cy, radius, opts = {}) {
    const winkEye = (opts.faceSeed ?? 0) < 0.5 ? 0 : 1;
    const isClosed = (opts.eyeIndex ?? 0) === winkEye;

    if (isClosed) {
        ctx.save();
        drawClosedLid(ctx, cx, cy, radius);
        ctx.restore();
    } else {
        drawClassic(ctx, cx, cy, radius);
    }
}

function drawXEyes(ctx, cx, cy, radius) {
    ctx.save();
    const reach = radius * 0.95;
    ctx.lineCap = "round";
    ctx.lineWidth = Math.max(2, radius * 0.28);
    ctx.strokeStyle = "#111111";
    ctx.beginPath();
    ctx.moveTo(cx - reach, cy - reach);
    ctx.lineTo(cx + reach, cy + reach);
    ctx.moveTo(cx + reach, cy - reach);
    ctx.lineTo(cx - reach, cy + reach);
    ctx.stroke();
    ctx.restore();
}

export const STYLES = {
    classic:      { label: "Classic",       group: "wobbly",  draw: drawClassic      },
    "3d-shaded":  { label: "3D shaded",     group: "wobbly",  draw: draw3DShaded     },
    anime:        { label: "Anime sparkle", group: "wobbly",  draw: drawAnimeSparkle },
    bloodshot:    { label: "Bloodshot",     group: "wobbly",  draw: drawBloodshot    },
    cartoon:      { label: "Cartoon",       group: "wobbly",  draw: drawCartoon      },
    cat:          { label: "Cat",           group: "wobbly",  draw: drawCat          },
    "cross-eyed": { label: "Cross-eyed",    group: "wobbly",  draw: drawCrossEyed    },
    sleepy:       { label: "Sleepy",        group: "wobbly",  draw: drawSleepy       },
    surprised:    { label: "Surprised",     group: "wobbly",  draw: drawSurprised    },
    sauron:       { label: "Eye of Sauron", group: "sticker", draw: drawSauron       },
    heart:        { label: "Heart",         group: "sticker", draw: drawHeart        },
    money:        { label: "Money",         group: "sticker", draw: drawMoney        },
    sleeping:     { label: "Sleeping",      group: "sticker", draw: drawSleeping,     fan: false },
    spiral:       { label: "Spiral",        group: "sticker", draw: drawSpiral       },
    star:         { label: "Star",          group: "sticker", draw: drawStar         },
    sunglasses:   { label: "Sunglasses",    group: "sticker", draw: drawSunglasses,   fan: false },
    wink:         { label: "Wink",          group: "sticker", draw: drawWink         },
    x:            { label: "X eyes",        group: "sticker", draw: drawXEyes        },
};

export const GROUP_LABELS = {
    wobbly:  "Wobbly",
    sticker: "Stickers",
};

export const DEFAULT_STYLE = "classic";
