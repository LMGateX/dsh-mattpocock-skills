import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createRequire } from 'node:module'
import { readFile } from 'node:fs/promises'
import { join, isAbsolute } from 'node:path'
import { pathToFileURL } from 'node:url'

const hostRoot = process.env.DSH_CONTROLS_HOST_ROOT
const options = { skip: !hostRoot && 'set DSH_CONTROLS_HOST_ROOT for the actual DSH compatibility gate' }

test('0.19.0 engines gate rejects alpha.1 and admits the native alpha.2+ line', options, async () => {
  assert(isAbsolute(hostRoot))
  const require = createRequire(join(hostRoot, 'package.json'))
  const { evaluatePluginCompatibility } = await import(pathToFileURL(require.resolve('@deepseek-ai/dsh-app-boot')).href)
  const manifest = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))
  assert.equal(manifest.version, '0.19.0')
  assert.equal(manifest.engines.dsh, '~0.2.1-alpha.2')
  for (const version of ['0.2.1-alpha.1', '0.2.0-rc.2', '0.3.0-alpha.1']) {
    assert.notEqual(evaluatePluginCompatibility(manifest, {}, version), undefined, version + ' must be rejected')
  }
  for (const version of ['0.2.1-alpha.2', '0.2.1-alpha.3', '0.2.2-alpha.3', '0.2.2-rc.1']) {
    assert.equal(evaluatePluginCompatibility(manifest, {}, version), undefined, version + ' must be admitted')
  }
})
