// Draws a single googly eye centered at (cx, cy) with the given outer radius.
// Pupil position is randomized within the eyeball for that classic wobble.
export function drawGooglyEye(ctx, cx, cy, radius) {
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
