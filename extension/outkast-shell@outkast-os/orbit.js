// Orbit: la superficie di controllo che si tira su dal bordo inferiore. Nell'app Outkast è un pannello di
// tessere (le destinazioni, più Segnalibri, Profilo e Impostazioni) che si apre toccando o tirando su un piccolo
// portale; qui è lo stesso gesto, al posto di un dock.
//
//   ora        le finestre aperte: Invio ci salta, clic centrale la chiude
//   app        le app preferite (quelle del dash di GNOME) e «tutte le app», con un «indietro» come nell'app
//   workspace  i workspace con quante finestre hanno
//   sistema    blocca, cattura, tema, impostazioni…
//
// Si apre con il portale (clic, tirando su, rotella), con Super+O o dal menu del sistema. Frecce per muoversi,
// Invio per aprire, Esc per chiudere; scrivere una lettera passa alla palette di comandi.
// Entra dal basso con la stessa tendina e la stessa cucitura arancio delle finestre.

import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import Meta from 'gi://Meta';
import Pango from 'gi://Pango';
import Shell from 'gi://Shell';
import St from 'gi://St';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as AppFavorites from 'resource:///org/gnome/shell/ui/appFavorites.js';
import {ensureActorVisibleInScrollView} from 'resource:///org/gnome/shell/misc/animationUtils.js';
import * as SwipeTracker from 'resource:///org/gnome/shell/ui/swipeTracker.js';

import {animate, lerp, MODE} from './anim.js';
import {systemActions} from './actions.js';
import {Portal} from './portal.js';

const TILE_W = 168;
const GAP = 8;
const PAD = 20;
const MAX_W = 1120;
const MAX_H_FRACTION = 0.8;
const WINDOW_LIMIT = 12;
const SLIDE = 28;
// Il gesto a tre dita misura il suo avanzamento in «altezze di touchpad»: con 1 si dovrebbe percorrere tutto il touchpad.
// Orbit è un pannello basso, gli basta poco più di mezzo touchpad per aprirsi del tutto.
const GESTURE_FULL = 0.55;

export class Orbit {
    /**
     * @param {Extension} ext
     * @param {Launcher} launcher  per passare alla palette quando si scrive una lettera
     */
    constructor(ext, launcher) {
        this._ext = ext;
        this._settings = ext.settings;
        this._launcher = launcher;
        this._appSystem = Shell.AppSystem.get_default();
        this._tracker = Shell.WindowTracker.get_default();
        this._visible = false;
        this._closing = false;
        this._grab = null;
        this._actor = null;
        this._grid = [];            // righe di tessere
        this._sel = [0, 0];
        this._mode = 'main';
        this._anim = null;
        this._portal = null;
        this._geo = null;           // misure del pannello (servono a dipingere l'avanzamento)
        this._gesture = null;       // swipe a tre dita in corso: {startedOpen, p}
        this._swipe = null;           // gesto a tre dita per aprire (sullo stage)
        this._closeSwipe = null;    // gesto a tre dita per chiudere (sul pannello: con Orbit aperto lo stage non riceve più i tocchi)

        this._settings.connectObject(
            'changed::orbit', () => { this._syncPortal(); this._syncGesture(); },
            'changed::orbit-gesture', () => this._syncGesture(),
            // Lockdown, se si spegne, riaccende il gesto della panoramica: si riprende dopo di lui
            'changed::block-activities', () => GLib.idle_add(GLib.PRIORITY_DEFAULT, () => { this._claimOverviewGesture(); return GLib.SOURCE_REMOVE; }),
            this);
        this._syncPortal();
        this._syncGesture();
    }

    get visible() {
        return this._visible;
    }

    _syncPortal() {
        const on = this._settings.get_boolean('orbit');
        if (on && !this._portal) {
            this._portal = new Portal(this._settings, () => this.toggle());
        } else if (!on && this._portal) {
            this.hide();
            this._portal.destroy();
            this._portal = null;
        }
    }

