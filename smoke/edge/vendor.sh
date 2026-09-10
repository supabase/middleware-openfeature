#!/usr/bin/env bash
# Vendors the packed package into the edge functions directory. The edge runtime
# container mounts only supabase/functions/, so the function cannot import the
# repo-root dist/ directly. `pnpm pack` produces the exact artifact `npm publish`
# would ship, so the smoke test exercises published output.
# Requires `pnpm build` first.
set -euo pipefail

repo_root="$(cd "$(dirname "$0")/../.." && pwd)"
vendor_dir="$repo_root/smoke/edge/supabase/functions/_vendor"

if [ ! -f "$repo_root/dist/index.js" ]; then
  echo "dist/index.js not found — run \`pnpm build\` first" >&2
  exit 1
fi

rm -rf "$vendor_dir"
mkdir -p "$vendor_dir"

tarball="$(pnpm --dir "$repo_root" pack --pack-destination "$vendor_dir" | tail -n1)"
tar -xzf "$tarball" -C "$vendor_dir"
rm "$tarball"

# Supabase CLI >= 2.110 scans import specifiers out of JSDoc comments too, and
# aborts `supabase start` when one does not resolve. Our published JSDoc carries
# `@example` blocks importing '@openfeature/server-sdk' and
# '@supabase-labs/middleware-openfeature'. Both ARE mapped in the function's
# deno.json, so they resolve — but neutralize any subpath specifier on a comment
# line anyway, which is the shape that breaks the scanner (see the identical
# workaround in @supabase/server's e2e/scripts/vendor-pack.sh).
find "$vendor_dir/package/dist" -type f \( -name '*.js' -o -name '*.d.ts' \) \
  -exec sed -i.bak "/^[[:space:]]*\*/ s|'@supabase-labs/middleware-openfeature/[^']*'|'@supabase-labs/middleware-openfeature'|g" {} + \
  && find "$vendor_dir/package/dist" -name '*.bak' -delete

echo "Vendored $(basename "$tarball") -> ${vendor_dir#"$repo_root/"}/package"
