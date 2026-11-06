import test from 'node:test'
import assert from 'node:assert/strict'
import vm from 'node:vm'
import path from 'node:path'
import ts from 'typescript'
import * as React from 'react'
import { Window } from 'happy-dom'
import { buildClient } from '../scripts/build-client.mjs'

// A separate closed entry exercises the real module without editing/re-exporting client.ts.
// All browser ports are fakes: no real audio, permission requests, notifications or live GUI.
const built = await buildClient({ entry: 'src/client-notifications.ts' })
let registration
vm.runInThisContext('(function(window){' + built.code + '\n})')({ __ModuleLoader__: { load: value => { registration = value } } })
const h = React.createElement
const primitives = {
  Button: ({ variant, size, ...props }) => h('button', props),
  Input: props => h('input', props),
  Checkbox: ({ label, checked, onChange }) => h('label', null, label, h('input', { type: 'checkbox', 'aria-label': label, checked, onChange: e => onChange(e.target.checked) })),
}
const n = registration.factory(name => { if (name === 'react') return React; if (name === '@deepseek-ai/dsh-client-ui-primitives') return primitives; throw new Error('Unexpected runtime import ' + name) })
const defaults = n.DEFAULT_BROWSER_NOTIFICATION_PREFERENCES
const copy = value => structuredClone(value)
const author = { kind: 'user', principalId: 'user:test', sessionId: null }
function snapshot() {
  const instance = { instrumentInstanceId: 'instance', ownerSessionId: 'owner', controlWorkspaceId: 'workspace' }
  return { sessionId: 'session', instance, caller: author, policyGrants: { schemaVersion: 1, revision: 0, grants: [] },
    policy: { display: { header: false, inputSummary: false, rightPanel: false, sessionList: false, timeline: false } },
    records: { instance, scope: { kind: 'coordinator' }, revision: 0, businessRevision: 0, viewerRevision: 0, decisions: [], changes: [], summary: {} } }
}
function put(view, id, patch = {}, workflowId = 'workflow') {
  const next = copy(view), r = next.records, index = r.decisions.findIndex(row => row.decisionId === id && row.workflowId === workflowId), old = r.decisions[index]
  const value = { question: 'PRIVATE QUESTION ' + id, status: 'open', pending: true, addressee: { kind: 'user' }, ...old?.value, ...patch }
  const revision = ++r.revision; r.businessRevision++
  const history = [...old?.history ?? [], { revision, value, author, recordedAt: revision, references: [] }]
  const row = { workflowId, decisionId: id, value, revision, history, creator: author, view: { read: false, hidden: false } }
  if (index < 0) r.decisions.push(row); else r.decisions[index] = row
  r.changes.push({ revision, author, recordedAt: revision, command: { action: 'put-decision', workflowId, decisionId: id, value } })
  return next
}
function viewer(view) { const next = copy(view); const revision = ++next.records.revision; next.records.viewerRevision++; next.records.changes.push({ revision, command: { action: 'set-decision-view' } }); return next }
function fakePorts(extra = {}, data = new Map()) {
  let now = 100000, nextTimer = 0, storageListeners = new Set()
  const timers = new Map(), sounds = [], notices = [], calls = { permissions: 0, storageStarts: 0, storageStops: 0 }
  const capabilities = { secure: true, audio: true, desktop: 'default', hidden: false }
  const ports = {
    storage: { getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, value) },
    onStorage: listener => { calls.storageStarts++; storageListeners.add(listener); return () => { calls.storageStops++; storageListeners.delete(listener) } },
    capabilities: () => ({ ...capabilities }), now: () => now,
    later: (callback, milliseconds) => { const id = ++nextTimer; timers.set(id, { callback, milliseconds }); return id }, cancel: id => timers.delete(id),
    createSound: () => { const sound = { stopped: 0, started: [], state: () => 'running', start: async (...args) => { sound.started.push(args) }, stop: () => { sound.stopped++ } }; sounds.push(sound); return sound },
    requestDesktopPermission: async () => { calls.permissions++; capabilities.desktop = 'granted'; return 'granted' },
    showDesktop: (title, body, onClick) => { const notice = { title, body, onClick, closed: 0, close: () => { notice.closed++ } }; notices.push(notice); return notice }, ...extra,
  }
  return { ports, sounds, notices, timers, data, capabilities, calls, storageEvent: () => { for (const listener of storageListeners) listener() },
    advance: ms => { now += ms; for (const [id, timer] of [...timers]) { if (timer.milliseconds <= ms) { timers.delete(id); timer.callback() } } } }
}
function episode(id = 'decision', revision = 1) { return { id: JSON.stringify(['scope', id, revision]), scope: 'scope', workflowId: 'workflow', decisionId: id, entryRevision: revision, pendingCount: 1 } }

