#!/usr/bin/env -S gjs -m
// Apre il pannello impostazioni di Outkast in una finestra normale, senza passare dalla Shell.
//
// Serve quando la Shell non conosce ancora l'estensione (appena installata, prima di un nuovo accesso):
// `gnome-extensions prefs` risponde «non esiste» e non apre nulla. Qui si istanzia direttamente la classe
// di prefs.js e le si fa riempire una Adw.PreferencesWindow, come farebbe l'app Estensioni.
//
//   outkast-settings            (script di accompagnamento: prova prima l'app Estensioni, poi questo)
//   gjs -m prefs-standalone.js <cartella-estensione>
//
// Se qualcosa va storto la finestra mostra l'errore invece di sparire in silenzio.

import Adw from 'gi://Adw?version=1';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import System from 'system';

const dir = Gio.File.new_for_path(System.programArgs[0] ?? GLib.path_get_dirname(GLib.filename_from_uri(import.meta.url)[0]));
const path = dir.get_path();

const app = new Adw.Application({application_id: 'org.outkast.Settings', flags: Gio.ApplicationFlags.NON_UNIQUE});

function errorWindow(e) {
    const win = new Adw.Window({application: app, title: 'Impostazioni di Outkast', default_width: 640, default_height: 420});
    const page = new Adw.StatusPage({
        icon_name: 'dialog-warning-symbolic',
        title: 'Non riesco ad aprire le impostazioni',
        description: `${e.message ?? e}`,
    });
    const box = new Adw.ToolbarView({content: page});
    box.add_top_bar(new Adw.HeaderBar());
    win.set_content(box);
    win.present();
    printerr(`outkast-settings: ${e}\n${e.stack ?? ''}`);
}

app.connect('activate', async () => {
    // L'import è asincrono: senza hold() l'app, che a questo punto non ha ancora finestre, si chiude prima di crearle.
    app.hold();
    try {
        // il modulo ExtensionPreferences vive nelle risorse dell'app Estensioni
        for (const base of ['/usr/share/gnome-shell', '/usr/local/share/gnome-shell', ...GLib.get_system_data_dirs().map(d => `${d}/gnome-shell`)]) {
            const file = `${base}/org.gnome.Shell.Extensions.src.gresource`;
            if (GLib.file_test(file, GLib.FileTest.EXISTS)) {
                Gio.Resource.load(file)._register();
                break;
            }
        }
        const [, bytes] = dir.get_child('metadata.json').load_contents(null);
        const metadata = {...JSON.parse(new TextDecoder().decode(bytes)), dir, path};

        const mod = await import(dir.get_child('prefs.js').get_uri());
        const prefs = new mod.default(metadata);
        const win = new Adw.PreferencesWindow({application: app, title: 'Impostazioni di Outkast'});
        await prefs.fillPreferencesWindow(win);
        win.present();
    } catch (e) {
        errorWindow(e);
    } finally {
        app.release();
    }
});

app.run([]);
