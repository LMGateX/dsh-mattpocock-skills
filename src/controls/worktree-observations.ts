import { randomUUID } from 'node:crypto'
import { isAbsolute, normalize } from 'node:path'
import type { InstrumentInstance } from './state.js'
import { parseAuthor } from './instrument-state.js'
import type { InstrumentAuthor } from './instrument-state.js'
import type { VersionedStorage } from './versioned-storage.js'
import { array, boolean, ControlsError, freeze, id, increment, invalid, memoized, record, revision } from './validation.js'

/** One native create_worktree call observed through the tool pipeline. Immutable creation facts. */
export interface WorktreeObservationInput {
  readonly creatorSessionId: string
  /** Tool call identity; a PTC sub-dispatch uses its own sub-call id. */
  readonly callId: string
  readonly rootCallId: string
  readonly turn: number | null
  readonly step: number | null
  readonly path: string
  readonly branch: string
  readonly baseCommit: string
  readonly repositoryRoot: string
}
/** Author-visible, strictly bounded Git facts for one observed checkout; never inferred. */
export interface WorktreeObservationFacts {
  readonly repositoryPath: string
  readonly gitCommonDir: string
  readonly gitDir: string
  readonly pathIdentity: string
  readonly branchRef: string | null
  readonly branchOid: string | null
  readonly headOid: string
}
export interface WorktreeObservationCheck {
  readonly state: 'unverified' | 'verified' | 'failed' | 'absent'
  readonly checkedAt: number | null
  readonly diagnostic: string | null
  /** Last proven facts; retained across a later failed check, never invented. */
  readonly facts: WorktreeObservationFacts | null
}
export interface WorktreeObservationValue extends WorktreeObservationInput {
  readonly check: WorktreeObservationCheck
  readonly business: { readonly state: 'open' | 'cleaned'; readonly notes?: string }
}
export interface WorktreeObservationVersion {
  readonly revision: number
  readonly recordedAt: number
  readonly event: 'observed' | 'verified' | 'verification-failed' | 'absent' | 'cleaned'
  /** 'replay' is a lower-evidence reconstruction from durable session events, never a live observation. */
  readonly source: 'program' | 'replay' | 'agent'
  readonly author: InstrumentAuthor
  readonly value: WorktreeObservationValue
}
export interface WorktreeObservationRow {
  readonly observationId: string
  readonly revision: number
  readonly value: WorktreeObservationValue
  readonly history: readonly WorktreeObservationVersion[]
}
export interface WorktreeObservationsDocument {
  readonly schemaVersion: 1
  readonly revision: number
  readonly owner: InstrumentInstance
  readonly rows: readonly WorktreeObservationRow[]
}
export interface WorktreeObservationCurrent {
  readonly observationId: string
  readonly revision: number
  readonly value: WorktreeObservationValue
  readonly source: WorktreeObservationVersion['source']
  readonly recordedAt: number
}
/** Lane association resolved at read time from durable lane bindings; null when no binding names the creator. */
export interface WorktreeObservationLane {
  readonly workflowId: string | null
  readonly ticketIds: readonly string[]
  readonly task: string | null
}
/** One current row as projected to the model/GUI: durable facts plus read-time live facts. */
export interface WorktreeObservationView extends WorktreeObservationCurrent {
  /** Creator session activity right now; never stored, so it cannot go stale. */
  readonly creatorActivity: 'running' | 'idle' | 'gone'
  readonly lane: WorktreeObservationLane | null
}
export interface WorktreeObservationsSnapshot {
  readonly revision: number
  /** Entire retained registry, including author-cleaned rows and their retained versions. */
  readonly rows: readonly WorktreeObservationRow[]
  /** Open rows only; the runtime adds read-time creator activity and ticket association. */
  readonly current: readonly WorktreeObservationCurrent[]
}
/** Program-only checks. A failed check keeps the unknown explicit instead of reporting success. */
export type WorktreeObservationCheckInput =
  | { readonly observationId: string; readonly kind: 'facts'; readonly facts: WorktreeObservationFacts }
  | { readonly observationId: string; readonly kind: 'absent' }
  | { readonly observationId: string; readonly kind: 'failed'; readonly diagnostic: string }
