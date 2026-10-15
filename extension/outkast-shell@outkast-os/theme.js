// Carica il CSS della Shell generato dal tema (~/.local/share/themes/Outkast/gnome-shell/gnome-shell.css)
// sopra quello di default, e lo ricarica quando il pannello impostazioni lo rigenera.
//
// Si fa qui, e non con l'estensione User Themes, per due motivi: un'estensione in meno da scaricare,
// e il tema della Shell vive e muore con l'estensione che ne usa le classi (barra, palette, cornice).

import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import St from 'gi://St';

export function shellStylesheetPath() {
    return GLib.build_filenamev([GLib.get_user_data_dir(), 'themes', 'Outkast', 'gnome-shell', 'gnome-shell.css']);
}

export class ThemeLoader {
    constructor(settings) {
        this._settings = settings;
        this._file = null;
        this._load();
        // Il pannello impostazioni rigenera i CSS e cambia questo contatore: qui si ricarica.
        this._settings.connectObject('changed::theme-serial', () => this._reload(), this);
    }

    _theme() {
        return St.ThemeContext.get_for_stage(global.stage).get_theme();
    }

    _load() {
        const file = Gio.File.new_for_path(shellStylesheetPath());
        if (!file.query_exists(null)) {
            console.warn(`Outkast: manca ${file.get_path()} (esegui install.sh o tools/render-theme.js)`);
            return;
        }
        try {
            this._theme().load_stylesheet(file);
            this._file = file;
        } catch (e) {
            console.error(`Outkast: CSS della Shell non valido: ${e.message}`);
        }
    }

    _unload() {
        if (!this._file)
            return;
        try {
            this._theme().unload_stylesheet(this._file);
        } catch (e) {
            // già scaricato
        }
        this._file = null;
    }

    _reload() {
        this._unload();
        this._load();
    }

    destroy() {
        this._settings.disconnectObject(this);
        this._unload();
    }
}
