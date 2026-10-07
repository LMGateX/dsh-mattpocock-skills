import { createHash, randomUUID } from 'node:crypto'
import { isAbsolute, normalize } from 'node:path'
import type { InstrumentInstance } from './state.js'
import { parseAuthor } from './instrument-state.js'
import type { InstrumentAuthor } from './instrument-state.js'
import type { VersionedStorage } from './versioned-storage.js'
import { array, boolean, ControlsError, freeze, id, increment, invalid, memoized, record, revision } from './validation.js'

export interface WorktreeBindingIntent {
  readonly operationId: string
  readonly parentSessionId: string
  /** Caller supplies this as native spec.sessionId; never generate a new identity on retry. */
  readonly plannedChildSessionId: string
  readonly requestedCwd: string
  readonly task?: string
}
export interface WorktreeBindingValue extends WorktreeBindingIntent {
  readonly actualChildSessionId: string | null
  readonly actualCwd: string | null
  readonly acceptance: 'unknown' | 'accepted' | 'rejected'
  readonly outcome: 'pending' | 'confirmed' | 'failed' | 'cancelled' | 'accepted-unknown'
  readonly diagnostic: string | null
  readonly business: { readonly state: 'active' | 'discarded' | 'cleaned'; readonly notes?: string }
}
export interface WorktreeBindingBusinessUpdate {
  readonly operationId: string
  readonly bindingId: string
  /** Latest row revision, not the owner document revision. */
  readonly expectedRevision: number
  readonly state: 'active' | 'discarded' | 'cleaned'
  readonly notes?: string
}
export interface WorktreeBindingVersion {
  readonly command?: WorktreeBindingBusinessUpdate
  readonly revision: number
  readonly recordedAt: number
  readonly operationId: string
  readonly source: 'intent' | 'program' | 'agent'
  readonly author: InstrumentAuthor
  readonly value: WorktreeBindingValue
}
export interface WorktreeBindingRow {
  readonly bindingId: string
  readonly revision: number
  readonly value: WorktreeBindingValue
  readonly history: readonly WorktreeBindingVersion[]
}
export interface WorktreeBindingsLegacyDocument {
  readonly schemaVersion: 1
  readonly revision: number
  readonly owner: InstrumentInstance
  readonly rows: readonly WorktreeBindingRow[]
}
export interface WorktreeBindingTechnical {
  readonly operationId: string; readonly parentSessionId: string; readonly plannedChildSessionId: string; readonly requestedCwd: string
  readonly actualChildSessionId: string | null; readonly actualCwd: string | null
  readonly acceptance: WorktreeBindingValue['acceptance']; readonly businessState: WorktreeBindingValue['business']['state']
}
export interface WorktreeBindingManifest {
  readonly bindingId: string; readonly revision: number; readonly recordedAt: number; readonly operationId: string
  readonly source: WorktreeBindingVersion['source']; readonly author: InstrumentAuthor
  readonly technical: WorktreeBindingTechnical; readonly valueDigest: string; readonly notesDigest: string; readonly retained: boolean
}
export interface WorktreeBindingMaterializedRow extends WorktreeBindingRow {
  readonly creationAuthor: InstrumentAuthor; readonly creationDigest: string
  readonly identity: Omit<WorktreeBindingIntent, 'task'>
}
export interface WorktreeBindingsSourceCoverage {
  readonly kind: 'history-only'; readonly throughRevision: number; readonly removedVersions: number
  readonly removed: readonly { readonly bindingId: string; readonly revision: number }[]
}
export interface WorktreeBindingsCleanupResult {
  readonly revision: number; readonly removedVersions: number; readonly checkpointRev: number
  readonly sourceCoverage: WorktreeBindingsSourceCoverage; readonly replayed: boolean
}
export interface WorktreeBindingsCompact { readonly operationId: string; readonly expectedRevision: number }
export interface WorktreeBindingsPurgeHistory extends WorktreeBindingsCompact {
  readonly throughRevision: number; readonly bindingIds: readonly string[]
}
export interface WorktreeBindingOperation {
  readonly operationId: string; readonly kind: 'creation' | 'business' | 'compact' | 'purge-history'
  readonly digest: string; readonly author: InstrumentAuthor; readonly bindingId: string | null; readonly revision: number
  readonly result?: Omit<WorktreeBindingsCleanupResult, 'replayed'>
}
export interface WorktreeBindingsMaterializedDocument {
  readonly schemaVersion: 2; readonly revision: number; readonly owner: InstrumentInstance
  readonly checkpointRev: number; readonly purgedThroughRevision: number
  readonly rows: readonly WorktreeBindingMaterializedRow[]
  /** Technical metadata only: deleted body holes are explicit, never fake empty reports. */
  readonly manifest: readonly WorktreeBindingManifest[]
  /** SHA-256 receipts, never raw command/fingerprint bodies. */
  readonly operations: readonly WorktreeBindingOperation[]
}
export type WorktreeBindingsDocument = WorktreeBindingsLegacyDocument | WorktreeBindingsMaterializedDocument
export interface WorktreeBindingCurrent {
  readonly bindingId: string
  readonly revision: number
  readonly value: WorktreeBindingValue
  readonly source: WorktreeBindingVersion['source']
  readonly author: InstrumentAuthor
  readonly recordedAt: number
}
export interface WorktreeBindingsSnapshot {
  readonly checkpointRev: number
  readonly sourceCoverage: WorktreeBindingsSourceCoverage
  readonly revision: number
  /** Entire retained registry, including cleaned rows and their authored old versions. */
  readonly rows: readonly WorktreeBindingRow[]
  readonly current: readonly WorktreeBindingCurrent[]
}
/** Derived by runtime from native persisted session header, never model input. */
export interface WorktreeBindingHeader { readonly sessionId: string; readonly parentSessionId: string; readonly cwd: string }
export interface WorktreeBindingOutcome {
  readonly acceptance: 'unknown' | 'accepted' | 'rejected'
  readonly outcome: 'failed' | 'cancelled' | 'accepted-unknown'
  readonly diagnostic?: string
}
export interface WorktreeBindings {
  compact(owner: InstrumentInstance, actualAuthor: InstrumentAuthor, command: WorktreeBindingsCompact, signal?: AbortSignal): Promise<WorktreeBindingsCleanupResult>
  purgeHistory(owner: InstrumentInstance, actualAuthor: InstrumentAuthor, command: WorktreeBindingsPurgeHistory, signal?: AbortSignal): Promise<WorktreeBindingsCleanupResult>
  recordOutcome(owner: InstrumentInstance, operationId: string, outcome: WorktreeBindingOutcome, actualAuthor: InstrumentAuthor): Promise<WorktreeBindingRow>
  reconcile(owner: InstrumentInstance, operationId: string, actualHeader: WorktreeBindingHeader | null, actualAuthor: InstrumentAuthor): Promise<WorktreeBindingRow>
  updateBusiness(owner: InstrumentInstance, actualAuthor: InstrumentAuthor, command: WorktreeBindingBusinessUpdate): Promise<WorktreeBindingRow>
  confirm(owner: InstrumentInstance, operationId: string, actualHeader: WorktreeBindingHeader, actualAuthor: InstrumentAuthor): Promise<WorktreeBindingRow>
  registerIntent(owner: InstrumentInstance, actualAuthor: InstrumentAuthor, intent: WorktreeBindingIntent): Promise<{ readonly dispatch: boolean; readonly replayed: boolean; readonly row: WorktreeBindingRow }>
  query(owner: InstrumentInstance): Promise<WorktreeBindingsSnapshot>
}
export type WorktreeBindingsStorage = (ownerSessionId: string) => VersionedStorage<WorktreeBindingsDocument>

