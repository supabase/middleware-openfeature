#!/usr/bin/env bash
# TEMPORARY — remove once @supabase/middleware-openfeature is published to npm.
#
# The Vercel and Cloudflare examples cannot depend on the package by version yet,
# and they cannot use `link:../../..` either: both platforms upload only the
# directory you deploy, so a symlink pointing above it does not survive. This
# packs the package — the exact files `npm publish` would ship — into each
# runtime's own vendor/ directory, where `file:./vendor/pkg.tgz` resolves inside
# the deploy root.
#
# When the package is published, delete this script, delete the vendor/
# directories, and change the dependency in each runtime's package.json to a
# normal version range.
set -euo pipefail

here="$(cd "$(dirname "$0")" && pwd)"
repo="$(cd "$here/.." && pwd)"

if [ ! -f "$repo/dist/index.js" ]; then
  echo "dist/index.js not found — run \`pnpm build\` in the repo root first" >&2
  exit 1
fi

tmp="$(mktemp -d)"
tarball="$(pnpm --dir "$repo" pack --pack-destination "$tmp" | tail -n1)"

for runtime in vercel cloudflare; do
  dest="$here/runtimes/$runtime/vendor"
  mkdir -p "$dest"
  cp "$tarball" "$dest/middleware-openfeature.tgz"
  echo "vendored -> runtimes/$runtime/vendor/middleware-openfeature.tgz"
done

rm -rf "$tmp"
echo
echo "Now run 'pnpm install' in each runtime directory to pick up the new build."
