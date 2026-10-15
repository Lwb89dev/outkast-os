// Il portale di Orbit: una piccola linguetta al centro del bordo inferiore dello schermo, con i workspace come
// quadratini (quello attivo è arancio e più grande) e il nome dell'app in primo piano. Come nell'app Outkast
// non è una barra di navigazione: è la maniglia da cui si tira su Orbit.
//
// Si apre con un clic, tirando su di qualche pixel, con la rotella verso l'alto, o (se acceso) fermando il puntatore
// sopra per un attimo. Il gesto a tre dita e la scorciatoia lavorano a parte (orbit.js) e funzionano in ogni modalità.
//
// Quando si vede (impostazione «orbit-portal»):
//   always   sempre
//   smart    si nasconde da solo quando una finestra lo copre, e torna sul desktop libero (come l'autohide di Glassy)
//   edge     sempre nascosto sotto il bordo: sale solo quando il puntatore tocca il bordo inferiore
//   hidden   mai (restano scorciatoia, gesto e, se acceso, l'apertura col puntatore sul bordo)
// In «smart» e «edge» il portale risale quando il puntatore tocca il bordo inferiore (o il portale stesso).

import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import Meta from 'gi://Meta';
import Shell from 'gi://Shell';
import St from 'gi://St';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';

const REVEAL_MS = 180;
const HIDE_DELAY_MS = 650;
const HOVER_OPEN_MS = 420;
const COOLDOWN_MS = 900;        // dopo che Orbit si chiude, il puntatore sul portale non lo riapre subito
const PULL_PX = 22;
const STRIP_H = 3;
const OVERLAP_MARGIN = 6;

export class Portal {
    constructor(settings, onOpen) {
        this._settings = settings;
        this._onOpen = onOpen;
        this._press = null;
        this._grab = null;
        this._hover = false;
        this._overlapped = false;
        this._shown = null;
        this._orbitOpen = false;
        this._cooldownUntil = 0;
        this._hideId = 0;
        this._dwellId = 0;
        this._overlapId = 0;
        this._watching = false;
        this._wowner = {};
        this._workspaces = [];

        this._actor = new St.BoxLayout({
            name: 'outkast-portal',
            style_class: 'outkast-portal',
            reactive: true,
            track_hover: true,
        });
        this._dots = new St.BoxLayout({style_class: 'outkast-portal-dots', y_align: Clutter.ActorAlign.CENTER});
        this._label = new St.Label({style_class: 'outkast-portal-label', y_align: Clutter.ActorAlign.CENTER});
        this._actor.add_child(this._dots);
        this._actor.add_child(this._label);
        Main.layoutManager.addChrome(this._actor, {affectsStruts: false, trackFullscreen: true});

        // striscia sottile lungo il bordo inferiore: è ciò che il puntatore tocca quando il portale è nascosto
        this._strip = new St.Widget({name: 'outkast-portal-strip', reactive: true, height: STRIP_H});
        Main.layoutManager.addChrome(this._strip, {affectsStruts: false, trackFullscreen: true});

        this._actor.connectObject(
            'button-press-event', (_a, ev) => this._onPress(ev),
            'motion-event', (_a, ev) => this._onMotion(ev),
            'button-release-event', () => this._onRelease(),
            'scroll-event', (_a, ev) => this._onScroll(ev),
            'enter-event', () => this._onEnter(),
            'leave-event', () => this._onLeave(),
            'notify::width', () => this._place(),
            'notify::height', () => this._place(),
            this._actor);
        this._strip.connectObject(
            'enter-event', () => this._onEnter(),
            'leave-event', () => this._onLeave(),
            'scroll-event', (_a, ev) => this._onScroll(ev),
            this._strip);

        Main.layoutManager.connectObject('monitors-changed', () => this._place(), this._actor);
        global.workspace_manager.connectObject(
            'workspace-added', () => this._rebuildDots(),
            'workspace-removed', () => this._rebuildDots(),
            'active-workspace-changed', () => { this._sync(); this._scheduleOverlap(); },
            this._actor);
        this._tracker = Shell.WindowTracker.get_default();
        this._tracker.connectObject('notify::focus-app', () => this._sync(), this._actor);
        this._settings.connectObject(
            'changed::orbit-portal', () => this._applyMode(),
            'changed::orbit-hover-open', () => this._applyMode(),
            this._actor);

        this._rebuildDots();
        this._applyMode();
    }

    // ── Contenuto ────────────────────────────────────────────────────────────

    _rebuildDots() {
        for (const ws of this._workspaces)
            ws.disconnectObject(this._actor);
        this._workspaces = [];
        this._dots.destroy_all_children();
        const wm = global.workspace_manager;
        for (let i = 0; i < wm.n_workspaces; i++) {
            const ws = wm.get_workspace_by_index(i);
            ws.connectObject(
                'window-added', () => this._sync(),
                'window-removed', () => this._sync(),
                this._actor);
            this._workspaces.push(ws);
            this._dots.add_child(new St.Widget({style_class: 'outkast-portal-dot', y_align: Clutter.ActorAlign.CENTER}));
        }
        this._sync();
    }

