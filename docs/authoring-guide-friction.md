# Authoring-guide friction log

Every place `@supabase/middleware`'s `docs/authoring-guide.md` was insufficient
while building this package from scratch, recorded as it was hit. This is a
first-class deliverable of the dogfooding exercise (design §8, §9), not a
retrospective.

Format: what the guide says → what actually happened → what would have helped.

## F1 — §4's `package.json` is ESM-only; the engine ships dual

**Guide:** §4's example declares a single `exports` condition pair
(`types` + `default`) pointing at `./dist/index.js`.
**Reality:** the engine's own `package.json` ships dual ESM+CJS with four
condition entries per subpath and a `main`/`types` fallback pair. An author
copying §4 verbatim ships ESM-only and will not learn that from the guide.
**Would have helped:** one sentence saying ESM-only is the recommended default
and that dual output is the engine's own choice, not a requirement.

## F2 — §4 omits the TypeScript peer dependency and its floor

**Guide:** §4's `devDependencies` list `tsdown`, `typescript`, `vitest`. No
`peerDependencies`.
**Reality:** any middleware that uses `NoInfer` in an exported signature emits
it into the published `.d.ts` and therefore inherits the engine's TypeScript

> = 5.4 consumer floor (engine commit `b673919`). That obligation is documented
> in the engine's root README, not in the authoring guide, so an author following
> only the guide will not declare it.
> **Would have helped:** §4 declaring `"peerDependencies": { "typescript": ">=5.4" }`
> with `peerDependenciesMeta.typescript.optional = true`, and a line explaining why.

## F3 — the guide has no scaffolding checklist beyond `package.json`

**Guide:** §4 gives `package.json` and nothing else.
**Reality:** a from-scratch repo also needs `tsconfig.json` (which compiler
options? the engine's are load-bearing for the type tests — `strict`,
`target ES2020`, `moduleResolution bundler`), `tsdown.config.ts`,
`vitest.config.ts`, a formatter config, `.gitignore` and a licence. Each was
recovered by reading the engine's repo, which §4 does not tell you to do.
**Would have helped:** a short "the rest of the files" block, or an explicit
pointer to the engine repo as the reference scaffold.

## F4 — no guidance on where type tests live or how to run them

**Guide:** §3 covers runtime tests with vitest. Type-level checks appear only as
an inline `satisfies FetchHandler` inside a runtime test file.
**Reality:** this package's correctness is mostly type-level, including
must-NOT-compile cases (design §4.2, Appendix A). Those cannot live in a file
that `tsc --noEmit` checks, so they need their own tsconfig and a harness that
asserts the expected diagnostics appear. The guide offers no pattern.
**Would have helped:** a §3.1 showing a `type-tests/` directory, a second
tsconfig, and a negative-test harness.

## F5 — §4's `exports` block does not match what tsdown actually emits

**Guide:** §4's `exports` points at `./dist/index.js` and `./dist/index.d.ts`,
and §4's `devDependencies` name `tsdown` as the bundler. The two are presented
together as a working pair.

**Reality:** they are not. `tsdown` defaults `fixedExtension` to `true` on the
node platform, so `format: ['esm']` emits `dist/index.mjs` and
`dist/index.d.mts`. Copying §4 verbatim therefore produces a package whose
`exports` map points at two files that do not exist — and nothing in the build
complains. `pnpm build` reports success; the breakage only surfaces when a
consumer tries to import the package.

Verified here: the first `pnpm build` of this repo, scaffolded from §4 with no
deviations, emitted

```
dist/index.mjs    0.33 kB
dist/index.d.mts  0.35 kB
```

against an `exports` map naming `./dist/index.js`.

**Fix applied:** `fixedExtension: false` in `tsdown.config.ts`. Since
`"type": "module"` already marks the package as ESM, a plain `.js` extension is
unambiguous, and it keeps §4's `exports` block copyable verbatim.

**Would have helped:** §4 shipping the matching `tsdown.config.ts` next to the
`package.json`, rather than leaving the author to discover that the two halves
of the guide's own example disagree. This is the single highest-value fix in
this log: it is silent, it hits every author on their first build, and it is one
line.

<!-- Entries F6+ are added by later tasks: F6 bespoke generic signature (Task 5),
     F7 must-not-compile tests (Task 6), F8 CI and release (Task 9). -->
