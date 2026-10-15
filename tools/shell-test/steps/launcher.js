// La palette: vuota, con una ricerca, con un calcolo, con un comando. Poi un tasto Super vero.
import Clutter from 'gi://Clutter';

export async function run(t) {
    const out = t.GLib.getenv('SHOT_OUT');
    await t.sleep(2500);
    t.spawn('gnome-text-editor');
    for (let i = 0; i < 40 && t.windows().length === 0; i++)
        await t.sleep(150);
    await t.sleep(1200);

    const ext = t.ext('outkast-shell@outkast-os');
    ext.launcher.show();
    await t.sleep(900);
    await t.shot(`${out}/pal-empty.png`);

    await t.type('te');
    await t.sleep(500);
    await t.shot(`${out}/pal-te.png`);

    // giù due volte
    t.key(Clutter.KEY_Down); t.key(Clutter.KEY_Down);
    await t.sleep(300);
    await t.shot(`${out}/pal-down.png`);

    ext.launcher._entry.set_text('');
    await t.type('=2+2*3');
    await t.sleep(400);
    await t.shot(`${out}/pal-calc.png`);

    ext.launcher._entry.set_text('');
    await t.type('>echo ciao');
    await t.sleep(400);
    await t.shot(`${out}/pal-run.png`);

    ext.launcher._entry.set_text('');
    await t.type('xyzq');
    await t.sleep(400);
    await t.shot(`${out}/pal-none.png`);

    t.key(Clutter.KEY_Escape);
    await t.sleep(700);
    console.log(`[steps] visibile dopo Esc: ${ext.launcher.visible}`);

    // il tasto Super vero (Overlay key) apre la palette
    t.key(Clutter.KEY_Super_L);
    await t.sleep(900);
    console.log(`[steps] visibile dopo Super: ${ext.launcher.visible}`);
    t.key(Clutter.KEY_Escape);
    await t.sleep(500);
}
