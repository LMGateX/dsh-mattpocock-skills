import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'
import { Context } from '@deepseek-ai/cordis'
import SkillRegistry, { isModelInvocable, renderSkillContent } from '@deepseek-ai/dsh-skill'
import * as plugin from '../lib/index.js'

// Agreed seams: public provider -> real Registry; native loader execution is
// added through an explicit isolated host below, never a mocked invocation gate.
async function mount(channel) {
  const ctx = new Context()
  const registry = ctx.plugin(SkillRegistry)
  await registry
  const delivery = ctx.plugin(plugin, { channel })
  await delivery
  return { ctx, async dispose() { await delivery.dispose(); await registry.dispose() } }
}

for (const channel of ['stable', 'beta']) {
  test(channel + ': real Registry makes all 27 source Skills model-readable, preserving 11/16 source policy', async () => {
    const sourceRows = plugin.CATALOG.skills.filter(row => row.channels.includes(channel))
    assert.equal(sourceRows.length, 27)
    assert.equal(sourceRows.filter(row => row.invocation.modelInvocable).length, 11)
    assert.equal(sourceRows.filter(row => !row.invocation.modelInvocable && row.invocation.userInvocable).length, 16)
    const mounted = await mount(channel)
    try {
      const summaries = await mounted.ctx.skills.list()
      assert.deepEqual(summaries.filter(isModelInvocable).map(row => row.name), plugin.CATALOG.channels[channel])
      for (const row of sourceRows) {
        const summary = summaries.find(value => value.name === row.name)
        const definition = await mounted.ctx.skills.get(row.name)
        assert(definition, row.name)
        assert.deepEqual(definition.invocation, summary.invocation)
        assert.equal(definition.description, summary.description)
        const bytes = await readFile(definition.path)
        const body = bytes.subarray(row.bodyByteOffset).toString('utf8')
        assert(definition.content.endsWith(body), row.name + ': exact contiguous source suffix')
        assert.equal(definition.content.split(body).length - 1, 1, row.name + ': source appears once')
        const preface = definition.content.slice(0, -body.length)
        assert(preface.length > 0, row.name + ': typed content carries adapter preface')
        assert(preface.includes(JSON.stringify(definition.path)), row.name + ': safely encoded source file')
        const line = bytes.subarray(0, row.bodyByteOffset).toString('utf8').split('\n').length
        assert.match(preface, new RegExp('sourceBodyStartLine[^0-9]*' + line + '(?![0-9])'))
        assert.match(preface, /resourceBase/)
        if (!row.invocation.modelInvocable) {
          assert.match(summary.description, /user-only/i)
          assert(summary.description.endsWith(row.description))
          assert.match(preface, /user-only/i)
        }
        const rendered = renderSkillContent(definition)
        assert(rendered.includes(definition.content))
        assert(rendered.includes(definition.resourceBase.path))
      }
      assert.equal(summaries.filter(row => /user-only/i.test(row.description)).length, 16)
    } finally { await mounted.dispose() }
  })
}
