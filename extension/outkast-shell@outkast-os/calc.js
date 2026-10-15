// Calcolatore per la palette: un piccolo parser a discesa ricorsiva, senza eval().
// Numeri (anche con virgola decimale), + - * / % ^ **, parentesi, meno unario, costanti e funzioni.
// Non importa nulla di GNOME: si prova da solo con gjs.

const FUNCS = {
    sqrt: Math.sqrt, abs: Math.abs, round: Math.round, floor: Math.floor, ceil: Math.ceil,
    sin: Math.sin, cos: Math.cos, tan: Math.tan, asin: Math.asin, acos: Math.acos, atan: Math.atan,
    ln: Math.log, log: Math.log10, exp: Math.exp,
};
const CONSTS = {pi: Math.PI, e: Math.E};

function tokenize(src) {
    const tokens = [];
    const re = /\s*(?:(\d+(?:[.,]\d+)?|[.,]\d+)|(\*\*|[-+*/%^()×÷])|([a-zA-Zπ]+))/y;
    let m;
    let last = 0;
    while (last < src.length) {
        re.lastIndex = last;
        m = re.exec(src);
        if (!m) {
            if (/^\s*$/.test(src.slice(last)))
                break;
            return null;
        }
        last = re.lastIndex;
        if (m[1] !== undefined) tokens.push({t: 'n', v: parseFloat(m[1].replace(',', '.'))});
        else if (m[2] !== undefined) tokens.push({t: 'o', v: m[2] === '×' ? '*' : m[2] === '÷' ? '/' : m[2] === '**' ? '^' : m[2]});
        else tokens.push({t: 'i', v: m[3] === 'π' ? 'pi' : m[3].toLowerCase()});
    }
    return tokens;
}

/** Valuta un'espressione. Ritorna un numero finito, oppure null se non è un'espressione valida. */
export function evaluate(src) {
    const tokens = tokenize(src);
    if (!tokens || tokens.length === 0)
        return null;
    let i = 0;
    const peek = () => tokens[i];
    const eat = v => (peek()?.t === 'o' && peek().v === v) ? (i++, true) : false;

    const fail = () => { throw new SyntaxError('espressione non valida'); };

    function expr() {
        let v = term();
        for (;;) {
            if (eat('+')) v += term();
            else if (eat('-')) v -= term();
            else return v;
        }
    }
    function term() {
        let v = unary();
        for (;;) {
            if (eat('*')) v *= unary();
            else if (eat('/')) v /= unary();
            else if (eat('%')) v %= unary();
            else if (peek() && (peek().t === 'n' || peek().t === 'i' || (peek().t === 'o' && peek().v === '(')))
                v *= power();                  // moltiplicazione implicita: 2pi, 3(4+1)
            else return v;
        }
    }
    function unary() {
        if (eat('-')) return -unary();
        if (eat('+')) return unary();
        return power();
    }
    function power() {
        const base = atom();
        return eat('^') ? Math.pow(base, unary()) : base;      // associativa a destra
    }
    function atom() {
        const tk = peek();
        if (!tk) fail();
        if (tk.t === 'n') { i++; return tk.v; }
        if (tk.t === 'i') {
            i++;
            if (tk.v in CONSTS) return CONSTS[tk.v];
            if (tk.v in FUNCS) {
                if (!eat('(')) fail();
                const arg = expr();
                if (!eat(')')) fail();
                return FUNCS[tk.v](arg);
            }
            fail();
        }
        if (eat('(')) {
            const v = expr();
            if (!eat(')')) fail();
            return v;
        }
        return fail();
    }

    try {
        const v = expr();
        if (i !== tokens.length || !Number.isFinite(v))
            return null;
        return v;
    } catch (e) {
        return null;
    }
}

/** Numero → testo leggibile (al massimo 12 cifre significative, senza zeri inutili). */
export function format(v) {
    if (Number.isInteger(v) && Math.abs(v) < 1e15)
        return String(v);
    const s = Number(v.toPrecision(12)).toString();
    return s;
}

/** Ha l'aspetto di un calcolo? Serve per mostrarlo anche senza il prefisso "=". */
export function looksLikeMath(src) {
    return /[\d)]/.test(src) && /[-+*/%^×÷(]/.test(src) && /^[\d\s.,+\-*/%^()×÷a-zA-Zπ]+$/.test(src) && evaluate(src) !== null;
}