test('closed graph has only verified native primitives/react and no runtime circular import', () => {
  assert.deepEqual(built.modules, ['src/client-notifications.ts'])
  assert.deepEqual(built.externals, ['@deepseek-ai/dsh-client-ui-primitives', 'react'])
  assert(!built.code.includes('node:'))
})
test('private browser module passes strict actual public primitive types without emitting', () => {
  const read = ts.readConfigFile('tsconfig.client.json', ts.sys.readFile), config = ts.parseJsonConfigFileContent(read.config, ts.sys, process.cwd())
  const program = ts.createProgram([...config.fileNames, path.resolve('src/client-notifications.ts')], config.options)
  const errors = ts.getPreEmitDiagnostics(program).filter(row => row.category === ts.DiagnosticCategory.Error)
  assert.equal(errors.length, 0, ts.formatDiagnostics(errors, { getCanonicalFileName: x => x, getCurrentDirectory: () => process.cwd(), getNewLine: () => '\n' }))
})
test('safe defaults and exact integer preference boundaries', () => {
  assert.deepEqual(defaults, { sound: false, soundSeconds: 5, volume: 50, toast: true, toastSeconds: 8, desktop: false })
  for (const soundSeconds of [1, 60]) for (const volume of [0, 100]) for (const toastSeconds of [0, 60]) assert.doesNotThrow(() => n.parseBrowserNotificationPreferences({ ...defaults, soundSeconds, volume, toastSeconds }))
  for (const invalid of [{ soundSeconds: 0 }, { soundSeconds: 61 }, { soundSeconds: 3.5 }, { volume: -1 }, { volume: 101 }, { toastSeconds: -1 }, { toastSeconds: 61 }, { extra: true }, { desktop: 'true' }]) assert.throws(() => n.parseBrowserNotificationPreferences({ ...defaults, ...invalid }))
})
test('first encounter only baselines backlog; pending-user predicate is strict', () => {
  const tracker = new n.DecisionEpisodeTracker()
  let view = put(snapshot(), 'backlog'); view = put(view, 'agent', { addressee: { kind: 'agent' } }); view = put(view, 'unspecified', { addressee: undefined }); view = put(view, 'done', { pending: false, awaitingImplementation: true })
  const result = tracker.update(view); assert.equal(result.pendingCount, 1); assert.deepEqual(result.episodes, []); assert.match(result.diagnostic, /积压/)
  assert.deepEqual(tracker.update(copy(view)).episodes, [])
})
test('same count replacement emits identity of the new row, not count delta', () => {
  const tracker = new n.DecisionEpisodeTracker(); let view = put(snapshot(), 'old'); tracker.update(view)
  view = put(put(view, 'old', { pending: false }), 'new')
  const result = tracker.update(view); assert.equal(result.pendingCount, 1); assert.deepEqual(result.episodes.map(e => [e.decisionId, e.entryRevision]), [['new', 3]])
  assert.deepEqual(tracker.update(copy(view)).episodes, [])
})
test('entry revision survives text, viewer read-hidden and unrelated updates without resounding', () => {
  const tracker = new n.DecisionEpisodeTracker(); let view = snapshot(); tracker.update(view)
  view = put(view, 'one'); const [first] = tracker.update(view).episodes
  view = put(view, 'one', { question: 'Edited text' }); assert.deepEqual(tracker.update(view).episodes, []); assert(tracker.isCurrent(first))
  view = viewer(view); view.records.decisions[0].view = { read: true, hidden: true }; assert.deepEqual(tracker.update(view).episodes, []); assert(tracker.isCurrent(first))
})
test('viewer document revisions interleaved with real close/reopen use source revision domain', () => {
  const tracker = new n.DecisionEpisodeTracker(); let view = put(snapshot(), 'one'); tracker.update(view)
  for (let i = 0; i < 10; i++) view = viewer(view)
  tracker.update(view); assert.equal(view.records.revision, 11); assert.equal(view.records.businessRevision, 1)
  view = put(put(view, 'one', { pending: false }), 'one', { pending: true }); view = put(view, 'one', { question: 'Still same reopened episode' })
  const [reopen] = tracker.update(view).episodes; assert.equal(reopen.entryRevision, 13); assert.equal(view.records.decisions[0].revision, 14)
})
test('multiple unseen transitions fold to the final currently pending episode', () => {
  const tracker = new n.DecisionEpisodeTracker(); let view = snapshot(); tracker.update(view)
  view = put(put(put(view, 'one'), 'one', { pending: false }), 'one', { pending: true }); assert.equal(tracker.update(view).episodes[0].entryRevision, 3)
  view = put(view, 'one', { pending: false }); assert.deepEqual(tracker.update(view).episodes, [])
})
test('unknown recovery does not fabricate empty-set reopen and can catch up proven history', () => {
  const tracker = new n.DecisionEpisodeTracker(); let view = put(snapshot(), 'one'); tracker.update(view)
  assert.equal(tracker.update(null).pendingCount, null); assert.deepEqual(tracker.update(copy(view)).episodes, [])
  tracker.update(null); view = put(put(view, 'one', { pending: false }), 'one', { pending: true }); assert.equal(tracker.update(view).episodes[0].entryRevision, 3)
})
test('purge crossing baseline rebaselines even if first retained version is true', () => {
  const tracker = new n.DecisionEpisodeTracker(); let view = put(snapshot(), 'one'); tracker.update(view)
  view = put(put(view, 'one', { pending: false }), 'one', { pending: true }); view.records.historyCoverage = { checkpointRevision: 2, purged: true }; view.records.decisions[0].history = view.records.decisions[0].history.slice(-1)
  const result = tracker.update(view); assert.deepEqual(result.episodes, []); assert.match(result.diagnostic, /checkpoint/)
  view = put(view, 'one', { question: 'edit after purge' }); assert.deepEqual(tracker.update(view).episodes, [])
  view = put(put(view, 'one', { pending: false }), 'one', { pending: true }); assert.equal(tracker.update(view).episodes[0].entryRevision, 6)
})
test('old purge frontier is compared with document revision, not business counter', () => {
  const tracker = new n.DecisionEpisodeTracker(); let view = put(snapshot(), 'one'); for (let i = 0; i < 9; i++) view = viewer(view); tracker.update(view)
  view.records.historyCoverage = { checkpointRevision: 8, purged: true }; view = put(put(view, 'one', { pending: false }), 'one', { pending: true })
  assert.equal(tracker.update(view).episodes[0].entryRevision, 12)
})
test('purged baseline anchor is not required when the entire purge frontier precedes baseline', () => {
  const tracker = new n.DecisionEpisodeTracker(); let view = put(snapshot(), 'one'); for (let i = 0; i < 9; i++) view = viewer(view); tracker.update(view)
  view = put(put(view, 'one', { pending: false }), 'one', { pending: true }); view.records.historyCoverage = { checkpointRevision: 9, purged: true }; view.records.decisions[0].history = view.records.decisions[0].history.filter(change => change.revision > 9)
  assert.equal(tracker.update(view).episodes[0].entryRevision, 12)
})
test('attempt identities use actual caller/owner-instance, not count, text or monitor Session', () => {
  const a = snapshot(), b = snapshot(); b.sessionId = 'another-mounted-view'; b.policyGrants.revision = 9
  const one = new n.DecisionEpisodeTracker(), two = new n.DecisionEpisodeTracker(); one.update(a); two.update(b)
  const e1 = one.update(put(a, 'one')).episodes[0], e2 = two.update(put(b, 'one')).episodes[0]
  assert.notEqual(e1.scope, e2.scope); assert.equal(e1.id, e2.id)
  const c = snapshot(); c.caller = { ...c.caller, principalId: 'different-caller' }; const three = new n.DecisionEpisodeTracker(); three.update(c)
  assert.notEqual(e1.id, three.update(put(c, 'one')).episodes[0].id)
})

