export type ControlsErrorCode =
  | 'invalid-input' | 'invalid-state' | 'revision-conflict'
  | 'unknown-session' | 'unknown-workspace' | 'association-conflict' | 'concurrent-update' | 'storage-uncertain' | 'access-denied' | 'operation-conflict' | 'feature-disabled'

/** Mechanical diagnostics only; never business blockers or approval requests. */
export class ControlsError extends Error {
  override readonly name = 'ControlsError'
  constructor(readonly code: ControlsErrorCode, message: string) { super(message) }
}

export function invalid(message: string): never {
  throw new ControlsError('invalid-input', message)
}

const PRE_COMMIT_REJECTIONS: ReadonlySet<ControlsErrorCode> = new Set([
  'invalid-input', 'invalid-state', 'access-denied', 'feature-disabled', 'revision-conflict',
  'operation-conflict', 'concurrent-update', 'association-conflict', 'unknown-session', 'unknown-workspace',
])
/** True when a tracked mutation rejected before it could start its durable write, so the
 * stored documents are unchanged. A pending-read frontier must not report unknown durability
 * for these; storage-uncertain and non-controls errors keep the persistence outcome unknown. */
export function isPreCommitRejection(error: unknown): boolean {
  return error instanceof ControlsError && PRE_COMMIT_REJECTIONS.has(error.code)
}

export function record(value: unknown, where: string, keys?: readonly string[]): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)
    || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) invalid(where + ' must be a plain object')
  const result: Record<string, unknown> = Object.create(null) as Record<string, unknown>
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== 'string' || (keys && !keys.includes(key))) invalid(where + ': unknown key ' + String(key) + (keys === undefined || keys.length === 0 ? '' : '; accepted keys: ' + keys.join(', ')))
    const descriptor = Object.getOwnPropertyDescriptor(value, key)!
    if (!descriptor.enumerable || !Object.hasOwn(descriptor, 'value') || descriptor.value === undefined) invalid(where + ': field must be enumerable JSON data: ' + key)
    result[key] = descriptor.value
  }
  return result
}

/** Dense JSON arrays only: map must not silently skip holes that stringify as null. */
export function array(value: unknown, where: string): readonly unknown[] {
  if (!Array.isArray(value)) invalid(where + ' must be an array')
  for (const key of Reflect.ownKeys(value)) {
    if (key === 'length') continue
    if (typeof key !== 'string' || !/^(0|[1-9][0-9]*)$/u.test(key) || Number(key) >= value.length) invalid(where + ': unexpected array field ' + String(key))
    const descriptor = Object.getOwnPropertyDescriptor(value, key)!
    if (!Object.hasOwn(descriptor, 'value') || descriptor.value === undefined) invalid(where + ': array elements must be JSON data')
  }
  const result: unknown[] = []
  for (let index = 0; index < value.length; index += 1) {
    if (!Object.hasOwn(value, index)) invalid(where + ' must not contain sparse holes')
    result.push(value[index])
  }
  return result
}
/** Dense array with an element budget: a single accepted command must not inflate the durable document. */
export function boundedArray(value: unknown, where: string, maximum: number): readonly unknown[] {
  const rows = array(value, where)
  if (rows.length > maximum) invalid(where + ' accepts at most ' + maximum + ' entries')
  return rows
}
export function id(value: unknown, where: string): string {
  if (typeof value !== 'string' || value.trim() !== value || value.length === 0
    || value.length > 256 || /[\u0000-\u001f\u007f]/u.test(value)) invalid(where + ' must be a non-empty opaque id')
  return value
}

export function revision(value: unknown, where: string): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) invalid(where + ' must be a non-negative safe integer')
  return value
}

export function increment(value: number): number {
  return revision(value + 1, 'next revision')
}

export function boolean(value: unknown, where: string): boolean {
  if (typeof value !== 'boolean') invalid(where + ' must be boolean')
  return value
}

export function capacity(value: unknown, where: string): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 1) invalid(where + ' must be a positive safe integer')
  return value
}

export function freeze<T>(value: T): T {
  if (value !== null && typeof value === 'object') {
    for (const child of Object.values(value)) freeze(child)
    Object.freeze(value)
  }
  return value
}
/** Storage adapters validate, detach and freeze the documents they return. Parsing
 * the returned value again on every read re-walked a whole store per event: one
 * controls-document parse per tool event dominated CPU on a large workspace. Any
 * value a parser produced is registered by identity, so an unchanged document is
 * reused verbatim and an already-parsed document is never parsed twice.
 */
const parsedValues = new WeakMap<object, unknown>()
export function memoized<T>(value: unknown, parse: (input: unknown) => T): T {
    if (value !== null && typeof value === 'object') {
        const known = parsedValues.get(value)
        if (known !== undefined)
            return known as T
    }
    const parsed = parse(value)
    if (parsed !== null && typeof parsed === 'object') {
        // A validated document is recognised wherever it is passed back in.
        parsedValues.set(parsed as object, parsed)
        // A frozen input is one of our own validated documents, so the same value
        // describes the same content; an unfrozen input is left uncached.
        if (Object.isFrozen(value))
            parsedValues.set(value as object, parsed)
    }
    return parsed
}

