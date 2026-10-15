// Orbit: il portale, il pannello aperto, la navigazione, «tutte le app», il passaggio alla palette, la chiusura.
import Clutter from 'gi://Clutter';

export async function run(t) {
    const out = t.GLib.getenv('SHOT_OUT');
    const actors = () => global.get_window_actors().filter(a => a.meta_window.get_window_type() === 0);
    const wait = async n => { for (let i = 0; i < 80 && actors().length < n; i++) await t.sleep(150); };
    await t.sleep(2500);
    t.spawn('gnome-text-editor');
    await wait(1); await t.sleep(1500);
    t.spawn('nautilus');
    await wait(2); await t.sleep(1800);
    const w = actors().map(a => a.meta_window);
    w[0].move_resize_frame(true, 60, 70, 700, 520);
    w[1].move_resize_frame(true, 700, 200, 760, 520);
    await t.sleep(1200);
    const ext = t.ext('outkast-shell@outkast-os');
    console.log(`[steps] portale: ${ext.orbit._portal ? 'sì' : 'NO'}`);
    await t.shot(`${out}/orbit-portal.png`);

    // si apre con il gesto del portale: un clic
    const p = ext.orbit._portal._actor;
    const [px, py] = p.get_transformed_position();
    t.move(px + p.width / 2, py + p.height / 2);
    await t.sleep(300);
    t.click();
    await t.sleep(1200);
    console.log(`[steps] aperto dopo il clic sul portale: ${ext.orbit.visible}`);
    await t.shot(`${out}/orbit-open.png`);

    // frecce
    t.key(Clutter.KEY_Right); t.key(Clutter.KEY_Down);
    await t.sleep(400);
    await t.shot(`${out}/orbit-nav.png`);

    // «tutte le app»: si arriva alla tessera con Fine+indietro non serve: la attivo direttamente
    ext.orbit._goAll();
    await t.sleep(700);
    await t.shot(`${out}/orbit-apps.png`);
    t.key(Clutter.KEY_Escape);                       // torna a orbit
    await t.sleep(500);
    console.log(`[steps] dopo Esc in «tutte le app»: visibile=${ext.orbit.visible} modo=${ext.orbit._mode}`);
    t.key(Clutter.KEY_Escape);
    await t.sleep(900);
    console.log(`[steps] dopo Esc: visibile=${ext.orbit.visible}`);

    // scorciatoia (via Shell: la tastiera virtuale non passa dai keybinding in modo affidabile, si chiama il toggle)
    ext.orbit.toggle();
    await t.sleep(900);
    // scrivere passa alla palette
    await t.type('fi');
    await t.sleep(900);
    console.log(`[steps] dopo aver scritto «fi»: orbit=${ext.orbit.visible} palette=${ext.launcher.visible} testo=${ext.launcher._entry?.get_text()}`);
    t.key(Clutter.KEY_Escape);
    await t.sleep(600);

    // modalità edge e hidden
    ext.settings.set_string('orbit-portal', 'edge');
    await t.sleep(500);
    console.log(`[steps] edge: ty=${ext.orbit._portal._actor.translation_y} h=${ext.orbit._portal._actor.height}`);
    await t.shot(`${out}/orbit-edge-hidden.png`);
    ext.settings.set_string('orbit-portal', 'hidden');
    await t.sleep(300);
    console.log(`[steps] hidden: ty=${ext.orbit._portal._actor.translation_y} (fuori dallo schermo se > 0)`);
    ext.settings.set_boolean('orbit', false);
    await t.sleep(300);
    console.log(`[steps] orbit spento: portale=${ext.orbit._portal ? 'ancora' : 'rimosso'}`);
}
