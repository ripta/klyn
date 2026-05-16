import { loadRecipe, parseBody } from './recipe.js';
import { formatQuantity, pluralizeUnit } from './units.js';
import * as timers from './timers.js';
import * as scroll from './scroll.js';
import * as wakelock from './wakelock.js';

const STATE_PREFIX = 'scrollpot:state:';

const els = {
    title: document.getElementById('recipe-title'),
    subtitle: document.getElementById('recipe-subtitle'),
    headerControls: document.getElementById('header-controls'),
    servingsDown: document.getElementById('servings-down'),
    servingsUp: document.getElementById('servings-up'),
    servingsCount: document.getElementById('servings-count'),
    servingsUnit: document.getElementById('servings-unit'),
    unitVolume: document.getElementById('unit-volume'),
    unitWeight: document.getElementById('unit-weight'),
    wakelockToggle: document.getElementById('wakelock-toggle'),
    resetSession: document.getElementById('reset-session'),
    error: document.getElementById('error'),
    layout: document.getElementById('layout'),
    gallery: document.getElementById('gallery'),
    galleryList: document.getElementById('gallery-list'),
    rail: document.getElementById('rail'),
    railToggle: document.getElementById('rail-toggle'),
    timersList: document.getElementById('timers-list'),
    timersEmpty: document.getElementById('timers-empty'),
    clearTimers: document.getElementById('clear-timers'),
    toolsList: document.getElementById('tools-list'),
    ingredientsList: document.getElementById('ingredients-list'),
    mainPanel: document.getElementById('main-panel'),
    stepsList: document.getElementById('steps-list'),
    nextStep: document.getElementById('next-step'),
    nextStepLabel: document.getElementById('next-step-label'),
};

let lastSnapshot = { activeId: null, stepsBelowCount: 0, nextOffscreenStepId: null };

const state = {
    recipe: null,
    storageKey: null,
    servings: 0,
    unitSystem: 'volume',
    activeStepId: null,
};

// ─── Boot ──────────────────────────────────────────────────────────────────

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    navigator.serviceWorker.register('sw.js').catch((err) => {
        console.warn('SW registration failed:', err);
    });
}

main().catch((err) => {
    console.error(err);
    showError(err.message || String(err));
});

async function main() {
    wireHeaderControls();
    wireWakelock();
    wireNextStep();
    wireTimerSubscription();
    wireRailToggle();

    const params = new URLSearchParams(location.search);
    const recipeUrl = params.get('recipe');
    if (recipeUrl) {
        await openRecipe(recipeUrl);
    } else {
        await renderGallery();
    }
}

// ─── Gallery ───────────────────────────────────────────────────────────────

async function renderGallery() {
    els.layout.classList.remove('recipe-mode');
    els.layout.classList.add('gallery-mode');
    els.gallery.hidden = false;
    els.rail.hidden = true;
    els.mainPanel.hidden = true;
    els.headerControls.hidden = true;
    els.nextStep.hidden = true;

    try {
        const resp = await fetch('samples/manifest.json', { credentials: 'omit' });
        if (!resp.ok) throw new Error(`${resp.status} ${resp.statusText}`);
        const manifest = await resp.json();
        const recipes = Array.isArray(manifest.recipes) ? manifest.recipes : [];
        renderGalleryList(recipes);
    } catch (err) {
        els.galleryList.innerHTML = '';
        const li = document.createElement('li');
        li.className = 'gallery-empty';
        li.textContent = 'Could not load sample recipes.';
        els.galleryList.appendChild(li);
        console.warn(err);
    }
}

function renderGalleryList(recipes) {
    els.galleryList.innerHTML = '';
    if (recipes.length === 0) {
        const li = document.createElement('li');
        li.className = 'gallery-empty';
        li.textContent = 'No recipes yet.';
        els.galleryList.appendChild(li);
        return;
    }
    for (const r of recipes) {
        const li = document.createElement('li');
        li.className = 'gallery-card';
        const url = new URL(`samples/${r.src}`, location.href).toString();
        const link = document.createElement('a');
        link.href = `?recipe=${encodeURIComponent('samples/' + r.src)}`;
        link.textContent = r.title || r.src;
        const blurb = document.createElement('p');
        blurb.textContent = r.blurb || '';
        li.appendChild(link);
        li.appendChild(blurb);
        els.galleryList.appendChild(li);
    }
}

