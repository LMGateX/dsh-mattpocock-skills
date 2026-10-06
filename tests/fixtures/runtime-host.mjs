import assert from 'node:assert/strict'
import { registerHooks, createRequire } from 'node:module'
import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { join } from 'node:path'
import ts from 'typescript'

// Node 24 source-only loader: no lib/package emission, profile, model or AgentLoop.
const sourceRoot = new URL('../../src/', import.meta.url).href
const sdkRequire = createRequire(process.env.DSH_CONTROLS_HOST_ROOT
  ? pathToFileURL(join(process.env.DSH_CONTROLS_HOST_ROOT, 'package.json'))
  : new URL('../../package.json', import.meta.url))
registerHooks({
  resolve(specifier, context, next) {
    if (context.parentURL?.startsWith(sourceRoot)) {
      if (specifier.startsWith('.') && specifier.endsWith('.js')) {
        const candidate = new URL(specifier.slice(0, -3) + '.ts', context.parentURL)
        if (existsSync(candidate)) return { url: candidate.href, shortCircuit: true }
      }
      if (specifier.startsWith('@deepseek-ai/') || specifier === 'zod')
        return { url: pathToFileURL(sdkRequire.resolve(specifier)).href, shortCircuit: true }
    }
    return next(specifier, context)
  },
  load(url, context, next) {
    if (url.startsWith(sourceRoot) && url.endsWith('.ts')) return {
      format: 'module', shortCircuit: true,
      source: ts.transpileModule(readFileSync(fileURLToPath(url), 'utf8'), {
        fileName: fileURLToPath(url), compilerOptions: {
          target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext, verbatimModuleSyntax: true,
        },
      }).outputText,
    }
    return next(url, context)
  },
})
export const core = {
  ...await import('../../src/controls/index.ts'),
  ...await import('../../src/controls/windows.ts'),
  ...await import('../../src/controls/resources.ts'),
  ...await import('../../src/controls/versioned-storage.ts'),
  ...await import('../../src/controls/remote-contract.ts'),
}
export const host = await import('../../src/host.ts')
export const { createRuntime } = await import('../../src/runtime.ts')
export const loadSDK = name => import(pathToFileURL(sdkRequire.resolve(name)).href)
const load = loadSDK
export const sdk = {
  ...await load('@deepseek-ai/cordis'), ...await load('@deepseek-ai/dsh-storage-domain'),
  ...await load('@deepseek-ai/dsh-tools'), ...await load('@deepseek-ai/dsh-system-prompt'),
  ...await load('@deepseek-ai/dsh-typert-registry'), ...await load('@deepseek-ai/dsh-llm'),
}
export const signal = () => new AbortController().signal
export const operator = Object.freeze({ kind: 'user', principalId: 'user:operator', sessionId: null })
export const caller = sessionId => ({ kind: 'agent', principalId: 'agent:' + sessionId, sessionId })
export function deferred() {
  let resolve, reject
  const promise = new Promise((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}
// These are controlled metadata objects, NOT instantiated SDK Agents or running models.
// Exact object identity is passed to created/observe, never inferred from a returned string.
export function actualAgent(id, { parent, managed = false, cwd = '/fixture' } = {}) {
  const descriptor = { type: 'subagent/descriptor', data: { version: 3, mode: 'continuable', provider: 'spawn', label: 'fixture' } }
  return { id, session: {
    id,
    header: { id, version: 4, createdAt: 0, cwd, isSeeded: false,
      ...(parent ? { parentSession: parent } : {}), ...(managed ? { origin: 'subagent' } : {}) },
    ownEvents: () => managed ? [descriptor] : [],
  } }
}
export const policy = (windows = { enabled: true, ticketWindowSize: 2, runningSubagentLimit: 2 }, more = {}) => ({
  extensionEnabled: true, defaults: {
    ticketProgress: { enabled: true }, pendingDecisions: { enabled: true }, windows, ...more,
  }, workspaceOverrides: {},
})
export const workflow = { title: '任务自定义', axes: [{ axisKey: 'delivery', label: '业务交付', counting: 'exclusive', statuses: [{ statusKey: 'partial', label: '部分' }, { statusKey: 'repair', label: '回访' }] }] }
export const ticket = (status = 'partial', summary = '原样业务报告') => ({ title: '任务票', statuses: { delivery: [status] }, summary })
let serial = 0
export async function fixture(t, { known = false, initialPolicy, consumptionTimeoutMs = 200 } = {}) {
  const agents = new Map()
  for (const a of [actualAgent('root'), actualAgent('other'), actualAgent('fork', { parent: 'root' }),
    actualAgent('old-child', { parent: 'root', managed: true, cwd: '/different-worktree' })]) agents.set(a.id, a)
  const cold = new Map(), observations = [], nativeCalls = [], gitCalls = [], guards = [], notificationCalls = []
  const controlsStorage = new core.MemoryControlsStorage()
  const instrumentStorage = new core.MemoryInstrumentStorage()
  const windowStorage = new core.MemoryWindowStorage()
  const resourceStorage = new core.MemoryResourceStorage()
  const grants = new core.MemoryVersionedStorage(core.parsePolicyGrants)
  const workspace = { id: 'W', path: '/fixture', title: 'fixture', status: async () => 'ok' }
  const ctx = {
    agents: { get: id => agents.get(id), list: () => [...agents.values()] },
    connection: { operator: { id: 'operator' } },
    workspaceRegistry: { get: id => id === 'W' ? workspace : undefined, resolveByPath: async path => path === '/fixture' ? workspace : undefined },
    sessionQuery: { async observeSession(id) {
      observations.push(id); const a = cold.get(id)
      if (!a) throw new core.ControlsError('unknown-session', 'no actual metadata')
      return { header: a.session.header, inheritedEventCount: 1,
        events: [{ type: 'subagent/descriptor', data: { version: 99 } }, ...a.session.ownEvents()],
        [Symbol.dispose]() { observations.push('released:' + id) },
      }
    } },
  }
  let runtime, native = async () => ({ isError: false, value: { note: 'No created/observe proof' } })
  let notify = async () => ({ status: 'offline', messageId: null })
  let runnerFactory = () => { throw new core.ResourceError('access-denied', 'no permitted fake runner installed') }
  const units = new Map()
  /** @type {import('../../src/host.ts').HostPorts} */
  const ports = {
    controlsStorage, instrumentStorage, windowStorage, resourceStorage,
    ...host.createHostAuthority(ctx, controlsStorage, grants), capabilities: host.HOST_CAPABILITIES,
    makeSnapshotMessage: host.makeSnapshotMessage,
    async notifyOwner(notice, control) { control.throwIfAborted(); notificationCalls.push(notice); return notify(notice, control) },
    liveAgent: id => agents.get(id), liveAgents: () => [...agents.values()],
    // Controlled program-port fixture only; real path authorization is exercised by Host tests.
    async authorizeInitialChildCwd(exec,cwd) { exec.signal.throwIfAborted(); if(agents.get(exec.agent.id)!==exec.agent)throw new Error('fixture parent changed'); if(typeof cwd!=='string'||!cwd.startsWith('/'))throw new Error('fixture cwd malformed') },
    async nativeActivity() { return { known, reason: known ? null : 'all-native-activity-enumeration-unsupported', liveAgents: [...agents.values()] } },
    installNativeGuard(guard) { guards.push(guard); return () => { guards.splice(guards.indexOf(guard), 1) } },
    installManagedGuard(guard) { guards.push(guard); return () => { guards.splice(guards.indexOf(guard), 1) } },
    async executeNative(exec, name, args) { nativeCalls.push({ exec, name, args }); return native(exec, name, args) },
    async openRuntimeStorage(parse) { return ports.openUnitStorage('runtime_bindings', parse) },
    async openUnitStorage(name, parse) {
      if (!units.has(name)) units.set(name, new core.MemoryVersionedStorage(parse))
      return units.get(name)
    },
    async readPolicyGrants() { return await grants.read() ?? { schemaVersion: 1, revision: 0, grants: [] } },
    gitRunnerForSession(sessionId, control) { gitCalls.push({ sessionId, signal: control }); return runnerFactory(sessionId, control) },
    resourceLifecycle: { async verifyInitialBinding() { return false }, async closeEntrypoints() { return { closed: false, nativeColdResumeClosed: false } } },
  }
  runtime = await createRuntime(ports, { runtimeId: 'fixture-' + ++serial, consumptionTimeoutMs })
  t.after(() => runtime.dispose())
  if (initialPolicy) await runtime.savePolicy(operator, initialPolicy, 0, signal())
  const f = { runtime, ports, agents, cold, ctx, controlsStorage, instrumentStorage, windowStorage, resourceStorage,
    units, grants, observations, nativeCalls, gitCalls, guards, notificationCalls,
    setNotify(fn) { notify = fn },
    async reopen() { await runtime.dispose(); runtime = await createRuntime(ports, { runtimeId: 'fixture-' + ++serial, consumptionTimeoutMs }); f.runtime = runtime; return runtime },
    setNative(fn) { native = fn }, setRunner(fn) { runnerFactory = fn },
    async read(id = 'root', who = caller(id)) { return runtime.readSession(who, id, signal()) },
    async save(intent) { return runtime.savePolicy(operator, intent, (await runtime.readPolicy(operator, signal())).revision, signal()) },
    async apply(action, fields, id = 'root', who = caller(id)) {
      const before = await runtime.readSession(who, id, signal())
      return runtime.applyInstrument(who, id, { operationId: 'business-' + ++serial, expectedRevision: before.records.businessRevision, workflowId: 'flow', action, ...fields }, signal())
    },
    async window(action, localTicketId, fields = {}, id = 'root') {
      return runtime.applyTicketWindow(caller(id), id, { operationId: 'ticket-' + ++serial, workflowId: 'flow', localTicketId, action, ...fields }, signal())
    },
    async assign(sessionId, workflowId, ticketIds = [], from = 'root') {
      return runtime.assign(caller(from), { sessionId, workflowId, ticketIds }, signal())
    },
    exec(id = 'root', callId = 'execute-' + ++serial) {
      return { name: 'mattpocock_execute', arguments: {}, callId, rootCallId: callId, token: {}, agent: agents.get(id), signal: signal(), deferContext() {}, concludeTurn() {} }
    },
    async managed({ id = 'root', nativeTool = 'subagent', args = {}, workflowId = null, localTicketId = null, exec = f.exec(id) } = {}) {
      return runtime.executeManaged(caller(id), { nativeTool, arguments: args, workflowId, localTicketId }, exec)
    },
    async created(a) { agents.set(a.id, a); await runtime.created(caller(a.id), signal(), a) },
    async event(a, kind = 'agent-disposed', fields = {}) { return runtime.observe({ kind, sessionId: a.id, actualAgent: a, ...fields }) },
  }
  return f
}

// Installed SDK registries + actual mountHost/RuntimeFacade composition. No GUI/profile boot.
export async function mountedFixture(t, { futureNativeActivityKnown = false, seedUnits = new Map(), configureBeforeMount, runtimeCreated } = {}) {
  const ctx = new sdk.Context(), agents = new Map()
  const root = actualAgent('root'), child = actualAgent('child', { parent: 'root', managed: true })
  agents.set(root.id, root); agents.set(child.id, child)
  const peer = { id: 'operator', ctx, async dispose() {} }
  ctx.provide('connection', { operator: peer, rpc: { intercept() { return async () => {} } } })
  ctx.provide('agents', { get: id => agents.get(id), list: () => [...agents.values()] })
  const workspace = { id: 'W', path: '/fixture', title: 'Fixture', status: async () => 'ok' }
  ctx.provide('workspaceRegistry', { get: id => id === 'W' ? workspace : undefined, list: () => [workspace], resolveByPath: async path => path === '/fixture' ? workspace : undefined })
  ctx.provide('sessionQuery', { async observeSession() { throw new Error('No cold session activation') } })
  new sdk.TypertRegistry(ctx); new sdk.SystemPrompt(ctx, {}); new sdk.ToolRuntime(ctx, {})
  const units = new Map([...seedUnits].map(([name, rows]) => [name, new Map(rows)]))
  const backend = { kv: { async open(descriptor) {
    let rows = units.get(descriptor.name)
    if (!rows) { rows = new Map(); units.set(descriptor.name, rows) }
    return { async loadAll() { return { global: null, tables: { records: Object.fromEntries(rows) } } },
      async putRecord(table, key, value) { assert.equal(table, 'records'); rows.set(key, structuredClone(value)) },
      async deleteRecord(table, key) { rows.delete(key) }, async close() {} }
  } } }
  ctx.provide('storage', { backend: { get: () => backend } })
  const domain = new sdk.DomainFacility(ctx, { backend: 'fixture' }); ctx.provide('storageDomain', domain)
  let runtime, runtimeStorage
  configureBeforeMount?.({ ctx, root, child, agents })
  const mounted = await host.mountHost(ctx, { async createRuntime(ports) {
    const openRuntime = ports.openRuntimeStorage.bind(ports)
    ports.openRuntimeStorage = async parse => { runtimeStorage = await openRuntime(parse); return runtimeStorage }
    // Only this explicitly opt-in mechanical simulator asserts known activity.
    // The installed mounted.ports.nativeActivity remains truthful known:false.
    const runtimePorts = futureNativeActivityKnown ? { ...ports,
      async nativeActivity() { return { known: true, reason: null, liveAgents: [...agents.values()] } },
    } : ports
    runtime = await createRuntime(runtimePorts); runtimeCreated?.(runtime); return runtime
  } })
  t.after(async () => { await mounted.dispose(); await domain.closeAll() })
  return { ctx, root, child, agents, peer, runtime, mounted, get runtimeStorage() { return runtimeStorage },
    execute(name, args = {}, agent = root) { return ctx.tools.execute({ name, arguments: args, callId: 'registry-' + ++serial, agent, signal: signal() }) },
  }
}
