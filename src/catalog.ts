import { readFileSync } from 'node:fs'

export interface CatalogInvocation {
  readonly modelInvocable: boolean
  readonly userInvocable: boolean
}

export interface CatalogSkill {
  readonly name: string
  readonly description: string
  readonly whenToUse?: string
  readonly metadata?: Readonly<Record<string, unknown>>
  readonly frontmatterExtensions?: Readonly<Record<string, unknown>>
  readonly invocation: CatalogInvocation
  readonly channels: readonly ('stable' | 'beta')[]
  readonly directory: string
  readonly skillPath: string
  readonly bodyByteOffset: number
  readonly sha256: string
}

export interface SkillCatalog {
  readonly schemaVersion: 1
  readonly distribution: Readonly<{
    repository: string
    tag: string
    tagObject: string
    commit: string
    upstreamCommit: string
  }>
  readonly channels: Readonly<{
    stable: readonly string[]
    beta: readonly string[]
  }>
  readonly skills: readonly CatalogSkill[]
}

const SKILL_NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const SHA256 = /^[0-9a-f]{64}$/

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error('invalid generated catalog: ' + message)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function assertKeys(record: Record<string, unknown>, required: readonly string[], optional: readonly string[], label: string): void {
  const allowed = new Set([...required, ...optional])
  for (const key of Object.keys(record)) assert(allowed.has(key), label + ' contains unknown key ' + JSON.stringify(key))
  for (const key of required) assert(Object.hasOwn(record, key), label + ' is missing key ' + JSON.stringify(key))
}

function assertJsonObject(value: unknown, label: string): asserts value is Record<string, unknown> {
  assert(isRecord(value), label + ' must be an object')
  for (const [key, entry] of Object.entries(value)) {
    assert(typeof key === 'string', label + ' has an invalid key')
    assertJsonValue(entry, label + '.' + key)
  }
}

function assertJsonValue(value: unknown, label: string): void {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return
  if (typeof value === 'number') {
    assert(Number.isFinite(value), label + ' contains a non-finite number')
    return
  }
  if (Array.isArray(value)) {
    value.forEach((entry, index) => assertJsonValue(entry, label + '[' + index + ']'))
    return
  }
  assertJsonObject(value, label)
}

function assertSafeSkillPath(value: unknown, label: string, suffix = ''): asserts value is string {
  assert(typeof value === 'string' && value.startsWith('skills/') && (suffix === '' || value.endsWith(suffix)), label + ' is invalid')
  assert(!value.includes('\\') && !value.includes('\0'), label + ' is unsafe')
  const segments = value.split('/')
  assert(segments.every((segment) => segment.length > 0 && segment !== '.' && segment !== '..'), label + ' has an unsafe segment')
  assert(value.normalize('NFC') === value, label + ' is not NFC-normalized')
}

