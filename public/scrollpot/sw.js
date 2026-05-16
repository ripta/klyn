// scrollpot service worker.
//
// Caches the app shell and the bundled sample recipes so the app and its
// samples open offline after a first visit. External (?recipe=<url>) recipes
// pass through and are not cached — they can change underneath us and we
// don't want to pin a stale copy.

const CACHE_NAME = 'scrollpot-shell-v1';

const SHELL = [
    './',
    'index.html',
    'styles.css',
    'app.js',
    'recipe.js',
    'units.js',
    'timers.js',
    'scroll.js',
    'wakelock.js',
    'samples/manifest.json',
    'samples/pancakes.json',
    'samples/chocolate-chip-cookies.json',
];

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting()),
    );
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys()
            .then((names) => Promise.all(
                names.filter((n) => n.startsWith('scrollpot-') && n !== CACHE_NAME).map((n) => caches.delete(n)),
            ))
            .then(() => self.clients.claim()),
    );
});

self.addEventListener('fetch', (event) => {
    const req = event.request;
    if (req.method !== 'GET') return;

    const url = new URL(req.url);
    if (url.origin !== self.location.origin) return;        // pass through cross-origin
    if (!url.pathname.includes('/scrollpot/')) return;      // not our scope

    event.respondWith(
        caches.open(CACHE_NAME).then(async (cache) => {
            const hit = await cache.match(req, { ignoreSearch: true });
            if (hit) return hit;
            try {
                const resp = await fetch(req);
                if (resp && resp.ok && resp.type === 'basic') {
                    cache.put(req, resp.clone()).catch(() => {});
                }
                return resp;
            } catch (err) {
                if (hit) return hit;
                throw err;
            }
        }),
    );
});
