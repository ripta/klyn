# Fortune

`public/fortune/` is a one-off styled page: a mystic fortune teller fills the
viewport, and clicking her crystal ball plays a short animation before a
random magic-8-ball-style saying materialises inside the ball. Everything
runs locally; no network calls after the page assets load.

## How it works

1. **One source image** ships with the app, `assets/fortune-teller.jpg`. The
   original plan was to use a paired chroma-keyed image to locate the ball,
   but the two AI-generated images turned out not to be pixel-aligned, so
   the chroma mask's ball didn't match the photo's ball. We now detect the
   ball directly in the displayed photo.
2. **Ball detection** (`chroma.js`): the photo is drawn to an off-screen
   canvas and every pixel inside a generous lower-centre region is checked
   for the crystal ball's signature — saturated blue / violet swirls that
   don't appear elsewhere in the scene. The bounding box of matching pixels
   gives the ball's centre and radius in image coordinates.
3. **Scene rendering** (`app.js`): a viewport-sized `<canvas>` draws the
   photo with `object-fit: cover`-style math, and the detected ball circle
   is projected from image coords into canvas coords (recomputed on resize
   so the click target stays accurate at any aspect ratio).
4. **Reveal** (`animation.js`): a click inside the ball triggers a ~2.2 s
   `requestAnimationFrame` loop — a violet radial glow ramps up, three
   rotating arcs swirl around the ball, the canvas shakes gently, and a
   brighter flare peaks before the fortune fades in. `prefers-reduced-motion`
   collapses the sequence to a quiet fade.
5. **Fortunes** (`fortunes.js`): a flat array of sayings drawn from the
   provided Eight-Ball-LLM list. Each click picks one uniformly at random,
   avoiding immediate repeats.
6. **Typography**: the fortune itself is rendered in
   [Berkshire Swash](https://fonts.google.com/specimen/Berkshire+Swash),
   loaded from Google Fonts, with [Cormorant Garamond](https://fonts.google.com/specimen/Cormorant+Garamond)
   italic as a fallback and a soft white-into-violet text glow.

## Interaction

Clicking the ball during a running animation does nothing. Clicking outside
the ball does nothing. Clicking the ball after a fortune is showing
dismisses the current text and re-runs the reveal with a new saying.

## Privacy

The page makes no outbound requests beyond fetching the two bundled JPEGs.
