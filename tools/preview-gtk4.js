#!/usr/bin/env -S gjs -m
/*
 * Finestra di prova GTK4 / libadwaita. Di solito si lancia tramite tools/preview.sh,
 * che carica il tema nel modo in cui lo carica il sistema (~/.config/gtk-4.0/gtk.css):
 * solo così @media (prefers-color-scheme) funziona come nelle app vere.
 *
 *   tools/preview.sh                        # apre la finestra con il tema
 *   tools/preview.sh --scheme light         # forza chiaro / scuro
 *   tools/preview.sh --no-css               # libadwaita liscio, per confronto
 *   tools/preview.sh --shot out.png         # salva uno screenshot ed esce
 *
 * Con --shot salva anche out-popover.png (menu aperto) e out-dialog.png.
 */
import Gtk from 'gi://Gtk?version=4.0';
import Adw from 'gi://Adw?version=1';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import System from 'system';

const argv = System.programArgs;
const opt = (name, def = null) => {
    const i = argv.indexOf(name);
    return i >= 0 ? (argv[i + 1] ?? true) : def;
};

const scheme = opt('--scheme', 'dark');
const shot = opt('--shot');

const app = new Adw.Application({
    application_id: 'org.outkast.Preview',
    flags: Gio.ApplicationFlags.NON_UNIQUE,
});

function row(icon, text, selected = false) {
    const box = new Gtk.Box({ spacing: 10, margin_top: 6, margin_bottom: 6, margin_start: 6, margin_end: 6 });
    box.append(new Gtk.Image({ icon_name: icon }));
    box.append(new Gtk.Label({ label: text, xalign: 0, hexpand: true }));
    return box;
}

function buildSidebar() {
    const list = new Gtk.ListBox({ css_classes: ['navigation-sidebar'] });
    const items = [
        ['user-home-symbolic', 'Home'],
        ['folder-documents-symbolic', 'Documenti'],
        ['folder-download-symbolic', 'Download'],
        ['folder-pictures-symbolic', 'Immagini'],
        ['folder-music-symbolic', 'Musica'],
        ['user-trash-symbolic', 'Cestino'],
    ];
    for (const [i, t] of items)
        list.append(row(i, t));
    list.select_row(list.get_row_at_index(1));

    const header = new Adw.HeaderBar({ show_title: false });
    const view = new Adw.ToolbarView({ content: new Gtk.ScrolledWindow({ child: list, vexpand: true }) });
    view.add_top_bar(header);
    return new Adw.NavigationPage({ title: 'Outkast', child: view });
}

