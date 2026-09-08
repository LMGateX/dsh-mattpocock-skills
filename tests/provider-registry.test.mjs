import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { test } from 'node:test'

import { Context } from '@deepseek-ai/cordis'
import SkillRegistry, { BUNDLED_SKILL_RANK, isModelInvocable, isUserInvocable, renderSkillContent } from '@deepseek-ai/dsh-skill'

import * as plugin from '../lib/index.js'

const MODEL_SKILLS = [
  'code-review',
  'codebase-design',
  'diagnosing-bugs',
  'domain-modeling',
  'grilling',
  'prototype',
  'research',
  'resolving-merge-conflicts',
  'tdd',
  'wizard',
  'writing-for-agents',
]

async function mount(channel) {
  const ctx = new Context()
  const registryFiber = ctx.plugin(SkillRegistry)
  await registryFiber
  const packageFiber = ctx.plugin(plugin, { channel })
  await packageFiber
  return { ctx, registryFiber, packageFiber }
}

async function cleanup(...fibers) {
  for (const fiber of fibers) await fiber?.dispose()
}

function overrideProvider(name, source, rank, content) {
  const invocation = Object.freeze({ modelInvocable: true, userInvocable: true })
  const candidate = Object.freeze({
    name: 'ask-matt',
    description: name + ' override',
    invocation,
    source,
    provider: name,
    rank,
    locator: name,
  })
  return {
    name,
    list: async () => [candidate],
    get: async (selected) => selected === candidate
      ? {
          name: candidate.name,
          description: candidate.description,
          invocation: candidate.invocation,
          source: candidate.source,
          provider: candidate.provider,
          content,
        }
      : undefined,
  }
}

test('actual DSH registry exposes stable membership and exact lazy definitions', async () => {
  const mounted = await mount('stable')
  try {
    const summaries = await mounted.ctx.skills.list()
    assert.deepEqual(summaries.map((skill) => skill.name), plugin.CATALOG.channels.stable)
    assert.deepEqual(summaries.filter(isModelInvocable).map((skill) => skill.name), MODEL_SKILLS)
    assert.deepEqual(summaries.filter(isUserInvocable).map((skill) => skill.name), plugin.CATALOG.channels.stable)
    assert.equal(summaries.find((skill) => skill.name === 'implement-spec'), undefined)

    const definition = await mounted.ctx.skills.get('triage')
    const row = plugin.CATALOG.skills.find((skill) => skill.name === 'triage')
    assert(definition && row)
    const raw = await readFile(definition.path)
    assert.equal(definition.content, raw.subarray(row.bodyByteOffset).toString('utf8'))
    assert.equal(definition.resourceBase.kind, 'directory')
    assert.equal(definition.resourceBase.path, dirname(definition.path))
    const rendered = renderSkillContent(definition)
    assert.match(rendered, /Base directory for this skill:/)
    assert(rendered.includes(definition.resourceBase.path))
    assert.equal(await mounted.ctx.skills.get('not-present'), undefined)
    assert.equal(await mounted.ctx.skills.get('Not_Valid'), undefined)
  } finally {
    await cleanup(mounted.packageFiber, mounted.registryFiber)
  }
})

test('actual DSH registry exposes Beta-only implement-spec without model visibility', async () => {
  const mounted = await mount('beta')
  try {
    const summaries = await mounted.ctx.skills.list()
    assert.deepEqual(summaries.map((skill) => skill.name), plugin.CATALOG.channels.beta)
    assert.deepEqual(summaries.filter(isModelInvocable).map((skill) => skill.name), MODEL_SKILLS)
    assert.deepEqual(summaries.filter(isUserInvocable).map((skill) => skill.name), plugin.CATALOG.channels.beta)
    const implementSpec = summaries.find((skill) => skill.name === 'implement-spec')
    assert(implementSpec)
    assert.deepEqual(implementSpec.invocation, { modelInvocable: false, userInvocable: true })
    const definition = await mounted.ctx.skills.get('implement-spec')
    assert(definition)
    assert.deepEqual(definition.invocation, implementSpec.invocation)
  } finally {
    await cleanup(mounted.packageFiber, mounted.registryFiber)
  }
})

test('provider registration is owned and disposed by the Cordis plugin fiber', async () => {
  const mounted = await mount('stable')
  try {
    assert.equal((await mounted.ctx.skills.list()).length, 25)
    const activeGet = mounted.ctx.skills.get('ask-matt')
    await mounted.packageFiber.dispose()
    await assert.rejects(activeGet, (error) => error?.message === 'skill provider "dsh-mattpocock-skills" disposed')
    assert.deepEqual(await mounted.ctx.skills.list(), [])
    assert.equal(await mounted.ctx.skills.get('ask-matt'), undefined)
  } finally {
    await cleanup(mounted.registryFiber)
  }
})

test('project and user ranks override bundled candidates in the actual registry', async () => {
  const mounted = await mount('stable')
  let disposeUser
  let disposeProject
  try {
    assert.equal(BUNDLED_SKILL_RANK, 600)
    disposeUser = mounted.ctx.skills.registerProvider(() => overrideProvider('test-user', 'user-dsh', 400, 'user body'))
    disposeProject = mounted.ctx.skills.registerProvider(() => overrideProvider('test-project', 'project-dsh', 100, 'project body'))

    let summary = (await mounted.ctx.skills.list()).find((skill) => skill.name === 'ask-matt')
    assert(summary)
    assert.equal(summary.source, 'project-dsh')
    assert.equal((await mounted.ctx.skills.get('ask-matt')).content, 'project body')

    disposeProject()
    disposeProject = undefined
    summary = (await mounted.ctx.skills.list()).find((skill) => skill.name === 'ask-matt')
    assert.equal(summary.source, 'user-dsh')
    assert.equal((await mounted.ctx.skills.get('ask-matt')).content, 'user body')

    disposeUser()
    disposeUser = undefined
    summary = (await mounted.ctx.skills.list()).find((skill) => skill.name === 'ask-matt')
    assert.equal(summary.source, 'bundled')
    assert.equal(summary.provider, plugin.PROVIDER_NAME)
    assert.match((await mounted.ctx.skills.get('ask-matt')).content, /Ask Matt/)
  } finally {
    disposeProject?.()
    disposeUser?.()
    await cleanup(mounted.packageFiber, mounted.registryFiber)
  }
})
