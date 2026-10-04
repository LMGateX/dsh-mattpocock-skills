import assert from 'node:assert/strict'
import { access, readFile } from 'node:fs/promises'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { dirname, join, resolve } from 'node:path'
import { parse } from 'yaml'

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
  assert.equal(packageJson.private, true)
  assert.equal(packageJson.dsh?.bundle?.patch, './cordis.patch.yml')
  assert.equal(packageJson.dsh?.client, undefined)
  assert.equal(packageJson.dependencies, undefined)
  assert.equal(packageJson.scripts, undefined)
  assert.deepEqual(packageJson.peerDependencies, {
    '@deepseek-ai/cordis': '^4.0.2',
    '@deepseek-ai/dsh-skill': '^0.1.2-rc.1 || ^0.1.5-rc.2 || ^0.1.7-alpha.2 || ^0.2.0-rc.1',
    '@deepseek-ai/schemastery': '^3.18.2',
  })
  assert.deepEqual(packageJson.files, [
    'lib/index.js',
    'lib/catalog.js',
    'lib/provider.js',
    'lib/types/index.d.ts',
    'lib/types/catalog.d.ts',
    'lib/types/provider.d.ts',
    'cordis.patch.yml',
    'generated/catalog.json',
    'vendor/mattpocock-skills/',
    'PROVENANCE.json',
    'vendor-files.json',
    'source-lock.json',
    'README.md',
    'README.zh-CN.md',
    'MIGRATION.md',
    'LICENSE',
    'THIRD_PARTY_NOTICES.md',
  ])
  assert.equal(await pathExists(join(root, 'dsh.plugin.json')), false)

  const patch = parse(await readFile(join(root, 'cordis.patch.yml'), 'utf8'))
  assert.deepEqual(patch, [
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
  assert.deepEqual(plugin.CHANNELS, Object.keys(plugin.CATALOG.channels).sort())
  assert.equal(plugin.DEFAULT_CHANNEL, 'stable')
  assert.deepEqual(plugin.Config({}), { channel: 'stable' })
  assert.deepEqual(plugin.Config({ channel: 'stable' }), { channel: 'stable' })
  assert.throws(() => plugin.Config({ channel: 'nightly' }))
})
