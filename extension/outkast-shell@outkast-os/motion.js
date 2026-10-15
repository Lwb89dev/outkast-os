// Il movimento delle finestre, a modo Outkast.
//
// Idea: niente sta mai "nel mezzo". Una finestra ha un bordo dello schermo a cui appartiene (il più
// vicino) e da lì entra, lì viene scacciata quando si chiude, e verso l'alto, nella barra, si ritira
// quando la si minimizza. Come l'app Outkast, che si muove per swipe dai bordi e tira su Orbit dal basso.
//
//   apertura      una tendina parte dal bordo e rivela la finestra; sul fronte corre una cucitura arancio
//                 da 2px; il contenuto scivola di qualche pixel nello stesso verso
//   chiusura      lo stesso, al contrario e più in fretta: la finestra viene ritirata verso il suo bordo
//   minimizza     la finestra si ritira verso l'alto, nella barra, e il suo workspace lampeggia
//   dialoghi      niente tendina: una breve salita con dissolvenza (sono ospiti, non finestre)
//
// Come ci si aggancia alla Shell: i suoi handler dei segnali sono legati con .bind(), quindi non si possono
// sostituire sull'istanza. Per distruzione e minimizzazione si BLOCCANO i suoi handler e si usano i nostri
// (devono chiamare completed_*). Per la mappatura basta rendere falso _shouldAnimateActor per le tre
// categorie di finestre animabili: l'handler originale completa subito (e fa il suo lavoro di
// contabilità per i dialoghi) e noi animiamo dopo, nello stesso giro, prima del primo fotogramma.

import Clutter from 'gi://Clutter';
import GObject from 'gi://GObject';
import Meta from 'gi://Meta';
import St from 'gi://St';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import {animate, MODE} from './anim.js';

const OPEN_MS = 300;
const CLOSE_MS = 190;
const MINIMIZE_MS = 260;
const DIALOG_IN_MS = 170;
const DIALOG_OUT_MS = 120;

const EDGE = {
    left:   {x: -1, y: 0},
    right:  {x: 1, y: 0},
    top:    {x: 0, y: -1},
    bottom: {x: 0, y: 1},
};

/**
 * Il bordo dello schermo a cui appartiene una finestra: quello da cui entra e verso cui esce.
 * Massimizzata o a tutto schermo → dal basso (come Orbit). Altrimenti il più vicino, con una
 * preferenza per il basso quando le distanze sono simili.
 */
export function edgeFor(win) {
    const mon = Main.layoutManager.monitors[win.get_monitor()] ?? Main.layoutManager.primaryMonitor;
    const r = win.get_frame_rect();
    if (win.is_fullscreen() || win.is_maximized() || win.is_monitor_sized())
        return 'bottom';

    const d = {
        left: r.x - mon.x,
        right: mon.x + mon.width - (r.x + r.width),
        top: r.y - mon.y - Main.panel.height,
        bottom: mon.y + mon.height - (r.y + r.height),
    };
    d.bottom *= 0.7;                    // il basso vince a parità: è il bordo di Orbit
    let best = 'bottom';
    for (const e of ['left', 'right', 'top']) {
        if (d[e] < d[best] - 8)
            best = e;
    }
    return best;
}

export class WindowMotion {
    /**
     * @param {Gio.Settings} settings
     * @param {Bar} bar   serve per sapere dove "ritirare" le finestre minimizzate
     */
    constructor(settings, bar) {
        this._settings = settings;
        this._bar = bar;
        this._running = new Map();      // attore → {stop}
        this._blocked = [];
        this._enabled = false;
        this._settings.connectObject('changed::motion', () => this._sync(), this);
        this._sync();
    }

    _sync() {
        if (this._settings.get_boolean('motion'))
            this._enable();
        else
            this._disable();
    }

    // ── Aggancio alla Shell ──────────────────────────────────────────────────

    _enable() {
        if (this._enabled)
            return;
        this._enabled = true;

        // 1. mappatura: l'handler originale completa subito
        this._origShould = Object.getOwnPropertyDescriptor(Main.wm, '_shouldAnimateActor');
        const should = Main.wm._shouldAnimateActor;
        Main.wm._shouldAnimateActor = (actor, types) =>
            types.length === 3 ? false : should.call(Main.wm, actor, types);

        // 2. distruzione e minimizzazione: si bloccano gli originali
        const wm = global.window_manager;
        for (const sig of ['destroy', 'minimize', 'unminimize']) {
            const id = GObject.signal_handler_find(wm, {signalId: sig});
            if (id) {
                GObject.signal_handler_block(wm, id);
                this._blocked.push(id);
            }
        }

        wm.connectObject(
            'map', (_w, actor) => this._onMap(actor),
            'destroy', (_w, actor) => this._onDestroy(actor),
            'minimize', (_w, actor) => this._onMinimize(actor),
            'unminimize', (_w, actor) => this._onUnminimize(actor),
            'kill-window-effects', (_w, actor) => this._kill(actor),
            this);
    }

