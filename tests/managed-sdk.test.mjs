import assert from 'node:assert/strict'
import { test as nodeTest } from 'node:test'
import { chmod, cp, lstat, mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises'
import { readFileSync, watch, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { spawn } from 'node:child_process'
import { pathToFileURL } from 'node:url'
import { dirname, join } from 'node:path'
import { inspectManagedSdk, prepareManagedSdk, restoreManagedSdk } from '../src/compatibility/managed-sdk.ts'

// Native SDK fixtures are opt-in: no developer home path or global installation guess.
// The bundled recipe patches exactly the released 0.2.1-alpha.1 host.
const sourceRoot = process.env.DSH_CONTROLS_COMPAT_HOST_ROOT
const test = (name, fn) => nodeTest(name, {
  skip: sourceRoot ? false : 'set DSH_CONTROLS_COMPAT_HOST_ROOT to run isolated 0.2.1-alpha.1 SDK deployment fixtures',
}, fn)
const recipe = JSON.parse(await readFile(new URL('../compatibility/initial-cwd.recipe.json', import.meta.url), 'utf8'))
async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'dsh-managed-sdk-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  await cp(join(sourceRoot, 'package.json'), join(root, 'package.json'))
  for (const file of recipe.files) {
    const path = join(root, file.path)
    await mkdir(dirname(path), { recursive: true })
    await cp(join(sourceRoot, file.path), path)
  }
  return root
}

async function managerVersion(t, version) {
  const distribution = await mkdtemp(join(tmpdir(), 'dsh-managed-owner-version-'))
  t.after(() => rm(distribution, { recursive: true, force: true }))
  await mkdir(join(distribution, 'src/compatibility'), { recursive: true })
  await mkdir(join(distribution, 'compatibility'))
  await cp(new URL('../src/compatibility/managed-sdk.ts', import.meta.url), join(distribution, 'src/compatibility/managed-sdk.ts'))
  await cp(new URL('../compatibility/initial-cwd.recipe.json', import.meta.url), join(distribution, 'compatibility/initial-cwd.recipe.json'))
  await writeFile(join(distribution, 'package.json'), JSON.stringify({ name: '@lmgatex/dsh-mattpocock-skills', version, type: 'module' }))
  return await import(pathToFileURL(join(distribution, 'src/compatibility/managed-sdk.ts')).href)
}

test('a plugin upgrade maintains the same recipe-owned preparation and creator provenance', async t => {
  const root = await fixture(t)
  const before = await Promise.all(recipe.files.map(file => readFile(join(root, file.path))))
  const previous = await managerVersion(t, '0.4.1')
  const upgraded = await managerVersion(t, '0.4.2')
  assert.equal((await previous.prepareManagedSdk(root)).status, 'ready')
  const receiptPath = join(root, '.dsh-mattpocock-initial-cwd/receipt.json')
  const creatorReceipt = await readFile(receiptPath, 'utf8')
  assert.equal(JSON.parse(creatorReceipt).ownerVersion, '0.4.1')
  assert.equal((await upgraded.inspectManagedSdk(root)).status, 'ready')
  assert.equal((await upgraded.prepareManagedSdk(root)).status, 'ready')
  assert.equal(await readFile(receiptPath, 'utf8'), creatorReceipt, 'inspection/idempotence must not rewrite creation evidence')
  assert.equal((await upgraded.restoreManagedSdk(root)).status, 'not-prepared')
  assert.equal(JSON.parse(await readFile(receiptPath, 'utf8')).ownerVersion, '0.4.1')
  assert.equal((await upgraded.inspectManagedSdk(root)).status, 'not-prepared')
  assert.equal((await upgraded.prepareManagedSdk(root)).status, 'ready')
  assert.equal(JSON.parse(await readFile(receiptPath, 'utf8')).ownerVersion, '0.4.2')
  assert.equal((await upgraded.restoreManagedSdk(root)).status, 'not-prepared')
  for (const [i, file] of recipe.files.entries()) assert.deepEqual(await readFile(join(root, file.path)), before[i])
})

test('cross-version maintenance never adopts foreign, corrupt or mismatched journal metadata', async t => {
  const previous = await managerVersion(t, '0.4.1')
  const upgraded = await managerVersion(t, '0.4.2')
  for (const [field, value] of [
    ['owner', '@foreign/sdk-patcher'], ['schemaVersion', 2],
    ['recipeId', 'different-recipe'], ['recipeSha256', '0'.repeat(64)],
    ['sdkVersion', '0.2.1-alpha.2'], ['targetRoot', '/wrong-sdk-root'],
    ['ownerVersion', null], ['ownerVersion', ''], ['ownerVersion', '0.4'],
    ['ownerVersion', '00.4.1'], ['ownerVersion', '0.4.1-01'],
    ['ownerVersion', '0.4.1+'], ['ownerVersion', '0.4.1\n'],
  ]) {
    const root = await fixture(t)
    assert.equal((await previous.prepareManagedSdk(root)).status, 'ready')
    const journal = join(root, '.dsh-mattpocock-initial-cwd/receipt.json')
    const record = JSON.parse(await readFile(journal, 'utf8'))
    record[field] = value
    const serialized = JSON.stringify(record)
    await writeFile(journal, serialized)
    const before = await Promise.all(recipe.files.map(file => readFile(join(root, file.path))))
    for (const operation of ['inspectManagedSdk', 'prepareManagedSdk', 'restoreManagedSdk']) {
      assert.equal((await upgraded[operation](root)).status, 'uncertain', field + ': ' + JSON.stringify(value))
      assert.equal(await readFile(journal, 'utf8'), serialized, 'failed ownership checks must preserve the journal')
    }
    for (const [i, file] of recipe.files.entries()) assert.deepEqual(await readFile(join(root, file.path)), before[i])
  }
})

test('valid prerelease and build creator versions retain recipe ownership across package upgrades', async t => {
  const root = await fixture(t)
  const previous = await managerVersion(t, '0.4.1-alpha.1+build.7')
  const upgraded = await managerVersion(t, '0.4.2')
  assert.equal((await previous.prepareManagedSdk(root)).status, 'ready')
  assert.equal((await upgraded.inspectManagedSdk(root)).status, 'ready')
  assert.equal((await upgraded.restoreManagedSdk(root)).status, 'not-prepared')
})

test('inspection identifies the pinned pristine SDK without changing it', async t => {
  const root = await fixture(t)
  const before = await readdir(root)
  const result = await inspectManagedSdk(root)
  assert.equal(result.status, 'not-prepared')
  assert.equal(result.sdkVersion, '0.2.1-alpha.1')
  assert.equal(result.managed, false)
  assert.equal(result.canonicalRoot, root)
  assert.deepEqual(await readdir(root), before)
})

test('offline preparation verifies all five postimages and owns an idempotent receipt', async t => {
  const root = await fixture(t)
  const prepared = await prepareManagedSdk(root)
  assert.equal(prepared.status, 'ready')
  assert.equal(prepared.managed, true)
  const receiptPath = join(root, '.dsh-mattpocock-initial-cwd', 'receipt.json')
  const receipt = await readFile(receiptPath, 'utf8')
  assert.equal((await inspectManagedSdk(root)).status, 'ready')
  assert.equal((await prepareManagedSdk(root)).status, 'ready')
  assert.equal(await readFile(receiptPath, 'utf8'), receipt)
  const text = await readFile(join(root, 'node_modules/@deepseek-ai/dsh-subagent/lib/index.js'), 'utf8')
  assert.match(text, /get initialCwdSupported\(\)/)
  assert.match(text, /const requestedCwd = spec.cwd/)
})

test('explicit restore returns original bytes, removes backups and retains terminal evidence for re-prepare', async t => {
  const root = await fixture(t)
  const originals = await Promise.all(recipe.files.map(file => readFile(join(root, file.path))))
  assert.equal((await prepareManagedSdk(root)).status, 'ready')
  const restored = await restoreManagedSdk(root)
  assert.equal(restored.status, 'not-prepared')
  assert.equal(restored.managed, false)
  for (const [i, file] of recipe.files.entries()) assert.deepEqual(await readFile(join(root, file.path)), originals[i])
  assert.deepEqual((await readdir(root)).sort(), ['.dsh-mattpocock-initial-cwd', 'node_modules', 'package.json'])
  const state = join(root, '.dsh-mattpocock-initial-cwd')
  assert.deepEqual(await readdir(state), ['receipt.json'])
  const terminal = await readFile(join(state, 'receipt.json'))
  assert.equal((await inspectManagedSdk(root)).status, 'not-prepared')
  assert.equal((await restoreManagedSdk(root)).status, 'not-prepared')
  assert.deepEqual(await readFile(join(state, 'receipt.json')), terminal)
  assert.equal((await prepareManagedSdk(root)).status, 'ready')
  assert.equal((await restoreManagedSdk(root)).status, 'not-prepared')
  assert.deepEqual(await readdir(state), ['receipt.json'])
  for (const [i, file] of recipe.files.entries()) assert.deepEqual(await readFile(join(root, file.path)), originals[i])
})

test('unknown drift prevents preparation writes and foreign post-prepare changes are never restored', async t => {
  const root = await fixture(t)
  const first = join(root, recipe.files[0].path)
  const last = join(root, recipe.files.at(-1).path)
  const original = await readFile(first)
  await writeFile(last, 'foreign baseline drift')
  assert.equal((await prepareManagedSdk(root)).status, 'incompatible')
  assert.deepEqual(await readFile(first), original)
  assert.deepEqual((await readdir(root)).sort(), ['node_modules', 'package.json'])

  const owned = await fixture(t)
  assert.equal((await prepareManagedSdk(owned)).status, 'ready')
  const changed = join(owned, recipe.files[0].path)
  await writeFile(changed, 'foreign update after preparation')
  assert.equal((await inspectManagedSdk(owned)).status, 'uncertain')
  assert.equal((await restoreManagedSdk(owned)).status, 'uncertain')
  assert.equal(await readFile(changed, 'utf8'), 'foreign update after preparation')
  assert(await readFile(join(owned, '.dsh-mattpocock-initial-cwd/receipt.json')))
})

function cli(args) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [new URL('../src/compatibility/cli.ts', import.meta.url).pathname, ...args], { stdio: ['ignore', 'pipe', 'pipe'] })
    let stdout = '', stderr = ''
    child.stdout.on('data', bytes => { stdout += bytes })
    child.stderr.on('data', bytes => { stderr += bytes })
    child.on('error', reject)
    child.on('close', (code, signal) => resolve({ code, signal, stdout, stderr }))
  })
}

