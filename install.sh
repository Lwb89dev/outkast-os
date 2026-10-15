#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
#  Outkast — installer
#
#  Installa un GNOME in stile Omarchy con la palette di Outkast: tema GTK3, GTK4/libadwaita
#  e Shell, icone Tela arancio, sfondi, schemi per editor e terminali, e l'estensione
#  Outkast Shell (barra con workspace numerati, palette di comandi al posto di Attività,
#  finestre che entrano e escono dai bordi con una cornice arancio che le segue).
#
#  Nessuna estensione da scaricare: l'estensione carica da sola il CSS della Shell.
#
#  Prima di toccare le impostazioni salva i valori originali: ./uninstall.sh
#  riporta tutto com'era.
#
#  Uso: ./install.sh [opzioni]        (./install.sh --help per l'elenco)
# ─────────────────────────────────────────────────────────────────────────────
set -Eeuo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

THEME_NAME="Outkast"
LOCAL_EXTENSION="outkast-shell@outkast-os"

# Icone Tela (GPL-3.0, di Vinceliuice): non fanno parte di questo repository, che è MIT.
# Se accanto all'installer c'è una cartella ./Tela-<variante> si usa quella; altrimenti si scarica
# da upstream una versione precisa, verificata con SHA-256, e si genera la variante del colore.
TELA_TAG="2026-07-07"
TELA_URL="https://github.com/vinceliuice/Tela-icon-theme/archive/refs/tags/$TELA_TAG.tar.gz"
TELA_SHA256="6b8c28f637067a15551459ab90e6720c5aba1215b777b6f1f506fea188a1ddf9"
ICON_PACK_DIR=""
ICON_FROM_UPSTREAM=0
TMP_DIRS=()

DATA_HOME="${XDG_DATA_HOME:-$HOME/.local/share}"
CONFIG_HOME="${XDG_CONFIG_HOME:-$HOME/.config}"
CACHE_HOME="${XDG_CACHE_HOME:-$HOME/.cache}"
THEMES_DIR="$DATA_HOME/themes"
ICONS_DIR="$DATA_HOME/icons"
EXT_DIR="$DATA_HOME/gnome-shell/extensions"
STATE_DIR="$DATA_HOME/outkast-os"
MANIFEST="$STATE_DIR/manifest"
GS_BACKUP="$STATE_DIR/gsettings.backup"

# Estensioni che fanno le stesse cose (o pestano i piedi alle animazioni): vengono disattivate, non rimosse.
CONFLICTING=(
    "glassy-desktop@glassy-os"                             # l'altro desktop di questa famiglia: sostituisce lo stesso layout
    "dash-to-panel@jderose9.github.com"
    "dash-to-dock@micxgx.gmail.com"
    "ubuntu-dock@ubuntu.com"
    "dash2dock-lite@icedman.github.com"
    "arcmenu@arcmenu.com"
    "start_menu@slim8916.github.io"
    "compiz-alike-magic-lamp-effect@hermes83.github.com"   # anche lei anima la minimizzazione
    "compiz-windows-effect@hermes83.github.com"
    "burn-my-windows@schneegans.github.com"
    "blur-my-shell@aunetx"                                 # sfoca barra e menu: stona col piatto
)

# ── Opzioni ──────────────────────────────────────────────────────────────────
ACCENT="orange"
SCHEME="dark"
ACCENT_GIVEN=0      # accento e schema si impostano solo al primo giro o se richiesti: non si pesta
SCHEME_GIVEN=0      # ciò che l'utente ha scelto nel pannello delle impostazioni
WORKSPACES=5
FIXED_WS=1
ASSUME_YES=0
DRY_RUN=0
DO_ICONS=1
DO_WALLPAPER=1
DO_EXTENSION=1
DO_KEYS=1
DO_FLATPAK=1
DO_EXTRAS=1
RESTART_APPS=ask

valid_accent() {
    case "$1" in orange|gold|rose|blue|green) return 0 ;; *) return 1 ;; esac
}
# colore d'accento di GNOME e variante Tela corrispondenti
system_accent() { case "$1" in gold) echo yellow ;; rose) echo pink ;; *) echo "$1" ;; esac; }
tela_variant()  { case "$1" in gold) echo yellow ;; rose) echo pink ;; *) echo "$1" ;; esac; }

usage() {
    cat <<EOF
Outkast — installer

Uso: ./install.sh [opzioni]

  --accent COLORE       orange (predefinito, il marchio), gold, rose, blue, green
  --dark | --light      schema colori di sistema (predefinito: --dark)
  --workspaces N        workspace fissi, numerati nella barra (predefinito: 5)
  --dynamic-workspaces  tieni i workspace dinamici di GNOME invece di quelli fissi
  --no-extension        solo tema e icone: niente barra, palette e movimento (le tue estensioni restano)
  --no-keys             non toccare le scorciatoie (Super+1…N, Super+Invio, Super+W…)
  --no-extras           non installare schemi per editor e terminali
  --no-icons            non installare le icone Tela
  --no-wallpaper        non cambiare lo sfondo
  --no-flatpak          non dare ai Flatpak l'accesso al tema (gtk.css) e alle icone
  --restart-apps        chiudi Nautilus senza chiedere (le app già aperte non ricaricano lo stile)
  --dry-run             mostra cosa verrebbe fatto, senza modificare nulla
  -y, --yes             non chiedere conferma
  -h, --help            questo aiuto

Per tornare indietro: ./uninstall.sh
EOF
}

