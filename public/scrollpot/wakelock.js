// Thin wrapper around the Screen Wake Lock API.
//
// The lock is automatically released when the tab is hidden; we re-acquire
// on visibility-return so the toggle "stays on" from the user's perspective
// across app switches.

let sentinel = null;
let desired = false;
let listeners = new Set();

export function isSupported() {
    return 'wakeLock' in navigator;
}

export function isOn() {
    return desired;
}

export async function setEnabled(on) {
    desired = !!on;
    notify();
    if (desired) {
        await acquire();
    } else {
        await release();
    }
}

export function subscribe(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
}

async function acquire() {
    if (!isSupported() || !desired || sentinel) return;
    try {
        sentinel = await navigator.wakeLock.request('screen');
        sentinel.addEventListener('release', () => {
            sentinel = null;
            // If we still want the lock (e.g., the tab was just hidden and
            // came back), the visibility handler will re-acquire.
        });
    } catch (err) {
        console.warn('Wake lock request failed:', err);
        desired = false;
        notify();
    }
}

async function release() {
    if (sentinel) {
        try { await sentinel.release(); } catch { /* ignore */ }
        sentinel = null;
    }
}

if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible' && desired && !sentinel) {
            acquire();
        }
    });
}

function notify() {
    for (const fn of listeners) {
        try { fn(desired); } catch (err) { console.error(err); }
    }
}
