#!/usr/bin/env node
import assert from 'node:assert/strict'
import { realpathSync, readFileSync, statSync } from 'node:fs'
import { createRequire } from 'node:module'
import { isAbsolute, join, relative, resolve, sep } from 'node:path'
import { run } from 'node:test'
import { fileURLToPath } from 'node:url'

const source = fileURLToPath(new URL('../', import.meta.url))
const packageJson = path => JSON.parse(readFileSync(path, 'utf8'))
const checks = new Map([
  [join(source, 'tests/workspace-silent-host.test.mjs'), 5],
  [join(source, 'tests/silent-compaction-input.test.mjs'), 6],
  [join(source, 'tests/silent-compaction-final-handoff.test.mjs'), 1],
]) // Never run the unpatched compaction baseline as acceptance.

export function verifyExactHost(input) {
  assert(input && isAbsolute(input), 'set DSH_CONTROLS_HOST_ROOT to the absolute path of the installed @deepseek-ai/dsh package')
  const root = realpathSync(input)
  const manifestPath = join(root, 'package.json')
  const manifest = packageJson(manifestPath)
  const version = packageJson(join(source, 'package.json')).engines?.dsh
  assert(typeof version === 'string' && /^\d+\.\d+\.\d+(?:-[\w.-]+)?(?:\+[\w.-]+)?$/.test(version), 'engines.dsh must declare a single exact DSH version')
  assert.equal(manifest.name, '@deepseek-ai/dsh', 'host root must contain the DSH CLI manifest')
  assert.equal(manifest.version, version, 'installed DSH must match engines.dsh exactly')
  assert(typeof manifest.bin?.dsh === 'string' && !isAbsolute(manifest.bin.dsh), 'DSH CLI manifest must name a local executable entry')
  const entry = realpathSync(resolve(root, manifest.bin.dsh))
  const path = relative(root, entry)
  assert(path && !isAbsolute(path) && path !== '..' && !path.startsWith('..' + sep) && statSync(entry).isFile(), 'missing local DSH CLI entry')
  const require = createRequire(manifestPath)
  for (const shortName of ['agent', 'agent-loop', 'compaction-basic', 'llm', 'session', 'session-projection', 'system-prompt', 'tool-executor-native', 'tool-executor-ptc', 'tools']) {
    const name = '@deepseek-ai/dsh-' + shortName
    const sdk = packageJson(require.resolve(name + '/package.json'))
    assert.equal(sdk.name, name, 'wrong package at host resolution for ' + name)
    assert.equal(sdk.version, version, name + ' must match the installed DSH version')
  }
  return { root, version }
}

async function verify() {
  assert(process.argv.length === 2, 'Usage: DSH_CONTROLS_HOST_ROOT=/absolute/installed/dsh node scripts/verify-silent-request-readiness.mjs')
  const { root, version } = verifyExactHost(process.env.DSH_CONTROLS_HOST_ROOT)
  process.env.DSH_CONTROLS_HOST_ROOT = root
  process.env.MATTPOCOCK_STRICT_SILENCE_REQUIRED = '1'
  console.log(`Strict silent-request gate: DSH ${version} (${root})`)
  const observed = new Map([...checks.keys()].map(file => [file, 0]))
  let summary
  for await (const { type, data } of run({ files: [...checks.keys()], timeout: 20000, execArgv: [] })) {
    if (type === 'test:summary' && data.file === undefined) summary = data
    if (type !== 'test:pass' && type !== 'test:fail') continue
    const file = data.file
    if (observed.has(file) && !data.skip && !data.todo && data.name !== file) observed.set(file, observed.get(file) + 1)
    const status = data.skip ? 'SKIP' : data.todo ? 'TODO' : type === 'test:pass' ? 'PASS' : 'FAIL'
    console.log(`${status} ${data.name}`)
    if (type === 'test:fail') console.error(data.details.error?.cause ?? data.details.error)
  }
  assert(summary, 'no complete test summary')
  const { tests, passed, failed, skipped, todo, cancelled } = summary.counts
  console.log(`Strict silent-request results: ${passed} passed, ${failed} failed, ${skipped} skipped, ${todo} todo, ${cancelled} cancelled (${tests} tests)`)
  assert.deepEqual(observed, checks, 'required probe coverage was missing or incomplete')
  assert(tests === [...checks.values()].reduce((total, count) => total + count, 0) && skipped === 0 && todo === 0 && cancelled === 0, 'incomplete strict test run')
  if (!summary.success || failed !== 0 || passed !== tests) process.exitCode = 1
}

if (import.meta.main) {
  try {
    await verify()
  } catch (error) {
    console.error(`Strict silent-request gate blocked: ${error.message}`)
    process.exitCode = 1
  }
}
