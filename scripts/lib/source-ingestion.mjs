import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import {
  chmod,
  lstat,
  mkdir,
  mkdtemp,
  open,
  readFile,
  readlink,
  readdir,
  rename,
  rm,
  stat,
  symlink,
  writeFile,
} from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, dirname, join } from 'node:path'
import { posix } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseDocument } from 'yaml'

export const GENERATOR_VERSION = 1
export const CATALOG_SCHEMA_VERSION = 1
export const INVENTORY_SCHEMA_VERSION = 1
export const PROVENANCE_SCHEMA_VERSION = 1
export const SOURCE_LOCK_SCHEMA_VERSION = 1
/** Channel manifest schema emitted by the source distribution. */
export const CHANNEL_SCHEMA_VERSION = 1
/** Upstream provenance manifest schema, shared with the distribution's upstream.json. */
export const UPSTREAM_SCHEMA_VERSION = 3
export const repositoryRoot = fileURLToPath(new URL('../../', import.meta.url))

const SKILL_NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const HEX_OBJECT = /^[0-9a-f]{40}(?:[0-9a-f]{24})?$/
const SHA256 = /^[0-9a-f]{64}$/
const OUTPUT_PATHS = [
  'vendor/mattpocock-skills',
  'generated',
  'PROVENANCE.json',
  'vendor-files.json',
]
/** Distribution-owned files copied verbatim; channel manifests are added per discovered channel. */
const COPIED_METADATA = [
  'DISTRIBUTION.md',
  'LICENSE',
  '.distribution/upstream.json',
]
const CHANNEL_DIRECTORY = '.distribution/channels/'
const CONSUMED_FRONTMATTER = new Set([
  'name',
  'description',
  'whenToUse',
  'metadata',
  'disable-model-invocation',
  'user-invocable',
])

function compareText(a, b) {
  return Buffer.compare(Buffer.from(a), Buffer.from(b))
}

function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

function assertKeys(record, required, optional, label) {
  const allowed = new Set([...required, ...optional])
  for (const key of Object.keys(record)) assert(allowed.has(key), label + ' contains unknown key ' + JSON.stringify(key))
  for (const key of required) assert(Object.hasOwn(record, key), label + ' is missing key ' + JSON.stringify(key))
}

function decodeUtf8(buffer, label) {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buffer)
  } catch (error) {
    throw new Error(label + ' is not valid UTF-8', { cause: error })
  }
}

function canonicalizeJson(value, label = 'value') {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value
  if (typeof value === 'number') {
    assert(Number.isFinite(value), label + ' contains a non-finite number')
    return value
  }
  if (Array.isArray(value)) return value.map((entry, index) => canonicalizeJson(entry, label + '[' + index + ']'))
  assert(isRecord(value), label + ' is not JSON-compatible')
  const result = {}
  for (const key of Object.keys(value).sort(compareText)) result[key] = canonicalizeJson(value[key], label + '.' + key)
  return result
}

export function canonicalJson(value) {
  return JSON.stringify(value, null, 2) + '\n'
}

export function sha256(value) {
  return createHash('sha256').update(value).digest('hex')
}

export function parseStrictJsonBytes(bytes, label) {
  assert(!(bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf), label + ' must not contain a BOM')
  const text = decodeUtf8(bytes, label)
  assert(!text.startsWith('\ufeff'), label + ' must not contain a BOM')
  let value
  try {
    value = JSON.parse(text)
  } catch (error) {
    throw new Error('cannot parse ' + label + ': ' + error.message, { cause: error })
  }
  const document = parseDocument(text, { schema: 'json', uniqueKeys: true, prettyErrors: true })
  assert(document.errors.length === 0, label + ' contains duplicate keys or invalid JSON: ' + document.errors.map((error) => error.message).join('; '))
  assert(document.warnings.length === 0, label + ' contains unsupported JSON features: ' + document.warnings.map((warning) => warning.message).join('; '))
  return value
}

async function readStrictJson(path, label = path) {
  return parseStrictJsonBytes(await readFile(path), label)
}

export function validateSourceLock(lock) {
  assert(isRecord(lock), 'source-lock.json must contain an object')
  assertKeys(lock, ['schemaVersion', 'repository', 'tag', 'tagObject', 'commit', 'verifierSha256', 'upstreamRepository', 'upstreamCommit'], [], 'source-lock.json')
  assert(lock.schemaVersion === SOURCE_LOCK_SCHEMA_VERSION, 'unsupported source lock schemaVersion ' + lock.schemaVersion)
  for (const key of ['repository', 'tag', 'tagObject', 'commit', 'verifierSha256', 'upstreamRepository', 'upstreamCommit']) {
    assert(typeof lock[key] === 'string' && lock[key].length > 0, 'source-lock.json ' + key + ' must be a non-empty string')
  }
  assert(HEX_OBJECT.test(lock.tagObject), 'source-lock.json tagObject is not a full Git object id')
  assert(HEX_OBJECT.test(lock.commit), 'source-lock.json commit is not a full Git object id')
  assert(HEX_OBJECT.test(lock.upstreamCommit), 'source-lock.json upstreamCommit is not a full Git object id')
  assert(SHA256.test(lock.verifierSha256), 'source-lock.json verifierSha256 is invalid')
  try {
    execFileSync('git', ['check-ref-format', 'refs/tags/' + lock.tag], { stdio: 'ignore' })
  } catch (error) {
    throw new Error('source-lock.json tag is not a valid Git tag name', { cause: error })
  }
  return lock
}

export async function loadSourceLock(root = repositoryRoot) {
  return validateSourceLock(await readStrictJson(join(root, 'source-lock.json'), 'source-lock.json'))
}