while [[ $# -gt 0 ]]; do
    case "$1" in
        --accent)             ACCENT="${2:-}"; ACCENT_GIVEN=1; shift 2 ;;
        --accent=*)           ACCENT="${1#*=}"; ACCENT_GIVEN=1; shift ;;
        --dark)               SCHEME="dark"; SCHEME_GIVEN=1; shift ;;
        --light)              SCHEME="light"; SCHEME_GIVEN=1; shift ;;
        --workspaces)         WORKSPACES="${2:-}"; shift 2 ;;
        --workspaces=*)       WORKSPACES="${1#*=}"; shift ;;
        --dynamic-workspaces) FIXED_WS=0; shift ;;
        --no-extension)       DO_EXTENSION=0; shift ;;
        --no-keys)            DO_KEYS=0; shift ;;
        --no-extras)          DO_EXTRAS=0; shift ;;
        --no-icons)           DO_ICONS=0; shift ;;
        --no-wallpaper)       DO_WALLPAPER=0; shift ;;
        --no-flatpak)         DO_FLATPAK=0; shift ;;
        --restart-apps)       RESTART_APPS=yes; shift ;;
        --dry-run)            DRY_RUN=1; shift ;;
        -y|--yes)             ASSUME_YES=1; shift ;;
        -h|--help)            usage; exit 0 ;;
        *) echo "opzione sconosciuta: $1 (vedi --help)" >&2; exit 2 ;;
    esac
done

valid_accent "$ACCENT" || { echo "accento non valido: '$ACCENT' (vedi --help)" >&2; exit 2; }
[[ "$WORKSPACES" =~ ^[0-9]+$ ]] && ((WORKSPACES >= 1 && WORKSPACES <= 9)) \
    || { echo "--workspaces vuole un numero da 1 a 9" >&2; exit 2; }

# ── Output ───────────────────────────────────────────────────────────────────
if [[ -t 1 ]]; then
    C_B=$'\e[1m'; C_D=$'\e[2m'; C_R=$'\e[31m'; C_G=$'\e[32m'; C_Y=$'\e[33m'; C_C=$'\e[38;5;209m'; C_0=$'\e[0m'
else
    C_B=""; C_D=""; C_R=""; C_G=""; C_Y=""; C_C=""; C_0=""
fi
step() { printf '\n%s▸ %s%s\n' "$C_C$C_B" "$*" "$C_0"; }
info() { printf '  %s\n' "$*"; }
ok()   { printf '  %s✓%s %s\n' "$C_G" "$C_0" "$*"; }
warn() { printf '  %s!%s %s\n' "$C_Y" "$C_0" "$*" >&2; }
die()  { printf '%s✗ %s%s\n' "$C_R" "$*" "$C_0" >&2; exit 1; }

trap 'printf "%s✗ errore alla riga %s (comando: %s)%s\n" "$C_R" "$LINENO" "$BASH_COMMAND" "$C_0" >&2' ERR
cleanup() { local d; for d in ${TMP_DIRS[@]+"${TMP_DIRS[@]}"}; do rm -rf "$d"; done; }
trap cleanup EXIT

# Esegue (o, con --dry-run, mostra) un comando che modifica il sistema.
run() {
    if ((DRY_RUN)); then
        printf '  %s[dry-run]%s' "$C_D" "$C_0"; printf ' %q' "$@"; printf '\n'
    else
        "$@"
    fi
}

have() { command -v "$1" >/dev/null 2>&1; }

# ── Utilità GSettings / manifest ─────────────────────────────────────────────
manifest_add() {  # tipo valore
    ((DRY_RUN)) && return 0
    mkdir -p "$STATE_DIR"
    local line="$1 $2"
    grep -qxF -- "$line" "$MANIFEST" 2>/dev/null || printf '%s\n' "$line" >> "$MANIFEST"
}

gs_get() { gsettings get "$1" "$2" 2>/dev/null; }

has_schema() { gsettings list-schemas 2>/dev/null | grep -qx -- "$1"; }

# Salva il valore ORIGINALE (solo la prima volta) e poi imposta quello nuovo.
gs_set() {  # schema chiave valore
    local schema=$1 key=$2 value=$3 old
    if ((DRY_RUN)); then
        printf '  %s[dry-run]%s gsettings set %s %s %s\n' "$C_D" "$C_0" "$schema" "$key" "${value:0:70}"
        return 0
    fi
    if ! old="$(gs_get "$schema" "$key")"; then
        warn "chiave non trovata, salto: $schema $key"
        return 0
    fi
    mkdir -p "$STATE_DIR"
    if ! grep -q -- "^$schema"$'\t'"$key"$'\t' "$GS_BACKUP" 2>/dev/null; then
        printf '%s\t%s\t%s\n' "$schema" "$key" "$old" >> "$GS_BACKUP"
    fi
    gsettings set "$schema" "$key" "$value" 2>/dev/null || warn "impossibile impostare $schema $key"
}

