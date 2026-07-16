#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MANIFEST="$ROOT_DIR/seed/manifest.json"
PHOTO_DIR="$ROOT_DIR/seed/photos"
STATE_FILE="$ROOT_DIR/seed/state.json"

if ! command -v jq >/dev/null 2>&1; then
  echo "jq is required for seeding Immich." >&2
  exit 1
fi

set -a
# shellcheck disable=SC1091
source "$ROOT_DIR/.env"
set +a

IMMICH_URL="${IMMICH_URL:-http://localhost:2283}"
PUBLIC_PROXY_URL="${PUBLIC_PROXY_URL:-http://localhost:3014}"
GALLERY_ALBUM_MARKER="${GALLERY_ALBUM_MARKER:-[gallery]}"
IMMICH_ADMIN_EMAIL="${IMMICH_ADMIN_EMAIL:-portfolio@example.test}"
IMMICH_ADMIN_PASSWORD="${IMMICH_ADMIN_PASSWORD:-ImmichPortfolio123}"
IMMICH_ADMIN_NAME="${IMMICH_ADMIN_NAME:-Portfolio Admin}"
IMMICH_API_URL="${IMMICH_API_URL:-${IMMICH_URL%/}/api}"
SEED_VERSION="$(jq -r '.seedVersion // "vtk-gallery-v1"' "$MANIFEST")"

if [ -f "$STATE_FILE" ] && [ "${FORCE_RESEED:-0}" != "1" ]; then
  if jq -e --arg version "$SEED_VERSION" '.seedVersion == $version' "$STATE_FILE" >/dev/null 2>&1; then
    echo "Immich already appears seeded for $SEED_VERSION from $STATE_FILE."
    echo "Set FORCE_RESEED=1 to create fresh seeded albums and share links."
    exit 0
  fi
fi

"$ROOT_DIR/scripts/download-sample-images.sh"

tmp_dir="$(mktemp -d)"
cleanup() {
  rm -rf "$tmp_dir"
}
trap cleanup EXIT

request_json() {
  local method="$1"
  local url="$2"
  local token="${3:-}"
  local body="${4:-}"
  local output="$tmp_dir/response.json"
  local status

  if [ -n "$token" ]; then
    status="$(curl -sS --connect-timeout 10 --max-time 180 -o "$output" -w "%{http_code}" -X "$method" \
      -H "Authorization: Bearer $token" \
      -H "Content-Type: application/json" \
      --data "$body" \
      "$url" || true)"
  else
    status="$(curl -sS --connect-timeout 10 --max-time 180 -o "$output" -w "%{http_code}" -X "$method" \
      -H "Content-Type: application/json" \
      --data "$body" \
      "$url" || true)"
  fi

  if [ -z "$status" ] || [ "$status" -lt 200 ] || [ "$status" -ge 300 ]; then
    echo "Request failed: $method $url -> HTTP ${status:-none}" >&2
    cat "$output" >&2
    return 1
  fi

  cat "$output"
}

wait_for_immich() {
  echo "Waiting for Immich at $IMMICH_API_URL"
  for attempt in $(seq 1 90); do
    if curl -fsS --connect-timeout 5 --max-time 5 "$IMMICH_API_URL/server/ping" >/dev/null 2>&1; then
      echo "Immich API is reachable."
      return 0
    fi
    sleep 2
    if [ "$attempt" = 90 ]; then
      echo "Timed out waiting for Immich." >&2
      return 1
    fi
  done
}

wait_for_proxy() {
  echo "Waiting for Immich Public Proxy at $PUBLIC_PROXY_URL"
  for attempt in $(seq 1 60); do
    if curl -fsS --connect-timeout 5 --max-time 5 "${PUBLIC_PROXY_URL%/}/share/healthcheck" >/dev/null 2>&1; then
      echo "Immich Public Proxy is reachable."
      return 0
    fi
    sleep 2
    if [ "$attempt" = 60 ]; then
      echo "Timed out waiting for Immich Public Proxy." >&2
      return 1
    fi
  done
}

wait_for_immich

signup_body="$(jq -n \
  --arg email "$IMMICH_ADMIN_EMAIL" \
  --arg password "$IMMICH_ADMIN_PASSWORD" \
  --arg name "$IMMICH_ADMIN_NAME" \
  '{email: $email, password: $password, name: $name}')"

signup_response="$tmp_dir/signup.json"
signup_status="$(curl -sS --connect-timeout 10 --max-time 180 -o "$signup_response" -w "%{http_code}" -X POST \
  -H "Content-Type: application/json" \
  --data "$signup_body" \
  "$IMMICH_API_URL/auth/admin-sign-up" || true)"