    _disable() {
        if (!this._enabled)
            return;
        this._enabled = false;
        const wm = global.window_manager;
        wm.disconnectObject(this);

        // chi sta ancora animando va portato a termine, altrimenti la finestra resta "a metà" per sempre
        for (const actor of [...this._running.keys()])
            this._kill(actor);

        for (const id of this._blocked)
            GObject.signal_handler_unblock(wm, id);
        this._blocked = [];

        if (this._origShould)
            Object.defineProperty(Main.wm, '_shouldAnimateActor', this._origShould);
        else
            delete Main.wm._shouldAnimateActor;
        this._origShould = null;
    }

    destroy() {
        this._settings.disconnectObject(this);
        this._disable();
    }

    // ── Utilità ──────────────────────────────────────────────────────────────

    /** Durata in ms, secondo la velocità scelta (100 = normale). */
    _ms(base) {
        return Math.max(1, Math.round(base * 100 / this._settings.get_int('motion-speed')));
    }

    _canAnimate(actor) {
        return St.Settings.get().enable_animations && Main.wm._shouldAnimate() && !!actor.get_texture();
    }

    _type(actor) {
        return Main.wm._getAnimationWindowType(actor);
    }

    _isWindowLike(actor) {
        return [Meta.WindowType.NORMAL, Meta.WindowType.DIALOG, Meta.WindowType.MODAL_DIALOG].includes(this._type(actor));
    }

    _kill(actor) {
        this._running.get(actor)?.stop();
    }

    _track(actor, handle) {
        this._running.set(actor, handle);
        return handle;
    }

    _untrack(actor) {
        this._running.delete(actor);
    }

    // ── Tendina dal bordo ────────────────────────────────────────────────────

    /**
     * Rivela (o nasconde) una finestra con una tendina che parte da `edge`.
     * p = 0 nascosta, 1 intera. `reverse`: si va da 1 a 0 (uscita).
     * `done(finished)` viene chiamato una sola volta; lo stato dell'attore è già ripulito.
     */
    _wipe(actor, edge, {reverse, duration, mode, done}) {
        const win = actor.meta_window;
        const fr = win.get_frame_rect();
        const br = win.get_buffer_rect();
        const ox = fr.x - br.x, oy = fr.y - br.y;           // dove sta la finestra dentro il suo attore
        const W = fr.width, H = fr.height;
        const dir = EDGE[edge];
        const fw = this._settings.get_int('frame-width');
        const slide = Math.max(10, Math.min(36, Math.round(Math.min(W, H) * 0.06)));
        const horizontal = edge === 'top' || edge === 'bottom';

        const seam = new St.Widget({style_class: 'outkast-seam', reactive: false});
        seam.set_size(horizontal ? W : fw, horizontal ? fw : H);
        global.window_group.add_child(seam);
        global.window_group.set_child_above_sibling(seam, null);

        // se Mutter distrugge l'attore mentre anima (l'app si chiude subito), non si tocca più
        let gone = false;

        const apply = p => {
            if (gone)
                return;
            // p: quanta finestra si vede. Le coordinate sono quelle della finestra, non del buffer.
            let x0 = 0, y0 = 0, x1 = W, y1 = H;
            switch (edge) {
            case 'left': x1 = W * p; break;
            case 'right': x0 = W * (1 - p); break;
            case 'top': y1 = H * p; break;
            case 'bottom': y0 = H * (1 - p); break;
            }
            const tx = dir.x * slide * (1 - p);
            const ty = dir.y * slide * (1 - p);
            actor.translation_x = tx;
            actor.translation_y = ty;
            actor.set_clip(ox + x0, oy + y0, Math.max(1, x1 - x0), Math.max(1, y1 - y0));

            // la cucitura sta sul fronte della tendina, dentro la parte visibile
            const sx = fr.x + tx + (edge === 'left' ? x1 - fw : edge === 'right' ? x0 : 0);
            const sy = fr.y + ty + (edge === 'top' ? y1 - fw : edge === 'bottom' ? y0 : 0);
            seam.set_position(Math.round(sx), Math.round(sy));
            // compare subito, svanisce quando la tendina ha quasi finito
            seam.opacity = Math.round(255 * Math.min(1, p * 10) * Math.min(1, (1 - p) * 5 + (reverse ? 1 : 0)));
        };

        // Mutter non ridipinge ciò che sta sotto l'area opaca di una finestra (occlusione): se la ritagliamo,
        // lo sfondo sotto la parte ancora nascosta non lo disegna nessuno e resta memoria sporca.
        // Un attore con opacità < 255 non è considerato occludente.
        actor.opacity = 254;

        const clear = () => {
            if (!gone) {
                actor.opacity = 255;
                actor.remove_clip();
                actor.translation_x = 0;
                actor.translation_y = 0;
            }
            seam.destroy();
        };

        // Il segnale 'destroy' si aggancia prima di partire: l'animazione può anche finire in modo sincrono.
        const owner = {};
        let handle = null;
        actor.connectObject('destroy', () => {
            gone = true;
            handle?.stop();
        }, owner);

        handle = animate({
            duration,
            mode,
            update: q => apply(reverse ? 1 - q : q),
            done: finished => {
                if (!gone)
                    actor.disconnectObject(owner);
                clear();
                this._untrack(actor);
                done?.(finished);
            },
        });
        return this._track(actor, handle);
    }

