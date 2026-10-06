/** Node-only, read-only evidence for this plugin's NEXT genuine process boot.
 * This is a trusted Host seam, never a settings/model preparation receipt. */
import type { Context } from '@deepseek-ai/cordis'
import type { Loader } from '@deepseek-ai/cordis-plugin-loader'
import { createHash } from 'node:crypto'
import { readFile, realpath, stat } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, isAbsolute, join, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { StartupPreparation } from '../controls/startup-state.js'
import { COMPAT_SUBAGENT_ID, COMPAT_SUBAGENT_NAME, STOCK_SUBAGENT_ID, STOCK_SUBAGENT_NAME,
  createCompatibilityCompositionExpressions } from './composition.js'

export const COMPATIBLE_SUBAGENT_METADATA = Object.freeze({
  owner: '@lmgatex/dsh-mattpocock-skills', version: '0.2.1-alpha.1',
  artifactPath: 'compatibility/native-subagent-0.2.1-alpha.1.js',
  artifactSha256: 'f6197aa3eb84c4f803e2b6517e70b1b62a804bb4e763abec94ebe961dabd77ba',
  provenancePath: 'compatibility/native-subagent.provenance.json',
  provenanceSha256: '017d4b1c0fd6735edd588576b6587872816a11bcfa9c33038a75e9fc1b8fe4e0',
  nativeSha256: '75b50b1c9452a6aeb10d1c859e3f45b05e062ea1fad6ed3bcd9577f2bc912541',
  wrapperPath: 'lib/compatibility/native-subagent.js',
  originSymbol: '@lmgatex/dsh-mattpocock-skills/compatible-subagent-origin',
  originValue: 'native-subagent-0.2.1-alpha.1',
  externalImports: Object.freeze(['@deepseek-ai/dsh-agent', '@deepseek-ai/dsh-attachment', '@deepseek-ai/dsh-brand',
    '@deepseek-ai/dsh-chunked-list', '@deepseek-ai/dsh-llm', '@deepseek-ai/dsh-scope', '@deepseek-ai/dsh-session',
    '@deepseek-ai/dsh-subagent', '@deepseek-ai/dsh-tools', '@deepseek-ai/dsh-typert-protocol',
    '@deepseek-ai/dsh-util-time', '@deepseek-ai/dsh-util-values', '@deepseek-ai/schemastery', 'zod']),
})
const metadata = COMPATIBLE_SUBAGENT_METADATA
const ownRoot = fileURLToPath(new URL('../../', import.meta.url))
const hash = (bytes: Buffer): string => createHash('sha256').update(bytes).digest('hex')
const message = (error: unknown): string => error instanceof Error ? error.message : String(error)
interface PublicContext { get(name: string): unknown }
/** Declared public Context symbol maps, observed without loading Cordis code. */
interface PublicScope {
  readonly root?: Context
  readonly [key: symbol]: Readonly<Record<string, unknown>> | undefined
}
const scopeKeys = [Symbol.for('cordis.isolate'), Symbol.for('cordis.intercept')] as const
interface Row { id?: unknown; name?: unknown; group?: unknown; isolate?: unknown; intercept?: unknown; disabled?: unknown; config?: unknown }
interface PublicTree { context: PublicContext & { baseUrl?: unknown }; root: { data: Row[]; tree: PublicTree } }
interface PublicEntry { options: Row; parent: { tree: PublicTree }; readonly ctx?: Context; fiber?: { uid: number | null } }
/** Overrides are trusted operator-program fixture metadata, not serialized authority. */
export interface CompatibilityInspectionOptions { readonly pluginRoot?: string }
class EvidenceError extends Error {
  constructor(readonly status: StartupPreparation['status'], diagnostic: string) { super(diagnostic) }
}
async function canonical(path: string, signal?: AbortSignal): Promise<string> {
  signal?.throwIfAborted()
  const result = await realpath(path)
  signal?.throwIfAborted()
  return result
}
async function boundedRead(path: string, limit: number, signal?: AbortSignal): Promise<Buffer> {
  signal?.throwIfAborted()
  const info = await stat(path)
  signal?.throwIfAborted()
  if (!info.isFile() || info.size > limit) throw new EvidenceError('incompatible', 'File exceeds the bounded compatibility inspection gate: ' + path)
  const bytes = await readFile(path, { signal })
  signal?.throwIfAborted()
  if (bytes.length > limit) throw new EvidenceError('incompatible', 'File changed beyond the compatibility inspection gate: ' + path)
  return bytes
}
async function ownedPath(root: string, path: string, signal?: AbortSignal): Promise<string> {
  const result = await canonical(join(root, path), signal)
  signal?.throwIfAborted()
  const suffix = relative(root, result)
  if (isAbsolute(suffix) || suffix === '..' || suffix.startsWith('..' + sep)) throw new EvidenceError('incompatible', 'Compatibility asset escaped its owning plugin package')
  return result
}