case "$signup_status" in
  200|201)
    echo "Created Immich admin user $IMMICH_ADMIN_EMAIL."
    ;;
  400|409)
    echo "Immich admin user already exists; logging in."
    ;;
  *)
    echo "Admin sign-up failed with HTTP $signup_status" >&2
    cat "$signup_response" >&2
    exit 1
    ;;
esac

login_body="$(jq -n \
  --arg email "$IMMICH_ADMIN_EMAIL" \
  --arg password "$IMMICH_ADMIN_PASSWORD" \
  '{email: $email, password: $password}')"
login_json="$(request_json POST "$IMMICH_API_URL/auth/login" "" "$login_body")"
token="$(printf "%s" "$login_json" | jq -r '.accessToken')"

if [ -z "$token" ] || [ "$token" = "null" ]; then
  echo "Could not read accessToken from Immich login response." >&2
  printf "%s\n" "$login_json" >&2
  exit 1
fi

request_json POST "$IMMICH_API_URL/system-metadata/admin-onboarding" "$token" '{"isOnboarded":true}' >/dev/null || true

config_json="$(curl -fsS --connect-timeout 10 --max-time 180 -H "Authorization: Bearer $token" "$IMMICH_API_URL/system-config")"
updated_config="$(printf "%s" "$config_json" | jq --arg proxy "$PUBLIC_PROXY_URL" '.server.externalDomain = $proxy')"
request_json PUT "$IMMICH_API_URL/system-config" "$token" "$updated_config" >/dev/null

albums_json="$tmp_dir/albums.json"
printf "[]" > "$albums_json"

echo "Uploading photos and creating 10 event albums."

