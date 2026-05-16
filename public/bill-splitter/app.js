import { createOcrSession } from './ocr.js';
import { parseReceipt } from './parser.js';
import { computeTotals, formatCurrency } from './splitter.js';

const PARTICIPANT_COLORS = ['#d97706', '#0ea5e9', '#65a30d', '#db2777', '#7c3aed', '#0d9488', '#dc2626', '#525252'];

const state = {
    image: null,                  // ImageBitmap
    ocr: null,                    // { words, lines, rawText }
    parsed: null,                 // parser output
    items: [],                    // items with assignees (Set)
    fees: [],
    participants: [{ id: 'p1', name: 'Me' }],
    nextParticipantSeq: 2,
    locale: 'en-US',
    currency: 'USD',
};

const els = {
    fileInput: document.getElementById('file-input'),
    progress: document.getElementById('progress'),
    progressFill: document.getElementById('progress-fill'),
    progressLabel: document.getElementById('progress-label'),
    error: document.getElementById('error'),
    previewEmpty: document.getElementById('preview-empty'),
    previewCanvas: document.getElementById('preview-canvas'),
    participantsList: document.getElementById('participants-list'),
    addParticipantForm: document.getElementById('add-participant-form'),
    addParticipantInput: document.getElementById('add-participant-input'),
    itemsList: document.getElementById('items-list'),
    itemsEmpty: document.getElementById('items-empty'),
    itemsCount: document.getElementById('items-count'),
    feesList: document.getElementById('fees-list'),
    feesEmpty: document.getElementById('fees-empty'),
    totalsList: document.getElementById('totals-list'),
    totalsWarning: document.getElementById('totals-warning'),
};

// Register the service worker only when the protocol supports it (https or localhost).
if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    navigator.serviceWorker.register('sw.js').catch((err) => {
        console.warn('Service Worker registration failed:', err);
    });
}

// ─── File input ────────────────────────────────────────────────────────────

els.fileInput.addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    clearError();
    await handleFile(file);
});

async function handleFile(file) {
    let bitmap;
    try {
        bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
    } catch (err) {
        // iPhone HEIC often fails here on non-Safari browsers.
        showError(
            'Could not decode this image. If it is from an iPhone, try switching the camera to ' +
            '"Most Compatible" (Settings → Camera → Formats) so photos save as JPEG.',
        );
        console.error(err);
        return;
    }
    state.image = bitmap;
    drawPreview(bitmap);
    await runOcr(file);
}

function drawPreview(bitmap) {
    const canvas = els.previewCanvas;
    const maxW = 1600; // cap so we don't draw a 12MP raw frame to a small panel
    const scale = Math.min(1, maxW / bitmap.width);
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    const ctx = canvas.getContext('2d');
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    canvas.hidden = false;
    els.previewEmpty.hidden = true;
}

// ─── OCR + parse ───────────────────────────────────────────────────────────

let ocrSession = null;

async function runOcr(blob) {
    showProgress(0, 'Loading OCR engine…');
    try {
        if (!ocrSession) {
            ocrSession = await createOcrSession({ onProgress: handleOcrProgress });
        }
        const result = await ocrSession.recognize(blob);
        state.ocr = result;

        showProgress(1, 'Parsing receipt…');
        const parsed = parseReceipt(result);
        state.parsed = parsed;
        state.locale = parsed.detectedLocale || 'en-US';
        state.items = parsed.items.map((it) => ({ ...it, assignees: new Set(it.assignees || []) }));
        state.fees = parsed.fees;

        hideProgress();
        if (parsed.warnings.length) {
            showError(parsed.warnings.join(' '));
        }
        renderAll();
    } catch (err) {
        console.error(err);
        hideProgress();
        showError(`OCR failed: ${err.message || err}`);
    }
}

function handleOcrProgress(m) {
    if (!m) return;
    const labels = {
        'loading tesseract core': 'Loading OCR core…',
        'initializing tesseract': 'Initializing OCR…',
        'loading language traineddata': 'Downloading language model (~10MB)…',
        'initializing api': 'Initializing OCR API…',
        'recognizing text': 'Recognizing text…',
    };
    const label = labels[m.status] || m.status;
    showProgress(m.progress ?? 0, label);
}

// ─── Rendering ─────────────────────────────────────────────────────────────

function renderAll() {
    renderParticipants();
    renderItems();
    renderFees();
    renderTotals();
}