/** Shared metadata/owned-public-asset gate. Does not import or construct a native implementation. */
export async function inspectCompatibleSubagentAsset(pluginRoot: string = ownRoot, signal?: AbortSignal): Promise<void> {
  if (!isAbsolute(pluginRoot)) throw new EvidenceError('uncertain', 'Plugin package root must be trusted absolute metadata')
  const root = await canonical(pluginRoot, signal)
  signal?.throwIfAborted()
  const asset = await ownedPath(root, metadata.artifactPath, signal)
  signal?.throwIfAborted()
  const bytes = await boundedRead(asset, 524288, signal)
  signal?.throwIfAborted()
  const provenance = await ownedPath(root, metadata.provenancePath, signal)
  signal?.throwIfAborted()
  const provenanceBytes = await boundedRead(provenance, 65536, signal)
  signal?.throwIfAborted()
  if (hash(bytes) !== metadata.artifactSha256 || hash(provenanceBytes) !== metadata.provenanceSha256) {
    throw new EvidenceError('incompatible', 'Owned compatibility asset or provenance hash mismatch; update/reinstall this same plugin package')
  }
  const raw = JSON.parse(provenanceBytes.toString('utf8'))
  if (raw.schemaVersion !== 1 || raw.owner !== metadata.owner || raw.sdk?.name !== '@deepseek-ai/dsh' || raw.sdk?.version !== metadata.version ||
    raw.source?.package !== STOCK_SUBAGENT_NAME || raw.source?.version !== metadata.version || raw.source?.publicEntry !== 'lib/index.js' ||
    raw.source?.originalSha256 !== metadata.nativeSha256 || raw.upstream?.tag !== 'dsh-v' + metadata.version ||
    raw.upstream?.commit !== '5badb15009ae1756c3afe0ae0cef1faafc290ccc' || raw.artifact?.path !== metadata.artifactPath ||
    raw.artifact?.sha256 !== metadata.artifactSha256 || raw.artifact?.bytes !== bytes.length ||
    raw.transformation?.origin?.symbol !== metadata.originSymbol || raw.transformation?.origin?.value !== metadata.originValue ||
    raw.transformation?.origin?.readOnly !== true || raw.transformation?.origin?.capability !== false) {
    throw new EvidenceError('incompatible', 'Owned compatibility provenance identity mismatch')
  }
}
/** Only pinned condition-independent public entries make require.resolve a
 * proof for Loader's later ESM import. Other conditions remain unknown. */
function publicExport(value: unknown, label: string): string | null {
  if (typeof value === 'string') return value
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return null
  if (Object.keys(value).some(key => key !== 'types' && key !== 'default')) {
    throw new EvidenceError('uncertain', 'Unknown ' + label + ' public export conditions; require/default evidence does not prove ESM Loader identity')
  }
  const target = (value as { default?: unknown }).default
  return typeof target === 'string' ? target : null
}
/** Proof anchors are the executable module files, not their parent package or
 * Loader base. A lib/node_modules peer can differ while package-root lookup agrees. */
async function inspectPeerIdentities(nativePath: string, wrapperPath: string, artifactPath: string,
  installation: ReturnType<typeof createRequire>, signal?: AbortSignal): Promise<void> {
  const native = createRequire(nativePath), wrapper = createRequire(wrapperPath), artifact = createRequire(artifactPath)
  const samePeer = async (name: string, expected: ReturnType<typeof createRequire>,
    importers: readonly ReturnType<typeof createRequire>[]): Promise<void> => {
    signal?.throwIfAborted()
    const entry = await canonical(expected.resolve(name), signal)
    signal?.throwIfAborted()
    const manifest = await canonical(expected.resolve(name + '/package.json'), signal)
    signal?.throwIfAborted()
    for (const importer of importers) {
      const actualEntry = await canonical(importer.resolve(name), signal)
      signal?.throwIfAborted()
      const actualManifest = await canonical(importer.resolve(name + '/package.json'), signal)
      signal?.throwIfAborted()
      if (actualEntry !== entry || actualManifest !== manifest) {
        throw new EvidenceError('uncertain', 'Plugin wrapper/artifact and canonical native importer resolve different native peers: ' + name)
      }
    }
  }
  try {
    for (const peer of metadata.externalImports) {
      await samePeer(peer, native, [wrapper, artifact])
      signal?.throwIfAborted()
    }
    await samePeer('@deepseek-ai/cordis', native, [wrapper])
    signal?.throwIfAborted()
    await samePeer('@deepseek-ai/cordis-plugin-loader', installation, [wrapper])
    signal?.throwIfAborted()
  } catch (error) {
    signal?.throwIfAborted()
    if (error instanceof EvidenceError) throw error
    throw new EvidenceError('uncertain', 'Shared native peer identity is unavailable: ' + message(error))
  }
}
/** Root ownership is eligible only when the actual carrier and containing
 * Loader tree already share that root's complete public service/config realm.
 * Inherited keys count: a shallow own-key check would silently widen scope. */
