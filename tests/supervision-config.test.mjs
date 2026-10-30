import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  INITIAL_SUPERVISION_CONFIG, SUPERVISION_DEFAULTS, ownSupervisionLeaf, parseSupervisionConfigIntent,
  parseSupervisionConfigSnapshot, resolveSupervisionSettings, setSupervisionLeaf, supervisionIntentOf,
} from '../lib/controls/supervision-config.js'

const invalid = /supervision|must|explicit|between|unsupported/i

test('safe supervision defaults are off and inherit the main route', () => {
  const settings = resolveSupervisionSettings(INITIAL_SUPERVISION_CONFIG, null)
  assert.equal(settings.enabled, false)
  assert.equal(settings.scheduledIntervalMinutes, 60)
  assert.equal(settings.reviewer.routeMode, 'inherit')
  assert.equal(settings.delivery.alert, 'card+agent-check')
  assert.equal(settings.softBudgetHours, null)
  assert.deepEqual(settings.deliverableRoots, [])
  assert.deepEqual(settings, SUPERVISION_DEFAULTS)
})

test('workspace overrides merge sparsely and nested reviewer fields inherit', () => {
  const intent = parseSupervisionConfigIntent({
    defaults: { scheduledIntervalMinutes: 45, reviewer: { routeMode: 'explicit', provider: 'p', model: 'm' }, delivery: { concern: 'card+agent-check' } },
    workspaceOverrides: { W: { reviewer: { maxTokens: 1024 }, deliverableRoots: ['src'] } },
  })
  const base = resolveSupervisionSettings(intent, null), workspace = resolveSupervisionSettings(intent, 'W')
  assert.equal(base.scheduledIntervalMinutes, 45)
  assert.equal(base.reviewer.provider, 'p')
  assert.equal(workspace.scheduledIntervalMinutes, 45)
  assert.equal(workspace.reviewer.provider, 'p')
  assert.equal(workspace.reviewer.maxTokens, 1024)
  assert.deepEqual(workspace.deliverableRoots, ['src'])
  assert.equal(workspace.delivery.concern, 'card+agent-check')
})

test('setSupervisionLeaf removes sparse leaves and restores inheritance', () => {
  const initial = supervisionIntentOf(INITIAL_SUPERVISION_CONFIG)
  const withOverride = setSupervisionLeaf(initial, 'W', 'scheduledIntervalMinutes', 30)
  assert.equal(ownSupervisionLeaf(withOverride, 'W', 'scheduledIntervalMinutes'), 30)
  const removed = setSupervisionLeaf(withOverride, 'W', 'scheduledIntervalMinutes', undefined)
  assert.equal(ownSupervisionLeaf(removed, 'W', 'scheduledIntervalMinutes'), undefined)
  assert.deepEqual(removed.workspaceOverrides, {})
  const explicit = setSupervisionLeaf(initial, null, 'reviewer.routeMode', 'explicit')
  assert.equal(ownSupervisionLeaf(explicit, null, 'reviewer.routeMode'), 'explicit')
  assert.throws(() => parseSupervisionConfigIntent(explicit), invalid)
  const completed = setSupervisionLeaf(setSupervisionLeaf(explicit, null, 'reviewer.provider', 'p'), null, 'reviewer.model', 'm')
  assert.equal(resolveSupervisionSettings(completed, null).reviewer.routeMode, 'explicit')
})

test('snapshots reject unknown fields, unsupported versions and invalid ranges', () => {
  assert.deepEqual(parseSupervisionConfigSnapshot({ schemaVersion: 1, revision: 0, defaults: {}, workspaceOverrides: {} }), INITIAL_SUPERVISION_CONFIG)
  assert.throws(() => parseSupervisionConfigSnapshot({ schemaVersion: 2, revision: 0, defaults: {}, workspaceOverrides: {} }), /schemaVersion/i)
  assert.throws(() => parseSupervisionConfigIntent({ defaults: { unknown: true }, workspaceOverrides: {} }), /unknown key/i)
  assert.throws(() => parseSupervisionConfigIntent({ defaults: { scheduledIntervalMinutes: 14 }, workspaceOverrides: {} }), invalid)
  assert.throws(() => parseSupervisionConfigIntent({ defaults: { supportReadBackThreshold: 1.1 }, workspaceOverrides: {} }), invalid)
  assert.throws(() => parseSupervisionConfigIntent({ defaults: { deliverableRoots: ['src', 'src'] }, workspaceOverrides: {} }), /duplicates/i)
  assert.throws(() => parseSupervisionConfigIntent({ defaults: { reviewer: { routeMode: 'explicit', provider: 'p' } }, workspaceOverrides: {} }), /provider and model/i)
})

test('workspace ids are bounded and override keys are sorted', () => {
  const intent = parseSupervisionConfigIntent({ defaults: {}, workspaceOverrides: { Z: { enabled: true }, A: { enabled: false } } })
  assert.deepEqual(Object.keys(intent.workspaceOverrides), ['A', 'Z'])
  assert.throws(() => resolveSupervisionSettings(intent, 'bad\u0000id'), /workspaceId/i)
})