function buildContent(win) {
    const menu = Gio.Menu.new();
    menu.append('Nuova finestra', 'app.none');
    menu.append('Preferenze', 'app.none');
    const section = Gio.Menu.new();
    section.append('Scorciatoie da tastiera', 'app.none');
    section.append('Informazioni', 'app.none');
    menu.append_section(null, section);

    const menuButton = new Gtk.MenuButton({ icon_name: 'open-menu-symbolic', menu_model: menu });
    const header = new Adw.HeaderBar({
        title_widget: new Adw.WindowTitle({ title: 'Anteprima', subtitle: 'Outkast' }),
    });
    header.pack_start(new Gtk.Button({ icon_name: 'go-previous-symbolic' }));
    header.pack_end(menuButton);
    header.pack_end(new Gtk.ToggleButton({ icon_name: 'system-search-symbolic' }));

    const page = new Gtk.Box({ orientation: Gtk.Orientation.VERTICAL, spacing: 18,
        margin_top: 18, margin_bottom: 18, margin_start: 18, margin_end: 18 });

    // Pulsanti
    const buttons = new Gtk.Box({ spacing: 10, halign: Gtk.Align.START });
    buttons.append(new Gtk.Button({ label: 'Predefinito' }));
    buttons.append(new Gtk.Button({ label: 'Salva', css_classes: ['suggested-action'] }));
    buttons.append(new Gtk.Button({ label: 'Elimina', css_classes: ['destructive-action'] }));
    buttons.append(new Gtk.Button({ label: 'Flat', css_classes: ['flat'] }));
    buttons.append(new Gtk.Button({ label: 'Pillola', css_classes: ['pill', 'suggested-action'] }));
    buttons.append(new Gtk.Button({ icon_name: 'list-add-symbolic', css_classes: ['circular'] }));
    const linked = new Gtk.Box({ css_classes: ['linked'] });
    for (const t of ['Giorno', 'Settimana', 'Mese'])
        linked.append(new Gtk.ToggleButton({ label: t, active: t === 'Settimana' }));
    buttons.append(linked);
    page.append(buttons);

    // Controlli
    const group = new Adw.PreferencesGroup({ title: 'Controlli', description: 'Interruttori, selettori e cursori' });
    group.add(new Adw.SwitchRow({ title: 'Wi‑Fi', subtitle: 'Connesso a Outkast-5G', active: true }));
    group.add(new Adw.SwitchRow({ title: 'Bluetooth', active: false }));
    const combo = new Adw.ComboRow({ title: 'Sfondo', model: Gtk.StringList.new(['Outkast', 'Mezzanotte', 'Carta']) });
    group.add(combo);
    group.add(new Adw.SpinRow({ title: 'Opacità', adjustment: new Gtk.Adjustment({ lower: 0, upper: 100, value: 84, step_increment: 1 }) }));
    group.add(new Adw.EntryRow({ title: 'Nome del dispositivo', text: 'outkast-laptop' }));
    const scaleRow = new Adw.ActionRow({ title: 'Luminosità' });
    scaleRow.add_suffix(new Gtk.Scale({ orientation: Gtk.Orientation.HORIZONTAL, width_request: 220, valign: Gtk.Align.CENTER,
        adjustment: new Gtk.Adjustment({ lower: 0, upper: 100, value: 62 }) }));
    group.add(scaleRow);
    const checks = new Adw.ActionRow({ title: 'Opzioni' });
    const cb1 = new Gtk.CheckButton({ label: 'Attiva', active: true });
    const cb2 = new Gtk.CheckButton({ label: 'Disattiva' });
    const rb1 = new Gtk.CheckButton({ label: 'A', active: true });
    const rb2 = new Gtk.CheckButton({ label: 'B', group: rb1 });
    for (const w of [cb1, cb2, rb1, rb2]) {
        w.valign = Gtk.Align.CENTER;
        checks.add_suffix(w);
    }
    group.add(checks);
    page.append(group);

    // Progresso
    const prog = new Gtk.Box({ spacing: 14, valign: Gtk.Align.CENTER });
    prog.append(new Gtk.ProgressBar({ fraction: 0.62, hexpand: true, valign: Gtk.Align.CENTER }));
    prog.append(new Gtk.LevelBar({ value: 0.7, min_value: 0, max_value: 1, width_request: 120, valign: Gtk.Align.CENTER }));
    prog.append(new Gtk.Spinner({ spinning: true }));
    prog.append(new Gtk.SearchEntry({ placeholder_text: 'Cerca', width_request: 180 }));
    page.append(prog);

    // Carta
    const card = new Gtk.Box({ css_classes: ['card'], orientation: Gtk.Orientation.VERTICAL, spacing: 4,
        margin_bottom: 6 });
    card.append(new Gtk.Label({ label: 'Un solo segnale', css_classes: ['title-3'], xalign: 0,
        margin_top: 14, margin_start: 14, margin_end: 14 }));
    card.append(new Gtk.Label({ label: 'Mezzanotte piatta, filetti da 1px e monospace solo per i dettagli.',
        css_classes: ['dim-label'], xalign: 0, wrap: true, margin_bottom: 14, margin_start: 14, margin_end: 14 }));
    page.append(card);

    const scroller = new Gtk.ScrolledWindow({ vexpand: true, hscrollbar_policy: Gtk.PolicyType.NEVER,
        child: new Adw.Clamp({ maximum_size: 720, child: page }) });
    const view = new Adw.ToolbarView({ content: scroller });
    view.add_top_bar(header);

    return { page: new Adw.NavigationPage({ title: 'Anteprima', child: view }), menuButton };
}

function snapshotTo(widget, path) {
    const w = widget.get_width();
    const h = widget.get_height();
    const paintable = new Gtk.WidgetPaintable({ widget });
    const snapshot = new Gtk.Snapshot();
    paintable.snapshot(snapshot, w, h);
    const node = snapshot.to_node();
    const renderer = widget.get_native().get_renderer();
    const texture = renderer.render_texture(node, null);
    texture.save_to_png(path);
    print(`salvato ${path} (${w}x${h})`);
}

app.connect('activate', () => {
    // Pulsanti finestra a destra (in sessione lo imposta l'installer via gsettings).
    Gtk.Settings.get_default().gtk_decoration_layout = opt('--layout', ':minimize,maximize,close');
    Adw.StyleManager.get_default().color_scheme = {
        light: Adw.ColorScheme.FORCE_LIGHT,
        dark: Adw.ColorScheme.FORCE_DARK,
    }[scheme] ?? Adw.ColorScheme.DEFAULT;

    const win = new Adw.ApplicationWindow({ application: app, default_width: 980, default_height: 780 });
    const split = new Adw.NavigationSplitView({ sidebar_width_fraction: 0.26 });
    const { page, menuButton } = buildContent(win);
    split.sidebar = buildSidebar();
    split.content = page;
    win.content = split;
    win.present();

    if (!shot)
        return;

    const base = shot.replace(/\.png$/, '');
    GLib.timeout_add(GLib.PRIORITY_DEFAULT, 900, () => {
        snapshotTo(win, shot);
        menuButton.popup();
        return GLib.SOURCE_REMOVE;
    });
    GLib.timeout_add(GLib.PRIORITY_DEFAULT, 1500, () => {
        const pop = menuButton.get_popover();
        snapshotTo(pop, `${base}-popover.png`);
        pop.popdown();
        const dialog = Adw.AlertDialog.new('Eliminare il file?', 'L’operazione non può essere annullata.');
        dialog.add_response('cancel', 'Annulla');
        dialog.add_response('delete', 'Elimina');
        dialog.set_response_appearance('delete', Adw.ResponseAppearance.DESTRUCTIVE);
        dialog.present(win);
        return GLib.SOURCE_REMOVE;
    });
    GLib.timeout_add(GLib.PRIORITY_DEFAULT, 2300, () => {
        snapshotTo(win, `${base}-dialog.png`);
        app.quit();
        return GLib.SOURCE_REMOVE;
    });
});

app.run([]);