function inspectRootScope(tree: PublicTree, carrier: PublicEntry): void {
  const context = carrier.ctx as unknown as PublicScope | undefined
  const root = context?.root as unknown as PublicScope | undefined
  const treeContext = tree.context as unknown as PublicScope
  if (!context || !root || treeContext.root !== context.root) {
    throw new EvidenceError('uncertain', 'Application-root provider requires known matching public carrier/Loader root scope')
  }
  for (const symbol of scopeKeys) {
    const rootMap = root[symbol]
    if (!rootMap || typeof rootMap !== 'object' || Array.isArray(rootMap)) {
      throw new EvidenceError('uncertain', 'Application-root public isolation/intercept scope metadata is unavailable')
    }
    for (const observed of [context, treeContext]) {
      const map = observed[symbol]
      if (!map || typeof map !== 'object' || Array.isArray(map)) {
        throw new EvidenceError('uncertain', 'Carrier/Loader public isolation/intercept scope metadata is unavailable')
      }
      const keys = new Set<string>()
      for (const key in map) { keys.add(key); if (keys.size > 512) throw new EvidenceError('uncertain', 'Public root scope exceeds bounded inspection') }
      for (const key in rootMap) { keys.add(key); if (keys.size > 512) throw new EvidenceError('uncertain', 'Public root scope exceeds bounded inspection') }
      for (const key of keys) if (map[key] !== rootMap[key]) {
        throw new EvidenceError('uncertain', 'Application-root provider would widen or change the carrier/Loader isolation/intercept scope: ' + key)
      }
    }
  }
}
function canonicalTopology(entries: readonly PublicEntry[], stock: PublicEntry, compat: PublicEntry): PublicTree {
  const tree = stock.parent.tree
  if (compat.parent.tree !== tree || stock.parent !== tree.root || compat.parent !== tree.root || !Array.isArray(tree.root.data)) {
    throw new EvidenceError('incompatible', 'Compatibility requires canonical sibling rows in one public Loader root')
  }
  const rows = tree.root.data
  const pending = [rows], visited = new Set<Row[]>()
  let budget = 512
  while (pending.length) {
    const group = pending.pop()!
    if (visited.has(group) || group.length > budget) throw new EvidenceError('incompatible', 'Unsupported cyclic or oversized Loader topology')
    visited.add(group); budget -= group.length
    for (const row of group) {
      if (!row || typeof row !== 'object') throw new EvidenceError('incompatible', 'Unsupported Loader raw row')
      if (row.name === STOCK_SUBAGENT_NAME && (row.id !== STOCK_SUBAGENT_ID || group !== rows) ||
        row.name === COMPAT_SUBAGENT_NAME && (row.id !== COMPAT_SUBAGENT_ID || group !== rows)) {
        throw new EvidenceError('incompatible', 'Aliased or grouped subagent rows cannot guarantee the next boot provider')
      }
      if (row.group && Array.isArray(row.config)) pending.push(row.config as Row[])
    }
  }
  if (rows.filter(row => row.id === STOCK_SUBAGENT_ID).length !== 1 || rows.filter(row => row.id === COMPAT_SUBAGENT_ID).length !== 1 ||
    entries.filter(entry => entry.options.name === STOCK_SUBAGENT_NAME).length !== 1 ||
    entries.filter(entry => entry.options.name === COMPAT_SUBAGENT_NAME).length !== 1) {
    throw new EvidenceError('incompatible', 'Duplicate subagent rows cannot guarantee the next boot provider')
  }
  const expected = createCompatibilityCompositionExpressions()
  for (const [entry, expression] of [[stock, expected.stock], [compat, expected.compat]] as const) {
    const row = entry.options, raw = rows.find(row => row.id === entry.options.id)
    const exact = (disabled: unknown) => disabled !== null && typeof disabled === 'object' &&
      Object.keys(disabled).length === 1 && (disabled as { __jsExpr?: unknown }).__jsExpr === expression.__jsExpr
    if (row.group || row.isolate !== undefined || row.intercept !== undefined || !exact(row.disabled) ||
      !raw || raw.name !== row.name || raw.group || raw.isolate !== undefined || raw.intercept !== undefined || !exact(raw.disabled)) {
      throw new EvidenceError('incompatible', 'Overridden, isolated, grouped or noncanonical composition guards cannot guarantee next-boot compatibility')
    }
  }
  return tree
}

