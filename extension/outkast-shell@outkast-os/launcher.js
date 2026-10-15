// La palette di comandi: prende il posto di Attività. Il tasto Super (o Super+A) la apre al centro,
// un campo di testo, una lista che si restringe mentre scrivi. Si governa tutta da tastiera.
//
//   app        le app installate; Invio apre (o porta in primo piano), Maiusc+Invio apre una nuova finestra
//   finestre   le finestre aperte, dalla più recente; Invio ci salta
//   sistema    blocca, esci, riavvia, spegni, sospendi, tema chiaro/scuro, impostazioni…
//   = …        calcola (anche senza "=" se è chiaramente un'operazione): Invio copia il risultato
//   > …        esegue un comando di shell
//
// Tasti: ↑↓ (anche Ctrl+P/N, Ctrl+J/K) scelgono, Tab avanza, Alt+1…9 attiva la riga n, Ctrl+U svuota, Esc chiude.
// Entra dal basso, come Orbit: è lo stesso gesto delle finestre.

import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Meta from 'gi://Meta';
import Shell from 'gi://Shell';
import St from 'gi://St';
import Pango from 'gi://Pango';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import {ensureActorVisibleInScrollView} from 'resource:///org/gnome/shell/misc/animationUtils.js';

import {palette} from './palette.js';
import {evaluate, format, looksLikeMath} from './calc.js';
import {spawn, systemActions} from './actions.js';

const WIDTH = 680;
const ROWS_MAX_H = 392;
const LIMITS = {app: 7, window: 5, system: 5};

// ── Ricerca "fuzzy" ──────────────────────────────────────────────────────────

/** Minuscolo senza accenti, carattere per carattere (così gli indici corrispondono al testo originale). */
const fold = s => Array.from(s, c => c.normalize('NFD')[0].toLowerCase()).join('');
const isBoundary = ch => ch === undefined || /[\s\-_./:()]/.test(ch);

/**
 * Quanto `text` corrisponde a `q` (già in `fold`). Ritorna {score, idx} o null.
 * Prefisso di parola > sottostringa > lettere in ordine sparse.
 */
function fuzzy(q, text) {
    if (!q)
        return {score: 0, idx: []};
    const t = fold(text);
    const pos = t.indexOf(q);
    if (pos >= 0) {
        let score = 1000 - pos * 4 - (t.length - q.length);
        if (isBoundary(t[pos - 1]))
            score += pos === 0 ? 600 : 350;
        return {score, idx: Array.from({length: q.length}, (_v, k) => pos + k)};
    }
    // lettere in ordine, preferendo quelle a inizio parola
    const idx = [];
    let from = 0, gaps = 0, bonus = 0;
    for (const c of q) {
        let found = -1;
        for (let k = from; k < t.length; k++) {
            if (t[k] === c) { found = k; break; }
        }
        if (found < 0)
            return null;
        if (idx.length && found !== idx[idx.length - 1] + 1)
            gaps++;
        if (isBoundary(t[found - 1]))
            bonus += 25;
        idx.push(found);
        from = found + 1;
    }
    if (q.length < 2)
        return null;
    return {score: 300 - gaps * 25 - idx[0] * 3 + bonus, idx};
}

// ── La palette ───────────────────────────────────────────────────────────────

export class Launcher {
    constructor(ext) {
        this._ext = ext;
        this._settings = ext.settings;
        this._appSystem = Shell.AppSystem.get_default();
        this._tracker = Shell.WindowTracker.get_default();
        this._visible = false;
        this._closing = false;
        this._grab = null;
        this._actor = null;
        this._items = [];           // risultati correnti, nell'ordine in cui compaiono
        this._rows = [];
        this._sel = 0;
    }

    get visible() {
        return this._visible;
    }

    toggle() {
        if (this._visible)
            this.hide();
        else
            this.show();
    }

    destroy() {
        this._teardown();
    }

    _ms(base) {
        return Math.max(1, Math.round(base * 100 / this._settings.get_int('motion-speed')));
    }

    // ── Apertura / chiusura ──────────────────────────────────────────────────