function text(value: unknown, where: string): string {
  if (typeof value !== 'string' || value.length > 65536 || value.includes('\0')) invalid(where + ' must be text of at most 65536 characters')
  return value
}
function cwd(value: unknown): string {
  if (typeof value !== 'string' || !isAbsolute(value) || normalize(value) !== value || /[\u0000-\u001f\u007f]/u.test(value)) invalid('cwd must be a normalized absolute path')
  return value
}
function parseOwner(value: unknown): InstrumentInstance {
  const r = record(value, 'binding owner', ['instrumentInstanceId', 'ownerSessionId', 'controlWorkspaceId'])
  return freeze({ instrumentInstanceId: id(r.instrumentInstanceId, 'instrumentInstanceId'), ownerSessionId: id(r.ownerSessionId, 'ownerSessionId'), controlWorkspaceId: id(r.controlWorkspaceId, 'controlWorkspaceId') })
}
function parseIntent(value: unknown): WorktreeBindingIntent {
  const r = record(value, 'binding intent', ['operationId', 'parentSessionId', 'plannedChildSessionId', 'requestedCwd', 'task'])
  const parentSessionId = id(r.parentSessionId, 'parentSessionId'), plannedChildSessionId = id(r.plannedChildSessionId, 'plannedChildSessionId')
  if (parentSessionId === plannedChildSessionId) invalid('child must differ from parent')
  return freeze({ operationId: id(r.operationId, 'operationId'), parentSessionId, plannedChildSessionId, requestedCwd: cwd(r.requestedCwd), ...(r.task === undefined ? {} : { task: text(r.task, 'task') }) })
}
function parseValue(value: unknown): WorktreeBindingValue {
  const r = record(value, 'binding value', ['operationId', 'parentSessionId', 'plannedChildSessionId', 'requestedCwd', 'task', 'actualChildSessionId', 'actualCwd', 'acceptance', 'outcome', 'diagnostic', 'business'])
  const intent = parseIntent({ operationId: r.operationId, parentSessionId: r.parentSessionId, plannedChildSessionId: r.plannedChildSessionId, requestedCwd: r.requestedCwd, ...(r.task === undefined ? {} : { task: r.task }) })
  if (r.acceptance !== 'unknown' && r.acceptance !== 'accepted' && r.acceptance !== 'rejected') invalid('unknown native acceptance')
  if (r.outcome !== 'pending' && r.outcome !== 'confirmed' && r.outcome !== 'failed' && r.outcome !== 'cancelled' && r.outcome !== 'accepted-unknown') invalid('unknown creation outcome')
  const business = record(r.business, 'binding business', ['state', 'notes'])
  if (business.state !== 'active' && business.state !== 'discarded' && business.state !== 'cleaned') invalid('unknown business state')
  const actualChildSessionId = r.actualChildSessionId === null ? null : id(r.actualChildSessionId, 'actualChildSessionId')
  const actualCwd = r.actualCwd === null ? null : cwd(r.actualCwd)
  if ((actualChildSessionId === null) !== (actualCwd === null)) invalid('actual child and cwd must be confirmed together')
  if (actualChildSessionId !== null && (actualChildSessionId !== intent.plannedChildSessionId || actualCwd !== intent.requestedCwd || r.acceptance !== 'accepted')) invalid('actual header contradicts intent')
  if (r.outcome === 'confirmed' && actualCwd === null) invalid('confirmation requires actual header')
  return { ...intent, actualChildSessionId, actualCwd, acceptance: r.acceptance, outcome: r.outcome, diagnostic: r.diagnostic === null ? null : text(r.diagnostic, 'diagnostic'), business: { state: business.state, ...(business.notes === undefined ? {} : { notes: text(business.notes, 'notes') }) } }
}
function parseBusinessUpdate(value: unknown): WorktreeBindingBusinessUpdate {
  const r = record(value, 'business update', ['operationId', 'bindingId', 'expectedRevision', 'state', 'notes'])
  if (r.state !== 'active' && r.state !== 'discarded' && r.state !== 'cleaned') invalid('unknown business state')
  return freeze({ operationId: id(r.operationId, 'operationId'), bindingId: id(r.bindingId, 'bindingId'), expectedRevision: revision(r.expectedRevision, 'expectedRevision'), state: r.state, ...(r.notes === undefined ? {} : { notes: text(r.notes, 'notes') }) })
}
function equal(a: unknown, b: unknown): boolean { return JSON.stringify(a) === JSON.stringify(b) }
function intentOf(value: WorktreeBindingValue): WorktreeBindingIntent {
  return { operationId: value.operationId, parentSessionId: value.parentSessionId, plannedChildSessionId: value.plannedChildSessionId, requestedCwd: value.requestedCwd, ...(value.task === undefined ? {} : { task: value.task }) }
}

