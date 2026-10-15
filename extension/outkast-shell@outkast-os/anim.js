// Animazioni a "progresso": serve quando Clutter non sa animare ciò che vogliamo (il ritaglio a tendina
// di una finestra, la cornice che si sposta da un rettangolo all'altro, la cucitura arancio).
//
// Si usa un attore invisibile con una proprietà `progress` 0 → 1 e ease_property() della Shell, che
// rispetta "animazioni spente" e le curve di Clutter. L'attore deve stare sullo stage e visibile:
// con un attore non mappato la Shell azzera la durata e salta alla fine.

import Clutter from 'gi://Clutter';
import GObject from 'gi://GObject';
import St from 'gi://St';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';

const Driver = GObject.registerClass({
    Properties: {
        'progress': GObject.ParamSpec.double('progress', null, null, GObject.ParamFlags.READWRITE, 0, 1, 0),
    },
}, class OutkastDriver extends St.Widget {
    _init() {
        super._init({reactive: false, opacity: 0, width: 1, height: 1});
        this._progress = 0;
    }

    get progress() {
        return this._progress;
    }

    set progress(v) {
        if (this._progress === v)
            return;
        this._progress = v;
        this.notify('progress');
    }
});

/** Curve di movimento: l'entrata arriva di scatto e si assesta (expo), l'uscita accelera (cubic). */
export const MODE = {
    IN: Clutter.AnimationMode.EASE_OUT_EXPO,
    OUT: Clutter.AnimationMode.EASE_IN_CUBIC,
    GLIDE: Clutter.AnimationMode.EASE_OUT_EXPO,
};

/**
 * Esegue update(p) con p da 0 a 1 per `duration` ms. Ritorna un oggetto con stop(): ferma subito
 * (done(false) viene comunque chiamato, una volta sola). done(finished) alla fine o allo stop.
 */
export function animate({duration, mode = MODE.IN, update, done}) {
    const driver = new Driver();
    Main.uiGroup.add_child(driver);
    let over = false;

    const finish = finished => {
        if (over)
            return;
        over = true;
        driver.disconnectObject(handle);
        driver.destroy();
        done?.(finished);
    };
    const handle = {stop: () => {
        if (over)
            return;
        driver.remove_all_transitions();
        finish(false);
    }};

    driver.connectObject('notify::progress', () => update(driver.progress), handle);
    update(0);
    driver.ease_property('progress', 1, {
        duration,
        mode,
        onStopped: isFinished => finish(isFinished !== false),
    });
    return handle;
}

export const lerp = (a, b, t) => a + (b - a) * t;
