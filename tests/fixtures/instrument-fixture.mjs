import { randomUUID } from 'node:crypto'
import { WorkspaceControls, SessionInstruments, MemoryControlsStorage, MemoryInstrumentStorage } from '../../lib/controls/index.js'
export const denied = new Error('existing host permission denied')
export const definition = { title: '自由任务', axes: [
  { axisKey: 'delivery', label: '交付状况', counting: 'exclusive', statuses: [
    { statusKey: 'partial', label: '部分完成', meaning: '尚有任务约定的部分未处理', summaryPriority: 0 },
    { statusKey: 'repair', label: '待回访', meaning: '业务自定义' } ] },
  { axisKey: 'qualities', label: '可重叠维度', counting: 'overlapping', statuses: [
    { statusKey: 'review', label: '待审阅' }, { statusKey: 'experiment', label: '实验候选' } ] },
] }
export async function instrumentFixture(options = {}) {
  const controlStorage = options.controlStorage ?? new MemoryControlsStorage()
  const storage = options.storage ?? new MemoryInstrumentStorage()
  const identities = new Map([['A', { kind: 'owner', controlWorkspaceId: 'W' }], ['B', { kind: 'owner', controlWorkspaceId: 'W' }],
    ['child', { kind: 'managed-child', parentSessionId: 'A' }]])
  const controlAuthority = {
    async authorizePolicy(principal) { if (principal !== 'admin') throw denied },
    async authorizeSession(principal, session) { if (!['admin', 'user', 'user2'].includes(principal) && principal !== session) throw denied },
    async resolveSession(session) { return identities.get(session) }, async verifyWorkspace(workspace) { return workspace === 'W' },
  }
  const controls = new WorkspaceControls(controlStorage, controlAuthority)
  await controls.ensureSession('admin', 'A')
  await controls.ensureSession('admin', 'B')
  await controls.ensureSession('admin', 'child')
  if ((await controls.readPolicy('admin')).revision === 0) await controls.savePolicy('admin', { extensionEnabled: true,
    defaults: { workspace: { enabled: true }, ticketProgress: { enabled: true }, pendingDecisions: { enabled: true } }, workspaceOverrides: {} }, 0)
  const scopes = new Map([['child', { kind: 'assigned', workflowId: 'flow', ticketIds: ['T1'] }]])
  const revoked = new Set()
  const authority = { async resolveAccess(principal, session) {
    if (revoked.has(principal)) throw denied
    return { author: { kind: ['user', 'user2', 'admin'].includes(principal) ? 'user' : 'agent', principalId: principal,
      sessionId: ['user', 'user2', 'admin'].includes(principal) ? null : session }, scope: scopes.get(principal) ?? { kind: 'coordinator' } }
  } }
  const instruments = new SessionInstruments(controls, storage, authority, () => 12345)
  let nextId = 0
  const operationPrefix = randomUUID()
  const read = (principal = 'A', session = 'A', filter) => instruments.read(principal, session, filter)
  const command = async (action, fields, principal = 'A', session = 'A') => {
    const current = await read(principal, session)
    return { operationId: operationPrefix + '-' + ++nextId, expectedRevision: action === 'set-decision-view' ? current.viewerRevision : current.businessRevision,
      action, workflowId: 'flow', ...fields }
  }
  const apply = async (action, fields, principal = 'A', session = 'A') => instruments.apply(principal, session, await command(action, fields, principal, session))
  return { controls, controlStorage, storage, controlAuthority, authority, identities, scopes, revoked, instruments, read, command, apply }
}
