// Fotogrammi per il README: una finestra centrata entra dal basso; una finestra a sinistra viene scacciata verso il suo bordo.
// Rallentatore: --set motion-speed=10. SHOT_FILE = file da aprire nell'editor.
export async function run(t) {
    const out = t.GLib.getenv('SHOT_OUT');
    const file = t.GLib.getenv('SHOT_FILE');
    const actors = () => global.get_window_actors().filter(a => a.meta_window.get_window_type() === 0);
    const seq = async (name, n, gap) => {
        for (let i = 0; i < n; i++) {
            await t.shot(`${out}/${name}-${String(i).padStart(2, '0')}.png`);
            await t.sleep(gap);
        }
    };
    await t.sleep(2500);
    t.spawn(`gnome-text-editor ${file}`);
    for (let i = 0; i < 80 && actors().length === 0; i++)
        await t.sleep(100);
    await seq('mo-open', 6, 200);
    await t.sleep(3500);

    // verso il bordo sinistro, poi chiusura
    const win = actors()[0].meta_window;
    win.move_resize_frame(true, 0, 60, 780, 780);
    await t.sleep(1500);
    win.delete(global.get_current_time());
    await seq('mo-close', 7, 235);
}