// ─── Open a recipe ─────────────────────────────────────────────────────────

async function openRecipe(recipeUrl) {
    let recipe;
    try {
        recipe = await loadRecipe(new URL(recipeUrl, location.href).toString());
    } catch (err) {
        showError(`Could not load recipe: ${err.message || err}`);
        return;
    }
    state.recipe = recipe;
    state.storageKey = STATE_PREFIX + recipe.baseUrl;

    // Restore persisted per-recipe state.
    const restored = loadPersistedState();
    state.servings = restored.servings || recipe.servings_default;
    state.unitSystem = restored.unitSystem || 'volume';

    timers.setStorageKey(recipe.baseUrl);

    els.layout.classList.remove('gallery-mode');
    els.layout.classList.add('recipe-mode');
    els.gallery.hidden = true;
    els.rail.hidden = false;
    els.mainPanel.hidden = false;
    els.headerControls.hidden = false;
    if (wakelock.isSupported()) els.wakelockToggle.hidden = false;

    document.title = `${recipe.title} — scrollpot`;
    els.title.textContent = recipe.title;
    els.subtitle.textContent = recipe.description || '';

    renderServings();
    renderUnitToggle();
    renderTools();
    renderIngredients();
    renderSteps();
    renderTimers(timers.listTimers());
    setupStepObserver();

    // Best-effort: ask for notification permission once a timer is started.
    // No permission prompt before then.
}

// ─── Header controls ───────────────────────────────────────────────────────

function wireHeaderControls() {
    els.servingsDown.addEventListener('click', () => {
        if (state.servings <= 1) return;
        state.servings -= 1;
        renderServings();
        renderIngredients();
        persistState();
    });
    els.servingsUp.addEventListener('click', () => {
        state.servings += 1;
        renderServings();
        renderIngredients();
        persistState();
    });
    els.unitVolume.addEventListener('click', () => setUnitSystem('volume'));
    els.unitWeight.addEventListener('click', () => setUnitSystem('weight'));
    els.resetSession.addEventListener('click', () => {
        if (!confirm('Reset servings, units, and timers for this recipe?')) return;
        state.servings = state.recipe ? state.recipe.servings_default : 0;
        state.unitSystem = 'volume';
        timers.clearAllTimers();
        renderServings();
        renderUnitToggle();
        renderIngredients();
        persistState();
    });
}

function setUnitSystem(sys) {
    if (state.unitSystem === sys) return;
    state.unitSystem = sys;
    renderUnitToggle();
    renderIngredients();
    persistState();
}

function renderServings() {
    if (!state.recipe) return;
    els.servingsCount.textContent = String(state.servings);
    els.servingsUnit.textContent = pluralizeUnit(state.recipe.servings_unit, state.servings);
}

function renderUnitToggle() {
    els.unitVolume.dataset.active = state.unitSystem === 'volume' ? 'true' : 'false';
    els.unitWeight.dataset.active = state.unitSystem === 'weight' ? 'true' : 'false';
}

// ─── Sidebar: tools, ingredients ───────────────────────────────────────────

function renderTools() {
    els.toolsList.innerHTML = '';
    for (const t of state.recipe.tools) {
        const li = document.createElement('li');
        li.className = 'tool';
        li.dataset.toolId = t.id;
        const name = document.createElement('div');
        name.className = 'tool-name';
        name.textContent = t.name;
        li.appendChild(name);
        if (t.notes) {
            const n = document.createElement('div');
            n.className = 'tool-notes';
            n.textContent = t.notes;
            li.appendChild(n);
        }
        els.toolsList.appendChild(li);
    }
}

