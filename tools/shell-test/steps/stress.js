// Casi scomodi: chiusura durante l'apertura, movimento spento a metà animazione, minimizza/ripristina di scatto.
export async function run(t) {
    const actors = () => global.get_window_actors().filter(a => a.meta_window.get_window_type() === 0);
    const waitWins = async n => { for (let i = 0; i < 80 && actors().length < n; i++) await t.sleep(80); };
    const state = a => `clip=${a.has_clip} opacity=${a.opacity} tx=${a.translation_x} ty=${a.translation_y} visible=${a.visible}`;
    const ext = t.ext('outkast-shell@outkast-os');
    await t.sleep(2500);

    // 1. chiusura durante l'apertura
    for (let k = 0; k < 3; k++) {
        t.spawn('gnome-text-editor --new-window');
        await waitWins(1);
        await t.sleep(90);
        actors()[0].meta_window.delete(global.get_current_time());
        await t.sleep(900);
    }
    console.log(`[steps] 1. dopo 3 chiusure durante l'apertura: finestre=${actors().length} in corso=${ext.motion._running.size}`);

    // 2. movimento spento a metà animazione
    t.spawn('gnome-text-editor --new-window');
    await waitWins(1);
    await t.sleep(120);
    ext.settings.set_boolean('motion', false);
    await t.sleep(1200);
    const a = actors()[0];
    console.log(`[steps] 2. movimento spento in volo: ${state(a)} in corso=${ext.motion._running.size}`);
    ext.settings.set_boolean('motion', true);
    await t.sleep(400);

    // 3. minimizza e ripristina di scatto
    const w = a.meta_window;
    w.minimize();
    await t.sleep(60);
    w.unminimize();
    await t.sleep(1500);
    console.log(`[steps] 3. minimizza+ripristina di scatto: minimized=${w.minimized} ${state(a)} in corso=${ext.motion._running.size}`);

    // 4. chiusura finale con il movimento acceso
    w.delete(global.get_current_time());
    await t.sleep(1200);
    console.log(`[steps] 4. chiusura finale: finestre=${actors().length} in corso=${ext.motion._running.size}`);
}
