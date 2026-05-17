// Quantity rendering and unit conversion fallback.
//
// Rendering policy (v1):
//   - Volume amounts are shown as fractions where they fall cleanly on
//     halves, thirds, quarters, or eighths (the kitchen-friendly denominators).
//     Other values fall back to a 2-decimal number.
//   - Weight amounts are shown as whole numbers (g) or one decimal (kg/oz).
//
// Unit toggle (v1):
//   - Each ingredient declares whichever of volume/weight it has authored.
//   - The global toggle picks 'volume' or 'weight'. If the ingredient lacks
//     that system but has the other, we fall back to the other and mark it.
//   - A small density table covers a handful of pantry staples so we can
//     synthesize a "≈" weight from a volume (or vice versa) when only one
//     system is authored.

const FRACTION_GLYPHS = {
    '1/2': '½',
    '1/3': '⅓',
    '2/3': '⅔',
    '1/4': '¼',
    '3/4': '¾',
    '1/8': '⅛',
    '3/8': '⅜',
    '5/8': '⅝',
    '7/8': '⅞',
};

const DENOMINATORS = [2, 3, 4, 8];

// Densities for the volume-→weight fallback. Keys match ingredient.id or
// ingredient.name (lowercased) substrings. Values are g per cup, the most
// common authoring unit.
//
// Deliberately small. We only want to handle the staples; anything exotic
// should be authored with both fields.
const DENSITY_G_PER_CUP = {
    flour: 130,
    'all-purpose flour': 130,
    sugar: 200,
    'granulated sugar': 200,
    'brown sugar': 213,
    'powdered sugar': 120,
    water: 237,
    milk: 245,
    butter: 227,
    oil: 218,
    'olive oil': 216,
    salt: 273,
    'fine salt': 273,
};

// ml per 1 unit, used to canonicalize volume amounts before applying density.
const VOLUME_TO_ML = {
    cup: 236.6,
    tbsp: 14.787,
    tsp: 4.929,
    ml: 1,
    l: 1000,
    'fl oz': 29.574,
};

export function formatQuantity(ingredient, ratio, system) {
    const scalable = ingredient.scalable !== false;
    const r = scalable ? ratio : 1;
    const q = ingredient.quantities || {};
    const have = {
        volume: q.volume && Number.isFinite(q.volume.amount) ? q.volume : null,
        weight: q.weight && Number.isFinite(q.weight.amount) ? q.weight : null,
    };

    const primary = have[system];
    const other = have[system === 'volume' ? 'weight' : 'volume'];

    if (primary) {
        return {
            text: renderAmount(primary.amount * r, primary.unit),
            unit: primary.unit,
            approx: false,
            fallback: false,
        };
    }
    if (other) {
        // Try a density-based conversion before falling back to the other
        // system verbatim.
        const converted = tryConvert(ingredient, other, system, r);
        if (converted) {
            return { ...converted, approx: true, fallback: false };
        }
        return {
            text: renderAmount(other.amount * r, other.unit),
            unit: other.unit,
            approx: false,
            fallback: true,
        };
    }
    return { text: '', unit: '', approx: false, fallback: false };
}

function tryConvert(ingredient, src, targetSystem, ratio) {
    const density = lookupDensity(ingredient);
    if (!density) return null;
    const ml = (VOLUME_TO_ML[src.unit] || 0) * src.amount;
    if (!ml) return null;

    if (targetSystem === 'weight') {
        const g = (ml / VOLUME_TO_ML.cup) * density * ratio;
        return { text: renderAmount(g, 'g'), unit: 'g' };
    }
    if (targetSystem === 'volume') {
        // density is g per cup; reverse to cups.
        const cups = (src.amount * ratio) / density;
        return { text: renderAmount(cups, 'cup'), unit: 'cup' };
    }
    return null;
}

function lookupDensity(ingredient) {
    const keys = [ingredient.id, (ingredient.name || '').toLowerCase()];
    for (const k of keys) {
        if (!k) continue;
        if (DENSITY_G_PER_CUP[k]) return DENSITY_G_PER_CUP[k];
        for (const dk of Object.keys(DENSITY_G_PER_CUP)) {
            if (k.includes(dk)) return DENSITY_G_PER_CUP[dk];
        }
    }
    return null;
}

function renderAmount(amount, unit) {
    if (!Number.isFinite(amount)) return '';
    const unitLower = (unit || '').toLowerCase();
    const isWeight = unitLower === 'g' || unitLower === 'kg' || unitLower === 'oz' || unitLower === 'lb';

    if (isWeight) {
        if (unitLower === 'g') return `${Math.round(amount)} ${unit}`;
        if (unitLower === 'kg' || unitLower === 'lb') return `${roundTo(amount, 2)} ${unit}`;
        return `${roundTo(amount, 1)} ${unit}`;
    }

    return `${renderFraction(amount)} ${unit}`.trim();
}

function renderFraction(amount) {
    if (amount === 0) return '0';
    if (amount < 0) return `-${renderFraction(-amount)}`;

    const whole = Math.floor(amount);
    const remainder = amount - whole;
    if (remainder < 1e-4) return `${whole}`;

    // Find the nearest clean fraction.
    let best = null;
    let bestErr = Infinity;
    for (const d of DENOMINATORS) {
        const n = Math.round(remainder * d);
        if (n === 0 || n === d) continue;
        const err = Math.abs(remainder - n / d);
        if (err < bestErr) {
            bestErr = err;
            best = { n, d };
        }
    }

    // If the remainder is far from any clean fraction, give up and decimal it.
    if (!best || bestErr > 0.04) {
        return formatDecimal(amount);
    }

    const key = `${best.n}/${best.d}`;
    const glyph = FRACTION_GLYPHS[key] || key;
    return whole > 0 ? `${whole} ${glyph}` : glyph;
}

function formatDecimal(n) {
    return Number.isInteger(n) ? `${n}` : `${roundTo(n, 2)}`;
}

function roundTo(n, places) {
    const f = 10 ** places;
    return Math.round(n * f) / f;
}

export function pluralizeUnit(unit, amount) {
    if (!unit || amount === 1) return unit;
    const lower = unit.toLowerCase();
    if (['tsp', 'tbsp', 'g', 'kg', 'ml', 'l', 'oz', 'lb', 'fl oz'].includes(lower)) return unit;
    if (lower.endsWith('s')) return unit;
    return `${unit}s`;
}
