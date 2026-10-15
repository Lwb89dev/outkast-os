// Gli elementi della Shell che non sono la barra: notifica, OSD, Alt+Tab, dialogo modale, impostazioni rapide.
import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';

export async function run(t) {
    const {Main} = t;
    const out = t.GLib.getenv('SHOT_OUT');
    await t.sleep(2500);
    for (const c of ['gnome-text-editor', 'nautilus'])
        t.spawn(c);
    for (let i = 0; i < 60 && t.windows().length < 2; i++)
        await t.sleep(200);
    await t.sleep(2500);
    const ws = global.get_window_actors().map(a => a.meta_window).filter(w => w.get_window_type() === 0);
    ws[0].move_resize_frame(true, 60, 90, 720, 480);
    ws[1].move_resize_frame(true, 700, 260, 760, 520);
    await t.sleep(1000);

    // notifica
    Main.notify('Outkast', 'Il tema è attivo: filetti, un solo segnale, monospace per i dettagli.');
    await t.sleep(1200);
    await t.shot(`${out}/el-notify.png`);
    await t.sleep(5500);

    // OSD volume
    Main.osdWindowManager.showAll(Gio.ThemedIcon.new('audio-volume-high-symbolic'), 'Volume', 0.62, 1);
    await t.sleep(600);
    await t.shot(`${out}/el-osd.png`);
    await t.sleep(2500);

    // Alt+Tab
    t.keyDown(Clutter.KEY_Alt_L);
    await t.sleep(100);
    t.key(Clutter.KEY_Tab);
    await t.sleep(900);
    await t.shot(`${out}/el-switcher.png`);
    t.keyUp(Clutter.KEY_Alt_L);
    await t.sleep(700);

    // dialogo modale
    const ModalDialog = await import('resource:///org/gnome/shell/ui/modalDialog.js');
    const Dialog = await import('resource:///org/gnome/shell/ui/dialog.js');
    const d = new ModalDialog.ModalDialog({destroyOnClose: true});
    d.contentLayout.add_child(new Dialog.MessageDialogContent({title: 'Chiudere la sessione?', description: 'Le finestre aperte verranno chiuse e le modifiche non salvate andranno perse.'}));
    d.addButton({label: 'Annulla', action: () => d.close(), default: false});
    d.addButton({label: 'Esci', action: () => d.close(), default: true});
    d.open();
    await t.sleep(900);
    await t.shot(`${out}/el-dialog.png`);
    d.close();
    await t.sleep(500);

    // impostazioni rapide con un po' di tutto
    Main.panel.statusArea.quickSettings.menu.open();
    await t.sleep(900);
    await t.shot(`${out}/el-quick.png`);
    Main.panel.statusArea.quickSettings.menu.close();
    await t.sleep(300);

    // attivazione/disattivazione dell'estensione: nessun errore, nessun residuo
    const before = global.stage.get_n_children?.() ?? 0;
    const uuid = 'outkast-shell@outkast-os';
    for (let i = 0; i < 3; i++) {
        Main.extensionManager.disableExtension(uuid);
        await t.sleep(600);
        Main.extensionManager.enableExtension(uuid);
        await t.sleep(900);
    }
    const ext = Main.extensionManager.lookup(uuid);
    console.log(`[steps] stato estensione dopo 3 cicli: ${ext.state} (ENABLED=${1}) errore=${ext.error ?? 'nessuno'}`);
    const groupKids = (g) => g.get_children().length;
    console.log(`[steps] figli window_group=${groupKids(global.window_group)} uiGroup=${groupKids(Main.uiGroup)} leftBox=${groupKids(Main.panel._leftBox)}`);
    await t.shot(`${out}/el-after-cycles.png`);
}
