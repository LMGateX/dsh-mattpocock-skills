import assert from 'node:assert/strict'
import { access, cp, mkdtemp, readFile, rm } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'

const requireHost = createRequire(process.env.DSH_CONTROLS_HOST_ROOT
  ? join(process.env.DSH_CONTROLS_HOST_ROOT, 'package.json') : import.meta.url)
const { Context } = await import(pathToFileURL(requireHost.resolve('@deepseek-ai/cordis')).href)
const { default: SkillRegistry } = await import(pathToFileURL(requireHost.resolve('@deepseek-ai/dsh-skill')).href)

import { CATALOG, PACKAGE_ROOT, createMattPocockSkillProvider } from '../lib/index.js'
import { apply as verifyRegistry } from './fixtures/phase4-registry-verifier.mjs'

// Agreed seam: real public Registry + provider, then the release headless verifier.
// This verifies report normalization, not a model run or current GUI activation.
async function mounted(packageRoot, channel, transform) {
  const ctx = new Context()
  const registry = ctx.plugin(SkillRegistry)
  await registry
  const provider = ctx.plugin({
    inject: ['skills'],
    apply(child) {
      child.skills.registerProvider(() => {
        const actual = createMattPocockSkillProvider(channel, { packageRoot })
        return transform ? transform(actual) : actual
      })
    },
  })
  await provider
  return { ctx, async close() { await provider.dispose(); await registry.dispose() } }
}

async function packages(run) {
  const directory = await mkdtemp(join(tmpdir(), 'dsh-headless-content-'))
  try {
    const roots = [join(directory, 'source \"quoted\"\n雪'), join(directory, 'archive\tinstalled')]
    for (const root of roots) await cp(join(PACKAGE_ROOT, 'vendor'), join(root, 'vendor'), { recursive: true })
    await run(roots, directory)
  } finally { await rm(directory, { recursive: true, force: true }) }
}

test('headless reports compare all 27 verified definitions across distinct installation paths', async () => {
  await packages(async (roots, directory) => {
    for (const channel of ['stable', 'beta']) {
      const reports = [], rawContents = []
      for (const [index, root] of roots.entries()) {
        const instance = await mounted(root, channel)
        try {
          const output = join(directory, channel + '-' + index + '.json')
          await verifyRegistry(instance.ctx, { channel, output })
          const bytes = await readFile(output)
          const report = JSON.parse(bytes)
          assert.equal(report.count, 27)
          assert.equal(report.modelVisible, 27)
          assert.deepEqual(report.sourceInvocationCounts, { modelInvocable: 11, userOnly: 16 })
          assert.equal(report.definitions.length, 27)
          assert.deepEqual(report.names, CATALOG.channels[channel])
          for (const definition of report.definitions) {
            const row = CATALOG.skills.find((entry) => entry.name === definition.name)
            const bytes = await readFile(join(root, 'vendor/mattpocock-skills', row.skillPath))
            assert.equal(definition.sourceBodySha256, createHash('sha256').update(bytes.subarray(row.bodyByteOffset)).digest('hex'))
            assert.match(definition.normalizedContentSha256, /^[0-9a-f]{64}$/)
            assert.equal(definition.resourceKind, 'directory')
          }
          reports.push(bytes)
          rawContents.push((await instance.ctx.skills.get('implement-spec')).content)
        } finally { await instance.close() }
      }
      assert.notEqual(rawContents[0], rawContents[1], 'the unnormalized content contains distinct verified absolute paths')
      assert(reports[0].equals(reports[1]), 'only verified prelude paths may vary by installation')
    }
  })
})

function alteredDefinition(target, alter) {
  return (provider) => ({
    ...provider,
    async get(candidate, lookup) {
      const definition = await provider.get(candidate, lookup)
      return definition?.name === target ? alter(definition) : definition
    },
  })
}

