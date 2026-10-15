// Palette Outkast: la fonte unica dei colori di tutto il progetto (tema Shell, GTK3, GTK4,
// pannello impostazioni, banco di prova).
//
// I valori vengono da app/src/main/kotlin/net/primal/android/theme/colors/Outkast.kt di
// github.com/Lwb89dev/outkast ("OUTKAST Dark" e "OUTKAST Light"). Dove l'app non ha un
// colore per un ruolo di desktop (es. una superficie più scura dello sfondo) è derivato
// dagli stessi grigi caldi e dichiarato come tale qui sotto.
//
// Non importa nulla della Shell: gira in qualunque processo gjs.

/** Grigi e testo: cambiano con lo schema, non con l'accento. */
export const NEUTRALS = {
    dark: {
        bg: '#101114',          // OutkastDarkBackground (mezzanotte)
        view: '#101114',        // fondo di liste e testo: uguale alla finestra, lo staccano i filetti
        sidebar: '#0b0c0f',     // barre laterali: un gradino sotto
        dialog: '#191b20',      // dialoghi e popover: una superficie rialzata
        deep: '#0b0c0f',        // derivato: un gradino sotto lo sfondo (velo, pozzetti)
        sunken: '#14161a',      // surfaceVariantAlt3
        surface: '#191b20',     // OutkastDarkSurface
        raised: '#24262c',      // OutkastDarkSurfaceHigh
        outline: '#34373f',     // OutkastDarkOutline
        line: '#292c32',        // outlineVariant
        fg: '#f2f2f2',          // OutkastDarkText
        fg2: '#a2a5ad',         // OutkastDarkTextMuted
        fg3: '#7d818b',         // onSurfaceVariantAlt3
        fg4: '#62666f',         // onSurfaceVariantAlt4
        red: '#ff6b6b',         // error
        green: '#69d08b',       // successBright
        amber: '#ffb33b',       // zapped
        blue: '#62a8ff',        // bookmarked
        rose: '#ff668f',        // liked
    },
    light: {
        bg: '#f4f2ee',          // OutkastLightBackground (carta)
        view: '#ffffff',        // fondo di liste e testo: bianco su carta
        sidebar: '#eae7e1',
        dialog: '#f4f2ee',
        deep: '#e9e6e0',
        sunken: '#e3dfd8',      // surfaceVariantAlt3
        surface: '#ffffff',
        raised: '#eae7e1',      // OutkastLightSurfaceHigh
        outline: '#d3cec5',     // OutkastLightOutline
        line: '#e1ddd6',        // outlineVariant
        fg: '#191a1d',
        fg2: '#666970',
        fg3: '#7b7e84',
        fg4: '#8f9298',
        red: '#b3261e',
        green: '#247a45',
        amber: '#9a5b00',
        blue: '#1261a6',
        rose: '#b51c52',
    },
};

/**
 * Colori "segnale". L'arancio è il marchio; gli altri sono i colori semantici dell'app
 * (liked, bookmarked, success, tertiary) usati come accento alternativo.
 * `hi` = hover/luce, `lo` = premuto, `on` = testo sopra l'accento, `soft` = fondo tenue.
 */
export const ACCENTS = {
    orange: {
        dark:  {accent: '#ff6238', hi: '#ff7a55', lo: '#d94d2b', on: '#1a0a05', soft: '#4a1d12'},
        light: {accent: '#d94d2b', hi: '#e8613f', lo: '#b83d1f', on: '#ffffff', soft: '#ffdad0'},
    },
    gold: {
        dark:  {accent: '#d0b56a', hi: '#dcc482', lo: '#b09a55', on: '#241b00', soft: '#3d3414'},
        light: {accent: '#6b5a1b', hi: '#7d6a22', lo: '#574814', on: '#ffffff', soft: '#f1e6b9'},
    },
    rose: {
        dark:  {accent: '#ff668f', hi: '#ff82a5', lo: '#d9507a', on: '#2a0510', soft: '#4a1526'},
        light: {accent: '#b51c52', hi: '#c92f66', lo: '#951542', on: '#ffffff', soft: '#ffd9e4'},
    },
    blue: {
        dark:  {accent: '#62a8ff', hi: '#7fb9ff', lo: '#4a8de0', on: '#04152b', soft: '#16304f'},
        light: {accent: '#1261a6', hi: '#1f73bd', lo: '#0d4d86', on: '#ffffff', soft: '#d3e6f8'},
    },
    green: {
        dark:  {accent: '#69d08b', hi: '#84daa0', lo: '#52b073', on: '#05200f', soft: '#173522'},
        light: {accent: '#247a45', hi: '#2f8e54', lo: '#1b6137', on: '#ffffff', soft: '#d7f5df'},
    },
};

export const ACCENT_NAMES = Object.keys(ACCENTS);

/**
 * Palette ANSI a 16 colori per terminali ed editor. Il rosso è l'"error" dell'app (non l'arancio del
 * marchio, che resta per cursore, selezione e prompt); il giallo è il "tertiary" oro, l'ambra è
 * "zapped"; il ciano non esiste nell'app ed è la media tra blu e verde.
 */
export const ANSI = {
    dark: ['#101114', '#ff6b6b', '#69d08b', '#d0b56a', '#62a8ff', '#ff668f', '#65bcc5', '#a2a5ad',
        '#34373f', '#ff8a8a', '#8adfa6', '#ffb33b', '#86bdff', '#ff89a9', '#8fd3d9', '#f2f2f2'],
    light: ['#191a1d', '#b3261e', '#247a45', '#6b5a1b', '#1261a6', '#b51c52', '#1b7a80', '#666970',
        '#8f9298', '#c93a30', '#2f8e54', '#9a5b00', '#1f73bd', '#c92f66', '#2a9097', '#2a2c30'],
};

/** Palette completa (neutri + accento) per uno schema. Restituisce {token: '#rrggbb'}. */
export function palette(scheme = 'dark', accent = 'orange') {
    const a = (ACCENTS[accent] ?? ACCENTS.orange)[scheme === 'light' ? 'light' : 'dark'];
    return {...NEUTRALS[scheme === 'light' ? 'light' : 'dark'], ...a};
}

/** '#rrggbb' → [r, g, b] */
export function rgb(hex) {
    const h = hex.replace('#', '');
    return [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16));
}

/** '#rrggbb' + 0..1 → 'rgba(r, g, b, a)' */
export function rgba(hex, alpha) {
    const [r, g, b] = rgb(hex);
    return `rgba(${r}, ${g}, ${b}, ${Number(alpha.toFixed(3))})`;
}

/** Mescola due colori: t = 0 → a, t = 1 → b. */
export function mix(a, b, t) {
    const [ar, ag, ab] = rgb(a);
    const [br, bg, bb] = rgb(b);
    const c = (x, y) => Math.round(x + (y - x) * t).toString(16).padStart(2, '0');
    return `#${c(ar, br)}${c(ag, bg)}${c(ab, bb)}`;
}