function git(repo, args, options = {}) {
  try {
    return execFileSync('git', ['-C', repo, ...args], {
      encoding: options.encoding ?? 'utf8',
      maxBuffer: 64 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
  } catch (error) {
    const detail = error.stderr?.toString().trim() || error.message
    throw new Error('git ' + args.join(' ') + ' failed: ' + detail, { cause: error })
  }
}

function run(command, args, cwd) {
  try {
    return execFileSync(command, args, {
      cwd,
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
  } catch (error) {
    const detail = error.stderr?.toString().trim() || error.message
    throw new Error(command + ' ' + args.join(' ') + ' failed: ' + detail, { cause: error })
  }
}

function assertPortableUniquePaths(paths, label) {
  const exact = new Set()
  const portable = new Map()
  for (const path of paths) {
    assert(path.normalize('NFC') === path, label + ' contains a non-NFC path: ' + path)
    assert(!exact.has(path), label + ' contains duplicate path ' + path)
    exact.add(path)
    const key = path.toLowerCase()
    assert(!portable.has(key), label + ' contains a case-fold collision: ' + portable.get(key) + ' and ' + path)
    portable.set(key, path)
  }
}

export function normalizeSkillPath(value, label = 'skill path') {
  assert(typeof value === 'string' && value.length > 0, label + ' must be a non-empty string')
  assert(value.startsWith('./skills/'), label + ' must start with ./skills/: ' + value)
  assert(!value.includes('\\'), label + ' must use forward slashes: ' + value)
  assert(!value.includes('\0'), label + ' contains a NUL byte')
  const stripped = value.slice(2)
  assert(!posix.isAbsolute(stripped), label + ' must be relative: ' + value)
  const parts = stripped.split('/')
  assert(parts.every((part) => part.length > 0 && part !== '.' && part !== '..'), label + ' contains an unsafe segment: ' + value)
  assert(posix.normalize(stripped) === stripped, label + ' is not normalized: ' + value)
  assert(stripped.normalize('NFC') === stripped, label + ' is not NFC-normalized: ' + value)
  assert(parts.length >= 3, label + ' must identify a named Skill directory: ' + value)
  return stripped
}

/** Channel manifests shipped by one distribution commit, in stable order. */
function discoverChannelPaths(tree) {
  const paths = [...tree.keys()].filter((path) => path.startsWith(CHANNEL_DIRECTORY)).sort(compareText)
  const manifests = paths.filter((path) => path.endsWith('.json') && !path.slice(CHANNEL_DIRECTORY.length).includes('/'))
  assert(paths.length > 0, 'source distribution declares no channel manifest under ' + CHANNEL_DIRECTORY)
  assert(JSON.stringify(paths) === JSON.stringify(manifests), 'unexpected files under ' + CHANNEL_DIRECTORY)
  for (const path of manifests) {
    const name = path.slice(CHANNEL_DIRECTORY.length, -'.json'.length)
    assert(SKILL_NAME.test(name), 'channel manifest name is not kebab-case: ' + name)
  }
  return manifests
}

function assertNoOverlappingRoots(paths, label) {
  const sorted = [...paths].sort(compareText)
  for (let index = 0; index < sorted.length; index += 1) {
    for (let other = index + 1; other < sorted.length; other += 1) {
      assert(!sorted[other].startsWith(sorted[index] + '/'), label + ' contains overlapping roots ' + sorted[index] + ' and ' + sorted[other])
    }
  }
}

function validateChannelManifest(manifest, expectedChannel) {
  assert(isRecord(manifest), expectedChannel + ' manifest must contain an object')
  assertKeys(
    manifest,
    ['schemaVersion', 'channel', 'stability', 'upstreamCommit', 'generatedFrom', 'skills'],
    ['extends', 'additionalSkills'],
    expectedChannel + ' manifest',
  )
  assert(manifest.schemaVersion === CHANNEL_SCHEMA_VERSION, 'unsupported ' + expectedChannel + ' manifest schemaVersion ' + manifest.schemaVersion)
  assert(manifest.channel === expectedChannel, expectedChannel + ' manifest channel mismatch')
  assert(manifest.stability === expectedChannel, expectedChannel + ' manifest stability mismatch')
  assert(typeof manifest.generatedFrom === 'string' && manifest.generatedFrom.length > 0, expectedChannel + ' manifest generatedFrom is invalid')
  assert(typeof manifest.upstreamCommit === 'string' && HEX_OBJECT.test(manifest.upstreamCommit), expectedChannel + ' manifest upstreamCommit is invalid')
  assert(Array.isArray(manifest.skills), expectedChannel + ' manifest skills must be an array')
  const skills = manifest.skills.map((value, index) => normalizeSkillPath(value, expectedChannel + '.skills[' + index + ']'))
  assertPortableUniquePaths(skills, expectedChannel + ' manifest')
  assertNoOverlappingRoots(skills, expectedChannel + ' manifest')
  if (Object.hasOwn(manifest, 'extends')) {
    assert(typeof manifest.extends === 'string' && manifest.extends.length > 0, expectedChannel + ' manifest extends is invalid')
    assert(manifest.extends !== expectedChannel, expectedChannel + ' manifest must not extend itself')
    assert(Array.isArray(manifest.additionalSkills), expectedChannel + ' manifest must declare additionalSkills when it extends another channel')
    const additional = manifest.additionalSkills.map((value, index) => normalizeSkillPath(value, expectedChannel + '.additionalSkills[' + index + ']'))
    assertPortableUniquePaths(additional, expectedChannel + ' additionalSkills')
    for (const path of additional) assert(skills.includes(path), expectedChannel + ' additionalSkills names an unselected Skill ' + path)
  } else {
    assert(!Object.hasOwn(manifest, 'additionalSkills'), expectedChannel + ' manifest declares additionalSkills without extends')
  }
  return { manifest, skills }
}

function validateUpstreamManifest(upstream) {
  assert(isRecord(upstream), 'upstream manifest must contain an object')
  assertKeys(upstream, ['schemaVersion', 'repository', 'remote', 'branch', 'commit', 'commitDate', 'recordedAt', 'contentPolicy', 'previewSkills', 'upstreamContentSha256'], [], 'upstream manifest')
  assert(upstream.schemaVersion === UPSTREAM_SCHEMA_VERSION, 'unsupported upstream manifest schemaVersion ' + upstream.schemaVersion)
  for (const key of ['repository', 'remote', 'branch', 'commit', 'commitDate', 'recordedAt', 'contentPolicy', 'upstreamContentSha256']) {
    assert(typeof upstream[key] === 'string' && upstream[key].length > 0, 'upstream manifest ' + key + ' is invalid')
  }
  assert(HEX_OBJECT.test(upstream.commit), 'upstream manifest commit is invalid')
  assert(SHA256.test(upstream.upstreamContentSha256), 'upstream manifest content hash is invalid')
  // Recorded for provenance only; the plugin resolves Skills from the channel manifests.
  assert(Array.isArray(upstream.previewSkills), 'upstream manifest previewSkills must be an array')
  for (const [index, value] of upstream.previewSkills.entries()) {
    normalizeSkillPath(value, 'upstream manifest previewSkills[' + index + ']')
  }
  return upstream
}

function parseNullRecords(buffer) {
  const records = []
  let start = 0
  for (let index = 0; index < buffer.length; index += 1) {
    if (buffer[index] !== 0) continue
    records.push(buffer.subarray(start, index))
    start = index + 1
  }
  assert(start === buffer.length, 'Git tree output is not NUL terminated')
  return records
}

function assertSafeRepositoryPath(path, label) {
  assert(typeof path === 'string' && path.length > 0, label + ' must be non-empty')
  assert(!path.startsWith('/') && !path.includes('\\') && !path.includes('\0'), label + ' is unsafe: ' + path)
  const parts = path.split('/')
  assert(parts.every((part) => part.length > 0 && part !== '.' && part !== '..'), label + ' has an unsafe segment: ' + path)
  assert(posix.normalize(path) === path, label + ' is not normalized: ' + path)
  assert(path.normalize('NFC') === path, label + ' is not NFC-normalized: ' + path)
  return path
}

function readGitTree(repo, commit) {
  const raw = git(repo, ['ls-tree', '-r', '-z', commit], { encoding: 'buffer' })
  const entries = new Map()
  for (const recordBuffer of parseNullRecords(raw)) {
    const record = decodeUtf8(recordBuffer, 'Git tree entry')
    const tab = record.indexOf('\t')
    assert(tab > 0, 'malformed Git tree entry')
    const header = record.slice(0, tab).split(' ')
    const path = record.slice(tab + 1)
    assert(header.length === 3, 'malformed Git tree header for ' + path)
    const [mode, type, object] = header
    assert(['100644', '100755', '120000', '160000'].includes(mode), 'unsupported Git mode ' + mode + ' for ' + path)
    assert(type === 'blob' || type === 'commit', 'unsupported Git type ' + type + ' for ' + path)
    assert(HEX_OBJECT.test(object), 'invalid Git object id for ' + path)
    assertSafeRepositoryPath(path, 'Git path')
    assert(!entries.has(path), 'duplicate Git tree path ' + path)
    entries.set(path, { path, mode, type, object })
  }
  return entries
}

function gitBlob(repo, object) {
  return git(repo, ['cat-file', 'blob', object], { encoding: 'buffer' })
}

function lineBounds(buffer, start) {
  const newline = buffer.indexOf(10, start)
  const end = newline < 0 ? buffer.length : newline
  const contentEnd = end > start && buffer[end - 1] === 13 ? end - 1 : end
  return { contentStart: start, contentEnd, next: newline < 0 ? buffer.length : newline + 1 }
}

export function parseSkillMarkdown(buffer, label = 'SKILL.md') {
  assert(Buffer.isBuffer(buffer), label + ' must be provided as a Buffer')
  assert(!(buffer.length >= 3 && buffer[0] === 0xef && buffer[1] === 0xbb && buffer[2] === 0xbf), label + ' must not contain a BOM')
  const first = lineBounds(buffer, 0)
  assert(buffer.subarray(first.contentStart, first.contentEnd).equals(Buffer.from('---')), label + ' must start with exact YAML frontmatter delimiter')
  let cursor = first.next
  let closing
  while (cursor <= buffer.length) {
    const line = lineBounds(buffer, cursor)
    if (buffer.subarray(line.contentStart, line.contentEnd).equals(Buffer.from('---'))) {
      closing = line
      break
    }
    if (line.next === buffer.length) break
    cursor = line.next
  }
  assert(closing, label + ' has unclosed YAML frontmatter')
  const yamlText = decodeUtf8(buffer.subarray(first.next, closing.contentStart), label + ' frontmatter')
  const document = parseDocument(yamlText, { uniqueKeys: true, prettyErrors: true })
  assert(document.errors.length === 0, label + ' frontmatter is invalid: ' + document.errors.map((error) => error.message).join('; '))
  assert(document.warnings.length === 0, label + ' frontmatter contains unsupported YAML: ' + document.warnings.map((warning) => warning.message).join('; '))
  let data
  try {
    data = document.toJS({ maxAliasCount: 0 })
  } catch (error) {
    throw new Error(label + ' frontmatter aliases are unsupported: ' + error.message, { cause: error })
  }
  assert(isRecord(data), label + ' frontmatter must be an object')
  for (const legacy of ['disableModelInvocation', 'modelInvocable', 'userInvocable']) {
    assert(!Object.hasOwn(data, legacy), label + ' uses unsupported legacy key ' + legacy)
  }
  assert(typeof data.name === 'string' && SKILL_NAME.test(data.name), label + ' name must be kebab-case')
  assert(typeof data.description === 'string' && data.description.trim().length > 0, label + ' description must be a non-empty string')
  if (Object.hasOwn(data, 'disable-model-invocation')) assert(typeof data['disable-model-invocation'] === 'boolean', label + ' disable-model-invocation must be boolean')
  if (Object.hasOwn(data, 'user-invocable')) assert(typeof data['user-invocable'] === 'boolean', label + ' user-invocable must be boolean')
  if (Object.hasOwn(data, 'whenToUse')) assert(typeof data.whenToUse === 'string' && data.whenToUse.length > 0, label + ' whenToUse must be a non-empty string')
  if (Object.hasOwn(data, 'metadata')) assert(isRecord(data.metadata), label + ' metadata must be an object')

  const extensions = {}
  for (const key of Object.keys(data).sort(compareText)) {
    if (!CONSUMED_FRONTMATTER.has(key)) extensions[key] = canonicalizeJson(data[key], label + ' frontmatter.' + key)
  }
  const entry = {
    name: data.name,
    description: data.description,
    invocation: {
      modelInvocable: data['disable-model-invocation'] !== true,
      userInvocable: data['user-invocable'] !== false,
    },
    bodyByteOffset: closing.next,
  }
  if (typeof data.whenToUse === 'string') entry.whenToUse = data.whenToUse
  if (isRecord(data.metadata)) entry.metadata = canonicalizeJson(data.metadata, label + ' metadata')
  if (Object.keys(extensions).length > 0) entry.frontmatterExtensions = extensions
  return entry
}

function resolveSymlink(path, target, skillDirectory) {
  assert(typeof target === 'string' && target.length > 0, 'symlink target is empty for ' + path)
  assert(target.normalize('NFC') === target, 'symlink target is not NFC-normalized for ' + path)
  assert(!target.includes('\\') && !target.includes('\0') && !posix.isAbsolute(target), 'symlink target is unsafe for ' + path + ': ' + target)
  const resolved = posix.normalize(posix.join(posix.dirname(path), target))
  assert(resolved === skillDirectory || resolved.startsWith(skillDirectory + '/'), 'symlink escapes Skill directory: ' + path + ' -> ' + target)
  return resolved
}

function treeHasPath(tree, path) {
  return tree.has(path) || [...tree.keys()].some((candidate) => candidate.startsWith(path + '/'))
}

function validateSelectedSymlinks(repo, tree, skillDirectory, entries) {
  for (const entry of entries) {
    if (entry.mode !== '120000') continue
    const visited = new Set([entry.path])
    let current = entry
    while (current?.mode === '120000') {
      const target = decodeUtf8(gitBlob(repo, current.object), 'symlink target ' + current.path)
      const resolved = resolveSymlink(current.path, target, skillDirectory)
      assert(treeHasPath(tree, resolved), 'symlink is dangling: ' + current.path + ' -> ' + target)
      assert(!visited.has(resolved), 'symlink cycle detected at ' + resolved)
      visited.add(resolved)
      current = tree.get(resolved)
    }
  }
}

async function materializeEntry(repo, entry, destination, skillDirectory) {
  assert(entry.type === 'blob', 'Git submodules are unsupported: ' + entry.path)
  const payload = gitBlob(repo, entry.object)
  await mkdir(dirname(destination), { recursive: true })
  if (entry.mode === '120000') {
    const target = decodeUtf8(payload, 'symlink target ' + entry.path)
    resolveSymlink(entry.path, target, skillDirectory)
    await symlink(target, destination)
    return
  }
  assert(entry.mode === '100644' || entry.mode === '100755', 'unsupported file mode for ' + entry.path)
  const mode = entry.mode === '100755' ? 0o755 : 0o644
  await writeFile(destination, payload, { mode })
  await chmod(destination, mode)
}

async function materializeFile(repo, tree, sourcePath, destination) {
  const entry = tree.get(sourcePath)
  assert(entry, 'source path is missing from Git tree: ' + sourcePath)
  assert(entry.type === 'blob' && entry.mode !== '120000', 'metadata path must be a regular file: ' + sourcePath)
  await materializeEntry(repo, entry, destination, posix.dirname(sourcePath))
}

function selectedTreeEntries(repo, tree, commit, skillDirectory) {
  let object
  try {
    object = git(repo, ['rev-parse', commit + ':' + skillDirectory]).trim()
  } catch (error) {
    throw new Error('selected Skill root is missing: ' + skillDirectory, { cause: error })
  }
  assert(git(repo, ['cat-file', '-t', object]).trim() === 'tree', 'selected Skill root is not a Git tree: ' + skillDirectory)
  const prefix = skillDirectory + '/'
  const entries = [...tree.values()].filter((entry) => entry.path.startsWith(prefix)).sort((a, b) => compareText(a.path, b.path))
  assert(entries.length > 0, 'selected Skill directory is empty: ' + skillDirectory)
  assert(entries.some((entry) => entry.path === prefix + 'SKILL.md'), 'selected Skill is missing SKILL.md: ' + skillDirectory)
  assertPortableUniquePaths(entries.map((entry) => entry.path), 'selected tree ' + skillDirectory)
  validateSelectedSymlinks(repo, tree, skillDirectory, entries)
  return entries
}

async function materializeSkillDirectory(repo, entries, skillDirectory, vendorRoot) {
  for (const entry of entries) await materializeEntry(repo, entry, join(vendorRoot, ...entry.path.split('/')), skillDirectory)
}

function validateManifestRelationship(channels) {
  for (const [name, channel] of Object.entries(channels)) {
    if (!Object.hasOwn(channel.manifest, 'extends')) continue
    const baseName = channel.manifest.extends
    const base = channels[baseName]
    assert(base, name + ' manifest extends an unknown channel ' + baseName)
    const baseSet = new Set(base.skills)
    const ownSet = new Set(channel.skills)
    for (const path of base.skills) assert(ownSet.has(path), name + ' channel is missing ' + baseName + ' Skill ' + path)
    const actualAdditional = channel.skills.filter((path) => !baseSet.has(path)).sort(compareText)
    const declaredAdditional = channel.manifest.additionalSkills
      .map((value, index) => normalizeSkillPath(value, name + '.additionalSkills[' + index + ']'))
      .sort(compareText)
    assert(
      JSON.stringify(actualAdditional) === JSON.stringify(declaredAdditional),
      name + ' additionalSkills does not match the difference from ' + baseName,
    )
  }
}

function catalogFromSkills(lock, channelNames, skillRows) {
  const channels = {}
  for (const name of channelNames) {
    channels[name] = skillRows.filter((row) => row.channels.includes(name)).map((row) => row.name).sort(compareText)
  }
  return {
    schemaVersion: CATALOG_SCHEMA_VERSION,
    distribution: {
      repository: lock.repository,
      tag: lock.tag,
      tagObject: lock.tagObject,
      commit: lock.commit,
      upstreamCommit: lock.upstreamCommit,
    },
    channels,
    skills: skillRows.sort((a, b) => compareText(a.name, b.name)),
  }
}

/** Channel names that select one Skill directory, in stable order. */
function channelNamesForDirectory(channels, skillDirectory) {
  return Object.keys(channels)
    .filter((name) => channels[name].set.has(skillDirectory))
    .sort(compareText)
}

async function walkInventory(root) {
  const entries = []
  const directories = []
  async function visit(directory, prefix = '') {
    if (prefix) directories.push(prefix)
    const children = await readdir(directory, { withFileTypes: true })
    children.sort((a, b) => compareText(a.name, b.name))
    for (const child of children) {
      const relativePath = prefix ? prefix + '/' + child.name : child.name
      assertSafeRepositoryPath(relativePath, 'vendor path')
      const absolutePath = join(directory, child.name)
      const info = await lstat(absolutePath)
      if (info.isDirectory()) {
        await visit(absolutePath, relativePath)
      } else if (info.isSymbolicLink()) {
        const target = await readlink(absolutePath)
        assert(!target.includes('\\') && !target.includes('\0') && !posix.isAbsolute(target), 'unsafe vendored symlink ' + relativePath)
        const resolved = posix.normalize(posix.join(posix.dirname(relativePath), target))
        assert(resolved !== '..' && !resolved.startsWith('../'), 'vendored symlink escapes vendor root: ' + relativePath)
        const payload = Buffer.from(target)
        entries.push({ path: relativePath, kind: 'symlink', mode: '120000', size: payload.length, sha256: sha256(payload), target })
      } else if (info.isFile()) {
        const payload = await readFile(absolutePath)
        entries.push({ path: relativePath, kind: 'file', mode: info.mode & 0o111 ? '100755' : '100644', size: payload.length, sha256: sha256(payload) })
      } else {
        throw new Error('unsupported vendor file type: ' + relativePath)
      }
    }
  }
  await visit(root)
  assertPortableUniquePaths(entries.map((entry) => entry.path), 'vendor inventory')
  const derivedDirectories = new Set()
  for (const entry of entries) {
    let parent = posix.dirname(entry.path)
    while (parent !== '.') {
      derivedDirectories.add(parent)
      parent = posix.dirname(parent)
    }
  }
  assert(JSON.stringify([...directories].sort(compareText)) === JSON.stringify([...derivedDirectories].sort(compareText)), 'vendor contains unexpected empty directories')
  const entryMap = new Map(entries.map((entry) => [entry.path, entry]))
  for (const entry of entries) {
    if (entry.kind !== 'symlink') continue
    const visited = new Set([entry.path])
    let current = entry
    while (current?.kind === 'symlink') {
      const resolved = posix.normalize(posix.join(posix.dirname(current.path), current.target))
      assert(entryMap.has(resolved) || derivedDirectories.has(resolved), 'vendored symlink is dangling: ' + current.path + ' -> ' + current.target)
      assert(!current.path.startsWith(resolved + '/'), 'vendored symlink targets an ancestor directory: ' + current.path)
      if (current.path.startsWith('skills/')) {
        const skillRoot = current.path.split('/').slice(0, 3).join('/')
        assert(resolved === skillRoot || resolved.startsWith(skillRoot + '/'), 'vendored symlink escapes Skill directory: ' + current.path)
      }
      assert(!visited.has(resolved), 'vendored symlink cycle detected at ' + resolved)
      visited.add(resolved)
      current = entryMap.get(resolved)
    }
  }
  const rootHash = createHash('sha256')
  rootHash.update('dsh-mattpocock-vendor-v1\0')
  let totalBytes = 0
  for (const entry of entries) {
    totalBytes += entry.size
    rootHash.update(entry.mode + '\0' + entry.kind + '\0' + entry.path + '\0' + entry.sha256 + '\0' + (entry.target ?? '') + '\0')
  }
  return {
    schemaVersion: INVENTORY_SCHEMA_VERSION,
    root: 'vendor/mattpocock-skills',
    hashAlgorithm: 'sha256',
    fileCount: entries.length,
    totalBytes,
    rootSha256: rootHash.digest('hex'),
    entries,
  }
}

function provenanceFromArtifacts(lock, sourceLockSha256, upstream, sourceVerifierSha256, channelEntries, inventory, catalogBytes, catalogSkillCount) {
  return {
    schemaVersion: PROVENANCE_SCHEMA_VERSION,
    generator: {
      name: 'update-source',
      package: '@lmgatex/dsh-mattpocock-skills',
      version: GENERATOR_VERSION,
    },
    sourceLockSha256,
    sourceDistribution: {
      repository: lock.repository,
      tag: lock.tag,
      tagObject: lock.tagObject,
      commit: lock.commit,
      verifier: {
        path: '.distribution/scripts/verify-channels.mjs',
        sha256: sourceVerifierSha256,
        invocation: ['node', '.distribution/scripts/verify-channels.mjs'],
      },
    },
    upstream: {
      repository: upstream.repository,
      commit: upstream.commit,
      contentSha256: upstream.upstreamContentSha256,
    },
    manifests: channelEntries.map((entry) => ({
      channel: entry.name,
      path: 'vendor/mattpocock-skills/' + entry.path,
      schemaVersion: entry.manifest.schemaVersion,
      sha256: sha256(entry.bytes),
      skillCount: entry.skills.length,
    })),
    catalog: {
      path: 'generated/catalog.json',
      sha256: sha256(catalogBytes),
      skillCount: catalogSkillCount,
    },
    inventory: {
      path: 'vendor-files.json',
      root: inventory.root,
      hashAlgorithm: inventory.hashAlgorithm,
      fileCount: inventory.fileCount,
      totalBytes: inventory.totalBytes,
      rootSha256: inventory.rootSha256,
    },
  }
}

async function prepareVerifiedClone(source, lock) {
  const temp = await mkdtemp(join(tmpdir(), 'dsh-mattpocock-source-'))
  const repo = join(temp, 'repository')
  try {
    execFileSync('git', ['clone', '--quiet', '--no-checkout', '--', source, repo], {
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    const tagRef = 'refs/tags/' + lock.tag
    const type = git(repo, ['cat-file', '-t', tagRef]).trim()
    assert(type === 'tag', 'source tag must be annotated; found ' + type)
    const tagObject = git(repo, ['rev-parse', tagRef]).trim()
    assert(tagObject === lock.tagObject, 'source tag object mismatch: expected ' + lock.tagObject + ', got ' + tagObject)
    const commit = git(repo, ['rev-parse', tagRef + '^{}']).trim()
    assert(commit === lock.commit, 'source tag commit mismatch: expected ' + lock.commit + ', got ' + commit)
    assert(git(repo, ['cat-file', '-t', commit]).trim() === 'commit', 'source lock commit is not a commit object')
    const verifierObject = git(repo, ['rev-parse', commit + ':.distribution/scripts/verify-channels.mjs']).trim()
    assert(git(repo, ['cat-file', '-t', verifierObject]).trim() === 'blob', 'source verifier is not a Git blob')
    assert(sha256(gitBlob(repo, verifierObject)) === lock.verifierSha256, 'source verifier hash differs from source lock')
    git(repo, ['checkout', '--quiet', '--detach', commit])
    run(process.execPath, ['.distribution/scripts/verify-channels.mjs'], repo)
    const statusText = git(repo, ['status', '--porcelain=v1', '--untracked-files=all']).trim()
    assert(statusText === '', 'source verifier left a dirty checkout: ' + statusText)
    return { temp, repo }
  } catch (error) {
    await rm(temp, { recursive: true, force: true })
    throw error
  }
}

async function loadGitJson(repo, tree, path, label) {
  const entry = tree.get(path)
  assert(entry?.type === 'blob' && entry.mode !== '120000', label + ' is missing or not a regular file')
  const bytes = gitBlob(repo, entry.object)
  return { bytes, value: parseStrictJsonBytes(bytes, label) }
}

function skillCatalogRow(repo, tree, skillDirectory, channels) {
  const skillPath = skillDirectory + '/SKILL.md'
  const entry = tree.get(skillPath)
  assert(entry?.type === 'blob' && entry.mode !== '120000', 'SKILL.md must be a regular file: ' + skillPath)
  const bytes = gitBlob(repo, entry.object)
  const parsed = parseSkillMarkdown(bytes, skillPath)
  assert(parsed.name === basename(skillDirectory), skillPath + ' declares ' + parsed.name + ' instead of directory name ' + basename(skillDirectory))
  const channelNames = channelNamesForDirectory(channels, skillDirectory)
  assert(channelNames.length > 0, 'Skill is selected by no channel: ' + skillDirectory)
  return {
    name: parsed.name,
    description: parsed.description,
    ...(parsed.whenToUse === undefined ? {} : { whenToUse: parsed.whenToUse }),
    invocation: parsed.invocation,
    ...(parsed.metadata === undefined ? {} : { metadata: parsed.metadata }),
    ...(parsed.frontmatterExtensions === undefined ? {} : { frontmatterExtensions: parsed.frontmatterExtensions }),
    channels: channelNames,
    directory: skillDirectory,
    skillPath,
    bodyByteOffset: parsed.bodyByteOffset,
    sha256: sha256(bytes),
  }
}

async function buildStage(root, source, stageRoot) {
  const lockPath = join(root, 'source-lock.json')
  const lockBytes = await readFile(lockPath)
  const lock = validateSourceLock(parseStrictJsonBytes(lockBytes, 'source-lock.json'))
  const clone = await prepareVerifiedClone(source, lock)
  try {
    const tree = readGitTree(clone.repo, lock.commit)
    const upstreamData = await loadGitJson(clone.repo, tree, '.distribution/upstream.json', 'upstream manifest')
    const upstream = validateUpstreamManifest(upstreamData.value)
    assert(upstream.commit === lock.upstreamCommit, 'upstream manifest commit differs from source lock')
    assert(upstream.repository === lock.upstreamRepository, 'upstream repository differs from source lock')

    const channels = {}
    for (const channelPath of discoverChannelPaths(tree)) {
      const name = channelPath.slice(CHANNEL_DIRECTORY.length, -'.json'.length)
      const data = await loadGitJson(clone.repo, tree, channelPath, name + ' manifest')
      const validated = validateChannelManifest(data.value, name)
      assert(validated.manifest.upstreamCommit === lock.upstreamCommit, name + ' upstream commit differs from source lock')
      channels[name] = {
        name,
        path: channelPath,
        manifest: validated.manifest,
        skills: validated.skills,
        set: new Set(validated.skills),
        bytes: data.bytes,
      }
    }
    validateManifestRelationship(channels)
    const channelNames = Object.keys(channels).sort(compareText)
    const channelEntries = channelNames.map((name) => channels[name])
    const selectedSkillDirectories = [...new Set(channelEntries.flatMap((entry) => entry.skills))].sort(compareText)

    const vendorRoot = join(stageRoot, 'vendor/mattpocock-skills')
    const selectedEntries = new Map()
    const entriesBySkill = new Map()
    for (const skillDirectory of selectedSkillDirectories) {
      const entries = selectedTreeEntries(clone.repo, tree, lock.commit, skillDirectory)
      entriesBySkill.set(skillDirectory, entries)
      for (const entry of entries) {
        assert(!selectedEntries.has(entry.path), 'selected Skills contain duplicate file path ' + entry.path)
        selectedEntries.set(entry.path, entry)
      }
    }
    const channelManifestPaths = channelEntries.map((entry) => entry.path)
    assertPortableUniquePaths([...COPIED_METADATA, ...channelManifestPaths, ...selectedEntries.keys()], 'vendored source files')
    for (const metadataPath of [...COPIED_METADATA, ...channelManifestPaths]) {
      await materializeFile(clone.repo, tree, metadataPath, join(vendorRoot, ...metadataPath.split('/')))
    }
    for (const skillDirectory of selectedSkillDirectories) {
      await materializeSkillDirectory(clone.repo, entriesBySkill.get(skillDirectory), skillDirectory, vendorRoot)
    }

    const rows = selectedSkillDirectories.map((skillDirectory) => skillCatalogRow(clone.repo, tree, skillDirectory, channels))
    const names = new Map()
    for (const row of rows) {
      assert(!names.has(row.name), 'duplicate Skill name ' + row.name + ' at ' + names.get(row.name) + ' and ' + row.directory)
      names.set(row.name, row.directory)
    }
    const catalog = catalogFromSkills(lock, channelNames, rows)
    const catalogBytes = Buffer.from(canonicalJson(catalog))
    await mkdir(join(stageRoot, 'generated'), { recursive: true })
    await writeFile(join(stageRoot, 'generated/catalog.json'), catalogBytes, { mode: 0o644 })
    await chmod(join(stageRoot, 'generated/catalog.json'), 0o644)

    const inventory = await walkInventory(vendorRoot)
    await writeFile(join(stageRoot, 'vendor-files.json'), canonicalJson(inventory), { mode: 0o644 })
    await chmod(join(stageRoot, 'vendor-files.json'), 0o644)

    const verifierEntry = tree.get('.distribution/scripts/verify-channels.mjs')
    assert(verifierEntry?.type === 'blob', 'source verifier is missing from distribution commit')
    const verifierSha256 = sha256(gitBlob(clone.repo, verifierEntry.object))
    assert(verifierSha256 === lock.verifierSha256, 'source verifier hash differs from source lock')
    const provenance = provenanceFromArtifacts(
      lock,
      sha256(lockBytes),
      upstream,
      verifierSha256,
      channelEntries,
      inventory,
      catalogBytes,
      rows.length,
    )
    await writeFile(join(stageRoot, 'PROVENANCE.json'), canonicalJson(provenance), { mode: 0o644 })
    await chmod(join(stageRoot, 'PROVENANCE.json'), 0o644)
    return { inventory, provenance }
  } finally {
    await rm(clone.temp, { recursive: true, force: true })
  }
}

async function pathKind(path) {
  try {
    const info = await lstat(path)
    if (info.isDirectory()) return 'directory'
    if (info.isFile()) return 'file'
    if (info.isSymbolicLink()) return 'symlink'
    return 'other'
  } catch (error) {
    if (error.code === 'ENOENT') return 'missing'
    throw error
  }
}

async function comparePath(expected, actual, relativePath, differences) {
  const expectedKind = await pathKind(expected)
  const actualKind = await pathKind(actual)
  if (expectedKind !== actualKind) {
    differences.push(relativePath + ': expected ' + expectedKind + ', found ' + actualKind)
    return
  }
  if (expectedKind === 'missing') return
  if (expectedKind === 'directory') {
    const expectedNames = (await readdir(expected)).sort(compareText)
    const actualNames = (await readdir(actual)).sort(compareText)
    const names = [...new Set([...expectedNames, ...actualNames])].sort(compareText)
    for (const name of names) await comparePath(join(expected, name), join(actual, name), relativePath + '/' + name, differences)
    return
  }
  if (expectedKind === 'symlink') {
    const [expectedTarget, actualTarget] = await Promise.all([readlink(expected), readlink(actual)])
    if (expectedTarget !== actualTarget) differences.push(relativePath + ': symlink target differs')
    return
  }
  if (expectedKind === 'file') {
    const [expectedBytes, actualBytes, expectedInfo, actualInfo] = await Promise.all([readFile(expected), readFile(actual), stat(expected), stat(actual)])
    if (!expectedBytes.equals(actualBytes)) differences.push(relativePath + ': file content differs')
    if (Boolean(expectedInfo.mode & 0o111) !== Boolean(actualInfo.mode & 0o111)) differences.push(relativePath + ': executable mode differs')
    return
  }
  differences.push(relativePath + ': unsupported file type')
}

async function compareStage(root, stageRoot) {
  const differences = []
  for (const output of OUTPUT_PATHS) await comparePath(join(stageRoot, output), join(root, output), output, differences)
  return differences.sort(compareText)
}

async function assertOutputsClean(root) {
  const existing = OUTPUT_PATHS.some((path) => existsSync(join(root, path)))
  if (!existing) return
  const statusText = git(root, ['status', '--porcelain=v1', '--untracked-files=all', '--', ...OUTPUT_PATHS]).trim()
  assert(statusText === '', 'refusing to overwrite modified generated outputs:\n' + statusText)
}

async function installStage(root, stageRoot) {
  await assertOutputsClean(root)
  const backupRoot = await mkdtemp(join(root, '.source-backup-'))
  const moved = []
  const installed = []
  try {
    for (const output of OUTPUT_PATHS) {
      const destination = join(root, output)
      if ((await pathKind(destination)) !== 'missing') {
        const backup = join(backupRoot, output)
        await mkdir(dirname(backup), { recursive: true })
        await rename(destination, backup)
        moved.push({ destination, backup })
      }
    }
    for (const output of OUTPUT_PATHS) {
      const staged = join(stageRoot, output)
      const destination = join(root, output)
      await mkdir(dirname(destination), { recursive: true })
      await rename(staged, destination)
      installed.push(destination)
    }
    await rm(backupRoot, { recursive: true, force: true })
  } catch (error) {
    for (const destination of installed.reverse()) await rm(destination, { recursive: true, force: true })
    for (const { destination, backup } of moved.reverse()) {
      await mkdir(dirname(destination), { recursive: true })
      await rename(backup, destination)
    }
    await rm(backupRoot, { recursive: true, force: true })
    throw error
  }
}

async function readVendoredChannels(vendorRoot) {
  const directory = join(vendorRoot, '.distribution/channels')
  const files = (await readdir(directory)).filter((name) => name.endsWith('.json')).sort(compareText)
  assert(files.length > 0, 'vendored distribution declares no channel manifest')
  const channels = {}
  for (const file of files) {
    const name = file.slice(0, -'.json'.length)
    assert(SKILL_NAME.test(name), 'vendored channel manifest name is not kebab-case: ' + name)
    const bytes = await readFile(join(directory, file))
    const validated = validateChannelManifest(parseStrictJsonBytes(bytes, 'vendored ' + name + ' manifest'), name)
    channels[name] = {
      name,
      path: CHANNEL_DIRECTORY + file,
      manifest: validated.manifest,
      skills: validated.skills,
      set: new Set(validated.skills),
      bytes,
    }
  }
  validateManifestRelationship(channels)
  return channels
}

async function deriveCatalogFromVendor(root, lock, channels) {
  const vendorRoot = join(root, 'vendor/mattpocock-skills')
  const channelNames = Object.keys(channels).sort(compareText)
  const selectedSkillDirectories = [...new Set(channelNames.flatMap((name) => channels[name].skills))].sort(compareText)
  const names = new Map()
  const rows = []
  for (const skillDirectory of selectedSkillDirectories) {
    const skillPath = skillDirectory + '/SKILL.md'
    const absolute = join(vendorRoot, ...skillPath.split('/'))
    const info = await lstat(absolute)
    assert(info.isFile() && !info.isSymbolicLink(), 'vendored SKILL.md must be a regular file: ' + skillPath)
    const bytes = await readFile(absolute)
    const parsed = parseSkillMarkdown(bytes, skillPath)
    assert(parsed.name === basename(skillDirectory), skillPath + ' declares a mismatched name')
    assert(!names.has(parsed.name), 'duplicate vendored Skill name ' + parsed.name)
    names.set(parsed.name, skillDirectory)
    const channelMembership = channelNamesForDirectory(channels, skillDirectory)
    assert(channelMembership.length > 0, 'vendored Skill belongs to no channel: ' + skillDirectory)
    rows.push({
      name: parsed.name,
      description: parsed.description,
      ...(parsed.whenToUse === undefined ? {} : { whenToUse: parsed.whenToUse }),
      invocation: parsed.invocation,
      ...(parsed.metadata === undefined ? {} : { metadata: parsed.metadata }),
      ...(parsed.frontmatterExtensions === undefined ? {} : { frontmatterExtensions: parsed.frontmatterExtensions }),
      channels: channelMembership,
      directory: skillDirectory,
      skillPath,
      bodyByteOffset: parsed.bodyByteOffset,
      sha256: sha256(bytes),
    })
  }
  return catalogFromSkills(lock, channelNames, rows)
}

function assertCanonicalObject(actualText, expected, label) {
  assert(actualText === canonicalJson(expected), label + ' is stale or non-canonical')
}

function validateInventoryDocument(inventory) {
  assert(isRecord(inventory), 'vendor inventory must contain an object')
  assertKeys(inventory, ['schemaVersion', 'root', 'hashAlgorithm', 'fileCount', 'totalBytes', 'rootSha256', 'entries'], [], 'vendor inventory')
  assert(inventory.schemaVersion === INVENTORY_SCHEMA_VERSION, 'vendor inventory schema is invalid')
  assert(inventory.root === 'vendor/mattpocock-skills', 'vendor inventory root is invalid')
  assert(inventory.hashAlgorithm === 'sha256', 'vendor inventory hashAlgorithm is invalid')
  assert(Number.isSafeInteger(inventory.fileCount) && inventory.fileCount >= 0, 'vendor inventory fileCount is invalid')
  assert(Number.isSafeInteger(inventory.totalBytes) && inventory.totalBytes >= 0, 'vendor inventory totalBytes is invalid')
  assert(SHA256.test(inventory.rootSha256), 'vendor inventory rootSha256 is invalid')
  assert(Array.isArray(inventory.entries), 'vendor inventory entries must be an array')
}

export async function verifyCommittedArtifacts(root = repositoryRoot) {
  const lockBytes = await readFile(join(root, 'source-lock.json'))
  const lock = validateSourceLock(parseStrictJsonBytes(lockBytes, 'source-lock.json'))
  const vendorRoot = join(root, 'vendor/mattpocock-skills')
  const inventoryText = await readFile(join(root, 'vendor-files.json'), 'utf8')
  const inventory = parseStrictJsonBytes(Buffer.from(inventoryText), 'vendor-files.json')
  validateInventoryDocument(inventory)
  const actualInventory = await walkInventory(vendorRoot)
  assertCanonicalObject(inventoryText, actualInventory, 'vendor-files.json')

  const upstreamBytes = await readFile(join(vendorRoot, '.distribution/upstream.json'))
  const upstream = validateUpstreamManifest(parseStrictJsonBytes(upstreamBytes, 'vendored upstream manifest'))
  assert(upstream.repository === lock.upstreamRepository && upstream.commit === lock.upstreamCommit, 'upstream manifest differs from source lock')

  const channels = await readVendoredChannels(vendorRoot)
  const channelNames = Object.keys(channels).sort(compareText)
  const channelEntries = channelNames.map((name) => channels[name])
  for (const entry of channelEntries) {
    assert(entry.manifest.upstreamCommit === lock.upstreamCommit, entry.name + ' manifest differs from source lock')
  }

  const expectedCatalog = await deriveCatalogFromVendor(root, lock, channels)
  const catalogText = await readFile(join(root, 'generated/catalog.json'), 'utf8')
  assertCanonicalObject(catalogText, expectedCatalog, 'generated/catalog.json')

  const provenanceText = await readFile(join(root, 'PROVENANCE.json'), 'utf8')
  const provenance = parseStrictJsonBytes(Buffer.from(provenanceText), 'PROVENANCE.json')
  assert(isRecord(provenance.sourceDistribution?.verifier), 'PROVENANCE.json source verifier is missing')
  const expectedProvenance = provenanceFromArtifacts(
    lock,
    sha256(lockBytes),
    upstream,
    lock.verifierSha256,
    channelEntries,
    actualInventory,
    Buffer.from(catalogText),
    expectedCatalog.skills.length,
  )
  assertCanonicalObject(provenanceText, expectedProvenance, 'PROVENANCE.json')

  const channelSkillCounts = {}
  for (const entry of channelEntries) channelSkillCounts[entry.name] = entry.skills.length

  return {
    channelSkillCounts,
    skillCount: expectedCatalog.skills.length,
    vendorFileCount: actualInventory.fileCount,
    vendorBytes: actualInventory.totalBytes,
    vendorRootSha256: actualInventory.rootSha256,
  }
}

async function withUpdateLock(root, operation) {
  const path = join(root, '.source-update.lock')
  let handle
  try {
    handle = await open(path, 'wx', 0o600)
    await handle.writeFile(JSON.stringify({ pid: process.pid }) + '\n')
    return await operation()
  } catch (error) {
    if (error.code === 'EEXIST') throw new Error('another source update or check is already running')
    throw error
  } finally {
    await handle?.close()
    if (handle) await rm(path, { force: true })
  }
}

export async function updateSource({ root = repositoryRoot, source, check = false } = {}) {
  return withUpdateLock(root, async () => {
    const lock = await loadSourceLock(root)
    const transport = source ?? lock.repository
    assert(typeof transport === 'string' && transport.length > 0, 'source repository is required')
    const stageRoot = await mkdtemp(join(root, '.source-stage-'))
    try {
      const result = await buildStage(root, transport, stageRoot)
      if (check) {
        const differences = await compareStage(root, stageRoot)
        assert(differences.length === 0, 'generated source artifacts differ:\n' + differences.join('\n'))
      } else {
        await installStage(root, stageRoot)
      }
      const channelSkillCounts = {}
      for (const entry of result.provenance.manifests) channelSkillCounts[entry.channel] = entry.skillCount
      return {
        channelSkillCounts,
        skillCount: result.provenance.catalog.skillCount,
        vendorFileCount: result.inventory.fileCount,
        vendorBytes: result.inventory.totalBytes,
        vendorRootSha256: result.inventory.rootSha256,
        check,
      }
    } finally {
      await rm(stageRoot, { recursive: true, force: true })
    }
  })
}
