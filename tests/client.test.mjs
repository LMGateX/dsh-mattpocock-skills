import test from 'node:test'
import assert from 'node:assert/strict'
import vm from 'node:vm'
import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { buildClient, generateClientDeclaration, BASELINE_EXTERNALS } from '../scripts/build-client.mjs'

const mockReact = {
  createElement: (type, props, ...children) => ({ type, props: { ...(props ?? {}), children } }),
  useEffect: () => {}, useState: value => [typeof value === 'function' ? value() : value, () => {}],
  useSyncExternalStore: (_subscribe, getSnapshot) => getSnapshot(),
}
const built = await buildClient()
const requests = []
let registration
vm.runInThisContext('(function(window){' + built.code + '\n})', { filename: 'client.bundle.js' })({ __ModuleLoader__: { load: value => { registration = value } } })
const client = registration.factory(request => { requests.push(request); if (request === 'react') return mockReact; throw new Error('Unexpected request ' + request) })
const clone = value => JSON.parse(JSON.stringify(value))
const ok = value => ({ ok: true, value })
const settle = () => new Promise(resolve => setImmediate(resolve))
const policy = { revision: 4, extensionEnabled: true, defaults: { workspace: { enabled: true },}, workspaceOverrides: {} }
const instance = { instrumentInstanceId: 'i-one', ownerSessionId: 'owner-one', controlWorkspaceId: 'workspace-one' }
function snapshot(sessionId = 'session-one', overrides = {}) {
  return { sessionId, instance, caller: { kind: 'user', principalId: 'user:operator', sessionId: null }, policyGrants: { schemaVersion: 1, revision: 0, grants: [] }, policy: { controlWorkspaceId: 'workspace-one', extensionEnabled: true,
    features: {}, windows: { ticketWindowSize: null, runningSubagentLimit: null },
    display: { header: true, inputSummary: false, rightPanel: true, sessionList: false, timeline: true } },
    records: null, windows: null, resources: [], capabilities: [], health: [], ...overrides }
}

function contextFixture() {
  const entries = []
  const effects = []
  const opens = []
  const mounts = []
  const declarations = new Map([
    ['plugins.bundle.config', 'keyed'], ['plugins.row.config', 'keyed'],
    ['conversation.session.header.utilities', 'list'], ['conversation.input.dock', 'list'],
    ['sidebar.right.pane.tab', 'keyed'], ['sidebar.session.row.leading', 'list'], ['tool.call.toolview', 'keyed'],
  ])
  const remote = { $mount: async contribution => { mounts.push(contribution); return async () => {} },
    mattpocockControls: { readPolicy: async () => ok(policy), savePolicy: async intent => ok({ ...intent, revision: 5 }),
      listWorkspaces: async () => ok([]), readSession: async id => ok(snapshot(id)), applyInstrument: async () => ok({}),
      historyAction: async () => ok({}), worktreeAction: async () => ok({}) } }
  const ctx = { remote, inject: (dependencies, callback) => { assert.deepEqual(dependencies, ['remote.mattpocockControls']); return callback(ctx) },
    effect: callback => { const cleanup = callback(); effects.push(cleanup); return cleanup },
    slots: { inject: (key, callback) => { assert(declarations.has(key), 'unknown native slot'); return callback() },
      register: (options, component) => { assert(declarations.has(options.name)); assert.equal(typeof component, 'function');
        const kind = declarations.get(options.name); if (kind === 'keyed') assert.equal(typeof options.key, 'string'); else assert.equal(typeof options.id, 'string');
        entries.push({ options, component }); return () => {} } },
    sidebarRightTabs: { register: definition => { entries.push({ definition }); return () => {} } },
    sidebarRight: { mounted: { getSnapshot: () => 'session-one' }, openTab: (...args) => { opens.push(args) } },
  }
  return { ctx, entries, effects, opens, mounts }
}

test('closed lazy client only requests implicit baseline and inlines private pure modules', () => {
  assert.equal(registration.id, '@lmgatex/dsh-mattpocock-skills')
  assert.deepEqual([...new Set(requests)], ['react'])
  assert.deepEqual(built.externals, ['react'])
  assert(built.modules.includes('src/controls/remote-contract.ts'))
  assert(!built.code.includes('node:'))
  assert.equal(typeof client.apply, 'function')
  assert(BASELINE_EXTERNALS.includes('@deepseek-ai/dsh-client-ui-slots'))
})

test('native keyed/list contributions do not hijack single or composer chain seats', async () => {
  const fixture = contextFixture()
  await client.apply(fixture.ctx)
  assert.equal(fixture.mounts.length, 1)
  assert.equal(fixture.mounts[0].package, client.PACKAGE_NAME)
  assert.equal(fixture.opens.length, 0, 'activation never opens a tab')
  assert(fixture.entries.some(row => row.options?.name === 'plugins.bundle.config' && row.options.key === client.PACKAGE_NAME))
  assert(fixture.entries.some(row => row.options?.name === 'plugins.row.config' && row.options.key === client.ROW_KEY))
  assert(fixture.entries.some(row => row.options?.name === 'sidebar.right.pane.tab' && row.options.key === client.TAB_ID))
  assert.equal(fixture.entries.find(row => row.definition)?.definition.kind, client.TAB_KIND)
  assert(!fixture.entries.some(row => row.definition?.patterns || ['root', 'conversation.session.header', 'conversation.composer', 'conversation.session.header.corner'].includes(row.options?.name)))
  for (const effect of fixture.effects.reverse()) effect?.()
})

test('sparse leaf off and restore inheritance preserve independent feature/display intent', () => {
  const intent = { extensionEnabled: true, defaults: { workspace: { enabled: true }, display: { header: true }, windows: { enabled: true } }, workspaceOverrides: {} }
  const off = client.setPolicyLeaf(intent, 'workspace-one', 'display.header', false)
  assert.equal(off.workspaceOverrides['workspace-one'].display.header, false)
  assert.equal(off.defaults.windows.enabled, true)
  assert.equal(intent.workspaceOverrides['workspace-one'], undefined)
  const inherited = client.setPolicyLeaf(off, 'workspace-one', 'display.header', undefined)
  assert.deepEqual(clone(inherited.workspaceOverrides), {})
  assert.throws(() => client.setPolicyLeaf(intent, null, 'windows.ticketWindowSize', 0))
  assert.throws(() => client.setPolicyLeaf(intent, null, 'display.header', 2))
})

test('policy save keeps the revision the draft read and rejects remote conflicts', async () => {
  let received
  const intent = { extensionEnabled: false, defaults: {}, workspaceOverrides: {} }
  const saved = await client.savePolicyDraft({ savePolicy: async (...args) => { received = args; return ok({ ...intent, revision: 5 }) } }, intent, 4)
  assert.equal(received[1], 4)
  assert.equal(saved.revision, 5)
  await assert.rejects(client.savePolicyDraft({ savePolicy: async () => ({ ok: false, error: new Error('revision-conflict') }) }, intent, 4), /revision-conflict/)
})

test('late A cannot replace B and release fences pending updates without model wake', async () => {
  let resolveA
  const a = new client.SessionObserver('A', () => new Promise(resolve => { resolveA = resolve }), 0)
  const b = new client.SessionObserver('B', async () => ok(snapshot('B')), 0)
  const releaseA = a.retain(); const releaseB = b.retain()
  await settle()
  releaseA()
  resolveA(ok(snapshot('A')))
  await settle()
  assert.equal(a.getSnapshot().status, 'unknown')
  assert.equal(b.getSnapshot().value.sessionId, 'B')
  releaseB(); a.dispose(); b.dispose()
})

test('observer rejects caller/instance mismatch and failures are unknown, never zero', async () => {
  const row = new client.SessionObserver('A', async () => ok(snapshot('B')), 0)
  const release = row.retain(); await settle()
  assert.equal(row.getSnapshot().status, 'unknown')
  assert.equal(row.getSnapshot().value, null)
  assert.match(row.getSnapshot().error, /different caller/)
  release(); row.dispose()
  assert.throws(() => client.decodeSession(snapshot('A', { records: { instance: { ...instance, instrumentInstanceId: 'other' } } }), 'A'), /different instance/)
  const failed = new client.SessionObserver('A', async () => ({ ok: false, error: new Error('offline') }), 0)
  const end = failed.retain(); await settle(); assert.equal(failed.getSnapshot().value, null); assert.match(failed.getSnapshot().error, /offline/)
  end(); failed.dispose()
})

