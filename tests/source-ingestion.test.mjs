import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { cp, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'

import {
  loadSourceLock,
  normalizeSkillPath,
  parseSkillMarkdown,
  parseStrictJsonBytes,
  sha256,
  updateSource,
  validateSourceLock,
  verifyCommittedArtifacts,
} from '../scripts/lib/source-ingestion.mjs'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const localSource = process.env.MATTPOCOCK_SKILLS_SOURCE ?? resolve(root, '../mattpocock-skills-fork')
const hasLocalSource = existsSync(join(localSource, '.git'))
const lf = String.fromCharCode(10)
const crlf = String.fromCharCode(13, 10)

function markdown(lines, newline = lf) {
  return Buffer.from([...lines, ''].join(newline))
}

async function copyCommittedArtifacts(destination) {
  for (const path of ['source-lock.json', 'PROVENANCE.json', 'vendor-files.json']) {
    await cp(join(root, path), join(destination, path))
  }
  await cp(join(root, 'generated'), join(destination, 'generated'), { recursive: true, preserveTimestamps: true })
  await cp(join(root, 'vendor'), join(destination, 'vendor'), { recursive: true, preserveTimestamps: true, verbatimSymlinks: true })
}

test('strict JSON parsing rejects ambiguity and non-JSON syntax', () => {
  assert.deepEqual(parseStrictJsonBytes(Buffer.from('{"a":{"b":1}}'), 'valid'), { a: { b: 1 } })
  assert.throws(() => parseStrictJsonBytes(Buffer.from('{"a":1,"a":2}'), 'duplicate'), /duplicate/i)
  assert.throws(() => parseStrictJsonBytes(Buffer.from('{"a":{"b":1,"b":2}}'), 'nested duplicate'), /duplicate/i)
  assert.throws(() => parseStrictJsonBytes(Buffer.from('{"a":1,}'), 'trailing comma'), /parse/i)
  assert.throws(() => parseStrictJsonBytes(Buffer.from('{/* no */"a":1}'), 'comment'), /parse/i)
  assert.throws(
    () => parseStrictJsonBytes(Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from('{}')]), 'BOM'),
    /BOM/,
  )
})

test('source lock is closed, pinned, and duplicate-key rejecting', async () => {
  const lock = await loadSourceLock(root)
  assert.deepEqual(Object.keys(lock), [
    'schemaVersion',
    'repository',
    'tag',
    'tagObject',
    'commit',
    'verifierSha256',
    'upstreamRepository',
    'upstreamCommit',
  ])
  assert.equal(lock.tagObject, '0108f00aa90cde51b290d6c58ac86d7f0b045ba0')
  assert.equal(lock.commit, 'f0834542c543df9197364127d13383ffea6e43d3')
  assert.equal(lock.verifierSha256, '8b1b01c562af52ae9c330e63a47aaa7ae52f03ee12d4be69ea36fbefea760155')
  assert.throws(() => validateSourceLock({ ...lock, extra: true }), /unknown key/)
  assert.throws(() => validateSourceLock({ ...lock, verifierSha256: '0'.repeat(63) }), /verifierSha256/)
  assert.throws(() => validateSourceLock({ ...lock, tag: 'bad..tag' }), /valid Git tag/)

  const temporary = await mkdtemp(join(tmpdir(), 'dsh-source-lock-test-'))
  try {
    await writeFile(join(temporary, 'source-lock.json'), '{"schemaVersion":1,"schemaVersion":1}')
    await assert.rejects(loadSourceLock(temporary), /duplicate/i)
  } finally {
    await rm(temporary, { recursive: true, force: true })
  }
})

