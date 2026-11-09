import assert from 'node:assert/strict'
import { cordis, client, load, loadNode, React, window, settle } from './client-navigation-host.mjs'
import { installSidebar } from './client-navigation-sidebar.mjs'
await loadNode('@deepseek-ai/dsh-api-gateway/client')
const controller = await load('@deepseek-ai/dsh-api-session-controller')
const renderer = await load('@deepseek-ai/dsh-client-ui-renderer')
export function snapshot() {
  const instance = { instrumentInstanceId: 'instance', ownerSessionId: 'owner', controlWorkspaceId: 'workspace' }
  return { sessionId: 'owner', instance, caller: { kind: 'user', principalId: 'operator', sessionId: null }, policyGrants: { schemaVersion: 1, revision: 0, grants: [] },
    policy: { configurationRevision: 1, controlWorkspaceId: 'workspace', workspaceVerified: true, extensionEnabled: true, workspaceEnabled: true, features: {}, windows: { ticketWindowSize: null, runningSubagentLimit: null }, display: { header: true, inputSummary: true, rightPanel: true, sessionList: false, timeline: true } },
    records: { instance, businessRevision: 1, viewerRevision: 0, scope: { kind: 'coordinator' }, workflows: [], tickets: [], decisions: [], decisionViews: [], summary: { countingScope: 'instance', totalTickets: 0, statusCounts: [], pendingDecisionCount: 1, pendingUserDecisionCount: 1, awaitingImplementationCount: 0 } },
    windows: { instance, scope: { kind: 'coordinator' }, T: { used: 0, capacity: 8, overage: 0, gap: 8 }, S: { used: 1, capacity: 8, overage: 0, gap: 7, countKnown: true } },
    nativeExecutions: [{ sessionId: 'child', executionId: 'child', parentSessionId: 'owner', activity: 'running', state: 'running', observed: 'subagent/start', lane: null }], health: [], resources: [], capabilities: [] }
}
export async function mount(t, options = {}) {
  const errors = [], originalError = console.error
  console.error = (...args) => { errors.push(args.map(String).join(' ')); originalError(...args) }
  t.after(() => { console.error = originalError })
  const transport = new cordis.Context(), handlers = new Map()
  const untilAbort = signal => signal.aborted ? Promise.resolve() : new Promise(resolve => signal.addEventListener('abort', resolve, { once: true }))
  const remote = { $stream: options => { const abort = new AbortController(); return { signal: abort.signal, restart() {}, async dispose() { abort.abort() },
    async *[Symbol.asyncIterator]() { for await (const value of options.open(abort.signal)) yield { value, generation: 1, signal: abort.signal, accept() {} } } } }, $on(name, callback) { handlers.set(name, callback); return () => handlers.delete(name) },
    session: { async *follow(request, signal) {
      const address = request.address, id = address.kind === 'session' ? address.sessionId : address.childSessionId
      yield { type: 'snapshot', header: { version: 1, id, createdAt: 1, isSeeded: false, ...(address.kind === 'subagent' ? { parentSession: address.parentSessionId, origin: 'subagent' } : {}) }, cursor: -1, records: [], hasMore: false, projections: { asOfSeq: -1, values: {} }, assistantStream: { revision: 0 } }
      await untilAbort(signal)
    } }, subagents: {}, commands: {} }
  await transport.plugin({ name: 'navigation-memory-transport', apply(c) {
    c.provide('connection', { generation: { getSnapshot: () => undefined, subscribe: () => () => {} } }); c.provide('fileUpload', {})
    c.provide('typert', { contexts: { registerClient: () => () => {} } }); c.provide('remote', remote)
    for (const key of ['session', 'subagents', 'commands']) c.provide('remote.' + key, remote[key])
  } })
  await transport.plugin(controller)
  const sessions = transport.get('sessions')
  let sequence = 0
  function added(id, parent, title, catalog) {
    handlers.get('api-session/added')({ sessionId: id, parentSessionId: parent, origin: parent ? 'subagent' : undefined, cwd: '/fixture', updatedAt: ++sequence, running: Boolean(parent), blank: false, formatStatus: 'current',
      projections: { kind: 'sequenced', asOfSeq: sequence, values: { title, ...(catalog ? { subagentCatalog: catalog } : {}) } } })
  }
  added('owner', undefined, 'Owner', [{ id: 'child', mode: 'continuable', label: 'Dispatch label', activity: 'running' }]); added('child', 'owner', 'Actual projected title')
  await settle()
  const nativeSidebar = await installSidebar(transport)
  const ctx = new cordis.Context(), opened = [], fullCalls = [], summaryCalls = []
  let view = options.view ?? snapshot()
  const api = { readPolicy: async () => ({ ok: false, error: new Error('fixture policy unavailable') }), readSession: async id => { fullCalls.push(id); return { ok: true, value: structuredClone(view) } },
    readSummaries: async request => { summaryCalls.push(request); return { ok: true, value: { rows: request.sessions.map(row => ({ sessionId: row.sessionId, status: 'current', version: 'b'.repeat(64), summary: { sessionId: view.sessionId, instance: view.instance, caller: view.caller, policy: { configurationRevision: 1, controlWorkspaceId: 'workspace', workspaceVerified: true, extensionEnabled: true, workspaceEnabled: true, display: view.policy.display }, records: { businessRevision: 1, viewerRevision: 0, summary: { countingScope: 'instance', pendingUserDecisionCount: view.records.summary.pendingUserDecisionCount } }, health: [] } })) } } } }
  await ctx.plugin(renderer)
  const slots = ctx.get('slots')
  slots.installLocale({ getSnapshot: () => 0, subscribe: () => () => {}, bind: () => key => key })
  // Native renderer creates standard selector props from the actual Controller catalog.
  // Only the surrounding Session selection is controlled, not the useSessions hook.
  slots.provideRoot({ hooks: { sessions: sessions.list } })
  const binding = { key: 'owner', ctx, props: { sessionId: 'owner' }, hooks: {}, keyedHooks: {} }
  slots.installScope('session', { current: { getSnapshot: () => binding, subscribe: () => () => {} }, bindingSource: () => ({ getSnapshot: () => binding, subscribe: () => () => {} }), renderArea: (_binding, props) => props.children })
  slots.register({ name: 'root', children: {
    'plugins.bundle.config': { kind: 'keyed', scope: 'root' }, 'plugins.row.config': { kind: 'keyed', scope: 'root' },
    'conversation.session.header.utilities': { kind: 'list', scope: 'session' }, 'conversation.input.dock': { kind: 'list', scope: 'session' },
    'sidebar.right.pane.tab': { kind: 'keyed', scope: 'session' }, 'sidebar.session.row.leading': { kind: 'list', scope: 'root' }, 'tool.call.toolview': { kind: 'keyed', scope: 'session' }
  } }, props => React.createElement(props.SessionProvider, { session: { sessionId: 'owner' } }, props.renderSlot('conversation.input.dock', {})))
  Object.assign(api, options.api)
  if (options.installRemote) await options.installRemote(ctx, api)
  await ctx.plugin({ name: 'navigation-base-ports', apply(c) {
    if (!options.installRemote) { c.provide('remote', { $mount: async () => {}, mattpocockControls: api }); c.provide('remote.mattpocockControls', api) }
    c.provide('sidebarRight', { mounted: nativeSidebar.sidebar.mounted, openResource: (...args) => { opened.push(args); nativeSidebar.sidebar.openResource(...args) }, openTab: () => assert.fail('no main navigation') })
    c.provide('sidebarRightTabs', { register: definition => nativeSidebar.tabs.register(definition) })
  } })
  let provider
  async function provide(value = sessions) { provider = await ctx.plugin({ name: 'navigation-sessions-scope', apply(c) { c.provide('sessions', value) } }); await settle() }
  if (!options.late) await provide()
  await ctx.plugin(client)
  const entry = slots.entriesOfSlot('conversation.input.dock').find(row => row.component === client.InputSummary); assert(entry)
  const face = entry.inject('owner')
  const container = window.document.createElement('div'); window.document.body.append(container)
  const { createRoot } = await import('react-dom/client'); const root = createRoot(container)
  t.after(async () => {
    try { await React.act(async () => root.unmount()); await ctx.fiber.dispose(); await nativeSidebar.dispose(); await transport.fiber.dispose(); container.remove() }
    finally { console.error = originalError }
    assert.deepEqual(errors, [], 'native mounted validation has no React or controller errors')
  })
  const settings = slots.entriesOfSlot('plugins.bundle.config').find(row => row.component === client.SettingsPage)
  await React.act(async () => { root.render(options.settings ? React.createElement(settings.component, { ...settings.inject(), view: 'page' }) : slots.renderSlot('root', {})); await settle() }); await React.act(settle)
  return { ctx, container, face, sessions, nativeSidebar, opened, fullCalls, summaryCalls, added, get view() { return view }, set view(next) { view = next },
    button: title => [...container.querySelectorAll('button')].find(node => node.textContent === title),
    async provide(value) { await React.act(async () => provide(value)) },
    async revoke() { await React.act(async () => { await provider.dispose(); await settle() }) },
    mounted(id) { nativeSidebar.mounted(id) }, async refresh() { await React.act(async () => face.observe().refresh()) },
    async openS() { const button = container.querySelector('[aria-label="查看 S 在跑子代理"]'); assert(button, container.textContent + ' calls=' + JSON.stringify({fullCalls, summaryCalls, full: face.observe().getSnapshot(), summary: face.summary.getSnapshot()})); await React.act(async () => button.click()) }
  }
}
export { client, React, settle }
