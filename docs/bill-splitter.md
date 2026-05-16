# Bill Splitter

`public/bill-splitter/` is a client-side single-page app that takes a photo of
a paper receipt, runs OCR locally in your browser, parses out the line items,
and lets you assign items to people so it can compute who owes what. No data
ever leaves your device.

## How it works

1. **Capture**: tap "Choose receipt photo…". On iPhone Safari this opens the
   camera (via `<input type="file" capture="environment">`). On desktop it
   opens the file picker.
2. **Decode**: the image is decoded with
   `createImageBitmap(file, { imageOrientation: 'from-image' })`, so iPhone
   portrait photos arrive upright instead of rotated 90°.
3. **OCR**: [Tesseract.js](https://github.com/naptha/tesseract.js) v5 runs the
   English LSTM model in a Web Worker. The first run downloads ~10 MB of model
   data from jsDelivr; subsequent runs are served from a Service Worker cache.
4. **Parse**: a geometry-based parser (`parser.js`) clusters price-shaped
   tokens by x-coordinate to find the price column, then associates each price
   with the words on the same y-range to form a line item. Totals like
   `SUBTOTAL`, `TAX`, `TIP`, `TOTAL` are detected by keyword anchors.
5. **Split**: per-item assignment to participants, with tax/tip/service fees
   distributed proportionally to each participant's subtotal. Items can be
   assigned to multiple people (split equally among them) or to nobody (which
   surfaces as a warning).

## Editing OCR results

Each item shows an OCR confidence pill (green ≥ 80 %, yellow ≥ 60 %, red
otherwise). The item name and price are both editable in place — click the
text to fix anything Tesseract got wrong. Fee labels and amounts are editable
too.

If the parsed split total doesn't match the receipt's printed total, a
warning appears below the totals.

## Privacy

Everything runs in the browser: the receipt image, the OCR, the parser, the
splitter. The only outbound network requests are to jsDelivr for the
Tesseract.js library and language model. After the first load these are
cached by the Service Worker and the page works offline.

## Limitations (current POC)

- **English only**: language model is `eng`. Add additional traineddata to
  support other languages.
- **No HEIC decode**: iPhones photographed in HEIC format may fail to decode
  in non-Safari browsers. Workaround: set the iPhone camera to "Most
  Compatible" (Settings → Camera → Formats) so it saves JPEG.
- **No perspective correction**: photos taken at an angle or under bad
  lighting will hurt accuracy. A future iteration could add OpenCV.js for
  perspective warp + adaptive thresholding.
- **Persistence is in-memory only**: refreshing the page clears the receipt
  and assignments.
