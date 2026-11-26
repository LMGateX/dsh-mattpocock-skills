import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createRequire } from 'node:module'
import { readFile } from 'node:fs/promises'
import { join, isAbsolute } from 'node:path'
import { pathToFileURL } from 'node:url'

const hostRoot = process.env.DSH_CONTROLS_HOST_ROOT
const options = { skip: !hostRoot && 'set DSH_CONTROLS_HOST_ROOT for the actual DSH compatibility gate' }

test('0.24.0-alpha.1 is accepted only by the exact alpha.2 DSH engine gate', options, async () => {
  assert(isAbsolute(hostRoot))
  const host = JSON.parse(await readFile(join(hostRoot, 'package.json'), 'utf8'))
  assert.equal(host.version, '0.2.3-alpha.2', 'run the gate on the exact published alpha.2 host')
  assert.equal(host.engines.node, '^24.22.3 || >=26.13.1')
  const require = createRequire(join(hostRoot, 'package.json'))
  const { evaluatePluginCompatibility } = await import(pathToFileURL(require.resolve('@deepseek-ai/dsh-app-boot')).href)
  const manifest = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))
  assert.equal(manifest.version, '0.24.0-alpha.1')
  assert.equal(manifest.engines.dsh, host.version)
  assert.equal(evaluatePluginCompatibility(manifest, {}, host.version), undefined)
  // Only the version strings are evaluated; these other hosts are not started.
  for (const version of ['0.2.2-rc.3', '0.2.2-rc.4', '0.2.2', '0.2.3-alpha.1', '0.2.3-alpha.3', '0.2.3', '0.3.0']) {
    const issue = evaluatePluginCompatibility(manifest, {}, version)
    assert.notEqual(issue, undefined, version + ' must be rejected')
    assert.equal(issue.exempted, false)
    assert.deepEqual(issue.requirements, { 'engines.dsh': host.version })
  }
})