test('refresh supersession retains the newest committed result only', async () => {
  const resolvers = []
  const row = new client.SessionObserver('A', () => new Promise(resolve => resolvers.push(resolve)), 0)
  const end = row.retain()
  const newer = row.refresh()
  resolvers[1](ok(snapshot('A', { resources: ['new'] })))
  await newer
  resolvers[0](ok(snapshot('A', { resources: ['old'] })))
  await settle()
  assert.deepEqual(clone(row.getSnapshot().value.resources), ['new'])
  end(); row.dispose()
})

test('header unknown does not counterfeit a pending count and details opens only on click', async () => {
  const unknown = new client.SessionObserver('A', async () => ok(snapshot('A')), 0)
  const rendered = client.HeaderEntry({ observer: unknown, openDetails: () => { throw new Error('automatic open') } })
  assert.match(JSON.stringify(rendered), /状态未知/)
  assert(!JSON.stringify(rendered).includes('裁决 0'))
  const fixture = contextFixture(); await client.apply(fixture.ctx)
  const entry = fixture.entries.find(row => row.options?.name === 'conversation.session.header.utilities')
  const face = entry.options.inject('session-one'); const stop = face.observer.retain(); await settle()
  assert.equal(fixture.opens.length, 0)
  face.openDetails(); assert.equal(fixture.opens.length, 1)
  assert.equal(fixture.opens[0][0], client.TAB_KIND)
  assert.equal(fixture.opens[0][1].preferNewPane, true)
  assert.equal(fixture.opens[0][1].replaceTab, undefined)
  const old = entry.options.inject('other-session'); const end = old.observer.retain(); await settle(); old.openDetails(); assert.equal(fixture.opens.length, 1)
  stop(); end(); for (const effect of fixture.effects.reverse()) effect?.(); unknown.dispose()
})

test('explicit user answer sends no self-reported author and preserves arbitrary status', () => {
  const command = client.decisionAnswerCommand({ businessRevision: 8 }, { workflowId: 'wf', decisionId: 'd', value: { question: 'Which?', status: 'partly-agreed' } }, 'Use option B', 'accepted-but-needs-migration', false, true, 'operation-one')
  assert.equal(command.expectedRevision, 8)
  assert.equal(command.value.pending, false)
  assert.equal(command.value.awaitingImplementation, true)
  assert.equal(command.value.status, 'accepted-but-needs-migration')
  assert.equal(command.author, undefined)
  assert.equal(command.principalId, undefined)
  assert.equal(command.value.question, 'Which?')
})

test('closed client build rejects Node, undeclared external, and dynamic module requests', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'dsh-client-build-'))
  try {
    await fs.mkdir(path.join(root, 'src'))
    for (const request of ['node:fs', 'some-private-host-library']) {
      await fs.writeFile(path.join(root, 'src/client.ts'), 'import value from ' + JSON.stringify(request) + '; console.log(value)')
      await assert.rejects(buildClient({ root }), /Non-baseline/)
    }
    await fs.writeFile(path.join(root, 'src/client.ts'), 'export async function apply(){ return import("./later.js") }')
    await assert.rejects(buildClient({ root }), /Dynamic imports/)
  } finally { await fs.rm(root, { recursive: true, force: true }) }
})

test('actual installed SlotCore accepts native contribution options and unloads cleanly', async () => {
  const { SlotCore } = await import('@deepseek-ai/dsh-client-ui-slots')
  const core = new SlotCore()
  const kinds = {
    'plugins.bundle.config': { kind: 'keyed', scope: 'root' }, 'plugins.row.config': { kind: 'keyed', scope: 'root' },
    'conversation.session.header.utilities': { kind: 'list', scope: 'session' }, 'conversation.input.dock': { kind: 'list', scope: 'session' },
    'sidebar.right.pane.tab': { kind: 'keyed', scope: 'session' }, 'sidebar.session.row.leading': { kind: 'list', scope: 'root' },
    'tool.call.toolview': { kind: 'keyed', scope: 'session' },
  }
  const owner = core.register({ name: 'root', children: kinds }, () => null)
  const fixture = contextFixture()
  const disposers = []
  fixture.ctx.slots = { inject: (key, callback) => { assert(core.specDynamic(key)); const dispose = callback(); disposers.push(...(typeof dispose === 'function' ? [dispose] : dispose)); return typeof dispose === 'function' ? dispose : () => { for (const end of dispose) end() } },
    register: (options, component) => core.register(options, component) }
  await client.apply(fixture.ctx)
  assert.equal(core.entriesOfSlot('plugins.bundle.config').length, 1)
  assert.equal(core.entriesOfSlot('conversation.session.header.utilities').length, 1)
  for (const dispose of disposers.reverse()) dispose()
  for (const cleanup of fixture.effects.reverse()) cleanup?.()
  assert.equal(core.entriesOfSlot('conversation.session.header.utilities').length, 0)
  owner()
})

test('observer aborts transport on supersession, release, and disposal', async () => {
  const signals = []
  const observer = new client.SessionObserver('A', (_id, signal) => { signals.push(signal); return new Promise(() => {}) }, 0)
  const stop = observer.retain()
  void observer.refresh()
  assert.equal(signals[0].aborted, true)
  assert.equal(signals[1].aborted, false)
  stop()
  assert.equal(signals[1].aborted, true)
  observer.dispose()
  stop()
})

test('list observations are gated by committed policy and default to off', async () => {
  assert.equal(client.sessionListRequested(null), false)
  assert.equal(client.sessionListRequested(policy), false)
  assert.equal(client.sessionListRequested({ ...policy, workspaceOverrides: { w: { display: { sessionList: true } } } }), true)
  const visibility = new client.PolicyObserver(async () => ok(policy))
  await visibility.refresh()
  let reads = 0
  const rendered = client.WorkspaceBadge({ sessionId: 'idle-session', visibility, observe: () => { reads++; throw new Error('default-off list must not read every Session') } })
  assert.equal(rendered, null)
  assert.equal(reads, 0)
  visibility.dispose()
})

test('policy delegation carries the actual grant revision and cannot be self-granted by an agent', async () => {
  const view = snapshot('A', { policyGrants: { schemaVersion: 1, revision: 9, grants: [] } })
  let received
  const remote = { grantPolicy: async (...args) => { received = args; return ok({ schemaVersion: 1, revision: 10, grants: [{ sessionId: 'A', enabled: true }] }) } }
  const grants = await client.grantPolicyFromSnapshot(remote, view, 'A', true)
  assert.deepEqual(received, ['A', true, 9])
  assert.equal(grants.revision, 10)
  received = undefined
  await assert.rejects(client.grantPolicyFromSnapshot(remote, { ...view, caller: { kind: 'agent', principalId: 'agent:A', sessionId: 'A' } }, 'A', true), /authenticated operator/)
  assert.equal(received, undefined)
})

test('timeline registration claims exactly this package tools and retains historical result blocks', async () => {
  const fixture = contextFixture(); await client.apply(fixture.ctx)
  const keys = fixture.entries.filter(row => row.options?.name === 'tool.call.toolview').map(row => row.options.key)
  assert.deepEqual(keys, ['mattpocock_record', 'mattpocock_window', 'mattpocock_resource', 'mattpocock_controls', 'mattpocock_execute', 'mattpocock_assign', 'mattpocock_history', 'mattpocock_worktree', 'mattpocock_delegate'])
  assert(!keys.includes('bash')); assert(!keys.includes('ask_user_question'))
  const observer = new client.SessionObserver('A', async () => ok(snapshot('A')), 0)
  const block = { kind: 'tool-result', time: 1, seq: 2, call: null, content: [{ type: 'text', text: 'original historical result' }], isError: false }
  const rendered = client.SourceCard({ observer, openDetails: () => {}, phase: 'result', callId: 'c', toolName: 'mattpocock_record', block })
  assert.match(JSON.stringify(rendered), /original historical result/)
  observer.dispose(); for (const effect of fixture.effects.reverse()) effect?.()
})

