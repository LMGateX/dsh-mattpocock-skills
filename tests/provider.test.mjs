import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { test } from 'node:test'

import { BUNDLED_SKILL_RANK } from '@deepseek-ai/dsh-skill'

import { CATALOG, PACKAGE_ROOT, PROVIDER_NAME, createMattPocockSkillProvider, parseCatalog } from '../lib/index.js'

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex')
}

function oneSkillCatalog(row) {
  const channels = {}
  for (const channel of Object.keys(CATALOG.channels)) {
    channels[channel] = row.channels.includes(channel) ? [row.name] : []
  }
  return {
    schemaVersion: 1,
    distribution: CATALOG.distribution,
    channels,
    skills: [row],
  }
}

async function writeSkill(root, skillPath, bytes) {
  const path = join(root, 'vendor/mattpocock-skills', ...skillPath.split('/'))
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, bytes)
  return path
}

function blockingReader() {
  let markStarted
  const started = new Promise((resolveStarted) => { markStarted = resolveStarted })
  const readSkillFile = async (_handle, signal) => {
    markStarted()
    return await new Promise((_, reject) => {
      if (signal?.aborted) return reject(signal.reason)
      signal?.addEventListener('abort', () => reject(signal.reason), { once: true })
    })
  }
  return { started, readSkillFile }
}

test('runtime catalog is validated, closed, and deeply frozen', () => {
  assert.equal(CATALOG.schemaVersion, 1)
  assert(Object.isFrozen(CATALOG))
  assert(Object.isFrozen(CATALOG.skills))
  assert(Object.isFrozen(CATALOG.skills[0]))
  assert.throws(() => parseCatalog('{"schemaVersion":2}'), /catalog|schemaVersion/)
  const changed = structuredClone(CATALOG)
  changed.skills[0].unexpected = true
  assert.throws(() => parseCatalog(JSON.stringify(changed)), /unknown key/)

  const wrongDirectory = structuredClone(CATALOG)
  wrongDirectory.skills[0].directory += '-other'
  wrongDirectory.skills[0].skillPath = wrongDirectory.skills[0].directory + '/SKILL.md'
  assert.throws(() => parseCatalog(JSON.stringify(wrongDirectory)), /directory differs from name/)

  const reservedMetadata = structuredClone(CATALOG)
  reservedMetadata.skills[0].metadata = { frontmatterExtensions: {} }
  assert.throws(() => parseCatalog(JSON.stringify(reservedMetadata)), /reserves frontmatterExtensions/)
})

test('list is static, channel-exact, immutable, and package-relative', async () => {
  const packageRoot = '/path/that/does/not/exist'
  const stable = createMattPocockSkillProvider('stable', { packageRoot })
  const stableCandidates = await stable.list({ cwd: '/ignored/a' })
  const stableAgain = await stable.list({ cwd: '/ignored/b' })

  assert.equal(stable.name, PROVIDER_NAME)
  assert(Object.isFrozen(stable))
  assert(Object.isFrozen(stableCandidates))
  assert.strictEqual(stableCandidates, stableAgain)
  assert.deepEqual(stableCandidates.map((candidate) => candidate.name), CATALOG.channels.stable)
  assert.throws(() => createMattPocockSkillProvider('nightly', { packageRoot }), /unsupported Matt Pocock Skills channel/)

  for (const candidate of stableCandidates) {
    const row = CATALOG.skills.find((entry) => entry.name === candidate.name)
    assert(row)
    assert.equal(candidate.description, row.description)
    assert.deepEqual(candidate.invocation, row.invocation)
    assert.equal(candidate.provider, PROVIDER_NAME)
    assert.equal(candidate.source, 'bundled')
    assert.equal(candidate.rank, BUNDLED_SKILL_RANK)
    assert.equal(candidate.path, resolve(packageRoot, 'vendor/mattpocock-skills', row.skillPath))
    assert.deepEqual(candidate.resourceBase, { kind: 'directory', path: resolve(packageRoot, 'vendor/mattpocock-skills', row.directory) })
    assert.equal(candidate.resourceBase.path, dirname(candidate.path))
    assert(Object.isFrozen(candidate))
    assert(Object.isFrozen(candidate.invocation))
    assert(Object.isFrozen(candidate.resourceBase))
    assert(Object.isFrozen(candidate.locator))
  }
})