    _sync() {
        const active = global.workspace_manager.get_active_workspace_index();
        this._dots.get_children().forEach((dot, i) => {
            const occupied = this._workspaces[i]?.list_windows().some(w => !w.is_on_all_workspaces() && !w.skip_taskbar);
            if (i === active) dot.add_style_class_name('active'); else dot.remove_style_class_name('active');
            if (occupied) dot.add_style_class_name('occupied'); else dot.remove_style_class_name('occupied');
        });
        const app = this._tracker.focus_app;
        this._label.text = app ? app.get_name() : `ws ${active + 1}`;
        this._place();
    }

    // ── Posizione ────────────────────────────────────────────────────────────

    get _mode() {
        return this._settings.get_string('orbit-portal');
    }

    get _hoverOpen() {
        return this._settings.get_boolean('orbit-hover-open');
    }

    _place() {
        const mon = Main.layoutManager.primaryMonitor;
        if (!mon)
            return;
        const [w, h] = this._actor.get_size();
        this._actor.set_position(Math.round(mon.x + (mon.width - w) / 2), mon.y + mon.height - h);
        const sw = Math.round(mon.width * 0.4);
        this._strip.set_size(sw, STRIP_H);
        this._strip.set_position(Math.round(mon.x + (mon.width - sw) / 2), mon.y + mon.height - STRIP_H);
    }

    // ── Visibilità ───────────────────────────────────────────────────────────

    /** Il portale deve vedersi adesso? */
    _wantShown() {
        switch (this._mode) {
        case 'always': return true;
        case 'smart': return !this._overlapped || this._hover;
        case 'edge': return this._hover;
        default: return false;
        }
    }

    /** La striscia lungo il bordo serve se il portale può stare nascosto, o se l'apertura col puntatore è accesa. */
    _wantStrip() {
        const mode = this._mode;
        return mode === 'smart' || mode === 'edge' || (mode === 'hidden' && this._hoverOpen);
    }

    _applyMode() {
        this._unscheduleHide();
        this._cancelDwell();
        this._hover = false;
        this._strip.visible = this._wantStrip();
        this._watchWindows(this._mode === 'smart');
        if (this._mode === 'smart')
            this._computeOverlap();
        this._shown = null;                 // forza il riposizionamento
        this._update(false);
    }

    _update(animate = true) {
        // «nascosto» vuol dire fuori dallo schermo, non spento: così il portale può risalire quando il puntatore lo chiama
        this._actor.show();
        const show = this._wantShown();
        if (this._shown === show)
            return;
        this._shown = show;
        const target = show ? 0 : this._actor.height + 2;
        this._actor.remove_all_transitions();
        if (!animate) {
            this._actor.translation_y = target;
            return;
        }
        this._actor.ease({
            translation_y: target, duration: REVEAL_MS,
            mode: show ? Clutter.AnimationMode.EASE_OUT_EXPO : Clutter.AnimationMode.EASE_IN_CUBIC,
        });
    }

    /** Il portale si ritira mentre Orbit è aperto (c'è già lui), e per un attimo non riapre Orbit al passaggio del mouse. */
    setOrbitOpen(open) {
        this._orbitOpen = open;
        this._cancelDwell();
        if (!open) {
            this._cooldownUntil = GLib.get_monotonic_time() / 1000 + COOLDOWN_MS;
            this._hover = false;
        }
        this._actor.remove_all_transitions();
        this._actor.ease({opacity: open ? 0 : 255, duration: 140, mode: Clutter.AnimationMode.EASE_OUT_QUAD});
        this._update(true);
    }

    // ── Puntatore: sale, resta, scende; e, se acceso, apre con una sosta ─────

    _onEnter() {
        this._unscheduleHide();
        if (this._orbitOpen)
            return;
        this._hover = true;
        this._update(true);
        if (this._mode !== 'hidden' || this._hoverOpen)
            this._startDwell();
    }

    _onLeave() {
        this._cancelDwell();
        this._scheduleHide();
    }

