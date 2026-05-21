const DURATION_MS = 2200
const REDUCED_DURATION_MS = 700

export function runReveal({ ctx, redrawScene, getBall, onComplete, reducedMotion }) {
  const total = reducedMotion ? REDUCED_DURATION_MS : DURATION_MS
  const start = performance.now()
  let raf = 0

  function frame(now) {
    const t = Math.min(1, (now - start) / total)
    const ball = getBall()
    if (!ball) {
      raf = requestAnimationFrame(frame)
      return
    }

    const shakeAmp = reducedMotion ? 0 : easeShake(t) * Math.min(8, ball.r * 0.04)
    const shakeX = (Math.random() - 0.5) * 2 * shakeAmp
    const shakeY = (Math.random() - 0.5) * 2 * shakeAmp

    ctx.save()
    ctx.translate(shakeX, shakeY)
    redrawScene()
    drawGlow(ctx, ball, t)
    if (!reducedMotion) drawSwirls(ctx, ball, t, now)
    drawFlash(ctx, ball, t)
    ctx.restore()

    if (t < 1) {
      raf = requestAnimationFrame(frame)
    } else {
      redrawScene()
      onComplete()
    }
  }

  raf = requestAnimationFrame(frame)
  return () => cancelAnimationFrame(raf)
}

function drawGlow(ctx, ball, t) {
  const intensity = easeInOut(Math.min(1, t * 1.3))
  const radius = ball.r * (1.0 + intensity * 0.6)
  const grad = ctx.createRadialGradient(ball.cx, ball.cy, 0, ball.cx, ball.cy, radius)
  grad.addColorStop(0, `rgba(180, 120, 255, ${0.55 * intensity})`)
  grad.addColorStop(0.45, `rgba(110, 70, 220, ${0.35 * intensity})`)
  grad.addColorStop(1, "rgba(20, 10, 60, 0)")
  ctx.globalCompositeOperation = "screen"
  ctx.fillStyle = grad
  ctx.beginPath()
  ctx.arc(ball.cx, ball.cy, radius, 0, Math.PI * 2)
  ctx.fill()
  ctx.globalCompositeOperation = "source-over"
}

function drawSwirls(ctx, ball, t, now) {
  if (t < 0.15) return
  const swirlAlpha = easeInOut(Math.min(1, (t - 0.15) / 0.5)) * (1 - smoothstep(0.85, 1, t))
  if (swirlAlpha <= 0.01) return

  ctx.save()
  ctx.translate(ball.cx, ball.cy)
  ctx.globalCompositeOperation = "screen"

  const arcs = [
    { rFactor: 0.85, speed: 0.0028, span: 1.4, hue: 270, width: 4 },
    { rFactor: 0.65, speed: -0.0042, span: 1.1, hue: 290, width: 3 },
    { rFactor: 1.05, speed: 0.0018, span: 0.9, hue: 250, width: 2 },
  ]
  for (const a of arcs) {
    const start = now * a.speed
    ctx.strokeStyle = `hsla(${a.hue}, 95%, 75%, ${swirlAlpha * 0.75})`
    ctx.lineWidth = a.width
    ctx.beginPath()
    ctx.arc(0, 0, ball.r * a.rFactor, start, start + a.span)
    ctx.stroke()
  }

  ctx.restore()
}

function drawFlash(ctx, ball, t) {
  // Brief bright flare around 75-90%.
  const f = bell(t, 0.82, 0.08)
  if (f <= 0.01) return
  const grad = ctx.createRadialGradient(ball.cx, ball.cy, 0, ball.cx, ball.cy, ball.r * 1.4)
  grad.addColorStop(0, `rgba(255, 240, 255, ${f * 0.85})`)
  grad.addColorStop(0.4, `rgba(220, 200, 255, ${f * 0.45})`)
  grad.addColorStop(1, "rgba(0,0,0,0)")
  ctx.globalCompositeOperation = "screen"
  ctx.fillStyle = grad
  ctx.beginPath()
  ctx.arc(ball.cx, ball.cy, ball.r * 1.4, 0, Math.PI * 2)
  ctx.fill()
  ctx.globalCompositeOperation = "source-over"
}

function easeInOut(x) {
  return x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2
}

function easeShake(t) {
  // Builds from ~0.25 to ~0.85, then drops.
  return Math.max(0, Math.min(1, (t - 0.25) / 0.4)) * (1 - smoothstep(0.85, 1, t))
}

function smoothstep(a, b, x) {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)))
  return t * t * (3 - 2 * t)
}

function bell(x, center, width) {
  const d = (x - center) / width
  return Math.exp(-d * d)
}
