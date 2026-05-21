import { detectBall } from "./chroma.js"
import { runReveal } from "./animation.js"
import { pickFortune } from "./fortunes.js"

const SCENE_SRC = "assets/fortune-teller.jpg"

const canvas = document.getElementById("scene")
const ctx = canvas.getContext("2d")
const textEl = document.getElementById("fortune-text")
const statusEl = document.getElementById("status")
const pulseEl = document.getElementById("pulse-anchor")
const hintEl = document.getElementById("hint-text")

const PULSE_DELAY_MS = 5000
const HINT_DELAY_MS = 10000

let sceneImg = null
let ballImg = null
let ballCanvas = null
let coverMap = null
let dpr = Math.max(1, window.devicePixelRatio || 1)
let animating = false
let cancelAnim = null
let pulseTimer = 0
let hintTimer = 0
let everClicked = false
const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error("failed to load " + src))
    img.src = src
  })
}

function resize() {
  const vw = window.innerWidth
  const vh = window.innerHeight
  dpr = Math.max(1, window.devicePixelRatio || 1)
  canvas.width = Math.round(vw * dpr)
  canvas.height = Math.round(vh * dpr)
  canvas.style.width = vw + "px"
  canvas.style.height = vh + "px"
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  draw()
  positionText()
  positionPulse()
  positionHint()
}

function computeCover(img, vw, vh) {
  const imgRatio = img.naturalWidth / img.naturalHeight
  const viewRatio = vw / vh
  let sx, sy, sw, sh
  if (imgRatio > viewRatio) {
    sh = img.naturalHeight
    sw = img.naturalHeight * viewRatio
    sx = (img.naturalWidth - sw) / 2
    sy = 0
  } else {
    sw = img.naturalWidth
    sh = img.naturalWidth / viewRatio
    sx = 0
    sy = (img.naturalHeight - sh) / 2
  }
  return { sx, sy, sw, sh, dx: 0, dy: 0, dw: vw, dh: vh }
}

function draw() {
  if (!sceneImg) return
  const vw = window.innerWidth
  const vh = window.innerHeight
  coverMap = computeCover(sceneImg, vw, vh)
  ctx.clearRect(0, 0, vw, vh)
  ctx.drawImage(
    sceneImg,
    coverMap.sx, coverMap.sy, coverMap.sw, coverMap.sh,
    coverMap.dx, coverMap.dy, coverMap.dw, coverMap.dh,
  )

  if (ballImg) {
    const scale = coverMap.dw / coverMap.sw
    ballCanvas = {
      cx: (ballImg.cx - coverMap.sx) * scale,
      cy: (ballImg.cy - coverMap.sy) * scale,
      r: ballImg.r * scale,
    }
  }
}

function positionText() {
  if (!ballCanvas || !textEl) return
  textEl.style.left = ballCanvas.cx + "px"
  textEl.style.top = ballCanvas.cy + "px"
  const diameter = ballCanvas.r * 2
  textEl.style.width = (diameter * 0.78) + "px"
  textEl.style.maxHeight = (diameter * 0.78) + "px"
  const fontSize = Math.max(14, Math.min(32, ballCanvas.r * 0.20))
  textEl.style.fontSize = fontSize + "px"
}

function positionPulse() {
  if (!ballCanvas || !pulseEl) return
  // Anchor at the ball centre; size to a generous halo around the ball.
  const size = ballCanvas.r * 2.6
  pulseEl.style.left = ballCanvas.cx + "px"
  pulseEl.style.top = ballCanvas.cy + "px"
  pulseEl.style.width = size + "px"
  pulseEl.style.height = size + "px"
}

function positionHint() {
  if (!ballCanvas || !hintEl) return
  hintEl.style.left = ballCanvas.cx + "px"
  hintEl.style.top = ballCanvas.cy + "px"
  // Match the fortune-text sizing so the hint sits inside the ball the same
  // way a fortune does.
  const fontSize = Math.max(14, Math.min(32, ballCanvas.r * 0.20))
  hintEl.style.fontSize = fontSize + "px"
}

function hitsBall(cx, cy) {
  if (!ballCanvas) return false
  const dx = cx - ballCanvas.cx
  const dy = cy - ballCanvas.cy
  return dx * dx + dy * dy <= ballCanvas.r * ballCanvas.r
}

function onPointer(evt) {
  if (animating) return
  if (!ballCanvas) return
  const rect = canvas.getBoundingClientRect()
  const x = evt.clientX - rect.left
  const y = evt.clientY - rect.top
  if (hitsBall(x, y)) {
    startReveal()
  }
}

function onMove(evt) {
  if (!ballCanvas || animating) {
    canvas.style.cursor = ""
    return
  }
  const rect = canvas.getBoundingClientRect()
  const x = evt.clientX - rect.left
  const y = evt.clientY - rect.top
  canvas.style.cursor = hitsBall(x, y) ? "pointer" : ""
}

function startReveal() {
  animating = true
  dismissHints()
  // Fade out any existing fortune via the CSS transition. We deliberately
  // keep textContent in place so the old text dissolves smoothly rather
  // than disappearing instantly; it'll be replaced when the new fortune
  // is revealed.
  textEl.classList.remove("visible")

  cancelAnim = runReveal({
    ctx,
    redrawScene: draw,
    getBall: () => ballCanvas,
    reducedMotion,
    onComplete: () => {
      animating = false
      const fortune = pickFortune()
      textEl.textContent = fortune
      positionText()
      // Force reflow before adding .visible so the transition runs.
      void textEl.offsetWidth
      textEl.classList.add("visible")
    },
  })
}

function dismissHints() {
  if (everClicked) return
  everClicked = true
  clearTimeout(pulseTimer)
  clearTimeout(hintTimer)
  pulseEl.classList.remove("visible")
  hintEl.classList.remove("visible")
}

function scheduleHints() {
  if (everClicked || reducedMotion) return
  pulseTimer = setTimeout(() => {
    if (!everClicked) pulseEl.classList.add("visible")
  }, PULSE_DELAY_MS)
  hintTimer = setTimeout(() => {
    if (!everClicked) hintEl.classList.add("visible")
  }, HINT_DELAY_MS)
}

async function init() {
  try {
    statusEl.textContent = "summoning…"
    sceneImg = await loadImage(SCENE_SRC)
    ballImg = await detectBall(SCENE_SRC)
    statusEl.textContent = ""
    statusEl.hidden = true
    resize()
    canvas.addEventListener("click", onPointer)
    canvas.addEventListener("mousemove", onMove)
    canvas.addEventListener("mouseleave", () => { canvas.style.cursor = "" })
    window.addEventListener("resize", () => {
      resize()
      if (textEl.classList.contains("visible")) positionText()
    })
    scheduleHints()
  } catch (err) {
    console.error(err)
    statusEl.textContent = "the spirits are unreachable"
  }
}

init()