    show(initial = '') {
        if (this._visible)
            return;
        const mon = Main.layoutManager.currentMonitor ?? Main.layoutManager.primaryMonitor;
        this._build(mon);
        Main.uiGroup.add_child(this._actor);

        this._grab = Main.pushModal(this._actor, {actionMode: Shell.ActionMode.POPUP});
        if (!this._grab) {
            this._actor.destroy();
            this._actor = null;
            return;
        }
        this._visible = true;
        this._closing = false;
        this._entry.grab_key_focus();
        this._entry.set_text(initial);
        this._refresh();

        // dal basso: lo stesso verso con cui entrano le finestre vicine al bordo inferiore
        this._scrim.opacity = 0;
        this._box.set({opacity: 0, translation_y: 30});
        this._scrim.ease({opacity: 255, duration: this._ms(180), mode: Clutter.AnimationMode.EASE_OUT_QUAD});
        this._box.ease({
            opacity: 255, translation_y: 0,
            duration: this._ms(260), mode: Clutter.AnimationMode.EASE_OUT_EXPO,
        });
    }

    hide(then = null) {
        if (!this._visible || this._closing) {
            then?.();
            return;
        }
        this._closing = true;
        if (this._grab) {
            Main.popModal(this._grab);
            this._grab = null;
        }
        // il fuoco torna subito all'app: l'azione scelta parte mentre la palette sparisce
        then?.();
        this._scrim.ease({opacity: 0, duration: this._ms(140), mode: Clutter.AnimationMode.EASE_IN_QUAD});
        this._box.ease({
            opacity: 0, translation_y: 18,
            duration: this._ms(140), mode: Clutter.AnimationMode.EASE_IN_QUAD,
            onStopped: () => this._teardown(),
        });
    }

    _teardown() {
        if (this._grab) {
            Main.popModal(this._grab);
            this._grab = null;
        }
        if (this._actor) {
            this._actor.destroy();
            this._actor = null;
        }
        this._rows = [];
        this._items = [];
        this._visible = false;
        this._closing = false;
    }

    // ── Costruzione ──────────────────────────────────────────────────────────

    _build(mon) {
        this._pal = palette('dark', this._settings.get_string('accent'));

        this._actor = new St.Widget({
            name: 'outkast-launcher',
            reactive: true,
            x: mon.x, y: mon.y, width: mon.width, height: mon.height,
        });
        this._scrim = new St.Widget({style_class: 'outkast-scrim', reactive: true, width: mon.width, height: mon.height});
        this._scrim.set_style(`background-color: rgba(11, 12, 15, ${(this._settings.get_int('launcher-dim') / 100).toFixed(2)});`);
        this._actor.add_child(this._scrim);

        const w = Math.min(WIDTH, Math.round(mon.width * 0.92));
        this._box = new St.BoxLayout({
            style_class: 'outkast-palette',
            vertical: true,
            width: w,
            reactive: true,
        });
        this._actor.add_child(this._box);
        this._box.set_position(Math.round((mon.width - w) / 2), Math.round(mon.height * 0.15));

        const top = new St.BoxLayout({style_class: 'outkast-palette-top'});
        top.add_child(new St.Label({style_class: 'outkast-palette-prompt', text: '›', y_align: Clutter.ActorAlign.CENTER}));
        this._entry = new St.Entry({
            style_class: 'outkast-palette-entry',
            hint_text: 'cerca app, finestre, comandi',
            can_focus: true,
            x_expand: true,
            y_align: Clutter.ActorAlign.CENTER,
        });
        top.add_child(this._entry);
        top.add_child(new St.Label({style_class: 'outkast-palette-hint', text: 'esc', y_align: Clutter.ActorAlign.CENTER}));
        this._box.add_child(top);

        this._scroll = new St.ScrollView({
            hscrollbar_policy: St.PolicyType.NEVER,
            vscrollbar_policy: St.PolicyType.AUTOMATIC,
            overlay_scrollbars: true,
        });
        this._scroll.set_style(`max-height: ${ROWS_MAX_H}px;`);
        this._list = new St.BoxLayout({vertical: true});
        this._scroll.add_child(this._list);
        this._box.add_child(this._scroll);

        const foot = new St.BoxLayout({style_class: 'outkast-palette-foot'});
        for (const hint of ['↑↓ scegli', '↵ apri', 'esc chiudi', '> comando', '= calcola'])
            foot.add_child(new St.Label({text: hint}));
        this._box.add_child(foot);

        this._entry.clutter_text.connect('text-changed', () => this._refresh());
        this._actor.connect('captured-event', (_a, ev) => {
            if (ev.type() === Clutter.EventType.KEY_PRESS)
                return this._onKey(ev);
            return Clutter.EVENT_PROPAGATE;
        });
        this._scrim.connect('button-press-event', () => { this.hide(); return Clutter.EVENT_STOP; });

        // se un'altra finestra prende il fuoco (altro schermo, gesto) la palette si chiude
        global.display.connectObject('notify::focus-window', () => {
            if (this._visible && global.display.focus_window)
                this.hide();
        }, this._actor);
    }

