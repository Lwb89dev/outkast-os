// I gesti del portale: trascinare verso l'alto e rotella verso l'alto (il clic è già in orbit.js).
import Clutter from 'gi://Clutter';

export async function run(t) {
    await t.sleep(2500);
    const ext = t.ext('outkast-shell@outkast-os');
    const p = ext.orbit._portal._actor;
    const [px, py] = p.get_transformed_position();
    const cx = px + p.width / 2, cy = py + p.height / 2;

    // trascinare in su di 40px
    t.move(cx, cy); await t.sleep(200);
    t.press(); await t.sleep(120);
    t.move(cx, cy - 12); await t.sleep(60);
    console.log(`[steps] trascinato 12px: orbit=${ext.orbit.visible} (deve essere false)`);
    t.move(cx, cy - 40); await t.sleep(900);
    console.log(`[steps] trascinato 40px: orbit=${ext.orbit.visible} (deve essere true)`);
    t.release(); await t.sleep(300);
    console.log(`[steps] dopo il rilascio: orbit=${ext.orbit.visible} (resta true: il rilascio non lo richiude)`);
    ext.orbit.hide(); await t.sleep(800);

    // rotella verso l'alto sul portale
    t.move(cx, cy); await t.sleep(200);
    const dev = global.stage.context.get_backend().get_default_seat().create_virtual_device(Clutter.InputDeviceType.POINTER_DEVICE);
    dev.notify_discrete_scroll(global.get_current_time() * 1000, Clutter.ScrollDirection.UP, Clutter.ScrollSource.WHEEL, false);
    await t.sleep(900);
    console.log(`[steps] rotella su: orbit=${ext.orbit.visible}`);
    ext.orbit.hide(); await t.sleep(800);

    // rotella verso il basso: non apre
    dev.notify_discrete_scroll(global.get_current_time() * 1000, Clutter.ScrollDirection.DOWN, Clutter.ScrollSource.WHEEL, false);
    await t.sleep(700);
    console.log(`[steps] rotella giù: orbit=${ext.orbit.visible} (deve essere false)`);
}
