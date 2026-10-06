#!/usr/bin/env node
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { chmod, copyFile, lstat, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, isAbsolute, join, posix, relative, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

import { parseStrictJsonBytes, verifyCommittedArtifacts } from './lib/source-ingestion.mjs'

export const repositoryRoot = fileURLToPath(new URL('../', import.meta.url))

export const PACKAGE_FILES_ALLOWLIST = Object.freeze([
  'lib/index.js',
  'lib/catalog.js',
  'lib/provider.js',
  'lib/types/index.d.ts',
  'lib/types/catalog.d.ts',
  'lib/types/provider.d.ts',
  'lib/controls/index.js',
  'lib/controls/policy.js',
  'lib/controls/state.js',
  'lib/controls/storage.js',
  'lib/controls/validation.js',
  'lib/types/controls/index.d.ts',
  'lib/types/controls/policy.d.ts',
  'lib/types/controls/state.d.ts',
  'lib/types/controls/storage.d.ts',
  'lib/types/controls/validation.d.ts',
  'lib/controls/instrument-state.js',
  'lib/controls/instrument-storage.js',
  'lib/controls/instruments.js',
  'lib/controls/versioned-storage.js',
  'lib/types/controls/instrument-state.d.ts',
  'lib/types/controls/instrument-storage.d.ts',
  'lib/types/controls/instruments.d.ts',
  'lib/types/controls/versioned-storage.d.ts',
  'lib/host.js',
  'lib/runtime.js',
  'lib/client.js',
  'lib/types/host.d.ts',
  'lib/types/runtime.d.ts',
  'lib/types/client.d.ts',
  'lib/controls/windows.js',
  'lib/controls/resources.js',
  'lib/controls/git-worktrees.js',
  'lib/controls/consumption.js',
  'lib/controls/remote-contract.js',
  'lib/controls/runtime-state.js',
  'lib/controls/history.js',
  'lib/controls/worktree-bindings.js',
  'lib/types/controls/history.d.ts',
  'lib/types/controls/worktree-bindings.d.ts',
  'lib/types/controls/windows.d.ts',
  'lib/types/controls/resources.d.ts',
  'lib/types/controls/git-worktrees.d.ts',
  'lib/types/controls/consumption.d.ts',
  'lib/types/controls/remote-contract.d.ts',
  'lib/types/controls/runtime-state.d.ts',
  'lib/controls/startup-state.js',
  'lib/controls/startup-support.js',
  'lib/types/controls/startup-state.d.ts',
  'lib/types/controls/startup-support.d.ts',
  'lib/compatibility/native-subagent.js',
  'lib/types/compatibility/native-subagent.d.ts',
  'compatibility/native-subagent-0.2.1-alpha.1.js',
  'compatibility/native-subagent.provenance.json',
  'lib/compatibility/readiness.js',
  'lib/types/compatibility/readiness.d.ts',
  'lib/compatibility/composition.js',
  'lib/types/compatibility/composition.d.ts',
  'lib/compatibility/managed-sdk.js',
  'lib/compatibility/cli.js',
  'lib/compatibility/host-startup.js',
  'lib/types/compatibility/managed-sdk.d.ts',
  'lib/types/compatibility/cli.d.ts',
  'lib/types/compatibility/host-startup.d.ts',
  'compatibility/initial-cwd.recipe.json',
  'cordis.patch.yml',
  'generated/catalog.json',
  'vendor/mattpocock-skills/',
  'PROVENANCE.json',
  'vendor-files.json',
  'source-lock.json',
  'README.md',
  'README.zh-CN.md',
  'MIGRATION.md',
  'CONTROLS.md',
  'LICENSE',
  'THIRD_PARTY_NOTICES.md',
])

export const FIXED_PACKED_FILES = Object.freeze([
  'cordis.patch.yml',
  'generated/catalog.json',
  'lib/catalog.js',
  'lib/index.js',
  'lib/provider.js',
  'lib/types/catalog.d.ts',
  'lib/types/index.d.ts',
  'lib/types/provider.d.ts',
  'lib/controls/index.js',
  'lib/controls/policy.js',
  'lib/controls/state.js',
  'lib/controls/storage.js',
  'lib/controls/validation.js',
  'lib/types/controls/index.d.ts',
  'lib/types/controls/policy.d.ts',
  'lib/types/controls/state.d.ts',
  'lib/types/controls/storage.d.ts',
  'lib/types/controls/validation.d.ts',
  'lib/controls/instrument-state.js',
  'lib/controls/instrument-storage.js',
  'lib/controls/instruments.js',
  'lib/controls/versioned-storage.js',
  'lib/types/controls/instrument-state.d.ts',
  'lib/types/controls/instrument-storage.d.ts',
  'lib/types/controls/instruments.d.ts',
  'lib/types/controls/versioned-storage.d.ts',
  'lib/host.js',
  'lib/runtime.js',
  'lib/client.js',
  'lib/types/host.d.ts',
  'lib/types/runtime.d.ts',
  'lib/types/client.d.ts',
  'lib/controls/windows.js',
  'lib/controls/resources.js',
  'lib/controls/git-worktrees.js',
  'lib/controls/consumption.js',
  'lib/controls/remote-contract.js',
  'lib/controls/runtime-state.js',
  'lib/controls/history.js',
  'lib/controls/worktree-bindings.js',
  'lib/types/controls/history.d.ts',
  'lib/types/controls/worktree-bindings.d.ts',
  'lib/types/controls/windows.d.ts',
  'lib/types/controls/resources.d.ts',
  'lib/types/controls/git-worktrees.d.ts',
  'lib/types/controls/consumption.d.ts',
  'lib/types/controls/remote-contract.d.ts',
  'lib/types/controls/runtime-state.d.ts',
  'lib/controls/startup-state.js',
  'lib/controls/startup-support.js',
  'lib/types/controls/startup-state.d.ts',
  'lib/types/controls/startup-support.d.ts',
  'lib/compatibility/native-subagent.js',
  'lib/types/compatibility/native-subagent.d.ts',
  'compatibility/native-subagent-0.2.1-alpha.1.js',
  'compatibility/native-subagent.provenance.json',
  'lib/compatibility/readiness.js',
  'lib/types/compatibility/readiness.d.ts',
  'lib/compatibility/composition.js',
  'lib/types/compatibility/composition.d.ts',
  'lib/compatibility/managed-sdk.js',
  'lib/compatibility/cli.js',
  'lib/compatibility/host-startup.js',
  'lib/types/compatibility/managed-sdk.d.ts',
  'lib/types/compatibility/cli.d.ts',
  'lib/types/compatibility/host-startup.d.ts',
  'compatibility/initial-cwd.recipe.json',
  'LICENSE',
  'package.json',
  'PROVENANCE.json',
  'README.md',
  'README.zh-CN.md',
  'MIGRATION.md',
  'CONTROLS.md',
  'source-lock.json',
  'THIRD_PARTY_NOTICES.md',
  'vendor-files.json',
])

const EXPECTED_VERSION = '0.4.1'

export const EXPECTED_PEERS = Object.freeze({
  '@deepseek-ai/cordis': '^4.0.2 || ~4.0.5-alpha.1',
  '@deepseek-ai/dsh-skill': '^0.1.2-rc.1 || ^0.1.5-rc.2 || ^0.1.7-alpha.2 || ^0.2.0-rc.1 || ~0.2.1-alpha.1',
  '@deepseek-ai/schemastery': '^3.18.2',
  '@deepseek-ai/dsh-session': '~0.2.1-alpha.1',
  '@deepseek-ai/dsh-workspace': '~0.2.1-alpha.1',
  '@deepseek-ai/dsh-storage-domain': '~0.2.1-alpha.1',
  '@deepseek-ai/dsh-subagent': '~0.2.1-alpha.1',
  '@deepseek-ai/dsh-tools': '~0.2.1-alpha.1',
  '@deepseek-ai/dsh-llm': '~0.2.1-alpha.1',
  '@deepseek-ai/dsh-typert-protocol': '~0.2.1-alpha.1',
  '@deepseek-ai/dsh-sandbox': '~0.2.1-alpha.1',
  '@deepseek-ai/cordis-plugin-loader': '~1.0.6-alpha.1',
  '@deepseek-ai/dsh-agent': '~0.2.1-alpha.1',
  '@deepseek-ai/dsh-attachment': '~0.2.1-alpha.1',
  '@deepseek-ai/dsh-brand': '~0.2.1-alpha.1',
  '@deepseek-ai/dsh-chunked-list': '~0.2.1-alpha.1',
  '@deepseek-ai/dsh-scope': '~0.2.1-alpha.1',
  '@deepseek-ai/dsh-util-time': '~0.2.1-alpha.1',
  '@deepseek-ai/dsh-util-values': '~0.2.1-alpha.1',
  'react': '^18.2.0',
  'zod': '^4.6.5',
})

// Host capabilities are optional extension seams, not unconditional core support.
export const EXPECTED_PEER_META = Object.freeze(Object.fromEntries(
  Object.keys(EXPECTED_PEERS).slice(3).map(name => [name, Object.freeze({ optional: true })]),
))

export const EXPECTED_CLIENT = Object.freeze({
  entry: './lib/client.js',
  platform: 'web',
  inject: Object.freeze([
    '@deepseek-ai/dsh-client-ui-renderer',
    '@deepseek-ai/dsh-client-ui-session',
    '@deepseek-ai/dsh-client-ui-conversation',
    '@deepseek-ai/dsh-client-ui-sidebar-right',
    '@deepseek-ai/dsh-client-ui-workspace',
    '@deepseek-ai/dsh-client-ui-plugin-manager',
    '@deepseek-ai/dsh-client-ui-tool',
    '@deepseek-ai/dsh-api-gateway',
  ]),
})

const FORBIDDEN_PACKED_PATHS = Object.freeze([
  'src',
  'tests',
  'scripts',
  'docs',
  'node_modules',
  'tsconfig.json',
  'tsconfig.client.json',
  'pnpm-lock.yaml',
  'dsh.plugin.json',
])

const EXPECTED_FIXED_PACKED_FILES = 77
const EXPECTED_VENDOR_PACKED_FILES = 85
export const EXPECTED_PACKED_FILES = EXPECTED_FIXED_PACKED_FILES + EXPECTED_VENDOR_PACKED_FILES
const MAX_TARBALL_BYTES = 16 * 1024 * 1024
const EXPECTED_PNPM_VERSION = '11.8.0'

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

function sameJson(actual, expected) {
  return JSON.stringify(actual) === JSON.stringify(expected)
}

function modeString(mode) {
  return '0' + mode.toString(8).padStart(3, '0')
}

function canonicalFileMode(mode) {
  return mode & 0o111 ? 0o755 : 0o644
}

export function requirePnpmVersion() {
  const version = execFileSync('pnpm', ['--version'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
  assert(version === EXPECTED_PNPM_VERSION, 'Phase 4 requires pnpm ' + EXPECTED_PNPM_VERSION + ', got ' + version)
  return version
}

function requireCleanSourceCommit(root) {
  const commit = execFileSync('git', ['-C', root, 'rev-parse', 'HEAD'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
  assert(/^[0-9a-f]{40}$/.test(commit), 'source Git commit is invalid')
  const status = execFileSync('git', ['-C', root, 'status', '--porcelain=v1', '--untracked-files=all'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
  assert(status.length === 0, 'source Git tree must be clean before Phase 4 package verification')
  return { commit, clean: true }
}

export function expectedPackedFileBytes(path, sourceBytes) {
  assert(Buffer.isBuffer(sourceBytes), 'packed source bytes must be a Buffer')
  if (path !== 'package.json') return sourceBytes
  assert(sourceBytes.length > 1 && sourceBytes.at(-1) === 0x0a && sourceBytes.at(-2) !== 0x0a && sourceBytes.at(-2) !== 0x0d, 'source package.json must end in exactly one LF')
  return sourceBytes.subarray(0, sourceBytes.length - 1)
}

export function validatePackagePolicy(packageJson) {
  assert(PACKAGE_FILES_ALLOWLIST.length === EXPECTED_FIXED_PACKED_FILES, 'internal package allowlist count must remain exactly ' + EXPECTED_FIXED_PACKED_FILES)
  assert(FIXED_PACKED_FILES.length === EXPECTED_FIXED_PACKED_FILES, 'internal fixed package file count must remain exactly ' + EXPECTED_FIXED_PACKED_FILES)
  assert(new Set(PACKAGE_FILES_ALLOWLIST).size === PACKAGE_FILES_ALLOWLIST.length && new Set(FIXED_PACKED_FILES).size === FIXED_PACKED_FILES.length, 'duplicate internal package allowlist paths')
  assert(sameJson(PACKAGE_FILES_ALLOWLIST.filter(path => path.startsWith('lib/')).sort(), FIXED_PACKED_FILES.filter(path => path.startsWith('lib/')).sort()), 'prebuilt module exact allowlists disagree')
  assert(packageJson && typeof packageJson === 'object' && !Array.isArray(packageJson), 'package.json must contain an object')
  assert(packageJson.name === '@lmgatex/dsh-mattpocock-skills', 'package name is not the accepted package identity')
  assert(packageJson.version === EXPECTED_VERSION, 'verifier requires the current release version ' + EXPECTED_VERSION)
  assert(packageJson.private === true, 'package must remain private')
  assert(packageJson.type === 'module', 'package must remain ESM')
  assert(packageJson.main === './lib/index.js', 'package main target is invalid')
  assert(packageJson.types === './lib/types/index.d.ts', 'package types target is invalid')
  assert(packageJson.packageManager === 'pnpm@11.8.0', 'package manager pin is invalid')
  assert(sameJson(packageJson.files, PACKAGE_FILES_ALLOWLIST), 'package files allowlist differs from the accepted Phase 4 allowlist')
  assert(sameJson(packageJson.peerDependencies, EXPECTED_PEERS), 'peer dependency policy differs from the tested host seams')
  assert(sameJson(packageJson.peerDependenciesMeta, EXPECTED_PEER_META), 'optional peer metadata differs from the accepted capability seams')
  assert(sameJson(packageJson.exports?.['./controls'], { types: './lib/types/controls/index.d.ts', default: './lib/controls/index.js' }), 'controls export target is invalid')
  const exports = {
    '.': { types: './lib/types/index.d.ts', default: './lib/index.js' },
    './controls': { types: './lib/types/controls/index.d.ts', default: './lib/controls/index.js' },
    './compatibility': { types: './lib/types/compatibility/managed-sdk.d.ts', default: './lib/compatibility/managed-sdk.js' },
    './native-subagent': { types: './lib/types/compatibility/native-subagent.d.ts', default: './lib/compatibility/native-subagent.js' },
    './host': { types: './lib/types/host.d.ts', default: './lib/host.js' },
    './client': { types: './lib/types/client.d.ts', default: './lib/client.js' },
    './cordis.patch.yml': './cordis.patch.yml',
    './package.json': './package.json',
  }
  // Subpath order is immaterial; conditional targets must still put types first.
  assert(packageJson.exports && sameJson(Object.keys(packageJson.exports).sort(), Object.keys(exports).sort())
    && Object.entries(exports).every(([name, target]) => sameJson(packageJson.exports[name], target)), 'package exports differ from the closed runtime entry targets')
  assert(sameJson(packageJson.bin, { 'dsh-mattpocock-skills-cwd': './lib/compatibility/cli.js' }), 'compatibility CLI must be the one closed bin target')
  assert(packageJson.dsh?.bundle?.patch === './cordis.patch.yml', 'DSH bundle patch target is invalid')
  assert(sameJson(packageJson.dsh?.client, EXPECTED_CLIENT), 'optional DSH client graph differs from the accepted web integration')
  for (const key of ['scripts', 'dependencies', 'optionalDependencies', 'bundledDependencies', 'bundleDependencies', 'publishConfig']) {
    assert(!Object.hasOwn(packageJson, key), 'package.json must not declare ' + key)
  }
  return {
    name: packageJson.name,
    version: packageJson.version,
    private: packageJson.private,
    files: packageJson.files.length,
    peerDependencies: Object.keys(packageJson.peerDependencies).sort(),
  }
}

export function validateArchivePath(input, { directory = false } = {}) {
  assert(typeof input === 'string' && input.length > 0, 'archive path must be non-empty')
  assert(!input.includes('\0'), 'archive path contains a NUL byte')
  assert(!input.includes('\\'), 'archive path must use forward slashes')
  assert(input.normalize('NFC') === input, 'archive path is not NFC-normalized: ' + JSON.stringify(input))
  assert(!posix.isAbsolute(input), 'archive path must be relative: ' + JSON.stringify(input))
  const path = directory && input.endsWith('/') ? input.slice(0, -1) : input
  assert(path.length > 0, 'archive path is empty after normalization')
  const parts = path.split('/')
  assert(parts.every((part) => part.length > 0 && part !== '.' && part !== '..'), 'archive path has an unsafe segment: ' + JSON.stringify(input))
  assert(posix.normalize(path) === path, 'archive path is not normalized: ' + JSON.stringify(input))
  assert(parts[0] === 'package', 'archive member must be beneath package/: ' + JSON.stringify(input))
  return path
}

function validateSymlinkTarget(memberPath, target) {
  assert(typeof target === 'string' && target.length > 0, 'symlink target is empty for ' + memberPath)
  assert(!target.includes('\0') && !target.includes('\\'), 'symlink target is unsafe for ' + memberPath)
  assert(target.normalize('NFC') === target, 'symlink target is not NFC-normalized for ' + memberPath)
  assert(!posix.isAbsolute(target), 'symlink target must be relative for ' + memberPath)
  const resolved = posix.normalize(posix.join(posix.dirname(memberPath), target))
  assert(resolved === 'package' || resolved.startsWith('package/'), 'symlink escapes package root: ' + memberPath + ' -> ' + target)
  return resolved
}

function ancestorDirectories(paths) {
  const result = new Set(['package'])
  for (const path of paths) {
    const parts = path.split('/')
    for (let index = 1; index < parts.length; index += 1) result.add(parts.slice(0, index).join('/'))
  }
  return result
}

export function validateTarMembers(members, expectedMembers) {
  assert(Array.isArray(members), 'tar members must be an array')
  assert(expectedMembers instanceof Map, 'expected tar members must be a Map')
  const allowedDirectories = ancestorDirectories(expectedMembers.keys())
  const seen = new Set()
  const portable = new Map()
  let directories = 0
  let files = 0
  let symlinks = 0

  for (const member of members) {
    assert(member && typeof member === 'object', 'tar member must be an object')
    const path = validateArchivePath(member.path, { directory: member.type === 'directory' })
    assert(!seen.has(path), 'duplicate tar member ' + path)
    seen.add(path)
    const portablePath = path.toLowerCase()
    assert(!portable.has(portablePath), 'case-fold collision between ' + portable.get(portablePath) + ' and ' + path)
    portable.set(portablePath, path)

    if (member.type === 'directory') {
      assert(allowedDirectories.has(path), 'unexpected tar directory ' + path)
      directories += 1
      continue
    }

    assert(member.type === 'file' || member.type === 'symlink', 'unsupported tar member type ' + member.type + ' for ' + path)
    const expected = expectedMembers.get(path)
    assert(expected, 'unexpected tar member ' + path)
    assert(member.type === expected.type, 'tar member type differs for ' + path + ': expected ' + expected.type + ', got ' + member.type)
    assert(Number.isSafeInteger(member.size) && member.size === expected.size, 'tar member size differs for ' + path + ': expected ' + expected.size + ', got ' + member.size)
    if (member.type === 'file') {
      assert(Number.isInteger(member.mode), 'tar member mode is missing for ' + path)
      assert(member.mode === expected.mode, 'tar member mode differs for ' + path + ': expected ' + modeString(expected.mode) + ', got ' + modeString(member.mode))
      files += 1
    } else {
      validateSymlinkTarget(path, member.target)
      assert(member.target === expected.target, 'tar symlink target differs for ' + path)
      symlinks += 1
    }
  }

  for (const [path] of expectedMembers) assert(seen.has(path), 'tar archive is missing ' + path)
  for (const member of members) {
    if (member.type !== 'symlink') continue
    const path = member.path.endsWith('/') ? member.path.slice(0, -1) : member.path
    assert(!members.some((candidate) => candidate !== member && candidate.path.startsWith(path + '/')), 'tar symlink is an ancestor of another member: ' + path)
  }
  return { directories, files, symlinks, expectedFiles: expectedMembers.size }
}

export function parseChecksumText(text, tarballPath, checksumPath = tarballPath + '.sha256') {
  assert(typeof text === 'string', 'checksum file must be text')
  const lines = text.split(/\r?\n/).filter((line) => line.length > 0)
  assert(lines.length === 1, 'checksum file must contain exactly one non-empty line')
  const match = /^([0-9a-fA-F]{64})(?:[ \t]+\*?(.+))?$/.exec(lines[0])
  assert(match, 'checksum file is not in SHA-256 format')
  const hash = match[1].toLowerCase()
  const namedPath = match[2]
  if (namedPath !== undefined) {
    const expected = resolve(tarballPath)
    const named = isAbsolute(namedPath) ? resolve(namedPath) : resolve(dirname(checksumPath), namedPath)
    assert(named === expected, 'checksum file names a different artifact: ' + namedPath)
  }
  return hash
}

export function diffFileInventories(expectedRecords, actualRecords) {
  const expected = new Map(expectedRecords.map((entry) => [entry.path, entry]))
  const actual = new Map(actualRecords.map((entry) => [entry.path, entry]))
  const differences = []
  for (const path of [...expected.keys()].sort()) {
    const left = expected.get(path)
    const right = actual.get(path)
    if (!right) {
      differences.push('missing ' + path)
      continue
    }
    if (left.mode !== right.mode) differences.push('mode ' + path + ': expected ' + modeString(left.mode) + ', got ' + modeString(right.mode))
    const bytesDiffer = Buffer.isBuffer(left.bytes) && Buffer.isBuffer(right.bytes)
      ? !left.bytes.equals(right.bytes)
      : left.sha256 !== right.sha256
    if (bytesDiffer) differences.push('bytes ' + path + ' differ')
  }
  for (const path of [...actual.keys()].sort()) if (!expected.has(path)) differences.push('unexpected ' + path)
  return differences
}

async function sha256File(path) {
  const hash = createHash('sha256')
  await new Promise((accept, reject) => {
    const stream = createReadStream(path)
    stream.on('data', (chunk) => hash.update(chunk))
    stream.on('error', reject)
    stream.on('end', accept)
  })
  return hash.digest('hex')
}

async function walkRegularFiles(root) {
  const records = []
  async function visit(directory) {
    const entries = await readdir(directory, { withFileTypes: true })
    entries.sort((a, b) => Buffer.compare(Buffer.from(a.name), Buffer.from(b.name)))
    for (const entry of entries) {
      const absolute = join(directory, entry.name)
      const path = relative(root, absolute).split('\\').join('/')
      const info = await lstat(absolute)
      assert(!info.isSymbolicLink(), 'unexpected symlink in build output: ' + path)
      if (info.isDirectory()) {
        await visit(absolute)
      } else {
        assert(info.isFile(), 'unexpected non-regular build output: ' + path)
        const bytes = await readFile(absolute)
        records.push({ path, mode: canonicalFileMode(info.mode), bytes, sha256: createHash('sha256').update(bytes).digest('hex') })
      }
    }
  }
  await visit(root)
  return records
}

export async function compareCommittedBuild(root) {
  root = resolve(root)
  const temporary = await mkdtemp(join(tmpdir(), 'dsh-package-build-'))
  const builtRoot = join(temporary, 'lib')
  const clientPaths = new Set(['client.js', 'types/client.d.ts'])
  try {
    // Rebase the repository's SDK compiled-type paths when extending outside it.
    // Host tsc never emits the independent browser lazy-CJS entry/declaration.
    const sourceConfig = parseStrictJsonBytes(await readFile(join(root, 'tsconfig.json')), 'tsconfig.json')
    const paths = Object.fromEntries(Object.entries(sourceConfig.compilerOptions.paths ?? {})
      .map(([name, targets]) => [name, targets.map(target => resolve(root, sourceConfig.compilerOptions.baseUrl ?? '.', target))]))
    const scratchConfig = join(temporary, 'tsconfig.host.json')
    await writeFile(scratchConfig, JSON.stringify({
      extends: join(root, 'tsconfig.json'),
      compilerOptions: { paths, typeRoots: (sourceConfig.compilerOptions.typeRoots ?? ['node_modules/@types']).map(path => resolve(root, path)),
        outDir: builtRoot, declarationDir: join(builtRoot, 'types') },
      include: [join(root, 'src/**/*.ts')],
      exclude: [join(root, 'src/client.ts')],
    }))
    const previousUmask = process.umask(0o022)
    try {
      execFileSync('pnpm', ['exec', 'tsc', '-p', scratchConfig],
        { cwd: root, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] })
    } catch (error) {
      const detail = error.stderr?.toString().trim() || error.stdout?.toString().trim() || error.message
      throw new Error('scratch Host TypeScript build failed: ' + detail, { cause: error })
    } finally {
      process.umask(previousUmask)
    }
    // tsc preserves the CLI shebang but creates scratch files without execute bits.
    // The one closed package.bin target is executable in both reproducible trees.
    await chmod(join(builtRoot, 'compatibility/cli.js'), 0o755)
    const [committed, built] = await Promise.all([walkRegularFiles(join(root, 'lib')), walkRegularFiles(builtRoot)])
    const expectedPaths = PACKAGE_FILES_ALLOWLIST.filter(path => path.startsWith('lib/')).map(path => path.slice(4)).sort()
    assert(sameJson(committed.map(entry => entry.path).sort(), expectedPaths), 'committed lib does not match the exact prebuilt module allowlist')
    assert(!built.some(entry => clientPaths.has(entry.path)), 'Host tsc must not emit standalone Client artifacts')
    const differences = diffFileInventories(committed.filter(entry => !clientPaths.has(entry.path)), built)
    assert(differences.length === 0, 'committed Host lib differs from scratch build:\n' + differences.join('\n'))
    const { buildClient } = await import(pathToFileURL(join(root, 'scripts/build-client.mjs')).href)
    const client = await buildClient({ root, declaration: true })
    assert(sameJson(client.externals, ['react']), 'Client value externals must remain baseline React only')
    const clientBuilt = [
      { path: 'client.js', mode: 0o644, bytes: Buffer.from(client.code) },
      { path: 'types/client.d.ts', mode: 0o644, bytes: Buffer.from(client.declaration) },
    ]
    const clientDifferences = diffFileInventories(committed.filter(entry => clientPaths.has(entry.path)), clientBuilt)
    assert(clientDifferences.length === 0, 'committed lazy-CJS Client differs from independent in-memory build:\n' + clientDifferences.join('\n'))
    // Guard source spelling is part of the shipped before-import protocol.
    // The generator is read-only in check mode and imports no SDK runtime.
    execFileSync(process.execPath, [join(root, 'scripts/build-compatibility-patch.mjs'), '--check'],
      { cwd: root, encoding: 'utf8', maxBuffer: 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] })
    return { files: committed.length, paths: committed.map((entry) => entry.path) }
  } finally {
    assert(isAbsolute(temporary) && temporary.startsWith(join(tmpdir(), 'dsh-package-build-')), 'unexpected scratch build cleanup path')
    await rm(temporary, { recursive: true, force: true })
  }
}

async function readPackageJson(root) {
  const bytes = await readFile(join(root, 'package.json'))
  return { bytes, value: parseStrictJsonBytes(bytes, 'package.json') }
}

async function readVendorInventory(root) {
  const bytes = await readFile(join(root, 'vendor-files.json'))
  const inventory = parseStrictJsonBytes(bytes, 'vendor-files.json')
  assert(inventory && typeof inventory === 'object' && !Array.isArray(inventory), 'vendor-files.json must contain an object')
  assert(inventory.root === 'vendor/mattpocock-skills', 'vendor inventory root is invalid')
  assert(Array.isArray(inventory.entries), 'vendor inventory entries must be an array')
  assert(inventory.fileCount === EXPECTED_VENDOR_PACKED_FILES, 'vendor inventory fileCount must remain exactly ' + EXPECTED_VENDOR_PACKED_FILES)
  assert(inventory.entries.length === EXPECTED_VENDOR_PACKED_FILES, 'vendor inventory must contain exactly ' + EXPECTED_VENDOR_PACKED_FILES + ' entries')
  return inventory
}

function inventoryMode(mode) {
  if (mode === '100644') return 0o644
  if (mode === '100755') return 0o755
  if (mode === '120000') return undefined
  throw new Error('unsupported inventory mode ' + JSON.stringify(mode))
}

export async function expectedTarMembers(root, inventory) {
  const expected = new Map()
  for (const path of FIXED_PACKED_FILES) {
    const absolute = join(root, ...path.split('/'))
    const [info, sourceBytes] = await Promise.all([lstat(absolute), readFile(absolute)])
    assert(info.isFile() && !info.isSymbolicLink(), 'fixed package path must be a regular file: ' + path)
    expected.set('package/' + path, { type: 'file', mode: canonicalFileMode(info.mode), size: expectedPackedFileBytes(path, sourceBytes).length })
  }
  for (const entry of inventory.entries) {
    assert(entry && typeof entry === 'object', 'vendor inventory entry must be an object')
    const relativePath = validateArchivePath('package/' + inventory.root + '/' + entry.path).slice('package/'.length)
    const path = 'package/' + relativePath
    assert(!expected.has(path), 'duplicate expected package path ' + path)
    if (entry.kind === 'file') {
      assert(Number.isSafeInteger(entry.size) && entry.size >= 0, 'vendor inventory size is invalid for ' + entry.path)
      expected.set(path, { type: 'file', mode: inventoryMode(entry.mode), size: entry.size })
    } else if (entry.kind === 'symlink') {
      assert(entry.mode === '120000', 'symlink inventory mode is invalid for ' + entry.path)
      expected.set(path, { type: 'symlink', target: entry.target, size: 0 })
    } else {
      throw new Error('unsupported vendor inventory kind ' + JSON.stringify(entry.kind))
    }
  }
  assert(expected.size === EXPECTED_PACKED_FILES, 'expected package inventory must remain exactly ' + EXPECTED_PACKED_FILES + ' files')
  return expected
}

function parseQuotedToken(input, label) {
  assert(input.startsWith('"'), label + ' is not C-quoted')
  let escaped = false
  for (let index = 1; index < input.length; index += 1) {
    const character = input[index]
    if (escaped) {
      escaped = false
      continue
    }
    if (character === '\\') {
      escaped = true
      continue
    }
    if (character !== '"') continue
    const token = input.slice(0, index + 1)
    let value
    try {
      value = JSON.parse(token)
    } catch (error) {
      throw new Error(label + ' uses unsupported GNU tar quoting', { cause: error })
    }
    return { value, rest: input.slice(index + 1) }
  }
  throw new Error(label + ' has an unterminated quoted value')
}

function parseSymbolicMode(value) {
  assert(typeof value === 'string' && value.length === 10, 'GNU tar mode field is invalid')
  let mode = 0
  const positions = [
    [1, 'r', 0o400], [2, 'w', 0o200], [3, 'x', 0o100],
    [4, 'r', 0o040], [5, 'w', 0o020], [6, 'x', 0o010],
    [7, 'r', 0o004], [8, 'w', 0o002], [9, 'x', 0o001],
  ]
  for (const [index, character, bit] of positions) {
    assert(value[index] === '-' || value[index] === character, 'GNU tar mode contains unsupported permission bits: ' + value)
    if (value[index] === character) mode |= bit
  }
  return mode
}

export function parseGnuTarListing(text) {
  const members = []
  const lines = text.split('\n').filter((line) => line.length > 0)
  for (const line of lines) {
    const match = /^(.{10})\s+\d+\/\d+\s+(\d+)\s+\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:\s+[+-]\d{4})?\s+(.+)$/.exec(line)
    assert(match, 'cannot parse GNU tar listing line: ' + line)
    const symbolic = match[1]
    const typeCharacter = symbolic[0]
    const type = typeCharacter === '-' ? 'file'
      : typeCharacter === 'd' ? 'directory'
        : typeCharacter === 'l' ? 'symlink'
          : typeCharacter === 'h' ? 'hardlink'
            : 'unsupported-' + typeCharacter
    const parsedPath = parseQuotedToken(match[3], 'GNU tar member name')
    const member = { path: parsedPath.value, type, mode: parseSymbolicMode(symbolic), size: Number(match[2]) }
    if (type === 'symlink') {
      assert(parsedPath.rest.startsWith(' -> '), 'cannot parse GNU tar symlink target for ' + parsedPath.value)
      const parsedTarget = parseQuotedToken(parsedPath.rest.slice(4), 'GNU tar symlink target')
      assert(parsedTarget.rest.length === 0, 'unexpected data after GNU tar symlink target')
      member.target = parsedTarget.value
    }
    members.push(member)
  }
  return members
}

function gnuTarVersion() {
  const output = execFileSync('tar', ['--version'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
  const version = output.split('\n')[0]
  assert(version.includes('GNU tar'), 'Phase 4 archive verification requires GNU tar')
  return version
}

function listTarball(tarballPath) {
  let output
  try {
    output = execFileSync('tar', [
      '--list', '--gzip', '--verbose', '--numeric-owner', '--full-time', '--quoting-style=c', '--file', tarballPath,
    ], {
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, LC_ALL: 'C', TZ: 'UTC' },
    })
  } catch (error) {
    const detail = error.stderr?.toString().trim() || error.message
    throw new Error('GNU tar could not list artifact: ' + detail, { cause: error })
  }
  return parseGnuTarListing(output)
}

function extractTarball(tarballPath, destination) {
  try {
    execFileSync('tar', [
      '--extract', '--gzip', '--file', tarballPath, '--directory', destination,
      '--no-same-owner', '--no-same-permissions', '--delay-directory-restore',
    ], {
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, LC_ALL: 'C', TZ: 'UTC' },
    })
  } catch (error) {
    const detail = error.stderr?.toString().trim() || error.message
    throw new Error('GNU tar could not extract artifact: ' + detail, { cause: error })
  }
}

async function compareFixedExtractedFiles(sourceRoot, extractedRoot) {
  for (const path of FIXED_PACKED_FILES) {
    const sourcePath = join(sourceRoot, ...path.split('/'))
    const extractedPath = join(extractedRoot, ...path.split('/'))
    const [sourceInfo, extractedInfo, sourceBytes, extractedBytes] = await Promise.all([
      lstat(sourcePath), lstat(extractedPath), readFile(sourcePath), readFile(extractedPath),
    ])
    assert(sourceInfo.isFile() && extractedInfo.isFile() && !extractedInfo.isSymbolicLink(), 'fixed packed path is not a regular file: ' + path)
    assert(canonicalFileMode(sourceInfo.mode) === canonicalFileMode(extractedInfo.mode), 'extracted mode differs from source for ' + path)
    assert(expectedPackedFileBytes(path, sourceBytes).equals(extractedBytes), 'extracted bytes differ from expected packed source for ' + path)
  }
}

function collectExportTargets(value, result = []) {
  if (typeof value === 'string') {
    if (value.startsWith('./')) result.push(value)
    return result
  }
  if (value && typeof value === 'object') for (const child of Object.values(value)) collectExportTargets(child, result)
  return result
}

async function requirePackageTargets(extractedRoot, packageJson) {
  const targets = new Set([packageJson.main, packageJson.types, packageJson.dsh.bundle.patch, packageJson.dsh.client.entry, ...collectExportTargets(packageJson.exports), ...Object.values(packageJson.bin)])
  for (const target of targets) {
    assert(typeof target === 'string' && target.startsWith('./'), 'package target must be package-relative: ' + JSON.stringify(target))
    const normalized = posix.normalize(target.slice(2))
    assert(normalized.length > 0 && normalized !== '..' && !normalized.startsWith('../'), 'package target escapes root: ' + target)
    const info = await lstat(join(extractedRoot, ...normalized.split('/')))
    assert(info.isFile() && !info.isSymbolicLink(), 'package target is not a regular file: ' + target)
  }
  return [...targets].sort()
}

async function requireForbiddenPathsAbsent(extractedRoot) {
  for (const path of FORBIDDEN_PACKED_PATHS) {
    try {
      await lstat(join(extractedRoot, ...path.split('/')))
      throw new Error('forbidden packed path exists: ' + path)
    } catch (error) {
      if (error.code !== 'ENOENT') throw error
    }
  }
}

export async function runPrepack({ root = repositoryRoot } = {}) {
  const pnpm = requirePnpmVersion()
  const source = requireCleanSourceCommit(root)
  const packageJson = await readPackageJson(root)
  const packagePolicy = validatePackagePolicy(packageJson.value)
  const vendor = await verifyCommittedArtifacts(root)
  const build = await compareCommittedBuild(root)
  const inventory = await readVendorInventory(root)
  const expected = await expectedTarMembers(root, inventory)
  return {
    mode: 'prepack',
    root,
    source,
    pnpm,
    package: packagePolicy,
    build,
    vendor,
    expectedPackedFiles: expected.size,
    fixedPackedFiles: FIXED_PACKED_FILES.length,
    vendoredPackedFiles: inventory.entries.length,
  }
}

export async function runTarball({ root = repositoryRoot, tarballPath, checksumPath, sizePath, sourceCommitPath, pnpmVersionPath }) {
  assert(typeof tarballPath === 'string' && tarballPath.length > 0, '--tarball requires a path')
  assert(typeof checksumPath === 'string' && checksumPath.length > 0, '--sha256-file requires a path')
  assert(typeof sizePath === 'string' && sizePath.length > 0, '--size-file requires a path')
  assert(typeof sourceCommitPath === 'string' && sourceCommitPath.length > 0, '--source-commit-file requires a path')
  assert(typeof pnpmVersionPath === 'string' && pnpmVersionPath.length > 0, '--pnpm-version-file requires a path')
  const absoluteTarball = resolve(tarballPath)
  const absoluteChecksum = resolve(checksumPath)
  const absoluteSize = resolve(sizePath)
  const absoluteSourceCommit = resolve(sourceCommitPath)
  const absolutePnpmVersion = resolve(pnpmVersionPath)
  const pnpm = requirePnpmVersion()
  const source = requireCleanSourceCommit(root)
  const packageJson = await readPackageJson(root)
  const packagePolicy = validatePackagePolicy(packageJson.value)
  const sourceVendor = await verifyCommittedArtifacts(root)
  const build = await compareCommittedBuild(root)
  const inventory = await readVendorInventory(root)
  const expected = await expectedTarMembers(root, inventory)
  const tarVersion = gnuTarVersion()
  const [tarballInfo, checksumInfo, sizeInfo, sourceCommitInfo, pnpmVersionInfo] = await Promise.all([
    lstat(absoluteTarball), lstat(absoluteChecksum), lstat(absoluteSize), lstat(absoluteSourceCommit), lstat(absolutePnpmVersion),
  ])
  assert(tarballInfo.isFile() && !tarballInfo.isSymbolicLink(), 'tarball must be a regular non-symlink file')
  assert(checksumInfo.isFile() && !checksumInfo.isSymbolicLink(), 'checksum must be a regular non-symlink file')
  assert(sizeInfo.isFile() && !sizeInfo.isSymbolicLink(), 'size record must be a regular non-symlink file')
  assert(sourceCommitInfo.isFile() && !sourceCommitInfo.isSymbolicLink(), 'source commit record must be a regular non-symlink file')
  assert(pnpmVersionInfo.isFile() && !pnpmVersionInfo.isSymbolicLink(), 'pnpm version record must be a regular non-symlink file')
  for (const info of [checksumInfo, sizeInfo, sourceCommitInfo, pnpmVersionInfo]) assert((info.mode & 0o222) === 0, 'artifact identity records must be read-only')
  const recordedSizeText = (await readFile(absoluteSize, 'utf8')).trim()
  assert(/^[1-9][0-9]*$/.test(recordedSizeText) && Number.isSafeInteger(Number(recordedSizeText)), 'artifact size record must contain one positive safe integer')
  assert(Number(recordedSizeText) === tarballInfo.size, 'artifact size record differs: expected ' + tarballInfo.size + ', got ' + recordedSizeText)
  const recordedSourceCommit = (await readFile(absoluteSourceCommit, 'utf8')).trim()
  const recordedPnpmVersion = (await readFile(absolutePnpmVersion, 'utf8')).trim()
  assert(recordedSourceCommit === source.commit, 'artifact source commit record differs: expected ' + source.commit + ', got ' + recordedSourceCommit)
  assert(recordedPnpmVersion === pnpm, 'artifact pnpm version record differs: expected ' + pnpm + ', got ' + recordedPnpmVersion)
  assert((tarballInfo.mode & 0o222) === 0, 'accepted tarball must be read-only')
  assert(tarballInfo.size > 0 && tarballInfo.size <= MAX_TARBALL_BYTES, 'tarball exceeds the Phase 4 compressed-size limit')
  const checksumText = await readFile(absoluteChecksum, 'utf8')
  const expectedSha256 = parseChecksumText(checksumText, absoluteTarball, absoluteChecksum)

  const temporary = await mkdtemp(join(tmpdir(), 'dsh-package-tar-'))
  const snapshot = join(temporary, 'artifact.tgz')
  try {
    await copyFile(absoluteTarball, snapshot)
    await chmod(snapshot, 0o444)
    const sha256 = await sha256File(snapshot)
    assert(sha256 === expectedSha256, 'tarball SHA-256 differs: expected ' + expectedSha256 + ', got ' + sha256)
    const members = listTarball(snapshot)
    const memberSummary = validateTarMembers(members, expected)
    assert(await sha256File(snapshot) === sha256, 'private tarball snapshot changed after listing')
    extractTarball(snapshot, temporary)
    assert(await sha256File(snapshot) === sha256, 'private tarball snapshot changed after extraction')
    const extractedRoot = join(temporary, 'package')
    await compareFixedExtractedFiles(root, extractedRoot)
    const extractedPackage = await readPackageJson(extractedRoot)
    validatePackagePolicy(extractedPackage.value)
    const vendor = await verifyCommittedArtifacts(extractedRoot)
    const targets = await requirePackageTargets(extractedRoot, extractedPackage.value)
    await requireForbiddenPathsAbsent(extractedRoot)
    return {
      mode: 'tarball',
      tarball: absoluteTarball,
      checksumFile: absoluteChecksum,
      sizeFile: absoluteSize,
      sourceCommitFile: absoluteSourceCommit,
      pnpmVersionFile: absolutePnpmVersion,
      source,
      pnpm,
      sha256,
      bytes: tarballInfo.size,
      tar: tarVersion,
      package: packagePolicy,
      build,
      members: memberSummary,
      targets,
      sourceVendor,
      vendor,
    }
  } finally {
    await rm(temporary, { recursive: true, force: true })
  }
}

export function parseCliArgs(argv) {
  const options = {}
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index]
    if (argument === '--prepack') {
      assert(options.mode === undefined, 'choose exactly one verifier mode')
      options.mode = 'prepack'
    } else if (argument === '--tarball') {
      assert(options.mode === undefined || options.mode === 'tarball', 'choose exactly one verifier mode')
      options.mode = 'tarball'
      index += 1
      assert(index < argv.length, '--tarball requires a path')
      options.tarballPath = argv[index]
    } else if (argument === '--sha256-file') {
      index += 1
      assert(index < argv.length, '--sha256-file requires a path')
      options.checksumPath = argv[index]
    } else if (argument === '--size-file') {
      index += 1
      assert(index < argv.length, '--size-file requires a path')
      options.sizePath = argv[index]
    } else if (argument === '--source-commit-file') {
      index += 1
      assert(index < argv.length, '--source-commit-file requires a path')
      options.sourceCommitPath = argv[index]
    } else if (argument === '--pnpm-version-file') {
      index += 1
      assert(index < argv.length, '--pnpm-version-file requires a path')
      options.pnpmVersionPath = argv[index]
    } else if (argument === '--help' || argument === '-h') {
      return { mode: 'help' }
    } else {
      throw new Error('unknown argument ' + JSON.stringify(argument))
    }
  }
  assert(options.mode === 'prepack' || options.mode === 'tarball', 'choose --prepack or --tarball <path> --sha256-file <path>')
  if (options.mode === 'prepack') {
    assert(options.tarballPath === undefined && options.checksumPath === undefined && options.sizePath === undefined && options.sourceCommitPath === undefined && options.pnpmVersionPath === undefined, '--prepack does not accept artifact paths')
  } else {
    assert(typeof options.tarballPath === 'string', '--tarball requires a path')
    assert(typeof options.checksumPath === 'string', '--sha256-file is required with --tarball')
    assert(typeof options.sizePath === 'string', '--size-file is required with --tarball')
    assert(typeof options.sourceCommitPath === 'string', '--source-commit-file is required with --tarball')
    assert(typeof options.pnpmVersionPath === 'string', '--pnpm-version-file is required with --tarball')
  }
  return options
}

function usage() {
  return [
    'Usage:',
    '  node scripts/verify-package.mjs --prepack',
    '  node scripts/verify-package.mjs --tarball <path> --sha256-file <path> --size-file <path> --source-commit-file <path> --pnpm-version-file <path>',
    '',
    'This verifier never packs, publishes, tags, installs, or changes a DSH profile.',
  ].join('\n')
}

async function main() {
  try {
    const options = parseCliArgs(process.argv.slice(2))
    if (options.mode === 'help') {
      console.log(usage())
      return
    }
    const result = options.mode === 'prepack'
      ? await runPrepack()
      : await runTarball(options)
    console.log(JSON.stringify(result, null, 2))
  } catch (error) {
    console.error('ERROR: ' + error.message)
    process.exitCode = 1
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await main()
