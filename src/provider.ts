import { createHash } from 'node:crypto'
import { constants } from 'node:fs'
import { lstat, open, realpath, type FileHandle } from 'node:fs/promises'
import { dirname, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { BUNDLED_SKILL_RANK } from '@deepseek-ai/dsh-skill'
import type { SkillCandidate, SkillDefinition, SkillLookupOptions, SkillProvider } from '@deepseek-ai/dsh-skill'

import { CATALOG } from './catalog.js'
import type { CatalogSkill, SkillCatalog } from './catalog.js'
import type { Channel } from './index.js'

export const PROVIDER_NAME = 'dsh-mattpocock-skills'
export const PACKAGE_ROOT = fileURLToPath(new URL('../', import.meta.url))

export type ProviderDiagnostic = (message: string) => void
export type SkillFileReader = (handle: FileHandle, signal: AbortSignal | undefined) => Promise<Buffer>

export interface ProviderOptions {
  readonly packageRoot?: string
  readonly catalog?: SkillCatalog
  readonly lifecycleSignal?: AbortSignal
  readonly diagnostic?: ProviderDiagnostic
  /** @internal Deterministic I/O seam for provider contract tests. */
  readonly readSkillFile?: SkillFileReader
}

interface CandidateRecord {
  readonly row: CatalogSkill
  readonly filePath: string
  readonly resourcePath: string
  readonly candidate: SkillCandidate
}

function throwIfAborted(signal: AbortSignal | undefined): void {
  signal?.throwIfAborted()
}

function lookupSignal(lifecycleSignal: AbortSignal | undefined, signal: AbortSignal | undefined): AbortSignal | undefined {
  if (lifecycleSignal === undefined) return signal
  if (signal === undefined || signal === lifecycleSignal) return lifecycleSignal
  return AbortSignal.any([lifecycleSignal, signal])
}

function sha256(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex')
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function bodyOffsetMatchesFrontmatter(bytes: Buffer, bodyByteOffset: number): boolean {
  const lineEnd = (start: number): { contentEnd: number; next: number } => {
    const newline = bytes.indexOf(10, start)
    const end = newline < 0 ? bytes.length : newline
    const contentEnd = end > start && bytes[end - 1] === 13 ? end - 1 : end
    return { contentEnd, next: newline < 0 ? bytes.length : newline + 1 }
  }
  const delimiter = Buffer.from('---')
  const first = lineEnd(0)
  if (!bytes.subarray(0, first.contentEnd).equals(delimiter)) return false
  let cursor = first.next
  while (cursor <= bytes.length) {
    const line = lineEnd(cursor)
    if (bytes.subarray(cursor, line.contentEnd).equals(delimiter)) return line.next === bodyByteOffset
    if (line.next === bytes.length) return false
    cursor = line.next
  }
  return false
}

function absoluteVendorPath(vendorRoot: string, catalogPath: string): string {
  const path = resolve(vendorRoot, ...catalogPath.split('/'))
  const fromRoot = relative(vendorRoot, path)
  if (fromRoot === '' || fromRoot === '..' || fromRoot.startsWith('../') || resolve(vendorRoot, fromRoot) !== path) {
    throw new Error('cataloged path escapes the vendored root: ' + catalogPath)
  }
  return path
}

async function trustedVendorRoot(packageRoot: string, vendorRoot: string): Promise<string> {
  const realPackageRoot = await realpath(packageRoot)
  const [vendorInfo, realVendorRoot] = await Promise.all([lstat(vendorRoot), realpath(vendorRoot)])
  if (!vendorInfo.isDirectory() || vendorInfo.isSymbolicLink()
    || realVendorRoot !== resolve(realPackageRoot, 'vendor/mattpocock-skills')) {
    throw new Error('vendored root has path or symlink drift')
  }
  return realVendorRoot
}

function realPathMatchesCatalog(vendorRoot: string, realVendorRoot: string, catalogPath: string, resolvedPath: string): boolean {
  const expected = relative(vendorRoot, absoluteVendorPath(vendorRoot, catalogPath))
  const actual = relative(realVendorRoot, resolvedPath)
  return actual === expected && actual !== '' && actual !== '..' && !actual.startsWith('../')
}

async function readTrustedSkill(record: CandidateRecord, packageRoot: string, vendorRoot: string, signal: AbortSignal | undefined, readSkillFile: SkillFileReader): Promise<Buffer> {
  throwIfAborted(signal)
  const realVendorRoot = await trustedVendorRoot(packageRoot, vendorRoot)
  const [resourceInfo, fileInfo, realResourcePath, realFilePath] = await Promise.all([
    lstat(record.resourcePath),
    lstat(record.filePath),
    realpath(record.resourcePath),
    realpath(record.filePath),
  ])
  throwIfAborted(signal)
  if (!resourceInfo.isDirectory() || resourceInfo.isSymbolicLink() || !realPathMatchesCatalog(vendorRoot, realVendorRoot, record.row.directory, realResourcePath)) {
    throw new Error('cataloged Skill directory has path or symlink drift')
  }
  if (!fileInfo.isFile() || fileInfo.isSymbolicLink() || !realPathMatchesCatalog(vendorRoot, realVendorRoot, record.row.skillPath, realFilePath)) {
    throw new Error('cataloged SKILL.md has path or symlink drift')
  }

  if (!Number.isInteger(constants.O_NOFOLLOW) || constants.O_NOFOLLOW === 0) throw new Error('host filesystem does not expose safe no-follow file opens')
  const handle = await open(record.filePath, constants.O_RDONLY | constants.O_NOFOLLOW)
  try {
    const openedInfo = await handle.stat({ bigint: true })
    if (!openedInfo.isFile()) throw new Error('cataloged SKILL.md is not a regular file')
    const [currentResourceInfo, currentInfo, openedRealVendorRoot, openedRealResourcePath, openedRealFilePath] = await Promise.all([
      lstat(record.resourcePath, { bigint: true }),
      lstat(record.filePath, { bigint: true }),
      trustedVendorRoot(packageRoot, vendorRoot),
      realpath(record.resourcePath),
      realpath(record.filePath),
    ])
    if (!currentResourceInfo.isDirectory() || currentResourceInfo.isSymbolicLink()
      || currentInfo.isSymbolicLink() || currentInfo.dev !== openedInfo.dev || currentInfo.ino !== openedInfo.ino) {
      throw new Error('cataloged Skill path changed while opening')
    }
    if (openedRealVendorRoot !== realVendorRoot
      || !realPathMatchesCatalog(vendorRoot, openedRealVendorRoot, record.row.directory, openedRealResourcePath)
      || !realPathMatchesCatalog(vendorRoot, openedRealVendorRoot, record.row.skillPath, openedRealFilePath)) {
      throw new Error('cataloged Skill path changed while opening')
    }
    const bytes = await readSkillFile(handle, signal)
    throwIfAborted(signal)
    return bytes
  } finally {
    await handle.close()
  }
}

function deepFreeze<T>(value: T): T {
  if (typeof value !== 'object' || value === null || Object.isFrozen(value)) return value
  Object.freeze(value)
  for (const entry of Object.values(value as Record<string, unknown>)) deepFreeze(entry)
  return value
}

function candidateFor(row: CatalogSkill, filePath: string, resourcePath: string): SkillCandidate {
  const resourceBase = Object.freeze({ kind: 'directory' as const, path: resourcePath })
  const locator = Object.freeze({ name: row.name, skillPath: row.skillPath, sha256: row.sha256 })
  const invocation = Object.freeze({ ...row.invocation })
  const metadata = row.metadata === undefined && row.frontmatterExtensions === undefined
    ? undefined
    : deepFreeze(structuredClone({
        ...(row.metadata ?? {}),
        ...(row.frontmatterExtensions === undefined ? {} : { frontmatterExtensions: row.frontmatterExtensions }),
      }))
  const candidate: SkillCandidate = {
    name: row.name,
    description: row.description,
    invocation,
    provider: PROVIDER_NAME,
    source: 'bundled',
    resourceBase,
    rank: BUNDLED_SKILL_RANK,
    locator,
    path: filePath,
    ...(row.whenToUse === undefined ? {} : { whenToUse: row.whenToUse }),
    ...(metadata === undefined ? {} : { metadata }),
  }
  return Object.freeze(candidate)
}

export function createMattPocockSkillProvider(channel: Channel, options: ProviderOptions = {}): SkillProvider {
  if (channel !== 'stable' && channel !== 'beta') throw new Error('unsupported Matt Pocock Skills channel ' + JSON.stringify(channel))
  const catalog = options.catalog ?? CATALOG
  const packageRoot = resolve(options.packageRoot ?? PACKAGE_ROOT)
  const vendorRoot = resolve(packageRoot, 'vendor/mattpocock-skills')
  const readSkillFile = options.readSkillFile ?? ((handle: FileHandle, signal: AbortSignal | undefined) => handle.readFile({ signal }))
  const diagnostic = options.diagnostic ?? (() => {})
  const records = new Map<SkillCandidate, CandidateRecord>()
  const candidates = catalog.skills
    .filter((row) => row.channels.includes(channel))
    .map((row) => {
      const filePath = absoluteVendorPath(vendorRoot, row.skillPath)
      const resourcePath = absoluteVendorPath(vendorRoot, row.directory)
      if (dirname(filePath) !== resourcePath) throw new Error('cataloged Skill directory differs from Skill path: ' + row.name)
      const candidate = candidateFor(row, filePath, resourcePath)
      records.set(candidate, { row, filePath, resourcePath, candidate })
      return candidate
    })
  Object.freeze(candidates)

  return Object.freeze({
    name: PROVIDER_NAME,
    async list(lookup: SkillLookupOptions): Promise<readonly SkillCandidate[]> {
      const signal = lookupSignal(options.lifecycleSignal, lookup.signal)
      throwIfAborted(signal)
      return candidates
    },
    async get(candidate: SkillCandidate, lookup: SkillLookupOptions): Promise<SkillDefinition | undefined> {
      const signal = lookupSignal(options.lifecycleSignal, lookup.signal)
      throwIfAborted(signal)
      const record = records.get(candidate)
      if (record === undefined) {
        diagnostic('refused an unrecognized Skill candidate')
        return undefined
      }
      try {
        const bytes = await readTrustedSkill(record, packageRoot, vendorRoot, signal, readSkillFile)
        throwIfAborted(signal)
        if (sha256(bytes) !== record.row.sha256) {
          diagnostic('refused Skill "' + record.row.name + '" at ' + record.filePath + ': vendored file hash differs from generated catalog')
          return undefined
        }
        if (!bodyOffsetMatchesFrontmatter(bytes, record.row.bodyByteOffset)) {
          diagnostic('refused Skill "' + record.row.name + '" at ' + record.filePath + ': frontmatter boundary differs from generated catalog')
          return undefined
        }
        let content: string
        try {
          content = new TextDecoder('utf-8', { fatal: true }).decode(bytes.subarray(record.row.bodyByteOffset))
        } catch {
          diagnostic('refused Skill "' + record.row.name + '" at ' + record.filePath + ': body is not valid UTF-8')
          return undefined
        }
        const definition: SkillDefinition = {
          name: record.candidate.name,
          description: record.candidate.description,
          invocation: record.candidate.invocation,
          provider: record.candidate.provider,
          source: record.candidate.source,
          resourceBase: record.candidate.resourceBase!,
          path: record.filePath,
          content,
          ...(record.candidate.whenToUse === undefined ? {} : { whenToUse: record.candidate.whenToUse }),
          ...(record.candidate.metadata === undefined ? {} : { metadata: record.candidate.metadata }),
        }
        return Object.freeze(definition)
      } catch (error) {
        if (signal?.aborted) throw signal.reason
        diagnostic('could not load Skill "' + record.row.name + '" at ' + record.filePath + ': ' + errorMessage(error))
        return undefined
      }
    },
  } satisfies SkillProvider)
}
