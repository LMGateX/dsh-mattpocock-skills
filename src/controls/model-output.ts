import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto'
import { setImmediate as yieldToCaller } from 'node:timers/promises'

/** Model-facing output only. Adapters select authorized domain facts before calling. */
export interface ModelBinding {
  instanceId: string
  workspaceId: string
  callerSessionId: string
  principal: string
  scopeFingerprint: string
}
export type ModelSourceDomain = 'records' | 'windows' | 'assignment' | 'worktree-binding' | 'observation' | 'policy' | 'resource' | 'audit' | 'history'
export interface ModelSource {
  domain: ModelSourceDomain
  /** Stable bounded key from sourceKey(), not an arbitrary storage key or JSONPath. */
  key: string
  sourceVersion: string | number
  value: unknown
  coverage?: unknown
}
/** Must re-authorize the real caller on every call; a locator is never a credential. */
export type AuthorizedSourceResolver = (selector: { domain: ModelSourceDomain; key: string }, signal?: AbortSignal) => ModelSource | null | Promise<ModelSource | null>
export const MODEL_READ_LIMIT = 65_536
export const MODEL_RECEIPT_LIMIT = 8_192
export type ModelKind = 'current' | 'page' | 'receipt' | 'detail' | 'content' | 'error'

export class ModelOutputError extends Error {
  constructor(readonly code: string, message: string, readonly reason?: string) {
    super(message)
    this.name = 'ModelOutputError'
  }
}

/** Byte-limited code-point prefix; JSON escaping is counted later by modelEnvelope. */
export function previewText(text: string, maxBytes = 256) {
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 0) throw new ModelOutputError('invalid-budget', 'Preview byte budget must be a nonnegative integer')
  let shownBytes = 0
  let end = 0
  for (const point of text) {
    const bytes = Buffer.byteLength(point, 'utf8')
    if (shownBytes + bytes > maxBytes) break
    shownBytes += bytes
    end += point.length
  }
  const totalBytes = Buffer.byteLength(text, 'utf8')
  return { text: text.slice(0, end), totalBytes, shownBytes, truncated: end < text.length }
}

/** Explicit representation for a long identity, never a silently shortened ID. */
export function referenceText(text: string, maxBytes = 128) {
  const preview = previewText(text, maxBytes)
  return preview.truncated ? { ...preview, sha256: createHash('sha256').update(text).digest('hex') } : text
}

/** Plugin diagnostics only: do not pass commands, snapshots, or foreign errors here. */
export function modelError(code: string, message: string, reason?: string) {
  return modelEnvelope('error', {}, { code: previewText(code, 128).text, message: previewText(message, 768).text, ...(reason === undefined ? {} : { reason: previewText(reason, 128).text }) })
}

/** Required and minimal facts are explicitly selected by the domain Adapter. */
export function modelReceipt<I extends object, F extends object>(identity: I, facts: F, optional: object = {}, minimalFacts: object = facts) {
  try {
    return modelEnvelope('receipt', identity, { ...optional, ...facts })
  } catch (error) {
    if (!(error instanceof ModelOutputError) || error.code !== 'output-budget-exceeded') throw error
  }
  try {
    return modelEnvelope('receipt', identity, { ...facts, omittedOptional: true })
  } catch (error) {
    if (!(error instanceof ModelOutputError) || error.code !== 'output-budget-exceeded') throw error
  }
  return modelEnvelope('receipt', identity, { ...minimalFacts, omittedOptional: true, projected: true })
}

/** Packs already-authorized, already-projected rows, never raw history/snapshot values.
 * makeEnvelope must be pure; its cursor uses the supplied delivered lastIndex.
 * An oversized first row needs a domain preview/locator, not an endlessly empty page. */
export function packModelRows<T, E>(options: { rows: readonly T[]; limit?: number; budget?: number; makeEnvelope: (rows: T[], lastIndex: number, more: boolean) => E }): E {
  const { rows, makeEnvelope, budget = MODEL_READ_LIMIT, limit = 20 } = options
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) throw new ModelOutputError('invalid-limit', 'Page limit must be between 1 and 100')
  if (!Number.isSafeInteger(budget) || budget < 1 || budget > MODEL_READ_LIMIT) throw new ModelOutputError('invalid-budget', 'Page budget must be between 1 and 65536')
  const empty = makeEnvelope([], -1, rows.length > 0)
  if (jsonBytes(empty) > budget) throw new ModelOutputError('output-budget-exceeded', 'Page metadata exceeds the JSON byte budget')
  if (!rows.length) return empty
  let result = empty
  const packed: T[] = []
  for (let index = 0; index < Math.min(rows.length, limit); index++) {
    packed.push(rows[index]!)
    let candidate: E
    try {
      candidate = makeEnvelope([...packed], index, index + 1 < rows.length)
      if (jsonBytes(candidate) > budget) throw new ModelOutputError('output-budget-exceeded', 'Page exceeds the JSON byte budget')
    } catch (error) {
      if (!(error instanceof ModelOutputError) || error.code !== 'output-budget-exceeded') throw error
      if (index === 0) throw new ModelOutputError('row-too-large', 'First projected row requires a smaller domain preview and a content locator')
      break
    }
    result = candidate
  }
  return result
}