test('readSession and historyAction descriptors support genuine caller cancellation without identity wire claims', async () => {
  const fixture = contextFixture(); await client.apply(fixture.ctx)
  for (const [method, wires] of [['readSession', ['sessionId']], ['historyAction', ['sessionId', 'request']]]) {
    const descriptor = fixture.mounts[0].descriptors.find(row => row.method === method)
    assert.equal(descriptor.cancellation?.parameter, 'signal')
    assert.deepEqual(descriptor.parameters.map(row => row.wire), wires)
    assert(!descriptor.parameters.some(row => ['principal', 'author', 'ownerSessionId', 'instrumentInstanceId', 'signal'].includes(row.wire)))
  }
  for (const effect of fixture.effects.reverse()) effect?.()
})

test('independent strict declaration emission produces only the client entry text', async () => {
  const declaration = generateClientDeclaration()
  assert.match(declaration, /export declare function apply/)
  assert.match(declaration, /controls\/remote-contract\.js/)
  assert(!declaration.includes('node:'))
  const checked = await buildClient({ declaration: true })
  assert.equal(checked.declaration, declaration)
  assert.equal(checked.code, built.code)
})

test('draft impact reports source changes and unset capacities without invented execution receipts', () => {
  const draft = { extensionEnabled: true, defaults: { workspace: { enabled: true }, display: { header: true } }, workspaceOverrides: { w: { display: { header: false } } } }
  const saved = { ...draft, revision: 7, workspaceOverrides: {} }
  const impact = client.policyDraftImpact(saved, draft, 'w', true)
  assert.equal(impact.readRevision, 7)
  assert(impact.changes.some(row => row.field === 'display.header' && row.after.value === false && row.after.source === 'workspace'))
  assert.match(impact.executionEffects, /Intent only/)
  assert.equal(impact.runningCount, undefined)
  assert.equal(impact.T, undefined)
})

function treeRows(tree) {
  if (tree === null || tree === undefined) return []
  if (Array.isArray(tree)) return tree.flatMap(treeRows)
  if (typeof tree !== 'object') return []
  return [tree, ...treeRows(tree.props?.children)]
}
function bindingRow(bindingId, state = 'active', revision = 2) {
  return { bindingId, revision, value: { operationId: 'create-' + bindingId, parentSessionId: 'owner-one', plannedChildSessionId: 'child-' + bindingId,
    requestedCwd: '/repo/' + bindingId, actualChildSessionId: 'child-' + bindingId, actualCwd: '/repo/' + bindingId, acceptance: 'accepted', outcome: 'confirmed', diagnostic: null,
    business: { state, notes: '原始说明' } }, source: 'program', author: { kind: 'program', principalId: 'host' }, recordedAt: 100 }
}
function historyRow(historyId, kind = 'worktree', extra = {}) {
  return { historyId, sequence: Number(historyId.slice(2)), capturedAt: 100, kind, recordId: 'binding-one', recordKey: 'binding-one:2', version: 2,
    sourceDomain: 'worktree-bindings', source: { kind: 'program', domain: 'worktree-bindings', author: { kind: 'program', principalId: 'host' }, recordedAt: 100, coverage: 'recorded-history' },
    purged: false, summary: '已清理的树仍可检索', flags: { cleanedWorktree: true }, ...extra }
}
function historyPage(rows, extra = {}) {
  return { instance, revision: 2, cut: 2, total: 2, rows, nextCursor: null,
    coverage: { sources: [{ domain: 'worktree-bindings', coverage: 'recorded-history' }], purged: false, notRecorded: false }, notRecorded: false, ...extra }
}
function button(tree, label) { return treeRows(tree).find(row => row.type === 'button' && row.props.children.includes(label)) }
function hookFixture() {
  const state = []
  const effects = []
  let stateCursor = 0
  let effectCursor = 0
  return {
    state,
    render(component, props) {
      stateCursor = 0; effectCursor = 0
      const original = { useState: mockReact.useState, useEffect: mockReact.useEffect }
      mockReact.useState = initial => {
        const index = stateCursor++
        if (!Object.hasOwn(state, index)) state[index] = typeof initial === 'function' ? initial() : initial
        return [state[index], value => { state[index] = typeof value === 'function' ? value(state[index]) : value }]
      }
      mockReact.useEffect = (callback, deps) => {
        const index = effectCursor++
        const previous = effects[index]
        if (!previous || deps.some((value, position) => value !== previous.deps[position])) {
          previous?.cleanup?.(); effects[index] = { callback, deps, pending: true }
        }
      }
      try { return component(props) } finally { Object.assign(mockReact, original) }
    },
    mountEffects() { for (const effect of effects) if (effect.pending) { effect.pending = false; effect.cleanup = effect.callback() } },
    unmount() { for (const effect of effects) effect.cleanup?.() },
  }
}

test('default header persistently shows custom ticket status, T, unknown-safe S and resources', async () => {
  const records = { instance, summary: { countingScope: 'instance', totalTickets: 7, pendingUserDecisionCount: 2, awaitingImplementationCount: 1,
    statusCounts: [{ workflowId: 'migration', axisKey: 'review', label: '验收约定', counting: 'overlapping', statuses: [
      { statusKey: 'slice-ready', label: '部分接口可评审', count: 3, summaryPriority: 1 }, { statusKey: 'custom', label: '等待外部窗口', count: 2 },
    ] }] } }
  const windows = { instance, capability: 'unsupported', status: 'unsupported', runtimeKnowledge: { runtimeId: null, known: false, reason: 'not-reconciled' },
    T: { used: 2, capacity: 4, available: 2, overcommitted: false }, S: { used: 0, capacity: 3, available: null, overcommitted: false, byState: { unknown: 0 } } }
  const view = snapshot('A', { records, windows, resources: [{ resourceId: 'r1', status: 'retained' }] })
  const observer = new client.SessionObserver('A', async () => ok(view), 0)
  const release = observer.retain(); await settle()
  const rendered = client.HeaderEntry({ observer, openDetails: () => { throw new Error('automatic open') } })
  const text = JSON.stringify(rendered)
  assert.match(text, /票 7/); assert.match(text, /部分接口可评审 3/)
  assert.match(text, /待用户裁决 2/); assert.match(text, /待落实 1/)
  assert.match(text, /T 2\/4/); assert.match(text, /S 已登记 0\/3.*总数未知/); assert.match(text, /资源 1/)
  assert(!text.includes('S 0/3')); assert(!text.includes('%')); assert(!text.includes('in_progress'))
  assert.equal(view.policy.display.inputSummary, false)
  const healthyS = { ...windows, capability: 'cooperative', runtimeKnowledge: { runtimeId: 'runtime-one', known: true, reason: null }, S: { ...windows.S, used: 1, countKnown: true } }
  assert.deepEqual([...client.windowSummary(healthyS)], ['T 2/4 · 超出 未知 · 差额 未知', 'S 1/3 · 超出 未知 · 差额 未知'])
  assert.deepEqual([...client.windowSummary(null)], ['T 未知', 'S 未知'])
  release(); observer.dispose()
})

test('settings Session navigation is workspace-first, global-unioned and missing metadata stays unknown', () => {
  const rows = client.decodeWorkspaces([
    { id: 'w1', title: 'One', status: 'ok', sessionIds: ['A', 'B'] },
    { id: 'w2', title: 'Two', status: 'ok', sessionIds: ['B', 'C'] },
    { id: 'w3', title: 'Unknown', status: 'ok' },
  ])
  assert.deepEqual(clone(client.settingsSessionChoices(rows, 'w1')), { ids: ['A', 'B'], unknown: false })
  assert.deepEqual(clone(client.settingsSessionChoices(rows, null)), { ids: ['A', 'B', 'C'], unknown: true })
  assert.deepEqual(clone(client.settingsSessionChoices(rows, 'w3')), { ids: [], unknown: true })
  assert.throws(() => client.decodeWorkspaces([{ id: 'w', title: 'Bad', status: 'ok', sessionIds: 0 }]), /navigation/)
})

