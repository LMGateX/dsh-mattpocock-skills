export type SupervisionPathKind = 'product' | 'support' | 'other'

export interface SupervisionTicketRef { readonly workflowId: string | null; readonly ticketId: string }
export interface SupervisionLedgerEvent {
  readonly at: number
  readonly sessionId: string
  readonly callId: string
  readonly rootCallId: string | null
  readonly tool: string
  readonly path: string | null
  readonly write: boolean
  readonly read: boolean
  /** Assignment facts observed at record/tag time; absent means attribution is unknown. */
  readonly tickets?: readonly SupervisionTicketRef[]
}

interface OwnerLedger {
  readonly events: SupervisionLedgerEvent[]
  readonly sessions: Set<string>
  readonly seen: Set<string>
  dropped: number
}

export interface SupervisionLedgerRoots {
  readonly deliverableRoots: readonly string[]
  readonly supportRoots: readonly string[]
  readonly excludeGlobs: readonly string[]
}

export interface SupervisionLedgerSummary {
  readonly windowHours: number
  readonly events: number
  readonly sessions: number
  readonly dropped: number
  readonly productWrites: number
  readonly supportWrites: number
  readonly otherWrites: number
  readonly productFiles: readonly string[]
  readonly supportFiles: readonly string[]
  readonly lastProductAt: string | null
  readonly noProductHours: number | null
  readonly supportOnly: boolean
  readonly rootsConfigured: boolean
  readonly tickets: readonly SupervisionTicketSummary[]
  readonly unattributedWrites: number
  readonly recent: readonly SupervisionLedgerEvent[]
}
export interface SupervisionTicketSummary {
  readonly workflowId: string | null
  readonly ticketId: string
  readonly productWrites: number
  readonly supportWrites: number
  readonly otherWrites: number
  readonly productFiles: readonly string[]
  readonly supportFiles: readonly string[]
  readonly lastProductAt: string | null
  readonly noProductHours: number | null
  readonly supportOnly: boolean
  readonly lastActivityAt: string
}

const MAX_EVENTS_PER_OWNER = 2000
const MAX_SEEN_PER_OWNER = 4000
const PATH_KEY = /(?:^|_)(?:path|paths|file|files|file_path|filepath|directory|cwd|worktree|target)$/iu
const WRITE_TOOL = /(?:^|_)(?:write|edit|apply|patch|create|delete|remove|move|rename|mkdir|touch|init)(?:$|_)/iu
const READ_TOOL = /(?:^|_)(?:read|glob|grep|list|search|stat|cat|find)(?:$|_)/iu

function normalizedPath(value: string): string {
  const text = value.replaceAll('\\', '/')
  return text.startsWith('./') ? text.slice(2) : text
}
function collectPaths(value: unknown, key: string, depth: number, output: Set<string>): void {
  if (depth > 5 || output.size >= 100) return
  if (typeof value === 'string') {
    if (PATH_KEY.test(key) && value.length > 0 && value.length <= 512) output.add(value)
    return
  }
  if (Array.isArray(value)) {
    for (const row of value.slice(0, 100)) collectPaths(row, key, depth + 1, output)
    return
  }
  if (value !== null && typeof value === 'object') {
    for (const [childKey, child] of Object.entries(value)) collectPaths(child, childKey, depth + 1, output)
  }
}
function operation(name: string): { write: boolean, read: boolean } {
  const value = name.toLowerCase()
  return { write: WRITE_TOOL.test(value), read: READ_TOOL.test(value) }
}
function under(path: string, roots: readonly string[]): boolean {
  const target = normalizedPath(path).replace(/\/+$/u, '')
  for (const raw of roots) {
    const root = normalizedPath(raw).replace(/\/+$/u, '')
    if (root.length === 0) continue
    const prefix = root.endsWith('/**') ? root.slice(0, -3) : root
    if (target === prefix || target.startsWith(prefix + '/')) return true
  }
  return false
}
function rootKind(path: string | null, roots: SupervisionLedgerRoots): SupervisionPathKind {
  if (path === null) return 'other'
  if (under(path, roots.deliverableRoots)) return 'product'
  if (under(path, roots.supportRoots)) return 'support'
  return 'other'
}

/** Bounded, memory-only observation. It never writes storage and never calls a model. */
export class SupervisionLedger {
  private readonly owners = new Map<string, OwnerLedger>()

  record(input: { readonly ownerSessionId: string; readonly sessionId: string; readonly callId: string; readonly rootCallId?: string | null
    readonly tool: string; readonly at?: number; readonly arguments: unknown; readonly tickets?: readonly SupervisionTicketRef[] }): void {
    const owner = this.owner(input.ownerSessionId)
    const paths = new Set<string>()
    collectPaths(input.arguments, '', 0, paths)
    const rows = paths.size === 0 ? [null] : [...paths]
    const op = operation(input.tool)
    for (const path of rows) {
      const key = input.callId + '\u0000' + (path ?? '')
      if (owner.seen.has(key)) continue
      owner.seen.add(key)
      if (owner.seen.size > MAX_SEEN_PER_OWNER) {
        const oldest = owner.seen.values().next().value
        if (oldest !== undefined) owner.seen.delete(oldest)
      }
      owner.events.push(Object.freeze({ at: input.at ?? Date.now(), sessionId: input.sessionId, callId: input.callId,
        rootCallId: input.rootCallId ?? null, tool: input.tool, path, write: op.write, read: op.read,
        ...(input.tickets === undefined || input.tickets.length === 0 ? {} : { tickets: Object.freeze(input.tickets.map(row => Object.freeze({ ...row }))) }) }))
      owner.sessions.add(input.sessionId)
    }
    while (owner.events.length > MAX_EVENTS_PER_OWNER) { owner.events.shift(); owner.dropped += 1 }
  }