    toggle() {
        if (this._visible)
            this.hide();
        else
            this.show();
    }

    destroy() {
        this._settings.disconnectObject(this);
        this._destroyTracker();
        // l'estensione se ne va: il gesto della panoramica torna a GNOME
        if (Main.overview?._swipeTracker)
            Main.overview._swipeTracker.enabled = true;
        this._anim?.stop();
        this._teardown();
        this._portal?.destroy();
        this._portal = null;
    }

    _ms(base) {
        return Math.max(1, Math.round(base * 100 / this._settings.get_int('motion-speed')));
    }

    // ── Apertura / chiusura ──────────────────────────────────────────────────

    /** Costruisce il pannello (senza mostrarlo né prendere la tastiera): serve sia a show() sia al gesto. */
    _prepare() {
        if (this._actor || !this._settings.get_boolean('orbit'))
            return false;
        if (this._launcher?.visible)
            this._launcher.hide();
        const mon = Main.layoutManager.primaryMonitor;
        this._mode = 'main';
        this._build(mon);
        Main.uiGroup.add_child(this._actor);
        this._populate();
        this._measure(mon);
        this._seam.set_size(this._sheet.width, this._settings.get_int('frame-width'));
        this._paint(0);
        return true;
    }

    /** Da qui Orbit è «aperto»: prende la tastiera e il puntatore. */
    _enter() {
        this._grab = Main.pushModal(this._actor, {actionMode: Shell.ActionMode.POPUP});
        if (!this._grab) {
            this._teardown();
            return false;
        }
        this._visible = true;
        this._closing = false;
        this._portal?.setOrbitOpen(true);
        if (this._swipe)
            this._closeSwipe ??= this._newTracker(this._actor, 'Orbit close tracker');
        return true;
    }

    show() {
        if (this._visible || this._actor)
            return;
        if (!this._prepare() || !this._enter())
            return;
        this._scrim.opacity = 0;
        this._scrim.ease({opacity: 255, duration: this._ms(200), mode: Clutter.AnimationMode.EASE_OUT_QUAD});
        this._anim = this._glide(0, 1, this._ms(300), MODE.IN, () => { this._anim = null; });
    }

    hide(then = null) {
        if (!this._visible || this._closing) {
            then?.();
            return;
        }
        this._leave();
        then?.();
        this._anim?.stop();
        this._scrim.ease({opacity: 0, duration: this._ms(160), mode: Clutter.AnimationMode.EASE_IN_QUAD});
        this._anim = this._glide(this._p ?? 1, 0, this._ms(180), MODE.OUT, () => {
            this._anim = null;
            this._teardown();
        });
    }

    /** Rilascia tastiera e puntatore (la chiusura vera avviene a fine animazione). */
    _leave() {
        this._closing = true;
        if (this._grab) {
            Main.popModal(this._grab);
            this._grab = null;
        }
        this._portal?.setOrbitOpen(false);
    }

    _teardown() {
        this._anim = null;
        if (this._grab) {
            Main.popModal(this._grab);
            this._grab = null;
        }
        this._closeSwipe?.destroy();
        this._closeSwipe = null;
        if (this._actor) {
            global.display.disconnectObject(this._actor);
            Main.layoutManager.disconnectObject(this._actor);
            this._actor.destroy();
            this._actor = null;
        }
        this._grid = [];
        this._geo = null;
        this._p = 0;
        this._gesture = null;
        this._visible = false;
        this._closing = false;
    }

