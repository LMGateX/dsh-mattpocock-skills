import test from 'node:test'
import assert from 'node:assert/strict'

import { CATALOG, createMattPocockSkillProvider } from '../lib/index.js'
import { parsePolicyIntent, resolvePolicy } from '../lib/controls/policy.js'

const snapshot = (intent, revision = 1) => ({ revision, ...intent })
const code = value => ({ code: value })

test('policy intent carries explicit workspace and skills gates without inventing other leaves', () => {
  const parsed = parsePolicyIntent({ extensionEnabled: true, defaults: {
    workspace: { enabled: true }, skills: { enabled: false }, ticketProgress: { enabled: true },
  }, workspaceOverrides: { 'work-one': { workspace: { enabled: false }, skills: { enabled: true } } } })
  assert.deepEqual(parsed.defaults.workspace, { enabled: true })
  assert.deepEqual(parsed.defaults.skills, { enabled: false })
  assert.deepEqual(parsed.workspaceOverrides['work-one'], { workspace: { enabled: false }, skills: { enabled: true } })
  assert.throws(() => parsePolicyIntent({ extensionEnabled: true, defaults: { workspace: { enabled: 'yes' } }, workspaceOverrides: {} }), code('invalid-input'))
  assert.throws(() => parsePolicyIntent({ extensionEnabled: true, defaults: { workspace: { on: true } }, workspaceOverrides: {} }), code('invalid-input'))
  assert.throws(() => parsePolicyIntent({ extensionEnabled: true, defaults: { nope: { enabled: true } }, workspaceOverrides: {} }), code('invalid-input'))
})

test('a workspace gate left unset stays closed while skills stay delivered', () => {
  const effective = resolvePolicy(snapshot({ extensionEnabled: true, defaults: { ticketProgress: { enabled: true } }, workspaceOverrides: {} }), 'work-one', true)
  assert.equal(effective.workspaceEnabled, false)
  assert.equal(effective.skillsEnabled, true)
  for (const feature of ['binding', 'lifecycle', 'windows', 'ticketProgress', 'pendingDecisions']) {
    assert.equal(effective.features[feature].reason, 'workspace-disabled')
    assert.equal(effective.features[feature].status, 'disabled')
  }
  assert.equal(effective.sources['workspace.enabled'], 'safe-initial')
  assert.equal(effective.sources['skills.enabled'], 'safe-initial')
})

test('both gates open lets the workspace feature switches resolve, and each gate reports its own source', () => {
  const effective = resolvePolicy(snapshot({ extensionEnabled: true, defaults: {
    workspace: { enabled: true }, skills: { enabled: false }, ticketProgress: { enabled: true },
  }, workspaceOverrides: {} }), 'work-one', true)
  assert.equal(effective.workspaceEnabled, true)
  assert.equal(effective.skillsEnabled, false)
  assert.equal(effective.features.ticketProgress.reason, null)
  assert.equal(effective.features.ticketProgress.status, 'configured')
  assert.equal(effective.features.lifecycle.reason, 'feature-disabled')
  assert.equal(effective.sources['workspace.enabled'], 'global')
  assert.equal(effective.sources['skills.enabled'], 'global')
})

test('a workspace override closes only its own workspace and outranks the global gate', () => {
  const policy = snapshot({ extensionEnabled: true, defaults: {
    workspace: { enabled: true }, ticketProgress: { enabled: true },
  }, workspaceOverrides: { 'work-one': { workspace: { enabled: false } } } })
  const closed = resolvePolicy(policy, 'work-one', true)
  const open = resolvePolicy(policy, 'work-two', true)
  assert.equal(closed.workspaceEnabled, false)
  assert.equal(closed.features.ticketProgress.reason, 'workspace-disabled')
  assert.equal(closed.sources['workspace.enabled'], 'workspace')
  assert.equal(open.workspaceEnabled, true)
  assert.equal(open.features.ticketProgress.reason, null)
  assert.equal(open.sources['workspace.enabled'], 'global')
})

test('the global gate outranks every workspace gate and never silently enables a workspace', () => {
  const effective = resolvePolicy(snapshot({ extensionEnabled: false, defaults: {
    workspace: { enabled: true }, skills: { enabled: true }, ticketProgress: { enabled: true },
  }, workspaceOverrides: { 'work-one': { workspace: { enabled: true } } } }), 'work-one', true)
  assert.equal(effective.extensionEnabled, false)
  assert.equal(effective.workspaceEnabled, true)
  assert.equal(effective.features.ticketProgress.reason, 'extension-disabled')
  assert.equal(effective.skillsEnabled, true)
})

test('skill delivery follows its own workspace switch, independently of the collaboration gates', () => {
  const policy = snapshot({ extensionEnabled: false, defaults: { skills: { enabled: true } }, workspaceOverrides: {
    'work-one': { skills: { enabled: false } },
  } })
  assert.equal(resolvePolicy(policy, 'work-one', true).skillsEnabled, false)
  assert.equal(resolvePolicy(policy, 'work-two', true).skillsEnabled, true)
  assert.equal(resolvePolicy(policy, 'work-one', true).sources['skills.enabled'], 'workspace')
})

test('skill delivery is filtered per workspace and stays on when no gate is supplied', async () => {
  const channel = Object.keys(CATALOG.channels)[0]
  const delivered = createMattPocockSkillProvider(channel, {})
  assert.ok((await delivered.list({ cwd: '/work/open' })).length > 0)
  const gated = createMattPocockSkillProvider(channel, { workspaceAllowed: async cwd => cwd !== '/work/blocked' })
  assert.deepEqual(await gated.list({ cwd: '/work/blocked' }), [])
  assert.ok((await gated.list({ cwd: '/work/open' })).length > 0)
})