test('missing history and stale revisions are honest, not invented new phases', () => {
  const tracker = new n.DecisionEpisodeTracker(); let view = snapshot(); tracker.update(view)
  view = put(view, 'one'); view.records.decisions[0].history = []
  assert.match(tracker.update(view).diagnostic, /历史不足/)
  const result = tracker.update(snapshot()); assert.deepEqual(result.episodes, []); assert.match(result.diagnostic, /回退/)
})
test('caller, owner instance, grants and assignment scope changes isolate baselines', () => {
  for (const alter of [v => { v.caller = { ...v.caller, principalId: 'other' } }, v => { v.instance.instrumentInstanceId = 'other'; v.records.instance = v.instance }, v => { v.policyGrants.revision++ }, v => { v.records.scope = { kind: 'assigned', workflowId: 'workflow', ticketIds: ['a'] } }]) {
    const tracker = new n.DecisionEpisodeTracker(); const view = snapshot(); tracker.update(view); const next = put(view, 'new'); alter(next)
    assert.deepEqual(tracker.update(next).episodes, [])
  }
})
test('assigned filtered histories rebaseline gaps and never infer first true as creation', () => {
  const tracker = new n.DecisionEpisodeTracker(); let view = snapshot(); view.records.scope = { kind: 'assigned', workflowId: 'workflow', ticketIds: ['a'] }; tracker.update(view)
  view = put(view, 'newly-visible'); assert.deepEqual(tracker.update(view).episodes, [])
  view = put(put(view, 'newly-visible', { pending: false }), 'newly-visible', { pending: true }); assert.equal(tracker.update(view).episodes[0].entryRevision, 3)
  view = put(put(view, 'newly-visible', { pending: false }), 'newly-visible', { pending: true }); view.records.changes = view.records.changes.filter(e => e.revision !== 4)
  const result = tracker.update(view); assert.deepEqual(result.episodes, []); assert.match(result.diagnostic, /授权历史/)
})
test('preference read/write corruption and quota failures are diagnosed without fake success', () => {
  const f = fakePorts(); f.data.set(n.NOTIFICATION_PREFS_KEY, '{bad'); const center = new n.BrowserNotificationCenter(f.ports)
  assert.deepEqual(center.getSnapshot().preferences, defaults); assert.match(center.getSnapshot().storage, /损坏/)
  assert(center.save({ ...defaults, sound: true })); assert.equal(JSON.parse(f.data.get(n.NOTIFICATION_PREFS_KEY)).sound, true)
  const broken = new n.BrowserNotificationCenter({ ...f.ports, storage: { getItem: () => { throw Error() }, setItem: () => { throw Error() } } })
  assert.equal(broken.save({ ...defaults, volume: 0 }), false); assert.match(broken.getSnapshot().storage, /保存失败/)
})
test('storage listener follows subscriber lifecycle and cross-tab preferences', () => {
  const f = fakePorts(), center = new n.BrowserNotificationCenter(f.ports); let changed = 0
  const off = center.subscribe(() => changed++); f.data.set(n.NOTIFICATION_PREFS_KEY, JSON.stringify({ ...defaults, volume: 1 })); f.storageEvent()
  assert.equal(center.getSnapshot().preferences.volume, 1); assert.equal(changed, 1); off(); assert.equal(f.calls.storageStarts, 1); assert.equal(f.calls.storageStops, 1)
})
test('Web Locks serialize two tab claims with shared bounded ledger and real identity separation', async () => {
  const data = new Map(); let chain = Promise.resolve(), locks = 0
  const withLock = (_name, operation) => { locks++; const result = chain.then(operation); chain = result.then(() => {}); return result }
  const a = new n.BrowserNotificationCenter(fakePorts({ withLock }, data).ports), b = new n.BrowserNotificationCenter(fakePorts({ withLock }, data).ports)
  assert.deepEqual(await Promise.all([a.claim('caller-instance-row-entry', () => true), b.claim('caller-instance-row-entry', () => true)]), [true, false]); assert.equal(locks, 2)
  assert(await b.claim('another-caller-instance-row-entry', () => true))
  for (let i = 0; i < 300; i++) await a.claim('identity-' + i, () => true)
  assert.equal(JSON.parse(data.get(n.NOTIFICATION_LEDGER_KEY)).length, 256)
  assert(!data.get(n.NOTIFICATION_LEDGER_KEY).includes('PRIVATE QUESTION'))
})
test('no locks, lock failure, denied/corrupt storage and TTL advertise best effort', async () => {
  const f = fakePorts(), center = new n.BrowserNotificationCenter(f.ports); assert.match(center.getSnapshot().coordination, /best-effort/)
  f.data.set(n.NOTIFICATION_LEDGER_KEY, '{broken'); assert(await center.claim('one', () => true)); assert.match(center.getSnapshot().coordination, /损坏/)
  assert.equal(await center.claim('one', () => true), false); f.advance(24 * 60 * 60 * 1000 + 1); assert(await center.claim('one', () => true))
  const broken = new n.BrowserNotificationCenter({ ...f.ports, withLock: async () => { throw Error() }, storage: undefined }); assert(await broken.claim('x', () => true)); assert.match(broken.getSnapshot().coordination, /best-effort/)
})
test('queued lock rechecks current authorization before claiming or performing effects', async () => {
  let release; const barrier = new Promise(resolve => { release = resolve }); const f = fakePorts({ withLock: async (_name, op) => { await barrier; return op() } })
  const center = new n.BrowserNotificationCenter(f.ports); center.save({ ...defaults, sound: true }); const delivery = new n.MountedNotificationDelivery(center)
  let current = true; const pending = delivery.deliver(episode(), () => current, () => assert.fail()); current = false; release()
  assert.equal(await pending, false); assert.equal(f.sounds.length, 0); assert.equal(f.data.has(n.NOTIFICATION_LEDGER_KEY), false); delivery.dispose()
})
test('sound duration/volume, preview while off, explicit stop, bounded timeout and unmount', async () => {
  const f = fakePorts(), center = new n.BrowserNotificationCenter(f.ports), delivery = new n.MountedNotificationDelivery(center)
  delivery.preview({ ...defaults, soundSeconds: 30, volume: 0 }); assert.deepEqual(f.sounds[0].started, [[30, 0]]); assert.equal([...f.timers.values()][0].milliseconds, 30000)
  delivery.stopSound(); assert.equal(f.sounds[0].stopped, 1); assert.equal(f.timers.size, 0)
  delivery.preview(); f.advance(5000); assert.equal(f.sounds[1].stopped, 1)
  delivery.preview(); delivery.dispose(); assert.equal(f.sounds[2].stopped, 1); assert.equal(f.timers.size, 0)
  delivery.preview(); assert.equal(f.sounds.length, 3)
})
test('suspended/rejected audio is diagnosed and late audio promises cannot revive disposal', async () => {
  let reject; const f = fakePorts({ createSound: () => ({ state: () => 'suspended', start: () => new Promise((_resolve, fail) => { reject = fail }), stop: () => {} }) })
  const center = new n.BrowserNotificationCenter(f.ports), delivery = new n.MountedNotificationDelivery(center); delivery.preview(); assert.match(center.getSnapshot().delivery, /挂起/)
  delivery.dispose(); reject(Error()); await Promise.resolve(); assert.equal(f.timers.size, 0)
})
test('desktop asks permission only explicitly and sends generic body, shared identity, guarded click', async () => {
  const f = fakePorts(), center = new n.BrowserNotificationCenter(f.ports); center.save({ ...defaults, desktop: true, sound: true })
  const delivery = new n.MountedNotificationDelivery(center); let current = true, opened = 0
  await delivery.deliver(episode('no-permission'), () => current, () => opened++); assert.equal(f.calls.permissions, 0); assert.equal(f.notices.length, 0)
  await center.requestDesktopPermission(); assert.equal(f.calls.permissions, 1)
  assert(await delivery.deliver(episode(), () => current, () => opened++)); assert.equal(f.notices.length, 1); assert.match(f.notices[0].body, /1 项/); assert(!f.notices[0].body.includes('PRIVATE'))
  f.notices[0].onClick(); assert.equal(opened, 1); current = false; f.notices[0].onClick(); assert.equal(opened, 1); delivery.reconcile(); assert.equal(f.notices[0].closed, 1)
  assert.equal(await delivery.deliver(episode(), () => true, () => {}), false); assert.equal(f.sounds.length, 2); delivery.dispose()
})
test('insecure and unsupported desktop never prompt or claim actual delivery', async () => {
  const f = fakePorts(); f.capabilities.secure = false; const center = new n.BrowserNotificationCenter(f.ports); await center.requestDesktopPermission(); assert.equal(f.calls.permissions, 0); assert.match(center.getSnapshot().delivery, /安全环境/)
})

