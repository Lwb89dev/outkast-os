// Il gesto a tre dita su Orbit (touch virtuale: stesso SwipeTracker del touchpad).
import Clutter from 'gi://Clutter';

export async function run(t) {
    const {Main} = t;
    await t.sleep(2500);
    // una finestra vera: le tessere di Orbit si popolano anche dal gesto
    t.spawn('gnome-text-editor --new-window');
    for (let i = 0; i < 60 && t.windows().length < 1; i++) await t.sleep(150);
    await t.sleep(2000);
    const ext = t.ext('outkast-shell@outkast-os');
    const orbit = ext.orbit;
    const W = global.stage.width, H = global.stage.height;
    const xs = [W / 2 - 80, W / 2, W / 2 + 80];
    const state = tag => console.log(`[steps] ${tag}: visible=${orbit.visible} attore=${!!orbit._actor} p=${(orbit._p ?? 0).toFixed(2)} gesto=${!!orbit._gesture} panoramica.enabled=${Main.overview._swipeTracker?.enabled}`);

    // swipe: n passi da `dy` px ciascuno, ogni `gap` ms
    const swipe = async (steps, dy, gap, y0 = H * 0.75, probe = null) => {
        xs.forEach((x, i) => t.touch.down(i, x, y0));
        await t.sleep(80);
        for (let k = 1; k <= steps; k++) {
            xs.forEach((x, i) => t.touch.move(i, x, y0 + dy * k));
            await t.sleep(gap);
            if (probe) probe(k);
        }
    };
    const lift = async () => { xs.forEach((_x, i) => t.touch.up(i)); await t.sleep(80); };

    state('inizio');
    console.log(`[steps] gesto attivo: tracker=${!!orbit._swipe}`);

    // A. molto lento e corto (circa un decimo del pannello): si annulla
    await swipe(6, -8, 130, undefined, k => { if (k === 3 || k === 6) state(`A passo ${k}`); });
    await t.sleep(150);
    await lift();
    await t.sleep(900);
    state('A dopo il rilascio (deve essersi richiuso)');

    // B. lungo, lento: si apre e resta aperto (a metà gesto il pannello è a metà strada)
    await swipe(14, -24, 60, undefined, k => { if (k === 7) { state('B a metà'); } });
    await t.shot(`${t.GLib.getenv('SHOT_OUT')}/swipe-mid.png`);
    await t.sleep(150);
    await lift();
    await t.sleep(1100);
    state('B dopo il rilascio (deve essere aperto)');
    console.log(`[steps] tessere: ${orbit._grid.map(r => r.map(x => x._item.title.slice(0, 14)).join(' | ')).slice(0, 3).join(' // ')}`);
    await t.shot(`${t.GLib.getenv('SHOT_OUT')}/swipe-open.png`);

    // C. tre dita in giù: lo chiude
    await swipe(14, 34, 60, H * 0.25);
    await t.sleep(150);
    await lift();
    await t.sleep(1100);
    state('C dopo tre dita in giù (deve essere chiuso)');

    // D. uno scatto breve ma veloce (come una spazzolata): si completa
    await swipe(4, -45, 12);
    await lift();
    await t.sleep(1100);
    state('D dopo uno scatto breve');
    if (orbit.visible) { orbit.hide(); await t.sleep(900); }

    // E. gesto spento: niente tracker, la panoramica resta com'era voluto da Lockdown
    ext.settings.set_boolean('orbit-gesture', false);
    await t.sleep(400);
    console.log(`[steps] E gesto spento: tracker=${!!orbit._swipe} panoramica.enabled=${Main.overview._swipeTracker?.enabled}`);
    await swipe(14, -34, 60);
    await t.sleep(150);
    await lift();
    await t.sleep(900);
    state('E swipe a gesto spento (non deve aprirsi)');
    ext.settings.set_boolean('orbit-gesture', true);
    await t.sleep(400);
    console.log(`[steps] gesto riacceso: tracker=${!!orbit._swipe}`);

    // F. disattivazione dell'estensione: la panoramica riavrebbe il suo gesto
    Main.extensionManager.disableExtension('outkast-shell@outkast-os');
    await t.sleep(700);
    console.log(`[steps] F estensione spenta: panoramica.enabled=${Main.overview._swipeTracker?.enabled}`);
    Main.extensionManager.enableExtension('outkast-shell@outkast-os');
    await t.sleep(900);
    console.log(`[steps] estensione riaccesa: panoramica.enabled=${Main.overview._swipeTracker?.enabled}`);
}