function renderIngredients() {
    els.ingredientsList.innerHTML = '';
    const ratio = state.servings / state.recipe.servings_default;
    const grouped = groupBy(state.recipe.ingredients, (i) => i.group || '');

    for (const [group, items] of grouped) {
        if (group) {
            const label = document.createElement('li');
            label.className = 'ingredient-group-label';
            label.textContent = group;
            els.ingredientsList.appendChild(label);
        }
        for (const ing of items) {
            const li = document.createElement('li');
            li.className = 'ingredient';
            li.dataset.ingredientId = ing.id;

            const row = document.createElement('div');
            row.className = 'ingredient-row';

            const qty = document.createElement('span');
            qty.className = 'ingredient-qty';
            const formatted = formatQuantity(ing, ratio, state.unitSystem);
            qty.textContent = formatted.text;
            if (formatted.approx) qty.dataset.approx = 'true';

            const name = document.createElement('span');
            name.className = 'ingredient-name';
            name.textContent = ing.name;

            row.appendChild(qty);
            row.appendChild(name);
            li.appendChild(row);

            if (ing.notes) {
                const n = document.createElement('div');
                n.className = 'ingredient-notes';
                n.textContent = ing.notes;
                li.appendChild(n);
            }
            els.ingredientsList.appendChild(li);
        }
    }

    // Re-apply highlight after a re-render.
    applyHighlights();
}

// ─── Sidebar: timers ───────────────────────────────────────────────────────

function wireTimerSubscription() {
    timers.subscribe(renderTimers);
    els.clearTimers.addEventListener('click', () => {
        if (!confirm('Clear all timers?')) return;
        timers.clearAllTimers();
    });
}

function renderTimers(list) {
    els.timersList.innerHTML = '';
    els.timersEmpty.hidden = list.length > 0;
    els.clearTimers.hidden = list.length === 0;

    for (const t of list) {
        const li = document.createElement('li');
        li.className = 'timer';
        li.dataset.state = t.completed ? 'completed' : t.paused ? 'paused' : 'running';

        const name = document.createElement('span');
        name.className = 'timer-name';
        name.textContent = t.name;

        const rem = document.createElement('span');
        rem.className = 'timer-remaining';
        rem.textContent = t.completed ? 'done' : timers.formatRemaining(t.remainingMs);

        const bar = document.createElement('div');
        bar.className = 'timer-bar';
        const fill = document.createElement('div');
        fill.className = 'timer-bar-fill';
        const pct = t.completed
            ? 100
            : Math.max(0, Math.min(100, 100 * (1 - t.remainingMs / t.durationMs)));
        fill.style.width = `${pct}%`;
        bar.appendChild(fill);

        const actions = document.createElement('div');
        actions.className = 'timer-actions';

        if (t.completed) {
            actions.appendChild(makeBtn('Dismiss', () => timers.dismissTimer(t.id)));
            actions.appendChild(makeBtn('Restart', () => timers.resetTimer(t.id)));
        } else if (t.paused) {
            actions.appendChild(makeBtn('Resume', () => timers.resumeTimer(t.id)));
            actions.appendChild(makeBtn('Reset', () => timers.resetTimer(t.id)));
            actions.appendChild(makeBtn('Dismiss', () => timers.dismissTimer(t.id)));
        } else {
            actions.appendChild(makeBtn('Pause', () => timers.pauseTimer(t.id)));
            actions.appendChild(makeBtn('Reset', () => timers.resetTimer(t.id)));
            actions.appendChild(makeBtn('Dismiss', () => timers.dismissTimer(t.id)));
        }

        li.appendChild(name);
        li.appendChild(rem);
        li.appendChild(bar);
        li.appendChild(actions);
        els.timersList.appendChild(li);
    }

    // Update step-timer buttons (so a step shows "Running" if its timer is live).
    if (state.recipe) updateStepTimerButtons(list);
}

function makeBtn(label, onClick) {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = label;
    b.addEventListener('click', onClick);
    return b;
}

// ─── Main panel: steps ─────────────────────────────────────────────────────

