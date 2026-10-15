#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
#  Banco di prova per l'estensione e il tema della Shell.
#
#  Avvia una GNOME Shell VERA ma headless (schermo virtuale) su un bus D-Bus privato,
#  con HOME e GSettings isolati: la tua sessione non viene toccata. Dentro si può
#  lanciare qualsiasi app, muovere un puntatore virtuale e fare screenshot.
#
#  Uso: tools/shell-test/shell-test.sh [opzioni]
#    --steps FILE      script ESM con `export async function run(t)` (vedi shot-test@outkast)
#    --out DIR         dove salvare gli screenshot (predefinito: /tmp)
#    --exts LISTA      estensioni da attivare, separate da virgola
#    --clients 'CMD'   comandi da avviare dentro la sessione (WAYLAND_DISPLAY già impostato)
#    --size WxH        schermo virtuale (predefinito 1600x900)
#    --delay SEC       attesa prima degli step (predefinito 6)
#    --timeout SEC     tempo massimo (predefinito 60)
#    --x11             avvia anche Xwayland (i client trovano DISPLAY/XAUTHORITY in $STATE)
#    --set CHIAVE=VAL  imposta una voce dell'estensione prima dell'avvio (ripetibile), es. --set corner-radius=8
#    --scheme S        dark (predefinito) | light: schema colori delle app GTK
#    --gsettings 'CMD' comandi gsettings da eseguire prima dell'avvio (dentro la sessione)
#    --installer       prova anche install.sh nella home di prova (invece della copia diretta dei file)
#    --shell-log       stampa anche il log completo della Shell
#
#  Richiede dbus-run-session (pacchetto dbus-1-daemon). Su openSUSE, se manca, lo scarica
#  e lo estrae in ~/.cache senza installare nulla.
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
CACHE="${XDG_CACHE_HOME:-$HOME/.cache}/outkast-os/shell-test"
VM="$CACHE/home"
RT="/run/user/$(id -u)/outkastvm"           # corto: il socket Wayland ha un limite di ~107 caratteri
STATE="$CACHE/state"
EXT_UUID="outkast-shell@outkast-os"
THEME="Outkast"

STEPS="" OUT="/tmp" EXTS="$EXT_UUID"
CLIENTS="" SIZE="1600x900" DELAY=6 TIMEOUT=60 X11=0 GS_EXTRA="true" SCHEME="dark" INSTALLER=0 FULLLOG=0
SETS=()

while [[ $# -gt 0 ]]; do
    case "$1" in
        --steps) STEPS="$(realpath "$2")"; shift 2 ;;
        --out) OUT="$(realpath -m "$2")"; shift 2 ;;
        --exts) EXTS="$2"; shift 2 ;;
        --clients) CLIENTS="$2"; shift 2 ;;
        --size) SIZE="$2"; shift 2 ;;
        --delay) DELAY="$2"; shift 2 ;;
        --timeout) TIMEOUT="$2"; shift 2 ;;
        --x11) X11=1; shift ;;
        --set) SETS+=("$2"); shift 2 ;;
        --scheme) SCHEME="$2"; shift 2 ;;
        --gsettings) GS_EXTRA="$2"; shift 2 ;;
        --installer) INSTALLER=1; shift ;;
        --shell-log) FULLLOG=1; shift ;;
        -h|--help) sed -n '2,26p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,2\}//'; exit 0 ;;
        *) echo "opzione sconosciuta: $1" >&2; exit 2 ;;
    esac
done

mkdir -p "$CACHE" "$VM/.config" "$VM/.local/share/gnome-shell/extensions" "$VM/.cache" "$RT" "$STATE" "$OUT"
chmod 700 "$RT"

