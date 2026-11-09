import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createRequire } from 'node:module'
import { readFile } from 'node:fs/promises'
import { join, isAbsolute } from 'node:path'
import { pathToFileURL } from 'node:url'

const hostRoot = process.env.DSH_CONTROLS_HOST_ROOT
const options = { skip: !hostRoot && 'set DSH_CONTROLS_HOST_ROOT for the actual DSH compatibility gate' }

test('0.21.0 engines gate has an RC1 floor evaluated only by the actual RC1 host', options, async () => {
  assert(isAbsolute(hostRoot))
  const host = JSON.parse(await readFile(join(hostRoot, 'package.json'), 'utf8'))
  assert.equal(host.version, '0.2.2-rc.1', 'run the compatibility gate only on the accepted RC1 host')
  assert.equal(host.engines.node, '>=24.9.0')
  const require = createRequire(join(hostRoot, 'package.json'))
  const { evaluatePluginCompatibility } = await import(pathToFileURL(require.resolve('@deepseek-ai/dsh-app-boot')).href)
  const manifest = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))
  assert.equal(manifest.version, '0.21.0')
  // These are inputs to RC1's range evaluator, not older SDKs being started.
  for (const version of ['0.2.1-alpha.4', '0.2.2-alpha.4', '0.2.2-rc.0', '0.2.0-rc.2', '0.2.1-alpha.1', '0.2.1', '0.2.2-alpha.1']) {
    const issue = evaluatePluginCompatibility(manifest, {}, version)
    assert.notEqual(issue, undefined, version + ' must be rejected')
    assert.equal(issue.exempted, false)
    assert.deepEqual(issue.requirements, { 'engines.dsh': '>=0.2.2-rc.1' })
  }
  // Acceptance of higher version strings proves the metadata range only,
  // not measured runtime compatibility with those future hosts.
  for (const version of ['0.2.2-rc.1', '0.2.2-rc.2', '0.2.2', '0.2.3', '0.3.0-alpha.1', '0.3.0', '1.0.0']) {
    assert.equal(evaluatePluginCompatibility(manifest, {}, version), undefined, version + ' must satisfy the declared floor')
  }
  assert.equal(manifest.engines.dsh, '>=0.2.2-rc.1')
  assert.equal(manifest.engines.node, '>=24.9.0')
})