test('get lazily returns the exact body and preserves candidate semantics', async () => {
  const provider = createMattPocockSkillProvider('stable')
  const candidates = await provider.list({})
  const candidate = candidates.find((entry) => entry.name === 'triage')
  const row = CATALOG.skills.find((entry) => entry.name === 'triage')
  assert(candidate && row)

  const raw = await readFile(candidate.path)
  const definition = await provider.get(candidate, {})
  assert(definition)
  assert.equal(definition.content, raw.subarray(row.bodyByteOffset).toString('utf8'))
  assert.equal(definition.content.startsWith('---'), false)
  assert.equal(definition.name, candidate.name)
  assert.equal(definition.description, candidate.description)
  assert.strictEqual(definition.invocation, candidate.invocation)
  assert.equal(definition.provider, candidate.provider)
  assert.equal(definition.source, candidate.source)
  assert.strictEqual(definition.resourceBase, candidate.resourceBase)
  assert.equal(definition.path, candidate.path)
  assert.strictEqual(definition.metadata, candidate.metadata)
  assert.equal('rank' in definition, false)
  assert.equal('locator' in definition, false)
  assert(Object.isFrozen(definition))

  for (const skillName of ['handoff', 'teach']) {
    const extensionCandidate = candidates.find((entry) => entry.name === skillName)
    assert(extensionCandidate)
    assert.equal(extensionCandidate.whenToUse, undefined)
    assert.equal(typeof extensionCandidate.metadata?.frontmatterExtensions?.['argument-hint'], 'string')
    assert(Object.isFrozen(extensionCandidate.metadata))
    assert(Object.isFrozen(extensionCandidate.metadata.frontmatterExtensions))
  }
  assert.equal(resolve(PACKAGE_ROOT), PACKAGE_ROOT.replace(/\/$/, ''))
})

test('provider preserves optional metadata and when-to-use semantics', async () => {
  const temporary = await mkdtemp(join(tmpdir(), 'dsh-provider-metadata-'))
  try {
    const prefix = Buffer.from('---\nname: synthetic\ndescription: Synthetic test Skill\n---\n')
    const bytes = Buffer.concat([prefix, Buffer.from('Synthetic body\n')])
    const row = {
      name: 'synthetic',
      description: 'Synthetic test Skill',
      whenToUse: 'Use only for the synthetic contract test.',
      metadata: { owner: 'source' },
      frontmatterExtensions: { 'argument-hint': '[fixture]' },
      invocation: { modelInvocable: true, userInvocable: false },
      channels: ['stable'],
      directory: 'skills/testing/synthetic',
      skillPath: 'skills/testing/synthetic/SKILL.md',
      bodyByteOffset: prefix.length,
      sha256: sha256(bytes),
    }
    await writeSkill(temporary, row.skillPath, bytes)
    const provider = createMattPocockSkillProvider('stable', { packageRoot: temporary, catalog: oneSkillCatalog(row) })
    const [candidate] = await provider.list({})
    assert(candidate)
    assert.equal(candidate.whenToUse, row.whenToUse)
    assert.deepEqual(candidate.metadata, { owner: 'source', frontmatterExtensions: { 'argument-hint': '[fixture]' } })
    assert(Object.isFrozen(candidate.metadata))
    assert(Object.isFrozen(candidate.metadata.frontmatterExtensions))
    const definition = await provider.get(candidate, {})
    assert(definition)
    assert.equal(definition.content, 'Synthetic body\n')
    assert.equal(definition.whenToUse, candidate.whenToUse)
    assert.strictEqual(definition.metadata, candidate.metadata)
    assert.strictEqual(definition.invocation, candidate.invocation)
  } finally {
    await rm(temporary, { recursive: true, force: true })
  }
})