    _startDwell() {
        if (!this._hoverOpen || this._dwellId)
            return;
        this._dwellId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, HOVER_OPEN_MS, () => {
            this._dwellId = 0;
            const now = GLib.get_monotonic_time() / 1000;
            if (this._hover && !this._press && !this._orbitOpen && now >= this._cooldownUntil)
                this._onOpen();
            return GLib.SOURCE_REMOVE;
        });
    }

    _cancelDwell() {
        if (this._dwellId) {
            GLib.source_remove(this._dwellId);
            this._dwellId = 0;
        }
    }

    _scheduleHide() {
        this._unscheduleHide();
        this._hideId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, HIDE_DELAY_MS, () => {
            this._hideId = 0;
            if (this._press)
                return GLib.SOURCE_REMOVE;
            this._hover = false;
            this._update(true);
            return GLib.SOURCE_REMOVE;
        });
    }

    _unscheduleHide() {
        if (this._hideId) {
            GLib.source_remove(this._hideId);
            this._hideId = 0;
        }
    }

    // ── «Smart»: nascosto se una finestra lo copre ───────────────────────────

    _watchWindows(on) {
        if (on === this._watching)
            return;
        this._watching = on;
        if (on) {
            global.display.connectObject(
                'window-created', (_d, win) => this._trackWindow(win),
                'restacked', () => this._scheduleOverlap(),
                this._wowner);
            for (const a of global.get_window_actors())
                this._trackWindow(a.meta_window);
        } else {
            global.display.disconnectObject(this._wowner);
            for (const a of global.get_window_actors())
                a.meta_window?.disconnectObject(this._wowner);
            if (this._overlapId) {
                GLib.source_remove(this._overlapId);
                this._overlapId = 0;
            }
            this._overlapped = false;
        }
    }

    _trackWindow(win) {
        win.connectObject(
            'position-changed', () => this._scheduleOverlap(),
            'size-changed', () => this._scheduleOverlap(),
            'notify::minimized', () => this._scheduleOverlap(),
            'workspace-changed', () => this._scheduleOverlap(),
            'unmanaged', () => this._scheduleOverlap(),
            this._wowner);
    }

    _scheduleOverlap() {
        if (!this._watching || this._overlapId)
            return;
        this._overlapId = GLib.idle_add(GLib.PRIORITY_DEFAULT_IDLE, () => {
            this._overlapId = 0;
            if (this._computeOverlap())
                this._update(true);
            return GLib.SOURCE_REMOVE;
        });
    }

    /** Aggiorna `_overlapped`; ritorna true se è cambiato. */
    _computeOverlap() {
        const mon = Main.layoutManager.primaryMonitor;
        if (!mon)
            return false;
        const [w, h] = this._actor.get_size();
        const rect = {
            x: mon.x + (mon.width - w) / 2 - OVERLAP_MARGIN, y: mon.y + mon.height - h - OVERLAP_MARGIN,
            w: w + 2 * OVERLAP_MARGIN, h: h + OVERLAP_MARGIN,
        };
        const active = global.workspace_manager.get_active_workspace();
        const covered = global.get_window_actors().some(a => {
            const win = a.meta_window;
            if (!win || win.minimized || ![Meta.WindowType.NORMAL, Meta.WindowType.DIALOG, Meta.WindowType.MODAL_DIALOG].includes(win.get_window_type()))
                return false;
            if (!win.located_on_workspace(active))
                return false;
            const f = win.get_frame_rect();
            return f.x < rect.x + rect.w && f.x + f.width > rect.x && f.y < rect.y + rect.h && f.y + f.height > rect.y;
        });
        const changed = covered !== this._overlapped;
        this._overlapped = covered;
        return changed;
    }

    // ── Gesti ────────────────────────────────────────────────────────────────

    _onPress(ev) {
        if (ev.get_button() !== Clutter.BUTTON_PRIMARY)
            return Clutter.EVENT_PROPAGATE;
        this._cancelDwell();
        this._press = {y: ev.get_coords()[1], opened: false};
        this._grab = global.stage.grab(this._actor);
        return Clutter.EVENT_STOP;
    }

    _onMotion(ev) {
        if (!this._press || this._press.opened)
            return Clutter.EVENT_PROPAGATE;
        if (ev.get_coords()[1] - this._press.y <= -PULL_PX) {
            this._press.opened = true;
            this._release();
            this._onOpen();
        }
        return Clutter.EVENT_STOP;
    }

    _onRelease() {
        if (!this._press)
            return Clutter.EVENT_PROPAGATE;
        const opened = this._press.opened;
        this._release();
        if (!opened)
            this._onOpen();
        return Clutter.EVENT_STOP;
    }

    _release() {
        this._press = null;
        this._grab?.dismiss();
        this._grab = null;
    }

    _onScroll(ev) {
        if (ev.get_scroll_direction() === Clutter.ScrollDirection.UP) {
            this._onOpen();
            return Clutter.EVENT_STOP;
        }
        return Clutter.EVENT_PROPAGATE;
    }

    destroy() {
        this._unscheduleHide();
        this._cancelDwell();
        this._watchWindows(false);
        this._release();
        this._settings.disconnectObject(this._actor);
        this._tracker.disconnectObject(this._actor);
        global.workspace_manager.disconnectObject(this._actor);
        Main.layoutManager.disconnectObject(this._actor);
        for (const ws of this._workspaces)
            ws.disconnectObject(this._actor);
        Main.layoutManager.removeChrome(this._actor);
        Main.layoutManager.removeChrome(this._strip);
        this._actor.destroy();
        this._strip.destroy();
        this._workspaces = [];
    }
}