    // ── Apertura ─────────────────────────────────────────────────────────────

    _onMap(actor) {
        if (!this._isWindowLike(actor) || !this._canAnimate(actor))
            return;
        this._kill(actor);
        const win = actor.meta_window;

        if (this._type(actor) === Meta.WindowType.NORMAL) {
            this._wipe(actor, edgeFor(win), {
                reverse: false, duration: this._ms(OPEN_MS), mode: MODE.IN,
            });
        } else {
            this._dialogIn(actor);
        }
    }

    _dialogIn(actor) {
        actor.remove_all_transitions();
        actor.set({opacity: 0, translation_y: 14});
        const handle = {stop: () => {
            actor.remove_all_transitions();
            actor.set({opacity: 255, translation_y: 0});
            this._untrack(actor);
        }};
        this._track(actor, handle);
        actor.ease({
            opacity: 255, translation_y: 0,
            duration: this._ms(DIALOG_IN_MS), mode: Clutter.AnimationMode.EASE_OUT_QUAD,
            onStopped: () => this._untrack(actor),
        });
    }

    // ── Chiusura ─────────────────────────────────────────────────────────────

    _onDestroy(actor) {
        const wm = global.window_manager;
        const win = actor.meta_window;

        // quello che faceva l'handler originale prima di animare
        win.disconnectObject(actor);
        if (win.is_attached_dialog())
            Main.wm._checkDimming(win.get_transient_for());

        this._kill(actor);                 // un'apertura ancora in corso: si chiude di botto
        if (!this._isWindowLike(actor) || !this._canAnimate(actor)) {
            wm.completed_destroy(actor);
            return;
        }

        const complete = () => wm.completed_destroy(actor);
        if (this._type(actor) === Meta.WindowType.NORMAL) {
            this._wipe(actor, edgeFor(win), {
                reverse: true, duration: this._ms(CLOSE_MS), mode: MODE.OUT, done: complete,
            });
        } else {
            this._dialogOut(actor, win, complete);
        }
    }

    _dialogOut(actor, win, complete) {
        const parent = win.is_attached_dialog() ? win.get_transient_for() : null;
        let over = false;
        const finish = () => {
            if (over)
                return;
            over = true;
            parent?.disconnectObject(actor);
            this._untrack(actor);
            complete();
        };
        // se la finestra madre sparisce prima, non c'è più niente da animare
        parent?.connectObject('unmanaged', () => { actor.remove_all_transitions(); finish(); }, actor);
        this._track(actor, {stop: () => { actor.remove_all_transitions(); finish(); }});
        actor.ease({
            opacity: 0, translation_y: 10,
            duration: this._ms(DIALOG_OUT_MS), mode: Clutter.AnimationMode.EASE_IN_QUAD,
            onStopped: finish,
        });
    }

    // ── Minimizza / ripristina ───────────────────────────────────────────────

    _onMinimize(actor) {
        const wm = global.window_manager;
        this._kill(actor);
        if (!this._isWindowLike(actor) || !this._canAnimate(actor)) {
            wm.completed_minimize(actor);
            return;
        }
        this._wipe(actor, 'top', {
            reverse: true, duration: this._ms(MINIMIZE_MS), mode: MODE.OUT,
            done: () => {
                this._bar?.ping(actor.meta_window.get_workspace()?.index());
                wm.completed_minimize(actor);
            },
        });
    }

    _onUnminimize(actor) {
        const wm = global.window_manager;
        this._kill(actor);
        if (!this._isWindowLike(actor) || !this._canAnimate(actor)) {
            wm.completed_unminimize(actor);
            return;
        }
        actor.show();
        this._wipe(actor, 'top', {
            reverse: false, duration: this._ms(MINIMIZE_MS), mode: MODE.IN,
            done: () => wm.completed_unminimize(actor),
        });
    }
}