function renderSteps() {
    els.stepsList.innerHTML = '';
    for (const step of state.recipe.steps) {
        const li = document.createElement('li');
        li.className = 'step';
        li.dataset.stepId = step.id;

        const head = document.createElement('div');
        head.className = 'step-head';

        const num = document.createElement('span');
        num.className = 'step-number';

        const heading = document.createElement('h3');
        heading.className = 'step-heading';
        heading.textContent = step.heading || '';

        head.appendChild(num);
        head.appendChild(heading);
        li.appendChild(head);

        const body = document.createElement('p');
        body.className = 'step-body';
        renderStepBody(body, step.body);
        li.appendChild(body);

        if (step.duration || step.timer) {
            const meta = document.createElement('div');
            meta.className = 'step-meta';
            if (step.duration) {
                const d = document.createElement('span');
                d.className = 'step-duration';
                d.textContent = step.duration;
                meta.appendChild(d);
            }
            if (step.timer) {
                const btn = document.createElement('button');
                btn.type = 'button';
                btn.className = 'step-timer-button';
                btn.dataset.stepId = step.id;
                btn.textContent = `▶ ${step.timer.name || 'Start timer'}`;
                btn.addEventListener('click', () => onStartStepTimer(step));
                meta.appendChild(btn);
            }
            li.appendChild(meta);
        }

        if (step.media) {
            const m = document.createElement('div');
            m.className = 'step-media';
            if (step.media.type === 'video') {
                const v = document.createElement('video');
                v.src = step.media.src;
                v.muted = true;
                v.loop = true;
                v.playsInline = true;
                v.controls = true;
                m.appendChild(v);
            } else {
                const img = document.createElement('img');
                img.src = step.media.src;
                img.alt = step.media.alt || '';
                img.loading = 'lazy';
                m.appendChild(img);
            }
            li.appendChild(m);
        }

        if (step.notes && step.notes.length > 0) {
            const wrap = document.createElement('div');
            wrap.className = 'step-notes';
            for (const note of step.notes) {
                const n = document.createElement('div');
                n.className = 'step-note';
                n.dataset.kind = note.kind || 'tip';
                const k = document.createElement('span');
                k.className = 'step-note-kind';
                k.textContent = note.kind || 'tip';
                const b = document.createElement('span');
                b.className = 'step-note-body';
                renderStepBody(b, note.body || '');
                n.appendChild(k);
                n.appendChild(b);
                wrap.appendChild(n);
            }
            li.appendChild(wrap);
        }

        els.stepsList.appendChild(li);
    }
}

function renderStepBody(target, body) {
    target.textContent = '';
    const segments = parseBody(body);
    for (const seg of segments) {
        if (seg.type === 'text') {
            target.appendChild(document.createTextNode(seg.value));
        } else if (seg.type === 'bold') {
            const s = document.createElement('strong');
            s.textContent = seg.value;
            target.appendChild(s);
        } else if (seg.type === 'italic') {
            const e = document.createElement('em');
            e.textContent = seg.value;
            target.appendChild(e);
        } else if (seg.type === 'ref') {
            const span = document.createElement('span');
            span.className = 'ref';
            span.dataset.kind = seg.kind;
            span.dataset.refId = seg.id;
            span.textContent = lookupRefName(seg.kind, seg.id);
            span.addEventListener('click', () => scrollSidebarTo(seg.kind, seg.id));
            target.appendChild(span);
        }
    }
}

function lookupRefName(kind, id) {
    const list = kind === 'tool' ? state.recipe.tools : state.recipe.ingredients;
    const found = list.find((x) => x.id === id);
    return found ? found.name : `(${kind}:${id})`;
}

function scrollSidebarTo(kind, id) {
    const sel = kind === 'tool'
        ? `[data-tool-id="${cssEscape(id)}"]`
        : `[data-ingredient-id="${cssEscape(id)}"]`;
    const el = els.rail.querySelector(sel);
    if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        // Briefly pulse the row.
        el.dataset.flash = 'true';
        setTimeout(() => delete el.dataset.flash, 1200);
    }
}

function onStartStepTimer(step) {
    const t = step.timer;
    if (!t) return;
    timers.startTimer({
        name: t.name || step.heading || 'Timer',
        seconds: t.seconds,
        sourceStepId: step.id,
    });
    // Lazily ask for notification permission once a timer is in flight.
    timers.requestNotificationPermission().catch(() => {});
}

function updateStepTimerButtons(list) {
    const runningStepIds = new Set(
        list.filter((t) => !t.completed && t.sourceStepId).map((t) => t.sourceStepId),
    );
    for (const btn of els.stepsList.querySelectorAll('.step-timer-button')) {
        const running = runningStepIds.has(btn.dataset.stepId);
        btn.dataset.running = running ? 'true' : 'false';
        if (running) btn.textContent = '● Running';
        else {
            const step = state.recipe.steps.find((s) => s.id === btn.dataset.stepId);
            btn.textContent = `▶ ${step?.timer?.name || 'Start timer'}`;
        }
    }
}