/** Ready means SAMEPLUGIN's packaged provider can be selected on the next true
 * boot; never current enablement, shared SDK patching, or a private sticky choice. */
export async function inspectCompatibilityPreparation(ctx: PublicContext, signal?: AbortSignal,
  options: CompatibilityInspectionOptions = {}): Promise<StartupPreparation | null> {
  signal?.throwIfAborted()
  let sdkVersion: string | null = null
  try {
    const loader = ctx.get('loader') as Loader | undefined
    if (!loader || typeof loader.entries !== 'function') return null
    const entries: PublicEntry[] = []
    for (const entry of loader.entries()) {
      if (entries.length >= 512) throw new EvidenceError('incompatible', 'Loader entries exceed bounded inspection')
      entries.push(entry as unknown as PublicEntry)
    }
    const stock = entries.find(entry => entry.options.id === STOCK_SUBAGENT_ID && entry.options.name === STOCK_SUBAGENT_NAME)
    const compat = entries.find(entry => entry.options.id === COMPAT_SUBAGENT_ID && entry.options.name === COMPAT_SUBAGENT_NAME)
    if (!stock || !compat) throw new EvidenceError('incompatible', 'Canonical plugin compatibility composition is missing; update this plugin or retain the custom Profile')
    const tree = canonicalTopology(entries, stock, compat)
    inspectRootScope(tree, compat)
    // Only the public raw guards were compared: Entry.disabled would execute the
    // expression and mutate process selection, so it must never be inspected.
    if (tree.context.get('subagents') && stock.fiber?.uid == null && compat.fiber?.uid == null) {
      throw new EvidenceError('uncertain', 'A current service outside the canonical rows makes provider ownership unknown')
    }
    const profile = tree.context.get('profileContext') as { installAnchor?: unknown; dir?: unknown } | undefined
    if (typeof process.getBuiltinModule !== 'function' || typeof profile?.installAnchor !== 'string' || !isAbsolute(profile.installAnchor) ||
      typeof profile.dir !== 'string' || !isAbsolute(profile.dir) || typeof tree.context.baseUrl !== 'string') {
      throw new EvidenceError('uncertain', 'Public launch metadata or Node getBuiltinModule required by the serialized boot gate is unavailable')
    }
    const app = JSON.parse((await boundedRead(profile.installAnchor, 65536, signal)).toString('utf8'))
    signal?.throwIfAborted()
    if (app.name !== '@deepseek-ai/dsh') throw new EvidenceError('uncertain', 'Launch anchor is not an identified DSH SDK')
    sdkVersion = typeof app.version === 'string' ? app.version : null
    if (sdkVersion !== metadata.version) throw new EvidenceError('incompatible', 'Plugin compatibility is pinned to SDK ' + metadata.version + '; observed ' + sdkVersion)
    const base = new URL('package.json', tree.context.baseUrl)
    if (base.protocol !== 'file:') throw new EvidenceError('uncertain', 'Public Loader base URL is not a local file resolver')
    const installation = createRequire(profile.installAnchor)
    let nativeRequire = createRequire(base), filename: string
    try { filename = nativeRequire.resolve(STOCK_SUBAGENT_NAME) } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'MODULE_NOT_FOUND') throw error
      nativeRequire = installation; filename = nativeRequire.resolve(STOCK_SUBAGENT_NAME)
    }
    const nativePath = await canonical(filename, signal)
    signal?.throwIfAborted()
    try {
      const local = createRequire(join(profile.dir, 'package.json')).resolve(STOCK_SUBAGENT_NAME)
      const localPath = await canonical(local, signal)
      signal?.throwIfAborted()
      if (localPath !== nativePath) throw new EvidenceError('uncertain', 'Ambiguous profile-local native peer resolution')
    } catch (error) { signal?.throwIfAborted(); if ((error as NodeJS.ErrnoException).code !== 'MODULE_NOT_FOUND') throw error }
    const manifestPath = nativeRequire.resolve(STOCK_SUBAGENT_NAME + '/package.json')
    const nativeManifest = JSON.parse((await boundedRead(manifestPath, 65536, signal)).toString('utf8'))
    signal?.throwIfAborted()
    if (publicExport(nativeManifest.exports?.['.'], 'native') !== './lib/index.js') {
      throw new EvidenceError('uncertain', 'Native public export does not identify the pinned condition-independent ESM entry')
    }
    const publicPath = await canonical(join(dirname(manifestPath), 'lib/index.js'), signal)
    signal?.throwIfAborted()
    if (nativeManifest.name !== STOCK_SUBAGENT_NAME || nativeManifest.version !== metadata.version || nativePath !== publicPath) {
      throw new EvidenceError('incompatible', 'Native public peer identity/version/path differs from the pinned boot gate')
    }
    const nativeBytes = await boundedRead(nativePath, 524288, signal)
    signal?.throwIfAborted()
    if (hash(nativeBytes) !== metadata.nativeSha256) throw new EvidenceError('uncertain', 'Native peer bytes are not the pristine supported SDK image; current loaded capability remains authoritative')
    if (options.pluginRoot !== undefined && !isAbsolute(options.pluginRoot)) throw new EvidenceError('uncertain', 'Plugin package root must be trusted absolute metadata')
    const pluginRoot = await canonical(options.pluginRoot ?? ownRoot, signal)
    signal?.throwIfAborted()
    const pkg = JSON.parse((await boundedRead(join(pluginRoot, 'package.json'), 65536, signal)).toString('utf8'))
    signal?.throwIfAborted()
    const exported = publicExport(pkg.exports?.['./native-subagent'], 'wrapper')
    if (pkg.name !== metadata.owner || exported !== './' + metadata.wrapperPath) {
      throw new EvidenceError('incompatible', 'Same plugin package is missing its public native-subagent wrapper export; update/reinstall the plugin')
    }
    const wrapper = await ownedPath(pluginRoot, metadata.wrapperPath, signal)
    signal?.throwIfAborted()
    if ((await boundedRead(wrapper, 65536, signal)).length === 0) throw new EvidenceError('incompatible', 'Packaged compatibility wrapper is empty')
    signal?.throwIfAborted()
    let wrapperResolver = createRequire(base), wrapperResolved: string
    try { wrapperResolved = wrapperResolver.resolve(COMPAT_SUBAGENT_NAME) } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'MODULE_NOT_FOUND') throw error
      wrapperResolver = installation; wrapperResolved = wrapperResolver.resolve(COMPAT_SUBAGENT_NAME)
    }
    const resolvedWrapper = await canonical(wrapperResolved, signal)
    signal?.throwIfAborted()
    if (resolvedWrapper !== wrapper) throw new EvidenceError('uncertain', 'Loader resolves a different plugin wrapper than this inspected package')
    const resolvedPluginManifest = await canonical(wrapperResolver.resolve(metadata.owner + '/package.json'), signal)
    signal?.throwIfAborted()
    const ownManifest = await canonical(join(pluginRoot, 'package.json'), signal)
    signal?.throwIfAborted()
    if (resolvedPluginManifest !== ownManifest) throw new EvidenceError('uncertain', 'Loader resolves a different plugin package manifest than this inspected package')
    try {
      const localWrapper = createRequire(join(profile.dir, 'package.json')).resolve(COMPAT_SUBAGENT_NAME)
      const localWrapperPath = await canonical(localWrapper, signal)
      signal?.throwIfAborted()
      if (localWrapperPath !== wrapper) throw new EvidenceError('uncertain', 'Ambiguous profile-local plugin wrapper resolution')
    } catch (error) { signal?.throwIfAborted(); if ((error as NodeJS.ErrnoException).code !== 'MODULE_NOT_FOUND') throw error }
    await inspectCompatibleSubagentAsset(pluginRoot, signal)
    signal?.throwIfAborted()
    const artifact = await ownedPath(pluginRoot, metadata.artifactPath, signal)
    signal?.throwIfAborted()
    await inspectPeerIdentities(nativePath, wrapper, artifact, installation, signal)
    signal?.throwIfAborted()
    return { status: 'ready', sdkVersion, diagnostic: 'This same plugin package has a verified compatible provider for the next genuine DSH boot. The running service and shared SDK were not changed; fully restart normally to select it. Implementation readiness does not validate future operator configuration or promise boot success.' }
  } catch (error) {
    signal?.throwIfAborted()
    return { status: error instanceof EvidenceError ? error.status : 'failed', sdkVersion,
      diagnostic: message(error) + ' No SDK files were written; use the updated compatible plugin package, not manual SDK patch maintenance.' }
  }
}