test('Skill paths reject traversal and portability hazards', () => {
  assert.equal(normalizeSkillPath('./skills/planning/write-a-plan'), 'skills/planning/write-a-plan')
  for (const path of [
    '/skills/planning/write-a-plan',
    './skills/../escape',
    './skills/planning/../../escape',
    './skills\\planning\\write-a-plan',
    './skills/planning//write-a-plan',
    './skills/planning/.',
    './skills/planning/e\u0301',
  ]) {
    assert.throws(() => normalizeSkillPath(path), /must|unsafe|normalized|NFC/)
  }
})

test('frontmatter parsing uses byte offsets and preserves extensions', () => {
  const prefix = ['---', 'name: unicode-skill', 'description: Résumé 工具', 'argument-hint: <路径>', 'disable-model-invocation: true', 'user-invocable: false', '---', ''].join(crlf)
  const parsed = parseSkillMarkdown(Buffer.from(prefix + 'Body ✓' + crlf), 'unicode SKILL.md')
  assert.equal(parsed.bodyByteOffset, Buffer.byteLength(prefix))
  assert.deepEqual(parsed.invocation, { modelInvocable: false, userInvocable: false })
  assert.deepEqual(parsed.frontmatterExtensions, { 'argument-hint': '<路径>' })
  assert.equal(parsed.whenToUse, undefined)
})

test('frontmatter parsing rejects unsafe or ambiguous YAML', () => {
  const cases = [
    [markdown(['---', 'name: duplicate', 'name: duplicate', 'description: test', '---']), /invalid|map keys must be unique/i],
    [markdown(['---', 'name: tagged', 'description: !custom test', '---']), /unsupported|tag/i],
    [markdown(['---', 'name: aliased', 'description: &text hello', 'argument-hint: *text', '---']), /alias/i],
    [markdown(['---', 'name: legacy', 'description: test', 'modelInvocable: false', '---']), /legacy key/i],
    [markdown(['---', 'name: wrong-type', 'description: test', 'disable-model-invocation: no', '---']), /must be boolean/i],
    [markdown(['---', 'name: Wrong_Name', 'description: test', '---']), /kebab-case/i],
    [markdown(['---', 'name: blank', 'description: "  "', '---']), /non-empty/i],
  ]
  for (const [bytes, pattern] of cases) assert.throws(() => parseSkillMarkdown(bytes), pattern)
  assert.throws(() => parseSkillMarkdown(Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), markdown(['---', 'name: bom', 'description: test', '---'])])), /BOM/)
  assert.throws(() => parseSkillMarkdown(markdown(['---', 'name: open', 'description: test'])), /unclosed/)
})

test('generated catalog has exact channel and invocation semantics', async () => {
  const catalogBytes = await readFile(join(root, 'generated/catalog.json'))
  const catalog = parseStrictJsonBytes(catalogBytes, 'generated/catalog.json')
  assert.equal(catalog.schemaVersion, 1)
  assert.equal(catalog.channels.stable.length, 25)
  assert.equal(catalog.channels.beta.length, 26)
  assert.equal(catalog.skills.length, 26)
  assert.equal(new Set(catalog.skills.map((skill) => skill.name)).size, 26)
  assert.equal(catalog.skills.filter((skill) => skill.invocation.modelInvocable).length, 11)
  assert.equal(catalog.skills.filter((skill) => !skill.invocation.modelInvocable).length, 15)

  const implementSpec = catalog.skills.find((skill) => skill.name === 'implement-spec')
  assert.deepEqual(implementSpec.channels, ['beta'])
  assert.deepEqual(implementSpec.invocation, { modelInvocable: false, userInvocable: true })
  assert.equal(catalog.channels.stable.includes('implement-spec'), false)
  assert.equal(catalog.channels.beta.includes('implement-spec'), true)

  for (const name of ['handoff', 'teach']) {
    const skill = catalog.skills.find((entry) => entry.name === name)
    assert.equal(typeof skill.frontmatterExtensions?.['argument-hint'], 'string')
    assert.equal(skill.whenToUse, undefined)
  }

  for (const skill of catalog.skills) {
    const bytes = await readFile(join(root, 'vendor/mattpocock-skills', skill.skillPath))
    assert.equal(sha256(bytes), skill.sha256)
    assert(skill.bodyByteOffset > 0 && skill.bodyByteOffset <= bytes.length)
  }
})

