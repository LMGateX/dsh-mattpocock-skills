import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

import {
  PACKAGE_FILES_ALLOWLIST,
  diffFileInventories,
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
    ['package/package.json', { type: 'file', mode: 0o644 }],
    ['package/lib/index.js', { type: 'file', mode: 0o644 }],
    ['package/vendor/skill/link', { type: 'symlink', target: 'SKILL.md' }],
  ])
}

function validMembers() {
  return [
    { path: 'package/', type: 'directory', mode: 0o755 },
    { path: 'package/lib/', type: 'directory', mode: 0o755 },
    { path: 'package/vendor/', type: 'directory', mode: 0o755 },
    { path: 'package/vendor/skill/', type: 'directory', mode: 0o755 },
    { path: 'package/package.json', type: 'file', mode: 0o644 },
    { path: 'package/lib/index.js', type: 'file', mode: 0o644 },
    { path: 'package/vendor/skill/link', type: 'symlink', mode: 0o777, target: 'SKILL.md' },
  ]
}

test('package policy accepts the current private source-only manifest', () => {
  const result = validatePackagePolicy(packageJson)
  assert.deepEqual(result, {
    name: '@lmgatex/dsh-mattpocock-skills',
    version: '0.0.0-development',
    private: true,
    files: PACKAGE_FILES_ALLOWLIST.length,
    peerDependencies: [
      '@deepseek-ai/cordis',
      '@deepseek-ai/dsh-skill',
      '@deepseek-ai/schemastery',
    ],
  })
})

test('package policy rejects release, lifecycle, publication, client, and allowlist drift', () => {
  const cases = [
    [{ ...packageJson, version: '1.0.0' }, /0\.0\.0-development/],
    [{ ...packageJson, private: false }, /private/],
    [{ ...packageJson, scripts: { prepare: 'tsc' } }, /scripts/],
    [{ ...packageJson, publishConfig: { access: 'public' } }, /publishConfig/],
    [{ ...packageJson, dependencies: {} }, /dependencies/],
    [{ ...packageJson, dsh: { ...packageJson.dsh, client: './client.js' } }, /client/],
    [{ ...packageJson, files: [...packageJson.files, 'scripts/'] }, /allowlist/],
  ]
  for (const [manifest, pattern] of cases) assert.throws(() => validatePackagePolicy(manifest), pattern)
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
    [[...validMembers(), { path: 'package/extra', type: 'file', mode: 0o644 }], /unexpected tar member/],
    [[...validMembers(), { path: 'package/package.json', type: 'file', mode: 0o644 }], /duplicate tar member/],
    [[...validMembers(), { path: 'package/Package.json', type: 'file', mode: 0o644 }], /case-fold collision/],
    [validMembers().map((member) => member.path === 'package/lib/index.js' ? { ...member, type: 'hardlink' } : member), /unsupported tar member type/],
    [validMembers().map((member) => member.path === 'package/lib/index.js' ? { ...member, mode: 0o755 } : member), /mode differs/],
    [validMembers().map((member) => member.path === 'package/vendor/skill/link' ? { ...member, target: '../../../../escape' } : member), /escapes package root/],
    [[...validMembers(), { path: 'package/vendor/skill/link/child', type: 'file', mode: 0o644 }], /unexpected tar member|ancestor/],
  ]
  for (const [members, pattern] of cases) assert.throws(() => validateTarMembers(members, expectedMembers()), pattern)
})

test('checksum parser requires one SHA-256 for the named tarball', () => {
  assert.equal(parseChecksumText(hash + '  artifact.tgz\n', '/tmp/artifact.tgz', '/tmp/artifact.tgz.sha256'), hash)
  assert.equal(parseChecksumText(hash.toUpperCase() + '\n', '/tmp/artifact.tgz'), hash)
  assert.throws(() => parseChecksumText('bad\n', '/tmp/artifact.tgz'), /SHA-256 format/)
  assert.throws(() => parseChecksumText(hash + '  other.tgz\n', '/tmp/artifact.tgz', '/tmp/checksums.txt'), /different artifact/)
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
    '-rw-r--r-- 0/0        12 2026-09-08 09:24:21 "package/a file"',
    'lrwxrwxrwx 0/0         0 2026-09-08 09:24:21 "package/link" -> "a file"',
    '',
  ].join('\n')
  assert.deepEqual(parseGnuTarListing(listing), [
    { path: 'package/', type: 'directory', mode: 0o755, size: 0 },
    { path: 'package/a file', type: 'file', mode: 0o644, size: 12 },
    { path: 'package/link', type: 'symlink', mode: 0o777, size: 0, target: 'a file' },
  ])
})

test('CLI parser exposes only prepack and explicit tarball/checksum modes', () => {
  assert.deepEqual(parseCliArgs(['--prepack']), { mode: 'prepack' })
  assert.deepEqual(parseCliArgs(['--tarball', '/tmp/a.tgz', '--sha256-file', '/tmp/a.sha256']), {
    mode: 'tarball',
    tarballPath: '/tmp/a.tgz',
    checksumPath: '/tmp/a.sha256',
  })
  assert.throws(() => parseCliArgs([]), /choose --prepack/)
  assert.throws(() => parseCliArgs(['--tarball', '/tmp/a.tgz']), /sha256-file/)
  assert.throws(() => parseCliArgs(['--prepack', '--tarball', '/tmp/a.tgz', '--sha256-file', '/tmp/a.sha256']), /exactly one/)
})
