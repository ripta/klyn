// Emoji picker — lazy-fetches the unicode-emoji-json dataset, renders category
// tabs and a grid, supports search across the full set. Exposes a tiny API
// (init, setSearch) and emits picks through the onPick callback.

const DATA_URL = 'https://cdn.jsdelivr.net/npm/unicode-emoji-json@0.6.0/data-by-group.json';

let _dataPromise = null;
function fetchEmojiData() {
    if (_dataPromise) return _dataPromise;
    _dataPromise = fetch(DATA_URL).then((r) => {
        if (!r.ok) throw new Error(`emoji data: ${r.status}`);
        return r.json();
    });
    return _dataPromise;
}

// Short labels for the category tabs. Order matches the dataset.
const SHORT_NAMES = {
    smileys_emotion: 'Smileys',
    people_body: 'People',
    component: 'Components',
    animals_nature: 'Animals',
    food_drink: 'Food',
    travel_places: 'Travel',
    activities: 'Activities',
    objects: 'Objects',
    symbols: 'Symbols',
    flags: 'Flags',
};

export function createPicker({ tabsEl, gridEl, statusEl, onPick }) {
    let data = null;
    let activeSlug = null;
    let searchQuery = '';
    let flatIndex = null;

    function buildFlatIndex() {
        flatIndex = data.flatMap((g) =>
            g.emojis.map((e) => ({
                emoji: e.emoji,
                name: e.name,
                slug: e.slug,
                searchText: `${e.name.toLowerCase()} ${e.slug}`,
            })),
        );
    }

    async function init() {
        if (statusEl) statusEl.textContent = 'Loading emoji data…';
        try {
            data = await fetchEmojiData();
        } catch (err) {
            if (statusEl) {
                statusEl.textContent = 'Could not load emoji data. Check your network.';
            }
            console.error(err);
            return;
        }
        // Filter out the "component" group which is just skin tones / hair.
        data = data.filter((g) => g.slug !== 'component');
        activeSlug = data[0].slug;
        buildFlatIndex();
        if (statusEl) statusEl.textContent = '';
        renderTabs();
        renderGrid();
    }

    function renderTabs() {
        tabsEl.replaceChildren();
        for (const group of data) {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'category-tab';
            if (group.slug === activeSlug && !searchQuery) {
                btn.classList.add('active');
            }
            btn.textContent = SHORT_NAMES[group.slug] ?? group.name;
            btn.dataset.slug = group.slug;
            btn.addEventListener('click', () => {
                searchQuery = '';
                activeSlug = group.slug;
                const searchInput = document.getElementById('picker-search');
                if (searchInput) searchInput.value = '';
                renderTabs();
                renderGrid();
            });
            tabsEl.appendChild(btn);
        }
    }

    function renderGrid() {
        if (!data) return;
        gridEl.replaceChildren();

        let entries;
        if (searchQuery) {
            const q = searchQuery.toLowerCase().trim();
            entries = flatIndex.filter((e) => e.searchText.includes(q)).slice(0, 600);
        } else {
            const group = data.find((g) => g.slug === activeSlug);
            entries = group ? group.emojis : [];
        }

        if (entries.length === 0) {
            const empty = document.createElement('p');
            empty.className = 'picker-empty';
            empty.textContent = searchQuery ? `No matches for "${searchQuery}".` : 'No emojis here.';
            gridEl.appendChild(empty);
            return;
        }

        const frag = document.createDocumentFragment();
        for (const e of entries) {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'emoji-cell';
            btn.title = e.name;
            btn.textContent = e.emoji;
            btn.addEventListener('click', () => onPick?.(e.emoji));
            frag.appendChild(btn);
        }
        gridEl.appendChild(frag);
    }

    function setSearch(q) {
        searchQuery = q;
        // De-highlight tabs when in search mode.
        renderTabs();
        renderGrid();
    }

    return { init, setSearch };
}
