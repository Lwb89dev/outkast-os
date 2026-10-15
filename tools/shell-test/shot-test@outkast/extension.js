// Estensione di collaudo (solo per tools/shell-test): esegue uno script di passi nella Shell
// di prova e scatta screenshot. SHOT_STEPS=/percorso/steps.js deve esportare `async function run(t)`.
//   t = { Main, GLib, Gio, Clutter, Shell, sleep(ms), ext(uuid), move(x,y), click(btn), press(btn),
//         release(btn), key(sym), shot(path), windows(), crop(path, x, y, w, h) }
import GLib from 'gi://GLib';
import Gio from 'gi://Gio';
import Clutter from 'gi://Clutter';
import Shell from 'gi://Shell';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

export default class ShotTest {
    enable() {
        console.log('[shot-test] enabled');
        // Con Xwayland il DISPLAY compare dopo: lo si scrive in un file per i client X11.
        this._dispId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 400, () => {
            const d = GLib.getenv('DISPLAY');
            if (!d)
                return GLib.SOURCE_CONTINUE;
            const dir = GLib.getenv('SHOT_STATE_DIR') ?? '/tmp';
            try {
                GLib.file_set_contents(`${dir}/x11-xauth`, GLib.getenv('XAUTHORITY') ?? '');
                GLib.file_set_contents(`${dir}/x11-display`, d);
            } catch (e) {
                // pazienza
            }
            return GLib.SOURCE_REMOVE;
        });

        this._id = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, Number(GLib.getenv('SHOT_DELAY') ?? 8), () => {
            this._run().catch(e => console.log(`[shot-test] ERRORE: ${e}\n${e.stack}`)).finally(() => {
                console.log('[shot-test] fine');
                GLib.timeout_add(GLib.PRIORITY_DEFAULT, 800, () => {
                    global.context.terminate();
                    return GLib.SOURCE_REMOVE;
                });
            });
            return GLib.SOURCE_REMOVE;
        });
    }

    async _run() {
        const seat = global.stage.context.get_backend().get_default_seat();
        const vdev = seat.create_virtual_device(Clutter.InputDeviceType.POINTER_DEVICE);
        const kdev = seat.create_virtual_device(Clutter.InputDeviceType.KEYBOARD_DEVICE);
        const now = () => GLib.get_monotonic_time();
        const t = {
            Main, GLib, Gio, Clutter, Shell,
            sleep: ms => new Promise(r => GLib.timeout_add(GLib.PRIORITY_DEFAULT, ms, () => { r(); return GLib.SOURCE_REMOVE; })),
            ext: uuid => Main.extensionManager.lookup(uuid)?.stateObj,
            move: (x, y) => vdev.notify_absolute_motion(now(), x, y),
            press: (btn = Clutter.BUTTON_PRIMARY) => vdev.notify_button(now(), btn, Clutter.ButtonState.PRESSED),
            release: (btn = Clutter.BUTTON_PRIMARY) => vdev.notify_button(now(), btn, Clutter.ButtonState.RELEASED),
            click: (btn = Clutter.BUTTON_PRIMARY) => { t.press(btn); t.release(btn); },
            key: sym => {
                kdev.notify_keyval(now(), sym, Clutter.KeyState.PRESSED);
                kdev.notify_keyval(now(), sym, Clutter.KeyState.RELEASED);
            },
            // tocchi veri su un touchscreen virtuale: lo stesso SwipeTracker del touchpad li legge come gesto a più dita
            touch: (() => {
                let dev = null;
                return {
                    down: (slot, x, y) => { dev ??= seat.create_virtual_device(Clutter.InputDeviceType.TOUCHSCREEN_DEVICE); dev.notify_touch_down(now(), slot, x, y); },
                    move: (slot, x, y) => dev.notify_touch_motion(now(), slot, x, y),
                    up: slot => dev.notify_touch_up(now(), slot),
                };
            })(),
            keyDown: sym => kdev.notify_keyval(now(), sym, Clutter.KeyState.PRESSED),
            keyUp: sym => kdev.notify_keyval(now(), sym, Clutter.KeyState.RELEASED),
            type: async text => {
                for (const ch of text) {
                    t.key(Clutter.unicode_to_keysym(ch.codePointAt(0)));
                    await t.sleep(30);
                }
            },
            // avvia un'app dentro la sessione di prova (Wayland); ritorna subito
            spawn: cmd => {
                let env = GLib.get_environ();
                env = GLib.environ_setenv(env, 'WAYLAND_DISPLAY', 'outkast-shell', true);
                env = GLib.environ_setenv(env, 'GDK_BACKEND', 'wayland', true);
                GLib.spawn_async(null, GLib.shell_parse_argv(cmd)[1], env, GLib.SpawnFlags.SEARCH_PATH, null);
            },
            shot: async path => {
                const shot = new Shell.Screenshot();
                const stream = Gio.File.new_for_path(path).replace(null, false, Gio.FileCreateFlags.NONE, null);
                await shot.screenshot(false, stream);
                stream.close(null);
                console.log(`[shot-test] salvato ${path}`);
            },
            // finestre normali in ordine di impilamento: [{title, app, x, y, w, h, focus, ws}]
            windows: () => global.get_window_actors().map(a => a.meta_window)
                .filter(w => w.get_window_type() === 0)
                .map(w => {
                    const r = w.get_frame_rect();
                    return {title: w.get_title(), app: w.get_wm_class(), x: r.x, y: r.y, w: r.width, h: r.height,
                        focus: w.has_focus(), ws: w.get_workspace()?.index()};
                }),
        };

        const steps = GLib.getenv('SHOT_STEPS');
        if (!steps) {
            await t.shot(`${GLib.getenv('SHOT_OUT') ?? '/tmp'}/shot.png`);
            return;
        }
        const mod = await import(`file://${steps}`);
        await mod.run(t);
    }

    disable() {
        if (this._id) GLib.source_remove(this._id);
        if (this._dispId) GLib.source_remove(this._dispId);
    }
}