function renderParticipants() {
    els.participantsList.innerHTML = '';
    state.participants.forEach((p, idx) => {
        const li = document.createElement('li');
        li.className = 'participant';
        li.style.setProperty('--p-color', PARTICIPANT_COLORS[idx % PARTICIPANT_COLORS.length]);

        const dot = document.createElement('span');
        dot.className = 'participant-color';

        const name = document.createElement('input');
        name.className = 'participant-name';
        name.value = p.name;
        name.size = Math.max(p.name.length, 2);
        name.addEventListener('input', () => {
            name.size = Math.max(name.value.length, 2);
        });
        name.addEventListener('change', () => {
            const v = name.value.trim();
            p.name = v || p.name;
            name.value = p.name;
            renderItems();
            renderTotals();
        });

        const remove = document.createElement('button');
        remove.className = 'participant-remove';
        remove.type = 'button';
        remove.textContent = '×';
        remove.title = 'Remove participant';
        remove.addEventListener('click', () => removeParticipant(p.id));
        if (state.participants.length <= 1) remove.disabled = true;

        li.appendChild(dot);
        li.appendChild(name);
        li.appendChild(remove);
        els.participantsList.appendChild(li);
    });
}

function renderItems() {
    els.itemsList.innerHTML = '';
    els.itemsEmpty.hidden = state.items.length > 0;
    els.itemsCount.textContent = state.items.length ? `${state.items.length}` : '';

    state.items.forEach((item) => {
        const li = document.createElement('li');
        li.className = 'item';

        const row = document.createElement('div');
        row.className = 'item-row';

        const nameInput = document.createElement('input');
        nameInput.className = 'item-name';
        nameInput.value = item.name;
        nameInput.addEventListener('change', () => {
            item.name = nameInput.value.trim() || item.name;
            nameInput.value = item.name;
        });

        const priceInput = document.createElement('input');
        priceInput.className = 'item-price';
        priceInput.value = item.price.toFixed(2);
        priceInput.inputMode = 'decimal';
        priceInput.addEventListener('change', () => {
            const v = Number(priceInput.value.replace(',', '.'));
            if (Number.isFinite(v)) {
                item.price = v;
            }
            priceInput.value = item.price.toFixed(2);
            renderTotals();
        });

        row.appendChild(nameInput);
        row.appendChild(priceInput);

        const meta = document.createElement('div');
        meta.className = 'item-meta';

        const pill = document.createElement('span');
        pill.className = 'confidence-pill';
        const level = item.confidence >= 80 ? 'good' : item.confidence >= 60 ? 'ok' : 'poor';
        pill.dataset.level = level;
        pill.textContent = `${Math.round(item.confidence)}%`;
        pill.title = 'OCR confidence';

        const chips = document.createElement('div');
        chips.className = 'assign-chips';
        state.participants.forEach((p, idx) => {
            const chip = document.createElement('button');
            chip.type = 'button';
            chip.className = 'assign-chip';
            chip.style.setProperty('--p-color', PARTICIPANT_COLORS[idx % PARTICIPANT_COLORS.length]);
            chip.dataset.assigned = item.assignees.has(p.id) ? 'true' : 'false';
            chip.innerHTML = `<span class="chip-dot"></span><span>${escapeHtml(p.name)}</span>`;
            chip.addEventListener('click', () => {
                if (item.assignees.has(p.id)) item.assignees.delete(p.id);
                else item.assignees.add(p.id);
                renderItems();
                renderTotals();
            });
            chips.appendChild(chip);
        });

        const remove = document.createElement('button');
        remove.type = 'button';
        remove.className = 'item-remove';
        remove.textContent = 'remove';
        remove.addEventListener('click', () => {
            state.items = state.items.filter((it) => it.id !== item.id);
            renderItems();
            renderTotals();
        });

        meta.appendChild(pill);
        meta.appendChild(chips);
        meta.appendChild(remove);

        li.appendChild(row);
        li.appendChild(meta);
        els.itemsList.appendChild(li);
    });
}