test('settings selects and inspects a cached Session on-page without sidebar/model activation or upgrading draft CAS', async () => {
  const fixture = contextFixture()
  const reads = []
  const signals = []
  let resolveA
  let savedArgs
  fixture.ctx.remote.mattpocockControls.listWorkspaces = async () => ok([{ id: 'workspace-one', title: 'One', status: 'ok', sessionIds: ['A', 'B'] }])
  fixture.ctx.remote.mattpocockControls.readSession = (id, signal) => {
    reads.push(id); signals.push(signal)
    if (id === 'A') return new Promise(resolve => { resolveA = resolve })
    return Promise.resolve(ok(snapshot(id, { policy: { ...snapshot(id).policy, configurationRevision: 99 } })))
  }
  fixture.ctx.remote.mattpocockControls.savePolicy = async (...args) => { savedArgs = args; return ok({ ...args[0], revision: 5 }) }
  fixture.ctx.remote.mattpocockControls.resume = () => { throw new Error('must not resume') }
  fixture.ctx.remote.mattpocockControls.ensureSession = () => { throw new Error('must not create an instance') }
  await client.apply(fixture.ctx)
  const registration = fixture.entries.find(row => row.options?.name === 'plugins.bundle.config')
  const props = { view: 'page', ...registration.options.inject() }
  const page = hookFixture()
  page.render(client.SettingsPage, props); page.mountEffects(); await settle()
  let tree = page.render(client.SettingsPage, props)
  assert.deepEqual(reads, [], 'no instrument read before explicit selection')
  const picker = treeRows(tree).find(row => row.type === 'select' && row.props['aria-label'] === '选择查看会话')
  picker.props.onChange({ target: { value: 'A' } })
  tree = page.render(client.SettingsPage, props)
  const selectedA = treeRows(tree).find(row => row.type === client.SettingsInspection)
  assert.equal(selectedA.props.sessionId, 'A')
  const inspectingA = hookFixture(); inspectingA.render(client.ObservedSettingsInspection, selectedA.props); inspectingA.mountEffects()
  assert.deepEqual(reads, ['A'])
  const changed = treeRows(tree).find(row => row.type === 'select' && row.props['aria-label'] === '选择查看会话')
  changed.props.onChange({ target: { value: 'B' } }); inspectingA.unmount()
  assert.equal(signals[0].aborted, true)
  tree = page.render(client.SettingsPage, props)
  const selectedB = treeRows(tree).find(row => row.type === client.SettingsInspection)
  const inspectingB = hookFixture(); inspectingB.render(client.ObservedSettingsInspection, selectedB.props); inspectingB.mountEffects(); await settle()
  resolveA(ok(snapshot('A'))); await settle()
  const projectedB = inspectingB.render(client.ObservedSettingsInspection, selectedB.props)
  assert.match(JSON.stringify(projectedB), /所选会话 B/)
  assert(!JSON.stringify(projectedB).includes('所选会话 A'))
  assert.deepEqual(reads, ['A', 'B']); assert.equal(fixture.opens.length, 0)
  const rootToggle = treeRows(tree).find(row => row.type === 'input' && row.props.type === 'checkbox')
  rootToggle.props.onChange({ target: { checked: false } })
  tree = page.render(client.SettingsPage, props)
  treeRows(tree).find(row => row.type === 'button' && row.props.children.includes('保存并关闭协作管理')).props.onClick()
  await settle()
  assert.equal(savedArgs[1], 4, 'inspecting revision 99 does not upgrade the policy draft fence')
  inspectingB.unmount(); page.unmount(); for (const effect of fixture.effects.reverse()) effect?.()
})

test('mounted Session history is explicit, summary-paged with lossless cursor, filtered and expanded per row', async t => {
  const fixture = contextFixture()
  const calls = []
  const cursor = { ...instance, cut: 2, after: 1, kind: null, recordId: null }
  fixture.ctx.remote.mattpocockControls.historyAction = async (id, request) => {
    calls.push([id, clone(request)])
    if (request.action === 'detail') return ok({ revision: 2, rows: [historyRow('h:1', 'worktree', { snapshot: { literal: '正文只在展开时返回' } })], missingHistoryIds: [], coverage: historyPage([]).coverage, notRecorded: false })
    return ok(request.query.cursor ? historyPage([historyRow('h:2')]) : historyPage([historyRow('h:1')], { nextCursor: cursor }))
  }
  await client.apply(fixture.ctx)
  const registration = fixture.entries.find(row => row.options?.name === 'sidebar.right.pane.tab')
  const injected = registration.options.inject('session-one')
  t.after(() => { for (const effect of fixture.effects.reverse()) effect?.() })
  const release = injected.observer.retain(); t.after(release); await settle()
  const tree = client.Details({ sessionId: 'session-one', useTabInfo: () => ({ tab: { visible: true } }), ...injected })
  const history = treeRows(tree).find(row => row.type === client.HistoryPanel)
  assert(history, 'Session details mounts the history renderer')
  const inspect = client.ObservedSettingsInspection({ sessionId: 'session-one', ...injected })
  assert(treeRows(inspect).some(row => row.type === client.HistoryPanel), 'settings shares the same explicit history view')
  const mounted = hookFixture(); t.after(() => mounted.unmount())
  let projected = mounted.render(client.HistoryPanel, history.props); mounted.mountEffects(); await settle()
  assert.equal(calls.length, 0, 'history is never automatically injected or fetched on mounting')
  assert.match(JSON.stringify(projected), /主动查询.*不.*自动注入/)
  button(projected, '查询历史').props.onClick(); await settle()
  projected = mounted.render(client.HistoryPanel, history.props)
  assert.deepEqual(calls[0], ['session-one', { action: 'query', query: { limit: 20 } }])
  assert(!JSON.stringify(projected).includes('正文只在展开时返回'))
  button(projected, '下一页').props.onClick(); await settle()
  projected = mounted.render(client.HistoryPanel, history.props)
  assert.deepEqual(calls[1][1].query.cursor, cursor, 'typed cut cursor is not flattened or reconstructed')
  const filter = treeRows(projected).find(row => row.type === 'input' && row.props['aria-label'] === '历史类别')
  filter.props.onChange({ target: { value: 'worktree' } })
  projected = mounted.render(client.HistoryPanel, history.props)
  button(projected, '查询历史').props.onClick(); await settle()
  projected = mounted.render(client.HistoryPanel, history.props)
  assert.deepEqual(calls[2][1], { action: 'query', query: { kind: 'worktree', limit: 20 } })
  button(projected, '展开详情').props.onClick(); await settle()
  projected = mounted.render(client.HistoryPanel, history.props)
  assert.deepEqual(calls[3][1], { action: 'detail', historyIds: ['h:1'] })
  assert.match(JSON.stringify(projected), /正文只在展开时返回/)
})