/** Deterministic JSON for ONE selected authorized source, never a complete runtime result. */
export function canonicalJson(value: unknown, signal?: AbortSignal): string {
  return [...canonicalParts(value, signal)].join('')
}

/** Splitting a JS string must not turn an astral code point into two escaped surrogates. */
function* stringParts(text: string): Generator<string> {
  yield '"'
  for (let start = 0; start < text.length;) {
    let end = Math.min(start + 16_384, text.length)
    if (end < text.length && text.charCodeAt(end - 1) >= 0xd800 && text.charCodeAt(end - 1) <= 0xdbff && text.charCodeAt(end) >= 0xdc00 && text.charCodeAt(end) <= 0xdfff) end--
    yield JSON.stringify(text.slice(start, end)).slice(1, -1)
    start = end
  }
  yield '"'
}
function* canonicalParts(value: unknown, signal?: AbortSignal): Generator<string> {
  const ancestors = new Set<object>()
  function* encode(item: unknown, depth: number): Generator<string> {
    signal?.throwIfAborted()
    if (depth > 256) throw new ModelOutputError('invalid-content', 'Selected content is nested too deeply')
    if (item === null) { yield 'null'; return }
    if (typeof item === 'string') { yield* stringParts(item); return }
    if (typeof item === 'boolean' || (typeof item === 'number' && Number.isFinite(item))) { yield JSON.stringify(item); return }
    if (typeof item !== 'object' || ancestors.has(item)) throw new ModelOutputError('invalid-content', 'Selected content must be acyclic JSON data')
    const prototype = Object.getPrototypeOf(item)
    if (!Array.isArray(item) && prototype !== Object.prototype && prototype !== null) throw new ModelOutputError('invalid-content', 'Selected content must contain only JSON objects')
    ancestors.add(item)
    try {
      if (Array.isArray(item)) {
        yield '['
        for (let index = 0; index < item.length; index++) {
          if (index) yield ','
          const descriptor = Object.getOwnPropertyDescriptor(item, index)
          if (descriptor && !('value' in descriptor)) throw new ModelOutputError('invalid-content', 'Selected content cannot contain accessors')
          yield* encode(descriptor?.value ?? null, depth + 1)
        }
        yield ']'
      } else {
        yield '{'
        let first = true
        for (const key of Object.keys(item).sort()) {
          const descriptor = Object.getOwnPropertyDescriptor(item, key)!
          if (!('value' in descriptor)) throw new ModelOutputError('invalid-content', 'Selected content cannot contain accessors')
          if (descriptor.value === undefined) continue
          if (!first) yield ','
          first = false
          yield* stringParts(key)
          yield ':'
          yield* encode(descriptor.value, depth + 1)
        }
        yield '}'
      }
    } finally { ancestors.delete(item) }
  }
  yield* encode(value, 0)
}

/** Awaited cooperative encoding, not a timer loop, background worker or retained cache. */
async function selectedContent(value: unknown, signal?: AbortSignal): Promise<{ bytes: Buffer; contentHash: string }> {
  const chunks: Buffer[] = []
  const hash = createHash('sha256')
  let sinceYield = 0
  for (const part of canonicalParts(value, signal)) {
    signal?.throwIfAborted()
    const bytes = Buffer.from(part, 'utf8')
    chunks.push(bytes)
    hash.update(bytes)
    sinceYield += bytes.length
    if (sinceYield >= 65_536) {
      await yieldToCaller()
      signal?.throwIfAborted()
      sinceYield = 0
    }
  }
  signal?.throwIfAborted()
  return { bytes: Buffer.concat(chunks), contentHash: hash.digest('hex') }
}

export function sourceKey(domain: string, recordId: string): string {
  return createHash('sha256').update(canonicalJson([domain, recordId])).digest('hex')
}