function renderFees() {
    els.feesList.innerHTML = '';
    els.feesEmpty.hidden = state.fees.length > 0;
    state.fees.forEach((fee) => {
        const li = document.createElement('li');
        li.className = 'fee';
        const row = document.createElement('div');
        row.className = 'fee-row';

        const left = document.createElement('div');
        const typeChip = document.createElement('span');
        typeChip.className = 'fee-type-chip';
        typeChip.textContent = fee.type;
        const label = document.createElement('input');
        label.className = 'fee-label';
        label.value = fee.label;
        label.addEventListener('change', () => {
            fee.label = label.value.trim() || fee.label;
            label.value = fee.label;
        });
        left.appendChild(typeChip);
        left.appendChild(label);

        const amount = document.createElement('input');
        amount.className = 'fee-amount';
        amount.value = fee.amount.toFixed(2);
        amount.inputMode = 'decimal';
        amount.addEventListener('change', () => {
            const v = Number(amount.value.replace(',', '.'));
            if (Number.isFinite(v)) fee.amount = v;
            amount.value = fee.amount.toFixed(2);
            renderTotals();
        });

        row.appendChild(left);
        row.appendChild(amount);
        li.appendChild(row);
        els.feesList.appendChild(li);
    });
}

function renderTotals() {
    els.totalsList.innerHTML = '';
    // 'total' fees are informational; don't redistribute them.
    const distributableFees = state.fees.filter((f) => f.type !== 'total');
    const result = computeTotals({
        items: state.items,
        fees: distributableFees,
        participants: state.participants,
    });

    result.perParticipant.forEach((row, idx) => {
        const li = document.createElement('li');
        li.className = 'totals-row';
        li.style.setProperty('--p-color', PARTICIPANT_COLORS[idx % PARTICIPANT_COLORS.length]);

        const name = document.createElement('span');
        name.className = 'name';
        name.textContent = row.name;

        const amount = document.createElement('span');
        amount.className = 'amount';
        amount.textContent = formatCurrency(row.total, state.locale, state.currency);

        li.appendChild(name);
        li.appendChild(amount);

        const breakdown = document.createElement('span');
        breakdown.className = 'breakdown';
        const parts = [`subtotal ${formatCurrency(row.subtotal, state.locale, state.currency)}`];
        for (const [type, share] of Object.entries(row.feeShares)) {
            parts.push(`${type} ${formatCurrency(share, state.locale, state.currency)}`);
        }
        breakdown.textContent = parts.join(' · ');
        li.appendChild(breakdown);
        els.totalsList.appendChild(li);
    });

    const warnings = [];
    if (result.unassignedItems.length) {
        const sum = result.unassignedItems.reduce((a, b) => a + b.price, 0);
        warnings.push(
            `${result.unassignedItems.length} unassigned item${result.unassignedItems.length === 1 ? '' : 's'} ` +
                `(${formatCurrency(sum, state.locale, state.currency)}) not included in any total.`,
        );
    }
    const totalFee = state.fees.find((f) => f.type === 'total');
    if (totalFee && Number.isFinite(totalFee.amount)) {
        const diff = result.grandTotal - totalFee.amount;
        if (Math.abs(diff) > 0.02) {
            warnings.push(
                `Split total ${formatCurrency(result.grandTotal, state.locale, state.currency)} does not match ` +
                    `receipt total ${formatCurrency(totalFee.amount, state.locale, state.currency)} ` +
                    `(off by ${formatCurrency(Math.abs(diff), state.locale, state.currency)}).`,
            );
        }
    }
    if (warnings.length) {
        els.totalsWarning.textContent = warnings.join(' ');
        els.totalsWarning.hidden = false;
    } else {
        els.totalsWarning.hidden = true;
        els.totalsWarning.textContent = '';
    }
}

// ─── Participants management ───────────────────────────────────────────────

els.addParticipantForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const name = els.addParticipantInput.value.trim();
    if (!name) return;
    state.participants.push({ id: `p${state.nextParticipantSeq++}`, name });
    els.addParticipantInput.value = '';
    renderAll();
});

function removeParticipant(id) {
    if (state.participants.length <= 1) return;
    state.participants = state.participants.filter((p) => p.id !== id);
    for (const item of state.items) item.assignees.delete(id);
    renderAll();
}

// ─── Progress + error helpers ──────────────────────────────────────────────

function showProgress(fraction, label) {
    els.progress.hidden = false;
    els.progressFill.style.width = `${Math.max(0, Math.min(1, fraction)) * 100}%`;
    els.progressLabel.textContent = label || '';
}

function hideProgress() {
    els.progress.hidden = true;
    els.progressFill.style.width = '0%';
}

function showError(msg) {
    els.error.textContent = msg;
    els.error.hidden = false;
}

function clearError() {
    els.error.hidden = true;
    els.error.textContent = '';
}

function escapeHtml(s) {
    return String(s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

// Initial render so the "Me" chip is visible before any photo is loaded.
renderParticipants();