test('summary-only and mismatched snapshot identities remain unknown, never zero or creation', () => {
  const tracker = new n.DecisionEpisodeTracker(); tracker.update(snapshot())
  const summary = snapshot(); delete summary.records.decisions; summary.records.summary = { pendingUserDecisionCount: 12 }
  assert.equal(tracker.update(summary).pendingCount, null)
  const wrong = put(snapshot(), 'hidden'); wrong.records.instance = { ...wrong.instance, instrumentInstanceId: 'other' }; assert.equal(tracker.update(wrong).pendingCount, null)
  const malformed = put(snapshot(), 'hidden'); malformed.records.decisions[0].history = null; assert.equal(tracker.update(malformed).pendingCount, null)
})
test('featureless browser embedding reports unsupported capabilities instead of throwing', () => {
  const ports = n.createBrowserNotificationPorts()
  assert.deepEqual(ports.capabilities(), { secure: false, audio: false, desktop: 'unsupported', hidden: false })
  assert.equal(ports.onStorage, undefined)
})

test('native browser adapter only touches fake audio/Notification and preserves scheduled stop semantics', async () => {
  const contexts = [], osNotices = [], data = new Map(), storageEvents = new Set(); let permissions = 0, locked = 0
  class AudioContext {
    constructor() { this.state = 'suspended'; this.currentTime = 100; this.destination = {}; this.stops = []; contexts.push(this) }
    createOscillator() { const node = { frequency: {}, connect() {}, disconnect() {}, start: () => { this.started = true }, stop: at => this.stops.push(at) }; return node }
    createGain() { return this.gain = { gain: {}, connect() {}, disconnect() {} } }
    async resume() { this.state = 'running' }
    async close() { this.state = 'closed' }
  }
  class Notification {
    static permission = 'default'
    static async requestPermission() { permissions++; Notification.permission = 'granted'; return 'granted' }
    constructor(title, options) { this.title = title; this.options = options; osNotices.push(this) }
    close() { this.closed = true }
  }
  let entry
  const window = { isSecureContext: true, AudioContext, Notification, document: { visibilityState: 'hidden' },
    localStorage: { getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, value) },
    navigator: { locks: { request: async (_name, operation) => { locked++; return operation() } } },
    addEventListener: (_event, callback) => storageEvents.add(callback), removeEventListener: (_event, callback) => storageEvents.delete(callback),
    __ModuleLoader__: { load: registration => { entry = registration } } }
  vm.runInThisContext('(function(window){' + built.code + '\n})')(window)
  const module = entry.factory(name => name === 'react' ? React : primitives), ports = module.createBrowserNotificationPorts()
  assert.deepEqual(ports.capabilities(), { secure: true, audio: true, desktop: 'default', hidden: true })
  assert.equal(permissions, 0); const sound = ports.createSound(); await sound.start(3, 100)
  assert.equal(contexts[0].started, true); assert.equal(contexts[0].stops[0], 103); assert.equal(contexts[0].gain.gain.value, 0.12)
  sound.stop(); sound.stop(); assert.equal(contexts[0].state, 'closed'); assert.equal(contexts[0].stops.length, 2)
  await ports.requestDesktopPermission(); assert.equal(permissions, 1); assert(await ports.withLock('x', async () => true)); assert.equal(locked, 1)
  const notice = ports.showDesktop('generic', 'count only', () => {}); assert.equal(osNotices[0].options.body, 'count only'); notice.close(); assert.equal(osNotices[0].onclick, null)
  const off = ports.onStorage(() => {}); assert.equal(storageEvents.size, 1); off(); assert.equal(storageEvents.size, 0)
})
test('stop-all controls current notifications and preview without changing preferences', () => {
  const f = fakePorts(), center = new n.BrowserNotificationCenter(f.ports), one = new n.MountedNotificationDelivery(center), two = new n.MountedNotificationDelivery(center)
  one.preview(); two.preview(); center.stopAllSounds(); assert.deepEqual(f.sounds.map(sound => sound.stopped), [1, 1]); assert.deepEqual(center.getSnapshot().preferences, defaults)
  one.dispose(); two.dispose(); assert.equal(f.timers.size, 0)
})

