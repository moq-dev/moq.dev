#!/usr/bin/env bash
# Smooths a traced two-colour icon (#4dc515 green, #fcfcfc white accents) in
# place: render it large, blur away the tracing jitter, threshold each colour,
# re-trace with potrace, and crop to the drawing. Keeps the hand-drawn shape;
# only the small nicks and bumps go.
#
#   nix shell nixpkgs#potrace nixpkgs#imagemagick nixpkgs#librsvg -c tools/icons/smooth.sh public/drawn/icon-*.svg
#
# SIGMA (default 12, in pixels of the 1600px render) sets how much smooths away.
# Much past 12 starts merging nearby shapes, like a Game Boy's screen and D-pad.
set -euo pipefail

sigma=${SIGMA:-12}
t=$(mktemp -d)
trap 'rm -rf "$t"' EXIT

trace() {
	magick "$1" -negate "$t/m.pbm"
	potrace "$t/m.pbm" -s -r 72 -a 1.334 -O 1.2 -t 40 -u 4 -o "$t/m.svg"
	sed -n '/<g /,/<\/g>/p' "$t/m.svg" | sed 's/fill="#000000"//; s/ stroke="none"//'
}

for svg in "$@"; do
	rsvg-convert -w 1600 -h 1600 --keep-aspect-ratio "$svg" -o "$t/r.png"

	# Ink is anything opaque; white is a bright red channel, since the green's is 0x4d.
	magick "$t/r.png" -alpha extract -threshold 50% "$t/ink.png"
	magick "$t/r.png" -background black -alpha remove -channel R -separate -threshold 65% "$t/white.png"

	bbox=$(magick "$t/ink.png" -format '%@' info:)
	for mask in ink white; do
		magick "$t/$mask.png" -crop "$bbox" +repage -bordercolor black -border 24 \
			-blur "0x$sigma" -threshold 50% "$t/$mask.png"
	done

	# Green is the ink minus the white, grown 3px under the white so shared edges don't seam.
	magick "$t/ink.png" "$t/white.png" -compose minus_src -composite "$t/green.png"
	magick "$t/green.png" -morphology dilate disk:3 "$t/white.png" -compose multiply -composite \
		"$t/green.png" -compose lighten -composite "$t/green.png"

	size=$(magick identify -format '%w %h' "$t/ink.png")
	title=$(grep -o '<title>[^<]*</title>' "$svg" || true)
	{
		echo "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 $size\">"
		if [ -n "$title" ]; then echo "  $title"; fi
		echo '<g fill="#4dc515">'
		trace "$t/green.png"
		echo '</g>'
		if [ "$(magick "$t/white.png" -format '%[fx:mean>0.0005]' info:)" = 1 ]; then
			echo '<g fill="#fcfcfc">'
			trace "$t/white.png"
			echo '</g>'
		fi
		echo '</svg>'
	} > "$t/out.svg"
	mv "$t/out.svg" "$svg"
done