test('get accepts only exact provider-owned candidate identities', async () => {
  const diagnostics = []
  const provider = createMattPocockSkillProvider('stable', {
    packageRoot: '/path/that/does/not/exist',
    diagnostic: (message) => diagnostics.push(message),
  })
  const candidate = (await provider.list({}))[0]
  assert(candidate)
  assert.equal(await provider.get({ ...candidate }, {}), undefined)
  assert.deepEqual(diagnostics, ['refused an unrecognized Skill candidate'])

  const other = createMattPocockSkillProvider('stable', { packageRoot: '/path/that/does/not/exist' })
  assert.equal(await other.get(candidate, {}), undefined)
})

test('lookup and lifecycle aborts reject with their exact reasons', async () => {
  const lookup = new AbortController()
  const lookupReason = new Error('lookup stopped')
  lookup.abort(lookupReason)
  const provider = createMattPocockSkillProvider('stable')
  const candidate = (await provider.list({}))[0]
  assert(candidate)
  await assert.rejects(provider.list({ signal: lookup.signal }), (error) => error === lookupReason)
  await assert.rejects(provider.get(candidate, { signal: lookup.signal }), (error) => error === lookupReason)

  const active = new AbortController()
  const activeReason = new Error('active lookup stopped')
  const activeDiagnostics = []
  const activeIO = blockingReader()
  const activeProvider = createMattPocockSkillProvider('stable', {
    diagnostic: (message) => activeDiagnostics.push(message),
    readSkillFile: activeIO.readSkillFile,
  })
  const activeCandidate = (await activeProvider.list({}))[0]
  assert(activeCandidate)
  const activeGet = activeProvider.get(activeCandidate, { signal: active.signal })
  await activeIO.started
  active.abort(activeReason)
  await assert.rejects(activeGet, (error) => error === activeReason)
  assert.deepEqual(activeDiagnostics, [])

  const lifecycle = new AbortController()
  const lifecycleIO = blockingReader()
  const lifecycleProvider = createMattPocockSkillProvider('stable', {
    lifecycleSignal: lifecycle.signal,
    readSkillFile: lifecycleIO.readSkillFile,
  })
  const lifecycleCandidate = (await lifecycleProvider.list({}))[0]
  assert(lifecycleCandidate)
  const lifecycleGet = lifecycleProvider.get(lifecycleCandidate, {})
  await lifecycleIO.started
  const lifecycleReason = new Error('provider disposed')
  lifecycle.abort(lifecycleReason)
  await assert.rejects(lifecycleGet, (error) => error === lifecycleReason)
  await assert.rejects(lifecycleProvider.list({}), (error) => error === lifecycleReason)
  assert.deepEqual(activeDiagnostics, [])
})

test('missing files, hash drift, and offset drift fail closed with diagnostics', async () => {
  const temporary = await mkdtemp(join(tmpdir(), 'dsh-provider-drift-'))
  try {
    const row = CATALOG.skills.find((entry) => entry.name === 'ask-matt')
    assert(row)
    const sourcePath = join(PACKAGE_ROOT, 'vendor/mattpocock-skills', ...row.skillPath.split('/'))
    const original = await readFile(sourcePath)

    const missingDiagnostics = []
    const missing = createMattPocockSkillProvider('stable', { packageRoot: temporary, diagnostic: (message) => missingDiagnostics.push(message) })
    const missingCandidate = (await missing.list({})).find((entry) => entry.name === row.name)
    assert(missingCandidate)
    assert.equal(await missing.get(missingCandidate, {}), undefined)
    assert.equal(missingDiagnostics.length, 1)
    assert.match(missingDiagnostics[0], /could not load Skill.*ask-matt.*ENOENT/)

    const filePath = await writeSkill(temporary, row.skillPath, original)
    const drifted = Buffer.from(original)
    drifted[drifted.length - 1] ^= 1
    await writeFile(filePath, drifted)
    const hashDiagnostics = []
    const hashProvider = createMattPocockSkillProvider('stable', { packageRoot: temporary, diagnostic: (message) => hashDiagnostics.push(message) })
    const hashCandidate = (await hashProvider.list({})).find((entry) => entry.name === row.name)
    assert(hashCandidate)
    assert.equal(await hashProvider.get(hashCandidate, {}), undefined)
    assert.equal(hashDiagnostics.length, 1)
    assert.match(hashDiagnostics[0], /hash differs/)
    assert(hashDiagnostics[0].includes(filePath))

    await writeFile(filePath, original)
    const offsetRow = { ...row, bodyByteOffset: row.bodyByteOffset + 1 }
    const offsetDiagnostics = []
    const offsetProvider = createMattPocockSkillProvider('stable', {
      packageRoot: temporary,
      catalog: oneSkillCatalog(offsetRow),
      diagnostic: (message) => offsetDiagnostics.push(message),
    })
    const offsetCandidate = (await offsetProvider.list({}))[0]
    assert(offsetCandidate)
    assert.equal(await offsetProvider.get(offsetCandidate, {}), undefined)
    assert.equal(offsetDiagnostics.length, 1)
    assert.match(offsetDiagnostics[0], /frontmatter boundary differs/)
  } finally {
    await rm(temporary, { recursive: true, force: true })
  }
})