    // ── Ricerca ──────────────────────────────────────────────────────────────

    _apps() {
        const usage = Shell.AppUsage.get_default();
        return this._appSystem.get_installed()
            .filter(info => info.should_show())
            .map(info => this._appSystem.lookup_app(info.get_id()))
            .filter(app => app)
            .sort((a, b) => usage.compare(a.get_id(), b.get_id()) || a.get_name().localeCompare(b.get_name()));
    }

    _windows() {
        return global.display.get_tab_list(Meta.TabList.NORMAL, null)
            .filter(w => !w.skip_taskbar && !w.is_override_redirect());
    }

    _appItem(app, match) {
        return {
            kind: 'app', title: app.get_name(), idx: match?.idx ?? [],
            desc: app.get_description() ?? '', meta: app.state === Shell.AppState.RUNNING ? 'aperta' : '',
            gicon: app.get_icon(),
            run: ev => {
                if (ev?.shift)
                    app.open_new_window(-1);
                else
                    app.activate();
            },
        };
    }

    _windowItem(win, match) {
        const app = this._tracker.get_window_app(win);
        const title = win.get_title() || app?.get_name() || '—';
        const ws = win.get_workspace()?.index();
        return {
            kind: 'window', title, idx: match?.idx ?? [],
            desc: app && app.get_name() !== title ? app.get_name() : '',
            meta: ws !== undefined && !win.is_on_all_workspaces() ? `ws ${ws + 1}` : '',
            gicon: app?.get_icon(),
            run: () => Main.activateWindow(win),
        };
    }