test('mounted history explicitly archives/reincludes records and permanently purges only one instrument row', async t => {
  const fixture = contextFixture(); const calls = []; let refreshes = 0
  fixture.ctx.remote.mattpocockControls.historyAction = async (id, request) => {
    calls.push([id, clone(request)])
    if (request.action === 'query') return ok(historyPage([historyRow('h:1', 'ticket', { flags: { done: true } })]))
    return ok({ revision: 3, operation: { action: request } })
  }
  await client.apply(fixture.ctx); t.after(() => { for (const effect of fixture.effects.reverse()) effect?.() })
  const mounted = hookFixture(); t.after(() => mounted.unmount())
  const props = { sessionId: 'A', instance, remote: fixture.ctx.remote.mattpocockControls, refresh: async () => { refreshes++ } }
  let tree = mounted.render(client.HistoryPanel, props); mounted.mountEffects()
  button(tree, '查询历史').props.onClick(); await settle(); tree = mounted.render(client.HistoryPanel, props)
  assert.match(JSON.stringify(tree), /永久删除.*不.*Git/)
  button(tree, '退出当前注入（保留历史）').props.onClick(); await settle(); tree = mounted.render(client.HistoryPanel, props)
  assert.deepEqual(calls[1], ['A', { action: 'set-context', kind: 'ticket', recordId: 'binding-one', included: false }])
  assert.equal(refreshes, 1)
  button(tree, '查询历史').props.onClick(); await settle(); tree = mounted.render(client.HistoryPanel, props)
  button(tree, '纳入当前注入').props.onClick(); await settle(); tree = mounted.render(client.HistoryPanel, props)
  assert.deepEqual(calls[3][1], { action: 'set-context', kind: 'ticket', recordId: 'binding-one', included: true })
  button(tree, '查询历史').props.onClick(); await settle(); tree = mounted.render(client.HistoryPanel, props)
  button(tree, '永久删除此条历史副本').props.onClick(); await settle(); tree = mounted.render(client.HistoryPanel, props)
  assert.deepEqual(calls[5][1], { action: 'purge', historyIds: ['h:1'], archivedOnly: false })
  assert(!JSON.stringify(calls).includes('resourceAction'))
  assert.match(JSON.stringify(tree), /已提交.*历史副本.*未执行.*Git/)
})

test('history fences late pages/details across filters and Session switches, and incomplete detail coverage stays unknown', async t => {
  const fixture = contextFixture(); const pending = []; const requests = []; const signals = []
  fixture.ctx.remote.mattpocockControls.historyAction = (id, request, signal) => {
    requests.push([id, clone(request)]); signals.push(signal); return new Promise(resolve => pending.push(resolve))
  }
  await client.apply(fixture.ctx); t.after(() => { for (const effect of fixture.effects.reverse()) effect?.() })
  const mounted = hookFixture(); t.after(() => mounted.unmount())
  let props = { sessionId: 'A', instance, remote: fixture.ctx.remote.mattpocockControls, refresh: async () => {} }
  let tree = mounted.render(client.HistoryPanel, props); mounted.mountEffects()
  button(tree, '查询历史').props.onClick()
  tree = mounted.render(client.HistoryPanel, props)
  treeRows(tree).find(row => row.props?.['aria-label'] === '历史类别').props.onChange({ target: { value: 'ticket' } })
  tree = mounted.render(client.HistoryPanel, props); button(tree, '查询历史').props.onClick()
  assert.equal(signals[0].aborted, true, 'changing filter truly aborts the generated transport channel')
  assert(signals[1] instanceof AbortSignal)
  pending[1](ok(historyPage([historyRow('h:2', 'ticket', { summary: 'A的当前页' })]))); await settle()
  pending[0](ok(historyPage([historyRow('h:1', 'worktree', { summary: '过期筛选页' })]))); await settle()
  tree = mounted.render(client.HistoryPanel, props); assert(!JSON.stringify(tree).includes('过期筛选页'))
  props = { ...props, sessionId: 'B' }
  tree = mounted.render(client.HistoryPanel, props)
  assert(!JSON.stringify(tree).includes('A的当前页'), 'render never briefly shows A data under B identity')
  mounted.mountEffects(); tree = mounted.render(client.HistoryPanel, props)
  button(tree, '查询历史').props.onClick(); pending[2](ok(historyPage([historyRow('h:1')]))); await settle()
  tree = mounted.render(client.HistoryPanel, props); button(tree, '展开详情').props.onClick()
  pending[3](ok({ revision: 2, rows: [historyRow('h:1', 'worktree', { snapshot: { text: '不能伪装完整详情' } })], missingHistoryIds: [] })); await settle()
  tree = mounted.render(client.HistoryPanel, props)
  assert.match(JSON.stringify(tree), /历史状态未知/)
  assert(!JSON.stringify(tree).includes('不能伪装完整详情'))
  button(tree, '查询历史').props.onClick(); mounted.unmount()
  assert.equal(signals[4].aborted, true, 'unmount cancels the still pending page')
  pending[4](ok(historyPage([historyRow('h:1', 'worktree', { summary: '卸载后旧响应' })]))); await settle()
  assert(!JSON.stringify(mounted.state).includes('卸载后旧响应'))
  assert.equal(requests[2][0], 'B')
})

test('mounted worktree bindings omit cleaned trees, retain discarded reminders and register business state without Git operations', async t => {
  const fixture = contextFixture(); const calls = []
  let current = [bindingRow('active'), bindingRow('discarded', 'discarded'), bindingRow('cleaned', 'cleaned')]
  fixture.ctx.remote.mattpocockControls.readSession = async id => ok(snapshot(id, { worktreeBindings: current }))
  fixture.ctx.remote.mattpocockControls.worktreeAction = async (id, request) => { calls.push([id, clone(request)]); const row = bindingRow('discarded', 'cleaned', 3); return ok({ ...row, value: { ...row.value, business: { state: request.command.state, notes: request.command.notes } }, history: [] }) }
  fixture.ctx.remote.mattpocockControls.resourceAction = () => { throw new Error('legacy physical operations forbidden') }
  await client.apply(fixture.ctx); t.after(() => { for (const effect of fixture.effects.reverse()) effect?.() })
  const registration = fixture.entries.find(row => row.options?.name === 'sidebar.right.pane.tab')
  const injected = registration.options.inject('session-one'); const release = injected.observer.retain(); t.after(release); await settle()
  const tree = client.Details({ sessionId: 'session-one', useTabInfo: () => ({ tab: { visible: true } }), ...injected })
  const bindings = treeRows(tree).find(row => row.type === client.WorktreeBindingsPanel)
  assert(bindings, 'new bindings view is mounted, not legacy resource create/retire UI')
  const inspection = client.ObservedSettingsInspection({ sessionId: 'session-one', ...injected })
  assert(treeRows(inspection).some(row => row.type === client.WorktreeBindingsPanel))
  const panel = client.WorktreeBindingsPanel(bindings.props)
  assert(!JSON.stringify(panel).includes('child-cleaned'))
  assert.match(JSON.stringify(panel), /废弃但未清理.*待处置/)
  const selected = treeRows(panel).find(row => row.type === client.WorktreeBindingEditor && row.props.row.bindingId === 'discarded')
  const mounted = hookFixture(); t.after(() => mounted.unmount())
  let rendered = mounted.render(client.WorktreeBindingEditor, selected.props); mounted.mountEffects()
  treeRows(rendered).find(row => row.type === 'select').props.onChange({ target: { value: 'cleaned' } })
  treeRows(rendered).find(row => row.type === 'textarea').props.onChange({ target: { value: '已按用户约定清理，业务登记' } })
  const newer = { ...selected.props, row: bindingRow('discarded', 'discarded', 10) }
  rendered = mounted.render(client.WorktreeBindingEditor, newer)
  assert.match(JSON.stringify(rendered), /草稿绑定修订 2/)
  button(rendered, '保存业务登记（不执行 Git）').props.onClick(); await settle()
  assert.equal(calls.length, 1)
  assert.equal(calls[0][0], 'session-one')
  assert.deepEqual({ ...calls[0][1].command, operationId: 'generated' }, { operationId: 'generated', bindingId: 'discarded', expectedRevision: 2, state: 'cleaned', notes: '已按用户约定清理，业务登记' })
  assert.equal(calls[0][1].action, 'update')
  rendered = mounted.render(client.WorktreeBindingEditor, newer)
  assert.match(JSON.stringify(rendered), /已保存业务登记.*未执行.*Git/)
  assert(!JSON.stringify(calls).includes('principalId'))
})

