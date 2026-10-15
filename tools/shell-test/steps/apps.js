// Le app GTK reali con il tema: una schermata con più finestre affiancate.
export async function run(t) {
    const out = t.GLib.getenv('SHOT_OUT');
    const tag = t.GLib.getenv('SHOT_TAG') ?? 'apps';
    const actors = () => global.get_window_actors().filter(a => a.meta_window.get_window_type() === 0);
    const wait = async n => { for (let i = 0; i < 80 && actors().length < n; i++) await t.sleep(150); };
    await t.sleep(2500);
    const cmds = (t.GLib.getenv('SHOT_APPS') ?? 'gnome-text-editor,nautilus,kgx').split(',');
    let n = 0;
    for (const c of cmds) {
        t.spawn(c);
        n++;
        await wait(n);
        await t.sleep(1800);
    }
    // griglia 2×2 sullo schermo 1600×900 (sotto la barra)
    const wins = actors().map(a => a.meta_window);
    const cells = [[10, 40, 780, 410], [810, 40, 780, 410], [10, 470, 780, 420], [810, 470, 780, 420]];
    wins.forEach((w, i) => { const c = cells[i % 4]; w.move_resize_frame(true, c[0], c[1], c[2], c[3]); });
    await t.sleep(1500);
    await t.shot(`${out}/${tag}.png`);
    console.log(`[steps] finestre: ${JSON.stringify(t.windows().map(w => w.app))}`);
}