    /** Costruisce l'elenco dei risultati per il testo scritto. Ogni gruppo: {label, items}. */
    _search(text) {
        const groups = [];
        const raw = text.trim();

        // comando di shell
        if (raw.startsWith('>')) {
            const cmd = raw.slice(1).trim();
            groups.push({label: 'comando', items: [{
                kind: 'run', title: cmd || 'scrivi un comando…', desc: '', meta: 'shell', icon: 'utilities-terminal-symbolic',
                run: () => cmd && spawn(cmd), disabled: !cmd,
            }]});
            return groups;
        }

        // calcolo
        const mathSrc = raw.startsWith('=') ? raw.slice(1) : raw;
        if (raw.startsWith('=') || looksLikeMath(raw)) {
            const v = evaluate(mathSrc);
            if (v !== null) {
                const out = format(v);
                groups.push({label: 'calcolo', items: [{
                    kind: 'calc', title: out, calc: true, desc: `${mathSrc.trim()} =`, meta: 'copia', icon: 'accessories-calculator-symbolic',
                    run: () => {
                        St.Clipboard.get_default().set_text(St.ClipboardType.CLIPBOARD, out);
                        Main.notify('Outkast', `${out} copiato negli appunti`);
                    },
                }]});
            } else if (raw.startsWith('=')) {
                groups.push({label: 'calcolo', items: [{
                    kind: 'calc', title: '…', calc: true, desc: 'espressione non valida', meta: '', icon: 'accessories-calculator-symbolic',
                    run: () => {}, disabled: true,
                }]});
                return groups;
            }
        }

        const q = fold(raw);
        const apps = this._apps();
        const wins = this._windows();
        const sys = systemActions(this._ext);

        if (!q) {
            // vuoto: finestre aperte, app più usate, poi il sistema
            const usage = Shell.AppUsage.get_default();
            const used = apps.length && usage.compare(apps[0].get_id(), apps[apps.length - 1].get_id()) < 0
                ? apps.slice(0, LIMITS.app) : [];
            groups.push({label: 'finestre', items: wins.slice(0, LIMITS.window).map(w => this._windowItem(w))});
            groups.push({label: 'app', items: used.map(a => this._appItem(a))});
            groups.push({label: 'sistema', items: sys.slice(0, 3).map(s => ({kind: 'system', ...s, idx: []}))});
            return groups.filter(g => g.items.length);
        }

        const rank = (list, texts, make, limit) => list
            .map(entry => {
                let best = null;
                for (const [text, weight] of texts(entry)) {
                    const m = text ? fuzzy(q, text) : null;
                    if (m && (!best || m.score * weight > best.score))
                        best = {score: m.score * weight, idx: text === texts(entry)[0][0] ? m.idx : []};
                }
                return best && {entry, best};
            })
            .filter(Boolean)
            .sort((a, b) => b.best.score - a.best.score)
            .slice(0, limit)
            .map(({entry, best}) => ({...make(entry, best), score: best.score}));

        const appItems = rank(apps, app => {
            const info = app.get_app_info();
            return [[app.get_name(), 1], [info?.get_generic_name?.() ?? '', 0.6],
                [info?.get_keywords?.()?.join(' ') ?? '', 0.5], [app.get_id().replace(/\.desktop$/, ''), 0.4]];
        }, (app, m) => this._appItem(app, m), LIMITS.app);
        const winItems = rank(wins, w => [[w.get_title() ?? '', 1], [this._tracker.get_window_app(w)?.get_name() ?? '', 0.8]],
            (w, m) => this._windowItem(w, m), LIMITS.window);
        const sysItems = rank(sys, s => [[s.title, 1], [s.meta, 0.7]],
            (s, m) => ({kind: 'system', ...s, idx: m.idx}), LIMITS.system);

        const cand = [
            {label: 'app', items: appItems},
            {label: 'finestre', items: winItems},
            {label: 'sistema', items: sysItems},
        ].filter(g => g.items.length);
        cand.sort((a, b) => b.items[0].score - a.items[0].score);
        return [...groups, ...cand];
    }

    // ── Lista ────────────────────────────────────────────────────────────────

    _refresh() {
        if (!this._actor)
            return;
        this._list.destroy_all_children();
        this._rows = [];
        this._items = [];

        const groups = this._search(this._entry.get_text());
        for (const g of groups) {
            this._list.add_child(new St.Label({style_class: 'outkast-palette-section', text: g.label}));
            for (const item of g.items)
                this._addRow(item);
        }
        if (!this._items.length) {
            const text = this._entry.get_text().trim() ? 'nessun risultato' : 'inizia a scrivere';
            this._list.add_child(new St.Label({style_class: 'outkast-palette-empty', text}));
        }
        this._select(0, false);
    }

    _markup(title, idx) {
        if (!idx.length)
            return GLib.markup_escape_text(title, -1);
        const set = new Set(idx);
        let out = '';
        Array.from(title).forEach((c, i) => {
            const esc = GLib.markup_escape_text(c, -1);
            out += set.has(i) ? `<span foreground="${this._pal.accent}">${esc}</span>` : esc;
        });
        return out;
    }