test('offline CLI requires an explicit absolute target and stopped-DSH acknowledgement', async t => {
  const root = await fixture(t)
  const missingAck = await cli(['prepare', '--host-root', root])
  assert.equal(missingAck.code, 2)
  assert.match(missingAck.stderr, /--dsh-stopped/)
  assert.equal((await inspectManagedSdk(root)).status, 'not-prepared')
  const inspection = await cli(['inspect', '--host-root', root])
  assert.equal(inspection.code, 0)
  assert.equal(JSON.parse(inspection.stdout).status, 'not-prepared')
  const noRoot = await cli(['inspect'])
  assert.equal(noRoot.code, 2)
})

test('launcher validates the selected SDK bin before preparation and prepares before foreground launch', async t => {
  const root = await fixture(t)
  const absentBin = await cli(['start', '--host-root', root, '--dsh-stopped', '--', '--version'])
  assert.equal(absentBin.code, 1)
  assert.equal((await inspectManagedSdk(root)).status, 'not-prepared')
  assert.deepEqual((await readdir(root)).sort(), ['node_modules', 'package.json'])
  await mkdir(join(root, 'lib'))
  // Child-process transport probe, not a native continuation-manager replacement.
  await writeFile(join(root, 'lib/bin.js'),     "import { readFileSync } from 'node:fs'; const text = readFileSync(new URL('../node_modules/@deepseek-ai/dsh-subagent/lib/index.js', import.meta.url), 'utf8'); if (!text.includes('get initialCwdSupported()')) process.exit(99); console.log(JSON.stringify(process.argv.slice(2))); process.exit(7)")
  const launched = await cli(['start', '--host-root', root, '--dsh-stopped', '--', 'transport-only', '--profile', 'isolated'])
  assert.equal(launched.code, 7)
  assert.deepEqual(JSON.parse(launched.stdout), ['transport-only', '--profile', 'isolated'])
  assert.equal((await inspectManagedSdk(root)).status, 'ready')
})