const SOURCE_DOMAINS: readonly string[] = ['records', 'windows', 'assignment', 'worktree-binding', 'observation', 'policy', 'resource', 'audit', 'history']
const TOKEN_LIMIT = 4096
const REPRESENTATION_VERSION = 1
function digest(value: unknown): string { return createHash('sha256').update(canonicalJson(value)).digest('hex') }
function validSource(source: ModelSource): void {
  if (!SOURCE_DOMAINS.includes(source.domain) || typeof source.key !== 'string' || !source.key || Buffer.byteLength(source.key) > 1024
    || (typeof source.sourceVersion !== 'string' && typeof source.sourceVersion !== 'number')
    || (typeof source.sourceVersion === 'number' && !Number.isFinite(source.sourceVersion))
    || (typeof source.sourceVersion === 'string' && Buffer.byteLength(source.sourceVersion) > 1024)) {
    throw new ModelOutputError('invalid-source', 'Selected source requires an allowed domain and bounded identity/version')
  }
}
interface ContentSelector { domain: ModelSourceDomain; key: string; version: string; hash: string }

/** One instance per plugin mount, shared by every model tool and record.detail.
 * Only cryptographic configuration is retained: no body, row, locator or old-version cache.
 * Caller authorization and FIFO/cancellation remain the domain Adapter's responsibility. */
