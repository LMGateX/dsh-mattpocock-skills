import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'
import { createRequire, registerHooks } from 'node:module'
import { isAbsolute, join } from 'node:path'
import { pathToFileURL } from 'node:url'

// Default suite uses the locked real Registry. Set the same explicit host-root
// seam as host.test.mjs to run the native loader suite. No skip is counted as a
// native-loader result; the release command must set REQUIRED=1 as well.
const hostRoot = process.env.DSH_CONTROLS_HOST_ROOT
if (process.env.DSH_SKILL_LOADER_REQUIRED === '1') assert(hostRoot, 'native loader requires DSH_CONTROLS_HOST_ROOT')
const localRequire = createRequire(import.meta.url)
const hostRequire = hostRoot ? createRequire(pathToFileURL(join(hostRoot, 'package.json'))) : localRequire
if (hostRoot) {
  assert(isAbsolute(hostRoot))
  const treeURL = new URL('../', import.meta.url).href
  registerHooks({ resolve(specifier, context, next) {
    if (context.parentURL?.startsWith(treeURL) && specifier.startsWith('@deepseek-ai/')) {
      return { url: pathToFileURL(hostRequire.resolve(specifier)).href, shortCircuit: true }
    }
    return next(specifier, context)
  } })
}
const load = name => import(pathToFileURL(hostRequire.resolve(name)).href)
const { Context } = await load('@deepseek-ai/cordis')
const { default: SkillRegistry, isModelInvocable, renderSkillContent } = await load('@deepseek-ai/dsh-skill')
const plugin = await import('../lib/index.js')

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


