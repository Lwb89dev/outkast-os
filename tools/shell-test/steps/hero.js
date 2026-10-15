// La scena per il README: editor con codice, File e Impostazioni sullo sfondo del progetto.
// SHOT_TAG = nome del file; SHOT_FILE = file da aprire nell'editor.
export async function run(t) {
    const out = t.GLib.getenv('SHOT_OUT');
    const tag = t.GLib.getenv('SHOT_TAG') ?? 'hero';
    const file = t.GLib.getenv('SHOT_FILE');
    const actors = () => global.get_window_actors().filter(a => a.meta_window.get_window_type() === 0);
    const wait = async n => { for (let i = 0; i < 80 && actors().length < n; i++) await t.sleep(150); };
    await t.sleep(2500);
    t.spawn(`gnome-text-editor ${file}`);
    await wait(1); await t.sleep(1600);
    t.spawn('nautilus');
    await wait(2); await t.sleep(1600);
    t.spawn('gnome-control-center');
    await wait(3); await t.sleep(2200);
    const w = actors().map(a => a.meta_window);
    w[0].move_resize_frame(true, 36, 52, 880, 800);
    w[1].move_resize_frame(true, 946, 52, 618, 380);
    w[2].move_resize_frame(true, 946, 470, 618, 380);
    await t.sleep(1500);
    w[2].activate(global.get_current_time());
    await t.sleep(1800);
    await t.shot(`${out}/${tag}.png`);

    if (t.GLib.getenv('SHOT_ORBIT')) {
        const ext = t.ext('outkast-shell@outkast-os');
        ext.orbit.show();
        await t.sleep(1000);
        await t.shot(`${out}/${tag}-orbit.png`);
        ext.orbit.hide();
        await t.sleep(600);
    }

    const q = t.GLib.getenv('SHOT_PALETTE');
    if (q) {
        const ext = t.ext('outkast-shell@outkast-os');
        ext.launcher.show();
        await t.sleep(700);
        await t.type(q);
        await t.sleep(700);
        await t.shot(`${out}/${tag}-palette.png`);
    }
}
