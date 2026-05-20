// Each style draws a single eye centered at (cx, cy) sized to roughly fit
// within the given outer radius. Signature is shared so app.js can swap them.

function drawClassic(ctx, cx, cy, radius) {
    ctx.save();

    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.fillStyle = "#ffffff";
    ctx.fill();
    ctx.lineWidth = Math.max(1, radius * 0.08);
    ctx.strokeStyle = "#111111";
    ctx.stroke();

    const pupilRadius = radius * 0.45;
    const maxOffset = radius - pupilRadius - radius * 0.08;
    const angle = Math.random() * Math.PI * 2;
    const dist = Math.random() * Math.max(0, maxOffset);
    const px = cx + Math.cos(angle) * dist;
    const py = cy + Math.sin(angle) * dist;

    ctx.beginPath();
    ctx.arc(px, py, pupilRadius, 0, Math.PI * 2);
    ctx.fillStyle = "#111111";
    ctx.fill();

    const hr = pupilRadius * 0.3;
    ctx.beginPath();
    ctx.arc(px - pupilRadius * 0.35, py - pupilRadius * 0.35, hr, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(255, 255, 255, 0.85)";
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

export const STYLES = {
    classic: { label: "Classic", draw: drawClassic },
    heart:   { label: "Heart",   draw: drawHeart   },
};

export const DEFAULT_STYLE = "classic";
