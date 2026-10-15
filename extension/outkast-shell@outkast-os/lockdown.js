// Toglie l'accesso al "menu di GNOME" (Attività / Overview): niente pulsante Attività,
// niente angolo attivo, niente gesto a tre dita, e il tasto Super apre la palette.
//
// Funziona sovrascrivendo (e poi ripristinando) i metodi dell'oggetto Main.overview, che
// resta in vita ma non si può più aprire. Si può spegnere dalle impostazioni.

import * as Main from 'resource:///org/gnome/shell/ui/main.js';

export class Lockdown {
    constructor(launcher, settings) {
        this._launcher = launcher;
        this._settings = settings;
        this._saved = {};
        this._locked = false;

        // Cambiando modalità di sessione (blocco schermo, ecc.) la Shell rilegge il pannello.
        Main.sessionMode.connectObject('updated', () => { if (this._locked) this._hideActivities(); }, this);
        this._settings.connectObject('changed::block-activities', () => this._sync(), this);
        this._sync();
    }

    _sync() {
        if (this._settings.get_boolean('block-activities'))
            this._lock();
        else
            this._unlock();
    }

    _lock() {
        if (this._locked)
            return;
        this._locked = true;
        const overview = Main.overview;
        const launcher = this._launcher;
        const replace = (name, fn) => {
            this._saved[name] = Object.getOwnPropertyDescriptor(overview, name);
            overview[name] = fn;
        };

        // Il tasto Super (overlay-key) chiama toggle(); Super+A chiama showApps().
        replace('toggle', () => launcher.toggle());
        replace('showApps', () => launcher.show());
        replace('show', () => launcher.show());
        replace('shouldToggleByCornerOrButton', () => false);   // angolo attivo e pulsante Attività
        // All'avvio la Shell mostra l'Overview con un'animazione: la saltiamo.
        replace('runStartupAnimation', async () => {});

        if (overview._swipeTracker)
            overview._swipeTracker.enabled = false;             // gesto a tre dita

        // Se l'Overview è già aperto (estensione attivata a sessione in corso) lo chiude.
        if (overview.visible)
            overview.hide();

        this._hideActivities();
    }

    _unlock() {
        if (!this._locked)
            return;
        this._locked = false;
        const overview = Main.overview;

        for (const [name, desc] of Object.entries(this._saved)) {
            // Se la proprietà era sul prototipo basta cancellare quella d'istanza.
            if (desc)
                Object.defineProperty(overview, name, desc);
            else
                delete overview[name];
        }
        this._saved = {};

        if (overview._swipeTracker)
            overview._swipeTracker.enabled = true;

        const activities = Main.panel.statusArea.activities;
        if (activities)
            activities.container.show();
    }

    _hideActivities() {
        const activities = Main.panel.statusArea.activities;
        if (activities)
            activities.container.hide();
    }

    destroy() {
        Main.sessionMode.disconnectObject(this);
        this._settings.disconnectObject(this);
        this._unlock();
    }
}
