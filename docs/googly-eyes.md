# Googly Eyes

`public/googly-eyes/` is a client-side single-page app that takes a photo,
finds each face, and draws a pair of googly eyes scaled to the face. The
result can be downloaded as PNG. Detection runs locally in the browser — the
image is never uploaded.

## How it works

1. **Input**: drop an image onto the page, pick one with "Choose image", or
   open the page with a `?from=<url>` query parameter to auto-load a remote
   image.
2. **Detect**: [face-api.js](https://github.com/vladmandic/face-api) loads
   the TinyFaceDetector + 68-point landmark models from jsDelivr (cached on
   subsequent visits) and runs them on the image.
3. **Draw**: for each detected face, the centroid of the left- and right-eye
   landmark groups is used to position a googly eye sized to `0.13 ×
   max(faceWidth, faceHeight)`.
4. **Save**: click "Download" to export the canvas as `googly.png`.

## Loading from a URL

`googly-eyes/?from=<image-url>` fetches the image and runs the full
detect-and-draw pipeline on page load.

- Only `http:` and `https:` URLs are accepted; other schemes (e.g.
  `javascript:`, `data:`) and unparseable strings are rejected before any
  network access.
- The image element is loaded with `crossOrigin="anonymous"`, so the remote
  host must send permissive CORS headers (`Access-Control-Allow-Origin`).
  Hosts that don't (most non-CDN sites) will fail to load. Wikimedia Commons
  works; many image hotlinks do not.

Example:

```
googly-eyes/?from=https://upload.wikimedia.org/wikipedia/commons/thumb/2/28/Albert_Einstein_Head_cleaned.jpg/250px-Albert_Einstein_Head_cleaned.jpg
```

## Swapping the detector

`detector.js` exposes a tiny adapter interface so the underlying detection
library can be swapped without touching `app.js`:

```js
loadDetector() → Promise<{ detect(image) → Promise<Face[]> }>
Face = {
    eyes:     [{x, y}, {x, y}],   // pixel coords in the input image
    faceSize: number,             // pixel size used to scale googly eyes
    bbox:     {x, y, w, h},
}
```

A parallel MediaPipe-based implementation lives in `detector-mediapipe.js`;
switch by changing the import in `app.js`.

## Privacy

The image stays in the browser. The only outbound network requests are to
jsDelivr for the face-api.js library and model weights (and to whatever host
you point `?from=` at). After the first load these are cached and the page
works offline.
