#!/usr/bin/env node
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { chmod, copyFile, lstat, mkdir, mkdtemp, readFile, readdir, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { isAbsolute, join, relative, resolve, sep } from 'node:path'

import { parseChecksumText, requirePnpmVersion } from './verify-package.mjs'

const EXPECTED_DSH_VERSION = '0.1.2-rc.1'

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

function parseArgs(argv) {
  const options = {}
  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index]
    if (key === '--help' || key === '-h') return { help: true }
    assert(['--source', '--tarball', '--sha256-file', '--size-file', '--source-commit-file', '--pnpm-version-file', '--evidence-dir'].includes(key), 'unknown argument ' + JSON.stringify(key))
    index += 1
    assert(index < argv.length, key + ' requires a path')
    const field = { '--source': 'source', '--tarball': 'tarball', '--sha256-file': 'checksum', '--size-file': 'sizeFile', '--source-commit-file': 'sourceCommitFile', '--pnpm-version-file': 'pnpmVersionFile', '--evidence-dir': 'evidence' }[key]
    assert(options[field] === undefined, key + ' may be supplied only once')
    options[field] = argv[index]
  }
  for (const field of ['source', 'tarball', 'checksum', 'sizeFile', 'sourceCommitFile', 'pnpmVersionFile', 'evidence']) {
    assert(typeof options[field] === 'string' && isAbsolute(options[field]), '--' + ({ checksum: 'sha256-file', sizeFile: 'size-file', sourceCommitFile: 'source-commit-file', pnpmVersionFile: 'pnpm-version-file', evidence: 'evidence-dir' }[field] || field) + ' requires an absolute path')
    options[field] = resolve(options[field])
  }
  return options
}

