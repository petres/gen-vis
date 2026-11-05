#!/bin/sh
# The subset of Inter with the symbols the subsets of @fontsource/inter (latin
# and latin-ext) have not, e.g. CO₂, m³, ≤, →, ½, ℃, ●: superscripts and
# subscripts, arrows, mathematical operators, letterlike symbols, number
# forms and geometric shapes, of the weights 400 and 600, in assets/fonts/
# (committed, see fontFaces of vite.config.js). Needs pixi (fontTools) and
# the release of Inter of the version of @fontsource/inter (4.001):
#   sh scripts/fonts.sh path/to/Inter-4.1.zip
set -e
zip=${1:?the release of Inter, e.g. Inter-4.1.zip of https://github.com/rsms/inter/releases}
out=$(cd "$(dirname "$0")/.." && pwd)/assets/fonts
tmp=$(mktemp -d)
unzip -q -o "$zip" 'extras/ttf/Inter-Regular.ttf' 'extras/ttf/Inter-SemiBold.ttf' 'LICENSE.txt' -d "$tmp"
ranges='U+2070-209F,U+2100-214F,U+2150-218F,U+2190-21FF,U+2200-22FF,U+25A0-25FF'
for pair in 400:Regular 600:SemiBold; do
    weight=${pair%%:*}; name=${pair#*:}
    pixi exec --spec fonttools --spec brotli-python -- pyftsubset "$tmp/extras/ttf/Inter-$name.ttf" \
        --unicodes="$ranges" --layout-features='*' --no-hinting --desubroutinize --flavor=woff2 \
        --output-file="$out/inter-symbols-$weight-normal.woff2"
done
cp "$tmp/LICENSE.txt" "$out/LICENSE-Inter.txt"
rm -rf "$tmp"
ls -l "$out"
