# Authoring-guide friction log

Every place `@supabase/middleware`'s `docs/authoring-guide.md` fell short while
building this package from scratch, written down as we hit it. This is one of
the outputs of the work, not a write-up done afterwards.

Format: what the guide says → what actually happened → what would have helped.

**Section numbers in this file always mean sections of the authoring guide**
(`docs/authoring-guide.md` in `supabase/middleware`), not of this file or of the
design document.

## F1 — section 4's `package.json` is ESM-only; the engine ships dual

**Guide:** section 4's example declares a single `exports` condition pair
(`types` + `default`) pointing at `./dist/index.js`.
**Reality:** the engine's own `package.json` ships dual ESM+CJS with four
condition entries per subpath and a `main`/`types` fallback pair. An author
copying section 4 verbatim ships ESM-only and will not learn that from the guide.
**Would have helped:** one sentence saying ESM-only is the recommended default
and that dual output is the engine's own choice, not a requirement.

## F2 — section 4 omits the TypeScript peer dependency and its floor

**Guide:** section 4's `devDependencies` list `tsdown`, `typescript`, `vitest`. No
`peerDependencies`.
**Reality:** any middleware that uses `NoInfer` in an exported signature emits
it into the published `.d.ts` and therefore inherits the engine's TypeScript

> = 5.4 consumer floor (engine commit `b673919`). That obligation is documented
> in the engine's root README, not in the authoring guide, so an author following
> only the guide will not declare it.
> **Would have helped:** section 4 declaring `"peerDependencies": { "typescript": ">=5.4" }`
> with `peerDependenciesMeta.typescript.optional = true`, and a line explaining why.

## F3 — the guide has no scaffolding checklist beyond `package.json`

**Guide:** section 4 gives `package.json` and nothing else.
**Reality:** a from-scratch repo also needs `tsconfig.json` (which compiler
options? the engine's are load-bearing for the type tests — `strict`,
`target ES2020`, `moduleResolution bundler`), `tsdown.config.ts`,
`vitest.config.ts`, a formatter config, `.gitignore` and a licence. Each was
recovered by reading the engine's repo, which section 4 does not tell you to do.
**Would have helped:** a short "the rest of the files" block, or an explicit
pointer to the engine repo as the reference scaffold.

## F4 — no guidance on where type tests live or how to run them

