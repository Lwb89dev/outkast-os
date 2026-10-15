// Orbit: scorciatoia vera, toggle ripetuto, clic centrale che chiude una finestra, disattivazione dell'estensione con Orbit aperto.
import Clutter from 'gi://Clutter';

export async function run(t) {
    const {Main} = t;
    const actors = () => global.get_window_actors().filter(a => a.meta_window.get_window_type() === 0);
    await t.sleep(2500);
    t.spawn('gnome-text-editor --new-window');
    for (let i = 0; i < 60 && actors().length < 1; i++) await t.sleep(150);
    await t.sleep(1800);
    const ext = t.ext('outkast-shell@outkast-os');
    const kids = () => `ui=${Main.uiGroup.get_n_children()} chrome=${Main.layoutManager._trackedActors?.length ?? '?'}`;
    const base = kids();

    // 1. Super+O con tasti veri
    t.keyDown(Clutter.KEY_Super_L);
    t.key(Clutter.KEY_o);
    t.keyUp(Clutter.KEY_Super_L);
    await t.sleep(900);
    console.log(`[steps] 1. Super+O: orbit=${ext.orbit.visible}`);
    t.keyDown(Clutter.KEY_Super_L);
    t.key(Clutter.KEY_o);
    t.keyUp(Clutter.KEY_Super_L);
    await t.sleep(900);
    console.log(`[steps]    Super+O di nuovo: orbit=${ext.orbit.visible}`);

    // 2. toggle ripetuto, anche durante l'animazione
    for (let i = 0; i < 8; i++) { ext.orbit.toggle(); await t.sleep(70 + i * 20); }
    await t.sleep(1200);
    if (ext.orbit.visible) { ext.orbit.hide(); await t.sleep(900); }
    console.log(`[steps] 2. dopo 8 toggle: orbit=${ext.orbit.visible} ${base} → ${kids()}`);

    // 3. clic centrale su una tessera finestra: chiude la finestra
    ext.orbit.show();
    await t.sleep(900);
    const tile = ext.orbit._grid[0][0];
    console.log(`[steps] 3. prima tessera: «${tile._item.title}» finestre=${actors().length}`);
    const [x, y] = tile.get_transformed_position();
    t.move(x + 20, y + 20);
    await t.sleep(200);
    t.click(Clutter.BUTTON_MIDDLE);
    await t.sleep(1500);
    console.log(`[steps]    dopo clic centrale: finestre=${actors().length}`);
    if (ext.orbit.visible) { ext.orbit.hide(); await t.sleep(700); }

    // 4. estensione disattivata con Orbit aperto
    ext.orbit.show();
    await t.sleep(800);
    Main.extensionManager.disableExtension('outkast-shell@outkast-os');
    await t.sleep(800);
    console.log(`[steps] 4. dopo disable con Orbit aperto: ${base} → ${kids()}`);
    Main.extensionManager.enableExtension('outkast-shell@outkast-os');
    await t.sleep(900);
    const ext2 = t.ext('outkast-shell@outkast-os');
    ext2.orbit.toggle();
    await t.sleep(900);
    console.log(`[steps]    riattivata: orbit=${ext2.orbit.visible}`);
    ext2.orbit.hide();
    await t.sleep(700);
}