/** Storage parser: never reset malformed history to an empty registry. */
function parseLegacyDocument(value: unknown): WorktreeBindingsLegacyDocument {
  const r = record(value, 'worktree bindings document', ['schemaVersion', 'revision', 'owner', 'rows'])
  if (r.schemaVersion !== 1) invalid('unknown worktree bindings schema')
  const documentRevision = revision(r.revision, 'document revision'), owner = parseOwner(r.owner)
  const rows = array(r.rows, 'binding rows').map(value => {
    const row = record(value, 'binding row', ['bindingId', 'revision', 'value', 'history'])
    const history = array(row.history, 'binding history').map(value => {
      const event = record(value, 'binding version', ['revision', 'recordedAt', 'operationId', 'source', 'author', 'value', 'command'])
      if (event.source !== 'intent' && event.source !== 'program' && event.source !== 'agent') invalid('unknown binding version source')
      return { revision: revision(event.revision, 'version revision'), recordedAt: revision(event.recordedAt, 'recordedAt'), operationId: id(event.operationId, 'version operationId'), source: event.source, author: parseAuthor(event.author), value: parseValue(event.value), ...(event.command === undefined ? {} : { command: parseBusinessUpdate(event.command) }) } as WorktreeBindingVersion
    })
    const latest = history.at(-1), first = history[0], parsedValue = parseValue(row.value)
    if (!latest || !first || first.source !== 'intent' || !equal(latest.value, parsedValue) || latest.revision !== row.revision) invalid('row must match its latest retained version')
    if (first.value.plannedChildSessionId === owner.ownerSessionId || (first.author.kind === 'agent' && first.author.sessionId !== first.value.parentSessionId)) invalid('intent author or child identity contradicts its owner/parent')
    if (first.operationId !== first.value.operationId || first.value.actualCwd !== null || first.value.acceptance !== 'unknown'
      || first.value.outcome !== 'pending' || first.value.diagnostic !== null || !equal(first.value.business, { state: 'active' }) || first.command !== undefined) invalid('first version must be a pending native intent')
    for (let index = 0; index < history.length; index += 1) {
      const event = history[index]!, previous = history[index - 1]
      if (!equal(intentOf(event.value), intentOf(first.value))) invalid('binding intent cannot change')
      if (!previous) continue
      if (event.revision <= previous.revision || event.source === 'intent') invalid('binding versions must advance once after the initial intent')
      if (previous.value.actualCwd !== null && (event.value.actualCwd !== previous.value.actualCwd || event.value.actualChildSessionId !== previous.value.actualChildSessionId)) invalid('confirmed actual header identity cannot change or disappear')
      if (previous.value.acceptance === 'accepted' && event.value.acceptance !== 'accepted') invalid('accepted native creation cannot lose acceptance')
      if (previous.value.business.state === 'cleaned' && event.value.business.state !== 'cleaned') invalid('cleaned bindings cannot resurrect')
      if (event.source === 'program') {
        if (event.command !== undefined || event.operationId !== first.value.operationId || !equal(event.value.business, previous.value.business)) invalid('program observations must preserve authored business state')
      } else {
        const command = event.command
        if (!command || command.bindingId !== row.bindingId || command.operationId !== event.operationId || command.expectedRevision !== previous.revision) invalid('business command has invalid row or revision references')
        const business = { state: command.state, ...(command.notes === undefined ? previous.value.business.notes === undefined ? {} : { notes: previous.value.business.notes } : { notes: command.notes }) }
        if (!equal(event.value, { ...previous.value, business })) invalid('agent business commands cannot change technical binding facts')
      }
    }
    return { bindingId: id(row.bindingId, 'bindingId'), revision: revision(row.revision, 'row revision'), value: parsedValue, history }
  })
  const revisions = rows.flatMap(row => row.history.map(event => event.revision)).sort((a, b) => a - b)
  if (revisions.length !== documentRevision || revisions.some((value, index) => value !== index + 1)) invalid('binding history has a revision gap or duplicate')
  for (const select of [(row: WorktreeBindingRow) => row.bindingId, (row: WorktreeBindingRow) => row.value.operationId, (row: WorktreeBindingRow) => row.value.plannedChildSessionId]) {
    if (new Set(rows.map(select)).size !== rows.length) invalid('duplicate binding identity or creation operation')
  }
  const creationIds = new Set(rows.map(row => row.value.operationId)), businessIds = new Set<string>()
  for (const event of rows.flatMap(row => row.history).filter(event => event.source === 'agent')) {
    if (creationIds.has(event.operationId) || businessIds.has(event.operationId)) invalid('operationId belongs to more than one command')
    businessIds.add(event.operationId)
  }
  return freeze({ schemaVersion: 1, revision: documentRevision, owner, rows })
}

