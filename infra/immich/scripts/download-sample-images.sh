#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MANIFEST="$ROOT_DIR/seed/manifest.json"
PHOTO_DIR="$ROOT_DIR/seed/photos"

mkdir -p "$PHOTO_DIR"

if ! command -v jq >/dev/null 2>&1; then
  echo "jq is required to read $MANIFEST" >&2
  exit 1
fi

echo "Downloading sample photos into $PHOTO_DIR"

while IFS=$'\t' read -r file source; do
  target="$PHOTO_DIR/$file"
  if [ -s "$target" ]; then
    echo "  present  $file"
    continue
  fi

  echo "  fetch    $file"
  curl -fL --retry 3 --retry-delay 1 --connect-timeout 20 -o "$target" "$source"
done < <(jq -r '
  if ((.albums // []) | length) > 0 then
    .albums[] as $album
    | $album.photos
    | to_entries[]
    | [
        ($album.slug + "-" + ((.key + 1) | tostring) + ".jpg"),
        ("https://picsum.photos/seed/" + $album.slug + "-" + ((.key + 1) | tostring) + "/1800/1200.jpg")
      ]
    | @tsv
  else
    .photos[] | [.file, .source] | @tsv
  end
' "$MANIFEST")

echo "Sample photos are ready."
