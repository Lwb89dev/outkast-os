# Design notes

Outkast OS is a GNOME desktop with **Omarchy's grammar** (flat, hairlines, keyboard first, monospace where it
means something) spoken in **Outkast's colors** (one orange signal on midnight, warm paper in light mode).
These notes explain the decisions so they can be argued with.

## 1. Where it comes from

| Source | What it contributes |
|---|---|
| [Omarchy](https://github.com/omacom/omarchy) | Flat surfaces, square corners, 2px borders, no shadows and no blur by default, numbered workspaces in a thin bar, a launcher you drive with the keyboard, monospace as a system-wide texture |
| [Outkast](https://github.com/Lwb89dev/outkast) | The palette (`app/…/theme/colors/Outkast.kt`, used verbatim), the idea that navigation is **directional and edge-driven** (inward swipes from the screen edges, "Orbit" pulled up from the bottom), and monospace as a *technical accent* (Courier Prime "reserved for small identity/technical accents") |

Outkast's own `OUTKAST_MIGRATION.md` says the readable face is Ubuntu Sans and the monospace is only for
"small identity/technical accents". That sentence is the whole typographic policy below.

## 2. Color

One source of truth: `extension/outkast-shell@outkast-os/palette.js`. Every stylesheet is generated from it.

| Token | Dark | Light | Role |
|---|---|---|---|
| `bg` | `#101114` | `#f4f2ee` | window background |
| `surface` / `raised` | `#191b20` / `#24262c` | `#ffffff` / `#eae7e1` | cards, popovers / hover |
| `outline` / `line` | `#34373f` / `#292c32` | `#d3cec5` / `#e1ddd6` | hairlines |
| `fg` … `fg4` | `#f2f2f2` … `#62666f` | `#191a1d` … `#8f9298` | text, from primary to faint |
| `accent` | `#ff6238` | `#d94d2b` | the signal |
| `red` `green` `amber` `blue` `rose` | `#ff6b6b` `#69d08b` `#ffb33b` `#62a8ff` `#ff668f` | darker twins | Outkast's semantic colors (error, success, zapped, bookmarked, liked) |

**One signal.** Orange is only used for things that are *active*: the focus frame, the selected row's bar, the
primary action, today in the calendar, the current workspace. If everything is orange nothing is. The other
four Outkast colors exist as alternative signals (`--accent gold|rose|blue|green`) and as syntax colors.

The Shell stays dark in light mode (like a menu bar over a dark wallpaper); applications follow the system scheme.

## 3. Shape and depth

- Windows have **no radius** by default (`corner-radius`, 0–16), controls 2px. Tiling windows are rectangles.
- **No shadows.** A 1px hairline separates surfaces; elevation is a lighter surface, not a blur.
- Signal marks are drawn with `box-shadow: inset` (a 2px bar on the left of a selected row, an underline under the
  current workspace). That is deliberate: St (the Shell's CSS engine) ignores `border-left` and friends, only a
  uniform `border` is drawn.
- "Compact" density (default) tightens header bars, buttons and rows by ~20%.

## 4. Typography

- **Readable text** (names, paragraphs, buttons): the system font, untouched.
- **Technical labels**, in monospace (Adwaita Mono, shipped with GNOME 48+, then JetBrains Mono, Fira Mono…):
  header-bar titles and subtitles, captions, tooltips, key caps, the clock, workspace numbers, the app name in the
  bar, the palette's prompt, hints and section labels.

The test for a monospace label is "would this look right in a terminal status line?". A document title does; a
setting's description does not.

## 5. Motion

Outkast moves by **edges**. Outkast OS gives every window an edge and moves it only along that axis.

> A window belongs to the screen edge nearest to it. It enters from that edge, it is cast out through it when it
> closes, and it withdraws into the bar (the top edge) when minimized.

| Event | What happens | Time / curve |
|---|---|---|
| Open | A wipe starts at the window's edge and reveals it, a 2px orange **seam** rides the front, the content slides a few pixels inward. Windows near the bottom or maximized enter from the bottom, like Orbit | 300 ms, ease-out-expo |
| Close | The same, reversed and faster: the window is withdrawn through its edge | 190 ms, ease-in-cubic |
| Minimize / restore | Withdraws upward into the bar and the workspace chip blinks; restore reverses it | 260 ms |
| Focus change | The orange **focus frame** *travels* from the old window's rectangle to the new one (it does not blink off and on) | 280 ms, ease-out-expo |
| Maximized / fullscreen | The frame withdraws (there is nowhere to draw it) and comes back when restored | 140 ms fade |
| Workspace change | The bar's underline glides to the new number; the content slide is GNOME's own | 260 ms |
| Palette | Rises from the bottom edge (a 30px move) over a dim layer | 260 ms in, 140 ms out |
| Orbit | The same wipe as a window entering from the bottom, seam included, over a dim layer | 300 ms in, 180 ms out |
| Dialogs | A short rise and fade: guests, not windows | 170 ms / 120 ms |

Rules the motion follows: nothing scales from the center, nothing bounces, entrances are slower than exits, the only
color in motion is the signal. The `Speed` setting scales every duration.

### Why a wipe and not a fade

A fade says "something appeared". A wipe from an edge says *where it came from and where it will go*, which is
the information a tiling-minded user wants and the information Outkast's navigation already carries. The seam is the
frame of the focus travelling made visible: the same orange line that marks the active window marks the front of the
window arriving.

### How it is done (and why it is fragile in one way)

The Shell binds its window-manager signal handlers with `.bind()`, so they cannot be replaced on the instance.
`motion.js` blocks the originals for `destroy`, `minimize` and `unminimize` (`GObject.signal_handler_block`) and
runs its own, which must call `completed_*`; for `map` it makes `_shouldAnimateActor` answer "no" for the three
animatable window categories so that the original finishes at once and the wipe runs after it. The wipe itself is
a clip rectangle driven by a hidden actor with a `progress` property.

Two non-obvious details:

- Mutter does not repaint what lies under a window's opaque region. A clipped window would leave uninitialised
  memory behind the part that is not revealed yet, so the actor runs at **opacity 254**, which marks it non-occluding.
- `Clutter` zeroes an easing duration if the actor is not mapped, so the driver actor must sit on the stage.

The extension declares compatibility with GNOME Shell 50 only: this is the part of the project most likely to need
attention at a GNOME update.

## 6. The palette (launcher)

It replaces Activities. `Super` opens it; one text field, results grouped by kind. `=` calculates (a small parser,
no `eval`), `>` runs a command. `↑↓`, `Ctrl+P/N`, `Ctrl+J/K` move, `Tab` advances, `Alt+1…9` activates the nth row,
`Ctrl+U` clears. Matching is substring first, then letters in order, with word starts preferred.

## 7. Orbit

Outkast's `OUTKAST_MIGRATION.md`: "OUTKAST has no persistent navigation bar. […] The compact bottom portal can be
tapped or pulled upward to open Orbit, an accessible control surface for every world plus Algorithms, Bookmarks,
Profile and Settings." Outkast OS keeps that structure and drops the dock.

| In the Outkast app | On the desktop |
|---|---|
| The portal: a rounded pill with one dot per "world" (the active one larger, in the accent) and the name of the active destination | A small tab at the bottom center: one square per workspace (the current one larger, orange) and the name of the foreground app. Click, drag up, or scroll up |
| The sheet rises from the bottom, `surfaceVariant` tiles on a `surface` background, a tile with the accent border is the current one | The panel enters from the bottom with the window wipe and the orange seam; `surface` tiles on `bg`; the current tile has the accent border, the one under the keyboard an accent underline |
| Tiles lead to sub-sections (Home, Algorithms) with a back control | **All apps** is a sub-section with a back arrow; `Esc` goes back before it closes |
| Sections: worlds, Bookmarks, Profile, Settings | Sections: open windows, favorite apps, workspaces, system |

The portal has four visibility modes: *always*; *smart*, which hides it while a window overlaps it (the autohide
Glassy's dock had, for the same reason: a persistent element that covers content is a tax); *edge*, hidden until the
pointer touches the bottom edge; and *never*. Hiding means sliding under the edge, not turning it off: a 3px strip
along the bottom edge stays reactive, so the "push against the edge" gesture of any auto-hiding bar works, and the
portal comes back down a moment after the pointer leaves. An optional dwell (420ms) on the portal or the strip opens
Orbit without a click; after Orbit closes there is a 900ms pause so that it cannot reopen under a stationary pointer.
In *always* the portal is 23px tall and covers whatever is at the bottom center of the screen.

Orbit also answers to **three fingers up**. It reuses the Shell's own `SwipeTracker` (the one that drives the overview),
so direction, natural scrolling, velocity and snapping behave exactly like the gesture GNOME users already know. The
tracker reports a progress value and `orbit.js` paints that value (`_paint(p)`): the same function draws the click-driven
animation and the finger-driven one, so there is a single description of what "partly open" looks like (the wipe, the
seam on its front, the dim layer). The full opening is mapped to 55% of the Shell's gesture range, because Orbit is a
low panel and should not need a whole touchpad of travel; on a touchscreen the distance is the panel's own height, so its
top edge follows the fingers one to one. While Orbit is open the Shell's stage tracker no longer receives touches (the
modal grab takes them), so a second tracker is attached to the panel to let three fingers *down* close it.

Orbit and the palette hand over to each other: typing a letter in
Orbit opens the palette with that letter, and opening one closes the other.

## 8. What it deliberately does not do

- No persistent dock. Orbit is the dock, on demand; apps also start from the palette and switch from the palette or `Alt+Tab`.
- No blur and no transparency. A flat surface is the point.
- It does not tile windows. GNOME's own edge tiling (`Super`+arrows, drag to an edge) is styled to match.