async function mount(t, Component, props, strict = false) {
  const window = new Window({ url: 'http://localhost/', settings: { disableCSSFileLoading: true, disableJavaScriptFileLoading: true } })
  const globals = { window, document: window.document, navigator: window.navigator, HTMLElement: window.HTMLElement, HTMLInputElement: window.HTMLInputElement, Node: window.Node, Event: window.Event, MouseEvent: window.MouseEvent, IS_REACT_ACT_ENVIRONMENT: true }
  const previous = new Map(Object.keys(globals).map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]))
  for (const [key, value] of Object.entries(globals)) Object.defineProperty(globalThis, key, { configurable: true, writable: true, value })
  const { createRoot } = await import('react-dom/client'), container = window.document.createElement('div'); window.document.body.append(container); const root = createRoot(container)
  const warnings = [], oldError = console.error; console.error = (...args) => warnings.push(args.map(String).join(' '))
  const render = async next => React.act(async () => root.render(strict ? h(React.StrictMode, null, h(Component, next)) : h(Component, next)))
  const unmount = async () => React.act(async () => root.unmount())
  t.after(async () => { try { await unmount(); await window.happyDOM.close() } finally { console.error = oldError; for (const [key, d] of previous) { if (d) Object.defineProperty(globalThis, key, d); else delete globalThis[key] } } assert.deepEqual(warnings, []) })
  await render(props); return { container, root, window, render, unmount }
}
function observerFixture(initial = snapshot()) {
  let state = { status: 'ready', value: initial, error: null }, held = 0, released = 0; const listeners = new Set()
  const observer = { sessionId: initial.sessionId, getSnapshot: () => state, getDisplay: () => state.value?.policy.display, retain: () => { held++; return () => { released++ } }, subscribe: listener => { listeners.add(listener); return () => listeners.delete(listener) }, refresh: async () => {} }
  return { observer, counts: () => ({ held, released }), emit: async view => { await React.act(async () => { state = view ? { status: 'ready', value: view, error: null } : { status: 'unknown', value: null, error: 'read failed' }; for (const listener of listeners) listener() }) } }
}
const named = (container, name) => { const node = container.querySelector('[aria-label="' + name + '"]'); assert(node, 'missing ' + name); return node }
const button = (container, text) => { const node = [...container.querySelectorAll('button')].find(node => node.textContent === text); assert(node, 'missing button ' + text); return node }
const click = async node => React.act(async () => node.click())