test('file, directory, and vendored-root symlink drift fail closed before loading content', async (t) => {
  const temporary = await mkdtemp(join(tmpdir(), 'dsh-provider-symlink-'))
  try {
    const row = CATALOG.skills.find((entry) => entry.name === 'ask-matt')
    assert(row)
    const original = await readFile(join(PACKAGE_ROOT, 'vendor/mattpocock-skills', ...row.skillPath.split('/')))

    const fileCase = join(temporary, 'file-case')
    const outsideFile = join(temporary, 'outside-SKILL.md')
    await writeFile(outsideFile, original)
    const linkOrSkip = async (target, path, type) => {
      try {
        await symlink(target, path, type)
        return true
      } catch (error) {
        if (['EPERM', 'EACCES', 'ENOSYS', 'ENOTSUP'].includes(error?.code)) {
          t.skip('host filesystem does not permit symlink regression fixtures')
          return false
        }
        throw error
      }
    }
    const linkedFile = join(fileCase, 'vendor/mattpocock-skills', ...row.skillPath.split('/'))
    await mkdir(dirname(linkedFile), { recursive: true })
    if (!await linkOrSkip(outsideFile, linkedFile)) return
    const fileDiagnostics = []
    const fileProvider = createMattPocockSkillProvider('stable', { packageRoot: fileCase, diagnostic: (message) => fileDiagnostics.push(message) })
    const fileCandidate = (await fileProvider.list({})).find((entry) => entry.name === row.name)
    assert(fileCandidate)
    assert.equal(await fileProvider.get(fileCandidate, {}), undefined)
    assert.match(fileDiagnostics[0], /path or symlink drift/)

    const directoryCase = join(temporary, 'directory-case')
    const outsideDirectory = join(temporary, 'outside-skill-directory')
    await mkdir(outsideDirectory, { recursive: true })
    await writeFile(join(outsideDirectory, 'SKILL.md'), original)
    const linkedDirectory = join(directoryCase, 'vendor/mattpocock-skills', ...row.directory.split('/'))
    await mkdir(dirname(linkedDirectory), { recursive: true })
    if (!await linkOrSkip(outsideDirectory, linkedDirectory, 'dir')) return
    const directoryDiagnostics = []
    const directoryProvider = createMattPocockSkillProvider('stable', { packageRoot: directoryCase, diagnostic: (message) => directoryDiagnostics.push(message) })
    const directoryCandidate = (await directoryProvider.list({})).find((entry) => entry.name === row.name)
    assert(directoryCandidate)
    assert.equal(await directoryProvider.get(directoryCandidate, {}), undefined)
    assert.match(directoryDiagnostics[0], /path or symlink drift/)

    const rootCase = join(temporary, 'root-case')
    const outsideVendorRoot = join(temporary, 'outside-vendor-root')
    const outsideRootSkill = join(outsideVendorRoot, ...row.skillPath.split('/'))
    await mkdir(dirname(outsideRootSkill), { recursive: true })
    await writeFile(outsideRootSkill, original)
    const linkedVendorRoot = join(rootCase, 'vendor/mattpocock-skills')
    await mkdir(dirname(linkedVendorRoot), { recursive: true })
    if (!await linkOrSkip(outsideVendorRoot, linkedVendorRoot, 'dir')) return
    const rootDiagnostics = []
    const rootProvider = createMattPocockSkillProvider('stable', { packageRoot: rootCase, diagnostic: (message) => rootDiagnostics.push(message) })
    const rootCandidate = (await rootProvider.list({})).find((entry) => entry.name === row.name)
    assert(rootCandidate)
    assert.equal(await rootProvider.get(rootCandidate, {}), undefined)
    assert.match(rootDiagnostics[0], /vendored root has path or symlink drift/)

    const ancestorCase = join(temporary, 'ancestor-case')
    const outsideVendorParent = join(temporary, 'outside-vendor-parent')
    const outsideAncestorSkill = join(outsideVendorParent, 'mattpocock-skills', ...row.skillPath.split('/'))
    await mkdir(dirname(outsideAncestorSkill), { recursive: true })
    await writeFile(outsideAncestorSkill, original)
    await mkdir(ancestorCase, { recursive: true })
    if (!await linkOrSkip(outsideVendorParent, join(ancestorCase, 'vendor'), 'dir')) return
    const ancestorDiagnostics = []
    const ancestorProvider = createMattPocockSkillProvider('stable', { packageRoot: ancestorCase, diagnostic: (message) => ancestorDiagnostics.push(message) })
    const ancestorCandidate = (await ancestorProvider.list({})).find((entry) => entry.name === row.name)
    assert(ancestorCandidate)
    assert.equal(await ancestorProvider.get(ancestorCandidate, {}), undefined)
    assert.match(ancestorDiagnostics[0], /vendored root has path or symlink drift/)

    const actualPackage = join(temporary, 'actual-package')
    await writeSkill(actualPackage, row.skillPath, original)
    const linkedPackage = join(temporary, 'linked-package')
    if (!await linkOrSkip(actualPackage, linkedPackage, 'dir')) return
    const linkedPackageProvider = createMattPocockSkillProvider('stable', { packageRoot: linkedPackage })
    const linkedPackageCandidate = (await linkedPackageProvider.list({})).find((entry) => entry.name === row.name)
    assert(linkedPackageCandidate)
    assert(await linkedPackageProvider.get(linkedPackageCandidate, {}))
  } finally {
    await rm(temporary, { recursive: true, force: true })
  }
})

