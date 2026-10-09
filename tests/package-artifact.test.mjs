import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

import {
  diffFileInventories,
  EXPECTED_PEERS,
  EXPECTED_PEER_META,
  EXPECTED_CLIENT,
  PACKAGE_FILES_ALLOWLIST,
  FIXED_PACKED_FILES,
  EXPECTED_PACKED_FILES,
  expectedTarMembers,
  expectedPackedFileBytes,
  parseChecksumText,
  parseCliArgs,
  parseGnuTarListing,
  validateArchivePath,
  validatePackagePolicy,
  validateTarMembers,
} from '../scripts/verify-package.mjs'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const packageJson = JSON.parse(await readFile(resolve(root, 'package.json'), 'utf8'))
const hash = 'a'.repeat(64)

function expectedMembers() {
  return new Map([
    ['package/package.json', { type: 'file', mode: 0o644, size: 10 }],
    ['package/lib/index.js', { type: 'file', mode: 0o644, size: 20 }],
    ['package/vendor/skill/link', { type: 'symlink', target: 'SKILL.md', size: 0 }],
  ])
}

function validMembers() {
  return [
    { path: 'package/', type: 'directory', mode: 0o755 },
    { path: 'package/lib/', type: 'directory', mode: 0o755 },
    { path: 'package/vendor/', type: 'directory', mode: 0o755 },
    { path: 'package/vendor/skill/', type: 'directory', mode: 0o755 },
    { path: 'package/package.json', type: 'file', mode: 0o644, size: 10 },
    { path: 'package/lib/index.js', type: 'file', mode: 0o644, size: 20 },
    { path: 'package/vendor/skill/link', type: 'symlink', mode: 0o777, target: 'SKILL.md', size: 0 },
  ]
}

test('0.4.23 package policy admits exactly four metadata locale files and exports', () => {
  const candidate = { ...packageJson, version: '0.4.23' }
  assert.equal(validatePackagePolicy(candidate).version, '0.4.23')
  assert.deepEqual(PACKAGE_FILES_ALLOWLIST.filter(path => path.startsWith('locale/')), [
    'locale/en.json', 'locale/zh.json', 'locale/worktree-bridge/en.json', 'locale/worktree-bridge/zh.json',
  ])
})

test('package policy accepts the current private source-only manifest', () => {
  const result = validatePackagePolicy(packageJson)
  assert.deepEqual(result, {
    name: '@lmgatex/dsh-mattpocock-skills',
    version: '0.4.23',
    private: true,
    files: PACKAGE_FILES_ALLOWLIST.length,
    peerDependencies: Object.keys(EXPECTED_PEERS).sort(),
  })
})