export interface WorktreeObservationBusinessUpdate {
  readonly operationId: string
  readonly observationId: string
  /** Latest row revision, not the owner document revision. */
  readonly expectedRevision: number
  readonly state: 'open' | 'cleaned'
  readonly notes?: string
}
export interface WorktreeObservations {
  observe(owner: InstrumentInstance, actualAuthor: InstrumentAuthor, input: WorktreeObservationInput, source: 'program' | 'replay'): Promise<{ readonly recorded: boolean; readonly row: WorktreeObservationRow }>
  check(owner: InstrumentInstance, actualAuthor: InstrumentAuthor, input: WorktreeObservationCheckInput): Promise<WorktreeObservationRow>
  updateBusiness(owner: InstrumentInstance, actualAuthor: InstrumentAuthor, command: WorktreeObservationBusinessUpdate): Promise<WorktreeObservationRow>
  query(owner: InstrumentInstance): Promise<WorktreeObservationsSnapshot>
}
export type WorktreeObservationsStorage = (ownerSessionId: string) => VersionedStorage<WorktreeObservationsDocument>

function text(value: unknown, where: string): string {
  if (typeof value !== 'string' || value.length > 4096 || value.includes('\0')) invalid(where + ' must be text of at most 4096 characters')
  return value
}
function absolute(value: unknown, where: string): string {
  if (typeof value !== 'string' || !isAbsolute(value) || normalize(value) !== value || /[\u0000-\u001f\u007f]/u.test(value)) invalid(where + ' must be a normalized absolute path')
  return value
}
function optionalRevision(value: unknown, where: string): number | null {
  return value === null ? null : revision(value, where)
}
function parseOwner(value: unknown): InstrumentInstance {
  const r = record(value, 'observation owner', ['instrumentInstanceId', 'ownerSessionId', 'controlWorkspaceId'])
  return freeze({ instrumentInstanceId: id(r.instrumentInstanceId, 'instrumentInstanceId'), ownerSessionId: id(r.ownerSessionId, 'ownerSessionId'), controlWorkspaceId: id(r.controlWorkspaceId, 'controlWorkspaceId') })
}
function parseInput(value: unknown): WorktreeObservationInput {
  const r = record(value, 'observation creation', ['creatorSessionId', 'callId', 'rootCallId', 'turn', 'step', 'path', 'branch', 'baseCommit', 'repositoryRoot'])
  const commit = (input: unknown, where: string): string => {
    if (typeof input !== 'string' || !/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/u.test(input)) invalid(where + ' must be a Git object id')
    return input
  }
  const branch = id(r.branch, 'branch')
  if (branch.startsWith('-') || /[\u0000-\u001f\u007f]/u.test(branch)) invalid('branch must be a plain Git branch name')
  return freeze({ creatorSessionId: id(r.creatorSessionId, 'creatorSessionId'), callId: id(r.callId, 'callId'), rootCallId: id(r.rootCallId, 'rootCallId'),
    turn: optionalRevision(r.turn, 'turn'), step: optionalRevision(r.step, 'step'), path: absolute(r.path, 'path'), branch,
    baseCommit: commit(r.baseCommit, 'baseCommit'), repositoryRoot: absolute(r.repositoryRoot, 'repositoryRoot') })
}
function parseFacts(value: unknown): WorktreeObservationFacts {
  const r = record(value, 'observation Git facts', ['repositoryPath', 'gitCommonDir', 'gitDir', 'pathIdentity', 'branchRef', 'branchOid', 'headOid'])
  const branchRef = r.branchRef === null ? null : (() => { const ref = id(r.branchRef, 'branchRef'); if (!ref.startsWith('refs/heads/')) invalid('branchRef must be a local branch ref'); return ref })()
  const oid = (input: unknown, where: string): string => {
    if (typeof input !== 'string' || !/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/u.test(input)) invalid(where + ' must be a Git object id')
    return input
  }
  return freeze({ repositoryPath: absolute(r.repositoryPath, 'repositoryPath'), gitCommonDir: absolute(r.gitCommonDir, 'gitCommonDir'), gitDir: absolute(r.gitDir, 'gitDir'),
    pathIdentity: id(r.pathIdentity, 'pathIdentity'), branchRef, branchOid: r.branchOid === null ? null : oid(r.branchOid, 'branchOid'), headOid: oid(r.headOid, 'headOid') })
}
function parseCheck(value: unknown): WorktreeObservationCheck {
  const r = record(value, 'observation check', ['state', 'checkedAt', 'diagnostic', 'facts'])
  if (r.state !== 'unverified' && r.state !== 'verified' && r.state !== 'failed' && r.state !== 'absent') invalid('unknown observation check state')
  const facts = r.facts === null ? null : parseFacts(r.facts)
  if (r.state === 'unverified' && (r.checkedAt !== null || r.diagnostic !== null || facts !== null)) invalid('an unverified observation carries no check result')
  if (r.state === 'verified' && (r.checkedAt === null || r.diagnostic !== null || facts === null)) invalid('a verified observation requires checked time and facts')
  if (r.state === 'absent' && (r.checkedAt === null || r.diagnostic !== null)) invalid('an absent observation requires checked time')
  if (r.state === 'failed' && (r.checkedAt === null || r.diagnostic === null)) invalid('a failed observation requires checked time and diagnostic')
  return { state: r.state, checkedAt: optionalRevision(r.checkedAt, 'checkedAt'), diagnostic: r.diagnostic === null ? null : text(r.diagnostic, 'diagnostic'), facts }
}
function parseValue(value: unknown): WorktreeObservationValue {
  const r = record(value, 'observation value', ['creatorSessionId', 'callId', 'rootCallId', 'turn', 'step', 'path', 'branch', 'baseCommit', 'repositoryRoot', 'check', 'business'])
  const business = record(r.business, 'observation business', ['state', 'notes'])
  if (business.state !== 'open' && business.state !== 'cleaned') invalid('unknown observation business state')
  return freeze({ ...parseInput({ creatorSessionId: r.creatorSessionId, callId: r.callId, rootCallId: r.rootCallId, turn: r.turn, step: r.step, path: r.path, branch: r.branch, baseCommit: r.baseCommit, repositoryRoot: r.repositoryRoot }),
    check: parseCheck(r.check), business: { state: business.state, ...(business.notes === undefined ? {} : { notes: text(business.notes, 'notes') }) } })
}
function parseVersion(value: unknown): WorktreeObservationVersion {
  const r = record(value, 'observation version', ['revision', 'recordedAt', 'event', 'source', 'author', 'value'])
  if (!['observed', 'verified', 'verification-failed', 'absent', 'cleaned'].includes(String(r.event))) invalid('unknown observation event')
  if (r.source !== 'program' && r.source !== 'replay' && r.source !== 'agent') invalid('unknown observation version source')
  return { revision: revision(r.revision, 'version revision'), recordedAt: revision(r.recordedAt, 'recordedAt'), event: r.event as WorktreeObservationVersion['event'],
    source: r.source, author: parseAuthor(r.author), value: parseValue(r.value) }
}
function business(value: WorktreeObservationValue): unknown { return { state: value.business.state, ...(value.business.notes === undefined ? {} : { notes: value.business.notes }) } }
function parseBusinessUpdate(value: unknown): WorktreeObservationBusinessUpdate {
  const r = record(value, 'observation business update', ['operationId', 'observationId', 'expectedRevision', 'state', 'notes'])
  if (r.state !== 'open' && r.state !== 'cleaned') invalid('unknown observation business state')
  return freeze({ operationId: id(r.operationId, 'operationId'), observationId: id(r.observationId, 'observationId'), expectedRevision: revision(r.expectedRevision, 'expectedRevision'),
    state: r.state, ...(r.notes === undefined ? {} : { notes: text(r.notes, 'notes') }) })
}
function equal(a: unknown, b: unknown): boolean { return JSON.stringify(a) === JSON.stringify(b) }
function creationOf(value: WorktreeObservationValue): WorktreeObservationInput {
  return { creatorSessionId: value.creatorSessionId, callId: value.callId, rootCallId: value.rootCallId, turn: value.turn, step: value.step,
    path: value.path, branch: value.branch, baseCommit: value.baseCommit, repositoryRoot: value.repositoryRoot }
}