# ── dbus-run-session ─────────────────────────────────────────────────────────
DBUS_BIN="$CACHE/dbus/usr/bin"
GLASSY_DBUS_BIN="${XDG_CACHE_HOME:-$HOME/.cache}/glassy-os/shell-test/dbus/usr/bin"   # già estratto da un altro progetto: riuso
ensure_dbus() {
    command -v dbus-run-session >/dev/null && return 0
    [[ -x "$DBUS_BIN/dbus-run-session" ]] && { export PATH="$DBUS_BIN:$PATH"; return 0; }
    [[ -x "$GLASSY_DBUS_BIN/dbus-run-session" ]] && { export PATH="$GLASSY_DBUS_BIN:$PATH"; return 0; }
    if ! command -v zypper >/dev/null; then
        echo "manca dbus-run-session: installa il pacchetto dbus-daemon (dbus-1-daemon / dbus-daemon)" >&2; exit 1
    fi
    echo "scarico dbus-1-daemon (solo in $CACHE, niente root)…" >&2
    local ver
    ver="$(LC_ALL=C zypper --no-refresh se -s -x dbus-1-daemon | awk -F'|' '/dbus-1-daemon/ {gsub(/ /,"",$4); print $4; exit}')"
    mkdir -p "$CACHE/dbus"
    curl -fsSL -o "$CACHE/dbus/pkg.rpm" "https://download.opensuse.org/tumbleweed/repo/oss/x86_64/dbus-1-daemon-$ver.x86_64.rpm"
    (cd "$CACHE/dbus" && { command -v rpm2cpio >/dev/null && rpm2cpio pkg.rpm | cpio -idm --quiet || bsdtar -xf pkg.rpm; })
    export PATH="$DBUS_BIN:$PATH"
}
ensure_dbus

cat > "$CACHE/session.conf" <<'XML'
<!DOCTYPE busconfig PUBLIC "-//freedesktop//DTD D-Bus Bus Configuration 1.0//EN" "http://www.freedesktop.org/standards/dbus/1.0/busconfig.dtd">
<busconfig>
  <type>session</type>
  <keep_umask/>
  <listen>unix:tmpdir=/tmp</listen>
  <auth>EXTERNAL</auth>
  <policy context="default">
    <allow send_destination="*" eavesdrop="true"/>
    <allow eavesdrop="true"/>
    <allow own="*"/>
  </policy>
</busconfig>
XML

# ── ambiente isolato ─────────────────────────────────────────────────────────
vmenv() {
    env -u DBUS_SESSION_BUS_ADDRESS -u GSETTINGS_SCHEMA_DIR -u WAYLAND_DISPLAY -u DISPLAY \
        HOME="$VM" XDG_CONFIG_HOME="$VM/.config" XDG_DATA_HOME="$VM/.local/share" XDG_CACHE_HOME="$VM/.cache" \
        XDG_RUNTIME_DIR="$RT" GSETTINGS_BACKEND=keyfile "$@"
}

EXTD="$VM/.local/share/gnome-shell/extensions"
T="$VM/.local/share/themes/$THEME"

if ((INSTALLER)); then
    echo "provo install.sh nella home di prova…" >&2
    vmenv "$ROOT/install.sh" -y --no-flatpak --no-icons --no-wallpaper >/dev/null
fi

# File di sviluppo aggiornati ad ogni avvio (estensione, estensione di collaudo, tema)
for src in "$ROOT/extension/$EXT_UUID" "$ROOT/tools/shell-test/shot-test@outkast"; do
    dest="$EXTD/$(basename "$src")"
    rm -rf "$dest"; cp -r "$src" "$dest"
    [[ -d "$dest/schemas" ]] && glib-compile-schemas "$dest/schemas"
done
mkdir -p "$T"
for d in templates gtk-3.0 gtk-4.0 gnome-shell index.theme; do
    rm -rf "${T:?}/$d"; cp -r "$ROOT/theme/$THEME/$d" "$T/$d"
done
# adw-gtk3 (base di GTK3): se è già nella cache vera lo si riusa invece di riscaricarlo
mkdir -p "$VM/.cache/outkast-os"
for f in "${XDG_CACHE_HOME:-$HOME/.cache}"/outkast-os/adw-gtk3-*.tar.xz; do
    [[ -e "$f" ]] && cp -n "$f" "$VM/.cache/outkast-os/"
done
if [[ ! -f "$T/gtk-3.0/adw-gtk3.css" ]]; then
    vmenv "$ROOT/tools/fetch-adw-gtk3.sh" "$T" >/dev/null 2>&1 || echo "(adw-gtk3 non disponibile: GTK3 userà Adwaita)" >&2
fi

# Impostazioni dell'estensione richieste da --set, scritte nel keyfile della home di prova
SCHEMA_DIRS="$(ls -d "$EXTD"/*/schemas 2>/dev/null | tr '\n' ':')"
# partire sempre da zero: le impostazioni di una prova precedente (es. il rallentatore) non devono restare
vmenv GSETTINGS_SCHEMA_DIR="$SCHEMA_DIRS" gsettings reset-recursively org.gnome.shell.extensions.outkast-shell
for kv in ${SETS[@]+"${SETS[@]}"}; do
    k="${kv%%=*}"; v="${kv#*=}"
    case "$v" in true|false|[0-9]*) ;; *) v="'$v'" ;; esac
    vmenv GSETTINGS_SCHEMA_DIR="$SCHEMA_DIRS" gsettings set org.gnome.shell.extensions.outkast-shell "$k" "$v"
