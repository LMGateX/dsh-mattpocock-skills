#!/usr/bin/env node
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { chmod, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { repositoryRoot, runTarball } from './verify-package.mjs'

const temporary = await mkdtemp(join(tmpdir(), 'dsh-package-e2e-'))
const tarball = join(temporary, 'lmgatex-dsh-mattpocock-skills-0.0.0-development.tgz')
const checksum = join(temporary, 'sha256.txt')
const size = join(temporary, 'size.txt')
const sourceCommit = join(temporary, 'source-commit.txt')
const pnpmVersion = join(temporary, 'pnpm-version.txt')
try {
  await writeFile(sourceCommit, execFileSync('git', ['-C', repositoryRoot, 'rev-parse', 'HEAD'], { encoding: 'utf8' }))
  await writeFile(pnpmVersion, execFileSync('pnpm', ['--version'], { encoding: 'utf8' }))
  execFileSync('pnpm', ['pack', '--json', '--skip-manifest-obfuscation', '--out', tarball], {
    cwd: repositoryRoot,
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  const bytes = await readFile(tarball)
  const sha256 = createHash('sha256').update(bytes).digest('hex')
  await writeFile(checksum, sha256 + '  ' + tarball + '\n')
  await writeFile(size, String(bytes.length) + '\n')
  await Promise.all([tarball, checksum, size, sourceCommit, pnpmVersion].map((path) => chmod(path, 0o444)))
  const result = await runTarball({
    root: repositoryRoot, tarballPath: tarball, checksumPath: checksum, sizePath: size,
    sourceCommitPath: sourceCommit, pnpmVersionPath: pnpmVersion,
  })
  if (result.members.expectedFiles !== 97 || result.members.files !== 97 || result.members.symlinks !== 0) {
    throw new Error('unexpected disposable package inventory: ' + JSON.stringify(result.members))
  }
  console.log('OK: disposable pnpm pack passed exact 97-file archive verification')
} finally {
  await rm(temporary, { recursive: true, force: true })
}