trim() {  # stringa → stringa senza spazi ai lati
    local v=$1
    v="${v#"${v%%[![:space:]]*}"}"
    printf '%s' "${v%"${v##*[![:space:]]}"}"
}

# 'a', 'b' → una voce per riga (per leggere le liste di GSettings senza dipendenze).
gs_list_items() {
    sed -e 's/^@as //' -e 's/^\[//' -e 's/\]$//' <<<"$1" | tr ',' '\n' | sed -e "s/^[[:space:]]*'//" -e "s/'[[:space:]]*\$//" | sed '/^$/d'
}

gs_list_format() {  # voci su stdin → ['a', 'b']
    local out="" item
    while IFS= read -r item; do out+="${out:+, }'$item'"; done
    printf '[%s]' "$out"
}

fetch() {  # url file
    if have curl; then curl -fsSL --retry 2 --connect-timeout 15 --max-time 300 -o "$2" "$1"
    else wget -q --tries=2 --timeout=20 -O "$2" "$1"; fi
}

# ── Controlli iniziali ───────────────────────────────────────────────────────
preflight() {
    step "Controllo il sistema"
    [[ $EUID -ne 0 ]] || die "non eseguire come root: Outkast si installa nella tua cartella personale."
    have gsettings || die "manca 'gsettings' (pacchetto glib2-tools / libglib2.0-bin)."
    have gnome-shell || die "GNOME Shell non trovata: Outkast è un tema per GNOME."
    have gjs || die "manca 'gjs': serve a generare il tema."

    SHELL_MAJOR="$(gnome-shell --version 2>/dev/null | grep -oE '[0-9]+' | head -1 || true)"
    [[ -n "$SHELL_MAJOR" ]] || die "non riesco a leggere la versione di GNOME Shell."
    ((SHELL_MAJOR >= 45)) || die "serve GNOME 45 o successivo (trovato $SHELL_MAJOR)."
    ok "GNOME Shell $SHELL_MAJOR (${XDG_SESSION_TYPE:-sessione sconosciuta})"
    if ((DO_EXTENSION && SHELL_MAJOR != 50)); then
        warn "l'estensione dichiara compatibilità con GNOME 50 (trovato $SHELL_MAJOR): installo solo tema e icone."
        DO_EXTENSION=0
    fi

    local missing=()
    have curl || have wget || missing+=("curl")
    have tar || missing+=("tar")
    have xz  || missing+=("xz")
    have sha256sum || missing+=("coreutils (sha256sum)")
    have glib-compile-schemas || missing+=("glib2-tools (glib-compile-schemas)")
    if ((${#missing[@]})); then
        warn "mancano: ${missing[*]}"
        if   have zypper; then info "installa con:  sudo zypper install curl tar xz glib2-tools"
        elif have apt;    then info "installa con:  sudo apt install curl tar xz-utils libglib2.0-bin"
        elif have dnf;    then info "installa con:  sudo dnf install curl tar xz glib2"
        elif have pacman; then info "installa con:  sudo pacman -S curl tar xz glib2"
        fi
        die "installa i pacchetti mancanti e riesegui."
    fi
    ok "strumenti necessari presenti"

    [[ -d "$ROOT/theme/$THEME_NAME" ]] || die "cartella del tema non trovata in $ROOT/theme/$THEME_NAME"

    TELA_VARIANT="$(tela_variant "$ACCENT")"
    if ((DO_ICONS)); then
        if [[ -d "$ROOT/Tela-$TELA_VARIANT" ]]; then
            ICON_PACK_DIR="$ROOT/Tela-$TELA_VARIANT"
        else
            ICON_FROM_UPSTREAM=1
            info "cartella icone locale assente: Tela $TELA_TAG ($TELA_VARIANT) verrà scaricata da upstream"
        fi
    fi

    # Se c'è Glassy lo diciamo: è un altro desktop completo, non si usano insieme.
    if [[ -d "$DATA_HOME/glassy-os" ]]; then
        warn "Glassy è installato. Outkast ne disattiva l'estensione, ma i due temi non si mescolano:"
        warn "se vuoi tornare del tutto a com'era prima, esegui prima ./uninstall.sh di Glassy."
    fi
}

show_plan() {
    step "Cosa farò"
    info "• tema $THEME_NAME (GTK3, GTK4/libadwaita, GNOME Shell) con segnale ${C_B}$ACCENT${C_0}, schema ${C_B}$SCHEME${C_0}"
    if ((DO_ICONS && ICON_FROM_UPSTREAM)); then
        info "• icone Tela $TELA_VARIANT $TELA_TAG, scaricate da GitHub (GPL-3.0, verifica SHA-256)"
    elif ((DO_ICONS)); then
        info "• icone Tela $TELA_VARIANT (da $ICON_PACK_DIR)"
    fi
    ((DO_WALLPAPER)) && info "• sfondi Outkast (chiaro e scuro)"
    ((DO_EXTRAS))    && info "• schema Outkast per Editor di testo e palette per Ptyxis (più file per alacritty, kitty, foot, ghostty)"
    if ((DO_EXTENSION)); then
        info "• estensione Outkast Shell: workspace numerati in barra, palette di comandi al posto di Attività, Orbit, movimento delle finestre"
        local c active=() current
        current="$(gs_get org.gnome.shell enabled-extensions || true)"
        for c in "${CONFLICTING[@]}"; do grep -qF "'$c'" <<<"$current" && active+=("$c"); done
        ((${#active[@]})) && warn "verranno DISATTIVATE (non rimosse): ${active[*]}"
        if ((FIXED_WS)); then info "• $WORKSPACES workspace fissi"; else info "• workspace dinamici di GNOME"; fi
        ((DO_KEYS)) && info "• scorciatoie: Super+1…$WORKSPACES, Super+Maiusc+1…$WORKSPACES, Super+Invio (terminale), Super+W (chiudi), Super+F"
    fi
    info "• prima di cambiare le impostazioni salvo i valori originali in ${STATE_DIR/#$HOME/~}"
    info "• per tornare indietro: ./uninstall.sh"
    ((DRY_RUN)) && warn "modalità --dry-run: non cambierà nulla"

    if ((!ASSUME_YES && !DRY_RUN)) && [[ -t 0 ]]; then
        local reply
        read -r -p $'\nProcedo? [S/n] ' reply
        [[ -z "$reply" || "$reply" =~ ^[sSyY] ]] || { info "Annullato."; exit 0; }
    fi
}

# ── Passi di installazione ───────────────────────────────────────────────────
same_tree() {  # a b → 0 se hanno lo stesso numero di voci e lo stesso index.theme
    [[ -d "$1" && -d "$2" ]] || return 1
    cmp -s "$1/index.theme" "$2/index.theme" || return 1
    [[ "$(find "$1" | wc -l)" == "$(find "$2" | wc -l)" ]]
}

# Scarica Tela da upstream e genera le tre cartelle Tela-<variante>* in una cartella temporanea.
fetch_icon_pack() {
    local tmp tarball="$CACHE_HOME/outkast-os/tela-$TELA_TAG.tar.gz"
    tmp="$(mktemp -d)"
    TMP_DIRS+=("$tmp")
    mkdir -p "$CACHE_HOME/outkast-os"
    if [[ ! -s "$tarball" || "$(sha256sum "$tarball" | cut -d' ' -f1)" != "$TELA_SHA256" ]]; then
        info "scarico Tela $TELA_TAG…"
        fetch "$TELA_URL" "$tarball.part" || die "download delle icone fallito ($TELA_URL). Riprova, oppure metti la cartella Tela-$TELA_VARIANT accanto a install.sh, oppure usa --no-icons."
        [[ "$(sha256sum "$tarball.part" | cut -d' ' -f1)" == "$TELA_SHA256" ]] \
            || { rm -f "$tarball.part"; die "le icone scaricate non corrispondono all'hash atteso (SHA-256): non le installo."; }
        mv "$tarball.part" "$tarball"
    fi
    mkdir -p "$tmp/src" "$tmp/out"
    tar -xzf "$tarball" -C "$tmp/src" --strip-components=1
    bash "$tmp/src/install.sh" -d "$tmp/out" "$TELA_VARIANT" >/dev/null 2>&1 || die "la generazione delle icone Tela è fallita."
    [[ -f "$tmp/out/Tela-$TELA_VARIANT/index.theme" ]] || die "pacchetto icone Tela inatteso: manca Tela-$TELA_VARIANT."
    ICON_PACK_DIR="$tmp/out"
}

install_icons() {
    step "Icone"
    local src name dest existed
    if ((ICON_FROM_UPSTREAM)); then
        if ((DRY_RUN)); then
            info "[dry-run] scaricherei Tela $TELA_TAG da GitHub (SHA-256 $TELA_SHA256) e installerei Tela-$TELA_VARIANT, -dark, -light"
            return 0
        fi
        fetch_icon_pack
    fi
    for src in "$ICON_PACK_DIR"/*/; do
        [[ -f "$src/index.theme" ]] || continue
        name="$(basename "$src")"
        dest="$ICONS_DIR/$name"
        if same_tree "$src" "$dest"; then
            ok "$name già installata"
            continue
        fi
        info "copio $name ($(du -sh "$src" | cut -f1))…"
        existed=0
        if [[ -e "$dest" ]]; then existed=1; warn "sostituisco la versione già presente di $name"; fi
        run mkdir -p "$ICONS_DIR"
        run rm -rf "$dest.outkast-tmp" "$dest"
        run cp -a "$src" "$dest.outkast-tmp"
        run mv "$dest.outkast-tmp" "$dest"
        # In disinstallazione si rimuove solo ciò che l'installer ha creato da zero.
        ((existed)) || manifest_add icons "$name"
        if have gtk-update-icon-cache; then run gtk-update-icon-cache -q -f -t "$dest" || true; fi
        ok "$name installata"
    done
}

# Collega ~/.config/gtk-N.0/gtk.css al file del tema (le app lo leggono a priorità utente), salvando quello tuo.
link_user_css() {  # versione-gtk file-di-destinazione
    local ver=$1 target=$2
    local link="$CONFIG_HOME/gtk-$ver/gtk.css" backup="$STATE_DIR/backup/gtk-$ver/gtk.css"
    run mkdir -p "$CONFIG_HOME/gtk-$ver"
    if [[ -L "$link" && "$(readlink "$link")" == "$target" ]]; then
        ok "gtk.css di GTK${ver%%.*} già collegato"
        return 0
    fi
    if [[ -e "$link" || -L "$link" ]]; then
        run mkdir -p "$STATE_DIR/backup/gtk-$ver"
        if [[ ! -e "$backup" && ! -L "$backup" ]]; then
            run mv "$link" "$backup"
            manifest_add "gtk$ver-backup" gtk.css
            warn "il tuo ~/.config/gtk-$ver/gtk.css è salvato in ${STATE_DIR/#$HOME/~}/backup/gtk-$ver/"
        else
            run rm -f "$link"
        fi
    fi
    run ln -s "$target" "$link"
    manifest_add link "$link"
    ok "~/.config/gtk-$ver/gtk.css → tema"
}

install_theme() {
    step "Tema $THEME_NAME"
    local dest="$THEMES_DIR/$THEME_NAME"
    run mkdir -p "$THEMES_DIR"
    run rm -rf "$dest"
    run cp -r "$ROOT/theme/$THEME_NAME" "$dest"
    manifest_add theme "$THEME_NAME"
    ok "file del tema copiati in ${dest/#$HOME/~}"

    info "scarico la base adw-gtk3 per GTK3 (e per le app GTK4 non libadwaita)…"
    if ((DRY_RUN)); then
        info "[dry-run] tools/fetch-adw-gtk3.sh $dest"
    elif "$ROOT/tools/fetch-adw-gtk3.sh" "$dest"; then
        ok "adw-gtk3 installato"
    else
        warn "adw-gtk3 non disponibile: le app GTK3 useranno Adwaita come base (meno rifinito)."
    fi

    # CSS generati dai modelli (prima coi predefiniti: il tema è subito utilizzabile; il passo
    # render_theme, più avanti, lo rigenera con i valori salvati).
    if ((!DRY_RUN)); then
        gjs -m "$ROOT/tools/render-theme.js" --theme "$dest" --defaults --accent "$ACCENT" >/dev/null \
            || die "non riesco a generare i CSS del tema (serve gjs)"
    else
        info "[dry-run] tools/render-theme.js --theme $dest"
    fi

    # Le app libadwaita (GTK4) ignorano il tema e leggono solo ~/.config/gtk-4.0/gtk.css.
    link_user_css 4.0 "$dest/gtk-4.0/outkast.css"
    # GTK3: la base adw-gtk3 usa selettori molto specifici; gli override stanno anche a priorità utente.
    link_user_css 3.0 "$dest/gtk-3.0/outkast-common.css"

    if grep -qs 'gtk-theme-name' "$CONFIG_HOME/gtk-3.0/settings.ini" 2>/dev/null; then
        warn "~/.config/gtk-3.0/settings.ini imposta gtk-theme-name: potrebbe prevalere sul tema GTK3."
    fi
}

# Rigenera i CSS con le impostazioni salvate dall'utente (se ce ne sono).
render_theme() {
    step "Generazione del tema"
    local dest="$THEMES_DIR/$THEME_NAME" ext="$EXT_DIR/$LOCAL_EXTENSION" args=()
    if ((DRY_RUN)); then info "[dry-run] rigenererei il tema con le impostazioni salvate"; return 0; fi
    args=(--theme "$dest")
    if [[ -d "$ext/schemas" ]]; then args+=(--settings-from "$ext"); else args+=(--accent "$ACCENT"); fi
    gjs -m "$ROOT/tools/render-theme.js" "${args[@]}" | sed 's/^/  /'
    ok "tema generato"
}

# Schemi per Editor di testo (GtkSourceView) e palette per Ptyxis; gli altri terminali hanno file pronti da includere.
install_extras() {
    step "Editor e terminali"
    local theme="$THEMES_DIR/$THEME_NAME/extras" f dest
    if ((DRY_RUN)); then info "[dry-run] copierei gli schemi GtkSourceView e la palette di Ptyxis"; return 0; fi
    dest="$DATA_HOME/gtksourceview-5/styles"
    run mkdir -p "$dest"
    for f in "$theme"/gtksourceview/*.xml; do
        [[ -f "$f" ]] || continue
        # collegamento, non copia: il pannello impostazioni rigenera i file del tema e l'editor li segue
        run ln -sfn "$f" "$dest/$(basename "$f")"
        manifest_add file "$dest/$(basename "$f")"
    done
    ok "schema «Outkast» per GtkSourceView (Editor di testo, Builder…)"

    dest="$DATA_HOME/org.gnome.Ptyxis/palettes"
    run mkdir -p "$dest"
    run ln -sfn "$theme/terminals/Outkast.palette" "$dest/Outkast.palette"
    manifest_add file "$dest/Outkast.palette"
    ok "palette «Outkast» per Ptyxis"
    info "per alacritty, kitty, foot e ghostty: i file sono in ${theme/#$HOME/~}/terminals/"
}

install_settings_entry() {
    # Il nome del file è l'id dell'app (org.outkast.Settings): così la finestra si associa alla voce di menu.
    local file="$DATA_HOME/applications/org.outkast.Settings.desktop" legacy="$DATA_HOME/applications/outkast-settings.desktop"
    run mkdir -p "$(dirname "$file")"
    # La versione precedente chiamava `gnome-extensions prefs`, che non apre nulla finché la Shell non conosce
    # l'estensione (cioè fino al primo nuovo accesso): quella voce va tolta.
    if [[ -f "$legacy" ]]; then
        run rm -f "$legacy"
        ((DRY_RUN)) || sed -i "\#^file $legacy\$#d" "$MANIFEST" 2>/dev/null || true
    fi
    if ((!DRY_RUN)); then
        cat > "$file" <<DESKTOP
[Desktop Entry]
Type=Application
Name=Impostazioni di Outkast
Comment=Regola movimento, palette, Orbit e aspetto del tema
Exec=$EXT_DIR/$LOCAL_EXTENSION/outkast-settings
Icon=$EXT_DIR/$LOCAL_EXTENSION/icons/outkast-settings.svg
Terminal=false
StartupWMClass=org.outkast.Settings
Categories=Settings;GTK;
Keywords=outkast;tema;movimento;orbit;aspetto;
DESKTOP
        chmod +x "$EXT_DIR/$LOCAL_EXTENSION/outkast-settings" "$EXT_DIR/$LOCAL_EXTENSION/prefs-standalone.js"
        manifest_add file "$file"
    fi
    ok "voce «Impostazioni di Outkast» nel menu delle app (funziona anche prima del prossimo accesso)"
}

install_wallpapers() {
    step "Sfondi"
    local dest="$DATA_HOME/backgrounds/outkast" xml="$DATA_HOME/gnome-background-properties/outkast.xml"
    run mkdir -p "$dest" "$(dirname "$xml")"
    run cp "$ROOT/wallpapers/outkast-dark.png" "$ROOT/wallpapers/outkast-light.png" "$dest/"
    manifest_add dir "$dest"
    if ((!DRY_RUN)); then
        cat > "$xml" <<EOF
<?xml version="1.0"?>
<!DOCTYPE wallpapers SYSTEM "gnome-wp-list.dtd">
<wallpapers>
  <wallpaper deleted="false">
    <name>Outkast</name>
    <filename>$dest/outkast-light.png</filename>
    <filename-dark>$dest/outkast-dark.png</filename-dark>
    <options>zoom</options>
    <shade_type>solid</shade_type>
    <pcolor>#101114</pcolor>
    <scolor>#101114</scolor>
  </wallpaper>
</wallpapers>
EOF
        manifest_add file "$xml"
    fi
    WALLPAPER_DIR="$dest"
    ok "sfondi installati"
}

# L'estensione scritta per Outkast: si copia dal repo (sempre, così si aggiorna).
install_local_extension() {
    step "Estensione Outkast Shell"
    local uuid=$LOCAL_EXTENSION src="$ROOT/extension/$LOCAL_EXTENSION" dest="$EXT_DIR/$LOCAL_EXTENSION" existed=0
    [[ -d "$src" ]] || die "cartella dell'estensione non trovata: $src"
    [[ -d "$dest" ]] && existed=1
    run mkdir -p "$EXT_DIR"
    run rm -rf "$dest"
    run cp -r "$src" "$dest"
    run rm -f "$dest/schemas/gschemas.compiled"
    if ((!DRY_RUN)); then glib-compile-schemas "$dest/schemas"; fi
    manifest_add ext "$uuid"
    ((existed)) && ok "$uuid aggiornata" || ok "$uuid installata"
}

# Elenco GSETTINGS_SCHEMA_DIR con le cartelle schemi delle estensioni (per leggere/scrivere le loro chiavi).
export_extension_schemas() {
    local dirs=""
    [[ -d "$EXT_DIR/$LOCAL_EXTENSION/schemas" ]] && dirs="$EXT_DIR/$LOCAL_EXTENSION/schemas"
    [[ -d "$EXT_DIR/user-theme@gnome-shell-extensions.gcampax.github.com/schemas" ]] \
        && dirs+="${dirs:+:}$EXT_DIR/user-theme@gnome-shell-extensions.gcampax.github.com/schemas"
    [[ -z "$dirs" ]] || export GSETTINGS_SCHEMA_DIR="$dirs${GSETTINGS_SCHEMA_DIR:+:$GSETTINGS_SCHEMA_DIR}"
}

enable_extension() {
    step "Attivazione dell'estensione"
    local current items out c
    current="$(gs_get org.gnome.shell enabled-extensions || echo "[]")"
    items="$(gs_list_items "$current")"

    for c in "${CONFLICTING[@]}"; do
        if grep -qxF -- "$c" <<<"$items"; then
            items="$(grep -vxF -- "$c" <<<"$items" || true)"
            info "disattivo $c"
        fi
    done
    grep -qxF -- "$LOCAL_EXTENSION" <<<"$items" || items+="${items:+$'\n'}$LOCAL_EXTENSION"
    out="$(gs_list_format <<<"$items")"
    gs_set org.gnome.shell enabled-extensions "$out"
    gs_set org.gnome.shell disable-user-extensions false
    ok "elenco delle estensioni aggiornato"

    # User Themes (se c'è) puntava magari a Glassy: il CSS della Shell lo carica già l'estensione.
    if ((!DRY_RUN)) && has_schema org.gnome.shell.extensions.user-theme; then
        local name; name="$(gs_get org.gnome.shell.extensions.user-theme name | tr -d "'")"
        if [[ "$name" == "Glassy" ]]; then
            gs_set org.gnome.shell.extensions.user-theme name "''"
            info "il tema della Shell «Glassy» (User Themes) è stato azzerato"
        fi
    fi
}

# Applica un file «schema | chiave | valore».
apply_settings_file() {  # file etichetta
    local file=$1 line schema key value count=0 skipped=0 schemas
    schemas="$(gsettings list-schemas 2>/dev/null)"
    while IFS= read -r line; do
        [[ "$line" =~ ^[[:space:]]*(#|$) ]] && continue
        IFS='|' read -r schema key value <<<"$line"
        schema="$(trim "$schema")"; key="$(trim "$key")"; value="$(trim "$value")"
        if ! grep -qx -- "$schema" <<<"$schemas"; then skipped=$((skipped + 1)); continue; fi
        gs_set "$schema" "$key" "$value"
        count=$((count + 1))
    done < "$file"
    ok "$2: $count impostazioni$( ((skipped)) && echo " ($skipped saltate: app non installata)")"
}

apply_desktop_settings() {
    step "Impostazioni del desktop"
    local icon_theme="Tela-$TELA_VARIANT-dark" first=1
    [[ $SCHEME == light ]] && icon_theme="Tela-$TELA_VARIANT-light"
    ((DO_ICONS)) || icon_theme=""

    gs_set org.gnome.desktop.interface gtk-theme "'$THEME_NAME'"
    # Schema e accento: al primo giro o su richiesta. Alle reinstallazioni restano quelli scelti dall'utente.
    grep -q $'\tcolor-scheme\t' "$GS_BACKUP" 2>/dev/null && first=0
    if ((first || SCHEME_GIVEN)); then
        gs_set org.gnome.desktop.interface color-scheme "'prefer-$SCHEME'"
        [[ -z "$icon_theme" ]] || gs_set org.gnome.desktop.interface icon-theme "'$icon_theme'"
    fi
    if ((first || ACCENT_GIVEN)); then
        gs_set org.gnome.desktop.interface accent-color "'$(system_accent "$ACCENT")'"
        ((DO_EXTENSION)) && gs_set org.gnome.shell.extensions.outkast-shell accent "'$ACCENT'"
    fi
    ok "tema $THEME_NAME (segnale $ACCENT, schema $(gs_get org.gnome.desktop.interface color-scheme | tr -d "'"))"

    apply_settings_file "$ROOT/config/desktop.settings" "desktop"

    if ((DO_EXTENSION)); then
        if ((FIXED_WS)); then
            gs_set org.gnome.mutter dynamic-workspaces false
            gs_set org.gnome.desktop.wm.preferences num-workspaces "$WORKSPACES"
            ok "$WORKSPACES workspace fissi"
        fi
        gs_set org.gnome.desktop.interface enable-hot-corners false
        if ((DO_KEYS)); then
            apply_settings_file "$ROOT/config/keybindings.settings" "scorciatoie"
            local i
            for ((i = 1; i <= WORKSPACES; i++)); do
                gs_set org.gnome.desktop.wm.keybindings "switch-to-workspace-$i" "['<Super>$i']"
                gs_set org.gnome.desktop.wm.keybindings "move-to-workspace-$i" "['<Super><Shift>$i']"
            done
            ok "Super+1…$WORKSPACES cambia workspace, Super+Maiusc+1…$WORKSPACES ci sposta la finestra"
            install_terminal_binding
        fi
    fi

    if ((DO_WALLPAPER)); then
        gs_set org.gnome.desktop.background picture-uri "'file://$WALLPAPER_DIR/outkast-light.png'"
        gs_set org.gnome.desktop.background picture-uri-dark "'file://$WALLPAPER_DIR/outkast-dark.png'"
        gs_set org.gnome.desktop.background picture-options "'zoom'"
        gs_set org.gnome.desktop.background primary-color "'#101114'"
        ok "sfondo Outkast"
    fi

    if ((DO_EXTRAS)); then
        if has_schema org.gnome.TextEditor; then gs_set org.gnome.TextEditor style-scheme "'outkast'"; fi
        if has_schema org.gnome.Ptyxis; then gs_set org.gnome.Ptyxis palette "'Outkast'"; fi
    fi
}

# Super+Invio → terminale. Scorciatoia personalizzata: schema relocatable con un percorso tutto nostro,
# che la disinstallazione azzera (voce «gspath» nel manifest) insieme all'elenco originale (backup).
install_terminal_binding() {
    local schema="org.gnome.settings-daemon.plugins.media-keys"
    local path="/org/gnome/settings-daemon/plugins/media-keys/custom-keybindings/outkast-terminal/"
    local cmd="" t
    for t in "ptyxis --new-window" "kgx" "gnome-terminal" "xdg-terminal-exec"; do
        if have "${t%% *}"; then cmd="$t"; break; fi
    done
    if [[ -z "$cmd" ]]; then
        warn "nessun terminale noto trovato (ptyxis, kgx, gnome-terminal): salto Super+Invio."
        return 0
    fi
    local current items out
    current="$(gs_get "$schema" custom-keybindings || echo "[]")"
    items="$(gs_list_items "$current")"
    grep -qxF -- "$path" <<<"$items" || items+="${items:+$'\n'}$path"
    out="$(gs_list_format <<<"$items")"
    gs_set "$schema" custom-keybindings "$out"
    if ((!DRY_RUN)); then
        gsettings set "$schema.custom-keybinding:$path" name "'Outkast: terminale'"
        gsettings set "$schema.custom-keybinding:$path" command "'$cmd'"
        gsettings set "$schema.custom-keybinding:$path" binding "'<Super>Return'"
        manifest_add gspath "$schema.custom-keybinding:$path"
    else
        info "[dry-run] scorciatoia personalizzata Super+Invio → $cmd"
    fi
    ok "Super+Invio apre il terminale ($cmd)"
}

setup_flatpak() {
    have flatpak || return 0
    step "Flatpak"
    local shown flag added=()
    shown="$(flatpak override --user --show 2>/dev/null || true)"
    for flag in "xdg-config/gtk-4.0:ro" "xdg-data/icons:ro"; do
        if grep -qF -- "$flag" <<<"$shown"; then continue; fi
        run flatpak override --user "--filesystem=$flag"
        manifest_add flatpak "$flag"
        added+=("$flag")
    done
    if ((${#added[@]})); then ok "i Flatpak possono leggere gtk.css e le icone (${added[*]})"
    else ok "già configurato"; fi
}

# Le app GNOME restano in memoria e leggono gtk.css solo all'avvio: Nautilus, in particolare,
# tiene il vecchio stile (e il vecchio layout dei pulsanti) finché non viene chiuso.
offer_restart_apps() {
    ((DRY_RUN)) && return 0
    pgrep -x nautilus >/dev/null 2>&1 || return 0
    local reply=n
    if [[ $RESTART_APPS == yes ]]; then
        reply=s
    elif [[ -t 0 && $ASSUME_YES -eq 0 ]]; then
        read -r -p $'\nNautilus è aperto e non ha ancora il nuovo stile. Lo chiudo ora (chiude le sue finestre)? [s/N] ' reply
    fi
    if [[ "$reply" =~ ^[sSyY] ]]; then
        nautilus -q >/dev/null 2>&1 || true
        ok "Nautilus chiuso: alla prossima apertura avrà lo stile Outkast"
    else
        info "Nautilus, e ogni app già aperta, prende lo stile al prossimo avvio (puoi chiuderlo con: nautilus -q)."
    fi
}

finish() {
    step "Fatto"
    if ((DRY_RUN)); then info "Nessuna modifica effettuata (--dry-run)."; return 0; fi
    cat <<EOF
  ${C_G}${C_B}Outkast è installato.${C_0}

  • Subito attivi: tema GTK, icone, sfondo. Le app già aperte (Nautilus in primis)
    vanno chiuse e riaperte per prendere il nuovo stile.
EOF
    if ((DO_EXTENSION)); then
        cat <<EOF
  • ${C_B}Esci e rientra nella sessione${C_0} per attivare barra, palette e movimento delle finestre
    (su Wayland GNOME Shell non si può riavviare a caldo).
  • Dopo il rientro: Super apre la palette (app, finestre, comandi, = calcola, > esegui);
    Super+O (o la linguetta in basso) tira su Orbit; Super+1…$WORKSPACES cambia workspace; la cornice arancio segue la finestra attiva.
  • Regolare movimento, palette e tema:  app «Impostazioni di Outkast»
EOF
    fi
    cat <<EOF
  • Cambiare colore segnale:  ./install.sh --accent gold   (oppure dalle Impostazioni di Outkast)
  • Tornare indietro:        ./uninstall.sh
EOF
}

# ── Main ─────────────────────────────────────────────────────────────────────
SHELL_MAJOR=""
TELA_VARIANT=""
WALLPAPER_DIR=""

preflight
show_plan

((DRY_RUN)) || mkdir -p "$STATE_DIR"
if ((DO_ICONS)); then install_icons; fi
install_theme
if ((DO_WALLPAPER)); then install_wallpapers; fi
if ((DO_EXTENSION)); then
    install_local_extension
    export_extension_schemas
    enable_extension
fi
apply_desktop_settings
render_theme
if ((DO_EXTRAS)); then install_extras; fi
if ((DO_EXTENSION)); then install_settings_entry; fi
if ((DO_FLATPAK)); then setup_flatpak; fi
offer_restart_apps
finish