while IFS= read -r album_json; do
  slug="$(printf "%s" "$album_json" | jq -r '.slug')"
  title="$(printf "%s" "$album_json" | jq -r '.title')"
  event="$(printf "%s" "$album_json" | jq -r '.event')"
  place="$(printf "%s" "$album_json" | jq -r '.place')"
  event_date="$(printf "%s" "$album_json" | jq -r '.date')"
  description="$(printf "%s" "$album_json" | jq -r '.description')"
  immich_album_description="$GALLERY_ALBUM_MARKER $description"
  album_photos_json="$tmp_dir/$slug-photos.json"
  printf "[]" > "$album_photos_json"

  echo "  album    $title"

  while IFS= read -r photo_entry_json; do
    index="$(printf "%s" "$photo_entry_json" | jq -r '.key')"
    photo_json="$(printf "%s" "$photo_entry_json" | jq -c '.value')"
    number=$((index + 1))
    file="$slug-$number.jpg"
    photo_title="$(printf "%s" "$photo_json" | jq -r '.title')"
    photo_description="$(printf "%s" "$photo_json" | jq -r '.description')"
    source="https://picsum.photos/seed/$slug-$number/1800/1200.jpg"
    path="$PHOTO_DIR/$file"

    if [ ! -s "$path" ]; then
      echo "Missing photo file: $path" >&2
      exit 1
    fi

    printf -v hour "%02d" $((10 + index))
    photo_date="${event_date}T${hour}:00:00.000Z"
    featured="false"
    if [ "$index" = "0" ]; then
      featured="true"
    fi

    echo "    upload  $photo_title"
    upload_response="$tmp_dir/upload.json"
    upload_status="$(curl -sS --connect-timeout 10 --max-time 300 -o "$upload_response" -w "%{http_code}" -X POST \
      -H "Authorization: Bearer $token" \
      -F "assetData=@$path;filename=$file;type=image/jpeg" \
      -F "deviceAssetId=immich-events-$slug-$number" \
      -F "deviceId=immich-events" \
      -F "filename=$file" \
      -F "fileCreatedAt=$photo_date" \
      -F "fileModifiedAt=$photo_date" \
      -F "isFavorite=$featured" \
      "$IMMICH_API_URL/assets" || true)"

    if [ "$upload_status" -lt 200 ] || [ "$upload_status" -ge 300 ]; then
      echo "Upload failed for $file with HTTP $upload_status" >&2
      cat "$upload_response" >&2
      exit 1
    fi

    asset_id="$(jq -r '.id' "$upload_response")"
    if [ -z "$asset_id" ] || [ "$asset_id" = "null" ]; then
      echo "Upload response for $file did not include an asset id." >&2
      cat "$upload_response" >&2
      exit 1
    fi

    update_body="$(jq -n \
      --arg description "$photo_description" \
      --arg date "$photo_date" \
      '{description: $description, dateTimeOriginal: $date}')"
    request_json PUT "$IMMICH_API_URL/assets/$asset_id" "$token" "$update_body" >/dev/null

    share_body="$(jq -n \
      --arg id "$asset_id" \
      --arg description "$photo_title" \
      '{type: "INDIVIDUAL", assetIds: [$id], allowDownload: true, showMetadata: true, description: $description}')"
    share_json="$(request_json POST "$IMMICH_API_URL/shared-links" "$token" "$share_body")"
    share_key="$(printf "%s" "$share_json" | jq -r '.key')"
    image_url="${PUBLIC_PROXY_URL%/}/share/$share_key"

    next_photos_json="$tmp_dir/$slug-photos-next.json"
    jq \
      --arg title "$photo_title" \
      --arg category "$event" \
      --arg place "$place" \
      --arg date "$photo_date" \
      --arg description "$photo_description" \
      --arg credit "Lorem Picsum sample photo" \
      --arg source "$source" \
      --arg src "$image_url" \
      --arg assetId "$asset_id" \
      --arg featured "$featured" \
      '. + [{
        title: $title,
        category: $category,
        place: $place,
        date: $date,
        description: $description,
        credit: $credit,
        source: $source,
        src: $src,
        assetId: $assetId,
        featured: ($featured == "true")
      }]' "$album_photos_json" > "$next_photos_json"
    mv "$next_photos_json" "$album_photos_json"
  done < <(printf "%s" "$album_json" | jq -c '.photos | to_entries[]')

  asset_ids="$(jq '[.[].assetId]' "$album_photos_json")"
  thumbnail_asset_id="$(jq -r '.[0].assetId' "$album_photos_json")"
  thumbnail_src="$(jq -r '.[0].src' "$album_photos_json")"

  album_body="$(jq -n \
    --arg albumName "$title" \
    --arg description "$immich_album_description" \
    --argjson assetIds "$asset_ids" \
    '{albumName: $albumName, description: $description, assetIds: $assetIds}')"
  created_album_json="$(request_json POST "$IMMICH_API_URL/albums" "$token" "$album_body")"
  album_id="$(printf "%s" "$created_album_json" | jq -r '.id')"

  thumbnail_body="$(jq -n --arg thumbnail "$thumbnail_asset_id" '{albumThumbnailAssetId: $thumbnail}')"
  request_json PATCH "$IMMICH_API_URL/albums/$album_id" "$token" "$thumbnail_body" >/dev/null

  album_share_body="$(jq -n \
    --arg albumId "$album_id" \
    --arg description "$description" \
    '{type: "ALBUM", albumId: $albumId, allowDownload: true, showMetadata: true, description: $description}')"
  album_share_json="$(request_json POST "$IMMICH_API_URL/shared-links" "$token" "$album_share_body")"
  album_key="$(printf "%s" "$album_share_json" | jq -r '.key')"
  album_url="${PUBLIC_PROXY_URL%/}/share/$album_key"

  next_albums_json="$tmp_dir/albums-next.json"
  jq \
    --arg slug "$slug" \
    --arg title "$title" \
    --arg event "$event" \
    --arg place "$place" \
    --arg date "$event_date" \
    --arg description "$description" \
    --arg albumId "$album_id" \
    --arg albumUrl "$album_url" \
    --arg thumbnail "$thumbnail_src" \
    --arg thumbnailAssetId "$thumbnail_asset_id" \
    --slurpfile photos "$album_photos_json" \
    '. + [{
      slug: $slug,
      title: $title,
      event: $event,
      place: $place,
      date: $date,
      description: $description,
      albumId: $albumId,
      albumUrl: $albumUrl,
      thumbnail: $thumbnail,
      thumbnailAssetId: $thumbnailAssetId,
      count: ($photos[0] | length),
      photos: $photos[0]
    }]' "$albums_json" > "$next_albums_json"
  mv "$next_albums_json" "$albums_json"
done < <(jq -c '.albums[]' "$MANIFEST")

wait_for_proxy

jq -n \
  --arg seedVersion "$SEED_VERSION" \
  --arg seededAt "$(date -u +"%Y-%m-%dT%H:%M:%SZ")" \
  --arg immichUrl "$IMMICH_URL" \
  --arg proxyUrl "$PUBLIC_PROXY_URL" \
  --slurpfile albums "$albums_json" \
  '{
    seedVersion: $seedVersion,
    seededAt: $seededAt,
    immichUrl: $immichUrl,
    proxyUrl: $proxyUrl,
    albums: $albums[0]
  }' > "$STATE_FILE"

echo "Seed complete."
echo "Immich:    $IMMICH_URL"
echo "Proxy:     $PUBLIC_PROXY_URL"
echo "Albums:    $(jq 'length' "$albums_json")"