    /**
     * Dipinge l'avanzamento p (0 chiuso, 1 aperto): la tendina dal bordo inferiore, la cucitura arancio sul fronte,
     * il velo scuro. È l'unico punto che muove il pannello: lo usano l'animazione e il gesto a tre dita.
     */
    _paint(p) {
        if (!this._actor || !this._geo)
            return;
        p = Math.max(0, Math.min(1, p));
        this._p = p;
        const {W, H, x, y, fw} = this._geo;
        const ty = SLIDE * (1 - p);
        const shown = p > 0.002;
        this._sheet.visible = shown;
        this._sheet.set_clip(0, H * (1 - p), W, Math.max(1, H * p));
        this._sheet.translation_y = ty;
        this._seam.set_size(W, fw);
        this._seam.set_position(x, Math.round(y + H * (1 - p) + ty));
        // compare subito e svanisce quando la tendina ha quasi finito, tranne mentre la si sta chiudendo
        const closing = this._closing || (this._gesture?.startedOpen ?? false);
        this._seam.opacity = shown ? Math.round(255 * Math.min(1, p * 10) * Math.min(1, (1 - p) * 5 + (closing ? 1 : 0))) : 0;
    }

    /** Anima l'avanzamento da `from` a `to`. */
    _glide(from, to, duration, mode, done) {
        return animate({
            duration, mode,
            update: q => this._paint(lerp(from, to, q)),
            done: finished => {
                if (this._actor && to === 1)
                    this._sheet.remove_clip();
                done(finished);
            },
        });
    }

    // ── Gesto a tre dita ─────────────────────────────────────────────────────
    //
    // Lo stesso SwipeTracker che muove la panoramica di GNOME (stessa direzione, velocità e inerzia): tre dita
    // sul touchpad o sul touchscreen. Tirando su, il pannello sale seguendo le dita; si completa o si annulla secondo
    // quanto si è arrivati e la velocità del gesto. Se il pannello è già aperto, tre dita in giù lo chiudono.

    _newTracker(actor, name) {
        const tracker = new SwipeTracker.SwipeTracker(actor, Clutter.Orientation.VERTICAL,
            Shell.ActionMode.NORMAL | Shell.ActionMode.POPUP,
            {allowDrag: false, allowScroll: false, name, phase: Clutter.EventPhase.CAPTURE});
        tracker.connect('begin', t => this._gestureBegin(t));
        tracker.connect('update', (_t, progress) => this._gestureUpdate(progress));
        tracker.connect('end', (_t, duration, endProgress) => this._gestureEnd(duration, endProgress));
        return tracker;
    }

    _syncGesture() {
        const on = this._settings.get_boolean('orbit') && this._settings.get_boolean('orbit-gesture');
        if (on && !this._swipe) {
            this._swipe = this._newTracker(global.stage, 'Orbit swipe tracker');
            if (this._actor && this._visible)
                this._closeSwipe = this._newTracker(this._actor, 'Orbit close tracker');
        } else if (!on && this._swipe) {
            this._destroyTracker();
        }
        this._claimOverviewGesture();
    }

    _destroyTracker() {
        this._closeSwipe?.destroy();
        this._closeSwipe = null;
        if (this._swipe) {
            this._swipe.destroy();
            this._swipe = null;
        }
        this._claimOverviewGesture();
    }

    /**
     * Tre dita in su è il gesto della panoramica: se Orbit lo usa, quello della panoramica va spento, altrimenti
     * si aprirebbero tutti e due. Se Orbit non lo usa, resta com'è voluto da Lockdown (spento solo con Attività bloccata).
     */
    _claimOverviewGesture() {
        const overview = Main.overview?._swipeTracker;
        if (!overview)
            return;
        overview.enabled = this._swipe ? false : !this._settings.get_boolean('block-activities');
    }

    _gestureBegin(tracker) {
        // da chiuso parte quello sullo stage, da aperto quello sul pannello (l'altro non deve rispondere)
        if (tracker !== (this._visible ? this._closeSwipe : this._swipe))
            return;
        // con la palette aperta, o mentre Orbit si sta già muovendo, il gesto non parte
        if (this._launcher?.visible || this._closing || this._gesture || (this._anim && this._actor))
            return;
        const startedOpen = this._visible;
        if (!startedOpen && !this._prepare())
            return;
        this._gesture = {startedOpen};
        this._portal?.setOrbitOpen(true);
        const start = startedOpen ? GESTURE_FULL : 0;
        // sul touchscreen la distanza dice quanti pixel valgono un'unità: così la cima del pannello segue le dita 1:1
        tracker.confirmSwipe(this._geo.H / GESTURE_FULL, [0, GESTURE_FULL], start, start);
    }

