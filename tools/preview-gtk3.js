#!/usr/bin/env gjs
/*
 * Finestra di prova GTK3 per il tema Outkast. Si lancia con tools/preview.sh gtk3
 *   --dark                forza la variante scura (equivale a GTK_THEME=Outkast:dark)
 *   --ssd                 niente barra del titolo propria: la disegna il compositore (X11 con GTK_CSD=0)
 *   --shot out.png        salva uno screenshot ed esce
 */
imports.gi.versions.Gtk = '3.0';
const { Gtk, GLib } = imports.gi;
const Cairo = imports.cairo;

Gtk.init(null);
const argv = ARGV;
const shot = argv.includes('--shot') ? argv[argv.indexOf('--shot') + 1] : null;

Gtk.Settings.get_default().gtk_decoration_layout = ':minimize,maximize,close';

const win = new Gtk.Window({ default_width: 940, default_height: 700 });
const header = new Gtk.HeaderBar({ show_close_button: true, title: 'Anteprima', subtitle: 'Outkast GTK3' });
header.pack_end(new Gtk.Button({ image: Gtk.Image.new_from_icon_name('open-menu-symbolic', Gtk.IconSize.BUTTON) }));
header.pack_start(new Gtk.Button({ image: Gtk.Image.new_from_icon_name('go-previous-symbolic', Gtk.IconSize.BUTTON) }));
if (!argv.includes('--ssd'))
    win.set_titlebar(header);

const root = new Gtk.Box({ orientation: Gtk.Orientation.HORIZONTAL });
win.add(root);

// Barra laterale
const list = new Gtk.ListBox({ selection_mode: Gtk.SelectionMode.SINGLE });
list.get_style_context().add_class('navigation-sidebar');
for (const [icon, text] of [['user-home-symbolic', 'Home'], ['folder-documents-symbolic', 'Documenti'],
    ['folder-download-symbolic', 'Download'], ['folder-pictures-symbolic', 'Immagini'], ['user-trash-symbolic', 'Cestino']]) {
    const row = new Gtk.ListBoxRow();
    const box = new Gtk.Box({ spacing: 10, margin: 8 });
    box.add(Gtk.Image.new_from_icon_name(icon, Gtk.IconSize.MENU));
    box.add(new Gtk.Label({ label: text, xalign: 0 }));
    row.add(box);
    list.add(row);
}
list.select_row(list.get_row_at_index(1));
const side = new Gtk.ScrolledWindow({ width_request: 200 });
side.get_style_context().add_class('sidebar');
side.add(list);
root.pack_start(side, false, true, 0);
root.add(new Gtk.Separator({ orientation: Gtk.Orientation.VERTICAL }));

// Contenuto
const page = new Gtk.Box({ orientation: Gtk.Orientation.VERTICAL, spacing: 16, margin: 18, hexpand: true });
root.add(page);

const buttons = new Gtk.Box({ spacing: 10 });
buttons.add(new Gtk.Button({ label: 'Predefinito' }));
const suggested = new Gtk.Button({ label: 'Salva' });
suggested.get_style_context().add_class('suggested-action');
buttons.add(suggested);
const destructive = new Gtk.Button({ label: 'Elimina' });
destructive.get_style_context().add_class('destructive-action');
buttons.add(destructive);
const flat = new Gtk.Button({ label: 'Flat' });
flat.get_style_context().add_class('flat');
buttons.add(flat);
const linked = new Gtk.Box();
linked.get_style_context().add_class('linked');
for (const t of ['Giorno', 'Settimana', 'Mese'])
    linked.add(new Gtk.ToggleButton({ label: t, active: t === 'Settimana' }));
buttons.add(linked);
page.add(buttons);

const grid = new Gtk.Grid({ row_spacing: 12, column_spacing: 18 });
grid.attach(new Gtk.Label({ label: 'Wi‑Fi', xalign: 0, hexpand: true }), 0, 0, 1, 1);
grid.attach(new Gtk.Switch({ active: true, halign: Gtk.Align.END }), 1, 0, 1, 1);
grid.attach(new Gtk.Label({ label: 'Bluetooth', xalign: 0 }), 0, 1, 1, 1);
grid.attach(new Gtk.Switch({ active: false, halign: Gtk.Align.END }), 1, 1, 1, 1);
const checks = new Gtk.Box({ spacing: 14 });
const rb1 = new Gtk.RadioButton({ label: 'A', active: true });
checks.add(new Gtk.CheckButton({ label: 'Attiva', active: true }));
checks.add(new Gtk.CheckButton({ label: 'Disattiva' }));
checks.add(rb1);
checks.add(new Gtk.RadioButton({ label: 'B', group: rb1 }));
grid.attach(new Gtk.Label({ label: 'Opzioni', xalign: 0 }), 0, 2, 1, 1);
grid.attach(checks, 1, 2, 1, 1);
page.add(grid);

page.add(new Gtk.Entry({ text: 'outkast-laptop', placeholder_text: 'Nome' }));
page.add(new Gtk.SearchEntry({ placeholder_text: 'Cerca' }));
page.add(new Gtk.SpinButton({ adjustment: new Gtk.Adjustment({ lower: 0, upper: 100, value: 84, step_increment: 1 }) }));
page.add(new Gtk.Scale({ orientation: Gtk.Orientation.HORIZONTAL, draw_value: false,
    adjustment: new Gtk.Adjustment({ lower: 0, upper: 100, value: 62 }) }));
const prog = new Gtk.Box({ spacing: 14 });
prog.pack_start(new Gtk.ProgressBar({ fraction: 0.62, valign: Gtk.Align.CENTER }), true, true, 0);
prog.add(new Gtk.LevelBar({ value: 0.7, width_request: 120, valign: Gtk.Align.CENTER }));
const spinner = new Gtk.Spinner();
spinner.start();
prog.add(spinner);
page.add(prog);

const nb = new Gtk.Notebook();
nb.append_page(new Gtk.Label({ label: 'Un solo segnale', margin: 24 }), new Gtk.Label({ label: 'Generale' }));
nb.append_page(new Gtk.Label({ label: 'Altro' }), new Gtk.Label({ label: 'Avanzate' }));
page.pack_start(nb, true, true, 0);

win.connect('destroy', () => Gtk.main_quit());
win.show_all();

if (shot) {
    GLib.timeout_add(GLib.PRIORITY_DEFAULT, 1200, () => {
        const w = win.get_allocated_width();
        const h = win.get_allocated_height();
        const surface = new Cairo.ImageSurface(Cairo.Format.ARGB32, w, h);
        const cr = new Cairo.Context(surface);
        win.draw(cr);
        surface.writeToPNG(shot);
        print(`salvato ${shot} (${w}x${h})`);
        Gtk.main_quit();
        return GLib.SOURCE_REMOVE;
    });
}
Gtk.main();