/** Storage parser: malformed history is rejected, never reset to an empty registry. */
export function parseWorktreeObservationsDocument(value: unknown): WorktreeObservationsDocument {
  const r = record(value, 'worktree observations document', ['schemaVersion', 'revision', 'owner', 'rows'])
  if (r.schemaVersion !== 1) invalid('unknown worktree observations schema')
  const documentRevision = revision(r.revision, 'document revision'), owner = parseOwner(r.owner)
  const rows: WorktreeObservationRow[] = array(r.rows, 'observation rows').map(value => {
    const row = record(value, 'observation row', ['observationId', 'revision', 'value', 'history'])
    const history = array(row.history, 'observation history').map(parseVersion)
    const first = history[0], latest = history.at(-1), parsedValue = parseValue(row.value)
    if (!first || !latest) invalid('observation row requires at least one version')
    if (first.event !== 'observed' || first.value.check.state !== 'unverified' || first.value.business.state !== 'open' || first.source === 'agent') invalid('an observation row must start with a program-observed creation')
    if (!equal(latest.value, parsedValue) || latest.revision !== row.revision) invalid('row must match its latest retained version')
    for (let index = 0; index < history.length; index += 1) {
      const event = history[index]!, previous = history[index - 1]
      // Row identity is the creator session plus the checkout path; only a later observed creation
      // may change the call that produced it (the tree was removed and created again).
      if (event.value.creatorSessionId !== first.value.creatorSessionId || event.value.path !== first.value.path) invalid('observation row identity cannot change')
      if (!previous) continue
      if (!equal(creationOf(event.value), creationOf(previous.value)) && event.event !== 'observed') invalid('only a new observed creation may change the creation facts')
      if (event.revision <= previous.revision) invalid('observation versions must advance')
      const prior = previous.value.check.facts, next = event.value.check.facts
      if (prior !== null && next !== null && !equal({ ...prior, branchOid: null, headOid: null }, { ...next, branchOid: null, headOid: null })) invalid('verified Git identity cannot change or move')
      if (previous.value.business.state === 'cleaned' && event.value.business.state !== 'cleaned') invalid('cleaned observations cannot resurrect')
      if (event.source !== 'agent' && !equal(business(event.value), business(previous.value))) invalid('program observations must preserve authored business state')
    }
    return { observationId: id(row.observationId, 'observationId'), revision: revision(row.revision, 'row revision'), value: parsedValue, history }
  })
  const revisions = rows.flatMap(row => row.history.map(event => event.revision)).sort((a, b) => a - b)
  if (revisions.length !== documentRevision || revisions.some((value, index) => value !== index + 1)) invalid('observation history has a revision gap or duplicate')
  if (new Set(rows.map(row => row.observationId)).size !== rows.length) invalid('duplicate observation identity')
  const calls = rows.flatMap(row => row.history.filter(event => event.event === 'observed').map(event => JSON.stringify([event.value.creatorSessionId, event.value.callId])))
  if (new Set(calls).size !== calls.length) invalid('duplicate observed call identity')
  return freeze({ schemaVersion: 1, revision: documentRevision, owner, rows })
}

