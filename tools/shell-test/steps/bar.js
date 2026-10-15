// La barra, il menu delle impostazioni rapide e il calendario.
export async function run(t) {
    const {Main} = t;
    const out = t.GLib.getenv('SHOT_OUT');
    await t.sleep(3000);
    await t.shot(`${out}/bar-idle.png`);

    // cambio workspace (la sottolineatura scivola)
    const wm = global.workspace_manager;
    while (wm.n_workspaces < 4)
        wm.append_new_workspace(false, global.get_current_time());
    await t.sleep(500);
    wm.get_workspace_by_index(2).activate(global.get_current_time());
    await t.sleep(700);
    await t.shot(`${out}/bar-ws3.png`);

    Main.panel.statusArea.quickSettings.menu.open();
    await t.sleep(900);
    await t.shot(`${out}/bar-quick.png`);
    Main.panel.statusArea.quickSettings.menu.close();
    await t.sleep(400);

    Main.panel.statusArea.dateMenu.menu.open();
    await t.sleep(900);
    await t.shot(`${out}/bar-calendar.png`);
    Main.panel.statusArea.dateMenu.menu.close();
    await t.sleep(300);
}
