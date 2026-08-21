#!/usr/bin/env bash
# The edge runtime container mounts only supabase/functions/, so a function
# cannot import ../../handlers/. This copies the shared code in, and packs the
# middleware itself the same way smoke/edge/vendor.sh does.
#
# Everything it writes is generated — examples/.gitignore excludes it.
set -euo pipefail

here="$(cd "$(dirname "$0")" && pwd)"
repo="$(cd "$here/../../.." && pwd)"
shared="$here/supabase/functions/_shared"

if [ ! -f "$repo/dist/index.js" ]; then
  echo "dist/index.js not found — run \`pnpm build\` in the repo root first" >&2
  exit 1
fi

rm -rf "$shared"
mkdir -p "$shared"
cp -R "$here/../../handlers" "$shared/handlers"
cp -R "$here/../../providers" "$shared/providers"

# Pack the middleware: the exact files `npm publish` would ship.
tarball="$(pnpm --dir "$repo" pack --pack-destination "$shared" | tail -n1)"
tar -xzf "$tarball" -C "$shared"
rm "$tarball"

echo "Synced handlers/, providers/ and the packed package -> ${shared#"$here/"}"
