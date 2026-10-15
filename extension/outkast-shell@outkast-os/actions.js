// Azioni di sistema condivise dalla palette e da Orbit: blocca, schermo, tema, impostazioni, sospendi, esci…

import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';

export function spawn(cmd) {
    try {
        GLib.spawn_command_line_async(cmd);
    } catch (e) {
        Main.notify('Outkast', `Non riesco a eseguire «${cmd}»: ${e.message}`);
    }
}

export function systemActions(ext) {
    return [
        {title: 'Blocca lo schermo', meta: 'lock', icon: 'system-lock-screen-symbolic',
            run: () => Main.screenShield.lock(true)},
        {title: 'Cattura lo schermo', meta: 'screenshot', icon: 'applets-screenshooter-symbolic',
            run: () => GLib.idle_add(GLib.PRIORITY_DEFAULT, () => { Main.screenshotUI.open().catch(() => {}); return GLib.SOURCE_REMOVE; })},
        {title: 'Tema chiaro / scuro', meta: 'scheme', icon: 'weather-clear-night-symbolic',
            run: () => {
                const s = new Gio.Settings({schema_id: 'org.gnome.desktop.interface'});
                s.set_string('color-scheme', s.get_string('color-scheme') === 'prefer-light' ? 'prefer-dark' : 'prefer-light');
            }},
        {title: 'Impostazioni di Outkast', meta: 'prefs', icon: 'preferences-system-symbolic',
            run: () => spawn(`${ext.path}/outkast-settings`)},
        {title: 'Sospendi', meta: 'suspend', icon: 'media-playback-pause-symbolic',
            run: () => spawn('systemctl suspend')},
        {title: 'Esci dalla sessione', meta: 'logout', icon: 'system-log-out-symbolic',
            run: () => spawn('gnome-session-quit --logout')},
        {title: 'Riavvia', meta: 'reboot', icon: 'system-reboot-symbolic',
            run: () => spawn('gnome-session-quit --reboot')},
        {title: 'Spegni', meta: 'poweroff', icon: 'system-shutdown-symbolic',
            run: () => spawn('gnome-session-quit --power-off')},
    ];
}

