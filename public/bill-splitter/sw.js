// Bill Splitter Service Worker.
// Sole purpose: cache the ~10MB Tesseract.js assets (script, core WASM,
// language model) so the second load is instant. Everything else passes
// through untouched.

const CACHE_NAME = 'bill-splitter-tesseract-v1';

const CACHE_PATTERNS = [
    /cdn\.jsdelivr\.net\/npm\/tesseract\.js/,
    /tessdata.*\/eng\.traineddata/,
    /tesseract-core.*\.wasm/,
    /\.traineddata(\.gz)?$/,
];

function shouldCache(url) {
    return CACHE_PATTERNS.some((re) => re.test(url));
}

self.addEventListener('install', (event) => {
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((names) =>
            Promise.all(names.filter((n) => n !== CACHE_NAME && n.startsWith('bill-splitter-')).map((n) => caches.delete(n))),
        ).then(() => self.clients.claim()),
    );
});

self.addEventListener('fetch', (event) => {
    const req = event.request;
    if (req.method !== 'GET') return;
    if (!shouldCache(req.url)) return;

    event.respondWith(
        caches.open(CACHE_NAME).then(async (cache) => {
            const hit = await cache.match(req);
            if (hit) return hit;
            const resp = await fetch(req);
            if (resp && resp.ok) {
                cache.put(req, resp.clone()).catch(() => {});
            }
            return resp;
        }),
    );
});