test('real React notification mount retains/reuses provided observer independently of all display switches', async t => {
  const f = fakePorts(), center = new n.BrowserNotificationCenter(f.ports), o = observerFixture(); const opened = []
  const { container, unmount } = await mount(t, n.DecisionNotifications, { sessionId: 'session', observer: o.observer, center, onOpenDecision: (...args) => opened.push(args) })
  assert.deepEqual(o.counts(), { held: 1, released: 0 }); assert.equal(container.querySelectorAll('[aria-label="新待用户裁决"]').length, 0)
  await o.emit(put(snapshot(), 'new')); assert.equal(container.querySelectorAll('[aria-label="新待用户裁决"]').length, 1)
  await click(button(container, '打开裁决详情')); assert.deepEqual(opened, [['workflow', 'new']]); assert.equal(f.sounds.length, 0); assert.equal(f.notices.length, 0)
  await unmount(); assert.deepEqual(o.counts(), { held: 1, released: 1 }); assert.equal(f.timers.size, 0); assert.equal(f.calls.storageStarts, f.calls.storageStops)
})
test('toast auto-dismiss does not close opened persistent details or mark business/read/hidden', async t => {
  const f = fakePorts(), center = new n.BrowserNotificationCenter(f.ports), o = observerFixture(); let detail = null
  function Host() { const [open, setOpen] = React.useState(null); return h('div', null, h(n.DecisionNotifications, { sessionId: 'session', observer: o.observer, center, onOpenDecision: (_w, id) => { detail = id; setOpen(id) } }), open && h('section', { 'aria-label': 'persistent detail' }, open)) }
  const { container } = await mount(t, Host, {}); const view = put(snapshot(), 'new'), original = copy(view)
  await o.emit(view); await click(button(container, '打开裁决详情')); await React.act(async () => f.advance(8000))
  assert.equal(container.querySelectorAll('[aria-label="新待用户裁决"]').length, 0); assert.equal(named(container, 'persistent detail').textContent, 'new'); assert.equal(detail, 'new'); assert.deepEqual(view, original)
})
test('manual toast, text/viewer refresh, unknown and authorization changes preserve or clear correct effects', async t => {
  const f = fakePorts(), center = new n.BrowserNotificationCenter(f.ports); center.save({ ...defaults, toastSeconds: 0, sound: true, desktop: true }); f.capabilities.desktop = 'granted'
  const o = observerFixture(), { container, unmount } = await mount(t, n.DecisionNotifications, { sessionId: 'session', observer: o.observer, center, onOpenDecision: () => {} })
  let view = put(snapshot(), 'new'); await o.emit(view); assert.equal(f.sounds.length, 1); assert.equal(f.notices.length, 1)
  view = viewer(put(view, 'new', { question: 'Edit' })); await o.emit(view); assert.equal(f.sounds.length, 1); assert.equal(f.sounds[0].stopped, 0); assert.equal(f.notices[0].closed, 0)
  await React.act(async () => f.advance(60000)); assert(named(container, '新待用户裁决'))
  await o.emit(null); assert.equal(container.querySelectorAll('[aria-label="新待用户裁决"]').length, 0); assert.equal(f.notices[0].closed, 1)
  await o.emit(view); assert.equal(f.sounds.length, 1)
  view = put(view, 'another'); view.caller = { ...view.caller, principalId: 'other' }; await o.emit(view); assert.equal(f.sounds.length, 1); assert.equal(container.querySelectorAll('[aria-label="新待用户裁决"]').length, 0)
  await unmount(); assert.equal(f.timers.size, 0)
})
test('StrictMode is leak-free and session switch is a fresh mounted baseline', async t => {
  const f = fakePorts(), center = new n.BrowserNotificationCenter(f.ports), o = observerFixture(); const props = { sessionId: 'session', observer: o.observer, center, onOpenDecision: () => {} }
  const { container, render, unmount } = await mount(t, n.DecisionNotifications, props, true)
  await o.emit(put(snapshot(), 'new')); assert(named(container, '新待用户裁决'))
  const otherView = put(snapshot(), 'backlog'); otherView.sessionId = 'other'; const other = observerFixture(otherView)
  await render({ ...props, sessionId: 'other', observer: other.observer }); assert.equal(container.querySelectorAll('[aria-label="新待用户裁决"]').length, 0)
  await unmount(); assert.equal(o.counts().held, o.counts().released); assert.equal(other.counts().held, other.counts().released); assert.equal(f.timers.size, 0); assert.equal(f.calls.storageStarts, f.calls.storageStops)
})
test('burst toasts/timers stay bounded and unknown immediately cancels their lifetimes', async t => {
  const f = fakePorts(), center = new n.BrowserNotificationCenter(f.ports), o = observerFixture()
  const { container } = await mount(t, n.DecisionNotifications, { sessionId: 'session', observer: o.observer, center, onOpenDecision: () => {} })
  let view = snapshot(); for (let i = 0; i < 20; i++) view = put(view, 'new-' + i)
  await o.emit(view); assert.equal(container.querySelectorAll('[aria-label="新待用户裁决"]').length, 3); assert.equal(f.timers.size, 3)
  await o.emit(null); assert.equal(container.querySelectorAll('[aria-label="新待用户裁决"]').length, 0); assert.equal(f.timers.size, 0)
})
test('unmount while Web Lock is queued prevents late sound/desktop/toast and releases observer', async t => {
  let release; const barrier = new Promise(resolve => { release = resolve }); const f = fakePorts({ withLock: async (_name, op) => { await barrier; return op() } })
  const center = new n.BrowserNotificationCenter(f.ports); center.save({ ...defaults, sound: true, desktop: true }); f.capabilities.desktop = 'granted'; const o = observerFixture()
  const { unmount } = await mount(t, n.DecisionNotifications, { sessionId: 'session', observer: o.observer, center, onOpenDecision: () => assert.fail() })
  await o.emit(put(snapshot(), 'new')); await unmount(); await React.act(async () => release())
  assert.equal(f.sounds.length, 0); assert.equal(f.notices.length, 0); assert.equal(f.timers.size, 0); assert.equal(o.counts().held, o.counts().released)
})

