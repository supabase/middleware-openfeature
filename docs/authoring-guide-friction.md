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

## F6 — §3's test recipe has no way to supply an upstream context

**Guide:** §3 shows a middleware tested by calling the composed handler with a
`Request` — `await handler(post({ name: 'ada' }))` — and says "no test harness
is needed. A composed middleware is just a `(req, ctx?) => Promise<Response>`,
so you call it with a `Request` and assert on the `Response`."

**Reality:** true only for a middleware that ignores upstream context. This one
takes a `context` callback that reads upstream keys (design §6), and the obvious
way to test it — pass the context positionally, which the published signature
openly invites — **silently does not work**:

```ts
await handler(req, { jwtClaims: { sub: 'user-1' } }) // callback sees {} instead
```

`isContext` looks for a `Symbol.for` marker that only `seedContext` sets. An
unmarked object in that slot is read as the _host platform argument_ (a Workers
`env`, a Deno `ServeHandlerInfo`) and — worse than being ignored — is captured
as the module-scoped `platformEnv` that `getEnv` reads, while a fresh empty
context is seeded for the stack. No error, no warning; the assertion just fails
somewhere unrelated.

This is documented, but in the TSDoc of `seedContext`/`isContext` in
`src/core/runtime.ts` and in a parenthetical on `BaseContext` — none of which an
author following the guide has reason to open. Cost here: one debugging cycle on
a test that looked correct.

The two forms that _do_ work are now pinned as tests in
`src/with-open-feature.test.ts`:

- compose under a real upstream middleware (the production path)
- `{ ...seedContext(), jwtClaims: … }` — the mint path `seedContext`'s docstring
  sanctions for hosts embedding the engine

**Would have helped:** two lines in §3 — "to test against an upstream context,
either nest under the contributing middleware or spread your keys onto
`seedContext()`; a plain object in the `ctx` position is treated as the host's
platform argument."

## F7 — the bespoke generic signature has no worked example anywhere

**Guide:** never mentions bespoke signatures. The only sanction for them is a
paragraph inside `NoConflict`'s TSDoc in `src/core/define-middleware.ts`, which
an author following the guide has no reason to open.

**Reality:** any middleware needing a type parameter beyond `defineMiddleware`'s
four must hand-write its own overload set and get three separate things right:

1. **`NoInfer` on the handler parameter, and nowhere else.** Verified here by
   experiment: moving it onto `config` in the config-only overload breaks the
   `pipeline` form with

   ```
   TS2322: Type '(_r: Request, ctx: { jwtClaims: JWTClaims | null; }) => …' is not
   assignable to type '(req: Request, ctx: object) => EvaluationContext'.
   ```

   An explicit param annotation is the sole channel by which the accumulated
   context can be supplied in that form, and `NoInfer` closes it.

2. **`NoConflict` on every overload that can accept a handler.** The docblock
   says so; the design's own sketch omitted it. Adding it back was verified not
   to disturb the inward cascade — all five positive cases still compile.
3. **Overload order** — cascade before config-only.

The design for this package got `NoInfer` wrong twice while being written, once
in a way that **compiled clean and silently dropped typing**. Nothing in the
guide would have caught that.

**Would have helped:** a guide section walking one bespoke signature end to end,
with those three rules stated. This package is the natural worked example, and
its type tests — positive plus the message-asserted must-NOT-compile cases —
could serve as the guide's regression suite (design §9.3, ask E2).

## F8 — no pattern for must-not-compile tests

**Guide:** §3's only type-level assertion is an inline `satisfies FetchHandler`
in a runtime test file.

**Reality:** a middleware whose contract is mostly type-level needs cases that
must _fail_ to compile, and those cannot live in a file `tsc --noEmit` checks.
They need a second tsconfig and a separate script.

They also need assertions on the error **message**, not just its presence.
`@ts-expect-error` would have passed all five cases here while proving almost
nothing: three of them exist specifically to show a `ctx` is typed rather than
silently `any`, and only the message distinguishes that from "rejected for an
unrelated reason". The messages this repo now pins:

| Case | Asserted message                                                                                                            |
| ---- | --------------------------------------------------------------------------------------------------------------------------- |
| A5   | `Property 'nope' does not exist on type 'object & { jwtClaims: JWTClaims \| null; }'`                                       |
| A6   | `'ctx.jwtClaims' is possibly 'null'`                                                                                        |
| A7   | `Property 'jwtClaims' does not exist on type 'object'`                                                                      |
| A10  | `Property 'nope' does not exist on type 'object & { jwtClaims: JWTClaims \| null; } & { flags: Resolved<{ a: false; }>; }'` |
| A11  | `middleware-conflict: key 'flags' is already present on the upstream context`                                               |

A10's is the interesting one: the full accumulated type printed in the error is
the only direct evidence that `pipeline`'s handler `ctx` is real accumulation.

**One discovery worth carrying into the guide.** `Conflict`'s docblock states the
sentinel surfaces as **TS2769**, "with the sentinel on the first line of the
per-overload breakdown". That is true of the engine's own `Middleware`, which has
two handler-accepting overloads. A bespoke interface with only _one_ such
signature gets **TS2345** instead — a plain argument mismatch. The sentinel text
still reaches the reader and still names the key, so the design intent holds, but
an author asserting on the code will pick the wrong one from the docblock.

**Would have helped:** the guide shipping the `type-tests/` + marker-comment +
harness pattern this package now has, and `Conflict`'s docblock noting that the
diagnostic code depends on how many overloads can accept a handler.

<!-- Entry F9 is added by Task 9: CI and release. -->