test('malformed framing and invalid UTF-8 bodies fail closed without YAML parsing', async () => {
  const temporary = await mkdtemp(join(tmpdir(), 'dsh-provider-malformed-'))
  try {
    const malformed = Buffer.from('not-frontmatter\nbody\n')
    const malformedRow = {
      name: 'synthetic',
      description: 'Synthetic test Skill',
      invocation: { modelInvocable: true, userInvocable: true },
      channels: ['stable'],
      directory: 'skills/testing/synthetic',
      skillPath: 'skills/testing/synthetic/SKILL.md',
      bodyByteOffset: 4,
      sha256: sha256(malformed),
    }
    await writeSkill(temporary, malformedRow.skillPath, malformed)
    const malformedDiagnostics = []
    const malformedProvider = createMattPocockSkillProvider('stable', {
      packageRoot: temporary,
      catalog: oneSkillCatalog(malformedRow),
      diagnostic: (message) => malformedDiagnostics.push(message),
    })
    assert.equal(await malformedProvider.get((await malformedProvider.list({}))[0], {}), undefined)
    assert.match(malformedDiagnostics[0], /frontmatter boundary differs/)

    const prefix = Buffer.from('---\nname: synthetic\ndescription: Synthetic test Skill\n---\n')
    const invalidUtf8 = Buffer.concat([prefix, Buffer.from([0xff, 0x0a])])
    const invalidRow = { ...malformedRow, bodyByteOffset: prefix.length, sha256: sha256(invalidUtf8) }
    await writeSkill(temporary, invalidRow.skillPath, invalidUtf8)
    const utf8Diagnostics = []
    const utf8Provider = createMattPocockSkillProvider('stable', {
      packageRoot: temporary,
      catalog: oneSkillCatalog(invalidRow),
      diagnostic: (message) => utf8Diagnostics.push(message),
    })
    assert.equal(await utf8Provider.get((await utf8Provider.list({}))[0], {}), undefined)
    assert.match(utf8Diagnostics[0], /not valid UTF-8/)
  } finally {
    await rm(temporary, { recursive: true, force: true })
  }
})