// Faults enter via the public provider contract and are then observed through
// the real Registry. No Registry internals or private presentation helpers are mocked.
test('headless verification refuses late-definition body and provenance faults before writing a report', async (t) => {
  await packages(async ([root], directory) => {
    const target = 'writing-for-agents' // last definition, not just the old implement-spec sample
    const cases = [
      ['changed body', (definition) => ({ ...definition, content: definition.content + 'changed' }), /exact unchanged suffix/],
      ['duplicate body', (definition) => {
        const marker = '[Original Skill body]\n'
        const body = definition.content.slice(definition.content.indexOf(marker) + marker.length)
        return { ...definition, content: definition.content + body }
      }, /exactly once/],
      ['wrong source JSON path', (definition) => ({ ...definition,
        content: definition.content.replace('sourceFile: ' + JSON.stringify(definition.path), 'sourceFile: ' + JSON.stringify('/wrong/SKILL.md')),
      }), /sourceFile must identify/],
      ['unsafe source JSON path', (definition) => ({ ...definition,
        content: definition.content.replace('sourceFile: ' + JSON.stringify(definition.path), 'sourceFile: ' + definition.path),
      }), /JSON|Unexpected token/],
      ['wrong source line', (definition) => ({ ...definition,
        content: definition.content.replace(/sourceBodyStartLine: [0-9]+/, 'sourceBodyStartLine: 9999'),
      }), /source body line/],
      ['wrong resource JSON path', (definition) => ({ ...definition,
        content: definition.content.replace('resourceBase: ' + JSON.stringify(definition.resourceBase.path), 'resourceBase: ' + JSON.stringify('/wrong/resources')),
      }), /resourceBase must identify/],
      ['wrong definition location', (definition) => ({ ...definition, path: '/wrong/SKILL.md' }), /definition source location/],
      ['wrong definition resource root', (definition) => ({ ...definition, resourceBase: { kind: 'directory', path: '/wrong/resources' } }), /definition resource base/],
      ['source metadata changed', (definition) => ({ ...definition, metadata: { injected: true } }), /source metadata/],
      ['source invocation changed', (definition) => ({ ...definition,
        content: definition.content.replace('Source invocation: model-invocable', 'Source invocation: disabled'),
      }), /source invocation prelude/],
      ['resource hint missing', (definition) => ({ ...definition,
        content: definition.content.replace('Resolve relative resources', 'Resolve something else'),
      }), /resource resolution guidance/],
    ]
    for (const [label, alter, expected] of cases) {
      await t.test(label, async () => {
        const instance = await mounted(root, 'stable', alteredDefinition(target, alter))
        const output = join(directory, label + '.json')
        try {
          await assert.rejects(verifyRegistry(instance.ctx, { channel: 'stable', output }), expected)
          await assert.rejects(access(output), { code: 'ENOENT' }, 'a failed validation must not publish a partial report')
        } finally { await instance.close() }
      })
    }
  })
})


test('headless verification preserves the user-only advisory and no-execution boundary', async (t) => {
  await packages(async ([root], directory) => {
    const cases = [
      ['user-only positioning', 'Upstream positions this as a user-led workflow', 'Ordinary workflow', /upstream user-only guidance/],
      ['advisory choice', 'Decide how to use it according to the task and context', 'Execute immediately', /advisory use guidance/],
      ['no workflow obligation', 'does not require starting or completing the workflow', 'requires completing the workflow', /loading is not execution/],
      ['no permission expansion', 'does not expand any operation permissions', 'expands operation permissions', /permission boundary guidance/],
      ['main body already available', 'main body is already returned', 'main body is unavailable', /main body availability guidance/],
    ]
    for (const [label, from, to, expected] of cases) {
      await t.test(label, async () => {
        const instance = await mounted(root, 'beta', alteredDefinition('wayfinder', (definition) => ({
          ...definition, content: definition.content.replace(from, to),
        })))
        try {
          await assert.rejects(verifyRegistry(instance.ctx, { channel: 'beta', output: join(directory, label + '.json') }), expected)
        } finally { await instance.close() }
      })
    }
  })
})

