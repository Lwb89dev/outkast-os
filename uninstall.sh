#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
#  Outkast — disinstallazione
#
#  Rimette le impostazioni di GNOME com'erano prima di ./install.sh (usa i valori
#  salvati in ~/.local/share/outkast-os) e rimuove tema, sfondi, icone, schemi ed
#  estensione che l'installer ha aggiunto. Cose che c'erano già (es. una cartella
#  icone preesistente) non vengono toccate.
#
#  Uso: ./uninstall.sh [-y] [--dry-run]
# ─────────────────────────────────────────────────────────────────────────────
set -Eeuo pipefail

DATA_HOME="${XDG_DATA_HOME:-$HOME/.local/share}"
CONFIG_HOME="${XDG_CONFIG_HOME:-$HOME/.config}"
THEMES_DIR="$DATA_HOME/themes"
ICONS_DIR="$DATA_HOME/icons"
EXT_DIR="$DATA_HOME/gnome-shell/extensions"
STATE_DIR="$DATA_HOME/outkast-os"
MANIFEST="$STATE_DIR/manifest"
GS_BACKUP="$STATE_DIR/gsettings.backup"

ASSUME_YES=0
DRY_RUN=0
for arg in "$@"; do
    case "$arg" in
        -y|--yes)  ASSUME_YES=1 ;;
        --dry-run) DRY_RUN=1 ;;
        -h|--help) sed -n '2,12p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'; exit 0 ;;
        *) echo "opzione sconosciuta: $arg" >&2; exit 2 ;;
    esac
done

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

run() {
    if ((DRY_RUN)); then
        printf '  %s[dry-run]%s' "$C_D" "$C_0"; printf ' %q' "$@"; printf '\n'
    else
        "$@"
    fi
}

[[ $EUID -ne 0 ]] || die "non eseguire come root."
command -v gsettings >/dev/null || die "manca 'gsettings'."

if [[ ! -d "$STATE_DIR" ]]; then
    info "Non trovo ${STATE_DIR/#$HOME/~}: sembra che Outkast non sia stato installato con ./install.sh."
    exit 0
fi

manifest_lines() {  # tipo → valori
    [[ -f "$MANIFEST" ]] || return 0
    sed -n "s/^$1 //p" "$MANIFEST"
}

step "Cosa farò"
info "• ripristino le impostazioni di GNOME salvate prima dell'installazione"
info "• rimuovo tema Outkast, sfondi, icone, schemi ed estensione installati da ./install.sh"
info "• le tue cose preesistenti restano dove sono"
((DRY_RUN)) && warn "modalità --dry-run: non cambierà nulla"
if ((!ASSUME_YES && !DRY_RUN)) && [[ -t 0 ]]; then
    read -r -p $'\nProcedo? [S/n] ' reply
    [[ -z "$reply" || "$reply" =~ ^[sSyY] ]] || { info "Annullato."; exit 0; }
fi

# Le estensioni installate da noi: servono i loro schemi per poterne ripristinare/azzerare le chiavi.
mapfile -t OUR_EXTS < <(manifest_lines ext)
schema_dirs=""
for uuid in "${OUR_EXTS[@]}"; do
    [[ -d "$EXT_DIR/$uuid/schemas" ]] && schema_dirs+="${schema_dirs:+:}$EXT_DIR/$uuid/schemas"
done
# User Themes (di un'altra installazione) può avere una chiave salvata nel backup
[[ -d "$EXT_DIR/user-theme@gnome-shell-extensions.gcampax.github.com/schemas" ]] \
    && schema_dirs+="${schema_dirs:+:}$EXT_DIR/user-theme@gnome-shell-extensions.gcampax.github.com/schemas"
[[ -z "$schema_dirs" ]] || export GSETTINGS_SCHEMA_DIR="$schema_dirs${GSETTINGS_SCHEMA_DIR:+:$GSETTINGS_SCHEMA_DIR}"