    _gestureUpdate(progress) {
        if (!this._gesture || !this._actor)
            return;
        const p = progress / GESTURE_FULL;
        this._paint(p);
        this._scrim.opacity = Math.round(255 * Math.max(0, Math.min(1, p)));
    }

    _gestureEnd(duration, endProgress) {
        const g = this._gesture;
        if (!g || !this._actor)
            return;
        this._gesture = null;
        const open = endProgress > 0;
        const from = this._p;
        const ms = Math.max(120, Math.round(duration * 100 / this._settings.get_int('motion-speed')));

        if (open) {
            // completato (o annullato una chiusura): il pannello arriva in fondo e diventa «aperto»
            if (!g.startedOpen && !this._enter())
                return;
            this._scrim.ease({opacity: 255, duration: ms, mode: Clutter.AnimationMode.EASE_OUT_QUAD});
            this._anim = this._glide(from, 1, ms, Clutter.AnimationMode.EASE_OUT_CUBIC, () => { this._anim = null; });
            return;
        }
        // annullato (o chiuso tirando giù): si ritira
        if (g.startedOpen)
            this._leave();
        else
            this._portal?.setOrbitOpen(false);
        this._scrim.ease({opacity: 0, duration: ms, mode: Clutter.AnimationMode.EASE_IN_QUAD});
        this._closing = true;
        this._anim = this._glide(from, 0, ms, Clutter.AnimationMode.EASE_OUT_CUBIC, () => this._teardown());
    }

    // ── Costruzione ──────────────────────────────────────────────────────────

    _build(mon) {
        this._actor = new St.Widget({
            name: 'outkast-orbit-layer',
            reactive: true,
            x: mon.x, y: mon.y, width: mon.width, height: mon.height,
        });
        this._scrim = new St.Widget({style_class: 'outkast-scrim', reactive: true, width: mon.width, height: mon.height});
        this._scrim.set_style(`background-color: rgba(11, 12, 15, ${(this._settings.get_int('launcher-dim') / 100 * 0.85).toFixed(2)});`);
        this._actor.add_child(this._scrim);

        const w = Math.min(MAX_W, Math.round(mon.width * 0.94));
        this._sheet = new St.BoxLayout({style_class: 'outkast-orbit', vertical: true, width: w, reactive: true});
        this._actor.add_child(this._sheet);

        this._head = new St.BoxLayout({style_class: 'outkast-orbit-head'});
        this._back = new St.Button({style_class: 'outkast-orbit-back', label: '‹', reactive: true, can_focus: false, visible: false});
        this._back.connect('clicked', () => this._goMain());
        this._title = new St.Label({style_class: 'outkast-orbit-title', text: 'orbit', y_align: Clutter.ActorAlign.CENTER});
        this._hint = new St.Label({
            style_class: 'outkast-orbit-hint', text: '←↑↓→ scegli   ↵ apri   esc chiudi   scrivi per cercare',
            x_expand: true, x_align: Clutter.ActorAlign.END, y_align: Clutter.ActorAlign.CENTER,
        });
        this._head.add_child(this._back);
        this._head.add_child(this._title);
        this._head.add_child(this._hint);
        this._sheet.add_child(this._head);

        this._scroll = new St.ScrollView({
            hscrollbar_policy: St.PolicyType.NEVER,
            vscrollbar_policy: St.PolicyType.AUTOMATIC,
            overlay_scrollbars: true,
        });
        this._content = new St.BoxLayout({style_class: 'outkast-orbit-content', vertical: true});
        this._scroll.add_child(this._content);
        this._sheet.add_child(this._scroll);

        this._seam = new St.Widget({style_class: 'outkast-seam', reactive: false, opacity: 0});
        this._actor.add_child(this._seam);

        this._actor.connect('captured-event', (_a, ev) => {
            if (ev.type() === Clutter.EventType.KEY_PRESS)
                return this._onKey(ev);
            return Clutter.EVENT_PROPAGATE;
        });
        this._scrim.connect('button-press-event', () => { this.hide(); return Clutter.EVENT_STOP; });
        global.display.connectObject('notify::focus-window', () => {
            if (this._visible && global.display.focus_window)
                this.hide();
        }, this._actor);
        Main.layoutManager.connectObject('monitors-changed', () => this.hide(), this._actor);
    }