test('package policy rejects release, lifecycle, publication, client graph, and allowlist drift', () => {
  const cases = [
    [{ ...packageJson, version: '1.0.0' }, /0\.4\.23/],
    [{ ...packageJson, private: false }, /private/],
    [{ ...packageJson, scripts: { prepare: 'tsc' } }, /scripts/],
    [{ ...packageJson, publishConfig: { access: 'public' } }, /publishConfig/],
    [{ ...packageJson, dependencies: {} }, /dependencies/],
    [{ ...packageJson, dsh: { ...packageJson.dsh, client: './client.js' } }, /client/],
    [{ ...packageJson, files: [...packageJson.files, 'scripts/'] }, /allowlist/],
    [{ ...packageJson, files: [...packageJson.files, 'docs/'] }, /allowlist/],
    [{ ...packageJson, exports: { ...packageJson.exports, './runtime': './lib/runtime.js' } }, /exports/],
    [{ ...packageJson, files: [...packageJson.files.filter(path => !path.startsWith('locale/')), 'locale/**/*.json'] }, /allowlist/],
    [{ ...packageJson, exports: { ...packageJson.exports, './locale/fr.json': './locale/en.json' } }, /exports/],
    [{ ...packageJson, exports: { ...packageJson.exports, './native-subagent/locale/en.json': './locale/en.json' } }, /exports/],
    [{ ...packageJson, exports: { ...packageJson.exports, './locale/en.json': { default: './locale/en.json' } } }, /exports/],
    [{ ...packageJson, exports: { ...packageJson.exports, './host': { types: './src/host.ts', default: './lib/host.js' } } }, /exports/],
    [{ ...packageJson, dsh: { ...packageJson.dsh, client: { ...EXPECTED_CLIENT, platform: 'desktop' } } }, /client/],
    [{ ...packageJson, dsh: { ...packageJson.dsh, client: { ...EXPECTED_CLIENT, inject: EXPECTED_CLIENT.inject.slice(1) } } }, /client/],
    [{ ...packageJson, dsh: { ...packageJson.dsh, client: { ...EXPECTED_CLIENT, inject: [...EXPECTED_CLIENT.inject, 'react'] } } }, /client/],
    [{ ...packageJson, peerDependencies: { ...EXPECTED_PEERS, '@deepseek-ai/dsh-session': '*' } }, /peer dependency/],
    [{ ...packageJson, peerDependenciesMeta: undefined }, /optional peer metadata/],
    [{ ...packageJson, peerDependenciesMeta: { ...EXPECTED_PEER_META, '@deepseek-ai/dsh-session': { optional: false } } }, /optional peer metadata/],
    [{ ...packageJson, peerDependenciesMeta: { ...EXPECTED_PEER_META, '@deepseek-ai/cordis': { optional: true } } }, /optional peer metadata/],
  ]
  for (const [manifest, pattern] of cases) assert.throws(() => validatePackagePolicy(manifest), pattern)
})

test('locale metadata verification rejects unknown structure and changed public display strings', async () => {
  const { validatePackageLocale } = await import('../scripts/verify-package.mjs')
  const value = JSON.parse(await readFile(resolve(root, 'locale/worktree-bridge/en.json'), 'utf8'))
  assert.doesNotThrow(() => validatePackageLocale('locale/worktree-bridge/en.json', value))
  for (const candidate of [
    { ...value, controls: {} },
    { meta: { ...value.meta, title: 'Official DSH Native Subagent' } },
    { meta: { ...value.meta, description: '' } },
    { meta: { ...value.meta, icon: 'other.svg' } },
  ]) assert.throws(() => validatePackageLocale('locale/worktree-bridge/en.json', candidate), /locale|metadata/i)
})

test('exact package inventory contains 85 fixed files, 85 vendor files and 66 JS/DTS outputs', async () => {
  assert.equal(FIXED_PACKED_FILES.length, 85)
  assert.equal(EXPECTED_PACKED_FILES, 170)
  assert.equal(FIXED_PACKED_FILES.filter(path => path.startsWith('lib/')).length, 66)
  const inventory = JSON.parse(await readFile(resolve(root, 'vendor-files.json'), 'utf8'))
  assert.equal(inventory.fileCount, 85)
  const members = await expectedTarMembers(root, inventory)
  assert.equal(members.size, 170)
  for (const path of ['locale/en.json', 'locale/zh.json', 'locale/worktree-bridge/en.json', 'locale/worktree-bridge/zh.json']) assert.equal(members.get('package/' + path)?.type, 'file')
})

test('peer-binding support adds only its exact JS and declaration paths to the closed package inventory', () => {
  const expected = ['lib/compatibility/peer-bindings.js', 'lib/types/compatibility/peer-bindings.d.ts']
  assert.deepEqual(PACKAGE_FILES_ALLOWLIST.filter(path => path.includes('peer-bindings')), expected)
  assert.deepEqual(FIXED_PACKED_FILES.filter(path => path.includes('peer-bindings')), expected)
  assert.deepEqual(packageJson.files.filter(path => path.includes('peer-bindings')), expected)
  assert.equal(packageJson.exports['./peer-bindings'], undefined, 'internal support must not add a public entry')
  for (const files of [packageJson.files.filter(path => path !== expected[0]), [...packageJson.files, 'lib/compatibility/*.js']]) {
    assert.throws(() => validatePackagePolicy({ ...packageJson, files }), /allowlist/)
  }
})

