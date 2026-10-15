#!/usr/bin/env bash
# Scarica adw-gtk3 (la base su cui poggiano i temi GTK3 e GTK4 "classico" di Outkast)
# e ne copia i file nella cartella del tema indicata:
#   gtk-3.0/gtk.css       → <tema>/gtk-3.0/adw-gtk3.css
#   gtk-3.0/gtk-dark.css  → <tema>/gtk-3.0/adw-gtk3-dark.css
#   gtk-3.0/assets/       → <tema>/gtk-3.0/assets/
#   gtk-4.0/libadwaita*.css, gtk-4.0/assets/ → <tema>/gtk-4.0/
#
# Uso: tools/fetch-adw-gtk3.sh <cartella-del-tema>   (es. ~/.local/share/themes/Outkast)
# La versione è fissata e il tarball verificato con SHA-256; la copia scaricata
# resta in ~/.cache/outkast-os per le installazioni successive.
set -euo pipefail

ADW_VERSION="v6.5"
ADW_SHA256="a81780fadfc432be0fc3d89c4ebb41aa28e4f032d42c36f9789c57dd10cfa41c"
ADW_URL="https://github.com/lassekongo83/adw-gtk3/releases/download/${ADW_VERSION}/adw-gtk3${ADW_VERSION}.tar.xz"

dest="${1:?uso: $0 <cartella-del-tema>}"
cache="${XDG_CACHE_HOME:-$HOME/.cache}/outkast-os"
tarball="$cache/adw-gtk3-${ADW_VERSION}.tar.xz"

mkdir -p "$cache" "$dest/gtk-3.0" "$dest/gtk-4.0"

verify() { [[ "$(sha256sum "$1" | cut -d' ' -f1)" == "$ADW_SHA256" ]]; }

if [[ ! -s "$tarball" ]] || ! verify "$tarball"; then
    echo "  scarico adw-gtk3 ${ADW_VERSION}…"
    if command -v curl >/dev/null; then
        curl -fsSL --retry 3 --connect-timeout 15 -o "$tarball.part" "$ADW_URL"
    elif command -v wget >/dev/null; then
        wget -q --tries=3 --timeout=15 -O "$tarball.part" "$ADW_URL"
    else
        echo "servono curl o wget per scaricare adw-gtk3" >&2; exit 1
    fi
    if ! verify "$tarball.part"; then
        rm -f "$tarball.part"
        echo "checksum di adw-gtk3 non valido: download scartato" >&2; exit 1
    fi
    mv "$tarball.part" "$tarball"
fi

tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
tar -xf "$tarball" -C "$tmp" adw-gtk3/gtk-3.0 adw-gtk3/gtk-4.0
src="$tmp/adw-gtk3"

cp "$src/gtk-3.0/gtk.css"      "$dest/gtk-3.0/adw-gtk3.css"
cp "$src/gtk-3.0/gtk-dark.css" "$dest/gtk-3.0/adw-gtk3-dark.css"
rm -rf "$dest/gtk-3.0/assets" "$dest/gtk-4.0/assets"
cp -r "$src/gtk-3.0/assets"    "$dest/gtk-3.0/assets"
cp "$src/gtk-4.0/libadwaita.css" "$src/gtk-4.0/libadwaita-tweaks.css" "$dest/gtk-4.0/"
cp -r "$src/gtk-4.0/assets"    "$dest/gtk-4.0/assets"