    /** Dà al pannello un'altezza esatta, attaccato al bordo inferiore. */
    _measure(mon) {
        const w = this._sheet.width;
        const maxH = Math.round(mon.height * MAX_H_FRACTION);
        this._scroll.set_style(`max-height: ${maxH - 90}px;`);
        const [, natH] = this._sheet.get_preferred_height(w);
        const h = Math.min(maxH, Math.round(natH));
        this._sheet.set_size(w, h);
        this._sheet.set_position(Math.round((mon.width - w) / 2), mon.height - h);
        this._geo = {W: w, H: h, x: this._sheet.x, y: this._sheet.y, fw: this._settings.get_int('frame-width')};
    }

    _cols() {
        const inner = this._sheet.width - 2 * PAD;
        return Math.max(2, Math.floor((inner + GAP) / (TILE_W + GAP)));
    }

    // ── Contenuto ────────────────────────────────────────────────────────────

    _populate() {
        this._content.destroy_all_children();
        this._grid = [];
        if (this._mode === 'main')
            this._buildMain();
        else
            this._buildAllApps();
        this._back.visible = this._mode !== 'main';
        this._title.text = this._mode === 'main' ? 'orbit' : 'tutte le app';
        this._select(...this._firstSelection());
    }

    _firstSelection() {
        for (let r = 0; r < this._grid.length; r++) {
            const c = this._grid[r].findIndex(t => t.has_style_class_name('current'));
            if (c >= 0)
                return [r, c];
        }
        return [0, 0];
    }

    _section(label) {
        this._content.add_child(new St.Label({style_class: 'outkast-orbit-section', text: label}));
    }

    _addTiles(label, items) {
        if (!items.length)
            return;
        if (label)
            this._section(label);
        const cols = this._cols();
        for (let i = 0; i < items.length; i += cols) {
            const row = new St.BoxLayout({style_class: 'outkast-orbit-row'});
            const tiles = items.slice(i, i + cols).map(item => this._tile(item));
            for (const t of tiles)
                row.add_child(t);
            this._content.add_child(row);
            this._grid.push(tiles);
        }
    }

    _tile(item) {
        const tile = new St.Button({style_class: 'outkast-orbit-tile', reactive: true, can_focus: false, track_hover: false, width: TILE_W});
        if (item.current)
            tile.add_style_class_name('current');
        const box = new St.BoxLayout({vertical: true, x_expand: true});
        tile.set_child(box);

        const top = new St.BoxLayout();
        if (item.num !== undefined) {
            top.add_child(new St.Label({style_class: 'outkast-orbit-num', text: String(item.num), y_align: Clutter.ActorAlign.CENTER}));
        } else {
            const icon = item.gicon
                ? new St.Icon({gicon: item.gicon, icon_size: 28})
                : new St.Icon({icon_name: item.icon ?? 'application-x-executable-symbolic', icon_size: 28, style_class: 'outkast-orbit-symbolic'});
            top.add_child(icon);
        }
        if (item.badge)
            top.add_child(new St.Label({style_class: 'outkast-orbit-badge', text: String(item.badge), x_expand: true, x_align: Clutter.ActorAlign.END}));
        box.add_child(top);

        const title = new St.Label({style_class: 'outkast-orbit-tile-title', text: item.title});
        title.clutter_text.ellipsize = Pango.EllipsizeMode.END;
        box.add_child(title);
        const meta = new St.Label({style_class: 'outkast-orbit-meta', text: item.meta ?? ' '});
        meta.clutter_text.ellipsize = Pango.EllipsizeMode.END;
        box.add_child(meta);

        tile._item = item;
        tile.connect('clicked', () => this._activateTile(tile));
        tile.connect('enter-event', () => {
            const pos = this._find(tile);
            if (pos && (pos[0] !== this._sel[0] || pos[1] !== this._sel[1]))
                this._select(pos[0], pos[1], false);
            return Clutter.EVENT_PROPAGATE;
        });
        tile.connect('button-press-event', (_t, ev) => {
            if (ev.get_button() === Clutter.BUTTON_MIDDLE && item.close) {
                item.close();
                this._populate();
                return Clutter.EVENT_STOP;
            }
            return Clutter.EVENT_PROPAGATE;
        });
        return tile;
    }