test('cancelled preparation leaves no target effects and cancellation after first effect rolls back', async t => {
  const untouched = await fixture(t)
  const before = new AbortController()
  before.abort()
  assert.equal((await prepareManagedSdk(untouched, before.signal)).status, 'failed')
  assert.deepEqual((await readdir(untouched)).sort(), ['node_modules', 'package.json'])
  const root = await fixture(t)
  const originals = await Promise.all(recipe.files.map(file => readFile(join(root, file.path))))
  const controller = new AbortController()
  let observed = false
  const watcher = watch(dirname(join(root, recipe.files[0].path)), (event, name) => {
    if (event === 'rename' && name === 'index.js') { observed = true; controller.abort() }
  })
  t.after(() => watcher.close())
  const outcome = await prepareManagedSdk(root, controller.signal)
  watcher.close()
  assert(observed, 'abort occurred after a real compiled-file atomic replacement')
  assert.equal(outcome.status, 'failed')
  assert.equal((await inspectManagedSdk(root)).status, 'not-prepared')
  for (const [i, file] of recipe.files.entries()) assert.deepEqual(await readFile(join(root, file.path)), originals[i])
  assert.deepEqual((await readdir(root)).sort(), ['.dsh-mattpocock-initial-cwd', 'node_modules', 'package.json'])
  assert.deepEqual(await readdir(join(root, '.dsh-mattpocock-initial-cwd')), ['receipt.json'])
})

