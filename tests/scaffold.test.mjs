import assert from 'node:assert/strict'
import { access, readFile, readdir } from 'node:fs/promises'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { dirname, join, resolve } from 'node:path'
import { parse } from 'yaml'
import { createCompatibilityCompositionPatches } from '../lib/compatibility/composition.js'
import { PACKAGE_FILES_ALLOWLIST, FIXED_PACKED_FILES, EXPECTED_PACKED_FILES, EXPECTED_PEERS, EXPECTED_PEER_META, EXPECTED_CLIENT, validatePackagePolicy } from '../scripts/verify-package.mjs'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const packageJson = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'))

async function pathExists(path) {
  try {
    await access(path)
    return true
  } catch (error) {
    if (error?.code === 'ENOENT') return false
    throw error
  }
}

test('declares one private installable DSH bundle', async () => {
  assert.equal(packageJson.name, '@lmgatex/dsh-mattpocock-skills')
  assert.equal(packageJson.version, '0.4.25')
  assert.equal(packageJson.private, true)
  assert.equal(packageJson.dsh?.bundle?.patch, './cordis.patch.yml')
  assert.deepEqual(packageJson.dsh?.client, EXPECTED_CLIENT)
  assert.equal(packageJson.dependencies, undefined)
  assert.equal(packageJson.scripts, undefined)
  assert.deepEqual(packageJson.peerDependencies, EXPECTED_PEERS)
  assert.deepEqual(packageJson.peerDependenciesMeta, EXPECTED_PEER_META)
  assert.deepEqual(packageJson.files, PACKAGE_FILES_ALLOWLIST)
  validatePackagePolicy(packageJson)
  assert.equal(await pathExists(join(root, 'dsh.plugin.json')), false)

  const patch = parse(await readFile(join(root, 'cordis.patch.yml'), 'utf8'), { customTags: [{ tag: 'tag:yaml.org,2002:js', resolve: value => ({ __jsExpr: value }) }] })
  assert.equal(patch.length, 3)
  assert.deepEqual(patch.slice(0, 2), createCompatibilityCompositionPatches())
  assert.deepEqual(patch.slice(2), [
    {
      insert: [
        {
          id: 'dsh-mattpocock-skills',
          name: '@lmgatex/dsh-mattpocock-skills',
          config: { channel: 'stable' },
        },
      ],
    },
  ])
})

test('exports the closed channel set declared by the vendored distribution', async () => {
  const plugin = await import('../lib/index.js')
  assert.equal(plugin.name, 'dsh-mattpocock-skills')
  assert.deepEqual(plugin.inject, ['skills'])
  // The channel set is a public interface: it only ever grows, and `stable` stays the default.
  assert.deepEqual(plugin.CHANNELS, ['beta', 'stable'])
  assert.deepEqual(plugin.CHANNELS, Object.keys(plugin.CATALOG.channels).sort())
  assert.equal(plugin.DEFAULT_CHANNEL, 'stable')
  assert.deepEqual(plugin.Config({}), { channel: 'stable' })
  assert.deepEqual(plugin.Config({ channel: 'stable' }), { channel: 'stable' })
  assert.deepEqual(plugin.Config({ channel: 'beta' }), { channel: 'beta' })
  assert.throws(() => plugin.Config({ channel: 'nightly' }))
})

test('Skills-only context mounts exactly one provider without eager optional Host dependencies', async () => {
  const plugin = await import('../lib/index.js')
  const factories = []
  const context = { logger() { return { warn() {} } }, skills: { registerProvider(factory) { factories.push(factory) } } }
  assert.equal(Object.hasOwn(context, 'inject'), false)
  assert.equal(plugin.apply(context, { channel: 'stable' }), undefined)
  assert.equal(factories.length, 1)
  assert.equal(typeof factories[0], 'function')
})

test('prebuilt allowlist covers actual root and controls TypeScript modules exactly', async () => {
  const entries = await readdir(join(root, 'src'), { recursive: true, withFileTypes: true })
  const sources = entries.filter(entry => entry.isFile() && entry.name.endsWith('.ts'))
    .map(entry => join(entry.parentPath, entry.name).slice(join(root, 'src').length + 1).split('\\').join('/')).sort()
  assert.equal(sources.filter(path => !path.includes('/')).length, 6)
  assert.equal(sources.filter(path => path.startsWith('controls/')).length, 20)
  const expected = sources.flatMap(path => [
    'lib/' + path.replace(/\.ts$/, '.js'),
    'lib/types/' + path.replace(/\.ts$/, '.d.ts'),
  ]).sort()
  const actual = PACKAGE_FILES_ALLOWLIST.filter(path => path.startsWith('lib/')).sort()
  assert.equal(actual.length, 66)
  assert.deepEqual(actual, expected)
  assert.deepEqual(FIXED_PACKED_FILES.filter(path => path.startsWith('lib/')).sort(), expected)
  const inventory = JSON.parse(await readFile(join(root, 'vendor-files.json'), 'utf8'))
  assert.deepEqual(FIXED_PACKED_FILES.filter(path => path.startsWith('locale/')).sort(), [
    'locale/en.json', 'locale/worktree-bridge/en.json', 'locale/worktree-bridge/zh.json', 'locale/zh.json',
  ])
  assert.equal(FIXED_PACKED_FILES.length, 85)
  assert.equal(inventory.entries.length, 85)
  assert.equal(EXPECTED_PACKED_FILES, FIXED_PACKED_FILES.length + inventory.entries.length)
  assert.equal(EXPECTED_PACKED_FILES, 170)
})