test('native artifact remains byte-identical while peer-binding provenance has its exact new identity', async () => {
  const artifact = await readFile(resolve(root, 'compatibility/native-subagent-0.2.1-alpha.1.js'))
  const provenance = await readFile(resolve(root, 'compatibility/native-subagent.provenance.json'))
  assert.equal(artifact.length, 136833)
  assert.equal(createHash('sha256').update(artifact).digest('hex'), 'f6197aa3eb84c4f803e2b6517e70b1b62a804bb4e763abec94ebe961dabd77ba')
  assert.equal(createHash('sha256').update(provenance).digest('hex'), '3b990850e2e8cb82579b258743e0403bcfcbbd54eedbf9a8c55547ef0bafbf75')
})

test('archive paths require normalized package-relative portable names', () => {
  assert.equal(validateArchivePath('package/lib/index.js'), 'package/lib/index.js')
  assert.equal(validateArchivePath('package/lib/', { directory: true }), 'package/lib')
  for (const path of [
    '/package/lib/index.js',
    './package/lib/index.js',
    'other/lib/index.js',
    'package/../escape',
    'package/lib//index.js',
    'package\\lib\\index.js',
    'package/e\u0301',
    'package/a' + String.fromCharCode(0) + 'b',
  ]) {
    assert.throws(() => validateArchivePath(path), /archive path|NFC|unsafe|forward slashes|beneath package/)
  }
})

test('member validation accepts only expected files, symlinks, and ancestor directories', () => {
  assert.deepEqual(validateTarMembers(validMembers(), expectedMembers()), {
    directories: 4,
    files: 2,
    symlinks: 1,
    expectedFiles: 3,
  })
})

test('member validation rejects missing, extra, duplicate, casefold, type, mode, and symlink hazards', () => {
  const cases = [
    [validMembers().filter((member) => member.path !== 'package/lib/index.js'), /missing package\/lib\/index\.js/],
    [[...validMembers(), { path: 'package/extra', type: 'file', mode: 0o644, size: 1 }], /unexpected tar member/],
    [[...validMembers(), { path: 'package/package.json', type: 'file', mode: 0o644, size: 10 }], /duplicate tar member/],
    [[...validMembers(), { path: 'package/Package.json', type: 'file', mode: 0o644, size: 10 }], /case-fold collision/],
    [validMembers().map((member) => member.path === 'package/lib/index.js' ? { ...member, type: 'hardlink' } : member), /unsupported tar member type/],
    [validMembers().map((member) => member.path === 'package/lib/index.js' ? { ...member, mode: 0o755 } : member), /mode differs/],
    [validMembers().map((member) => member.path === 'package/lib/index.js' ? { ...member, size: 21 } : member), /size differs/],
    [validMembers().map((member) => member.path === 'package/vendor/skill/link' ? { ...member, target: '../../../../escape' } : member), /escapes package root/],
    [[...validMembers(), { path: 'package/vendor/skill/link/child', type: 'file', mode: 0o644, size: 1 }], /unexpected tar member|ancestor/],
  ]
  for (const [members, pattern] of cases) assert.throws(() => validateTarMembers(members, expectedMembers()), pattern)
})

test('pnpm package manifest normalization removes exactly one final LF only', () => {
  assert.deepEqual(expectedPackedFileBytes('README.md', Buffer.from('readme\n')), Buffer.from('readme\n'))
  assert.deepEqual(expectedPackedFileBytes('package.json', Buffer.from('{}\n')), Buffer.from('{}'))
  assert.throws(() => expectedPackedFileBytes('package.json', Buffer.from('{}')), /exactly one LF/)
  assert.throws(() => expectedPackedFileBytes('package.json', Buffer.from('{}\n\n')), /exactly one LF/)
  assert.throws(() => expectedPackedFileBytes('package.json', Buffer.from('{}\r\n')), /exactly one LF/)
})

