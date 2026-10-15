// Cornice che viaggia, chiusura verso il bordo, minimizza e ripristina. Rallentatore: --set motion-speed=10
export async function run(t) {
    const out = t.GLib.getenv('SHOT_OUT');
    const T0 = t.GLib.get_monotonic_time();
    const ms = () => Math.round((t.GLib.get_monotonic_time() - T0) / 1000);
    const log = m => console.log(`[steps] +${ms()}ms ${m}`);
    const actors = () => global.get_window_actors().filter(a => a.meta_window.get_window_type() === 0);
    const waitWins = async n => { for (let i = 0; i < 60 && actors().length < n; i++) await t.sleep(150); };
    const seq = async (name, n, gap) => {
        for (let i = 0; i < n; i++) {
            await t.shot(`${out}/${name}-${String(i).padStart(2, '0')}.png`);
            log(`${name} ${i}`);
            await t.sleep(gap);
        }
    };
    await t.sleep(2500);

    // due finestre in posti diversi (la prima a sinistra, la seconda a destra)
    t.spawn('gnome-text-editor');
    await waitWins(1);
    await t.sleep(4500);                       // lascia finire l'apertura (rallentata)
    t.spawn('gnome-text-editor --new-window');
    await waitWins(2);
    await t.sleep(4500);
    const [a, b] = actors().map(x => x.meta_window);
    a.move_resize_frame(true, 60, 90, 640, 460);
    b.move_resize_frame(true, 880, 300, 640, 460);
    await t.sleep(600);
    log(`finestre: ${JSON.stringify(t.windows())}`);
    await t.shot(`${out}/pre.png`);

    // 1. cambio di fuoco: la cornice viaggia dalla finestra attiva all'altra
    const target = a.has_focus() ? b : a;
    target.activate(global.get_current_time());
    await seq('travel', 6, 120);
    await t.sleep(2500);

    // 2. minimizza la finestra attiva
    const act = global.display.focus_window;
    act.minimize();
    await seq('minimize', 6, 140);
    await t.sleep(2500);

    // 3. ripristino
    act.unminimize();
    await seq('restore', 6, 140);
    await t.sleep(2500);

    // 4. chiusura
    global.display.focus_window.delete(global.get_current_time());
    await seq('close', 6, 130);
}