  summary(ownerSessionId: string, roots: SupervisionLedgerRoots, now = Date.now(), windowHours = 24): SupervisionLedgerSummary {
    const owner = this.owners.get(ownerSessionId)
    const cutoff = now - windowHours * 60 * 60 * 1000
    const events = (owner?.events ?? []).filter(event => event.at >= cutoff)
    const productFiles = new Set<string>(), supportFiles = new Set<string>()
    let productWrites = 0, supportWrites = 0, otherWrites = 0, lastProductAt = 0, unattributedWrites = 0
    const recent: SupervisionLedgerEvent[] = []
    interface TicketAccumulator { workflowId: string | null; ticketId: string; productWrites: number; supportWrites: number; otherWrites: number; productFiles: Set<string>; supportFiles: Set<string>; lastProductAt: number; lastActivityAt: number }
    const ticketStats = new Map<string, TicketAccumulator>()
    for (const event of events.slice(-50)) {
      const kind = rootKind(event.path, roots)
      if (event.path !== null && (under(event.path, roots.excludeGlobs))) continue
      if (kind === 'product' && event.path !== null) productFiles.add(event.path)
      if (kind === 'support' && event.path !== null) supportFiles.add(event.path)
      if (event.write) {
        if (kind === 'product') { productWrites += 1; lastProductAt = Math.max(lastProductAt, event.at) }
        else if (kind === 'support') supportWrites += 1
        else otherWrites += 1
        const refs = event.tickets ?? []
        if (refs.length === 0) unattributedWrites += 1
        for (const ref of refs) {
          const key = (ref.workflowId ?? '') + '\u0000' + ref.ticketId
          let stat = ticketStats.get(key)
          if (stat === undefined) { stat = { workflowId: ref.workflowId, ticketId: ref.ticketId, productWrites: 0, supportWrites: 0, otherWrites: 0, productFiles: new Set(), supportFiles: new Set(), lastProductAt: 0, lastActivityAt: 0 }; ticketStats.set(key, stat) }
          stat.lastActivityAt = Math.max(stat.lastActivityAt, event.at)
          if (kind === 'product') { stat.productWrites += 1; stat.lastProductAt = Math.max(stat.lastProductAt, event.at); if (event.path !== null) stat.productFiles.add(event.path) }
          else if (kind === 'support') { stat.supportWrites += 1; if (event.path !== null) stat.supportFiles.add(event.path) }
          else stat.otherWrites += 1
        }
      }
      if (recent.length < 50) recent.push(event)
    }
    const tickets = [...ticketStats.values()].sort((a, b) => b.lastActivityAt - a.lastActivityAt || a.ticketId.localeCompare(b.ticketId)).slice(0, 16).map(stat => Object.freeze({
      workflowId: stat.workflowId, ticketId: stat.ticketId, productWrites: stat.productWrites, supportWrites: stat.supportWrites, otherWrites: stat.otherWrites,
      productFiles: Object.freeze([...stat.productFiles].sort()), supportFiles: Object.freeze([...stat.supportFiles].sort()),
      lastProductAt: stat.lastProductAt === 0 ? null : new Date(stat.lastProductAt).toISOString(),
      noProductHours: stat.lastProductAt === 0 ? null : Math.round((now - stat.lastProductAt) / 36_000) / 100,
      supportOnly: stat.supportWrites > 0 && stat.productWrites === 0,
      lastActivityAt: new Date(stat.lastActivityAt).toISOString(),
    }))
    return Object.freeze({
      windowHours, events: events.length, sessions: owner?.sessions.size ?? 0, dropped: owner?.dropped ?? 0,
      productWrites, supportWrites, otherWrites,
      productFiles: Object.freeze([...productFiles].sort()), supportFiles: Object.freeze([...supportFiles].sort()),
      lastProductAt: lastProductAt === 0 ? null : new Date(lastProductAt).toISOString(),
      noProductHours: lastProductAt === 0 ? null : Math.round((now - lastProductAt) / 36_000) / 100,
      supportOnly: supportWrites > 0 && productWrites === 0,
      rootsConfigured: roots.deliverableRoots.length > 0 || roots.supportRoots.length > 0,
      tickets: Object.freeze(tickets), unattributedWrites, recent: Object.freeze(recent),
    })
  }

  /** Attach an observed assignment to one session's not-yet-attributed events. */
  tagSession(ownerSessionId: string, sessionId: string, tickets: readonly SupervisionTicketRef[]): void {
    const owner = this.owners.get(ownerSessionId)
    if (owner === undefined || tickets.length === 0) return
    for (let index = 0; index < owner.events.length; index += 1) {
      const event = owner.events[index]!
      if (event.sessionId !== sessionId || event.tickets !== undefined) continue
      owner.events[index] = Object.freeze({ ...event, tickets: Object.freeze(tickets.map(row => Object.freeze({ ...row }))) })
    }
  }

  clear(): void { this.owners.clear() }
  private owner(id: string): OwnerLedger {
    let owner = this.owners.get(id)
    if (!owner) { owner = { events: [], sessions: new Set(), seen: new Set(), dropped: 0 }; this.owners.set(id, owner) }
    return owner
  }
}

export function supervisionLedgerHasActivity(ledger: SupervisionLedger, ownerSessionId: string): boolean {
  return ledger.summary(ownerSessionId, { deliverableRoots: [], supportRoots: [], excludeGlobs: [] }).events > 0
}