// These tests are mechanical public-interface coverage, not live child/model
// behavior. Only the working-directory boundary is a side-effect-free fixture;
// SkillRegistry, scoped layers, tool definition, invocation checks and render
// are the actual installed host implementations.
if (hostRoot) {
  const toolsModule = await load('@deepseek-ai/dsh-tools')
  const ToolsService = toolsModule.ToolsService ?? toolsModule.default
  const { default: SystemPrompt } = await load('@deepseek-ai/dsh-system-prompt')
  const nativeSkill = await load('@deepseek-ai/dsh-tool-skill')
  const { createScope } = await load('@deepseek-ai/dsh-scope')

  async function nativeMount(channel, providerOptions) {
    const ctx = new Context()
    const fibers = []
    for (const service of [SystemPrompt, ToolsService, SkillRegistry]) {
      const fiber = ctx.plugin(service)
      await fiber
      fibers.push(fiber)
    }
    const parent = { id: 'content-parent', cwd: '/synthetic/parent' }
    const child = { id: 'content-child', cwd: '/synthetic/child' }
    const stranger = { id: 'unrelated', cwd: '/synthetic/unrelated' }
    const ownerScope = createScope(ctx, parent)
    const childScope = createScope(ctx, child, { parent })
    const unrelatedScope = createScope(ctx, stranger)
    let deliveryControl
    const delivery = ownerScope.ctx.plugin({ name: 'content-test-delivery', inject: ['skills'], apply(scope) {
      scope.skills.registerProvider(control => {
        deliveryControl = control
        return plugin.createMattPocockSkillProvider(channel, { ...providerOptions, lifecycleSignal: control.signal })
      })
    } })
    await delivery
    fibers.push(delivery)
    // No agents service/AgentLoop/model or real file operations are mounted.
    ctx.provide('workingDirectory', { async ensure(agent, signal) { signal?.throwIfAborted(); return agent.cwd } })
    const loader = ctx.plugin({ name: 'content-native-loader', inject: ['tools', 'skills', 'workingDirectory'], apply: nativeSkill.apply })
    await loader
    fibers.push(loader)
    return { ctx, parent, child, stranger, ownerScope, childScope, unrelatedScope, invalidate: () => deliveryControl.invalidate(),
      async dispose() {
        for (const fiber of fibers.reverse()) await fiber.dispose()
        await unrelatedScope.dispose(); await childScope.dispose(); await ownerScope.dispose()
      },
    }
  }

  for (const channel of ['stable', 'beta']) {
    test(channel + ': native skill.execute returns printable complete typed content and rendered resources in parent/child-like scope', async () => {
      const f = await nativeMount(channel)
      try {
        const scopeFailures = []
        for (const agent of [f.parent, f.child]) {
          const tool = f.ctx.tools.get('skill', agent)
          assert(tool && tool.output.schema && tool.output.render)
          const summaries = await f.ctx.skills.list({ scope: agent, cwd: agent.cwd })
          assert.equal(summaries.length, 27)
          // allSettled ensures every one of 27 actually executes even on RED.
          const results = await Promise.allSettled(summaries.map(async summary => {
            const args = { name: summary.name }
            const value = await tool.execute(args, { agent, signal: new AbortController().signal })
            const definition = await f.ctx.skills.get(summary.name, { scope: agent, cwd: agent.cwd })
            assert.deepEqual(Object.keys(value).sort(), ['content', 'name', 'provider', 'resourceBase'])
            const printed = JSON.stringify(value) // full PTC-style printing, no preview/truncation
            const recovered = JSON.parse(printed)
            assert.equal(recovered.content, definition.content)
            assert.deepEqual(recovered.resourceBase, definition.resourceBase)
            assert.match(recovered.content, /sourceFile:/)
            assert.match(recovered.content, /sourceBodyStartLine:/)
            assert.match(recovered.content, /resourceBase:/)
            const row = plugin.CATALOG.skills.find(row => row.name === summary.name)
            const bytes = await readFile(definition.path)
            const body = bytes.subarray(row.bodyByteOffset).toString('utf8')
            assert(recovered.content.endsWith(body))
            assert.equal(recovered.content.split(body).length - 1, 1)
            if (!row.invocation.modelInvocable) assert.match(recovered.content, /user-only/i)
            const rendered = await tool.output.render(args, value)
            const text = rendered.filter(block => block.type === 'text').map(block => block.text).join('\n')
            assert(text.includes(recovered.content))
            assert(text.includes(value.resourceBase.path))
            return value.name
          }))
          results.forEach((result, index) => {
            if (result.status === 'rejected') scopeFailures.push(agent.id + '/' + summaries[index].name + ': ' + result.reason.message.split('\n')[0])
          })
        }
        assert.deepEqual(await f.ctx.skills.list({ scope: f.stranger }), [])
        const tool = f.ctx.tools.get('skill', f.stranger)
        await assert.rejects(tool.execute({ name: 'ask-matt' }, { agent: f.stranger }), /unknown|available/)
        assert.deepEqual(scopeFailures, [])
      } finally { await f.dispose() }
    })
  }


  test('native loader retains false/false source disablement without falling back to bundled policy', async () => {
    const input = structuredClone(plugin.CATALOG)
    input.skills.find(row => row.name === 'ask-matt').invocation = { modelInvocable: false, userInvocable: false }
    const catalog = plugin.parseCatalog(JSON.stringify(input))
    const f = await nativeMount('stable', { catalog })
    try {
      for (const agent of [f.parent, f.child]) {
        const summary = (await f.ctx.skills.list({ scope: agent })).find(row => row.name === 'ask-matt')
        assert.deepEqual(summary.invocation, { modelInvocable: false, userInvocable: false })
        const tool = f.ctx.tools.get('skill', agent)
        await assert.rejects(tool.execute({ name: 'ask-matt' }, { agent }), /not available for model invocation/)
      }
    } finally { await f.dispose() }
  })

  test('native loader observes delivery closure and re-opening in both inherited scopes', async () => {
    let enabled = true
    const f = await nativeMount('stable', { workspaceAllowed: async () => enabled })
    try {
      for (const agent of [f.parent, f.child]) {
        const tool = f.ctx.tools.get('skill', agent)
        assert.equal((await tool.execute({ name: 'tdd' }, { agent })).name, 'tdd')
      }
      enabled = false
      f.invalidate()
      for (const agent of [f.parent, f.child]) {
        assert.deepEqual(await f.ctx.skills.list({ scope: agent }), [])
        const tool = f.ctx.tools.get('skill', agent)
        await assert.rejects(tool.execute({ name: 'tdd' }, { agent }), /unknown|available/)
      }
      enabled = true
      f.invalidate()
      for (const agent of [f.parent, f.child]) {
        const tool = f.ctx.tools.get('skill', agent)
        assert.equal((await tool.execute({ name: 'tdd' }, { agent })).name, 'tdd')
      }
    } finally { await f.dispose() }
  })

  test('native loader respects same-name provider precedence, child shadow and actual tool restriction', async () => {
    const f = await nativeMount('stable')
    const additions = []
    function override(context, providerName, content, modelInvocable) {
      const candidate = Object.freeze({ name: 'ask-matt', description: 'Synthetic override',
        source: 'project-dsh', provider: providerName, rank: 100, locator: providerName,
        invocation: Object.freeze({ modelInvocable, userInvocable: true }) })
      const fiber = context.plugin({ name: providerName, inject: ['skills'], apply(scope) {
        scope.skills.registerProvider(() => ({ name: providerName, list: async () => [candidate],
          get: async selected => selected === candidate ? { ...candidate, content } : undefined }))
      } })
      additions.push(fiber)
      return fiber
    }
    try {
      await override(f.ownerScope.ctx, 'content-project-override', 'Parent project body only.', true)
      for (const agent of [f.parent, f.child]) {
        const tool = f.ctx.tools.get('skill', agent)
        const value = await tool.execute({ name: 'ask-matt' }, { agent })
        assert.equal(value.content, 'Parent project body only.')
        assert.equal(value.provider, 'content-project-override')
      }
      await override(f.childScope.ctx, 'content-child-override', 'Child-only body.', false)
      const childTool = f.ctx.tools.get('skill', f.child)
      await assert.rejects(childTool.execute({ name: 'ask-matt' }, { agent: f.child }), /not available for model invocation/)
      assert.equal((await f.ctx.tools.get('skill', f.parent).execute({ name: 'ask-matt' }, { agent: f.parent })).content, 'Parent project body only.')
      const mask = f.childScope.ctx.plugin({ name: 'content-child-tool-mask', inject: ['tools'], apply(scope) {
        scope.tools.restrict({ deny: ['skill'] })
      } })
      await mask
      additions.push(mask)
      assert.equal(f.ctx.tools.get('skill', f.child), undefined)
      assert(f.ctx.tools.get('skill', f.parent))
      assert(f.ctx.tools.get('skill', f.stranger))
      if (typeof f.ctx.tools.executable === 'function') assert.equal(f.ctx.tools.executable('skill', f.child), undefined)
    } finally {
      for (const fiber of additions.reverse()) await fiber.dispose()
      await f.dispose()
    }
  })

}
