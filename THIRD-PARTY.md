# Third-party components and credits

Outkast OS (this repository) is distributed under the **MIT** license (see `LICENSE`).
None of the components below is included in the repository, except where noted: the installer downloads them onto the
user's computer, each under its own license. For that reason this project's MIT license does not apply to them.

| Component | Author | License | Where/how |
|---|---|---|---|
| [Tela icon theme](https://github.com/vinceliuice/Tela-icon-theme) (`Tela-<color>*` variants) | Vinceliuice | GPL-3.0 | `install.sh` downloads tag `2026-07-07` from GitHub, verifies its SHA-256 and generates the variant matching the signal color; alternatively it uses a `Tela-<variant>/` folder the user places next to the script |
| [adw-gtk3](https://github.com/lassekongo83/adw-gtk3) | lassekongo83 | LGPL-2.1 | `tools/fetch-adw-gtk3.sh` downloads a pinned version, verified with SHA-256 |

Unlike its sibling Glassy, Outkast OS needs **no extension from extensions.gnome.org**: the Shell stylesheet is loaded
by the Outkast Shell extension itself.

## Credits

- **Palette** — the color values are those of [OUTKAST](https://github.com/Lwb89dev/outkast) (MIT,
  `app/src/main/kotlin/net/primal/android/theme/colors/Outkast.kt`), "OUTKAST Dark" and "OUTKAST Light". The derived
  tokens (a darker step, the cyan in the ANSI palette) are marked as such in `palette.js`.
- **Design language** — [Omarchy](https://github.com/omacom/omarchy) (MIT) is the reference for the flat, hairline,
  keyboard-first look. No Omarchy code is used; this is a GNOME implementation of a similar grammar.
- **Structure** — the layout of the repository, the installer/uninstaller scaffolding (backup of every setting,
  manifest, dry-run), the headless test bench and the template engine come from the sibling project **Glassy**
  (MIT, same author), reworked here.

## Notes

- **Tela icons and MIT.** Tela is GPL-3.0: redistributing it inside an MIT repository would not be correct. That is why
  `Tela-*/` is in `.gitignore` and the installer downloads it straight from the author. Outkast OS does not modify
  the icons and contains no copy of them. The screenshots in `docs/` show a desktop where the Tela icons are active.
- The `extension/outkast-shell@outkast-os` extension uses GNOME Shell's APIs (GPL-2.0-or-later) through the Shell's
  modules, like every extension; the MIT license is compatible with the GPL.
- Trademarks mentioned (GNOME, Omarchy, OUTKAST, etc.) belong to their respective owners; this is an independent
  project and is not affiliated with them.
