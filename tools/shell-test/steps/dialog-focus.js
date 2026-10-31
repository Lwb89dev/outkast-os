// «Nuova cartella» di Nautilus e altre interazioni: i contorni di focus non devono invadere i contenitori.
import Clutter from 'gi://Clutter';

export async function run(t) {
    const out = t.GLib.getenv('SHOT_OUT');
    const tag = t.GLib.getenv('SHOT_TAG') ?? 'dlg';
    await t.sleep(2500);
    t.spawn('nautilus');
    for (let i = 0; i < 60 && t.windows().length < 1; i++) await t.sleep(150);
    await t.sleep(2500);
    const w = global.get_window_actors().map(a => a.meta_window).find(x => x.get_window_type() === 0);
    w.move_resize_frame(true, 200, 100, 1000, 640);
    await t.sleep(1000);
    // Ctrl+Maiusc+N: nuova cartella
    t.keyDown(Clutter.KEY_Control_L); t.keyDown(Clutter.KEY_Shift_L);
    t.key(Clutter.KEY_N);
    t.keyUp(Clutter.KEY_Shift_L); t.keyUp(Clutter.KEY_Control_L);
    await t.sleep(1800);
    await t.type('prova');
    await t.sleep(800);
    await t.shot(`${out}/${tag}-newfolder.png`);
    console.log(`[steps] finestre: ${JSON.stringify(t.windows().map(x => [x.app, x.title, x.w, x.h]))}`);
    // Tab dentro il dialogo: il foco va sul pulsante, deve cerchiare solo quello
    t.key(Clutter.KEY_Tab);
    await t.sleep(700);
    await t.shot(`${out}/${tag}-newfolder-tab.png`);
    t.key(Clutter.KEY_Escape);
    await t.sleep(800);
    // un menu con la tastiera (F10) e una Tab: i focus-visible
    t.key(Clutter.KEY_F10);
    await t.sleep(900);
    await t.shot(`${out}/${tag}-menu.png`);
    t.key(Clutter.KEY_Escape);
    await t.sleep(300);
    t.key(Clutter.KEY_Tab); t.key(Clutter.KEY_Tab);
    await t.sleep(700);
    await t.shot(`${out}/${tag}-tab.png`);
}
