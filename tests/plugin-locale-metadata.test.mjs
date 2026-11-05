import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { createRequire } from 'node:module'
import { join, dirname } from 'node:path'
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { fileURLToPath, pathToFileURL } from 'node:url'

// Accepted seam: actual pinned SDK readPluginMeta and PluginPackages metadata,
// not JavaScript provider imports or a test implementation of locale parsing.
const hostRoot = process.env.DSH_CONTROLS_HOST_ROOT
const options = { skip: !hostRoot && 'set DSH_CONTROLS_HOST_ROOT for actual SDK locale metadata' }
const repo = fileURLToPath(new URL('../', import.meta.url))
const pluginName = '@lmgatex/dsh-mattpocock-skills'
const parentURL = pathToFileURL(join(repo, 'package.json')).href
let app, ctx, load

before(async () => {
  if (!hostRoot) return
  const anchor = join(hostRoot, 'package.json')
  const sdkRequire = createRequire(anchor)
  load = name => import(pathToFileURL(sdkRequire.resolve(name)).href)
  app = await load('@deepseek-ai/dsh-app-boot')
  const { Context } = await load('@deepseek-ai/cordis')
  ctx = new Context()
  const resolution = await app.createRuntimeResolution({ installAnchor: anchor })
  new app.PluginPackages(ctx, { resolution })
})
after(async () => { await ctx?.fiber.dispose() })

test('actual SDK resolves package-root localized Skill and optional management metadata', options, () => {
  const meta = app.readPluginMeta(pluginName, parentURL)
  assert.equal(meta?.error, undefined)
  assert.equal(meta?.title?.en, 'Matt Pocock Skills and Optional Collaboration Controls')
  assert.equal(meta?.title?.zh, 'Matt Pocock 技能与可选协作管理')
  assert.match(meta?.description?.en ?? '', /immutable Matt Pocock Skills/)
  assert.match(meta?.description?.zh ?? '', /不可变.*技能/)
})

test('actual disabled Loader rows retain localized metadata without evaluating provider modules', options, async () => {
  const scratch = await mkdtemp(join(tmpdir(), 'dsh-locale-disabled-'))
  // External provider fixture, not SDK monkeypatching: executing the entry emits
  // an observable marker and throws. Metadata readers must never evaluate it.
  const markerKey = 'dsh-locale-disabled-provider-' + scratch
  globalThis[Symbol.for(markerKey)] = 0
  try {
    const manifest = JSON.parse(await readFile(join(repo, 'package.json'), 'utf8'))
    const fixtureName = '@fixtures/dsh-locale-metadata'
    await writeFile(join(scratch, 'package.json'), JSON.stringify({
      name: fixtureName, version: '1.0.0', type: 'module',
      exports: { ...manifest.exports, '.': './provider.mjs' },
    }), { flag: 'wx' })
    await writeFile(join(scratch, 'provider.mjs'),
      'globalThis[Symbol.for(' + JSON.stringify(markerKey) + ')]++; throw new Error("provider entry must not execute for metadata");\n', { flag: 'wx' })
    for (const relative of ['locale/en.json', 'locale/zh.json']) {
      const destination = join(scratch, relative)
      await mkdir(dirname(destination), { recursive: true })
      await writeFile(destination, await readFile(join(repo, relative)), { flag: 'wx' })
    }
    const Loader = (await load('@deepseek-ai/cordis-plugin-loader')).default
    const { readPluginInventory } = await load('@deepseek-ai/dsh-host-plugin-inventory')
    await ctx.plugin(Loader, { baseUrl: pathToFileURL(join(scratch, 'package.json')).href })
    await ctx.loader.create({ id: 'locale-root', name: fixtureName, disabled: true })
    await ctx.loader.await()
    const { entries: rows } = await readPluginInventory(ctx)
    const root = rows.find(row => row.moduleName === fixtureName)
    assert(root, 'actual disabled entries remain in the SDK inventory')
    assert.equal(root.enabled, false)
    assert.equal(root.fiberPhase, null)
    assert.equal(root.meta?.error, undefined)
    assert.equal(root.meta?.title?.zh, 'Matt Pocock 技能与可选协作管理')
    assert.match(root.meta?.description?.zh ?? '', /原生 activation seam/)
    assert.equal(globalThis[Symbol.for(markerKey)], 0, 'provider entry was not evaluated')
    assert.equal(ctx.get('subagents'), undefined)
    assert.equal(ctx.get('skills'), undefined)
  } finally {
    delete globalThis[Symbol.for(markerKey)]
    assert.equal(dirname(scratch), tmpdir())
    assert(scratch.startsWith(join(tmpdir(), 'dsh-locale-disabled-')))
    await rm(scratch, { recursive: true, force: true })
  }
})