// ─── Scroll-driven active step + highlighting ──────────────────────────────

function setupStepObserver() {
    const stepEls = els.stepsList.querySelectorAll('.step');
    scroll.observeSteps(els.mainPanel, stepEls, onScrollUpdate);
}

function onScrollUpdate(snap) {
    lastSnapshot = snap;
    if (snap.activeChanged) {
        state.activeStepId = snap.activeId;
        applyHighlights();
    }
    updateNextStepIndicator(snap);
}

function updateNextStepIndicator(snap) {
    const n = snap.stepsBelowCount;
    if (n <= 0) {
        els.nextStep.hidden = true;
        return;
    }
    els.nextStep.hidden = false;
    els.nextStepLabel.textContent = `${n} more step${n === 1 ? '' : 's'} below`;
}

function applyHighlights() {
    if (!state.recipe) return;
    const id = state.activeStepId;
    const step = id ? state.recipe.steps.find((s) => s.id === id) : null;

    const ingIds = new Set();
    const toolIds = new Set();
    if (step) {
        for (const ref of step.refs) {
            if (ref.kind === 'ingredient') ingIds.add(ref.id);
            else if (ref.kind === 'tool') toolIds.add(ref.id);
        }
    }

    for (const el of els.toolsList.querySelectorAll('.tool')) {
        el.dataset.active = toolIds.has(el.dataset.toolId) ? 'true' : 'false';
    }
    for (const el of els.ingredientsList.querySelectorAll('.ingredient')) {
        el.dataset.active = ingIds.has(el.dataset.ingredientId) ? 'true' : 'false';
    }
    for (const el of els.stepsList.querySelectorAll('.step')) {
        el.classList.toggle('is-active', el.dataset.stepId === id);
    }
}

// ─── Next-step button ──────────────────────────────────────────────────────

function wireNextStep() {
    els.nextStep.addEventListener('click', () => {
        const next = lastSnapshot.nextOffscreenStepId;
        if (next) scroll.scrollStepIntoView(els.mainPanel, next);
    });
}

// ─── Wake lock ─────────────────────────────────────────────────────────────

function wireWakelock() {
    if (!wakelock.isSupported()) return;
    els.wakelockToggle.addEventListener('click', () => {
        wakelock.setEnabled(!wakelock.isOn());
    });
    wakelock.subscribe((on) => {
        els.wakelockToggle.dataset.active = on ? 'true' : 'false';
    });
}

// ─── Rail collapse (mobile) ────────────────────────────────────────────────

function wireRailToggle() {
    els.railToggle.addEventListener('click', () => {
        const collapsed = els.rail.dataset.collapsed === 'true';
        els.rail.dataset.collapsed = collapsed ? 'false' : 'true';
        els.railToggle.setAttribute('aria-expanded', collapsed ? 'true' : 'false');
    });
}

// ─── Persistence ───────────────────────────────────────────────────────────

function persistState() {
    if (!state.storageKey) return;
    try {
        localStorage.setItem(state.storageKey, JSON.stringify({
            servings: state.servings,
            unitSystem: state.unitSystem,
        }));
    } catch (err) {
        console.warn('Could not persist state:', err);
    }
}

function loadPersistedState() {
    if (!state.storageKey) return {};
    try {
        const raw = localStorage.getItem(state.storageKey);
        return raw ? JSON.parse(raw) : {};
    } catch {
        return {};
    }
}

// ─── Utilities ─────────────────────────────────────────────────────────────

function groupBy(list, keyFn) {
    const map = new Map();
    for (const item of list) {
        const k = keyFn(item);
        if (!map.has(k)) map.set(k, []);
        map.get(k).push(item);
    }
    return map;
}

function cssEscape(s) {
    return (window.CSS && CSS.escape) ? CSS.escape(s) : String(s).replace(/[^a-zA-Z0-9_-]/g, '\\$&');
}

function showError(msg) {
    els.error.textContent = msg;
    els.error.hidden = false;
}