test('mounted windows show reference overage and signed gap while countKnown false never claims native free dispatch slots', async t => {
  const fixture = contextFixture()
  const windows = { instance, capability: 'cooperative', status: 'overcommitted', reason: null, runtimeKnowledge: { runtimeId: 'native-one', known: true, reason: null },
    T: { used: 5, capacity: 4, available: 0, overcommitted: true, overage: 1, gap: -1 },
    S: { used: 0, capacity: 3, available: 3, overcommitted: false, overage: 0, gap: 3, countKnown: false, byState: { unknown: 0 } } }
  fixture.ctx.remote.mattpocockControls.readSession = async id => ok(snapshot(id, { windows }))
  await client.apply(fixture.ctx); t.after(() => { for (const effect of fixture.effects.reverse()) effect?.() })
  const header = fixture.entries.find(row => row.options?.name === 'conversation.session.header.utilities')
  const face = header.options.inject('session-one'); const release = face.observer.retain(); t.after(release); await settle()
  const rendered = client.HeaderEntry({ sessionId: 'session-one', ...face })
  assert.match(JSON.stringify(rendered), /T 5\/4/); assert.match(JSON.stringify(rendered), /超出 1/); assert.match(JSON.stringify(rendered), /差额 -1/)
  assert.doesNotMatch(JSON.stringify(rendered), /参考/, 'the input-area progress never hedges its own numbers')
  assert.match(JSON.stringify(rendered), /S 已登记 0/); assert.match(JSON.stringify(rendered), /总数未知/)
  const details = fixture.entries.find(row => row.options?.name === 'sidebar.right.pane.tab')
  const props = { sessionId: 'session-one', useTabInfo: () => ({ tab: { visible: true } }), ...details.options.inject('session-one') }
  const detailTree = client.Details(props)
  const projection = treeRows(detailTree).find(row => row.type === client.WindowProjection)
  assert(projection)
  const projected = client.WindowProjection(projection.props)
  assert.match(JSON.stringify(projected), /不是硬名额.*不.*额外审批/)
  assert.match(JSON.stringify(projected), /available.*登记账本.*不.*全机/)
  assert.match(JSON.stringify(projected), /countKnown.*false/)
  assert(!JSON.stringify(projected).includes('可以派'))
  const failed = client.WindowProjection({ view: snapshot('A', { windows, health: [{ scope: 'windows', status: 'unknown', reason: 'window ledger read failed' }] }) })
  assert.match(JSON.stringify(failed), /窗口观测未知/)
  assert.match(JSON.stringify(failed), /window ledger read failed/)
  assert(!JSON.stringify(failed).includes('S 0/3'))
})

test('binding aggregate failure stays unknown in mounted header and late A write cannot refresh or report success under B', async t => {
  const fixture = contextFixture(); let resolveWrite; let refreshes = 0
  fixture.ctx.remote.mattpocockControls.readSession = async id => ok(snapshot(id, { worktreeBindings: [], health: [{ scope: 'worktree-bindings', status: 'unknown', reason: 'registry unavailable' }] }))
  fixture.ctx.remote.mattpocockControls.worktreeAction = async () => new Promise(resolve => { resolveWrite = resolve })
  await client.apply(fixture.ctx); t.after(() => { for (const effect of fixture.effects.reverse()) effect?.() })
  const face = fixture.entries.find(row => row.options?.name === 'conversation.session.header.utilities').options.inject('session-one')
  const release = face.observer.retain(); t.after(release); await settle()
  const header = client.HeaderEntry({ ...face, sessionId: 'session-one' })
  assert.match(JSON.stringify(header), /工作树绑定未知/)
  assert(!JSON.stringify(header).includes('工作树绑定 0'))
  const view = face.observer.getSnapshot().value
  const panel = client.WorktreeBindingsPanel({ view, remote: fixture.ctx.remote.mattpocockControls, refresh: async () => {} })
  assert.match(JSON.stringify(panel), /registry unavailable/)
  const mounted = hookFixture(); t.after(() => mounted.unmount())
  let props = { sessionId: 'A', row: bindingRow('binding'), remote: fixture.ctx.remote.mattpocockControls, refresh: async () => { refreshes++ } }
  let tree = mounted.render(client.WorktreeBindingEditor, props); mounted.mountEffects()
  button(tree, '保存业务登记（不执行 Git）').props.onClick()
  props = { ...props, sessionId: 'B', row: bindingRow('other') }
  tree = mounted.render(client.WorktreeBindingEditor, props); mounted.mountEffects()
  resolveWrite(ok({ ...bindingRow('binding'), history: [] })); await settle()
  tree = mounted.render(client.WorktreeBindingEditor, props)
  assert(!JSON.stringify(tree).includes('已保存业务登记'))
  assert.equal(refreshes, 0, 'late A write must not refresh another Session')
  assert(!JSON.stringify(tree).includes('child-binding'))
})

test('lossless history boundaries reject malformed summaries and binding writes do not invent success from incomplete receipts', async t => {
  const fixture = contextFixture(); const replies = [
    historyPage([historyRow('h:1', 'worktree', { snapshot: { accidental: '不能将摘要伪装正文' } })]),
    historyPage([historyRow('h:1')], { revision: undefined }),
    historyPage([historyRow('h:1')], { nextCursor: { ...instance, cut: 2, after: -0, kind: null, recordId: null } }),
  ]
  fixture.ctx.remote.mattpocockControls.historyAction = async () => ok(replies.shift())
  fixture.ctx.remote.mattpocockControls.worktreeAction = async () => ok({ bindingId: 'binding', revision: 3 })
  await client.apply(fixture.ctx); t.after(() => { for (const effect of fixture.effects.reverse()) effect?.() })
  const history = hookFixture(); t.after(() => history.unmount())
  const props = { sessionId: 'A', instance, remote: fixture.ctx.remote.mattpocockControls, refresh: async () => {} }
  let tree = history.render(client.HistoryPanel, props); history.mountEffects()
  for (let index = 0; index < 3; index++) {
    button(tree, '查询历史').props.onClick(); await settle(); tree = history.render(client.HistoryPanel, props)
    assert.match(JSON.stringify(tree), /历史状态未知/); assert(!JSON.stringify(tree).includes('匹配总数 2'))
  }
  const binding = hookFixture(); t.after(() => binding.unmount())
  const bindingProps = { ...props, row: bindingRow('binding') }
  tree = binding.render(client.WorktreeBindingEditor, bindingProps); binding.mountEffects()
  button(tree, '保存业务登记（不执行 Git）').props.onClick(); await settle(); tree = binding.render(client.WorktreeBindingEditor, bindingProps)
  assert.match(JSON.stringify(tree), /登记结果未知/)
  assert(!JSON.stringify(tree).includes('已保存业务登记'))
})

test('mounted detail editors retain Session-qualified identities and reject an unrelated observer', async t => {
  const fixture = contextFixture()
  const records = { instance, businessRevision: 2, workflows: [], tickets: [], decisions: [{ workflowId: 'wf', decisionId: 'choice', value: { question: '沿任务约定裁决', status: '自定义', pending: true } }],
    summary: { countingScope: 'instance', totalTickets: 0, pendingUserDecisionCount: 1, awaitingImplementationCount: 0, statusCounts: [] } }
  fixture.ctx.remote.mattpocockControls.readSession = async id => ok(snapshot(id, { records }))
  await client.apply(fixture.ctx); t.after(() => { for (const effect of fixture.effects.reverse()) effect?.() })
  const registration = fixture.entries.find(row => row.options?.name === 'sidebar.right.pane.tab')
  const injected = registration.options.inject('A'); const release = injected.observer.retain(); t.after(release); await settle()
  const props = { sessionId: 'A', useTabInfo: () => ({ tab: { visible: true } }), ...injected }
  const tree = client.Details(props)
  const editor = treeRows(tree).find(row => row.type?.name === 'DecisionEditor')
  assert.equal(editor.props.key, 'A:wf:choice', 'same business IDs across Sessions cannot reuse a pending old editor')
  const delegation = treeRows(tree).find(row => row.type?.name === 'PolicyDelegation')
  assert.equal(delegation.props.key, 'A:policy-grants')
  const roleKeys = treeRows(tree).filter(row => ['WorktreeBindingsPanel', 'HistoryPanel', 'PolicyDelegation'].includes(row.type?.name)).map(row => row.props.key)
  assert.deepEqual(roleKeys, ['A:bindings', 'A:history', 'A:policy-grants'])
  assert.equal(new Set(roleKeys).size, roleKeys.length, 'sibling roles must not reuse the same Session key')
  const mismatched = client.Details({ ...props, sessionId: 'B' })
  assert.match(JSON.stringify(mismatched), /归属不一致/)
  assert(!treeRows(mismatched).some(row => row.type?.name === 'DecisionEditor'))
})

