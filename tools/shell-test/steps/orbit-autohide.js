// Il portale di Orbit: modalità di visibilità, richiamo col puntatore, apertura col mouse, gesto con il portale nascosto.
import Clutter from 'gi://Clutter';

export async function run(t) {
    const out = t.GLib.getenv('SHOT_OUT');
    const actors = () => global.get_window_actors().filter(a => a.meta_window.get_window_type() === 0);
    await t.sleep(2500);
    const ext = t.ext('outkast-shell@outkast-os');
    const orbit = ext.orbit;
    const portal = orbit._portal;
    const W = global.stage.width, H = global.stage.height;
    const set = (k, v) => typeof v === 'boolean' ? ext.settings.set_boolean(k, v) : ext.settings.set_string(k, v);
    const up = () => Math.abs(portal._actor.translation_y) < 1;
    const state = tag => console.log(`[steps] ${tag}: portale ${up() ? 'VISIBILE' : 'nascosto'} (ty=${Math.round(portal._actor.translation_y)}) coperto=${portal._overlapped} orbit=${orbit.visible}`);

    set('orbit-hover-open', false);
    set('orbit-portal', 'always'); await t.sleep(400); state('always');

    // edge: nascosto finché il puntatore non tocca il bordo
    set('orbit-portal', 'edge'); await t.sleep(500); state('edge, a riposo');
    t.move(W / 2, H / 2); await t.sleep(200);
    t.move(W / 2, H - 1); await t.sleep(500); state('edge, puntatore sul bordo');
    await t.shot(`${out}/autohide-edge-up.png`);
    t.move(W / 2, H / 2); await t.sleep(1300); state('edge, puntatore andato via');

    // smart: visibile sul desktop libero, nascosto se una finestra lo copre
    set('orbit-portal', 'smart'); await t.sleep(500); state('smart, desktop libero');
    t.spawn('gnome-text-editor --new-window');
    for (let i = 0; i < 60 && actors().length < 1; i++) await t.sleep(150);
    await t.sleep(1800);
    const win = actors()[0].meta_window;
    win.maximize(); await t.sleep(1500); state('smart, finestra massimizzata');
    await t.shot(`${out}/autohide-smart-covered.png`);
    t.move(W / 2, H - 1); await t.sleep(500); state('smart, coperto ma col puntatore sul bordo');
    t.move(W / 2, H / 2); await t.sleep(1300);
    win.unmaximize(); await t.sleep(900);
    win.move_resize_frame(true, 60, 70, 520, 400); await t.sleep(1200); state('smart, finestra piccola in alto a sinistra');
    win.move_resize_frame(true, 400, 500, 800, 400); await t.sleep(1200); state('smart, finestra spostata sul portale');

    // apertura col puntatore (hover-open)
    set('orbit-portal', 'edge'); set('orbit-hover-open', true); await t.sleep(500);
    t.move(W / 2, H / 2); await t.sleep(200);
    t.move(W / 2, H - 1);
    await t.sleep(250);
    console.log(`[steps] hover 250ms: orbit=${orbit.visible} (non ancora)`);
    await t.sleep(700);
    console.log(`[steps] hover 950ms: orbit=${orbit.visible} (deve essere true)`);
    t.key(Clutter.KEY_Escape); await t.sleep(1000);
    console.log(`[steps] dopo Esc: orbit=${orbit.visible}`);
    await t.sleep(1500);
    console.log(`[steps] puntatore ancora sul bordo 1.5s dopo: orbit=${orbit.visible} (NON deve riaprirsi da solo)`);

    // senza hover-open il solo passaggio non apre
    set('orbit-hover-open', false); await t.sleep(300);
    t.move(W / 2, H / 2); await t.sleep(300); t.move(W / 2, H - 1); await t.sleep(1200);
    console.log(`[steps] hover-open spento, puntatore sul bordo: orbit=${orbit.visible} (deve essere false)`);
    t.move(W / 2, H / 2); await t.sleep(800);

    // hidden: mai visibile; il gesto a tre dita apre comunque
    set('orbit-portal', 'hidden'); await t.sleep(500); state('hidden');
    const xs = [W / 2 - 80, W / 2, W / 2 + 80];
    xs.forEach((x, i) => t.touch.down(i, x, H * 0.85));
    await t.sleep(80);
    for (let k = 1; k <= 14; k++) { xs.forEach((x, i) => t.touch.move(i, x, H * 0.85 - 34 * k)); await t.sleep(60); }
    await t.sleep(150);
    xs.forEach((_x, i) => t.touch.up(i));
    await t.sleep(1200);
    console.log(`[steps] hidden + tre dita su: orbit=${orbit.visible} (deve essere true)`);
    orbit.hide(); await t.sleep(900);

    // un ciclo di disattivazione con il portale in modalità smart: nessun residuo
    set('orbit-portal', 'smart'); await t.sleep(400);
    const kids = () => global.window_group.get_n_children();
    const before = kids();
    ext.settings.set_boolean('orbit', false); await t.sleep(300);
    ext.settings.set_boolean('orbit', true); await t.sleep(500);
    console.log(`[steps] riacceso: portale=${!!orbit._portal} window_group ${before} → ${kids()}`);
}
