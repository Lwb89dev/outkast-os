// Barra superiore: a sinistra i workspace come numeri in monospace (quello attivo ha una
// sottolineatura arancio che scivola da uno all'altro), poi il nome dell'app in primo piano.
// L'orologio, le impostazioni rapide e la tray restano quelli di GNOME.

import Clutter from 'gi://Clutter';
import Shell from 'gi://Shell';
import St from 'gi://St';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';

const GLIDE_MS = 260;

export class Bar {
    constructor(settings) {
        this._settings = settings;
        this._workspaces = [];       // workspace a cui siamo agganciati (per i segnali window-added/removed)
        this._chips = [];

        // radice = scatola dei chip + sottolineatura sovrapposta (BinLayout: i figli si sovrappongono)
        this._root = new St.Widget({
            name: 'outkast-ws-root',
            layout_manager: new Clutter.BinLayout(),
            y_expand: true,
            y_align: Clutter.ActorAlign.FILL,
            reactive: true,
        });
        this._box = new St.BoxLayout({style_class: 'outkast-ws', y_expand: true});
        this._marker = new St.Widget({
            style_class: 'outkast-ws-marker',
            // con BinLayout l'allineamento vale solo se l'attore può espandersi, altrimenti resta al centro
            x_expand: true, y_expand: true,
            x_align: Clutter.ActorAlign.START,
            y_align: Clutter.ActorAlign.END,
            width: 0,
        });
        this._root.add_child(this._box);
        this._root.add_child(this._marker);

        this._app = new St.Label({
            style_class: 'outkast-appname',
            y_align: Clutter.ActorAlign.CENTER,
            y_expand: false,
        });

        Main.panel._leftBox.insert_child_at_index(this._root, 0);
        Main.panel._leftBox.insert_child_at_index(this._app, 1);

        // Gli handler sono legati ai nostri attori (non a `this`): se la Shell li distrugge prima
        // di disable() (spegnimento) si scollegano da soli, senza toccare attori già eliminati.
        this._root.connectObject('scroll-event', (_a, ev) => Main.wm.handleWorkspaceScroll(ev), this._root);
        this._box.connectObject('notify::allocation', () => this._syncMarker(false), this._box);

        global.workspace_manager.connectObject(
            'workspace-added', () => this._rebuild(),
            'workspace-removed', () => this._rebuild(),
            'workspaces-reordered', () => this._rebuild(),
            'active-workspace-changed', () => this._onActiveChanged(),
            this._root);

        this._tracker = Shell.WindowTracker.get_default();
        this._tracker.connectObject('notify::focus-app', () => this._syncApp(), this._app);
        this._settings.connectObject('changed::show-app-name', () => this._syncApp(), this._app);

        this._rebuild();
        this._syncApp();
    }

    // ── Workspace ────────────────────────────────────────────────────────────

    _rebuild() {
        for (const ws of this._workspaces)
            ws.disconnectObject(this._root);
        this._workspaces = [];
        this._box.destroy_all_children();
        this._chips = [];

        const wm = global.workspace_manager;
        for (let i = 0; i < wm.n_workspaces; i++) {
            const ws = wm.get_workspace_by_index(i);
            ws.connectObject(
                'window-added', () => this._syncChips(),
                'window-removed', () => this._syncChips(),
                this._root);
            this._workspaces.push(ws);

            const chip = new St.Button({
                style_class: 'outkast-ws-chip',
                reactive: true,
                can_focus: true,
                track_hover: true,
                y_expand: true,
                child: new St.Label({text: String(i + 1), y_align: Clutter.ActorAlign.CENTER}),
            });
            chip.connect('clicked', () => ws.activate(global.get_current_time()));
            this._box.add_child(chip);
            this._chips.push(chip);
        }
        this._syncChips();
    }

    _syncChips() {
        const active = global.workspace_manager.get_active_workspace_index();
        this._workspaces.forEach((ws, i) => {
            const chip = this._chips[i];
            if (!chip)
                return;
            const occupied = ws.list_windows().some(w => !w.is_on_all_workspaces() && !w.skip_taskbar);
            if (occupied) chip.add_style_class_name('occupied'); else chip.remove_style_class_name('occupied');
            if (i === active) chip.add_style_class_name('active'); else chip.remove_style_class_name('active');
        });
        this._syncMarker(false);
    }

    _onActiveChanged() {
        this._syncChips();
        this._syncMarker(true);
    }

    _syncMarker(animate) {
        const active = global.workspace_manager.get_active_workspace_index();
        const chip = this._chips[active];
        if (!chip)
            return;
        const box = chip.get_allocation_box();
        const x = box.x1, w = box.x2 - box.x1;
        if (w <= 0)
            return;                 // layout non ancora fatto: arriverà notify::allocation
        this._marker.remove_all_transitions();
        if (!animate || this._marker.width === 0) {
            this._marker.set({translation_x: x, width: w});
            return;
        }
        this._marker.ease({
            translation_x: x, width: w,
            duration: GLIDE_MS, mode: Clutter.AnimationMode.EASE_OUT_EXPO,
        });
    }

    /** Rettangolo (coordinate stage) del chip di un workspace: lì "si ritirano" le finestre minimizzate. */
    chipRect(index = global.workspace_manager.get_active_workspace_index()) {
        const chip = this._chips[index] ?? this._chips[0];
        if (!chip)
            return null;
        const [x, y] = chip.get_transformed_position();
        const [w, h] = chip.get_transformed_size();
        return Number.isFinite(x) ? {x, y, width: w, height: h} : null;
    }

    /** Un breve lampo sul chip: una finestra è appena entrata o uscita di lì. */
    ping(index = global.workspace_manager.get_active_workspace_index()) {
        const chip = this._chips[index];
        if (!chip)
            return;
        chip.remove_all_transitions();
        chip.opacity = 90;
        chip.ease({opacity: 255, duration: 320, mode: Clutter.AnimationMode.EASE_OUT_QUAD});
    }

    // ── Nome dell'app ────────────────────────────────────────────────────────

    _syncApp() {
        const app = this._tracker.focus_app;
        this._app.text = app ? app.get_name() : '';
        this._app.visible = this._settings.get_boolean('show-app-name') && !!app;
    }

    destroy() {
        this._settings.disconnectObject(this._app);
        this._tracker.disconnectObject(this._app);
        global.workspace_manager.disconnectObject(this._root);
        for (const ws of this._workspaces)
            ws.disconnectObject(this._root);
        this._root.destroy();
        this._app.destroy();
        this._chips = [];
        this._workspaces = [];
    }
}