ext_owning_schema() {  # schema → uuid (tra le estensioni installate da noi)
    local uuid
    for uuid in "${OUR_EXTS[@]}"; do
        if grep -qs "id=\"$1\"" "$EXT_DIR/$uuid"/schemas/*.gschema.xml 2>/dev/null; then echo "$uuid"; return 0; fi
    done
    return 1
}

# ── Impostazioni ─────────────────────────────────────────────────────────────
step "Ripristino delle impostazioni"
if [[ -f "$GS_BACKUP" ]]; then
    reset_schemas=()
    restored=0
    known_schemas="$(gsettings list-schemas 2>/dev/null)"
    while IFS=$'\t' read -r schema key value; do
        [[ -n "$schema" ]] || continue
        # schema che non c'è più: niente da ripristinare
        grep -qx -- "$schema" <<<"$known_schemas" || continue
        if ext_owning_schema "$schema" >/dev/null; then
            # estensione installata da noi: tutte le sue chiavi tornano ai default, poi sparirà
            if [[ " ${reset_schemas[*]:-} " != *" $schema "* ]]; then
                reset_schemas+=("$schema")
                run gsettings reset-recursively "$schema" 2>/dev/null || true
            fi
            continue
        fi
        if ((DRY_RUN)); then
            printf '  %s[dry-run]%s gsettings set %s %s %s\n' "$C_D" "$C_0" "$schema" "$key" "${value:0:60}"
        elif gsettings set "$schema" "$key" "$value" 2>/dev/null; then
            restored=$((restored + 1))
        else
            warn "non riesco a ripristinare $schema $key"
        fi
    done < "$GS_BACKUP"
    ok "$restored impostazioni ripristinate${reset_schemas[*]:+, ${#reset_schemas[@]} gruppi di estensioni azzerati}"
else
    warn "nessun backup delle impostazioni trovato: lascio quelle attuali."
fi

# scorciatoie personalizzate create dall'installer (schema relocatable): azzerate per intero
while IFS= read -r spec; do
    [[ -n "$spec" ]] || continue
    run gsettings reset-recursively "$spec" 2>/dev/null || true
    ok "scorciatoia personalizzata rimossa"
done < <(manifest_lines gspath)

# ── File ─────────────────────────────────────────────────────────────────────
step "Rimozione dei file"

# gtk.css di GTK3 e GTK4: toglie il collegamento e rimette il file originale, se c'era
while IFS= read -r link; do
    [[ -n "$link" ]] || continue
    if [[ -L "$link" ]]; then run rm -f "$link"; ok "rimosso ${link/#$HOME/~}"; fi
done < <(manifest_lines link)
for ver in 3.0 4.0; do
    if [[ -e "$STATE_DIR/backup/gtk-$ver/gtk.css" || -L "$STATE_DIR/backup/gtk-$ver/gtk.css" ]]; then
        run mkdir -p "$CONFIG_HOME/gtk-$ver"
        run mv "$STATE_DIR/backup/gtk-$ver/gtk.css" "$CONFIG_HOME/gtk-$ver/gtk.css"
        ok "ripristinato il tuo ~/.config/gtk-$ver/gtk.css"
    fi
done

while IFS= read -r name; do
    [[ -n "$name" ]] || continue
    run rm -rf "$THEMES_DIR/$name"; ok "tema $name rimosso"
done < <(manifest_lines theme)

while IFS= read -r name; do
    [[ -n "$name" ]] || continue
    run rm -rf "$ICONS_DIR/$name"; ok "icone $name rimosse"
done < <(manifest_lines icons)

while IFS= read -r path; do
    [[ -n "$path" ]] || continue
    run rm -rf "$path"; ok "rimosso ${path/#$HOME/~}"
done < <(manifest_lines dir; manifest_lines file)

for uuid in "${OUR_EXTS[@]}"; do
    run rm -rf "$EXT_DIR/$uuid"; ok "estensione $uuid rimossa"
done

# Flatpak: toglie solo i permessi aggiunti dall'installer
override="$DATA_HOME/flatpak/overrides/global"
while IFS= read -r flag; do
    [[ -n "$flag" ]] || continue
    if [[ -f "$override" ]]; then
        run sed -i -e "s#${flag};##g" -e '/^filesystems=$/d' "$override"
        ok "Flatpak: tolto $flag"
    fi
done < <(manifest_lines flatpak)

run rm -rf "$STATE_DIR"

step "Fatto"
cat <<EOT
  Outkast è stato rimosso e le impostazioni sono tornate come prima.
  ${C_B}Esci e rientra nella sessione${C_0} per far sparire estensione e tema della Shell.
EOT