test('committed vendor artifacts verify without Git metadata', async () => {
  const result = await verifyCommittedArtifacts(root)
  assert.deepEqual(result, {
    stableSkillCount: 25,
    betaSkillCount: 26,
    vendorFileCount: 81,
    vendorBytes: 212143,
    vendorRootSha256: '1e6182fe1e430a5f653be3b33e9340e19ff8a812d0f7bb7bbc44da10fb9c6a50',
  })
})

test('offline verification rejects same-size vendor drift', async () => {
  const temporary = await mkdtemp(join(tmpdir(), 'dsh-vendor-drift-'))
  try {
    await copyCommittedArtifacts(temporary)
    const catalog = JSON.parse(await readFile(join(temporary, 'generated/catalog.json'), 'utf8'))
    const path = join(temporary, 'vendor/mattpocock-skills', catalog.skills[0].skillPath)
    const bytes = await readFile(path)
    bytes[bytes.length - 1] ^= 1
    await writeFile(path, bytes)
    await assert.rejects(verifyCommittedArtifacts(temporary), /vendor-files\.json is stale|non-canonical/)
  } finally {
    await rm(temporary, { recursive: true, force: true })
  }
})

test('exclusive source lock rejects concurrent updater', async () => {
  const lockPath = join(root, '.source-update.lock')
  await writeFile(lockPath, 'occupied\n')
  try {
    await assert.rejects(updateSource({ root, source: localSource, check: true }), /already running/)
    assert.equal(await readFile(lockPath, 'utf8'), 'occupied\n')
  } finally {
    await rm(lockPath, { force: true })
  }
})

test('wrong verifier pin fails before source verification', { skip: !hasLocalSource }, async () => {
  const temporary = await mkdtemp(join(tmpdir(), 'dsh-wrong-verifier-'))
  try {
    const lock = JSON.parse(await readFile(join(root, 'source-lock.json'), 'utf8'))
    lock.verifierSha256 = '0'.repeat(64)
    await writeFile(join(temporary, 'source-lock.json'), JSON.stringify(lock, null, 2) + lf)
    await assert.rejects(updateSource({ root: temporary, source: localSource, check: true }), /verifier hash differs/)
  } finally {
    await rm(temporary, { recursive: true, force: true })
  }
})

test('check mode is byte-identical and does not replace outputs', { skip: !hasLocalSource, timeout: 120_000 }, async () => {
  const catalogPath = join(root, 'generated/catalog.json')
  const before = await stat(catalogPath)
  const result = await updateSource({ root, source: localSource, check: true })
  const after = await stat(catalogPath)
  assert.equal(result.check, true)
  assert.equal(after.ino, before.ino)
  assert.equal(after.mtimeMs, before.mtimeMs)
})

test('vendored bytes and Git modes match the exact pinned source tree', { skip: !hasLocalSource }, async () => {
  const inventory = JSON.parse(await readFile(join(root, 'vendor-files.json'), 'utf8'))
  const commit = 'f0834542c543df9197364127d13383ffea6e43d3'
  for (const entry of inventory.entries) {
    const sourcePath = entry.path
    const header = execFileSync('git', ['-C', localSource, 'ls-tree', commit, '--', sourcePath], { encoding: 'utf8' }).trim()
    assert(header, 'missing source path ' + sourcePath)
    const [metadata, path] = header.split('\t')
    assert.equal(path, sourcePath)
    const [mode, type, object] = metadata.split(' ')
    assert.equal(type, 'blob')
    assert.equal(mode, entry.mode)
    const bytes = execFileSync('git', ['-C', localSource, 'cat-file', 'blob', object])
    assert.equal(sha256(bytes), entry.sha256)
  }
})
