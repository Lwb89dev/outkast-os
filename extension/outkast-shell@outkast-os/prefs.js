// Pannello impostazioni di Outkast: colore segnale, raggi, spaziatura, movimento delle finestre, Orbit, palette.
// Si apre dall'app Estensioni, con `gnome-extensions prefs outkast-shell@outkast-os`, dal menu delle app
// («Impostazioni di Outkast») o dalla palette (Super, poi «impostazioni di outkast»).
//
// I valori stanno nelle impostazioni dell'estensione (dconf): barra, palette e movimento li leggono
// dal vivo. Per il tema, ogni modifica rigenera i CSS (themegen.js) e fa ricaricare la Shell;
// le app GTK già aperte leggono il tema solo all'avvio, quindi vanno chiuse e riaperte.

import Adw from 'gi://Adw';
import Gdk from 'gi://Gdk';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Gtk from 'gi://Gtk';

import {ExtensionPreferences} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

import {ACCENTS, ACCENT_NAMES} from './palette.js';
import {THEME_KEYS, readConfig, renderTheme} from './themegen.js';

/** connect() che si stacca da solo quando il widget sparisce (qui non ci sono gli helper della Shell). */
function watch(source, detail, callback, widget) {
    const id = source.connect(detail, callback);
    widget.connect('destroy', () => source.disconnect(id));
}

const ACCENT_LABELS = {orange: 'Arancio', gold: 'Oro', rose: 'Rosa', blue: 'Blu', green: 'Verde'};

/** Pacchetti di angoli: da «Netti» (Omarchy) a «Morbidi» (l'app Outkast). */
const CORNERS = [
    {id: 'sharp', name: 'Netti', note: 'Rettangoli puri, come un tiling', values: {'corner-radius': 0, 'control-radius': 2}},
    {id: 'soft', name: 'Appena smussati', note: 'Un filo di raggio', values: {'corner-radius': 4, 'control-radius': 4}},
    {id: 'round', name: 'Morbidi', note: 'Più vicino all\'app Outkast', values: {'corner-radius': 10, 'control-radius': 8}},
];

