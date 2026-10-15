#!/usr/bin/env -S gjs -m
/*
 * Apre il pannello impostazioni passando dal VERO percorso dell'app Estensioni (ExtensionPrefsDialog):
 * se prefs.js fallisce, la Shell mostra una pagina d'errore con la traccia, ed è ciò che si vuole vedere.
 *   gjs -m prefs-real.js <cartella-estensione>
 * Variabili: HOST_SHOT_DIR cartella dove salvare uno screenshot per ogni pagina (prefs-N.png), poi esce.
 * Serve GI_TYPELIB_PATH=/usr/lib64/gnome-shell/girepository-1.0 e LD_LIBRARY_PATH=/usr/lib64/gnome-shell (Shew).
 */
import Adw from 'gi://Adw?version=1';
import Gio from 'gi://Gio';
import Gtk from 'gi://Gtk?version=4.0';
import GLib from 'gi://GLib';
import System from 'system';

const [extDir] = System.programArgs;
for (const r of ['org.gnome.Shell.Extensions.src'])
    try { Gio.Resource.load(`/usr/share/gnome-shell/${r}.gresource`)._register(); } catch (e) { print(`risorsa ${r}: ${e.message}`); }
const {ExtensionPrefsDialog} = await import('resource:///org/gnome/Shell/Extensions/js/extensionPrefsDialog.js');

const dir = Gio.File.new_for_path(extDir);
const [, bytes] = dir.get_child('metadata.json').load_contents(null);
const metadata = JSON.parse(new TextDecoder().decode(bytes));

const pagesOf = w => {
    const pages = [];
    const walk = x => {
        if (x instanceof Adw.PreferencesPage) pages.push(x);
        for (let c = x.get_first_child(); c; c = c.get_next_sibling()) walk(c);
    };
    walk(w);
    return pages;
};
const snap = (w, path) => {
    const s = new Gtk.Snapshot();
    new Gtk.WidgetPaintable({widget: w}).snapshot(s, w.get_width(), w.get_height());
    w.get_native().get_renderer().render_texture(s.to_node(), null).save_to_png(path);
    print(`host: salvato ${path}`);
};

const T0 = GLib.get_monotonic_time();
const el = () => Math.round((GLib.get_monotonic_time() - T0) / 1000);
const app = new Adw.Application({application_id: 'org.outkast.PrefsReal', flags: Gio.ApplicationFlags.NON_UNIQUE});
app.connect('activate', () => {
    print(`[${el()}ms] creo il dialogo`);
    const dialog = new ExtensionPrefsDialog({metadata, dir, path: extDir, stateObj: null});
    app.add_window(dialog);
    dialog.connect('loaded', () => {
        const pages = pagesOf(dialog);
        print(`[${el()}ms] host: caricata, titolo «${dialog.title}», pagine: ${pages.map(p => p.title).join(' | ')}`);
        dialog.present();
        const shotDir = GLib.getenv('HOST_SHOT_DIR');
        if (!shotDir)
            return;
        let i = 0;
        GLib.timeout_add(GLib.PRIORITY_DEFAULT, 2500, () => {
            const ps = pagesOf(dialog);
            if (i >= ps.length) { app.quit(); return GLib.SOURCE_REMOVE; }
            dialog.set_visible_page(ps[i]);
            GLib.timeout_add(GLib.PRIORITY_DEFAULT, 700, () => { snap(dialog, `${shotDir}/real-${i}.png`); i++; return GLib.SOURCE_REMOVE; });
            return GLib.SOURCE_CONTINUE;
        });
    });
});
GLib.timeout_add(GLib.PRIORITY_DEFAULT, 20000, () => { print('host: tempo scaduto'); app.quit(); return GLib.SOURCE_REMOVE; });
app.run([]);