test('checksum parser requires one SHA-256 for the named tarball', () => {
  assert.equal(parseChecksumText(hash + '  artifact.tgz\n', '/tmp/artifact.tgz', '/tmp/artifact.tgz.sha256'), hash)
  assert.equal(parseChecksumText(hash.toUpperCase() + '\n', '/tmp/artifact.tgz'), hash)
  assert.throws(() => parseChecksumText('bad\n', '/tmp/artifact.tgz'), /SHA-256 format/)
  assert.throws(() => parseChecksumText(hash + '  other.tgz\n', '/tmp/artifact.tgz', '/tmp/checksums.txt'), /different artifact/)
  assert.throws(() => parseChecksumText(hash + '  /other/artifact.tgz\n', '/tmp/artifact.tgz', '/tmp/checksums.txt'), /different artifact/)
  assert.throws(() => parseChecksumText(hash + '\n' + hash + '\n', '/tmp/artifact.tgz'), /exactly one/)
})

test('build inventory diff identifies missing, extra, mode, and byte drift', () => {
  const expected = [
    { path: 'index.js', mode: 0o644, bytes: Buffer.from('index') },
    { path: 'types/index.d.ts', mode: 0o644, bytes: Buffer.from('types') },
  ]
  assert.deepEqual(diffFileInventories(expected, expected.map((entry) => ({ ...entry, bytes: Buffer.from(entry.bytes) }))), [])
  assert.deepEqual(diffFileInventories(expected, [
    { path: 'index.js', mode: 0o755, bytes: Buffer.from('changed') },
    { path: 'extra.js', mode: 0o644, bytes: Buffer.from('extra') },
  ]), [
    'mode index.js: expected 0644, got 0755',
    'bytes index.js differ',
    'missing types/index.d.ts',
    'unexpected extra.js',
  ])
})

test('GNU tar listing parser preserves member types, modes, spaces, and targets', () => {
  const listing = [
    'drwxr-xr-x 0/0         0 2026-09-08 09:24:21 "package/"',
    '-rw-r--r-- 0/0        12 2026-09-08 09:24:21 +0000 "package/a file"',
    'lrwxrwxrwx 0/0         0 2026-09-08 09:24:21 "package/link" -> "a file"',
    '',
  ].join('\n')
  assert.deepEqual(parseGnuTarListing(listing), [
    { path: 'package/', type: 'directory', mode: 0o755, size: 0 },
    { path: 'package/a file', type: 'file', mode: 0o644, size: 12 },
    { path: 'package/link', type: 'symlink', mode: 0o777, size: 0, target: 'a file' },
  ])
})

test('CLI parser requires checksum, size, commit, and packer records for tarballs', () => {
  assert.deepEqual(parseCliArgs(['--prepack']), { mode: 'prepack' })
  assert.deepEqual(parseCliArgs([
    '--tarball', '/tmp/a.tgz', '--sha256-file', '/tmp/a.sha256', '--size-file', '/tmp/a.size',
    '--source-commit-file', '/tmp/a.commit', '--pnpm-version-file', '/tmp/a.pnpm',
  ]), {
    mode: 'tarball',
    tarballPath: '/tmp/a.tgz',
    checksumPath: '/tmp/a.sha256',
    sizePath: '/tmp/a.size',
    sourceCommitPath: '/tmp/a.commit',
    pnpmVersionPath: '/tmp/a.pnpm',
  })
  assert.throws(() => parseCliArgs([]), /choose --prepack/)
  assert.throws(() => parseCliArgs(['--tarball', '/tmp/a.tgz']), /sha256-file/)
  assert.throws(() => parseCliArgs(['--tarball', '/tmp/a.tgz', '--sha256-file', '/tmp/a.sha256']), /size-file/)
  assert.throws(() => parseCliArgs([
    '--prepack', '--tarball', '/tmp/a.tgz', '--sha256-file', '/tmp/a.sha256', '--size-file', '/tmp/a.size',
    '--source-commit-file', '/tmp/a.commit', '--pnpm-version-file', '/tmp/a.pnpm',
  ]), /exactly one/)
})