function digest(value: unknown): string { return createHash('sha256').update(JSON.stringify(value)).digest('hex') }
function parseDigest(value: unknown): string {
  if (typeof value !== 'string' || !/^[a-f0-9]{64}$/u.test(value)) invalid('operation/value digest must be SHA-256')
  return value
}
function identityOf(value: WorktreeBindingValue): Omit<WorktreeBindingIntent, 'task'> {
  return { operationId: value.operationId, parentSessionId: value.parentSessionId, plannedChildSessionId: value.plannedChildSessionId, requestedCwd: value.requestedCwd }
}
function technicalOf(value: WorktreeBindingValue): WorktreeBindingTechnical {
  return { ...identityOf(value), actualChildSessionId: value.actualChildSessionId, actualCwd: value.actualCwd, acceptance: value.acceptance, businessState: value.business.state }
}
function manifestVersion(bindingId: string, version: WorktreeBindingVersion): WorktreeBindingManifest {
  return { bindingId, revision: version.revision, recordedAt: version.recordedAt, operationId: version.operationId, source: version.source,
    author: version.author, technical: technicalOf(version.value), valueDigest: digest(version.value), notesDigest: digest(version.value.business.notes ?? null), retained: true }
}
function sourceCoverage(document: WorktreeBindingsMaterializedDocument): WorktreeBindingsSourceCoverage {
  const removed = document.manifest.filter(event => !event.retained).map(event => ({ bindingId: event.bindingId, revision: event.revision }))
  return { kind: 'history-only', throughRevision: document.purgedThroughRevision, removedVersions: removed.length, removed }
}
function materialize(document: WorktreeBindingsLegacyDocument): WorktreeBindingsMaterializedDocument {
  const operations: WorktreeBindingOperation[] = []
  const rows = document.rows.map(row => {
    const first = row.history[0]!
    operations.push({ operationId: row.value.operationId, kind: 'creation', digest: digest(intentOf(first.value)), author: first.author, bindingId: row.bindingId, revision: first.revision })
    for (const event of row.history) if (event.command) operations.push({ operationId: event.operationId, kind: 'business', digest: digest(event.command), author: event.author, bindingId: row.bindingId, revision: event.revision })
    return { ...row, creationAuthor: first.author, creationDigest: digest(intentOf(first.value)), identity: identityOf(row.value) }
  })
  return freeze({ schemaVersion: 2, revision: document.revision, owner: document.owner, checkpointRev: 0, purgedThroughRevision: 0, rows,
    manifest: document.rows.flatMap(row => row.history.map(event => manifestVersion(row.bindingId, event))).sort((a, b) => a.revision - b.revision), operations: operations.sort((a, b) => a.revision - b.revision) })
}
function parseCoverage(value: unknown): WorktreeBindingsSourceCoverage {
  const r = record(value, 'source coverage', ['kind', 'throughRevision', 'removedVersions', 'removed'])
  if (r.kind !== 'history-only') invalid('binding cleanup only supports history-only coverage')
  const removed = array(r.removed, 'removed versions').map(value => { const event = record(value, 'removed version', ['bindingId', 'revision']); return { bindingId: id(event.bindingId, 'bindingId'), revision: revision(event.revision, 'removed revision') } })
  if (r.removedVersions !== removed.length || new Set(removed.map(event => event.revision)).size !== removed.length) invalid('source coverage count or duplicate revision')
  return { kind: 'history-only', throughRevision: revision(r.throughRevision, 'throughRevision'), removedVersions: removed.length, removed }
}
function parseCleanupResult(value: unknown): Omit<WorktreeBindingsCleanupResult, 'replayed'> {
  const r = record(value, 'cleanup result', ['revision', 'removedVersions', 'checkpointRev', 'sourceCoverage'])
  return { revision: revision(r.revision, 'cleanup revision'), removedVersions: revision(r.removedVersions, 'removedVersions'), checkpointRev: revision(r.checkpointRev, 'checkpointRev'), sourceCoverage: parseCoverage(r.sourceCoverage) }
}
function parseVersion(value: unknown): WorktreeBindingVersion {
  const event = record(value, 'retained binding version', ['revision', 'recordedAt', 'operationId', 'source', 'author', 'value', 'command'])
  if (event.source !== 'intent' && event.source !== 'program' && event.source !== 'agent') invalid('unknown retained source')
  return { revision: revision(event.revision, 'version revision'), recordedAt: revision(event.recordedAt, 'recordedAt'), operationId: id(event.operationId, 'operationId'), source: event.source,
    author: parseAuthor(event.author), value: parseValue(event.value), ...(event.command === undefined ? {} : { command: parseBusinessUpdate(event.command) }) }
}

