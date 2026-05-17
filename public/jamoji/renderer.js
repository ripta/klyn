// Renderer strategy for <jamoji-block> cells. Each renderer exposes
// render(grapheme) -> Promise<HTMLElement>. The element returned is what the
// host element drops into a cell wrapper inside its Shadow DOM.

const NOTO_BASE = 'https://cdn.jsdelivr.net/gh/googlefonts/noto-emoji@main/svg';

// Codepoints to drop when forming the Noto filename. VS-16 (FE0F) is
// emoji-presentation selector and is not part of Noto's filenames.
const FILENAME_SKIP = new Set([0xfe0f]);

function codepoints(grapheme) {
    return [...grapheme].map((ch) => ch.codePointAt(0));
}

function notoFilename(grapheme) {
    const cps = codepoints(grapheme).filter((cp) => !FILENAME_SKIP.has(cp));
    if (cps.length === 0) return null;
    return `emoji_u${cps.map((cp) => cp.toString(16)).join('_')}.svg`;
}

// Always-immediate renderer that draws the grapheme as text. Falls back to
// OS emoji glyphs. Used directly (renderer="native") and as the fallback
// when a Noto SVG fetch fails.
export const NativeRenderer = {
    name: 'native',
    async render(grapheme) {
        const span = document.createElement('span');
        span.className = 'cell-native';
        span.textContent = grapheme;
        return span;
    },
};

// SVG fetch cache: codepoint-sequence key -> Promise<string | null>.
// Sharing the promise (not the resolved value) means two simultaneous renders
// of the same grapheme issue one network request.
const svgCache = new Map();
const warned = new Set();

function cacheKey(grapheme) {
    return codepoints(grapheme).join('-');
}

async function fetchSvg(grapheme) {
    const key = cacheKey(grapheme);
    if (svgCache.has(key)) return svgCache.get(key);

    const filename = notoFilename(grapheme);
    if (!filename) {
        svgCache.set(key, Promise.resolve(null));
        return null;
    }
    const url = `${NOTO_BASE}/${filename}`;
    const promise = fetch(url).then(async (res) => {
        if (!res.ok) return null;
        const text = await res.text();
        // jsdelivr serves with the right content-type but be defensive
        // about getting an HTML 404 page disguised as 200.
        if (!text.includes('<svg')) return null;
        return text;
    }).catch(() => null);

    svgCache.set(key, promise);
    return promise;
}

function inlineSvg(svgText) {
    const tmp = document.createElement('div');
    tmp.innerHTML = svgText.trim();
    const svg = tmp.querySelector('svg');
    if (!svg) return null;
    // Remove fixed width/height so CSS sizing wins. Keep viewBox.
    svg.removeAttribute('width');
    svg.removeAttribute('height');
    svg.setAttribute('focusable', 'false');
    svg.setAttribute('aria-hidden', 'true');
    return svg;
}

export const NotoSvgRenderer = {
    name: 'noto',
    async render(grapheme) {
        const svgText = await fetchSvg(grapheme);
        if (!svgText) {
            if (!warned.has(grapheme)) {
                warned.add(grapheme);
                console.warn(
                    `jamoji: no Noto SVG for "${grapheme}" (${cacheKey(grapheme)}); falling back to native render.`,
                );
            }
            return NativeRenderer.render(grapheme);
        }
        const svg = inlineSvg(svgText);
        if (!svg) {
            return NativeRenderer.render(grapheme);
        }
        const wrap = document.createElement('span');
        wrap.className = 'cell-svg';
        wrap.appendChild(svg);
        return wrap;
    },
};

export const RENDERERS = {
    native: NativeRenderer,
    noto: NotoSvgRenderer,
};

let _isApple = null;
function isApplePlatform() {
    if (_isApple !== null) return _isApple;
    if (typeof navigator === 'undefined') return (_isApple = false);
    if (navigator.userAgentData?.platform === 'macOS') return (_isApple = true);
    const ua = navigator.userAgent || '';
    const platform = navigator.platform || '';
    _isApple = /Mac|iPhone|iPad|iPod/.test(platform) || /Mac OS X|iPhone|iPad/.test(ua);
    return _isApple;
}

export function autoRenderer() {
    return isApplePlatform() ? NativeRenderer : NotoSvgRenderer;
}

// Resolves a renderer name to its strategy. Accepts 'native', 'noto', 'auto',
// or null/undefined (treated as 'auto'). Returns null for unknown names.
export function rendererByName(name) {
    if (name == null || name === 'auto') return autoRenderer();
    return RENDERERS[name] ?? null;
}
