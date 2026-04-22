#!/usr/bin/env bash
set -euo pipefail

BASE_URL="https://recyclemap.ru/assets/icons/fractions"
DEST="public/icons/fractions"
mkdir -p "$DEST"

ICONS=(paper plastic glass metall tetrapack clothes lightbulbs caps appliances battery tires dangerous other)

for f in "${ICONS[@]}"; do
  echo "→ $f.svg"
  curl -sfL "${BASE_URL}/${f}.svg" -o "${DEST}/${f}.svg"
done

echo "✓ Downloaded $(ls "$DEST" | wc -l | tr -d ' ') SVG icons into $DEST/"
