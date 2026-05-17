// Small hand-curated codepoint -> name table used by the label auto-derive
// fallback. Keys are lowercase hex codepoints without leading zeros (matching
// Number.prototype.toString(16) output). Not exhaustive — anything missing
// falls back to a "U+XXXX" style placeholder.

export const UNICODE_NAMES = {
    // Faces
    '1f600': 'grinning face',
    '1f603': 'smiling face',
    '1f604': 'happy face',
    '1f60a': 'smiling face',
    '1f60d': 'heart eyes',
    '1f618': 'kissing face',
    '1f61c': 'tongue out',
    '1f923': 'rolling on the floor laughing',
    '1f928': 'raised eyebrow',
    '1f929': 'star struck',
    '1f92f': 'mind blown',
    '1f97a': 'pleading face',
    '1f971': 'yawning face',
    '1f644': 'eye roll',
    '1f60e': 'sunglasses',
    '1f914': 'thinking face',
    '1f622': 'crying face',
    '1f62d': 'sobbing',
    '1f621': 'angry face',
    '1f624': 'huffing',
    '1f631': 'screaming',
    '1f634': 'sleeping face',
    '1f973': 'partying face',

    // Hand gestures
    '1f44b': 'waving hand',
    '1f44d': 'thumbs up',
    '1f44e': 'thumbs down',
    '1f44f': 'clapping',
    '1f64c': 'raised hands',
    '1f64f': 'praying hands',
    '270c': 'peace sign',
    '1f91e': 'crossed fingers',
    '1f44c': 'ok hand',
    '1f91d': 'handshake',

    // People / hearts
    '2764': 'red heart',
    '1f9e1': 'orange heart',
    '1f49b': 'yellow heart',
    '1f49a': 'green heart',
    '1f499': 'blue heart',
    '1f49c': 'purple heart',
    '1f5a4': 'black heart',
    '1f494': 'broken heart',
    '1f495': 'two hearts',
    '1f496': 'sparkling heart',

    // Motion / energy
    '1f680': 'rocket',
    '1f525': 'fire',
    '1f4a8': 'dash',
    '1f4a5': 'collision',
    '26a1': 'lightning',
    '2728': 'sparkles',
    '1f4ab': 'dizzy',
    '2b50': 'star',
    '1f31f': 'glowing star',

    // Weather / sky
    '2600': 'sun',
    '1f319': 'moon',
    '2601': 'cloud',
    '1f308': 'rainbow',
    '2744': 'snowflake',
    '2614': 'umbrella with rain',
    '1f30a': 'wave',

    // Plants / nature
    '1f338': 'cherry blossom',
    '1f33a': 'hibiscus',
    '1f33b': 'sunflower',
    '1f339': 'rose',
    '1f340': 'four leaf clover',
    '1f333': 'tree',
    '1f334': 'palm tree',

    // Food
    '1f355': 'pizza',
    '1f354': 'burger',
    '1f32e': 'taco',
    '1f369': 'donut',
    '1f36a': 'cookie',
    '1f353': 'strawberry',
    '1f34c': 'banana',

    // Animals
    '1f436': 'dog',
    '1f431': 'cat',
    '1f43b': 'bear',
    '1f98a': 'fox',
    '1f981': 'lion',
    '1f438': 'frog',
    '1f989': 'owl',
};

// Look up a single codepoint (number) or codepoint sequence (array of numbers)
// and return a human-readable name. For sequences, joins names with " + ".
export function nameForCodepoints(codepoints) {
    const seq = Array.isArray(codepoints) ? codepoints : [codepoints];
    const parts = seq.map((cp) => {
        const key = cp.toString(16);
        if (UNICODE_NAMES[key]) return UNICODE_NAMES[key];
        return `U+${cp.toString(16).toUpperCase().padStart(4, '0')}`;
    });
    return parts.join(' + ');
}
