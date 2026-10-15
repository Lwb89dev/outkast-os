#!/usr/bin/env -S gjs -m
/*
 * Apre il pannello impostazioni di un'estensione in una finestra normale, senza passare dall'app Estensioni
 * (serve al banco di prova, dove il servizio D-Bus delle preferenze non è attivabile): istanzia direttamente
 * la classe esportata da prefs.js e le fa riempire una Adw.PreferencesWindow.
 *
 *   gjs -m prefs-host.js <cartella-estensione>
 * Variabili: HOST_SHOT_DIR  cartella dove salvare uno screenshot per ogni pagina (prefs-0.png, …), poi esce;
 *            HOST_QUIT_MS   esce da solo dopo tot millisecondi.
 * Serve GI_TYPELIB_PATH=/usr/lib64/gnome-shell/girepository-1.0 e LD_LIBRARY_PATH=/usr/lib64/gnome-shell (Shew).
 */
import Adw from 'gi://Adw?version=1';
import Gio from 'gi://Gio';
import Gtk from 'gi://Gtk?version=4.0';
import GLib from 'gi://GLib';
import System from 'system';

const [extDir] = System.programArgs;
Gio.Resource.load('/usr/share/gnome-shell/org.gnome.Shell.Extensions.src.gresource')._register();

const dir = Gio.File.new_for_path(extDir);
const [, bytes] = dir.get_child('metadata.json').load_contents(null);
const metadata = {...JSON.parse(new TextDecoder().decode(bytes)), dir, path: extDir};

const pagesOf = win => {
    const pages = [];
    const walk = w => {
        if (w instanceof Adw.PreferencesPage)
            pages.push(w);
        for (let c = w.get_first_child(); c; c = c.get_next_sibling())
            walk(c);
    };
    walk(win);
    return pages;
};

const snap = (win, path) => {
    const snapshot = new Gtk.Snapshot();
    new Gtk.WidgetPaintable({widget: win}).snapshot(snapshot, win.get_width(), win.get_height());
    win.get_native().get_renderer().render_texture(snapshot.to_node(), null).save_to_png(path);
    print(`host: salvato ${path}`);
};

// il modulo prefs.js importa Shew, che sta nelle librerie della Shell
const mod = await import(`file://${extDir}/prefs.js`);

const app = new Adw.Application({application_id: 'org.outkast.PrefsHost', flags: Gio.ApplicationFlags.NON_UNIQUE});
app.connect('activate', () => {
    try {
        const prefs = new mod.default(metadata);
        const win = new Adw.PreferencesWindow({application: app, default_width: 780, default_height: 860});
        prefs.fillPreferencesWindow(win);
        win.present();
        print('host: finestra pronta');

        const shotDir = GLib.getenv('HOST_SHOT_DIR');
        if (shotDir) {
            let i = 0;
            GLib.timeout_add(GLib.PRIORITY_DEFAULT, 2500, () => {
                const pages = pagesOf(win);
                if (i >= pages.length) {
                    app.quit();
                    return GLib.SOURCE_REMOVE;
                }
                win.set_visible_page(pages[i]);
                GLib.timeout_add(GLib.PRIORITY_DEFAULT, 700, () => { snap(win, `${shotDir}/prefs-${i}.png`); i++; return GLib.SOURCE_REMOVE; });
                return GLib.SOURCE_CONTINUE;
            });
        }
    } catch (e) {
        print(`host: ERRORE ${e}\n${e.stack}`);
    }
});
const quitMs = Number(GLib.getenv('HOST_QUIT_MS') ?? 0);
if (quitMs)
    GLib.timeout_add(GLib.PRIORITY_DEFAULT, quitMs, () => { app.quit(); return GLib.SOURCE_REMOVE; });
app.run([]);