/** Trusted program seam, not an authorization module. Runtime MUST authenticate the owner and
 * authorize every call before exposing any part to tools; no model tool writes observations. */
export function createWorktreeObservations(storageForOwner: WorktreeObservationsStorage, now: () => number = Date.now): WorktreeObservations {
  async function load(owner: InstrumentInstance): Promise<WorktreeObservationsDocument> {
    const raw = await storageForOwner(owner.ownerSessionId).read()
    if (raw === undefined) return { schemaVersion: 1, revision: 0, owner, rows: [] }
    const document = memoized(raw, parseWorktreeObservationsDocument)
    if (!equal(document.owner, owner)) throw new ControlsError('association-conflict', 'storage row belongs to another owner instance or workspace')
    return document
  }
  async function change(owner: InstrumentInstance, select: (row: WorktreeObservationRow) => boolean, author: InstrumentAuthor,
    event: WorktreeObservationVersion['event'], source: WorktreeObservationVersion['source'],
    update: (row: WorktreeObservationRow) => WorktreeObservationValue): Promise<WorktreeObservationRow> {
    const recordedAt = revision(now(), 'recordedAt')
    for (let attempt = 0; attempt < 32; attempt += 1) {
      const document = await load(owner), row = document.rows.find(select)
      if (!row) throw new ControlsError('association-conflict', 'observation does not belong to this owner')
      const value = update(row)
      if (equal(value, row.value)) return row
      const nextRevision = increment(document.revision)
      const nextRow: WorktreeObservationRow = { ...row, revision: nextRevision, value, history: [...row.history, { revision: nextRevision, recordedAt, event, source, author, value }] }
      const next = parseWorktreeObservationsDocument({ ...document, revision: nextRevision, rows: document.rows.map(item => item.observationId === row.observationId ? nextRow : item) })
      if (await storageForOwner(owner.ownerSessionId).compareAndSwap(document.revision, next)) return freeze(nextRow)
    }
    throw new ControlsError('concurrent-update', 'observation registry changed repeatedly; reload before retrying')
  }
  const observations: WorktreeObservations = {
    async observe(ownerInput, authorInput, inputInput, source) {
      const owner = parseOwner(ownerInput), author = parseAuthor(authorInput), input = parseInput(inputInput)
      if (author.kind === 'agent' && author.sessionId !== input.creatorSessionId) throw new ControlsError('access-denied', 'observed creator must match the actual program author')
      const recordedAt = revision(now(), 'recordedAt')
      for (let attempt = 0; attempt < 32; attempt += 1) {
        const document = await load(owner)
        // Call identity is durable for the whole row history: a later creation at the same path
        // moves the current call id, so the replay guard cannot read only the latest version.
        const sameCall = document.rows.find(row => row.history.some(event => event.event === 'observed' && event.value.creatorSessionId === input.creatorSessionId && event.value.callId === input.callId))
        if (sameCall) {
          const observed = sameCall.history.find(event => event.event === 'observed' && event.value.callId === input.callId)!
          if (!equal(creationOf(observed.value), input)) throw new ControlsError('operation-conflict', 'observed call already belongs to another creation payload')
          return freeze({ recorded: false, row: sameCall })
        }
        const samePath = document.rows.find(row => row.value.creatorSessionId === input.creatorSessionId && row.value.path === input.path)
        if (samePath) {
          const value: WorktreeObservationValue = { ...input, check: { state: 'unverified', checkedAt: null, diagnostic: null, facts: samePath.value.check.facts }, business: samePath.value.business }
          const nextRevision = increment(document.revision)
          const nextRow: WorktreeObservationRow = { ...samePath, revision: nextRevision, value, history: [...samePath.history, { revision: nextRevision, recordedAt, event: 'observed', source, author, value }] }
          const next = parseWorktreeObservationsDocument({ ...document, revision: nextRevision, rows: document.rows.map(item => item.observationId === samePath.observationId ? nextRow : item) })
          if (await storageForOwner(owner.ownerSessionId).compareAndSwap(document.revision, next)) return freeze({ recorded: true, row: freeze(nextRow) })
          continue
        }
        const value: WorktreeObservationValue = { ...input, check: { state: 'unverified', checkedAt: null, diagnostic: null, facts: null }, business: { state: 'open' } }
        const nextRevision = increment(document.revision)
        const row: WorktreeObservationRow = { observationId: randomUUID(), revision: nextRevision, value, history: [{ revision: nextRevision, recordedAt, event: 'observed', source, author, value }] }
        const next = parseWorktreeObservationsDocument({ ...document, revision: nextRevision, rows: [...document.rows, row] })
        if (await storageForOwner(owner.ownerSessionId).compareAndSwap(document.revision, next)) return freeze({ recorded: true, row: freeze(row) })
      }
      throw new ControlsError('concurrent-update', 'observation registry changed repeatedly; reload before retrying')
    },
    async check(ownerInput, authorInput, inputInput) {
      const owner = parseOwner(ownerInput), author = parseAuthor(authorInput)
      const r = record(inputInput, 'observation check input')
      const observationId = id(r.observationId, 'observationId')
      if (r.kind === 'facts') {
        const facts = parseFacts(r.facts)
        return change(owner, row => row.observationId === observationId, author, 'verified', 'program', row => ({ ...row.value, check: { state: 'verified', checkedAt: revision(now(), 'checkedAt'), diagnostic: null, facts } }))
      }
      if (r.kind === 'absent') return change(owner, row => row.observationId === observationId, author, 'absent', 'program', row => ({ ...row.value, check: { state: 'absent', checkedAt: revision(now(), 'checkedAt'), diagnostic: null, facts: row.value.check.facts } }))
      if (r.kind === 'failed') {
        const diagnostic = text(r.diagnostic, 'diagnostic')
        return change(owner, row => row.observationId === observationId, author, 'verification-failed', 'program', row => ({ ...row.value, check: { state: 'failed', checkedAt: revision(now(), 'checkedAt'), diagnostic, facts: row.value.check.facts } }))
      }
      return invalid('unknown observation check kind')
    },
    async updateBusiness(ownerInput, authorInput, commandInput) {
      const owner = parseOwner(ownerInput), author = parseAuthor(authorInput), command = parseBusinessUpdate(commandInput)
      for (let attempt = 0; attempt < 32; attempt += 1) {
        const document = await load(owner), row = document.rows.find(item => item.observationId === command.observationId)
        if (!row) throw new ControlsError('association-conflict', 'observation does not belong to this owner')
        if (row.revision !== command.expectedRevision) throw new ControlsError('revision-conflict', 'observation revision changed; reload before updating')
        if (row.value.business.state === 'cleaned' && command.state !== 'cleaned') throw new ControlsError('invalid-state', 'cleaned observation cannot be reopened; a later creation appends its own observed version')
        const value: WorktreeObservationValue = { ...row.value, business: { state: command.state, ...(command.notes === undefined ? row.value.business.notes === undefined ? {} : { notes: row.value.business.notes } : { notes: command.notes }) } }
        if (equal(value, row.value)) return row
        const recordedAt = revision(now(), 'recordedAt'), nextRevision = increment(document.revision)
        const nextRow: WorktreeObservationRow = { ...row, revision: nextRevision, value, history: [...row.history, { revision: nextRevision, recordedAt, event: 'cleaned', source: 'agent', author, value }] }
        const next = parseWorktreeObservationsDocument({ ...document, revision: nextRevision, rows: document.rows.map(item => item.observationId === row.observationId ? nextRow : item) })
        if (await storageForOwner(owner.ownerSessionId).compareAndSwap(document.revision, next)) return freeze(nextRow)
      }
      throw new ControlsError('concurrent-update', 'observation registry changed repeatedly; reload before retrying')
    },
    async query(ownerInput) {
      const document = await load(parseOwner(ownerInput))
      return freeze({ revision: document.revision, rows: document.rows, current: document.rows.filter(row => row.value.business.state !== 'cleaned').map(row => {
        // The row's source states how its current creation was recorded (live program observation
        // versus durable-log replay); a later verification event does not upgrade that evidence.
        const observed = row.history.filter(event => event.event === 'observed').at(-1)!
        return { observationId: row.observationId, revision: row.revision, value: row.value, source: observed.source, recordedAt: observed.recordedAt }
      }) })
    },
  }
  return observations
}
