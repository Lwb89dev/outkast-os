import Meta from 'gi://Meta';
import Shell from 'gi://Shell';

import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import {ThemeLoader} from './theme.js';
import {Bar} from './bar.js';
import {Lockdown} from './lockdown.js';
import {WindowMotion} from './motion.js';
import {FocusFrame} from './frame.js';
import {Launcher} from './launcher.js';
import {Orbit} from './orbit.js';

export default class OutkastShell extends Extension {
    enable() {
        this.settings = this.getSettings();
        this.theme = new ThemeLoader(this.settings);
        this.bar = new Bar(this.settings);
        this.launcher = new Launcher(this);
        this.orbit = new Orbit(this, this.launcher);
        Main.wm.addKeybinding('orbit-shortcut', this.settings, Meta.KeyBindingFlags.NONE,
            Shell.ActionMode.NORMAL, () => this.orbit.toggle());
        this.lockdown = new Lockdown(this.launcher, this.settings);
        this.motion = new WindowMotion(this.settings, this.bar);
        this.frame = new FocusFrame(this.settings);
    }

    disable() {
        this.frame?.destroy();
        this.frame = null;
        this.motion?.destroy();
        this.motion = null;
        this.lockdown?.destroy();
        this.lockdown = null;
        Main.wm.removeKeybinding('orbit-shortcut');
        this.orbit?.destroy();
        this.orbit = null;
        this.launcher?.destroy();
        this.launcher = null;
        this.bar?.destroy();
        this.bar = null;
        this.theme?.destroy();
        this.theme = null;
        this.settings = null;
    }
}