    _find(tile) {
        for (let r = 0; r < this._grid.length; r++) {
            const c = this._grid[r].indexOf(tile);
            if (c >= 0)
                return [r, c];
        }
        return null;
    }

    _windowItems() {
        return global.display.get_tab_list(Meta.TabList.NORMAL, null)
            .filter(w => !w.skip_taskbar && !w.is_override_redirect())
            .slice(0, WINDOW_LIMIT)
            .map(win => {
                const app = this._tracker.get_window_app(win);
                const ws = win.get_workspace()?.index();
                return {
                    title: win.get_title() || app?.get_name() || '—',
                    meta: `${app?.get_name() ?? ''}${ws !== undefined && !win.is_on_all_workspaces() ? `  ·  ws ${ws + 1}` : ''}`.trim(),
                    gicon: app?.get_icon(),
                    current: win.has_focus(),
                    run: () => Main.activateWindow(win),
                    close: () => win.delete(global.get_current_time()),
                };
            });
    }

    _appItem(app) {
        const n = app.get_windows().length;
        return {
            title: app.get_name(),
            meta: n ? (n === 1 ? 'aperta' : `${n} finestre`) : 'avvia',
            gicon: app.get_icon(),
            badge: n || 0,
            current: this._tracker.focus_app === app,
            run: () => app.activate(),
        };
    }

    _buildMain() {
        this._addTiles('ora', this._windowItems());

        const favorites = AppFavorites.getAppFavorites().getFavorites();
        const apps = favorites.map(a => this._appItem(a));
        apps.push({title: 'Tutte le app', meta: 'elenco completo', icon: 'view-app-grid-symbolic', keep: true, run: () => this._goAll()});
        this._addTiles('app', apps);

        const wm = global.workspace_manager;
        const active = wm.get_active_workspace_index();
        const spaces = [];
        for (let i = 0; i < wm.n_workspaces; i++) {
            const n = wm.get_workspace_by_index(i).list_windows().filter(w => !w.is_on_all_workspaces() && !w.skip_taskbar).length;
            spaces.push({
                num: i + 1, title: `workspace ${i + 1}`, meta: n === 0 ? 'vuoto' : n === 1 ? '1 finestra' : `${n} finestre`,
                current: i === active,
                run: () => wm.get_workspace_by_index(i).activate(global.get_current_time()),
            });
        }
        this._addTiles('workspace', spaces);

        this._addTiles('sistema', systemActions(this._ext).map(s => ({title: s.title, meta: s.meta, icon: s.icon, run: s.run})));
    }

    _buildAllApps() {
        const usage = Shell.AppUsage.get_default();
        const apps = this._appSystem.get_installed()
            .filter(info => info.should_show())
            .map(info => this._appSystem.lookup_app(info.get_id()))
            .filter(a => a)
            .sort((a, b) => a.get_name().localeCompare(b.get_name()) || usage.compare(a.get_id(), b.get_id()));
        this._addTiles(`${apps.length} app`, apps.map(a => this._appItem(a)));
    }