**Guide:** section 3 covers runtime tests with vitest. Type-level checks appear only as
an inline `satisfies FetchHandler` inside a runtime test file.
**Reality:** this package's correctness is mostly type-level, including
must-NOT-compile cases (see the design document's type-design section and its appendix). Those cannot live in a file
that `tsc --noEmit` checks, so they need their own tsconfig and a harness that
asserts the expected diagnostics appear. The guide offers no pattern.
**Would have helped:** a section 3.1 showing a `type-tests/` directory, a second
tsconfig, and a negative-test harness.

## F5 — section 4's `exports` block does not match what tsdown actually emits

**Guide:** section 4's `exports` points at `./dist/index.js` and `./dist/index.d.ts`,
and section 4's `devDependencies` name `tsdown` as the bundler. The two are presented
together as a working pair.

**Reality:** they are not. `tsdown` defaults `fixedExtension` to `true` on the
node platform, so `format: ['esm']` emits `dist/index.mjs` and
`dist/index.d.mts`. Copying section 4 verbatim therefore produces a package whose
`exports` map points at two files that do not exist — and nothing in the build
complains. `pnpm build` reports success; the breakage only surfaces when a
consumer tries to import the package.

Verified here: the first `pnpm build` of this repo, scaffolded from section 4 with no
deviations, emitted

```
dist/index.mjs    0.33 kB
dist/index.d.mts  0.35 kB
```

against an `exports` map naming `./dist/index.js`.

**Fix applied:** `fixedExtension: false` in `tsdown.config.ts`. Since
`"type": "module"` already marks the package as ESM, a plain `.js` extension is
unambiguous, and it keeps section 4's `exports` block copyable verbatim.

**Would have helped:** section 4 shipping the matching `tsdown.config.ts` next to the
`package.json`, rather than leaving the author to discover that the two halves
of the guide's own example disagree. This is the single highest-value fix in
this log: it is silent, it hits every author on their first build, and it is one
line.

## F6 — section 3's test recipe has no way to supply an upstream context

**Guide:** section 3 shows a middleware tested by calling the composed handler with a
`Request` — `await handler(post({ name: 'ada' }))` — and says "no test harness
is needed. A composed middleware is just a `(req, ctx?) => Promise<Response>`,
so you call it with a `Request` and assert on the `Response`."

**Reality:** true only for a middleware that ignores upstream context. This one
takes a `context` callback that reads upstream keys, and the obvious
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

**Would have helped:** two lines in section 3 — "to test against an upstream context,
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
could serve as the guide's regression suite (design document, ask E2).

## F8 — no pattern for must-not-compile tests

**Guide:** section 3's only type-level assertion is an inline `satisfies FetchHandler`
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

**One discovery worth carrying into the guide, observed live.** `Conflict`'s
docblock states the sentinel surfaces as **TS2769**, "with the sentinel on the
first line of the per-overload breakdown". That holds only once **two or more**
signatures can accept a handler. This package watched the code change under it:

| Interface shape                                                      | Collision diagnostic                                                                 |
| -------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| cascade + config-only (2 signatures, 1 takes a handler)              | **TS2345** — plain argument mismatch, sentinel on the top-level line                 |
| cascade + propagation + config-only (3 signatures, 2 take a handler) | **TS2769** — "No overload matches this call", sentinel in the per-overload breakdown |

Adding the propagation overload (see F9) flipped it. Two consequences for anyone
writing a negative type test against a bespoke signature:

1. Asserting on the diagnostic **code** is fragile — it is a function of the
   overload set's shape, not of the error.
2. A harness that parses only top-level `file(line,col): error TSxxxx: message`
   lines **cannot see the sentinel at all** under TS2769, because the useful text
   is in the indented breakdown. This one had to be taught to fold continuation
   lines into the preceding diagnostic before A11 could assert on the sentinel.

**Would have helped:** the guide shipping the `type-tests/` + marker-comment +
harness pattern this package now has, and `Conflict`'s docblock noting that the
diagnostic code depends on how many signatures can accept a handler — and that
the sentinel moves into the breakdown when it does.

## F9 — "the third overload may be moot" was wrong, and nothing would have caught it

**Guide:** does not mention the propagation overload at all. `Middleware`'s TSDoc
in the engine describes all three signatures, but only an author who reads the
engine source finds them.

**Reality:** the design reasoned that because this middleware declares no `In`
prerequisites, the engine's third (propagation) overload was probably
unnecessary, and recorded it as an open question. That reasoning was
wrong, and the reason is worth writing down: the propagation form is not about
**this** layer's prerequisites. It is about the **wrapped handler's**. A handler
that declares an upstream key this layer does not contribute, composed without an
anchor, needs the requirement to travel outward — and a two-overload interface
cannot express that:

```
TS2345: Argument of type '(_req: Request, ctx: { jwtClaims: JWTClaims | null;
flags: { a: boolean; }; }) => Promise<Response>' is not assignable to parameter
of type '(req: Request, ctx: object & { flags: Resolved<{ a: false; }>; }) =>
Promise<Response>'.
  Property 'jwtClaims' is missing in type '{ flags: Resolved<{ a: false; }>; }'
```

An author who ships two overloads gets a package that works in every example the
guide shows and fails on the first consumer who composes it unanchored.

**Would have helped:** one line in the guide — "if you hand-write a signature,
you need all three of the engine's overloads, not the two you will reach for. The
propagation form covers the wrapped handler's prerequisites, not your own."

## F10 — no release or CI guidance at all

**Guide:** section 4 ends at `package.json`.

**Reality:** a publishable package also needs a CI workflow, a release
mechanism, and a decision about the TypeScript floor check. All of it was
recovered by copying the engine's `.github/workflows/` and
`release-please-config.json`. An author outside the org has no such reference.

The consumer-floor check is the one nobody would think to add on their own, and
it is the one that matters most: it is the only thing standing between a
`NoInfer` in an exported signature and a consumer on TypeScript 5.3 getting an
unreadable error from a package that advertises no floor at all.

**Would have helped:** a section 6 pointing at the engine's workflows as a template, or
a minimal CI snippet in the guide itself — typecheck, test, build, and the
consumer-floor check.

## F11 — the guide's own Rule 7 is not mechanically checkable as written

**Guide:** Rule 7 — "NEVER import from `node:*`."

**Reality:** the obvious CI check for it, `grep -rn "node:" src/`, **fails on a
clean tree**. This package's `src/types.ts` explains in a doc comment why it
avoids `@openfeature/server-sdk`'s `node:events` — so documenting compliance with
Rule 7 trips the naive check for Rule 7. The working form has to match import
specifiers:

```bash
grep -rnE "(from|import|require)\s*\(?\s*['\"]node:" src/
```

Verified both ways here: the naive form reports a violation on a clean tree, and
the form above does not, while still catching a real
`import { EventEmitter } from 'node:events'`.

Related: this is only a check of the package's **own source**. Whether Rule 7 is
meant to constrain the dependency tree too is the open question in the design
document, ask E1 — and no grep can answer that one.

**Would have helped:** the guide shipping the specifier-matching grep as the
canonical Rule 7 check, so every author does not write the broken one first.