test('mounted history source cleanup uses source document CAS and row cut while preserving current and separate copy actions', async t => {
  const fixture = contextFixture(); const calls = []; let refreshes = 0
  fixture.ctx.remote.mattpocockControls.historyAction = async (id, request) => {
    calls.push([id, clone(request)])
    if (request.action === 'query') return ok(historyPage([historyRow('h:1', 'worktree', { version: 7 })], { revision: 99, sourceRevisions: { records: 12, windows: 15, worktrees: 18 } }))
    return ok({ scope: 'selected-source-history-only', domain: 'worktrees', sourceRecordsDeleted: true, derivedHistoryDeleted: true, nativeConversationDeleted: false, revision: 19, replayed: false, removedVersions: 2 })
  }
  await client.apply(fixture.ctx); t.after(() => { for (const effect of fixture.effects.reverse()) effect?.() })
  const mounted = hookFixture(); t.after(() => mounted.unmount())
  const props = { sessionId: 'owner-one', instance, remote: fixture.ctx.remote.mattpocockControls, refresh: async () => { refreshes++ } }
  let tree = mounted.render(client.HistoryPanel, props); mounted.mountEffects()
  button(tree, '查询历史').props.onClick(); await settle(); tree = mounted.render(client.HistoryPanel, props)
  const action = button(tree, '删除此对象截至本版本的源旧历史（保当前）')
  assert(action, 'single-row source action is explicit and separate from derived-copy purge')
  assert.equal(action.props.disabled, false)
  assert(button(tree, '永久删除此条历史副本'))
  assert.match(JSON.stringify(tree), /源修订 18.*截至版本 7/)
  action.props.onClick(); await settle(); tree = mounted.render(client.HistoryPanel, props)
  assert.deepEqual({ ...calls[1][1], request: { ...calls[1][1].request, operationId: 'generated' } },
    { action: 'purge-source', domain: 'worktrees', request: { operationId: 'generated', expectedRevision: 18, throughRevision: 7, bindingIds: ['binding-one'] } })
  assert.equal(calls[1][0], 'owner-one'); assert.equal(typeof calls[1][1].request.operationId, 'string')
  assert.match(JSON.stringify(tree), /已删除所选对象的源旧历史.*保留当前/)
  assert.match(JSON.stringify(tree), /未删除原生会话.*未执行 Git/)
  assert.equal(refreshes, 1)
})

test('mounted source cleanup maps only authenticated source row identities to one records or windows target', async t => {
  const cases = [
    { kind: 'workflow', sourceDomain: 'instruments', recordId: 'workflow-one', domain: 'records', expectedRevision: 23, target: { kind: 'workflow', workflowId: 'workflow-one' } },
    { kind: 'ticket', sourceDomain: 'instruments', recordId: '["wf","local"]', domain: 'records', expectedRevision: 23, target: { kind: 'ticket', workflowId: 'wf', localTicketId: 'local' } },
    { kind: 'decision', sourceDomain: 'instruments', recordId: '["wf","choice"]', domain: 'records', expectedRevision: 23, target: { kind: 'decision', workflowId: 'wf', decisionId: 'choice' } },
    { kind: 'ticket-window', sourceDomain: 'windows', recordId: '["wf","local"]', domain: 'windows', expectedRevision: 29, target: { kind: 'ticket', workflowId: 'wf', localTicketId: 'local' } },
    { kind: 'execution', sourceDomain: 'windows', recordId: '["execution-one",4]', domain: 'windows', expectedRevision: 29, target: { kind: 'execution', executionId: 'execution-one' } },
    { kind: 'runtime-knowledge', sourceDomain: 'windows', recordId: 'i-one', domain: 'windows', expectedRevision: 29, target: { kind: 'knowledge' } },
  ]
  const fixture = contextFixture(); const calls = []; let current
  fixture.ctx.remote.mattpocockControls.historyAction = async (_id, request) => {
    calls.push(clone(request))
    if (request.action === 'query') return ok(historyPage([historyRow('h:1', current.kind, { sourceDomain: current.sourceDomain, recordId: current.recordId, version: 7 })],
      { revision: 99, sourceRevisions: { records: 23, windows: 29, worktrees: 31 } }))
    return ok({ scope: 'selected-source-history-only', domain: current.domain, sourceRecordsDeleted: true, derivedHistoryDeleted: true, nativeConversationDeleted: false, appliedRevision: 40, replayed: false })
  }
  await client.apply(fixture.ctx); t.after(() => { for (const effect of fixture.effects.reverse()) effect?.() })
  const mounted = hookFixture(); t.after(() => mounted.unmount())
  const props = { sessionId: 'owner-one', instance, remote: fixture.ctx.remote.mattpocockControls, refresh: async () => {} }
  let tree = mounted.render(client.HistoryPanel, props); mounted.mountEffects()
  for (const entry of cases) {
    current = entry; button(tree, '查询历史').props.onClick(); await settle(); tree = mounted.render(client.HistoryPanel, props)
    const action = button(tree, '删除此对象截至本版本的源旧历史（保当前）')
    assert(action, entry.kind + ' exposes its exact single-object target'); assert.equal(action.props.disabled, false)
    action.props.onClick(); await settle(); tree = mounted.render(client.HistoryPanel, props)
    const request = calls.at(-1)
    assert.deepEqual({ ...request, request: { ...request.request, operationId: 'generated' } }, { action: 'purge-source', domain: entry.domain,
      request: { operationId: 'generated', expectedRevision: entry.expectedRevision, throughRevision: 7, targets: [entry.target] } })
    assert.match(JSON.stringify(tree), /已删除所选对象的源旧历史/)
  }
  assert.equal(new Set(calls.filter(request => request.action === 'purge-source').map(request => request.request.operationId)).size, 6)
})

test('source cleanup partial or uncertain receipts remain unknown and expose the operation identity instead of counterfeit success', async t => {
  const fixture = contextFixture(); const writes = []; let refreshes = 0
  const partials = [
    { phase: 'partial', derivedHistoryDeleted: true, sourceRecordsDeleted: false, sourceOutcome: 'failed-or-uncertain', nativeConversationDeleted: false, error: 'source CAS failed' },
    { scope: 'selected-source-history-only', domain: 'worktrees', sourceRecordsDeleted: true, derivedHistoryDeleted: true, nativeConversationDeleted: false, revision: 19, replayed: false, receiptRecording: 'failed-or-uncertain', error: 'receipt write failed' },
  ]
  fixture.ctx.remote.mattpocockControls.historyAction = async (_id, request) => {
    if (request.action === 'query') return ok(historyPage([historyRow('h:1', 'worktree', { version: 7 })], { sourceRevisions: { worktrees: 18 } }))
    writes.push(clone(request)); return ok(partials.shift())
  }
  await client.apply(fixture.ctx); t.after(() => { for (const effect of fixture.effects.reverse()) effect?.() })
  const mounted = hookFixture(); t.after(() => mounted.unmount())
  const props = { sessionId: 'owner-one', instance, remote: fixture.ctx.remote.mattpocockControls, refresh: async () => { refreshes++ } }
  let tree = mounted.render(client.HistoryPanel, props); mounted.mountEffects()
  for (let index = 0; index < 2; index++) {
    button(tree, '查询历史').props.onClick(); await settle(); tree = mounted.render(client.HistoryPanel, props)
    button(tree, '删除此对象截至本版本的源旧历史（保当前）').props.onClick(); await settle(); tree = mounted.render(client.HistoryPanel, props)
    assert.match(JSON.stringify(tree), /历史状态未知/)
    assert(!JSON.stringify(tree).includes('已删除所选对象的源旧历史'))
    assert(JSON.stringify(tree).includes(writes[index].request.operationId), 'operator can identify the uncertain request for reconciliation/replay')
  }
  assert.match(JSON.stringify(tree), /回执.*失败.*不确定/)
  assert.equal(refreshes, 0, 'uncertain acknowledgement never pretends to be a completed source cleanup')
})

