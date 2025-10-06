# Gallery Implementation Documentation

Klyn's `gallery.html` is a dynamic image viewer that loads and displays images
based on a JSON manifest file. It provides a thumbnail grid view and the
ability to view full-resolution images.

## How It Works

1. When `gallery.html` loads, it looks at the URL query parameter `from` to
   determine the directory containing `manifest.json`.
2. The browser fetches and parses `manifest.json`.
3. The gallery dynamically generates a grid of thumbnails based on the `items`
   array in the manifest.
4. Clicking on a thumbnail opens a modal to view the full-resolution image.

## Manifest File Structure

The gallery is driven by a `manifest.json` file that contains configuration and
image metadata.

### Schema

```json
{
  "items": [
    {
      "src": "path/to/full_res.jpg",
      "srct": "path/to/thumbnail.jpg",
      "title": "Image description"
    }
  ],
  "thumbnailHeight": 256
}
```

## Image Path Configuration

Image paths in the manifest can be:

- **Relative**: `"path/to/full_image.png"` (relative to gallery.html)
- **Absolute**: `"/path/to/full_image.png"` (from server root)
- **URL**: `"https://site.example.com/image.png"` (external hosting)

The browser will resolve and load the images.
