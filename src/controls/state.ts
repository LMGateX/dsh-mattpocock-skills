import { INITIAL_POLICY, parsePolicySnapshot } from './policy.js'
import type { PolicySnapshot } from './policy.js'
import { array, ControlsError, freeze, id, invalid, record, revision } from './validation.js'

export interface InstrumentInstance {
  readonly instrumentInstanceId: string
  readonly ownerSessionId: string
  readonly controlWorkspaceId: string
}
export interface SessionAssociation {
  readonly sessionId: string
  readonly parentSessionId: string | null
  readonly instrumentInstanceId: string
}
/** One atomic record: no half-persisted owner/child indexes. No leases/business state yet. */
export interface ControlsDocument {
  readonly schemaVersion: 1
  readonly revision: number
  readonly policy: PolicySnapshot
  readonly instances: readonly InstrumentInstance[]
  readonly associations: readonly SessionAssociation[]
}
export const INITIAL_DOCUMENT: ControlsDocument = freeze({
  schemaVersion: 1, revision: 0, policy: INITIAL_POLICY, instances: [], associations: [],
})

function parseDocument(value: unknown): ControlsDocument {
  const raw = record(value, 'controls document', ['schemaVersion', 'revision', 'policy', 'instances', 'associations'])
  if (raw.schemaVersion !== 1) invalid('unsupported controls schemaVersion')
  const docRevision = revision(raw.revision, 'document revision')
  const policy = parsePolicySnapshot(raw.policy)
  if (policy.revision > docRevision) invalid('policy revision exceeds document revision')
  const instances = array(raw.instances, 'instances').map((value: unknown): InstrumentInstance => {
    const row = record(value, 'instance', ['instrumentInstanceId', 'ownerSessionId', 'controlWorkspaceId'])
    return { instrumentInstanceId: id(row.instrumentInstanceId, 'instrumentInstanceId'),
      ownerSessionId: id(row.ownerSessionId, 'ownerSessionId'), controlWorkspaceId: id(row.controlWorkspaceId, 'controlWorkspaceId') }
  })
  const associations = array(raw.associations, 'associations').map((value: unknown): SessionAssociation => {
    const row = record(value, 'association', ['sessionId', 'parentSessionId', 'instrumentInstanceId'])
    return { sessionId: id(row.sessionId, 'sessionId'),
      parentSessionId: row.parentSessionId === null ? null : id(row.parentSessionId, 'parentSessionId'),
      instrumentInstanceId: id(row.instrumentInstanceId, 'instrumentInstanceId') }
  })
  const byInstance = new Map(instances.map(row => [row.instrumentInstanceId, row]))
  const bySession = new Map(associations.map(row => [row.sessionId, row]))
  if (byInstance.size !== instances.length || bySession.size !== associations.length
    || new Set(instances.map(row => row.ownerSessionId)).size !== instances.length) invalid('duplicate instance, owner or session')
  for (const instance of instances) {
    const owner = bySession.get(instance.ownerSessionId)
    if (!owner || owner.parentSessionId !== null || owner.instrumentInstanceId !== instance.instrumentInstanceId) invalid('missing or mismatched owner association')
  }
  for (const association of associations) {
    const instance = byInstance.get(association.instrumentInstanceId)
    if (!instance) invalid('association refers to missing instance')
    let cursor: SessionAssociation = association
    const visited = new Set<string>()
    while (cursor.parentSessionId !== null) {
      if (visited.has(cursor.sessionId)) invalid('cyclic session association')
      visited.add(cursor.sessionId)
      const parent = bySession.get(cursor.parentSessionId)
      if (!parent || parent.instrumentInstanceId !== instance.instrumentInstanceId) invalid('missing or cross-instance parent')
      cursor = parent
    }
    if (cursor.sessionId !== instance.ownerSessionId) invalid('association root differs from owner')
  }
  const order = (a: string, b: string): number => a < b ? -1 : a > b ? 1 : 0
  instances.sort((a, b) => order(a.instrumentInstanceId, b.instrumentInstanceId))
  associations.sort((a, b) => order(a.sessionId, b.sessionId))
  return freeze({ schemaVersion: 1, revision: docRevision, policy, instances, associations })
}

/** Corruption/unknown versions reject; never silently reset a persisted ledger. */
export function parseControlsDocument(value: unknown): ControlsDocument {
  try { return parseDocument(value) }
  catch (error) {
    if (error instanceof ControlsError && error.code === 'invalid-input') throw new ControlsError('invalid-state', error.message)
    throw error
  }
}