    _addRow(item) {
        const row = new St.Button({style_class: 'outkast-palette-row', reactive: true, track_hover: false, x_expand: true});
        const box = new St.BoxLayout({style_class: 'outkast-palette-rowbox', x_expand: true});
        row.set_child(box);

        const icon = item.gicon
            ? new St.Icon({gicon: item.gicon, icon_size: 22})
            : new St.Icon({icon_name: item.icon ?? 'application-x-executable-symbolic', icon_size: 22, style: `color: ${this._pal.fg2};`});
        box.add_child(icon);

        const title = new St.Label({
            style_class: item.calc ? 'outkast-palette-calc' : 'outkast-palette-title',
            y_align: Clutter.ActorAlign.CENTER,
        });
        title.clutter_text.set_markup(this._markup(item.title, item.idx ?? []));
        title.clutter_text.ellipsize = Pango.EllipsizeMode.END;
        box.add_child(title);

        const desc = new St.Label({
            style_class: 'outkast-palette-meta outkast-palette-desc', text: item.desc ?? '',
            x_expand: true, y_align: Clutter.ActorAlign.CENTER,
        });
        desc.clutter_text.ellipsize = Pango.EllipsizeMode.END;
        box.add_child(desc);

        if (item.meta)
            box.add_child(new St.Label({style_class: 'outkast-palette-meta', text: item.meta, y_align: Clutter.ActorAlign.CENTER}));

        const n = this._items.length;
        row.connect('clicked', () => this._activate(n, {}));
        row.connect('enter-event', () => { if (this._sel !== n) this._select(n, false); return Clutter.EVENT_PROPAGATE; });
        this._list.add_child(row);
        this._rows.push(row);
        this._items.push(item);
    }

    _select(n, scroll = true) {
        if (!this._rows.length) {
            this._sel = 0;
            return;
        }
        n = Math.max(0, Math.min(this._rows.length - 1, n));
        this._rows[this._sel]?.remove_style_class_name('selected');
        this._sel = n;
        this._rows[n].add_style_class_name('selected');
        if (scroll)
            ensureActorVisibleInScrollView(this._scroll, this._rows[n]);
        else if (n === 0)
            this._scroll.vadjustment.value = 0;
    }

    _activate(n, ev) {
        const item = this._items[n];
        if (!item || item.disabled)
            return;
        this.hide(() => item.run(ev));
    }

    // ── Tastiera ─────────────────────────────────────────────────────────────

    _onKey(ev) {
        const sym = ev.get_key_symbol();
        const state = ev.get_state();
        const ctrl = (state & Clutter.ModifierType.CONTROL_MASK) !== 0;
        const alt = (state & Clutter.ModifierType.MOD1_MASK) !== 0;
        const shift = (state & Clutter.ModifierType.SHIFT_MASK) !== 0;

        if (sym === Clutter.KEY_Escape) {
            this.hide();
            return Clutter.EVENT_STOP;
        }
        if (sym === Clutter.KEY_Return || sym === Clutter.KEY_KP_Enter || sym === Clutter.KEY_ISO_Enter) {
            this._activate(this._sel, {shift});
            return Clutter.EVENT_STOP;
        }
        if (sym === Clutter.KEY_Down || (ctrl && (sym === Clutter.KEY_n || sym === Clutter.KEY_j)) ||
            (sym === Clutter.KEY_Tab && !shift)) {
            this._select(this._sel + 1 >= this._rows.length ? 0 : this._sel + 1);
            return Clutter.EVENT_STOP;
        }
        if (sym === Clutter.KEY_Up || (ctrl && (sym === Clutter.KEY_p || sym === Clutter.KEY_k)) ||
            sym === Clutter.KEY_ISO_Left_Tab || (sym === Clutter.KEY_Tab && shift)) {
            this._select(this._sel - 1 < 0 ? this._rows.length - 1 : this._sel - 1);
            return Clutter.EVENT_STOP;
        }
        if (sym === Clutter.KEY_Page_Down) {
            this._select(this._sel + 5);
            return Clutter.EVENT_STOP;
        }
        if (sym === Clutter.KEY_Page_Up) {
            this._select(this._sel - 5);
            return Clutter.EVENT_STOP;
        }
        if (ctrl && sym === Clutter.KEY_u) {
            this._entry.set_text('');
            return Clutter.EVENT_STOP;
        }
        if (alt && sym >= Clutter.KEY_1 && sym <= Clutter.KEY_9) {
            this._activate(sym - Clutter.KEY_1, {});
            return Clutter.EVENT_STOP;
        }
        return Clutter.EVENT_PROPAGATE;
    }
}
