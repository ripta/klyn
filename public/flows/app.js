const SVG_NS = "http://www.w3.org/2000/svg";

const els = {
    canvas: document.getElementById("canvas"),
    nodes: document.getElementById("nodes"),
    edges: document.getElementById("edges"),
    legend: document.getElementById("legend"),
    flowList: document.getElementById("flow-list"),
    stepList: document.getElementById("step-list"),
    stepEmpty: document.getElementById("step-empty"),
    flowSummary: document.getElementById("flow-summary"),
    picker: document.getElementById("flow-picker"),
    pickerTrigger: document.getElementById("flow-picker-trigger"),
    pickerCurrent: document.getElementById("flow-picker-current"),
    flowFilter: document.getElementById("flow-filter"),
    flowEmpty: document.getElementById("flow-empty"),
    canvasPane: document.querySelector(".canvas-pane"),
    railBody: document.querySelector(".rail-body"),
    source: document.getElementById("source"),
};

const DEFAULT_SOURCE = "flows.json";

const state = {
    data: null,
    componentsById: new Map(),
    categoriesById: new Map(),
    activeFlowId: null,
    nodeEls: new Map(),
    edgeEls: new Map(),
};

const sourceURL = resolveSourceURL();

init().catch((err) => {
    console.error("Failed to load flows:", err);
    els.flowList.innerHTML = `<li class="error">Could not load ${escapeHtml(sourceURL)} (${escapeHtml(err.message)}). Serve this directory over HTTP.</li>`;
});

function resolveSourceURL() {
    const params = new URLSearchParams(window.location.search);
    const from = params.get("from");
    return from && from.trim() ? from.trim() : DEFAULT_SOURCE;
}

function renderSourceDisplay() {
    if (!els.source) return;
    if (sourceURL === DEFAULT_SOURCE) {
        els.source.hidden = true;
        els.source.replaceChildren();
        return;
    }
    els.source.hidden = false;
    els.source.replaceChildren();
    els.source.appendChild(document.createTextNode("from "));
    const a = document.createElement("a");
    a.href = sourceURL;
    a.target = "_blank";
    a.rel = "noopener";
    a.textContent = sourceURL;
    els.source.appendChild(a);
    els.source.title = sourceURL;
}