test('real preferences panel requests permission only on button, uses native controls, previews and stops on unload', async t => {
  const f = fakePorts(), center = new n.BrowserNotificationCenter(f.ports), { container, unmount } = await mount(t, n.BrowserNotificationPreferencesPanel, { center }, true)
  assert.equal(named(container, '铃声持续秒数').value, '5'); assert.equal(named(container, '音量百分比').value, '50'); assert.equal(named(container, '桌面通知').checked, false)
  assert.equal(f.calls.permissions, 0); await click(named(container, '桌面通知')); await click(button(container, '保存本浏览器提醒')); assert.equal(f.calls.permissions, 0)
  await click(button(container, '请求桌面通知权限')); assert.equal(f.calls.permissions, 1)
  await click(button(container, '30 秒')); await click(button(container, '试听')); assert.deepEqual(f.sounds[0].started, [[30, 50]])
  await click(button(container, '停止当前铃声')); assert.equal(f.sounds[0].stopped, 1)
  await click(button(container, '试听')); await unmount(); assert.equal(f.sounds[1].stopped, 1); assert.equal(f.timers.size, 0); assert.equal(f.calls.storageStarts, f.calls.storageStops)
})

test('browser preference edits replace stale saved feedback with explicit unsaved draft state', async t => {
  const f = fakePorts(), center = new n.BrowserNotificationCenter(f.ports)
  const { container } = await mount(t, n.BrowserNotificationPreferencesPanel, { center })
  await click(button(container, '30 秒'))
  assert.match(container.querySelector('footer').textContent, /有未保存的提醒更改/)
  assert.equal(center.getSnapshot().preferences.soundSeconds, 5, 'draft is not live preferences')
  await click(button(container, '保存本浏览器提醒'))
  assert.match(container.querySelector('footer').textContent, /本浏览器提醒已独立保存/)
  assert.doesNotMatch(container.querySelector('footer').textContent, /有未保存的提醒更改/)
  await click(button(container, '3 秒'))
  assert.match(container.querySelector('footer').textContent, /有未保存的提醒更改/)
  assert.doesNotMatch(container.querySelector('footer').textContent, /已独立保存/)
  assert.equal(center.getSnapshot().preferences.soundSeconds, 30)
  await click(button(container, '恢复当前提醒设置'))
  assert.equal(named(container, '铃声持续秒数').value, '30')
  assert.doesNotMatch(container.querySelector('footer').textContent, /有未保存的提醒更改/)
})