function validateCatalog(value: unknown): SkillCatalog {
  assert(isRecord(value), 'root must be an object')
  assertKeys(value, ['schemaVersion', 'distribution', 'channels', 'skills'], [], 'root')
  assert(value.schemaVersion === 1, 'unsupported schemaVersion')

  assert(isRecord(value.distribution), 'distribution must be an object')
  assertKeys(value.distribution, ['repository', 'tag', 'tagObject', 'commit', 'upstreamCommit'], [], 'distribution')
  for (const key of ['repository', 'tag', 'tagObject', 'commit', 'upstreamCommit']) {
    assert(typeof value.distribution[key] === 'string' && value.distribution[key].length > 0, 'distribution.' + key + ' is invalid')
  }

  assert(isRecord(value.channels), 'channels must be an object')
  assertKeys(value.channels, ['stable', 'beta'], [], 'channels')
  assert(Array.isArray(value.channels.stable) && Array.isArray(value.channels.beta), 'channel membership must be arrays')
  const channelNames = new Map<'stable' | 'beta', string[]>([
    ['stable', value.channels.stable as string[]],
    ['beta', value.channels.beta as string[]],
  ])
  for (const [channel, names] of channelNames) {
    assert(names.every((entry) => typeof entry === 'string' && SKILL_NAME.test(entry)), channel + ' contains an invalid Skill name')
    assert(new Set(names).size === names.length, channel + ' contains a duplicate Skill name')
    assert(names.every((entry, index) => index === 0 || names[index - 1]! < entry), channel + ' membership is not sorted')
  }

  assert(Array.isArray(value.skills), 'skills must be an array')
  const skills = value.skills as unknown[]
  const seen = new Set<string>()
  let previousName = ''
  for (const [index, raw] of skills.entries()) {
    const label = 'skills[' + index + ']'
    assert(isRecord(raw), label + ' must be an object')
    assertKeys(raw, ['name', 'description', 'invocation', 'channels', 'directory', 'skillPath', 'bodyByteOffset', 'sha256'], ['whenToUse', 'metadata', 'frontmatterExtensions'], label)
    assert(typeof raw.name === 'string' && SKILL_NAME.test(raw.name), label + '.name is invalid')
    assert(!seen.has(raw.name), label + '.name is duplicated')
    assert(previousName < raw.name, 'skills are not sorted by name')
    previousName = raw.name
    seen.add(raw.name)
    assert(typeof raw.description === 'string' && raw.description.trim().length > 0, label + '.description is invalid')
    if (Object.hasOwn(raw, 'whenToUse')) assert(typeof raw.whenToUse === 'string' && raw.whenToUse.length > 0, label + '.whenToUse is invalid')
    if (Object.hasOwn(raw, 'metadata')) {
      assertJsonObject(raw.metadata, label + '.metadata')
      assert(!Object.hasOwn(raw.metadata, 'frontmatterExtensions'), label + '.metadata reserves frontmatterExtensions for audit metadata')
    }
    if (Object.hasOwn(raw, 'frontmatterExtensions')) assertJsonObject(raw.frontmatterExtensions, label + '.frontmatterExtensions')
    assert(isRecord(raw.invocation), label + '.invocation must be an object')
    assertKeys(raw.invocation, ['modelInvocable', 'userInvocable'], [], label + '.invocation')
    assert(typeof raw.invocation.modelInvocable === 'boolean' && typeof raw.invocation.userInvocable === 'boolean', label + '.invocation is invalid')
    assert(Array.isArray(raw.channels) && raw.channels.length > 0, label + '.channels is invalid')
    assert(raw.channels.every((channel) => channel === 'stable' || channel === 'beta'), label + '.channels contains an unknown channel')
    assert(new Set(raw.channels).size === raw.channels.length, label + '.channels contains a duplicate')
    assertSafeSkillPath(raw.directory, label + '.directory')
    assert(raw.directory.split('/').at(-1) === raw.name, label + '.directory differs from name')
    assertSafeSkillPath(raw.skillPath, label + '.skillPath', '/SKILL.md')
    assert(raw.skillPath === raw.directory + '/SKILL.md', label + '.skillPath differs from directory')
    assert(typeof raw.bodyByteOffset === 'number' && Number.isSafeInteger(raw.bodyByteOffset) && raw.bodyByteOffset > 0, label + '.bodyByteOffset is invalid')
    assert(typeof raw.sha256 === 'string' && SHA256.test(raw.sha256), label + '.sha256 is invalid')
  }

  for (const [channel, names] of channelNames) {
    const derived = skills
      .filter((raw) => (raw as Record<string, unknown>).channels && ((raw as Record<string, unknown>).channels as unknown[]).includes(channel))
      .map((raw) => (raw as Record<string, unknown>).name)
    assert(JSON.stringify(derived) === JSON.stringify(names), channel + ' membership differs from Skill rows')
  }
  assert(channelNames.get('stable')!.every((entry) => channelNames.get('beta')!.includes(entry)), 'beta must contain every stable Skill')

  return value as unknown as SkillCatalog
}

function deepFreeze<T>(value: T): T {
  if (typeof value !== 'object' || value === null || Object.isFrozen(value)) return value
  Object.freeze(value)
  for (const entry of Object.values(value as Record<string, unknown>)) deepFreeze(entry)
  return value
}

export function parseCatalog(text: string): SkillCatalog {
  let value: unknown
  try {
    value = JSON.parse(text)
  } catch (error) {
    throw new Error('cannot parse generated catalog', { cause: error })
  }
  return deepFreeze(validateCatalog(value))
}

export const CATALOG_URL = new URL('../generated/catalog.json', import.meta.url)
export const CATALOG = parseCatalog(readFileSync(CATALOG_URL, 'utf8'))
