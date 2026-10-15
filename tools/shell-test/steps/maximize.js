// Massimizza, schermo intero e ripristino: la cornice si ritira e torna.
export async function run(t) {
    const out = t.GLib.getenv('SHOT_OUT');
    await t.sleep(2500);
    t.spawn('gnome-text-editor');
    for (let i = 0; i < 60 && t.windows().length === 0; i++)
        await t.sleep(200);
    await t.sleep(2000);
    const win = global.get_window_actors().map(a => a.meta_window).find(w => w.get_window_type() === 0);
    const frame = () => {
        const f = t.ext('outkast-shell@outkast-os').frame._actor;
        return `visible=${f.visible} opacity=${f.opacity} rect=${Math.round(f.x)},${Math.round(f.y)} ${Math.round(f.width)}x${Math.round(f.height)}`;
    };
    console.log(`[steps] normale: ${frame()}`);
    win.maximize();
    await t.sleep(1500);
    console.log(`[steps] massimizzata (${win.is_maximized()}): ${frame()}`);
    await t.shot(`${out}/max-1.png`);
    win.unmaximize();
    await t.sleep(1500);
    console.log(`[steps] ripristinata: ${frame()}`);
    await t.shot(`${out}/max-2.png`);
    win.make_fullscreen();
    await t.sleep(1500);
    console.log(`[steps] schermo intero: ${frame()}`);
    win.unmake_fullscreen();
    await t.sleep(1500);
    console.log(`[steps] fine: ${frame()}`);
    // chiusura normale con la finestra massimizzata: deve uscire dal basso senza residui
    win.maximize();
    await t.sleep(1200);
    win.delete(global.get_current_time());
    await t.sleep(1500);
    console.log(`[steps] dopo chiusura: finestre=${t.windows().length} ${frame()}`);
}
