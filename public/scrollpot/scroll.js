// Active-step detection + a scroll snapshot for the off-screen indicator.
//
// A "reading line" sits a small fixed distance below the top of the scrolling
// root. The active step is the last one whose top has scrolled past that
// line. If no step has crossed it yet (we're at the top of the recipe), the
// first step is active.
//
// We also expose, on every scroll frame, the count and id of the first step
// that is entirely below the viewport, so the UI can show a "N more steps
// below" indicator.

const READ_LINE_OFFSET_PX = 40;

let rootEl = null;
let stepEls = [];
let onUpdateCb = null;
let currentId = null;
let rafHandle = null;
let resizeObserver = null;

export function observeSteps(root, stepElements, onUpdate) {
    teardown();
    rootEl = root;
    stepEls = Array.from(stepElements);
    onUpdateCb = onUpdate;
    if (stepEls.length === 0) return;

    const target = rootEl || window;
    target.addEventListener('scroll', scheduleRecompute, { passive: true });
    window.addEventListener('resize', scheduleRecompute, { passive: true });

    if ('ResizeObserver' in window && rootEl) {
        resizeObserver = new ResizeObserver(scheduleRecompute);
        resizeObserver.observe(rootEl);
    }

    scheduleRecompute();
}

function scheduleRecompute() {
    if (rafHandle != null) return;
    rafHandle = requestAnimationFrame(() => {
        rafHandle = null;
        recompute();
    });
}

function recompute() {
    if (stepEls.length === 0) return;
    const rootRect = rootEl
        ? rootEl.getBoundingClientRect()
        : { top: 0, bottom: window.innerHeight, height: window.innerHeight };
    const line = rootRect.top + READ_LINE_OFFSET_PX;
    const viewportBottom = rootRect.bottom ?? rootRect.top + rootRect.height;

    let best = null;
    let bestDist = Infinity;
    let stepsBelowCount = 0;
    let nextOffscreenStepId = null;

    for (const el of stepEls) {
        const r = el.getBoundingClientRect();
        if (r.top <= line) {
            const dist = line - r.top;
            if (dist < bestDist) {
                bestDist = dist;
                best = el;
            }
        }
        if (r.top > viewportBottom) {
            stepsBelowCount += 1;
            if (!nextOffscreenStepId) nextOffscreenStepId = el.dataset.stepId || null;
        }
    }
    if (!best) best = stepEls[0];

    const activeId = best.dataset.stepId || null;
    const activeChanged = activeId !== currentId;
    currentId = activeId;

    if (onUpdateCb) {
        onUpdateCb({ activeId, activeChanged, stepsBelowCount, nextOffscreenStepId });
    }
}

export function getActiveStepId() {
    return currentId;
}

export function scrollStepIntoView(rootElArg, id, behavior = 'smooth') {
    const el = stepEls.find((s) => s.dataset.stepId === id);
    if (!el) return;
    const root = rootElArg || document.scrollingElement || document.documentElement;
    const rootRect = root.getBoundingClientRect();
    const elRect = el.getBoundingClientRect();
    const delta = elRect.top - rootRect.top - READ_LINE_OFFSET_PX;
    root.scrollBy({ top: delta, behavior });
}

function teardown() {
    if (rafHandle != null) {
        cancelAnimationFrame(rafHandle);
        rafHandle = null;
    }
    if (rootEl) rootEl.removeEventListener('scroll', scheduleRecompute);
    window.removeEventListener('resize', scheduleRecompute);
    if (resizeObserver) {
        resizeObserver.disconnect();
        resizeObserver = null;
    }
    rootEl = null;
    stepEls = [];
    onUpdateCb = null;
    currentId = null;
}
