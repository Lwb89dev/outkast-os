// La cornice arancio sulla finestra attiva. Non è un bordo disegnato dall'app: è un attore della
// Shell che sta sopra le finestre e, quando il fuoco cambia, *viaggia* dal rettangolo della finestra
// di prima a quello della nuova, invece di spegnersi e riaccendersi.
//
// Se la finestra attiva è massimizzata o a schermo intero la cornice si ritira: sul bordo
// dello schermo non ha dove stare.

import Clutter from 'gi://Clutter';
import Meta from 'gi://Meta';
import St from 'gi://St';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import {animate, lerp, MODE} from './anim.js';

const GLIDE_MS = 280;
const FADE_MS = 140;

export class FocusFrame {
    constructor(settings) {
        this._settings = settings;
        this._win = null;
        this._glide = null;
        this._from = null;          // rettangolo da cui parte il viaggio

        this._actor = new St.Widget({
            style_class: 'outkast-frame',
            reactive: false,
            visible: false,
            opacity: 0,
        });
        global.window_group.add_child(this._actor);

        global.display.connectObject(
            'notify::focus-window', () => this._onFocus(),
            'restacked', () => this._raise(),
            this._actor);
        global.workspace_manager.connectObject(
            'active-workspace-changed', () => this._onFocus(), this._actor);
        Main.sessionMode.connectObject('updated', () => this._onFocus(), this._actor);
        this._settings.connectObject(
            'changed::focus-frame', () => this._onFocus(),
            'changed::frame-width', () => this._place(false),
            this._actor);

        this._onFocus();
    }

    _enabled() {
        return this._settings.get_boolean('focus-frame') && Main.sessionMode.currentMode === 'user';
    }

    /** Una finestra "da cornice": normale, visibile qui e ora, non a tutto schermo. */
    _eligible(win) {
        if (!win || win.get_window_type() !== Meta.WindowType.NORMAL)
            return false;
        if (win.minimized || win.is_fullscreen() || win.is_maximized())
            return false;
        if (!win.get_compositor_private() || !win.located_on_workspace(global.workspace_manager.get_active_workspace()))
            return false;
        return true;
    }

    _onFocus() {
        const win = global.display.focus_window;
        if (this._win !== win) {
            this._win?.disconnectObject(this._actor);
            this._win = win;
            win?.connectObject(
                'position-changed', () => this._place(false),
                'size-changed', () => this._place(false),
                'notify::minimized', () => this._place(false),
                'notify::maximized-horizontally', () => this._place(false),
                'notify::maximized-vertically', () => this._place(false),
                'notify::fullscreen', () => this._place(false),
                'workspace-changed', () => this._place(false),
                'unmanaged', () => this._lost(win),
                this._actor);
        }
        this._place(true);
    }

    _lost(win) {
        if (this._win === win) {
            this._win = null;
            this._place(true);
        }
    }

    _target() {
        if (!this._enabled() || !this._eligible(this._win))
            return null;
        const r = this._win.get_frame_rect();
        const f = this._settings.get_int('frame-width');
        // fuori dalla finestra, per non coprirne il contenuto
        return {x: r.x - f, y: r.y - f, width: r.width + 2 * f, height: r.height + 2 * f};
    }

    _current() {
        return {x: this._actor.x, y: this._actor.y, width: this._actor.width, height: this._actor.height};
    }

    _set(r) {
        this._actor.set_position(Math.round(r.x), Math.round(r.y));
        this._actor.set_size(Math.max(1, Math.round(r.width)), Math.max(1, Math.round(r.height)));
    }

    /** Porta la cornice sulla finestra attiva. `travel`: viaggio animato (cambio di fuoco) o scatto (la finestra si muove). */
    _place(travel) {
        const target = this._target();
        if (!target) {
            this._hide();
            return;
        }
        this._raise();

        const wasShown = this._actor.visible && this._actor.opacity > 0;
        if (!wasShown) {
            // Prima apparizione: nasce già sul bersaglio e prende corpo.
            this._stopGlide();
            this._set(target);
            this._actor.show();
            this._actor.remove_all_transitions();
            this._actor.ease({opacity: 255, duration: FADE_MS, mode: Clutter.AnimationMode.EASE_OUT_QUAD});
            return;
        }
        this._actor.remove_all_transitions();
        this._actor.opacity = 255;

        if (!travel) {
            // La finestra si sta muovendo o ridimensionando: la cornice la segue senza ritardo.
            // Durante un viaggio basta aggiornare il bersaglio, il viaggio lo legge a ogni fotogramma.
            if (!this._glide)
                this._set(target);
            return;
        }

        this._stopGlide();
        this._from = this._current();
        this._glide = animate({
            duration: GLIDE_MS,
            mode: MODE.GLIDE,
            update: p => {
                const to = this._target();
                if (!to)
                    return;
                const f = this._from;
                this._set({
                    x: lerp(f.x, to.x, p), y: lerp(f.y, to.y, p),
                    width: lerp(f.width, to.width, p), height: lerp(f.height, to.height, p),
                });
            },
            done: () => { this._glide = null; },
        });
    }

    _stopGlide() {
        const g = this._glide;
        this._glide = null;
        g?.stop();
    }

    _hide() {
        this._stopGlide();
        if (!this._actor.visible)
            return;
        this._actor.remove_all_transitions();
        this._actor.ease({
            opacity: 0, duration: FADE_MS, mode: Clutter.AnimationMode.EASE_OUT_QUAD,
            onStopped: () => { if (this._actor.opacity === 0) this._actor.hide(); },
        });
    }

    _raise() {
        if (global.window_group.get_last_child() !== this._actor)
            global.window_group.set_child_above_sibling(this._actor, null);
    }

    destroy() {
        this._stopGlide();
        this._win?.disconnectObject(this._actor);
        global.display.disconnectObject(this._actor);
        global.workspace_manager.disconnectObject(this._actor);
        Main.sessionMode.disconnectObject(this._actor);
        this._settings.disconnectObject(this._actor);
        this._actor.destroy();
        this._win = null;
    }
}