test('source cleanup is disabled for unknown source CAS or malformed selectors and does not confuse copy deletion with source deletion', async t => {
  const fixture = contextFixture(); let current; let writes = 0
  fixture.ctx.remote.mattpocockControls.historyAction = async (_id, request) => {
    if (request.action !== 'query') { writes++; throw new Error('disabled source action must not dispatch') }
    return ok(historyPage([historyRow('h:1', current.kind ?? 'worktree', current.row ?? {})], current.page ?? {}))
  }
  await client.apply(fixture.ctx); t.after(() => { for (const effect of fixture.effects.reverse()) effect?.() })
  const mounted = hookFixture(); t.after(() => mounted.unmount())
  const props = { sessionId: 'selected-child', instance, remote: fixture.ctx.remote.mattpocockControls, refresh: async () => {} }
  let tree = mounted.render(client.HistoryPanel, props); mounted.mountEffects()
  const cases = [
    { row: { version: 7 } },
    { row: { version: 7 }, page: { sourceRevisions: { worktrees: '18' } } },
    { row: { version: null }, page: { sourceRevisions: { worktrees: 18 } } },
    { row: { version: 19 }, page: { sourceRevisions: { worktrees: 18 } } },
    { kind: 'ticket', row: { sourceDomain: 'instruments', recordId: 'not-a-pair' }, page: { sourceRevisions: { records: 18 } } },
    { kind: 'runtime-knowledge', row: { sourceDomain: 'windows', recordId: 'other-instance' }, page: { sourceRevisions: { windows: 18 } } },
  ]
  for (const entry of cases) {
    current = entry; button(tree, '查询历史').props.onClick(); await settle(); tree = mounted.render(client.HistoryPanel, props)
    const action = button(tree, '删除此对象截至本版本的源旧历史（保当前）')
    assert.equal(action.props.disabled, true); action.props.onClick(); await settle()
    assert.match(JSON.stringify(tree), /未知|超出.*修订/)
    assert(!JSON.stringify(tree).includes('源修订 0'))
    assert(button(tree, '永久删除此条历史副本'), 'derived-copy action remains a separate operation')
  }
  current = { kind: 'configuration', row: { sourceDomain: 'controls', recordId: 'workspace-one' }, page: { sourceRevisions: { records: 18, windows: 18, worktrees: 18 } } }
  button(tree, '查询历史').props.onClick(); await settle(); tree = mounted.render(client.HistoryPanel, props)
  assert(!button(tree, '删除此对象截至本版本的源旧历史（保当前）'))
  assert(button(tree, '永久删除此条历史副本'))
  current = { row: { purged: true, source: null }, page: { sourceRevisions: { worktrees: 18 } } }
  button(tree, '查询历史').props.onClick(); await settle(); tree = mounted.render(client.HistoryPanel, props)
  assert.equal(button(tree, '永久删除此条历史副本').props.disabled, true)
  assert.equal(button(tree, '删除此对象截至本版本的源旧历史（保当前）').props.disabled, false, 'purged derived copy does not prove source history was purged')
  assert.equal(writes, 0)
})

test('late source cleanup acknowledgement is cancelled and fenced when the selected Session changes', async t => {
  const fixture = contextFixture(); let resolveWrite; let pendingSignal; let refreshes = 0; const calls = []
  fixture.ctx.remote.mattpocockControls.historyAction = async (id, request, signal) => {
    calls.push([id, clone(request)])
    if (request.action === 'query') return ok(historyPage([historyRow('h:1')], { sourceRevisions: { worktrees: 18 } }))
    pendingSignal = signal; return new Promise(resolve => { resolveWrite = resolve })
  }
  await client.apply(fixture.ctx); t.after(() => { for (const effect of fixture.effects.reverse()) effect?.() })
  const mounted = hookFixture(); t.after(() => mounted.unmount())
  let props = { sessionId: 'owner-one', instance, remote: fixture.ctx.remote.mattpocockControls, refresh: async () => { refreshes++ } }
  let tree = mounted.render(client.HistoryPanel, props); mounted.mountEffects()
  button(tree, '查询历史').props.onClick(); await settle(); tree = mounted.render(client.HistoryPanel, props)
  button(tree, '删除此对象截至本版本的源旧历史（保当前）').props.onClick()
  props = { ...props, sessionId: 'selected-child' }
  tree = mounted.render(client.HistoryPanel, props); mounted.mountEffects()
  assert.equal(pendingSignal.aborted, true)
  resolveWrite(ok({ scope: 'selected-source-history-only', domain: 'worktrees', sourceRecordsDeleted: true, derivedHistoryDeleted: true, nativeConversationDeleted: false, revision: 19, replayed: false })); await settle()
  tree = mounted.render(client.HistoryPanel, props)
  assert(!JSON.stringify(tree).includes('已删除所选对象的源旧历史')); assert.equal(refreshes, 0)
  button(tree, '查询历史').props.onClick(); await settle(); tree = mounted.render(client.HistoryPanel, props)
  assert.equal(calls.at(-1)[0], 'selected-child', 'UI preserves selected Session; it cannot forge owner identity to bypass source ACL')
})

test('settings identity guard never adopts an unrelated observer or changes its caller', () => {
  let reads = 0
  const observer = new client.SessionObserver('A', async () => { reads++; return ok(snapshot('A')) }, 0)
  const rendered = client.SettingsInspection({ sessionId: 'B', observer })
  assert.match(JSON.stringify(rendered), /归属不一致/)
  assert.equal(reads, 0)
  observer.dispose()
})

test('resource domain failure is unknown rather than zero, while cold physical facts preserve metadata count', async () => {
  const failed = snapshot('A', { resources: [], health: [{ scope: 'resources', status: 'unknown', reason: 'storage-uncertain: root read failed' }] })
  const original = clone(failed)
  const summary = client.resourceSummary(failed)
  assert.equal(summary.count, null)
  assert.match(summary.label, /资源未知/)
  assert.match(client.compactInstrumentSummary(failed).detail, /root read failed/)
  assert(!client.compactInstrumentSummary(failed).parts.some(part => part.includes('资源 0')))
  const observer = new client.SessionObserver('A', async () => ok(failed), 0)
  const release = observer.retain(); await settle()
  const header = client.HeaderEntry({ observer, openDetails: () => {} })
  assert.match(JSON.stringify(header), /资源未知/)
  assert(!JSON.stringify(header).includes('资源 0'))
  const details = client.Details({ observer, sessionId: 'A', remote: {}, openDetails: () => {}, useTabInfo: () => ({ tab: { visible: true } }) })
  const settings = client.ObservedSettingsInspection({ observer, sessionId: 'A' })
  for (const rendered of [details, settings]) {
    const block = treeRows(rendered).find(row => row.props?.['aria-label'] === '资源读取未知')
    assert(block)
    assert.match(JSON.stringify(block), /root read failed/)
    assert(!treeRows(block).some(row => row.type === 'pre' && row.props.children.includes('[]')))
  }
  assert.deepEqual(clone(failed), original, 'display correction does not change actual data or health')
  const empty = snapshot('A', { resources: [], health: [] })
  assert.equal(client.resourceSummary(empty).count, 0)
  assert.equal(client.resourceSummary(empty).label, '资源 0')
  assert.match(JSON.stringify(client.ResourceProjection({ view: empty })), /资源 0/)
  const cold = snapshot('A', { resources: [{ resourceId: 'r-one', status: 'retained', actualCanRetire: { allowed: false, facts: null, reasons: ['physical-inspection-unknown'] } }],
    health: [{ scope: 'resource:r-one', status: 'unknown', reason: 'physical-inspection-unknown' }] })
  assert.equal(client.resourceSummary(cold).count, 1)
  assert.equal(client.resourceSummary(cold).label, '资源 1')
  const coldProjection = JSON.stringify(client.ResourceProjection({ view: cold }))
  assert.match(coldProjection, /资源 1/); assert.match(coldProjection, /physical-inspection-unknown/)
  release(); observer.dispose()
})
