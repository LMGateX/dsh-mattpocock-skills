#!/usr/bin/env node
import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { constants } from 'node:fs'
import { lstat, open, realpath } from 'node:fs/promises'
import { isAbsolute, join, resolve, sep } from 'node:path'

// Source probes and the compiled installed bin share the same implementation.
const manager: typeof import('./managed-sdk.js') = await import(new URL(import.meta.url.endsWith('.ts') ? './managed-sdk.ts' : './managed-sdk.js', import.meta.url).href)
const usage = 'Usage: dsh-mattpocock-skills-cwd inspect|prepare|restore|start --host-root /absolute/sdk [--dsh-stopped] [start: -- dsh args...]'
interface Options { command: 'inspect' | 'prepare' | 'restore' | 'start'; root: string; stopped: boolean; launchArgs: string[] }
function parse(args: string[]): Options {
  const command = args[0]
  if (command !== 'inspect' && command !== 'prepare' && command !== 'restore' && command !== 'start') throw new Error(usage)
  let root: string | null = null
  let stopped = false
  let separator = false
  let launchArgs: string[] = []
  for (let i = 1; i < args.length; i++) {
    const arg = args[i]
    if (arg === '--' && command === 'start') { separator = true; launchArgs = args.slice(i + 1); break }
    if (arg === '--host-root' && root === null) { root = args[++i] ?? null; if (!root || !isAbsolute(root)) throw new Error('Explicit absolute --host-root required') }
    else if (arg === '--dsh-stopped' && !stopped) stopped = true
    else throw new Error('Unexpected or duplicate argument: ' + arg)
  }
  if (!root || !isAbsolute(root)) throw new Error('Explicit absolute --host-root required; never inferred from cwd or profile')
  if (command !== 'inspect' && !stopped) throw new Error('--dsh-stopped is required: stop every DSH process using this SDK before offline mutation')
  if (command === 'start' && !separator) throw new Error('start requires -- before the DSH arguments')
  return { command, root, stopped, launchArgs }
}
const digest = (bytes: Buffer): string => createHash('sha256').update(bytes).digest('hex')
async function readContained(root: string, relative: string): Promise<{ path: string; bytes: Buffer }> {
  const path = resolve(root, relative)
  if (isAbsolute(relative) || !path.startsWith(root + sep)) throw new Error('SDK launch entry escapes target root')
  let current = root
  const parts = path.slice(root.length + 1).split(sep)
  for (const [i, part] of parts.entries()) {
    current = join(current, part)
    const stat = await lstat(current)
    if (stat.isSymbolicLink() || (i < parts.length - 1 ? !stat.isDirectory() : !stat.isFile())) throw new Error('SDK launch path must use real contained directories and files')
  }
  const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW)
  try { return { path, bytes: await handle.readFile() } } finally { await handle.close() }
}
interface LaunchEntry { root: string; path: string; packageHash: string; entryHash: string }
async function validateLaunchEntry(targetRoot: string): Promise<LaunchEntry> {
  const root = await realpath(targetRoot)
  if (root !== resolve(targetRoot) || !(await lstat(root)).isDirectory()) throw new Error('SDK launch root must be a canonical directory without symlinks')
  const manifest = await readContained(root, 'package.json')
  const pkg = JSON.parse(manifest.bytes.toString('utf8')) as { name?: unknown; version?: unknown; bin?: { dsh?: unknown } }
  if (pkg.name !== '@deepseek-ai/dsh' || pkg.version !== '0.2.1-alpha.1') throw new Error('SDK launch package identity/version does not match pinned recipe')
  const bin = pkg.bin?.dsh
  if (typeof bin !== 'string' || !bin.endsWith('.js')) throw new Error('SDK package.bin.dsh must declare a contained Node JavaScript entry')
  const entry = await readContained(root, bin)
  return { root, path: entry.path, packageHash: digest(manifest.bytes), entryHash: digest(entry.bytes) }
}
async function foreground(entry: LaunchEntry, args: string[]): Promise<void> {
  const child = spawn(process.execPath, [entry.path, ...args], { stdio: 'inherit' })
  const forwardInt = (): void => { child.kill('SIGINT') }
  const forwardTerm = (): void => { child.kill('SIGTERM') }
  process.on('SIGINT', forwardInt)
  process.on('SIGTERM', forwardTerm)
  try {
    const outcome = await new Promise<{ code: number | null; signal: NodeJS.Signals | null }>((resolveOutcome, reject) => {
      child.once('error', reject)
      child.once('exit', (code, signal) => resolveOutcome({ code, signal }))
    })
    if (outcome.signal) {
      process.off('SIGINT', forwardInt)
      process.off('SIGTERM', forwardTerm)
      process.kill(process.pid, outcome.signal)
    } else process.exitCode = outcome.code ?? 1
  } finally {
    process.off('SIGINT', forwardInt)
    process.off('SIGTERM', forwardTerm)
  }
}

async function main(): Promise<void> {
  let options: Options
  try { options = parse(process.argv.slice(2)) }
  catch (error) { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 2; return }
  if (options.stopped) console.error('Offline deployment acknowledgement only: --dsh-stopped does not prove all DSH processes are stopped and is not business-model approval. Target SDK changes affect every profile using this installation; not a live-enforcement mode.')
  // Entry identity, containment and availability are checked before prepare has any target effects.
  let entry: LaunchEntry | null = null
  if (options.command === 'start') {
    try { entry = await validateLaunchEntry(options.root) }
    catch (error) { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; return }
  }
  const controller = new AbortController()
  let cancellationSignal: NodeJS.Signals | null = null
  const cancel = (signal: NodeJS.Signals): void => { cancellationSignal ??= signal; controller.abort() }
  const cancelInt = (): void => cancel('SIGINT')
  const cancelTerm = (): void => cancel('SIGTERM')
  process.on('SIGINT', cancelInt)
  process.on('SIGTERM', cancelTerm)
  let prepared = false
  try {
    const operation = options.command === 'inspect' ? manager.inspectManagedSdk : options.command === 'restore' ? manager.restoreManagedSdk : manager.prepareManagedSdk
    const result = await operation(options.root, controller.signal)
    if (options.command === 'start') console.error(JSON.stringify(result))
    else console.log(JSON.stringify(result))
    prepared = result.status === 'ready' && !controller.signal.aborted
    process.exitCode = !controller.signal.aborted && (result.status === 'ready' || result.status === 'not-prepared' && options.command !== 'prepare' && options.command !== 'start') ? 0 : 1
    if (controller.signal.aborted) console.error('Cancelled by ' + cancellationSignal + (options.command === 'start' ? '; no foreground SDK was launched. Preparation evidence is not launch success.' : '; disk preparation evidence is independent of cancellation.'))
  } finally {
    process.off('SIGINT', cancelInt)
    process.off('SIGTERM', cancelTerm)
  }
  if (entry && prepared) {
    try {
      const verified = await validateLaunchEntry(options.root)
      if (verified.path !== entry.path || verified.packageHash !== entry.packageHash || verified.entryHash !== entry.entryHash) throw new Error('SDK launch identity changed during preparation; refusing launch')
      await foreground(verified, options.launchArgs)
    } catch (error) { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1 }
  }
}
await main()