    _goAll() {
        this._mode = 'apps';
        this._populate();
        this._remeasure();
    }

    _goMain() {
        this._mode = 'main';
        this._populate();
        this._remeasure();
    }

    /** Cambiando sezione cambia l'altezza: il pannello resta attaccato al bordo inferiore. */
    _remeasure() {
        const mon = Main.layoutManager.primaryMonitor;
        this._sheet.set_size(this._sheet.width, -1);
        this._measure(mon);
    }

    // ── Selezione e tastiera ─────────────────────────────────────────────────

    _select(r, c, scroll = true) {
        if (!this._grid.length)
            return;
        this._grid[this._sel[0]]?.[this._sel[1]]?.remove_style_class_name('selected');
        r = Math.max(0, Math.min(this._grid.length - 1, r));
        c = Math.max(0, Math.min(this._grid[r].length - 1, c));
        this._sel = [r, c];
        const tile = this._grid[r][c];
        tile.add_style_class_name('selected');
        if (scroll)
            ensureActorVisibleInScrollView(this._scroll, tile);
    }

    _activateTile(tile) {
        const item = tile._item;
        if (item.keep) {
            item.run();
            return;
        }
        this.hide(() => item.run());
    }

    _onKey(ev) {
        const sym = ev.get_key_symbol();
        const state = ev.get_state();
        const [r, c] = this._sel;

        if (sym === Clutter.KEY_Escape || (sym === Clutter.KEY_BackSpace && this._mode !== 'main')) {
            if (this._mode !== 'main')
                this._goMain();
            else
                this.hide();
            return Clutter.EVENT_STOP;
        }
        if (sym === Clutter.KEY_Return || sym === Clutter.KEY_KP_Enter || sym === Clutter.KEY_space) {
            const tile = this._grid[r]?.[c];
            if (tile)
                this._activateTile(tile);
            return Clutter.EVENT_STOP;
        }
        if (sym === Clutter.KEY_Left) {
            this._step(-1);
            return Clutter.EVENT_STOP;
        }
        if (sym === Clutter.KEY_Right || sym === Clutter.KEY_Tab) {
            this._step(1);
            return Clutter.EVENT_STOP;
        }
        if (sym === Clutter.KEY_ISO_Left_Tab) {
            this._step(-1);
            return Clutter.EVENT_STOP;
        }
        if (sym === Clutter.KEY_Up) {
            this._select(r - 1, c);
            return Clutter.EVENT_STOP;
        }
        if (sym === Clutter.KEY_Down) {
            this._select(r + 1, c);
            return Clutter.EVENT_STOP;
        }
        if (sym === Clutter.KEY_Home) {
            this._select(0, 0);
            return Clutter.EVENT_STOP;
        }
        if (sym === Clutter.KEY_End) {
            this._select(this._grid.length - 1, 999);
            return Clutter.EVENT_STOP;
        }
        // una lettera passa alla palette di comandi, con quella lettera già scritta
        const ch = Clutter.keysym_to_unicode(sym);
        const mods = Clutter.ModifierType.CONTROL_MASK | Clutter.ModifierType.MOD1_MASK | Clutter.ModifierType.SUPER_MASK;
        if (ch >= 0x21 && !(state & mods)) {
            const text = String.fromCodePoint(ch);
            this.hide(() => this._launcher?.show(text));
            return Clutter.EVENT_STOP;
        }
        return Clutter.EVENT_PROPAGATE;
    }

    /** Avanti/indietro di una tessera, andando a capo come un testo. */
    _step(dir) {
        let [r, c] = this._sel;
        c += dir;
        if (c < 0) {
            r = r === 0 ? this._grid.length - 1 : r - 1;
            c = this._grid[r].length - 1;
        } else if (c >= this._grid[r].length) {
            r = r === this._grid.length - 1 ? 0 : r + 1;
            c = 0;
        }
        this._select(r, c);
    }
}
