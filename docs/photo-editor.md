# Photo Editor

`public/photo-editor/` is a client-side single-page photo editor. Open an
image, crop / resize / annotate with shapes and arrows, sample colors with
an eyedropper, and download the result as PNG. The image never leaves the
browser; there are no CDN dependencies.

## How it works

1. **Open**: drop an image onto the page or use "Choose image".
2. **Pick a tool** from the rail on the right (shortcut in parens):
   - **Crop** (`C`) — drag a marquee, then "Apply crop" replaces the
     canvas with the selected region.
   - **Rect** (`R`) / **Circle** (`O`) — drag to draw. Shift-drag
     constrains to a square / circle. "Fill shapes" fills as well as
     strokes.
   - **Arrow** (`A`) — drag from tail to head; the arrowhead scales with
     stroke width.
   - **Dropper** (`I`) — click anywhere on the image to sample that
     pixel's color into the swatch. The tool stays active so you can
     sample again; switch tools yourself when you're done.
   - **Stamp** (`N`) — click to drop a numbered badge. Counter is
     derived from the history, so undoing and stamping again gives you
     the next number that was just removed (not a fresh one). Stamp
     size slider and style picker appear in the rail when the tool is
     active. Three styles: **solid** (filled disc, white digit, looks
     the same on any background), **cutout** (digit is a transparent
     hole, so the underlying image shows through — visibly different
     from solid only on non-white regions), **outline** (ring + colored
     digit).
   - **Pixelate** (`P`) — drag a region to redact it with chunky pixels.
     Block size scales with the region; about 16 blocks across the
     shorter side.
3. **Image Info / Resize**: the Image Info section shows current
   dimensions, simplified aspect ratio, source filename, and source
   format. Click "Resize" to reveal the W / H inputs; with "Lock aspect"
   on, the other field follows. Apply commits and snaps back to the
   read-only display. Note: download is always PNG regardless of the
   source format.
4. **Download**: saves the current canvas as `photo-edit.png`.

## History

Every committing action (open, draw, crop, resize, stamp, pixelate)
pushes a snapshot into the history rail. Click any entry to restore the
canvas to that state — the entries newer than it stay visible as faded
"future" rows. Taking a new action while on a past entry drops the
future entries and branches from there.

Keyboard: `Cmd/Ctrl+Z` undoes, `Cmd/Ctrl+Shift+Z` redoes.

The stack is capped at **20 snapshots**; when full, the oldest entry is
dropped. Snapshots are held as `ImageBitmap` objects: efficient on the
GPU, but still bounded — a 12 MP photo at the cap is on the order of a
gigabyte of GPU memory. For very large images, restoring an older entry
or downloading and reloading clears the stack.

## Privacy

Nothing is uploaded. The page makes no outbound network requests after
the initial asset load.
