function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = reject
    img.src = src
  })
}

// Locate the crystal ball directly in the displayed photo by its colour
// signature: the magical interior is dominated by saturated blue / violet
// pixels that do not appear elsewhere in the scene. We search a generous
// lower-centre region and return the bounding box of matching pixels.
//
// The original idea was to use a separate chroma-keyed image, but the two
// AI-generated images turned out not to be pixel-aligned, so the ball's
// position in the mask did not match its position in the photo. Detecting
// in the photo itself avoids that problem entirely.
export async function detectBall(imageUrl) {
  const img = await loadImage(imageUrl)
  const c = document.createElement("canvas")
  c.width = img.naturalWidth
  c.height = img.naturalHeight
  const ctx = c.getContext("2d", { willReadFrequently: true })
  ctx.drawImage(img, 0, 0)
  const { data } = ctx.getImageData(0, 0, c.width, c.height)
  const w = c.width, h = c.height

  const xMin = Math.floor(w * 0.30), xMax = Math.floor(w * 0.70)
  const yMin = Math.floor(h * 0.40), yMax = Math.floor(h * 0.95)

  let minX = Infinity, maxX = -1, minY = Infinity, maxY = -1, count = 0
  for (let y = yMin; y < yMax; y++) {
    for (let x = xMin; x < xMax; x++) {
      const i = (y * w + x) * 4
      const r = data[i], g = data[i + 1], b = data[i + 2]
      const mx = Math.max(r, g, b), mn = Math.min(r, g, b)
      const sat = mx - mn
      const lum = 0.3 * r + 0.59 * g + 0.11 * b
      if (b > r + 20 && b > g + 5 && sat > 50 && lum > 50 && lum < 200) {
        if (x < minX) minX = x
        if (x > maxX) maxX = x
        if (y < minY) minY = y
        if (y > maxY) maxY = y
        count++
      }
    }
  }
  if (count === 0) throw new Error("crystal ball not found in " + imageUrl)

  return {
    cx: (minX + maxX) / 2,
    cy: (minY + maxY) / 2,
    r: ((maxX - minX) + (maxY - minY)) / 4,
    imgW: w,
    imgH: h,
    pixelCount: count,
  }
}