test('final and intermediate symlinks and root aliases never grant preparation or restore authority', async t => {
  const root = await fixture(t)
  const outside = await fixture(t)
  const victim = join(root, recipe.files[0].path)
  const foreign = join(outside, recipe.files[0].path)
  const original = await readFile(foreign)
  await rm(victim)
  await symlink(foreign, victim)
  assert.equal((await prepareManagedSdk(root)).status, 'incompatible')
  assert.deepEqual(await readFile(foreign), original)
  assert.deepEqual((await readdir(root)).sort(), ['node_modules', 'package.json'])
  const intermediate = await fixture(t)
  await rm(join(intermediate, 'node_modules'), { recursive: true })
  await symlink(join(outside, 'node_modules'), join(intermediate, 'node_modules'))
  assert.equal((await prepareManagedSdk(intermediate)).status, 'incompatible')
  const alias = join(intermediate, 'alias')
  await symlink(outside, alias)
  assert.equal((await inspectManagedSdk(alias)).status, 'incompatible')
  assert.equal((await restoreManagedSdk(alias)).status, 'incompatible')
})

test('a killed preparer retains its durable journal and SDK-wide lock without stale-PID guessing', async t => {
  const root = await fixture(t)
  const child = spawn(process.execPath, [new URL('../src/compatibility/cli.ts', import.meta.url).pathname, 'prepare', '--host-root', root, '--dsh-stopped'], { stdio: ['ignore', 'ignore', 'pipe'] })
  let stderr = ''
  child.stderr.on('data', bytes => { stderr += bytes })
  t.after(() => { if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL') })
  const watcher = watch(dirname(join(root, recipe.files[0].path)), (event, name) => {
    if (event === 'rename' && name === 'index.js') child.kill('SIGKILL')
  })
  t.after(() => watcher.close())
  const outcome = await new Promise((resolve, reject) => {
    child.once('error', reject)
    child.once('close', (code, signal) => resolve({ code, signal }))
  })
  watcher.close()
  assert.equal(outcome.signal, 'SIGKILL', stderr)
  const stateBefore = await readFile(join(root, '.dsh-mattpocock-initial-cwd/receipt.json'))
  assert.equal((await inspectManagedSdk(root)).status, 'uncertain')
  assert.equal((await prepareManagedSdk(root)).status, 'uncertain')
  assert.equal((await restoreManagedSdk(root)).status, 'uncertain')
  assert.deepEqual(await readFile(join(root, '.dsh-mattpocock-initial-cwd/receipt.json')), stateBefore)
  assert(await readFile(join(root, '.dsh-mattpocock-initial-cwd.lock')))
})

test('foreground launcher propagates a child termination signal rather than inventing success', async t => {
  const root = await fixture(t)
  await mkdir(join(root, 'lib'))
  await writeFile(join(root, 'lib/bin.js'), "process.kill(process.pid, 'SIGTERM')")
  const outcome = await cli(['start', '--host-root', root, '--dsh-stopped', '--', 'transport-only'])
  assert.equal(outcome.code, null)
  assert.equal(outcome.signal, 'SIGTERM')
  assert.equal((await inspectManagedSdk(root)).status, 'ready')
})

test('backup failure keeps an ownership journal and never overwrites a foreign backup', async t => {
  const root = await fixture(t)
  const original = await readFile(join(root, recipe.files[0].path))
  let injected = false
  const watcher = watch(root, (event, name) => {
    if (event === 'rename' && name === '.dsh-mattpocock-initial-cwd' && !injected) {
      injected = true
      writeFileSync(join(root, '.dsh-mattpocock-initial-cwd/0.original'), 'foreign backup collision')
    }
  })
  t.after(() => watcher.close())
  const outcome = await prepareManagedSdk(root)
  watcher.close()
  assert(injected)
  assert.equal(outcome.status, 'uncertain')
  assert.deepEqual(await readFile(join(root, recipe.files[0].path)), original)
  assert.equal(await readFile(join(root, '.dsh-mattpocock-initial-cwd/0.original'), 'utf8'), 'foreign backup collision')
  assert(await readFile(join(root, '.dsh-mattpocock-initial-cwd/receipt.json')))
  assert.equal((await restoreManagedSdk(root)).status, 'uncertain')
})

test('externally prepared bytes without an owned receipt never confer restore authority', async t => {
  const root = await fixture(t)
  assert.equal((await prepareManagedSdk(root)).status, 'ready')
  await rm(join(root, '.dsh-mattpocock-initial-cwd'), { recursive: true })
  const prepared = await readFile(join(root, recipe.files[0].path))
  const inspection = await inspectManagedSdk(root)
  assert.equal(inspection.status, 'incompatible')
  assert.equal(inspection.managed, false)
  assert.match(inspection.diagnostic, /no owned receipt/)
  assert.equal((await restoreManagedSdk(root)).status, 'incompatible')
  assert.deepEqual(await readFile(join(root, recipe.files[0].path)), prepared)
})

test('a tampered bundled recipe is rejected before even a target lock write', async t => {
  const sdk = await fixture(t)
  const distribution = await mkdtemp(join(tmpdir(), 'dsh-managed-distribution-'))
  t.after(() => rm(distribution, { recursive: true, force: true }))
  await mkdir(join(distribution, 'src/compatibility'), { recursive: true })
  await mkdir(join(distribution, 'compatibility'))
  await cp(new URL('../src/compatibility/managed-sdk.ts', import.meta.url), join(distribution, 'src/compatibility/managed-sdk.ts'))
  await cp(new URL('../package.json', import.meta.url), join(distribution, 'package.json'))
  const tampered = structuredClone(recipe)
  tampered.files[0].replacements[0].after += ' malicious drift'
  await writeFile(join(distribution, 'compatibility/initial-cwd.recipe.json'), JSON.stringify(tampered))
  const copiedManager = await import(pathToFileURL(join(distribution, 'src/compatibility/managed-sdk.ts')).href)
  const outcome = await copiedManager.prepareManagedSdk(sdk)
  assert.equal(outcome.status, 'incompatible')
  assert.match(outcome.diagnostic, /recipe integrity/)
  assert.deepEqual((await readdir(sdk)).sort(), ['node_modules', 'package.json'])
  assert.equal((await inspectManagedSdk(sdk)).status, 'not-prepared')
})

test('failure after the first effect retains foreign changes and the ownership journal instead of blind rollback', async t => {
  const root = await fixture(t)
  const last = join(root, recipe.files.at(-1).path)
  let injected = false
  const watcher = watch(dirname(join(root, recipe.files[0].path)), (event, name) => {
    if (event === 'rename' && name === 'index.js' && !injected) {
      injected = true
      writeFileSync(last, 'foreign concurrent SDK change')
    }
  })
  t.after(() => watcher.close())
  const outcome = await prepareManagedSdk(root)
  watcher.close()
  assert(injected)
  assert.equal(outcome.status, 'uncertain')
  assert.equal(await readFile(last, 'utf8'), 'foreign concurrent SDK change')
  assert(await readFile(join(root, '.dsh-mattpocock-initial-cwd/receipt.json')))
  assert.equal((await restoreManagedSdk(root)).status, 'uncertain')
  assert.equal(await readFile(last, 'utf8'), 'foreign concurrent SDK change')
})

test('SDK name and version must exactly match the pinned upstream identity', async t => {
  for (const change of [{ name: '@deepseek-ai/dsh-copy' }, { version: '0.2.1-alpha.2' }]) {
    const root = await fixture(t)
    const manifest = join(root, 'package.json')
    const pkg = JSON.parse(await readFile(manifest, 'utf8'))
    await writeFile(manifest, JSON.stringify({ ...pkg, ...change }))
    const outcome = await prepareManagedSdk(root)
    assert.equal(outcome.status, 'incompatible')
    assert.equal(outcome.sdkVersion, change.version ?? '0.2.1-alpha.1')
    assert.deepEqual((await readdir(root)).sort(), ['node_modules', 'package.json'])
  }
})

test('backup drift invalidates managed readiness and blocks restore before any compiled-file write', async t => {
  const root = await fixture(t)
  assert.equal((await prepareManagedSdk(root)).status, 'ready')
  const prepared = await Promise.all(recipe.files.map(file => readFile(join(root, file.path))))
  await writeFile(join(root, '.dsh-mattpocock-initial-cwd/0.original'), 'foreign backup update')
  const inspected = await inspectManagedSdk(root)
  assert.equal(inspected.status, 'uncertain')
  assert.equal(inspected.managed, false)
  assert.equal((await restoreManagedSdk(root)).status, 'uncertain')
  for (const [i, file] of recipe.files.entries()) assert.deepEqual(await readFile(join(root, file.path)), prepared[i])
  assert.equal(await readFile(join(root, '.dsh-mattpocock-initial-cwd/0.original'), 'utf8'), 'foreign backup update')
})

test('atomic preparation and restoration preserve compiled-file modes under a restrictive operator umask', async t => {
  const root = await fixture(t)
  const first = join(root, recipe.files[0].path)
  await chmod(first, 0o640)
  const priorUmask = process.umask(0o077)
  try {
    assert.equal((await prepareManagedSdk(root)).status, 'ready')
    assert.equal((await lstat(first)).mode & 0o777, 0o640)
    assert.equal((await restoreManagedSdk(root)).status, 'not-prepared')
    assert.equal((await lstat(first)).mode & 0o777, 0o640)
  } finally { process.umask(priorUmask) }
})

test('operator SIGINT is forwarded to the foreground child and preserved by the wrapper', async t => {
  const root = await fixture(t)
  await mkdir(join(root, 'lib'))
  await writeFile(join(root, 'lib/bin.js'), "console.log('transport-started'); setInterval(() => {}, 1000)")
  const child = spawn(process.execPath, [new URL('../src/compatibility/cli.ts', import.meta.url).pathname, 'start', '--host-root', root, '--dsh-stopped', '--', 'transport-only'], { stdio: ['ignore', 'pipe', 'pipe'] })
  t.after(() => { if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL') })
  let stdout = '', stderr = '', sent = false
  child.stdout.on('data', bytes => {
    stdout += bytes
    if (!sent && stdout.includes('transport-started')) { sent = true; child.kill('SIGINT') }
  })
  child.stderr.on('data', bytes => { stderr += bytes })
  const outcome = await new Promise((resolve, reject) => {
    child.once('error', reject)
    child.once('close', (code, signal) => resolve({ code, signal }))
  })
  assert(sent, stderr)
  assert.equal(outcome.code, null)
  assert.equal(outcome.signal, 'SIGINT')
})

test('special SDK permission bits are rejected before effects and owned permission drift never grants restore authority', async t => {
  for (const selected of [recipe.files[0], recipe.files.at(-1)]) {
    const root = await fixture(t)
    await chmod(join(root, selected.path), 0o4755)
    const originals = await Promise.all(recipe.files.map(async file => ({ bytes: await readFile(join(root, file.path)), mode: (await lstat(join(root, file.path))).mode & 0o7777 })))
    const outcome = await prepareManagedSdk(root)
    assert.equal(outcome.status, 'incompatible')
    assert.match(outcome.diagnostic, /special permission/i)
    assert.deepEqual((await readdir(root)).sort(), ['node_modules', 'package.json'])
    for (const [i, file] of recipe.files.entries()) {
      assert.deepEqual(await readFile(join(root, file.path)), originals[i].bytes)
      assert.equal((await lstat(join(root, file.path))).mode & 0o7777, originals[i].mode)
    }
  }
  const owned = await fixture(t)
  assert.equal((await prepareManagedSdk(owned)).status, 'ready')
  const changed = join(owned, recipe.files[0].path)
  const prepared = await readFile(changed)
  await chmod(changed, 0o4755)
  assert.equal((await inspectManagedSdk(owned)).status, 'uncertain')
  assert.equal((await restoreManagedSdk(owned)).status, 'uncertain')
  assert.equal((await lstat(changed)).mode & 0o7777, 0o4755)
  assert.deepEqual(await readFile(changed), prepared)
})

test('foreign staging-file changes are preserved with an uncertain journal, never blindly deleted', async t => {
  const root = await fixture(t)
  const directory = dirname(join(root, recipe.files[0].path))
  let stage = null
  const watcher = watch(directory, (event, name) => {
    if (event === 'change' && !stage && name?.startsWith('index.js.initial-cwd-') && name.endsWith('.tmp')) {
      stage = join(directory, name)
      writeFileSync(stage, 'foreign staging modification')
    }
  })
  t.after(() => watcher.close())
  const outcome = await prepareManagedSdk(root)
  watcher.close()
  assert(stage, 'foreign change was injected into a real stage')
  assert.equal(outcome.status, 'uncertain')
  assert.equal(await readFile(stage, 'utf8'), 'foreign staging modification')
  assert(await readFile(join(root, '.dsh-mattpocock-initial-cwd/receipt.json')))
})

test('foreign receipt drift during preparation and restoration is never overwritten or deleted', async t => {
  for (const operation of ['prepare', 'restore']) {
    const root = await fixture(t)
    if (operation === 'restore') assert.equal((await prepareManagedSdk(root)).status, 'ready')
    const receipt = join(root, '.dsh-mattpocock-initial-cwd/receipt.json')
    let injected = false
    const watcher = watch(dirname(join(root, recipe.files[0].path)), (event, name) => {
      if (event === 'rename' && name === 'index.js' && !injected) {
        injected = true
        writeFileSync(receipt, 'FOREIGN JOURNAL UPDATE')
      }
    })
    t.after(() => watcher.close())
    const outcome = await (operation === 'prepare' ? prepareManagedSdk(root) : restoreManagedSdk(root))
    watcher.close()
    assert(injected)
    assert.equal(outcome.status, 'uncertain', operation)
    assert.equal(outcome.managed, false)
    assert.equal(await readFile(receipt, 'utf8'), 'FOREIGN JOURNAL UPDATE')
    assert(await readFile(join(root, '.dsh-mattpocock-initial-cwd.lock')))
    assert.equal((await inspectManagedSdk(root)).status, 'uncertain')
    assert.equal((await restoreManagedSdk(root)).status, 'uncertain')
    assert.equal(await readFile(receipt, 'utf8'), 'FOREIGN JOURNAL UPDATE')
  }
})

test('unknown state-directory additions cannot grant readiness or make restore delete its journal', async t => {
  const root = await fixture(t)
  assert.equal((await prepareManagedSdk(root)).status, 'ready')
  const state = join(root, '.dsh-mattpocock-initial-cwd')
  let injected = false
  const watcher = watch(dirname(join(root, recipe.files[0].path)), (event, name) => {
    if (event === 'rename' && name === 'index.js' && !injected) {
      injected = true
      writeFileSync(join(state, 'foreign-note'), 'foreign state evidence')
    }
  })
  t.after(() => watcher.close())
  const outcome = await restoreManagedSdk(root)
  watcher.close()
  assert(injected)
  assert.equal(outcome.status, 'uncertain')
  assert.equal(await readFile(join(state, 'foreign-note'), 'utf8'), 'foreign state evidence')
  assert(await readFile(join(state, 'receipt.json')))
  assert(await readFile(join(root, '.dsh-mattpocock-initial-cwd.lock')))
})

test('late SIGINT after SDK commit does not claim successful start or launch a child', async t => {
  const root = await fixture(t)
  await mkdir(join(root, 'lib'))
  await writeFile(join(root, 'lib/bin.js'), "console.log('LAUNCHED')")
  const child = spawn(process.execPath, [new URL('../src/compatibility/cli.ts', import.meta.url).pathname, 'start', '--host-root', root, '--dsh-stopped', '--', 'transport-only'], { stdio: ['ignore', 'pipe', 'pipe'] })
  t.after(() => { if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL') })
  let stdout = '', stderr = '', sent = false, stateWatcher = null
  child.stdout.on('data', bytes => { stdout += bytes })
  child.stderr.on('data', bytes => { stderr += bytes })
  const watcher = watch(root, (event, name) => {
    if (event === 'rename' && name === '.dsh-mattpocock-initial-cwd' && !stateWatcher) {
      const state = join(root, '.dsh-mattpocock-initial-cwd')
      stateWatcher = watch(state, (stateEvent, stateName) => {
        if (stateEvent === 'rename' && stateName === 'receipt.json' && !sent) {
          try {
            if (JSON.parse(readFileSync(join(state, 'receipt.json'), 'utf8')).phase === 'prepared') { sent = true; child.kill('SIGINT') }
          } catch { /* Receipt visibility is individually atomic, not a cross-file barrier. */ }
        }
      })
    }
  })
  t.after(() => { watcher.close(); stateWatcher?.close() })
  const outcome = await new Promise((resolve, reject) => {
    child.once('error', reject)
    child.once('close', (code, signal) => resolve({ code, signal }))
  })
  watcher.close()
  stateWatcher?.close()
  assert(sent, stderr)
  assert(!stdout.includes('LAUNCHED'))
  assert(outcome.code !== 0 || outcome.signal === 'SIGINT', 'cancelled start must not report success')
  assert.equal((await inspectManagedSdk(root)).status, 'ready', 'committed preparation remains a separate truthful disk fact')
})

test('a backup recreated during cleanup remains foreign and cannot erase the sole recovery journal', async t => {
  const root = await fixture(t)
  assert.equal((await prepareManagedSdk(root)).status, 'ready')
  const state = join(root, '.dsh-mattpocock-initial-cwd')
  let injected = false
  const watcher = watch(state, (event, name) => {
    if (event === 'rename' && name === '0.original' && !injected) {
      injected = true
      writeFileSync(join(state, '0.original'), 'FOREIGN RECREATED BACKUP')
    }
  })
  t.after(() => watcher.close())
  const outcome = await restoreManagedSdk(root)
  watcher.close()
  assert(injected)
  assert.equal(outcome.status, 'uncertain')
  assert.equal(await readFile(join(state, '0.original'), 'utf8'), 'FOREIGN RECREATED BACKUP')
  assert(await readFile(join(state, 'receipt.json')))
  assert(await readFile(join(root, '.dsh-mattpocock-initial-cwd.lock')))
})

test('compiled-file drift during backup cleanup cannot be reported as a pristine successful restore', async t => {
  const root = await fixture(t)
  assert.equal((await prepareManagedSdk(root)).status, 'ready')
  const state = join(root, '.dsh-mattpocock-initial-cwd')
  const changed = join(root, recipe.files[0].path)
  let injected = false
  const watcher = watch(state, (event, name) => {
    if (event === 'rename' && name === '0.original' && !injected) {
      injected = true
      writeFileSync(changed, 'FOREIGN SDK DURING CLEANUP')
    }
  })
  t.after(() => watcher.close())
  const outcome = await restoreManagedSdk(root)
  watcher.close()
  assert(injected)
  assert.equal(outcome.status, 'uncertain')
  assert.equal(await readFile(changed, 'utf8'), 'FOREIGN SDK DURING CLEANUP')
  assert(await readFile(join(state, 'receipt.json')))
  assert(await readFile(join(root, '.dsh-mattpocock-initial-cwd.lock')))
})
