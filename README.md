klyn: a collection of purely client-side single page appetizers ("apps")

Often times, I just want a straight-forward single page that includes: markup,
styling, and functionality.

I could have some dynamic page that renders this stuff server-side, for which
I'd need some specialty server to run some app; or I could just have a static
page that can be served as a regular file. Any third-party dependencies can
often be picked up through a CDN like jsDelivr or cdnjs.

For example, `public/gallery.html` is an HTML gallery (`nanogallery`) that
takes a reference to a JSON file that points to any number of image files. If I
point a webserver to serve `public/` made available at `https://mysite.example.com/`,
I can go to `https://mysite.example.com/gallery.html?from=foo`, which (by
convention) will load `https://mysite.example.com/foo/manifest.json` containing:

```
{
    "items": [
        {"src": "01.jpeg", "title": "Christmas in Japan (2024)"},
        {"src": "02.jpeg", "title": "Christmas in Japan (2024)"},
        {"src": "03.jpeg", "title": "Christmas in Japan (2024)"}
    ]
}
```

and just magically display the images as a simple image gallery.

The `public/` directory contains all the single pages, while `docs/` will
contain light documentation for each of them.
