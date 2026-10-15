#!/usr/bin/env bash
# Genera gli sfondi (scuro e chiaro) con ImageMagick, dalla palette di Outkast.
#
# Il disegno è la cornice del tema: una griglia quasi invisibile e un rettangolo arancio che sfora dal bordo
# dello schermo ("outkast": fuori dai margini), con piccoli segni di registro agli angoli, come in una stampa.
#
# Uso: tools/make-wallpapers.sh [cartella-uscita]     (predefinito: wallpapers/)   Richiede ImageMagick.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT="${1:-$ROOT/wallpapers}"
W=3840; H=2160
CELL=120
MONO="${OUTKAST_MONO_FONT:-/usr/share/fonts/Adwaita/AdwaitaMono-Regular.ttf}"
[[ -f "$MONO" ]] || MONO="$(fc-match -f '%{file}' monospace)"

command -v magick >/dev/null || { echo "serve ImageMagick (comando 'magick')" >&2; exit 1; }
mkdir -p "$OUT"

# nome  sfondo  filetto  filetto-forte  cornice-spenta  testo-tenue  testo-debole
# La cornice è un arancio volutamente spento: l'arancio vivo è riservato all'interfaccia (cornice di focus, selezione).
make() {
    local name=$1 bg=$2 line=$3 line2=$4 accent=$5 dim=$6 faint=$7
    local tile; tile="$(mktemp --suffix=.png)"
    # una cella di griglia: filetto sul bordo alto e sinistro; ogni 5 celle (600px) un filetto più forte
    magick -size ${CELL}x${CELL} "xc:$bg" -fill "$line" -draw "rectangle 0,0 $((CELL - 1)),0" -draw "rectangle 0,0 0,$((CELL - 1))" "$tile"

    # filetti forti ogni 5 celle, come un'unica stringa di primitive (un solo -draw)
    local strong="" x y
    for x in $(seq 600 600 $((W - 1))); do strong+="rectangle $x,0 $x,$((H - 1)) "; done
    for y in $(seq 600 600 $((H - 1))); do strong+="rectangle 0,$y $((W - 1)),$y "; done

    # rettangolo-cornice: sfora a destra, ancorato su una sezione aurea
    local fx=$((W * 618 / 1000)) fy=$((H * 382 / 1000 - 90)) fw=$W fh=1080 t=5
    magick -size ${W}x${H} "tile:$tile" \
        -fill "$line2" -stroke none -draw "$strong" \
        -fill none -stroke "$accent" -strokewidth $t -draw "rectangle $fx,$fy $((fx + fw)),$((fy + fh))" \
        -stroke none -fill "$accent" -draw "rectangle $((fx - 14)),$((fy - 14)) $((fx + 26)),$((fy + 26))" \
        -fill "$dim" -font "$MONO" -pointsize 34 -annotate +$((fx + 52))+$((fy - 18)) "outkast" \
        -fill "$faint" -pointsize 28 -annotate +$((fx + 52))+$((fy + fh + 54)) "x 0.618   y 0.382" \
        -stroke "$faint" -strokewidth 3 \
        -draw "line 90,150 150,150" -draw "line 120,120 120,180" \
        -draw "line $((W - 150)),150 $((W - 90)),150" -draw "line $((W - 120)),120 $((W - 120)),180" \
        -draw "line 90,$((H - 150)) 150,$((H - 150))" -draw "line 120,$((H - 180)) 120,$((H - 120))" \
        -draw "line $((W - 150)),$((H - 150)) $((W - 90)),$((H - 150))" -draw "line $((W - 120)),$((H - 180)) $((W - 120)),$((H - 120))" \
        -define png:compression-level=9 "$OUT/$name.png"
    rm -f "$tile"
    echo "  $name.png"
}

make outkast-dark  '#101114' '#181a1f' '#20242b' '#7c3624' '#7d818b' '#4a4e57'
make outkast-light '#f4f2ee' '#e9e5df' '#ddd8d0' '#e2a28f' '#7b7e84' '#a9aaae'