export default class OutkastPreferences extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        this._settings = this.getSettings();
        this._window = window;
        this._renderId = 0;

        window.set_default_size(760, 820);
        window.set_search_enabled(true);
        this._installAccentCss();

        window.add(this._lookPage());
        window.add(this._motionPage());
        window.add(this._paletteBarPage());
        window.add(this._advancedPage());

        // Ogni modifica a una voce del tema rigenera i CSS, con un po' di calma.
        for (const key of THEME_KEYS)
            watch(this._settings, `changed::${key}`, () => this._scheduleRender(), window);
        window.connect('close-request', () => {
            if (this._renderId) {
                GLib.source_remove(this._renderId);
                this._renderId = 0;
                this._renderNow(false);
            }
            return false;
        });
    }

    // ── Tema: rigenerazione ──────────────────────────────────────────────────

    get _themeDir() {
        return GLib.build_filenamev([GLib.get_user_data_dir(), 'themes', 'Outkast']);
    }

    _scheduleRender() {
        if (this._renderId)
            GLib.source_remove(this._renderId);
        this._renderId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 450, () => {
            this._renderId = 0;
            this._renderNow(true);
            return GLib.SOURCE_REMOVE;
        });
    }

    _renderNow(toast) {
        try {
            const changed = renderTheme(this._themeDir, readConfig(this._settings));
            if (changed.length) {
                // il contatore fa ricaricare il tema alla Shell
                this._settings.set_int('theme-serial', this._settings.get_int('theme-serial') + 1);
                if (toast) {
                    this._window.add_toast(new Adw.Toast({
                        title: 'Tema aggiornato. Le app già aperte lo prendono al prossimo avvio.',
                        timeout: 3,
                    }));
                }
            }
        } catch (e) {
            this._window.add_toast(new Adw.Toast({title: `Non riesco a rigenerare il tema: ${e.message}`, timeout: 6}));
        }
    }

    // ── Componenti ───────────────────────────────────────────────────────────

    _installAccentCss() {
        const css = ACCENT_NAMES.map(name => {
            const hex = ACCENTS[name].dark.accent;
            return `.outkast-accent-${name} { background-color: ${hex}; border-radius: 0; min-width: 28px; min-height: 28px; padding: 0; box-shadow: none; } ` +
                `.outkast-accent-${name}:checked { color: ${ACCENTS[name].dark.on}; }`;
        }).join('\n');
        const provider = new Gtk.CssProvider();
        provider.load_from_string(css);
        Gtk.StyleContext.add_provider_for_display(Gdk.Display.get_default(), provider, Gtk.STYLE_PROVIDER_PRIORITY_APPLICATION);
    }

    _switchRow(key, title, subtitle) {
        const row = new Adw.SwitchRow({title, subtitle: subtitle ?? ''});
        this._settings.bind(key, row, 'active', Gio.SettingsBindFlags.DEFAULT);
        return row;
    }

    _spinRow(key, title, subtitle, min, max, step = 1) {
        const row = new Adw.SpinRow({
            title, subtitle: subtitle ?? '',
            adjustment: new Gtk.Adjustment({lower: min, upper: max, step_increment: step, page_increment: step * 5}),
        });
        this._settings.bind(key, row, 'value', Gio.SettingsBindFlags.DEFAULT);
        return row;
    }

    _scaleRow(key, title, subtitle, min, max, step = 5) {
        const row = new Adw.ActionRow({title, subtitle: subtitle ?? ''});
        const scale = new Gtk.Scale({
            orientation: Gtk.Orientation.HORIZONTAL, hexpand: true, valign: Gtk.Align.CENTER, draw_value: true, value_pos: Gtk.PositionType.RIGHT, digits: 0,
            adjustment: new Gtk.Adjustment({lower: min, upper: max, step_increment: step, page_increment: step * 2}),
        });
        scale.set_size_request(260, -1);
        scale.set_value(this._settings.get_int(key));
        scale.connect('value-changed', () => this._settings.set_int(key, Math.round(scale.get_value())));
        watch(this._settings, `changed::${key}`, () => {
            if (Math.round(scale.get_value()) !== this._settings.get_int(key))
                scale.set_value(this._settings.get_int(key));
        }, scale);
        row.add_suffix(scale);
        return row;
    }

    // ── Pagine ───────────────────────────────────────────────────────────────

    _lookPage() {
        const page = new Adw.PreferencesPage({title: 'Aspetto', icon_name: 'applications-graphics-symbolic'});

        // colore segnale: cinque quadrati
        const colors = new Adw.PreferencesGroup({
            title: 'Colore segnale',
            description: 'Uno solo, usato per ciò che è attivo: cornice, selezione, azione principale. L\'arancio è il marchio.',
        });
        const row = new Adw.ActionRow({title: 'Segnale', subtitle: 'Cambia anche le icone al prossimo ./install.sh --accent'});
        const box = new Gtk.Box({spacing: 10, valign: Gtk.Align.CENTER});
        let first = null;
        const buttons = {};
        for (const name of ACCENT_NAMES) {
            const b = new Gtk.ToggleButton({tooltip_text: ACCENT_LABELS[name], css_classes: [`outkast-accent-${name}`]});
            if (first) b.set_group(first); else first = b;
            // la spunta dice quale è attivo (l'anello via CSS verrebbe schiacciato dal tema dei pulsanti)
            b.connect('toggled', () => {
                b.set_icon_name(b.active ? 'object-select-symbolic' : '');
                if (b.active) this._settings.set_string('accent', name);
            });
            box.append(b);
            buttons[name] = b;
        }
        const syncAccent = () => { buttons[this._settings.get_string('accent')]?.set_active(true); };
        syncAccent();
        watch(this._settings, 'changed::accent', syncAccent, box);
        row.add_suffix(box);
        colors.add(row);
        page.add(colors);

        // angoli
        const shape = new Adw.PreferencesGroup({title: 'Angoli', description: 'Il tema nasce squadrato, come Omarchy.'});
        const presets = new Adw.ComboRow({title: 'Stile', model: new Gtk.StringList({strings: [...CORNERS.map(c => c.name), 'Personalizzato']})});
        const syncPreset = () => {
            const cur = CORNERS.findIndex(c => Object.entries(c.values).every(([k, v]) => this._settings.get_int(k) === v));
            presets.selected = cur >= 0 ? cur : CORNERS.length;
        };
        syncPreset();
        presets.connect('notify::selected', () => {
            const c = CORNERS[presets.selected];
            if (c)
                for (const [k, v] of Object.entries(c.values)) this._settings.set_int(k, v);
        });
        for (const k of ['corner-radius', 'control-radius'])
            watch(this._settings, `changed::${k}`, syncPreset, presets);
        shape.add(presets);
        shape.add(this._spinRow('corner-radius', 'Angoli delle finestre', 'Pixel (0 = squadrato)', 0, 16));
        shape.add(this._spinRow('control-radius', 'Angoli di pulsanti e campi', 'Pixel', 0, 12));
        shape.add(this._spinRow('frame-width', 'Spessore della cornice', 'Pixel: finestra attiva, selezione, indicatori', 1, 4));
        page.add(shape);

        const feel = new Adw.PreferencesGroup({title: 'Carattere'});
        feel.add(this._switchRow('compact', 'Spaziature strette', 'Barre del titolo e righe più basse, da strumento di lavoro'));
        feel.add(this._switchRow('mono-accents', 'Monospace per le etichette tecniche',
            'Titoli delle barre, didascalie, orologio, numeri dei workspace. Il testo che si legge resta nel font di sistema.'));
        feel.add(this._switchRow('theme-animations', 'Transizioni nelle app', 'Dissolvenze brevi su pulsanti e righe'));
        page.add(feel);
        return page;
    }

    _motionPage() {
        const page = new Adw.PreferencesPage({title: 'Movimento', icon_name: 'media-playlist-shuffle-symbolic'});

        const g = new Adw.PreferencesGroup({
            title: 'Finestre dai bordi',
            description: 'Una finestra appartiene al bordo dello schermo più vicino: da lì entra, lì viene scacciata quando si chiude, ' +
                'e verso la barra si ritira quando la si minimizza. Sul fronte corre una cucitura arancio.',
        });
        g.add(this._switchRow('motion', 'Movimento in stile Outkast', 'Spento: animazioni predefinite di GNOME'));
        g.add(this._scaleRow('motion-speed', 'Velocità', '100 = normale, 200 = il doppio più veloce, 50 = a rallentatore', 25, 250, 5));
        g.add(this._switchRow('focus-frame', 'Cornice sulla finestra attiva', 'Una cornice arancio che si sposta da una finestra all\'altra al cambio di fuoco'));
        page.add(g);
        return page;
    }

    _paletteBarPage() {
        const page = new Adw.PreferencesPage({title: 'Orbit e palette', icon_name: 'preferences-system-symbolic'});

        const orbit = new Adw.PreferencesGroup({
            title: 'Orbit',
            description: 'Un pannello di tessere (finestre, app preferite, workspace, sistema) che si tira su dal bordo inferiore, ' +
                'come in Outkast: niente dock. Si apre dal portale in basso, con la scorciatoia, con tre dita in su o con la rotella verso l\'alto sul portale.',
        });
        orbit.add(this._switchRow('orbit', 'Orbit', 'Spento: né portale, né scorciatoia, né gesto'));
        orbit.add(this._switchRow('orbit-gesture', 'Gesto a tre dita', 'Tre dita in su sul touchpad o sullo schermo tirano su Orbit seguendo le dita, come la panoramica di GNOME; in giù lo chiudono'));

        const modes = [
            ['always', 'Sempre visibile'],
            ['smart', 'Nascondi se una finestra lo copre'],
            ['edge', 'Nascondi sempre, compare sul bordo'],
            ['hidden', 'Mai visibile'],
        ];
        const portal = new Adw.ComboRow({
            title: 'Portale',
            subtitle: 'La linguetta in basso con i workspace e l\'app attiva. Nascosto, ricompare quando il puntatore tocca il bordo inferiore',
            model: new Gtk.StringList({strings: modes.map(m => m[1])}),
        });
        const syncPortal = () => { portal.selected = Math.max(0, modes.findIndex(m => m[0] === this._settings.get_string('orbit-portal'))); };
        syncPortal();
        portal.connect('notify::selected', () => this._settings.set_string('orbit-portal', modes[portal.selected][0]));
        watch(this._settings, 'changed::orbit-portal', syncPortal, portal);
        orbit.add(portal);

        orbit.add(this._switchRow('orbit-hover-open', 'Apri passando col mouse',
            'Fermare il puntatore un istante sul portale o sul bordo inferiore apre Orbit, senza cliccare'));

        const shortcut = new Adw.EntryRow({
            title: GLib.markup_escape_text('Scorciatoia (es. <Super>o)', -1), show_apply_button: true,
            text: this._settings.get_strv('orbit-shortcut')[0] ?? '',
        });
        shortcut.connect('apply', () => {
            const text = shortcut.text.trim();
            const [ok] = Gtk.accelerator_parse(text);
            if (text && !ok) {
                this._window.add_toast(new Adw.Toast({title: 'Scorciatoia non valida: usa per esempio <Super>o', use_markup: false, timeout: 4}));
                return;
            }
            this._settings.set_strv('orbit-shortcut', text ? [text] : []);
        });
        orbit.add(shortcut);
        page.add(orbit);

        const palette = new Adw.PreferencesGroup({
            title: 'Palette di comandi',
            description: 'Super la apre al posto di Attività: app, finestre, azioni di sistema. «=» calcola, «>» esegue un comando.',
        });
        palette.add(this._switchRow('block-activities', 'Sostituisci Attività con la palette',
            'Toglie il pulsante Attività, l\'angolo attivo e la scorciatoia Super della panoramica. Spegni per riavere la Panoramica di GNOME (il gesto a tre dita resta a Orbit se è acceso).'));
        palette.add(this._scaleRow('launcher-dim', 'Oscuramento dello schermo', 'Percentuale dietro la palette e Orbit', 0, 90, 5));
        page.add(palette);

        const bar = new Adw.PreferencesGroup({title: 'Barra'});
        bar.add(this._switchRow('show-app-name', 'Nome dell\'app in primo piano', 'Accanto ai numeri dei workspace'));
        page.add(bar);
        return page;
    }

    _advancedPage() {
        const page = new Adw.PreferencesPage({title: 'Avanzate', icon_name: 'emblem-system-symbolic'});
        const g = new Adw.PreferencesGroup({title: 'Tema'});

        const nautilus = new Adw.ActionRow({title: 'Chiudi Nautilus', subtitle: 'Le app GNOME leggono il tema solo all\'avvio; Nautilus resta in memoria'});
        const nb = new Gtk.Button({label: 'Chiudi', valign: Gtk.Align.CENTER});
        nb.connect('clicked', () => {
            GLib.spawn_command_line_async('nautilus -q');
            this._window.add_toast(new Adw.Toast({title: 'Nautilus chiuso: riaprilo per vedere il tema.', timeout: 3}));
        });
        nautilus.add_suffix(nb);
        g.add(nautilus);

        const regen = new Adw.ActionRow({title: 'Rigenera il tema', subtitle: 'Riscrive i CSS dai modelli e ricarica la Shell'});
        const rb = new Gtk.Button({label: 'Rigenera', valign: Gtk.Align.CENTER});
        rb.connect('clicked', () => {
            this._renderNow(false);
            this._settings.set_int('theme-serial', this._settings.get_int('theme-serial') + 1);
            this._window.add_toast(new Adw.Toast({title: 'Tema rigenerato.', timeout: 3}));
        });
        regen.add_suffix(rb);
        g.add(regen);

        const folder = new Adw.ActionRow({title: 'Cartella del tema', subtitle: this._themeDir.replace(GLib.get_home_dir(), '~'), activatable: true});
        folder.connect('activated', () =>
            Gio.AppInfo.launch_default_for_uri_async(`file://${this._themeDir}`, null, null, null));
        g.add(folder);
        page.add(g);

        const reset = new Adw.PreferencesGroup({title: 'Valori predefiniti'});
        const rr = new Adw.ActionRow({title: 'Ripristina i valori di Outkast', subtitle: 'Colore, angoli, movimento e palette tornano come all\'installazione'});
        const rbtn = new Gtk.Button({label: 'Ripristina', valign: Gtk.Align.CENTER, css_classes: ['destructive-action']});
        rbtn.connect('clicked', () => {
            for (const key of this._settings.list_keys())
                if (key !== 'theme-serial')
                    this._settings.reset(key);
            this._window.add_toast(new Adw.Toast({title: 'Valori predefiniti ripristinati.', timeout: 3}));
        });
        rr.add_suffix(rbtn);
        reset.add(rr);
        page.add(reset);
        return page;
    }
}