/** V1 is read compatibly, never written back as V1; normalization alone deletes nothing. */
export function parseWorktreeBindingsDocument(value: unknown): WorktreeBindingsMaterializedDocument {
  const root = record(value, 'binding document')
  if (root.schemaVersion === 1) return materialize(parseLegacyDocument(value))
  const r = record(root, 'v2 binding document', ['schemaVersion', 'revision', 'owner', 'checkpointRev', 'purgedThroughRevision', 'rows', 'manifest', 'operations'])
  if (r.schemaVersion !== 2) invalid('unknown worktree bindings schema')
  const documentRevision = revision(r.revision, 'document revision'), owner = parseOwner(r.owner)
  const checkpointRev = revision(r.checkpointRev, 'checkpointRev'), purgedThroughRevision = revision(r.purgedThroughRevision, 'purgedThroughRevision')
  if (checkpointRev > documentRevision || purgedThroughRevision > checkpointRev) invalid('checkpoint/cleanup coverage beyond document')
  const rows: WorktreeBindingMaterializedRow[] = array(r.rows, 'binding rows').map(value => {
    const raw = record(value, 'materialized binding row', ['bindingId', 'revision', 'value', 'history', 'creationAuthor', 'creationDigest', 'identity'])
    const parsedValue = parseValue(raw.value), identity = parseIntent(raw.identity), creationAuthor = parseAuthor(raw.creationAuthor), creationDigest = parseDigest(raw.creationDigest)
    if (!equal(identity, identityOf(parsedValue)) || creationDigest !== digest(intentOf(parsedValue))) invalid('materialized creation identity or digest changed')
    if (identity.plannedChildSessionId === owner.ownerSessionId || (creationAuthor.kind === 'agent' && creationAuthor.sessionId !== identity.parentSessionId)) invalid('creation author or planned child contradicts owner/parent')
    const history = array(raw.history, 'retained history').map(parseVersion), latest = history.at(-1)
    if (!latest || latest.revision !== raw.revision || !equal(latest.value, parsedValue)) invalid('latest current body must remain retained and match materialized value')
    return { bindingId: id(raw.bindingId, 'bindingId'), revision: revision(raw.revision, 'row revision'), value: parsedValue, history, creationAuthor, creationDigest, identity }
  })
  const manifest: WorktreeBindingManifest[] = array(r.manifest, 'binding manifest').map(value => {
    const raw = record(value, 'manifest version', ['bindingId', 'revision', 'recordedAt', 'operationId', 'source', 'author', 'technical', 'valueDigest', 'notesDigest', 'retained'])
    if (raw.source !== 'intent' && raw.source !== 'program' && raw.source !== 'agent') invalid('unknown manifest source')
    const tech = record(raw.technical, 'technical binding', ['operationId', 'parentSessionId', 'plannedChildSessionId', 'requestedCwd', 'actualChildSessionId', 'actualCwd', 'acceptance', 'businessState'])
    const parsed = parseValue({ operationId: tech.operationId, parentSessionId: tech.parentSessionId, plannedChildSessionId: tech.plannedChildSessionId, requestedCwd: tech.requestedCwd, actualChildSessionId: tech.actualChildSessionId, actualCwd: tech.actualCwd, acceptance: tech.acceptance, outcome: tech.actualCwd === null ? 'accepted-unknown' : 'confirmed', diagnostic: null, business: { state: tech.businessState } })
    return { bindingId: id(raw.bindingId, 'manifest bindingId'), revision: revision(raw.revision, 'manifest revision'), recordedAt: revision(raw.recordedAt, 'recordedAt'), operationId: id(raw.operationId, 'operationId'), source: raw.source,
      author: parseAuthor(raw.author), technical: technicalOf(parsed), valueDigest: parseDigest(raw.valueDigest), notesDigest: parseDigest(raw.notesDigest), retained: boolean(raw.retained, 'retained') }
  })
  const operations: WorktreeBindingOperation[] = array(r.operations, 'operation receipts').map(value => {
    const raw = record(value, 'operation receipt', ['operationId', 'kind', 'digest', 'author', 'bindingId', 'revision', 'result'])
    if (raw.kind !== 'creation' && raw.kind !== 'business' && raw.kind !== 'compact' && raw.kind !== 'purge-history') invalid('unknown operation kind')
    return { operationId: id(raw.operationId, 'operationId'), kind: raw.kind, digest: parseDigest(raw.digest), author: parseAuthor(raw.author), bindingId: raw.bindingId === null ? null : id(raw.bindingId, 'bindingId'), revision: revision(raw.revision, 'operation revision'), ...(raw.result === undefined ? {} : { result: parseCleanupResult(raw.result) }) }
  })
  for (const select of [(row: WorktreeBindingRow) => row.bindingId, (row: WorktreeBindingRow) => row.value.operationId, (row: WorktreeBindingRow) => row.value.plannedChildSessionId]) if (new Set(rows.map(select)).size !== rows.length) invalid('duplicate binding identity')
  if (new Set(operations.map(operation => operation.operationId)).size !== operations.length) invalid('duplicate operation receipt')
  const cleanupRevisions = operations.filter(operation => operation.kind === 'compact' || operation.kind === 'purge-history').map(operation => operation.revision)
  const revisions = [...manifest.map(event => event.revision), ...cleanupRevisions].sort((a, b) => a - b)
  if (revisions.length !== documentRevision || revisions.some((value, index) => value !== index + 1)) invalid('technical manifest has missing or duplicate revision coverage')
  for (const row of rows) {
    const events = manifest.filter(event => event.bindingId === row.bindingId), first = events[0], latest = events.at(-1)
    const creation = operations.find(operation => operation.operationId === row.value.operationId)
    if (!first || !latest || first.source !== 'intent' || first.operationId !== row.value.operationId || first.technical.actualCwd !== null || first.technical.acceptance !== 'unknown' || first.technical.businessState !== 'active') invalid('manifest must start with a pending creation intent')
    if (!creation || creation.kind !== 'creation' || creation.bindingId !== row.bindingId || creation.revision !== first.revision || creation.digest !== row.creationDigest || !equal(creation.author, row.creationAuthor) || !equal(first.author, row.creationAuthor)) invalid('creation receipt does not match stable creator')
    if (latest.revision !== row.revision || latest.valueDigest !== digest(row.value) || !equal(latest.technical, technicalOf(row.value))) invalid('checkpoint current value contradicts technical manifest')
    if (row.history.length !== events.filter(event => event.retained).length) invalid('retained source coverage does not match history bodies')
    for (let index = 0; index < events.length; index += 1) {
      const event = events[index]!, previous = events[index - 1], body = row.history.find(version => version.revision === event.revision)
      if (!equal(identityOf({ ...row.value, ...event.technical }), row.identity)) invalid('manifest binding identity cannot change')
      if (Boolean(body) !== event.retained || (!event.retained && (checkpointRev === 0 || event.revision > purgedThroughRevision))) invalid('deleted version lacks explicit source coverage')
      if (body && (digest(intentOf(body.value)) !== row.creationDigest || !equal(manifestVersion(row.bindingId, body), event) || (body.command && (body.command.bindingId !== row.bindingId || body.command.operationId !== event.operationId)))) invalid('retained version body disagrees with manifest')
      if (previous) {
        if (event.revision <= previous.revision || event.source === 'intent') invalid('manifest row ordering changed')
        if (previous.technical.actualCwd !== null && (event.technical.actualCwd !== previous.technical.actualCwd || event.technical.actualChildSessionId !== previous.technical.actualChildSessionId)) invalid('actual header identity cannot reset after source cleanup')
        if (previous.technical.acceptance === 'accepted' && event.technical.acceptance !== 'accepted') invalid('accepted creation cannot reset')
        if (previous.technical.businessState === 'cleaned' && event.technical.businessState !== 'cleaned') invalid('cleaned binding cannot resurrect')
        if (event.source === 'program' && (event.operationId !== row.value.operationId || event.technical.businessState !== previous.technical.businessState || event.notesDigest !== previous.notesDigest || body?.command !== undefined)) invalid('program cannot alter business state')
        if (event.source === 'agent') {
          const operation = operations.find(operation => operation.operationId === event.operationId)
          if (!operation || operation.kind !== 'business' || operation.bindingId !== row.bindingId || operation.revision !== event.revision || !equal(operation.author, event.author)) invalid('business receipt missing or changed')
          if (body && (!body.command || body.command.state !== event.technical.businessState || body.command.expectedRevision !== previous.revision || digest(body.command) !== operation.digest
            || event.notesDigest !== (body.command.notes === undefined ? previous.notesDigest : digest(body.command.notes)))) invalid('business command revision/digest/notes changed')
          if (!equal({ ...event.technical, businessState: previous.technical.businessState }, previous.technical)) invalid('business update cannot alter technical binding')
          if (body && index > 0) { const priorBody = row.history.find(version => version.revision === previous.revision); if (priorBody) { const business = { state: body.command!.state, ...(body.command!.notes === undefined ? priorBody.value.business.notes === undefined ? {} : { notes: priorBody.value.business.notes } : { notes: body.command!.notes }) }; if (!equal(body.value, { ...priorBody.value, business })) invalid('business body modifies program facts') } }
        }
      }
    }
  }
  if (manifest.some(event => !rows.some(row => row.bindingId === event.bindingId))) invalid('manifest references unknown binding')
  for (const operation of operations) {
    if (operation.kind === 'compact' || operation.kind === 'purge-history') {
      if (operation.bindingId !== null || !operation.result || operation.result.revision !== operation.revision || operation.result.checkpointRev !== operation.revision) invalid('cleanup receipt has invalid checkpoint result')
    } else if (operation.result !== undefined || !manifest.some(event => event.revision === operation.revision && event.operationId === operation.operationId && event.bindingId === operation.bindingId)) invalid('operation receipt references unknown source version')
  }
  const cleanups = operations.filter(operation => operation.kind === 'compact' || operation.kind === 'purge-history').sort((a, b) => a.revision - b.revision)
  let priorCoverage: WorktreeBindingsSourceCoverage = { kind: 'history-only', throughRevision: 0, removedVersions: 0, removed: [] }
  for (const operation of cleanups) {
    const result = operation.result!, coverage = result.sourceCoverage
    if (operation.author.kind === 'agent' && operation.author.sessionId !== owner.ownerSessionId) invalid('cleanup receipt author is not the owner root')
    if (coverage.throughRevision >= operation.revision || coverage.throughRevision < priorCoverage.throughRevision) invalid('cleanup cut exceeds checkpoint or regresses')
    if (priorCoverage.removed.some(old => !coverage.removed.some(next => equal(old, next)))) invalid('deleted source versions cannot reappear in coverage')
    if (coverage.removedVersions - priorCoverage.removedVersions !== result.removedVersions) invalid('cleanup result count disagrees with new body holes')
    if (operation.kind === 'compact' && (!equal(coverage, priorCoverage) || result.removedVersions !== 0)) invalid('compact must be lossless')
    for (const hole of coverage.removed) {
      const event = manifest.find(event => event.revision === hole.revision && event.bindingId === hole.bindingId)
      const latestAtCheckpoint = manifest.filter(event => event.bindingId === hole.bindingId && event.revision < operation.revision).at(-1)
      if (!event || hole.revision > coverage.throughRevision || !latestAtCheckpoint || hole.revision >= latestAtCheckpoint.revision) invalid('cleanup coverage cannot remove a latest current body')
    }
    priorCoverage = coverage
  }
  const parsed: WorktreeBindingsMaterializedDocument = { schemaVersion: 2, revision: documentRevision, owner, checkpointRev, purgedThroughRevision, rows, manifest, operations }
  if (checkpointRev !== (cleanups.at(-1)?.revision ?? 0) || !equal(sourceCoverage(parsed), priorCoverage)) invalid('checkpoint/source holes do not match durable cleanup receipts')
  return freeze(parsed)
}