done
vmenv gjs -m "$ROOT/tools/render-theme.js" --theme "$T" --settings-from "$EXTD/$EXT_UUID" >/dev/null

# Le app libadwaita leggono solo ~/.config/gtk-4.0/gtk.css
mkdir -p "$VM/.config/gtk-4.0"
ln -sfn "$T/gtk-4.0/outkast.css" "$VM/.config/gtk-4.0/gtk.css"
# GTK3: gli override stanno anche a priorità utente, altrimenti i selettori di adw-gtk3 (molto specifici) vincono
mkdir -p "$VM/.config/gtk-3.0"
ln -sfn "$T/gtk-3.0/outkast-common.css" "$VM/.config/gtk-3.0/gtk.css"

rm -f "$STATE"/x11-* "$CACHE/shell.log"
list="[$(printf "'%s', " ${EXTS//,/ } 'shot-test@outkast' | sed 's/, $//')]"

export SHOT_STEPS="$STEPS" SHOT_DELAY="$DELAY" SHOT_OUT="$OUT" SHOT_STATE_DIR="$STATE"
export TEST_CLIENTS="$CLIENTS" TEST_GS="$GS_EXTRA" TEST_SIZE="$SIZE" TEST_LIST="$list" TEST_X11="$X11" TEST_STATE="$STATE"
export TEST_SCHEME="$SCHEME" GSETTINGS_SCHEMA_DIR="$SCHEMA_DIRS" TEST_ROOT="$ROOT"

vmenv timeout "$TIMEOUT" dbus-run-session --config-file="$CACHE/session.conf" -- bash -c '
    # senza il portale di GNOME le app libadwaita partirebbero sempre in chiaro
    export ADW_DEBUG_COLOR_SCHEME="prefer-$TEST_SCHEME" GTK_A11Y=none NO_AT_BRIDGE=1
    gsettings set org.gnome.shell enabled-extensions "$TEST_LIST"
    gsettings set org.gnome.shell disable-user-extensions false
    gsettings set org.gnome.desktop.interface color-scheme "prefer-$TEST_SCHEME"
    gsettings set org.gnome.desktop.interface gtk-theme "Outkast"
    gsettings set org.gnome.desktop.interface clock-show-weekday true
    gsettings set org.gnome.desktop.wm.preferences button-layout ":minimize,maximize,close"
    gsettings set org.gnome.mutter dynamic-workspaces false
    gsettings set org.gnome.desktop.wm.preferences num-workspaces 5
    gsettings set org.gnome.desktop.interface enable-hot-corners false
    # lo sfondo del progetto (non quello di sistema): le schermate devono assomigliare al desktop vero
    gsettings set org.gnome.desktop.background picture-uri "file://$TEST_ROOT/wallpapers/outkast-light.png"
    gsettings set org.gnome.desktop.background picture-uri-dark "file://$TEST_ROOT/wallpapers/outkast-dark.png"
    gsettings set org.gnome.desktop.background picture-options zoom
    eval "$TEST_GS"
    (
        if [ "$TEST_X11" = 1 ]; then
            for i in $(seq 1 40); do [ -s "$TEST_STATE/x11-display" ] && break; sleep 0.5; done
            export DISPLAY="$(cat "$TEST_STATE/x11-display" 2>/dev/null)" XAUTHORITY="$(cat "$TEST_STATE/x11-xauth" 2>/dev/null)"
        fi
        sleep 3
        export WAYLAND_DISPLAY=outkast-shell GDK_BACKEND=wayland
        eval "$TEST_CLIENTS"
    ) &
    extra=--no-x11; [ "$TEST_X11" = 1 ] && extra=
    exec gnome-shell --headless --wayland $extra --wayland-display=outkast-shell --virtual-monitor "$TEST_SIZE"
' > "$CACHE/shell.log" 2>&1 || true

# Log filtrato: solo ciò che riguarda Outkast e gli errori veri
if ((FULLLOG)); then
    cat "$CACHE/shell.log"
else
    sed '/Shutting down GNOME Shell/q' "$CACHE/shell.log" | grep -iE "outkast|\[steps\]|\[shot-test\]|JS ERROR|TypeError|ReferenceError|SyntaxError|St-CRITICAL|St-WARNING|Clutter-CRITICAL|stylesheet" \
        | grep -vE "disposed|Gjs-WARNING" | cut -c1-300 || true
fi