async function init() {
    renderSourceDisplay();
    const res = await fetch(sourceURL, { cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    state.data = await res.json();
    for (const c of state.data.categories) state.categoriesById.set(c.id, c);
    for (const n of state.data.components) state.componentsById.set(n.id, n);

    renderLegend();
    renderNodes();
    renderFlowList();
    setupPicker();
    setupHoverLinking();
    requestAnimationFrame(() => renderEdges());

    let resizeTimer = null;
    window.addEventListener("resize", () => {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(() => {
            renderEdges();
            applyActiveHighlight();
        }, 80);
    });
}

function renderLegend() {
    const frag = document.createDocumentFragment();
    for (const c of state.data.categories) {
        const li = document.createElement("li");
        li.innerHTML = `<span class="swatch" style="--swatch:${c.color}"></span>${escapeHtml(c.label)}`;
        frag.appendChild(li);
    }
    els.legend.replaceChildren(frag);
}

function renderNodes() {
    const frag = document.createDocumentFragment();
    state.nodeEls.clear();
    for (const c of state.data.components) {
        const cat = state.categoriesById.get(c.category);
        const div = document.createElement("div");
        div.className = "node";
        div.dataset.id = c.id;
        div.dataset.category = c.category;
        div.style.gridColumn = String(c.col + 1);
        div.style.gridRow = String(c.row + 1);
        if (cat) div.style.setProperty("--node-color", cat.color);
        div.innerHTML = `
            <span class="node-label">${escapeHtml(c.label)}</span>
            ${cat ? `<span class="node-meta">${escapeHtml(cat.label)}</span>` : ""}
        `;
        frag.appendChild(div);
        state.nodeEls.set(c.id, div);
    }
    els.nodes.replaceChildren(frag);
}

function renderFlowList() {
    const filter = (els.flowFilter?.value || "").trim().toLowerCase();
    const frag = document.createDocumentFragment();
    let shown = 0;
    for (const f of state.data.flows) {
        if (filter) {
            const haystack = `${f.title} ${f.summary || ""}`.toLowerCase();
            if (!haystack.includes(filter)) continue;
        }
        shown++;
        const li = document.createElement("li");
        const btn = document.createElement("button");
        btn.type = "button";
        btn.dataset.flow = f.id;
        btn.setAttribute("aria-pressed", state.activeFlowId === f.id ? "true" : "false");
        btn.innerHTML = `
            <span class="flow-title">${escapeHtml(f.title)}</span>
            <span class="flow-summary-line">${escapeHtml(f.summary || "")}</span>
        `;
        btn.addEventListener("click", () => selectFlow(f.id));
        li.appendChild(btn);
        frag.appendChild(li);
    }
    els.flowList.replaceChildren(frag);
    if (els.flowEmpty) els.flowEmpty.hidden = shown !== 0;
}

function renderEdges() {
    const canvasRect = els.nodes.getBoundingClientRect();
    els.edges.setAttribute("viewBox", `0 0 ${canvasRect.width} ${canvasRect.height}`);
    els.edges.setAttribute("width", canvasRect.width);
    els.edges.setAttribute("height", canvasRect.height);
    els.edges.style.width = `${canvasRect.width}px`;
    els.edges.style.height = `${canvasRect.height}px`;

    state.edgeEls.clear();
    while (els.edges.firstChild) els.edges.removeChild(els.edges.firstChild);

    const seen = new Set();
    const uniqueEdges = [];
    for (const f of state.data.flows) {
        for (const s of f.steps) {
            const key = `${s.from}->${s.to}`;
            if (!seen.has(key)) {
                seen.add(key);
                uniqueEdges.push({ key, from: s.from, to: s.to });
            }
        }
    }

    for (const edge of uniqueEdges) {
        const a = state.nodeEls.get(edge.from);
        const b = state.nodeEls.get(edge.to);
        if (!a || !b) continue;
        const segs = computeSegment(a, b, canvasRect);
        if (!segs) continue;

        const line = document.createElementNS(SVG_NS, "path");
        line.classList.add("edge");
        line.dataset.edge = edge.key;
        line.setAttribute("d", `M ${segs.x1} ${segs.y1} L ${segs.x2} ${segs.y2}`);

        const head = document.createElementNS(SVG_NS, "path");
        head.classList.add("edge", "arrow-head");
        head.dataset.edge = edge.key;
        head.setAttribute("d", arrowHeadPath(segs));

        els.edges.appendChild(line);
        els.edges.appendChild(head);
        state.edgeEls.set(edge.key, { line, head, segs });
    }
}

function computeSegment(aEl, bEl, originRect) {
    const a = aEl.getBoundingClientRect();
    const b = bEl.getBoundingClientRect();
    const ax = a.left + a.width / 2 - originRect.left;
    const ay = a.top + a.height / 2 - originRect.top;
    const bx = b.left + b.width / 2 - originRect.left;
    const by = b.top + b.height / 2 - originRect.top;
    const start = clipToRect(a, originRect, ax, ay, bx, by);
    const end = clipToRect(b, originRect, bx, by, ax, ay);
    if (!start || !end) return null;
    return { x1: start.x, y1: start.y, x2: end.x, y2: end.y };
}

function clipToRect(rect, originRect, cx, cy, tx, ty) {
    const left = rect.left - originRect.left;
    const top = rect.top - originRect.top;
    const right = left + rect.width;
    const bottom = top + rect.height;
    const dx = tx - cx;
    const dy = ty - cy;
    if (dx === 0 && dy === 0) return { x: cx, y: cy };
    const candidates = [];
    if (dx !== 0) {
        const tLeft = (left - cx) / dx;
        const tRight = (right - cx) / dx;
        if (tLeft > 0) candidates.push({ t: tLeft, x: left, y: cy + tLeft * dy });
        if (tRight > 0) candidates.push({ t: tRight, x: right, y: cy + tRight * dy });
    }
    if (dy !== 0) {
        const tTop = (top - cy) / dy;
        const tBot = (bottom - cy) / dy;
        if (tTop > 0) candidates.push({ t: tTop, x: cx + tTop * dx, y: top });
        if (tBot > 0) candidates.push({ t: tBot, x: cx + tBot * dx, y: bottom });
    }
    const inRect = candidates.filter((p) => p.x >= left - 0.5 && p.x <= right + 0.5 && p.y >= top - 0.5 && p.y <= bottom + 0.5);
    if (inRect.length === 0) return null;
    inRect.sort((a, b) => a.t - b.t);
    return { x: inRect[0].x, y: inRect[0].y };
}

function arrowHeadPath(segs) {
    const headLen = 8;
    const headWidth = 6;
    const dx = segs.x2 - segs.x1;
    const dy = segs.y2 - segs.y1;
    const len = Math.hypot(dx, dy) || 1;
    const ux = dx / len;
    const uy = dy / len;
    const tipX = segs.x2;
    const tipY = segs.y2;
    const baseX = tipX - ux * headLen;
    const baseY = tipY - uy * headLen;
    const nx = -uy;
    const ny = ux;
    const leftX = baseX + nx * (headWidth / 2);
    const leftY = baseY + ny * (headWidth / 2);
    const rightX = baseX - nx * (headWidth / 2);
    const rightY = baseY - ny * (headWidth / 2);
    return `M ${tipX} ${tipY} L ${leftX} ${leftY} L ${rightX} ${rightY} Z`;
}

function selectFlow(flowId) {
    state.activeFlowId = state.activeFlowId === flowId ? null : flowId;
    for (const btn of els.flowList.querySelectorAll("button")) {
        btn.setAttribute("aria-pressed", btn.dataset.flow === state.activeFlowId ? "true" : "false");
    }
    updatePickerLabel();
    closePicker();
    applyActiveHighlight();
    renderSteps();
}

function scrollEdgeIntoView(key) {
    const edge = state.edgeEls.get(key);
    if (!edge || !els.canvasPane) return;

    const arrowIdx = key.indexOf("->");
    const fromId = arrowIdx >= 0 ? key.slice(0, arrowIdx) : null;
    const toId = arrowIdx >= 0 ? key.slice(arrowIdx + 2) : null;
    const fromEl = fromId ? state.nodeEls.get(fromId) : null;
    const toEl = toId ? state.nodeEls.get(toId) : null;

    const paneRect = els.canvasPane.getBoundingClientRect();
    const margin = 24;
    const paneInnerWidth = paneRect.width - margin * 2;
    const paneInnerHeight = paneRect.height - margin * 2;

    const lineRect = edge.line.getBoundingClientRect();
    const target = pickScrollTarget(
        [fromEl, edge.line, toEl].filter(Boolean).map((el) => el.getBoundingClientRect()),
        lineRect,
        paneInnerWidth,
        paneInnerHeight,
    );

    const dx = computeScrollDelta(target.left, target.right, paneRect.left + margin, paneRect.right - margin, target.width, paneInnerWidth);
    const dy = computeScrollDelta(target.top, target.bottom, paneRect.top + margin, paneRect.bottom - margin, target.height, paneInnerHeight);

    if (dx === 0 && dy === 0) return;
    els.canvasPane.scrollBy({ left: dx, top: dy, behavior: "smooth" });
}

function pickScrollTarget(rects, fallback, paneInnerWidth, paneInnerHeight) {
    const union = unionRects(rects);
    if (union.width <= paneInnerWidth && union.height <= paneInnerHeight) return union;
    if (fallback.width <= paneInnerWidth && fallback.height <= paneInnerHeight) return fallback;
    return fallback;
}

function scrollStepIntoView(li) {
    if (!els.railBody || !li) return;
    const paneRect = els.railBody.getBoundingClientRect();
    const itemRect = li.getBoundingClientRect();
    const margin = 8;
    const paneInnerHeight = paneRect.height - margin * 2;
    const dy = computeScrollDelta(
        itemRect.top,
        itemRect.bottom,
        paneRect.top + margin,
        paneRect.bottom - margin,
        itemRect.height,
        paneInnerHeight,
    );
    if (dy === 0) return;
    els.railBody.scrollBy({ top: dy, behavior: "smooth" });
}

function unionRects(rects) {
    let l = Infinity;
    let t = Infinity;
    let r = -Infinity;
    let b = -Infinity;
    for (const rect of rects) {
        if (rect.left < l) l = rect.left;
        if (rect.top < t) t = rect.top;
        if (rect.right > r) r = rect.right;
        if (rect.bottom > b) b = rect.bottom;
    }
    return { left: l, top: t, right: r, bottom: b, width: r - l, height: b - t };
}

function computeScrollDelta(targetStart, targetEnd, paneStart, paneEnd, targetSize, paneInnerSize) {
    if (targetSize <= paneInnerSize) {
        const overflowStart = paneStart - targetStart;
        const overflowEnd = targetEnd - paneEnd;
        if (overflowStart > 0) return -overflowStart;
        if (overflowEnd > 0) return overflowEnd;
        return 0;
    }
    const targetCenter = (targetStart + targetEnd) / 2;
    const paneCenter = (paneStart + paneEnd) / 2;
    return targetCenter - paneCenter;
}

function setupHoverLinking() {
    els.stepList.addEventListener("mouseover", (event) => {
        const li = event.target.closest("li[data-step-index]");
        if (!li) return;
        setHoverStep(Number(li.dataset.stepIndex));
    });
    els.stepList.addEventListener("mouseleave", () => setHoverStep(null));

    els.edges.addEventListener("mouseover", (event) => {
        const t = event.target;
        const edgeKey =
            (t.dataset && t.dataset.edge) ||
            (t.closest && t.closest("[data-edge]") && t.closest("[data-edge]").dataset.edge);
        if (!edgeKey) return;
        setHoverEdge(edgeKey);
    });
    els.edges.addEventListener("mouseout", (event) => {
        // Only clear when we leave the SVG entirely or move to something with no edge key.
        const next = event.relatedTarget;
        if (next && (next.dataset?.edge || next.closest?.("[data-edge]"))) return;
        setHoverEdge(null);
    });
}

function setupPicker() {
    if (!els.picker || !els.pickerTrigger) return;
    updatePickerLabel();

    let suppressHoverOpen = false;

    els.pickerTrigger.addEventListener("click", () => {
        const isOpen = els.picker.dataset.open === "true";
        if (isOpen) {
            closePicker();
            suppressHoverOpen = true;
        } else {
            openPicker();
            focusFilter();
        }
    });

    els.picker.addEventListener("mouseenter", () => {
        if (suppressHoverOpen) return;
        const wasOpen = els.picker.dataset.open === "true";
        openPicker();
        if (!wasOpen) focusFilter();
    });

    els.picker.addEventListener("mouseleave", () => {
        suppressHoverOpen = false;
        closePicker();
    });

    els.picker.addEventListener("focusin", () => openPicker());
    els.picker.addEventListener("focusout", (event) => {
        if (!els.picker.contains(event.relatedTarget)) closePicker();
    });

    document.addEventListener("click", (event) => {
        if (!els.picker.contains(event.target)) closePicker();
    });

    document.addEventListener("keydown", (event) => {
        if (event.key === "Escape") {
            closePicker();
            els.pickerTrigger.focus();
        }
    });

    // After selecting a flow we close and want to ignore the hover that keeps the cursor inside the picker.
    els.flowList.addEventListener("click", () => {
        suppressHoverOpen = true;
    });

    if (els.flowFilter) {
        els.flowFilter.addEventListener("input", () => renderFlowList());
        els.flowFilter.addEventListener("keydown", (event) => {
            if (event.key === "Enter") {
                const firstBtn = els.flowList.querySelector("button[data-flow]");
                if (firstBtn) {
                    event.preventDefault();
                    suppressHoverOpen = true;
                    firstBtn.click();
                }
            }
        });
    }
}

function focusFilter() {
    if (!els.flowFilter) return;
    requestAnimationFrame(() => {
        els.flowFilter.focus();
        els.flowFilter.select();
    });
}

function openPicker() {
    els.picker.dataset.open = "true";
    els.pickerTrigger.setAttribute("aria-expanded", "true");
}

function closePicker() {
    if (!els.picker) return;
    delete els.picker.dataset.open;
    els.pickerTrigger.setAttribute("aria-expanded", "false");
    if (els.flowFilter && els.flowFilter.value) {
        els.flowFilter.value = "";
        renderFlowList();
    }
}

function updatePickerLabel() {
    if (!els.pickerCurrent) return;
    const flow = state.data.flows.find((f) => f.id === state.activeFlowId);
    els.pickerCurrent.textContent = flow ? flow.title : "Choose a flow…";
}

function applyActiveHighlight() {
    clearActiveDecorations();
    const flow = state.data.flows.find((f) => f.id === state.activeFlowId);
    if (!flow) {
        els.canvas.removeAttribute("data-active-flow");
        return;
    }
    els.canvas.setAttribute("data-active-flow", flow.id);

    const involved = new Set();
    const edgeStepCounts = new Map();
    flow.steps.forEach((s, idx) => {
        involved.add(s.from);
        involved.add(s.to);
        const key = `${s.from}->${s.to}`;
        if (!edgeStepCounts.has(key)) edgeStepCounts.set(key, []);
        edgeStepCounts.get(key).push(idx + 1);
    });

    for (const id of involved) {
        const el = state.nodeEls.get(id);
        if (el) el.dataset.inFlow = "true";
    }
    for (const [key, stepNumbers] of edgeStepCounts) {
        const edge = state.edgeEls.get(key);
        if (!edge) continue;
        edge.line.dataset.inFlow = "true";
        edge.head.dataset.inFlow = "true";
        addEdgeHit(key, edge.segs);
        addStepBadges(key, edge.segs, stepNumbers);
    }
}

function addEdgeHit(key, segs) {
    const hit = document.createElementNS(SVG_NS, "path");
    hit.classList.add("edge-hit");
    hit.dataset.edge = key;
    hit.setAttribute("d", `M ${segs.x1} ${segs.y1} L ${segs.x2} ${segs.y2}`);
    els.edges.appendChild(hit);
}

function addStepBadges(key, segs, stepNumbers) {
    const total = stepNumbers.length;
    stepNumbers.forEach((stepNum, i) => {
        const t = total === 1 ? 0.5 : 0.32 + (i * 0.36) / Math.max(total - 1, 1);
        const x = segs.x1 + (segs.x2 - segs.x1) * t;
        const y = segs.y1 + (segs.y2 - segs.y1) * t;
        const g = document.createElementNS(SVG_NS, "g");
        g.classList.add("step-badge");
        g.dataset.edge = key;
        g.dataset.stepIndex = String(stepNum);
        const r = 10;
        const c = document.createElementNS(SVG_NS, "circle");
        c.setAttribute("cx", x);
        c.setAttribute("cy", y);
        c.setAttribute("r", r);
        const t2 = document.createElementNS(SVG_NS, "text");
        t2.setAttribute("x", x);
        t2.setAttribute("y", y);
        t2.textContent = String(stepNum);
        g.appendChild(c);
        g.appendChild(t2);
        els.edges.appendChild(g);
    });
}

function clearActiveDecorations() {
    for (const el of state.nodeEls.values()) {
        delete el.dataset.inFlow;
        delete el.dataset.hover;
    }
    for (const e of state.edgeEls.values()) {
        delete e.line.dataset.inFlow;
        delete e.head.dataset.inFlow;
        delete e.line.dataset.hover;
        delete e.head.dataset.hover;
    }
    for (const ext of [...els.edges.querySelectorAll(".step-badge, .edge-hit")]) ext.remove();
}

function setHoverEdge(key, options = {}) {
    if (!key) {
        for (const e of state.edgeEls.values()) {
            delete e.line.dataset.hover;
            delete e.head.dataset.hover;
        }
        for (const b of els.edges.querySelectorAll(".step-badge")) delete b.dataset.hover;
        for (const li of els.stepList.querySelectorAll("li")) delete li.dataset.hover;
        return;
    }
    for (const [k, e] of state.edgeEls) {
        const on = k === key;
        if (on) {
            e.line.dataset.hover = "true";
            e.head.dataset.hover = "true";
        } else {
            delete e.line.dataset.hover;
            delete e.head.dataset.hover;
        }
    }
    for (const b of els.edges.querySelectorAll(".step-badge")) {
        if (b.dataset.edge === key) b.dataset.hover = "true";
        else delete b.dataset.hover;
    }
    let firstMatch = null;
    for (const li of els.stepList.querySelectorAll("li")) {
        if (li.dataset.edgeKey === key) {
            li.dataset.hover = "true";
            if (!firstMatch) firstMatch = li;
        } else {
            delete li.dataset.hover;
        }
    }
    if (firstMatch && !options.skipStepScroll) scrollStepIntoView(firstMatch);
}

function setHoverStep(stepIndex, options = {}) {
    if (stepIndex == null) {
        setHoverEdge(null);
        return;
    }
    const flow = state.data.flows.find((f) => f.id === state.activeFlowId);
    if (!flow) return;
    const step = flow.steps[stepIndex - 1];
    if (!step) return;
    const key = `${step.from}->${step.to}`;
    setHoverEdge(key, { skipStepScroll: !options.scrollStepList });
    scrollEdgeIntoView(key);
    // Narrow badge highlight to just this step within the edge.
    for (const b of els.edges.querySelectorAll(".step-badge")) {
        const isThis = b.dataset.edge === key && b.dataset.stepIndex === String(stepIndex);
        if (isThis) b.dataset.hover = "true";
        else if (b.dataset.edge === key) b.dataset.hover = "dim";
        else delete b.dataset.hover;
    }
    for (const li of els.stepList.querySelectorAll("li")) {
        if (Number(li.dataset.stepIndex) === stepIndex) li.dataset.hover = "true";
        else delete li.dataset.hover;
    }
}

function renderSteps() {
    const flow = state.data.flows.find((f) => f.id === state.activeFlowId);
    if (!flow) {
        els.stepList.replaceChildren();
        els.flowSummary.hidden = true;
        els.flowSummary.textContent = "";
        els.stepEmpty.hidden = false;
        return;
    }
    els.flowSummary.hidden = false;
    els.flowSummary.innerHTML = `<strong>${escapeHtml(flow.title)}</strong>${escapeHtml(flow.summary || "")}`;
    const frag = document.createDocumentFragment();
    flow.steps.forEach((s, i) => {
        const li = document.createElement("li");
        li.dataset.stepIndex = String(i + 1);
        li.dataset.edgeKey = `${s.from}->${s.to}`;
        const fromLabel = labelFor(s.from);
        const toLabel = labelFor(s.to);
        li.innerHTML = `
            <div>
                <span class="hop">${escapeHtml(fromLabel)} &rarr; ${escapeHtml(toLabel)}</span>
                <span class="note">${escapeHtml(s.note)}</span>
            </div>
        `;
        frag.appendChild(li);
    });
    els.stepList.replaceChildren(frag);
    els.stepEmpty.hidden = true;
}

function labelFor(id) {
    const c = state.componentsById.get(id);
    return c ? c.label : id;
}

function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]);
}