export function createModelOutput(options: { secret?: Uint8Array; mountEpoch?: string; representationVersion?: number } = {}) {
  const secret = options.secret === undefined ? randomBytes(32) : Buffer.from(options.secret)
  if (secret.length !== 32) throw new ModelOutputError('invalid-configuration', 'Model output secret must contain 32 bytes')
  const mount = digest(options.mountEpoch ?? randomBytes(32).toString('hex'))
  const representation = options.representationVersion ?? REPRESENTATION_VERSION
  if (!Number.isSafeInteger(representation) || representation < 1) throw new ModelOutputError('invalid-configuration', 'Representation version must be a positive integer')
  function seal(type: 'content' | 'page', binding: ModelBinding, fields: object): string {
    const payload = canonicalJson({ schema: 2, representation, mount, binding: digest(binding), type, ...fields })
    const iv = randomBytes(12)
    const cipher = createCipheriv('aes-256-gcm', secret, iv)
    cipher.setAAD(Buffer.from('mattpocock-model-output-v2'))
    const encrypted = Buffer.concat([cipher.update(payload, 'utf8'), cipher.final()])
    const token = 'm2.' + Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString('base64url')
    if (Buffer.byteLength(token) > TOKEN_LIMIT) throw new ModelOutputError('invalid-selector', 'Selected locator identity exceeds its bounded representation')
    return token
  }
  function open(type: 'content' | 'page', binding: ModelBinding, token: string): Record<string, unknown> {
    const invalid = () => new ModelOutputError(type === 'content' ? 'invalid-locator' : 'invalid-cursor', 'Selector is invalid for this caller, mount or representation')
    if (typeof token !== 'string' || token.length > TOKEN_LIMIT || !/^m2\.[A-Za-z0-9_-]+$/.test(token)) throw invalid()
    let value: Record<string, unknown>
    try {
      const encoded = token.slice(3)
      const bytes = Buffer.from(encoded, 'base64url')
      if (bytes.length < 29 || bytes.toString('base64url') !== encoded) throw invalid()
      const decipher = createDecipheriv('aes-256-gcm', secret, bytes.subarray(0, 12))
      decipher.setAAD(Buffer.from('mattpocock-model-output-v2'))
      decipher.setAuthTag(bytes.subarray(12, 28))
      value = JSON.parse(Buffer.concat([decipher.update(bytes.subarray(28)), decipher.final()]).toString('utf8')) as Record<string, unknown>
    } catch { throw invalid() }
    if (!value || typeof value !== 'object' || Array.isArray(value) || value.schema !== 2 || value.representation !== representation
      || value.mount !== mount || value.type !== type) throw invalid()
    if (value.binding !== digest(binding)) {
      if (type === 'page') throw new ModelOutputError('revision-conflict', 'Current caller or scope changed; reopen its current view', 'current-view-changed')
      throw invalid()
    }
    return value
  }
  function contentSelector(binding: ModelBinding, token: string): ContentSelector {
    const value = open('content', binding, token)
    if (Object.keys(value).sort().join(',') !== 'binding,domain,hash,key,mount,representation,schema,type,version'
      || typeof value.domain !== 'string' || !SOURCE_DOMAINS.includes(value.domain) || typeof value.key !== 'string'
      || typeof value.version !== 'string' || !/^[a-f0-9]{64}$/.test(value.version)
      || typeof value.hash !== 'string' || !/^[a-f0-9]{64}$/.test(value.hash)) throw new ModelOutputError('invalid-locator', 'Content selector has an invalid schema')
    return value as unknown as ContentSelector
  }
  return {
    pageCursor(binding: ModelBinding, query: unknown, sourceVersion: unknown, lastKey: string): string {
      if (typeof lastKey !== 'string' || Buffer.byteLength(lastKey) > 1024) throw new ModelOutputError('invalid-selector', 'Cursor sort key requires a bounded stable representation')
      return seal('page', binding, { query: digest(query), version: digest(sourceVersion), lastKey })
    },
    readPageCursor(binding: ModelBinding, query: unknown, sourceVersion: unknown, cursor: string): string {
      const value = open('page', binding, cursor)
      if (Object.keys(value).sort().join(',') !== 'binding,lastKey,mount,query,representation,schema,type,version'
        || typeof value.query !== 'string' || value.query !== digest(query) || typeof value.lastKey !== 'string'
        || typeof value.version !== 'string' || !/^[a-f0-9]{64}$/.test(value.version)) throw new ModelOutputError('invalid-cursor', 'Cursor does not select this query')
      if (value.version !== digest(sourceVersion)) throw new ModelOutputError('revision-conflict', 'Current view changed; reopen its first page', 'current-view-changed')
      return value.lastKey
    },
    locator(binding: ModelBinding, source: ModelSource): string {
      validSource(source)
      return seal('content', binding, { domain: source.domain, key: source.key, version: digest(source.sourceVersion), hash: createHash('sha256').update(canonicalJson(source.value)).digest('hex') })
    },
    async readContent(binding: ModelBinding, request: { locator: string; offset?: number }, resolve: AuthorizedSourceResolver, signal?: AbortSignal) {
      signal?.throwIfAborted()
      const selector = contentSelector(binding, request.locator)
      const source = await resolve({ domain: selector.domain, key: selector.key }, signal)
      signal?.throwIfAborted()
      if (source === null) throw new ModelOutputError('unavailable', 'Selected source is unavailable in current authorized coverage')
      validSource(source)
      if (source.domain !== selector.domain || source.key !== selector.key || digest(source.sourceVersion) !== selector.version) {
        throw new ModelOutputError('revision-conflict', 'Selected content changed; reopen its current view before reading', 'content-version-changed')
      }
      const { bytes, contentHash } = await selectedContent(source.value, signal)
      if (contentHash !== selector.hash) throw new ModelOutputError('revision-conflict', 'Selected content changed; reopen its current view before reading', 'content-version-changed')
      const totalBytes = bytes.length
      const offset = request.offset ?? 0
      if (!Number.isSafeInteger(offset) || offset < 0 || offset > totalBytes || (offset < totalBytes && (bytes[offset]! & 0xc0) === 0x80)) {
        throw new ModelOutputError('invalid-offset', 'Content offset must be a UTF-8 code-point byte position within the selected content')
      }
      const envelope = (end: number) => ({ ...binding, schemaVersion: 2 as const, kind: 'content' as const, locator: request.locator, sourceVersion: source.sourceVersion, contentHash, totalBytes, offset, nextOffset: end, done: end === totalBytes, data: bytes.toString('utf8', offset, end), ...(source.coverage === undefined ? {} : { coverage: source.coverage }) })
      // Upper bound by raw bytes first, then account for all JSON string escaping and metadata.
      let low = offset
      let high = Math.min(totalBytes, offset + MODEL_READ_LIMIT)
      let result = envelope(offset)
      if (jsonBytes(result) > MODEL_READ_LIMIT) throw new ModelOutputError('output-budget-exceeded', 'Selected content metadata requires a bounded domain projection')
      while (low <= high) {
        signal?.throwIfAborted()
        const mid = Math.floor((low + high) / 2)
        let end = mid
        while (end > offset && end < totalBytes && (bytes[end]! & 0xc0) === 0x80) end--
        const candidate = envelope(end)
        if (jsonBytes(candidate) <= MODEL_READ_LIMIT) {
          result = candidate
          low = mid + 1
        } else high = mid - 1
      }
      if (offset < totalBytes && result.nextOffset <= offset) throw new ModelOutputError('output-budget-exceeded', 'Content metadata leaves no room for one UTF-8 code point')
      return result
    },
  }
}

export function jsonBytes(value: unknown): number {
  return Buffer.byteLength(JSON.stringify(value), 'utf8')
}

/** A final check, never an arbitrary-object truncator or full-result fallback. */
export function modelEnvelope<I extends object, P extends object>(kind: ModelKind, identity: I, payload: P, budget = kind === 'receipt' || kind === 'error' ? MODEL_RECEIPT_LIMIT : MODEL_READ_LIMIT) {
  const maximum = kind === 'receipt' || kind === 'error' ? MODEL_RECEIPT_LIMIT : MODEL_READ_LIMIT
  if (!Number.isSafeInteger(budget) || budget < 1 || budget > maximum) throw new ModelOutputError('invalid-budget', 'Output budget cannot exceed its fixed model-facing maximum')
  const value = { ...identity, ...payload, schemaVersion: 2 as const, kind }
  if (jsonBytes(value) > budget) throw new ModelOutputError('output-budget-exceeded', 'Projected model output exceeds its JSON byte budget')
  return value
}