function run(command, args, { cwd, env, label }) {
  const result = spawnSync(command, args, {
    cwd,
    env,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  const stdout = result.stdout || ''
  const stderr = result.stderr || ''
  if (result.error) throw new Error(label + ' could not start: ' + result.error.message, { cause: result.error })
  if (result.status !== 0) throw new Error(label + ' failed with exit ' + result.status + ': ' + (stderr.trim() || stdout.trim()))
  return { stdout, stderr, combined: stdout + stderr }
}

async function sha256File(path) {
  return createHash('sha256').update(await readFile(path)).digest('hex')
}

function assertNoBuildApproval(log, label) {
  assert(!/(?:approve-builds|ignored build scripts|build scripts? (?:were )?(?:ignored|blocked)|requires? build approval)/i.test(log), label + ' requested or reported blocked dependency builds')
}

function assertConfigDump(text, channel, label) {
  const idRows = text.match(/^\s*-\s+id:\s*['"]?dsh-mattpocock-skills['"]?\s*$/gm) || []
  const nameRows = text.match(/^\s+name:\s*['"]?@lmgatex\/dsh-mattpocock-skills['"]?\s*$/gm) || []
  assert(idRows.length === 1, label + ' must contain exactly one package Host id row')
  assert(nameRows.length === 1, label + ' must contain exactly one package Host name row')
  const block = "- id: dsh-mattpocock-skills\n  name: '@lmgatex/dsh-mattpocock-skills'\n  config:\n    channel: " + channel
  assert(text.split(block).length - 1 === 1, label + ' package Host row must use channel ' + channel)
  assert(!text.includes('@lmgatex/dsh-mattpocock-skills/client'), label + ' contains a forbidden package client row')
}

function verifierOverlay(verifier, channel, output) {
  return [
    '- insert:',
    '    - id: dsh-mattpocock-phase4-verifier',
    '      name: ' + JSON.stringify(verifier),
    '      config:',
    '        channel: ' + channel,
    '        output: ' + JSON.stringify(output),
    '',
  ].join('\n')
}

async function requireRegular(path, label) {
  const info = await lstat(path)
  assert(info.isFile() && !info.isSymbolicLink(), label + ' must be a regular non-symlink file')
  return info
}

async function verifyInstallation({ kind, specification, home, source, verifier, betaPatch, work, evidence }) {
  assert((await readdir(home)).length === 0, kind + ' DSH_HOME was not fresh')
  const env = { ...process.env, DSH_HOME: home, DSH_TELEMETRY_DISABLED: '1' }
  const install = run('dsh', ['plugin', '--profile', 'headless', 'add', specification, '--save-exact'], {
    cwd: source, env, label: kind + ' install',
  })
  assertNoBuildApproval(install.combined, kind + ' install')
  await writeFile(join(evidence, kind + '-install.log'), install.combined)

  const reports = {}
  for (const channel of ['stable', 'beta']) {
    const output = join(work, kind + '-' + channel + '-report.json')
    const overlay = join(work, kind + '-' + channel + '-verifier.patch.yml')
    await writeFile(overlay, verifierOverlay(verifier, channel, output), { mode: 0o600 })
    const patches = channel === 'beta' ? ['--patch', betaPatch, '--patch', overlay] : ['--patch', overlay]
    const dump = run('dsh', ['--profile', 'headless', ...patches, '--dump-config'], {
      cwd: source, env, label: kind + ' ' + channel + ' config dump',
    })
    assertConfigDump(dump.stdout, channel, kind + ' ' + channel + ' config')
    await writeFile(join(evidence, kind + '-' + channel + '-config.yml'), dump.stdout)
    const boot = run('dsh', ['--profile', 'headless', ...patches, '--help'], {
      cwd: source, env, label: kind + ' ' + channel + ' headless boot',
    })
    await writeFile(join(evidence, kind + '-' + channel + '-boot.log'), boot.combined)
    const bytes = await readFile(output)
    JSON.parse(bytes.toString('utf8'))
    await writeFile(join(evidence, kind + '-' + channel + '-registry.json'), bytes)
    reports[channel] = bytes
  }
  return { installLog: kind + '-install.log', reports }
}

async function main() {
  const options = parseArgs(process.argv.slice(2))
  if (options.help) {
    console.log('Usage: node scripts/verify-isolated-dsh.mjs --source <absolute checkout> --tarball <absolute tgz> --sha256-file <absolute checksum> --size-file <absolute record> --source-commit-file <absolute record> --pnpm-version-file <absolute record> --evidence-dir <absolute new directory>')
    return
  }

  const sourceInfo = await lstat(options.source)
  assert(sourceInfo.isDirectory() && !sourceInfo.isSymbolicLink(), 'source must be a regular non-symlink directory')
  assert(await realpath(options.source) === options.source, 'source must be a canonical real path')
  assert(relative(options.source, options.evidence).startsWith('..' + sep), 'evidence directory must be outside the source checkout')
  const [tarballInfo, checksumInfo, sizeInfo, sourceCommitInfo, pnpmVersionInfo] = await Promise.all([
    requireRegular(options.tarball, 'tarball'),
    requireRegular(options.checksum, 'checksum'),
    requireRegular(options.sizeFile, 'size record'),
    requireRegular(options.sourceCommitFile, 'source commit record'),
    requireRegular(options.pnpmVersionFile, 'pnpm version record'),
  ])
  assert((tarballInfo.mode & 0o222) === 0, 'tarball must be read-only')
  for (const info of [checksumInfo, sizeInfo, sourceCommitInfo, pnpmVersionInfo]) assert((info.mode & 0o222) === 0, 'artifact identity records must be read-only')
  const checksumText = await readFile(options.checksum, 'utf8')
  const expectedSha256 = parseChecksumText(checksumText, options.tarball, options.checksum)
  assert(await sha256File(options.tarball) === expectedSha256, 'tarball SHA-256 does not match checksum file')
  const recordedSize = (await readFile(options.sizeFile, 'utf8')).trim()
  assert(/^[1-9][0-9]*$/.test(recordedSize) && Number(recordedSize) === tarballInfo.size, 'tarball size does not match size record')
  const pnpm = requirePnpmVersion()
  const sourceCommit = run('git', ['-C', options.source, 'rev-parse', 'HEAD'], { cwd: options.source, env: process.env, label: 'source commit lookup' }).stdout.trim()
  assert(/^[0-9a-f]{40}$/.test(sourceCommit), 'source commit is invalid')
  assert((await readFile(options.sourceCommitFile, 'utf8')).trim() === sourceCommit, 'source commit does not match artifact record')
  assert((await readFile(options.pnpmVersionFile, 'utf8')).trim() === pnpm, 'pnpm version does not match artifact record')
  assert(run('git', ['-C', options.source, 'status', '--porcelain=v1', '--untracked-files=all'], { cwd: options.source, env: process.env, label: 'source cleanliness check' }).stdout.length === 0, 'source Git tree must be clean')

  const work = await mkdtemp(join(tmpdir(), 'dsh-mattpocock-phase4-isolated-'))
  await chmod(work, 0o700)
  const realTmp = await realpath(tmpdir())
  assert((await realpath(work)).startsWith(realTmp + sep), 'isolated work root escaped the system temporary directory')
  let evidenceCreated = false
  try {
    await mkdir(options.evidence, { mode: 0o700 })
    evidenceCreated = true
    assert(await realpath(options.evidence) === options.evidence, 'evidence directory must be a canonical real path')
    const privateTarball = join(work, 'accepted-artifact.tgz')
    await copyFile(options.tarball, privateTarball)
    await chmod(privateTarball, 0o444)
    assert(await sha256File(privateTarball) === expectedSha256, 'private tarball snapshot does not match checksum file')
    const localHome = join(work, 'checkout-home')
    const tarballHome = join(work, 'tarball-home')
    await mkdir(localHome, { mode: 0o700 })
    await mkdir(tarballHome, { mode: 0o700 })
    const verifier = join(options.source, 'tests', 'fixtures', 'phase4-registry-verifier.mjs')
    const betaPatch = join(options.source, 'tests', 'fixtures', 'phase4-beta.patch.yml')
    await Promise.all([requireRegular(verifier, 'registry verifier fixture'), requireRegular(betaPatch, 'Beta patch fixture')])
    const versionEnv = { ...process.env, DSH_HOME: localHome, DSH_TELEMETRY_DISABLED: '1' }
    const dsh = run('dsh', ['--version'], { cwd: options.source, env: versionEnv, label: 'DSH version lookup' }).stdout.trim()
    assert(dsh === EXPECTED_DSH_VERSION, 'Phase 4 requires DSH ' + EXPECTED_DSH_VERSION + ', got ' + dsh)

    const checkout = await verifyInstallation({
      kind: 'checkout', specification: options.source, home: localHome, source: options.source,
      verifier, betaPatch, work, evidence: options.evidence,
    })
    assert(await sha256File(options.tarball) === expectedSha256, 'caller tarball changed before tarball-profile installation')
    assert(await sha256File(privateTarball) === expectedSha256, 'private tarball snapshot changed before installation')
    const tarball = await verifyInstallation({
      kind: 'tarball', specification: privateTarball, home: tarballHome, source: options.source,
      verifier, betaPatch, work, evidence: options.evidence,
    })
    assert(await sha256File(privateTarball) === expectedSha256, 'private tarball snapshot changed during isolated verification')
    assert(await sha256File(options.tarball) === expectedSha256, 'caller tarball changed during isolated verification')

    for (const channel of ['stable', 'beta']) {
      assert(checkout.reports[channel].equals(tarball.reports[channel]), channel + ' checkout/tarball registry reports differ')
    }
    const summary = {
      source: options.source,
      sourceCommit,
      tarball: options.tarball,
      checksumFile: options.checksum,
      sizeFile: options.sizeFile,
      sourceCommitFile: options.sourceCommitFile,
      pnpmVersionFile: options.pnpmVersionFile,
      installedFromPrivateSnapshot: true,
      sha256: expectedSha256,
      bytes: tarballInfo.size,
      pnpm,
      dsh,
      profile: 'headless',
      homes: { fresh: true, securelyCreatedUnderSystemTmp: true, removedAfterVerification: true },
      channels: {
        stable: JSON.parse(checkout.reports.stable.toString('utf8')),
        beta: JSON.parse(checkout.reports.beta.toString('utf8')),
      },
      checkoutTarballReportsByteIdentical: true,
      modelInvoked: false,
      webStarted: false,
      customClient: false,
    }
    await writeFile(join(options.evidence, 'summary.json'), JSON.stringify(summary, null, 2) + '\n')
    console.log(JSON.stringify(summary, null, 2))
  } catch (error) {
    if (evidenceCreated) await rm(options.evidence, { recursive: true, force: true })
    throw error
  } finally {
    await rm(work, { recursive: true, force: true })
  }
}

try {
  await main()
} catch (error) {
  console.error('ERROR: ' + error.message)
  process.exitCode = 1
}
