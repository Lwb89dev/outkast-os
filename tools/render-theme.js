#!/usr/bin/env -S gjs -m
/*
 * Genera i CSS del tema dai modelli in theme/Outkast/templates, secondo palette e impostazioni.
 *
 *   gjs -m tools/render-theme.js --theme theme/Outkast --out /tmp/outkast        # con i predefiniti
 *   gjs -m tools/render-theme.js --theme ~/.local/share/themes/Outkast --settings-from ~/.local/share/gnome-shell/extensions/outkast-shell@outkast-os
 *
 *   --theme DIR           cartella del tema con templates/ (predefinito: quella installata)
 *   --out DIR             dove scrivere i CSS (predefinito: dentro --theme)
 *   --settings-from DIR   cartella dell'estensione con gli schemi: usa i valori salvati dall'utente
 *   --accent NOME         orange (predefinito), gold, rose, blue, green
 *   --defaults            ignora le impostazioni salvate
 *   --set CHIAVE=VALORE   forza una voce (ripetibile), es. --set corner-radius=8 --set compact=false
 */
import GLib from 'gi://GLib';
import System from 'system';

const here = GLib.path_get_dirname(GLib.filename_from_uri(import.meta.url)[0]);
const extDirDefault = GLib.build_filenamev([here, '..', 'extension', 'outkast-shell@outkast-os']);
const mod = await import(`file://${GLib.build_filenamev([extDirDefault, 'themegen.js'])}`);

const args = System.programArgs;
const opt = (name, def = null) => {
    const i = args.indexOf(name);
    return i >= 0 ? args[i + 1] : def;
};

const theme = opt('--theme', GLib.build_filenamev([GLib.get_user_data_dir(), 'themes', 'Outkast']));
const out = opt('--out', theme);
const defaults = args.includes('--defaults');
const extDir = opt('--settings-from');

const settings = !defaults && extDir ? mod.openSettings(extDir) : null;
const cfg = mod.readConfig(settings);
args.forEach((a, i) => {
    if (a !== '--set')
        return;
    const [k, v] = args[i + 1].split('=');
    if (!(k in cfg))
        throw new Error(`chiave sconosciuta: ${k}`);
    switch (typeof cfg[k]) {
    case 'boolean': cfg[k] = v === 'true'; break;
    case 'number': cfg[k] = parseInt(v, 10); break;
    default: cfg[k] = v;
    }
});
const accent = opt('--accent');
if (accent)
    cfg.accent = accent;

const changed = mod.renderTheme(theme, cfg, out);
print(changed.length ? `rigenerati: ${changed.join(', ')}` : 'tema già aggiornato');