/** Trusted program seam, not an authorization module. Runtime MUST authenticate
 * owner/parent/author and authorize every call before exposing any part to tools. */
export function createWorktreeBindings(storageForOwner: WorktreeBindingsStorage, now: () => number = Date.now): WorktreeBindings {
  async function load(owner: InstrumentInstance, signal?: AbortSignal): Promise<WorktreeBindingsMaterializedDocument> {
    signal?.throwIfAborted()
    const raw = await storageForOwner(owner.ownerSessionId).read()
    signal?.throwIfAborted()
    if (raw === undefined) return materialize({ schemaVersion: 1, revision: 0, owner, rows: [] })
    const document = memoized(raw, parseWorktreeBindingsDocument)
    if (!equal(document.owner, owner)) throw new ControlsError('association-conflict', 'storage row belongs to another owner instance or workspace')
    return document
  }
  async function change(owner: InstrumentInstance, select: (row: WorktreeBindingRow) => boolean,
    author: InstrumentAuthor, operationId: string, source: WorktreeBindingVersion['source'],
    update: (row: WorktreeBindingRow, document: WorktreeBindingsMaterializedDocument) => WorktreeBindingValue, command?: WorktreeBindingBusinessUpdate): Promise<WorktreeBindingRow> {
    const recordedAt = revision(now(), 'recordedAt')
    for (let attempt = 0; attempt < 32; attempt += 1) {
      const document = await load(owner), row = document.rows.find(select)
      if (!row) throw new ControlsError('association-conflict', 'binding does not belong to this owner')
      const value = update(row, document)
      if (value === row.value || (command === undefined && equal(value, row.value))) return row
      const nextRevision = increment(document.revision)
      const nextRow: WorktreeBindingMaterializedRow = { ...row, revision: nextRevision, value,
        history: [...row.history, { revision: nextRevision, recordedAt, operationId, source, author, value, ...(command === undefined ? {} : { command }) }] }
      const operation: WorktreeBindingOperation | undefined = command === undefined ? undefined : { operationId, kind: 'business', digest: digest(command), author, bindingId: row.bindingId, revision: nextRevision }
      const next = parseWorktreeBindingsDocument({ ...document, revision: nextRevision, rows: document.rows.map(item => item.bindingId === row.bindingId ? nextRow : item),
        manifest: [...document.manifest, manifestVersion(row.bindingId, nextRow.history.at(-1)!)], operations: operation === undefined ? document.operations : [...document.operations, operation] })
      if (await storageForOwner(owner.ownerSessionId).compareAndSwap(document.revision, next)) return freeze(nextRow)
    }
    throw new ControlsError('concurrent-update', 'binding registry changed repeatedly; reload before retrying')
  }
  async function cleanup(ownerInput: InstrumentInstance, authorInput: InstrumentAuthor, commandInput: WorktreeBindingsCompact | WorktreeBindingsPurgeHistory, kind: 'compact' | 'purge-history', signal?: AbortSignal): Promise<WorktreeBindingsCleanupResult> {
    signal?.throwIfAborted()
    const owner = parseOwner(ownerInput), author = parseAuthor(authorInput)
    if (author.kind === 'agent' && author.sessionId !== owner.ownerSessionId) throw new ControlsError('access-denied', 'source cleanup requires actual owner root agent or direct user')
    const raw = record(commandInput, 'source cleanup command', ['operationId', 'expectedRevision', ...(kind === 'purge-history' ? ['throughRevision', 'bindingIds'] : [])])
    const bindingIds = kind === 'compact' ? [] : array(raw.bindingIds, 'explicit bindingIds').map(value => id(value, 'bindingId')).sort()
    if (kind === 'purge-history' && (bindingIds.length === 0 || new Set(bindingIds).size !== bindingIds.length)) invalid('purge requires an explicit nonempty unique binding selector')
    const command = { operationId: id(raw.operationId, 'operationId'), expectedRevision: revision(raw.expectedRevision, 'expectedRevision'), ...(kind === 'compact' ? {} : { throughRevision: revision(raw.throughRevision, 'throughRevision'), bindingIds }) }
    const throughRevision = kind === 'compact' ? 0 : revision(raw.throughRevision, 'throughRevision')
    if (throughRevision > command.expectedRevision) invalid('history cut cannot exceed expected document revision')
    for (let attempt = 0; attempt < 32; attempt += 1) {
      const document = await load(owner, signal)
      signal?.throwIfAborted()
      const prior = document.operations.find(operation => operation.operationId === command.operationId)
      if (prior) {
        if (prior.kind !== kind || prior.digest !== digest(command) || !equal(prior.author, author) || !prior.result) throw new ControlsError('operation-conflict', 'cleanup operation belongs to another author or payload')
        return freeze({ ...prior.result, replayed: true })
      }
      if (document.revision !== command.expectedRevision) throw new ControlsError('revision-conflict', 'source registry revision changed before cleanup')
      const nextRevision = increment(document.revision)
      if (bindingIds.some(bindingId => !document.rows.some(row => row.bindingId === bindingId))) throw new ControlsError('association-conflict', 'source selector references a binding outside this owner')
      const removed = new Set(document.manifest.filter(event => kind === 'purge-history' && event.retained && bindingIds.includes(event.bindingId) && event.revision <= throughRevision
        && event.revision < document.rows.find(row => row.bindingId === event.bindingId)!.revision).map(event => event.revision))
      const materialized: WorktreeBindingsMaterializedDocument = { ...document, revision: nextRevision, checkpointRev: nextRevision,
        purgedThroughRevision: Math.max(document.purgedThroughRevision, throughRevision),
        rows: document.rows.map(row => ({ ...row, history: row.history.filter(version => !removed.has(version.revision)) })),
        manifest: document.manifest.map(event => removed.has(event.revision) ? { ...event, retained: false } : event) }
      const result = { revision: nextRevision, removedVersions: removed.size, checkpointRev: nextRevision, sourceCoverage: sourceCoverage(materialized) }
      const operation: WorktreeBindingOperation = { operationId: command.operationId, kind, digest: digest(command), author, bindingId: null, revision: nextRevision, result }
      const next = parseWorktreeBindingsDocument({ ...materialized, operations: [...document.operations, operation] })
      const storage = storageForOwner(owner.ownerSessionId)
      signal?.throwIfAborted() // Final checkpoint before starting the actual source write.
      const committed = await storage.compareAndSwap(document.revision, next)
      if (committed) return freeze({ ...result, replayed: false })
      signal?.throwIfAborted() // Refused writes must not be retried after cancellation.
    }
    throw new ControlsError('concurrent-update', 'binding registry repeatedly changed before source cleanup')
  }
  const bindings: WorktreeBindings = {
    async compact(owner, author, command, signal) { return cleanup(owner, author, command, 'compact', signal) },
    async purgeHistory(owner, author, command, signal) { return cleanup(owner, author, command, 'purge-history', signal) },
    async recordOutcome(ownerInput, operationInput, outcomeInput, authorInput) {
      const owner = parseOwner(ownerInput), operationId = id(operationInput, 'operationId'), author = parseAuthor(authorInput)
      const raw = record(outcomeInput, 'native outcome', ['acceptance', 'outcome', 'diagnostic'])
      if (raw.acceptance !== 'unknown' && raw.acceptance !== 'accepted' && raw.acceptance !== 'rejected') invalid('unknown native acceptance')
      if (raw.outcome !== 'failed' && raw.outcome !== 'cancelled' && raw.outcome !== 'accepted-unknown') invalid('unknown native failure outcome')
      if (raw.acceptance === 'rejected' && raw.outcome === 'accepted-unknown') invalid('rejection is not acceptance uncertainty')
      const outcome = { acceptance: raw.acceptance, outcome: raw.outcome, diagnostic: raw.diagnostic === undefined ? null : text(raw.diagnostic, 'diagnostic') } as const
      return change(owner, row => row.value.operationId === operationId, author, operationId, 'program', row => {
        if (row.value.acceptance === 'accepted' && outcome.acceptance === 'rejected') throw new ControlsError('association-conflict', 'accepted native creation cannot become rejected')
        if (row.value.actualCwd !== null && outcome.outcome === 'accepted-unknown') return row.value
        return { ...row.value, ...outcome, acceptance: row.value.acceptance === 'accepted' ? 'accepted' : outcome.acceptance }
      })
    },
    async reconcile(ownerInput, operationInput, headerInput, authorInput) {
      if (headerInput !== null) return bindings.confirm(ownerInput, operationInput, headerInput, authorInput)
      const owner = parseOwner(ownerInput), operationId = id(operationInput, 'operationId'), author = parseAuthor(authorInput)
      return change(owner, row => row.value.operationId === operationId, author, operationId, 'program', row => {
        if (row.value.actualCwd !== null || row.value.acceptance === 'rejected') return row.value
        return { ...row.value, outcome: 'accepted-unknown', diagnostic: 'native acceptance unresolved; inspect planned child header, do not redispatch' }
      })
    },
    async updateBusiness(ownerInput, authorInput, commandInput) {
      const owner = parseOwner(ownerInput), author = parseAuthor(authorInput), command = parseBusinessUpdate(commandInput)
      return change(owner, row => row.bindingId === command.bindingId, author, command.operationId, 'agent', (row, document) => {
        const prior = document.operations.find(operation => operation.operationId === command.operationId)
        if (prior) {
          if (prior.kind !== 'business' || prior.bindingId !== row.bindingId || prior.digest !== digest(command) || !equal(prior.author, author)) throw new ControlsError('operation-conflict', 'business operation already belongs to another author or payload')
          return row.value
        }
        if (row.revision !== command.expectedRevision) throw new ControlsError('revision-conflict', 'binding revision changed; reload before updating')
        if (row.value.business.state === 'cleaned' && command.state !== 'cleaned') throw new ControlsError('invalid-state', 'cleaned binding cannot be reopened; prepare a new binding for a new child')
        return { ...row.value, business: { state: command.state, ...(command.notes === undefined ? row.value.business.notes === undefined ? {} : { notes: row.value.business.notes } : { notes: command.notes }) } }
      }, command)
    },
    async confirm(ownerInput, operationInput, headerInput, authorInput) {
      const owner = parseOwner(ownerInput), operationId = id(operationInput, 'operationId'), author = parseAuthor(authorInput)
      const raw = record(headerInput, 'actual header', ['sessionId', 'parentSessionId', 'cwd'])
      const header = { sessionId: id(raw.sessionId, 'actual sessionId'), parentSessionId: id(raw.parentSessionId, 'actual parentSessionId'), cwd: cwd(raw.cwd) }
      return change(owner, row => row.value.operationId === operationId, author, operationId, 'program', row => {
        if (header.sessionId !== row.value.plannedChildSessionId || header.parentSessionId !== row.value.parentSessionId || header.cwd !== row.value.requestedCwd) throw new ControlsError('association-conflict', 'actual header does not match planned child, parent and cwd')
        return { ...row.value, actualChildSessionId: header.sessionId, actualCwd: header.cwd, acceptance: 'accepted', outcome: 'confirmed', diagnostic: null }
      })
    },
    async registerIntent(ownerInput, authorInput, intentInput) {
      const owner = parseOwner(ownerInput), author = parseAuthor(authorInput), intent = parseIntent(intentInput)
      if (intent.plannedChildSessionId === owner.ownerSessionId) throw new ControlsError('association-conflict', 'planned child cannot be the owner session')
      if (author.kind === 'agent' && author.sessionId !== intent.parentSessionId) throw new ControlsError('access-denied', 'actual agent author must match the creating parent')
      const bindingId = randomUUID(), recordedAt = revision(now(), 'recordedAt')
      for (let attempt = 0; attempt < 32; attempt += 1) {
        const document = await load(owner)
        const prior = document.rows.find(row => row.value.operationId === intent.operationId)
        if (prior) {
          if (prior.creationDigest !== digest(intent) || !equal(prior.creationAuthor, author)) throw new ControlsError('operation-conflict', 'creation operation already belongs to another author or payload')
          return freeze({ dispatch: false, replayed: true, row: prior })
        }
        if (document.operations.some(operation => operation.operationId === intent.operationId)) throw new ControlsError('operation-conflict', 'operationId already belongs to a business update')
        if (document.rows.some(row => row.value.plannedChildSessionId === intent.plannedChildSessionId)) throw new ControlsError('association-conflict', 'child identity already belongs to another binding')
        const nextRevision = increment(document.revision)
        const value: WorktreeBindingValue = { ...intent, actualChildSessionId: null, actualCwd: null, acceptance: 'unknown', outcome: 'pending', diagnostic: null, business: { state: 'active' } }
        const row: WorktreeBindingMaterializedRow = { bindingId, revision: nextRevision, value, creationAuthor: author, creationDigest: digest(intent), identity: identityOf(value), history: [{ revision: nextRevision, recordedAt, operationId: intent.operationId, source: 'intent', author, value }] }
        const next = parseWorktreeBindingsDocument({ ...document, revision: nextRevision, rows: [...document.rows, row], manifest: [...document.manifest, manifestVersion(bindingId, row.history[0]!)],
          operations: [...document.operations, { operationId: intent.operationId, kind: 'creation', digest: digest(intent), author, bindingId, revision: nextRevision }] })
        if (await storageForOwner(owner.ownerSessionId).compareAndSwap(document.revision, next)) return freeze({ dispatch: true, replayed: false, row })
      }
      throw new ControlsError('concurrent-update', 'binding registry changed repeatedly; reload before retrying')
    },
    async query(ownerInput) {
      const document = await load(parseOwner(ownerInput))
      return freeze({ revision: document.revision, checkpointRev: document.checkpointRev, sourceCoverage: sourceCoverage(document), rows: document.rows, current: document.rows.filter(row => row.value.business.state !== 'cleaned').map(row => {
        const latest = row.history.at(-1)!
        return { bindingId: row.bindingId, revision: row.revision, value: row.value, source: latest.source, author: latest.author, recordedAt: latest.recordedAt }
      }) })
    },
  }
  return bindings
}
