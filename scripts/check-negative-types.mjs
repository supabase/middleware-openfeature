/**
 * Compile `type-tests/negative.ts` and assert every `@expect-error` marker in
 * it is matched by a real diagnostic — and that no diagnostic goes unclaimed.
 *
 * `@ts-expect-error` would prove only that *an* error occurred. Several of
 * these cases exist to prove a `ctx` is not silently `any`, and only the
 * message text distinguishes "correctly rejected" from "rejected for an
 * unrelated reason", so the message is what gets checked.
 */

import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

const FILE = 'type-tests/negative.ts'
const PROJECT = 'type-tests/tsconfig.negative.json'

/** Parse `// @expect-error TS2339 some substring` markers out of the file. */
function readExpectations() {
  const expectations = []
  const lines = readFileSync(FILE, 'utf8').split('\n')
  lines.forEach((line, index) => {
    const match = /^\s*\/\/\s*@expect-error\s+(TS\d+)\s+(.+?)\s*$/.exec(line)
    if (match) {
      expectations.push({ line: index + 1, code: match[1], message: match[2] })
    }
  })
  return expectations
}

/** Parse `path(line,col): error TS2339: message` out of tsc's stdout. */
function readDiagnostics(stdout) {
  const diagnostics = []
  for (const line of stdout.split('\n')) {
    const match = /^(.+?)\((\d+),(\d+)\):\s+error\s+(TS\d+):\s+(.*)$/.exec(line)
    if (match) {
      diagnostics.push({
        file: match[1],
        line: Number(match[2]),
        code: match[4],
        message: match[5],
      })
    }
  }
  return diagnostics
}

const expectations = readExpectations()
if (expectations.length === 0) {
  console.error(
    `No @expect-error markers found in ${FILE}. Refusing to pass vacuously.`,
  )
  process.exit(1)
}

const tsc = spawnSync(
  'node_modules/.bin/tsc',
  ['--noEmit', '--pretty', 'false', '-p', PROJECT],
  { encoding: 'utf8' },
)
const diagnostics = readDiagnostics(`${tsc.stdout ?? ''}\n${tsc.stderr ?? ''}`)

const unclaimed = [...diagnostics]
const unmet = []

for (const expectation of expectations) {
  const index = unclaimed.findIndex(
    (d) =>
      d.code === expectation.code && d.message.includes(expectation.message),
  )
  if (index === -1) unmet.push(expectation)
  else unclaimed.splice(index, 1)
}

let failed = false

if (unmet.length > 0) {
  failed = true
  console.error(
    'These cases did NOT produce the expected error — a regression made them compile:',
  )
  for (const e of unmet) {
    console.error(
      `  ${FILE}:${e.line}  expected ${e.code} containing: ${e.message}`,
    )
  }
}

if (unclaimed.length > 0) {
  failed = true
  console.error(
    'Unexpected diagnostics — the negative tests are failing for the wrong reason:',
  )
  for (const d of unclaimed) {
    console.error(`  ${d.file}:${d.line}  ${d.code}: ${d.message}`)
  }
}

if (failed) {
  console.error('\nFull tsc output:\n')
  console.error(tsc.stdout ?? '')
  process.exit(1)
}

console.log(
  `Negative type tests OK — ${expectations.length} expected errors, all matched.`,
)
