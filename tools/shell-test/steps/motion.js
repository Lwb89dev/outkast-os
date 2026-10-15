// Il movimento delle finestre, a rallentatore: apertura dal bordo, cornice che viaggia, chiusura.
// Si lancia con --set motion-speed=10 (dieci volte più lento) così gli screenshot colgono le fasi.
export async function run(t) {
    const out = t.GLib.getenv('SHOT_OUT');
    const T0 = t.GLib.get_monotonic_time();
    const ms = () => Math.round((t.GLib.get_monotonic_time() - T0) / 1000);
    const log = m => console.log(`[steps] +${ms()}ms ${m}`);
    await t.sleep(2500);

    const seq = async (name, n, gap) => {
        for (let i = 0; i < n; i++) {
            await t.shot(`${out}/${name}-${String(i).padStart(2, '0')}.png`);
            log(`${name} ${i}`);
            await t.sleep(gap);
        }
    };

    // 1. apertura
    t.spawn('gnome-text-editor');
    for (let i = 0; i < 40 && t.windows().length === 0; i++)
        await t.sleep(150);
    log(`finestre: ${JSON.stringify(t.windows())}`);
    await seq('open', 8, 150);
}
