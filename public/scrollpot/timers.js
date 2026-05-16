// Multiple concurrent named timers with wall-clock persistence.
//
// Wall-clock means each running timer is stored as a target epoch millisecond.
// On reload (or after the device sleeps), remaining time is `targetMs -
// Date.now()`, so timers stay accurate without a heartbeat. The tick loop
// only exists to redraw the UI and fire completion side-effects.
//
// Persistence: localStorage, keyed per-recipe so two recipes can't trample
// each other's timers.

const STORAGE_PREFIX = 'scrollpot:timers:';
const TICK_MS = 250;

let storageKey = null;
let timers = [];
let listeners = new Set();
let tickHandle = null;
let audio = null;

export function setStorageKey(key) {
    storageKey = key ? STORAGE_PREFIX + key : null;
    timers = load();
    notify();
    ensureTicking();
}

export function listTimers() {
    return timers.map(snapshot);
}

export function startTimer({ name, seconds, sourceStepId }) {
    const dur = Math.max(1, Math.round(Number(seconds) || 0));
    const id = `t-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
    const t = {
        id,
        name: name || 'Timer',
        durationMs: dur * 1000,
        targetMs: Date.now() + dur * 1000,
        pausedRemainingMs: null,   // set while paused
        completed: false,
        notified: false,
        sourceStepId: sourceStepId || null,
    };
    timers.push(t);
    persist();
    notify();
    ensureTicking();
    return snapshot(t);
}

export function pauseTimer(id) {
    const t = byId(id);
    if (!t || t.completed || t.pausedRemainingMs != null) return;
    t.pausedRemainingMs = Math.max(0, t.targetMs - Date.now());
    persist();
    notify();
}

export function resumeTimer(id) {
    const t = byId(id);
    if (!t || t.completed || t.pausedRemainingMs == null) return;
    t.targetMs = Date.now() + t.pausedRemainingMs;
    t.pausedRemainingMs = null;
    persist();
    notify();
    ensureTicking();
}

export function resetTimer(id) {
    const t = byId(id);
    if (!t) return;
    t.targetMs = Date.now() + t.durationMs;
    t.pausedRemainingMs = null;
    t.completed = false;
    t.notified = false;
    persist();
    notify();
    ensureTicking();
}

export function dismissTimer(id) {
    timers = timers.filter((t) => t.id !== id);
    persist();
    notify();
}

export function clearAllTimers() {
    timers = [];
    persist();
    notify();
}

export function subscribe(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
}

// ─── internals ─────────────────────────────────────────────────────────────

function snapshot(t) {
    const paused = t.pausedRemainingMs != null;
    const remainingMs = t.completed
        ? 0
        : paused
        ? t.pausedRemainingMs
        : Math.max(0, t.targetMs - Date.now());
    return {
        id: t.id,
        name: t.name,
        durationMs: t.durationMs,
        remainingMs,
        paused,
        completed: t.completed,
        sourceStepId: t.sourceStepId,
    };
}

function byId(id) {
    return timers.find((t) => t.id === id);
}

function notify() {
    const snap = listTimers();
    for (const fn of listeners) {
        try { fn(snap); } catch (err) { console.error(err); }
    }
}

function ensureTicking() {
    if (tickHandle != null) return;
    tickHandle = setInterval(tick, TICK_MS);
}

function tick() {
    let changed = false;
    const now = Date.now();
    for (const t of timers) {
        if (t.completed || t.pausedRemainingMs != null) continue;
        if (now >= t.targetMs && !t.completed) {
            t.completed = true;
            changed = true;
            fireCompletion(t);
        }
    }
    if (changed) persist();
    // Always notify so the UI redraws remaining time.
    notify();

    const anyActive = timers.some((t) => !t.completed && t.pausedRemainingMs == null);
    if (!anyActive && tickHandle != null) {
        clearInterval(tickHandle);
        tickHandle = null;
    }
}

function fireCompletion(t) {
    if (t.notified) return;
    t.notified = true;
    playChime();
    if ('Notification' in window && Notification.permission === 'granted' && document.hidden) {
        try {
            new Notification('Timer finished', { body: t.name, silent: false });
        } catch (err) { /* notifications can fail silently */ }
    }
    if ('vibrate' in navigator) {
        try { navigator.vibrate([200, 100, 200]); } catch { /* ignore */ }
    }
}

function playChime() {
    try {
        if (!audio) audio = new (window.AudioContext || window.webkitAudioContext)();
        if (audio.state === 'suspended') audio.resume();
        const now = audio.currentTime;
        // Two short tones, simple sine.
        for (let i = 0; i < 2; i++) {
            const osc = audio.createOscillator();
            const gain = audio.createGain();
            osc.frequency.value = 880;
            osc.type = 'sine';
            gain.gain.setValueAtTime(0, now + i * 0.4);
            gain.gain.linearRampToValueAtTime(0.2, now + i * 0.4 + 0.02);
            gain.gain.exponentialRampToValueAtTime(0.0001, now + i * 0.4 + 0.3);
            osc.connect(gain).connect(audio.destination);
            osc.start(now + i * 0.4);
            osc.stop(now + i * 0.4 + 0.32);
        }
    } catch (err) {
        // Audio can be blocked until first user gesture; that's fine.
    }
}

export function requestNotificationPermission() {
    if (!('Notification' in window)) return Promise.resolve('unsupported');
    if (Notification.permission !== 'default') return Promise.resolve(Notification.permission);
    return Notification.requestPermission();
}

function persist() {
    if (!storageKey) return;
    try {
        localStorage.setItem(storageKey, JSON.stringify(timers));
    } catch (err) {
        console.warn('Could not persist timers:', err);
    }
}

function load() {
    if (!storageKey) return [];
    try {
        const raw = localStorage.getItem(storageKey);
        if (!raw) return [];
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed)) return [];
        // Drop completed/dismissed timers older than a day on reload to avoid
        // cluttering up the UI forever.
        const cutoff = Date.now() - 24 * 60 * 60 * 1000;
        return parsed.filter((t) => !t.completed || (t.targetMs ?? 0) > cutoff);
    } catch {
        return [];
    }
}

export function formatRemaining(ms) {
    const total = Math.max(0, Math.round(ms / 1000));
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = total % 60;
    if (h > 0) return `${h}:${pad(m)}:${pad(s)}`;
    return `${m}:${pad(s)}`;
}

function pad(n) { return String(n).padStart(2, '0'); }
