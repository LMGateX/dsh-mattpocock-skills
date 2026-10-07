/** Host-only binding to the already selected native ESM graph. No resolver mutation. */
import type { ModuleLoader } from '@deepseek-ai/cordis-plugin-loader'

interface BindingContext { get(name: string): unknown }
export interface ImportBindingSite { readonly offset: number; readonly length: number; readonly specifier: string; readonly literal: string }
export interface ImportBindingInventory { readonly id: 'canonical-native-url-v1'; readonly sites: readonly ImportBindingSite[] }

/** Closed and synchronous: the serialized pre-import guard embeds this exact function.
 * Only declared Loader resolution methods are used; no cache/job or Node reflection. */
export function inspectCanonicalPeerBindings(ctx: BindingContext, nativePath: string, wrapperPath: string,
  artifactPath: string, installationAnchor: string): Readonly<Record<string, string>> {
  if (typeof process.getBuiltinModule !== 'function') throw new Error('Canonical peer binding requires Node builtin access')
  const fs = process.getBuiltinModule('node:fs'), module = process.getBuiltinModule('node:module')
  const path = process.getBuiltinModule('node:path'), url = process.getBuiltinModule('node:url')
  const internal = (ctx.get('loader') as { internal?: ModuleLoader } | undefined)?.internal
  if (!internal || internal.version !== 'v1' && internal.version !== 'v2' || typeof internal.resolveSync !== 'function') {
    throw new Error('Canonical peer binding requires the known public Loader ESM resolver')
  }
  const resolve = (specifier: string, importer: string): string => {
    const parent = url.pathToFileURL(importer).href
    const resolved = internal.version === 'v2'
      ? internal.resolveSync(parent, { specifier, attributes: {} })
      : internal.resolveSync(specifier, parent, {})
    const target = new URL(resolved.url)
    if (target.protocol !== 'file:' || target.search || target.hash || resolved.format !== 'module') {
      throw new Error('Unknown canonical ESM peer URL or format: ' + specifier)
    }
    const filename = fs.realpathSync(url.fileURLToPath(target))
    if (!fs.statSync(filename).isFile()) throw new Error('Canonical peer is not a file: ' + specifier)
    return url.pathToFileURL(filename).href
  }
  const native = fs.realpathSync(nativePath), wrapper = fs.realpathSync(wrapperPath), artifact = fs.realpathSync(artifactPath)
  const nativeRequire = module.createRequire(native), installation = module.createRequire(installationAnchor)
  const nativeUrl = url.pathToFileURL(native).href
  if (resolve('@deepseek-ai/dsh-subagent', wrapper) !== nativeUrl || resolve('@deepseek-ai/dsh-subagent', artifact) !== nativeUrl) {
    throw new Error('Wrapper/artifact resolves a different canonical native importer')
  }
  const result: Record<string, string> = {}
  const peers = ['@deepseek-ai/dsh-subagent', '@deepseek-ai/schemastery', '@deepseek-ai/dsh-scope',
    '@deepseek-ai/dsh-tools', '@deepseek-ai/dsh-util-time', '@deepseek-ai/dsh-typert-protocol',
    '@deepseek-ai/dsh-attachment', 'zod', '@deepseek-ai/dsh-llm', '@deepseek-ai/dsh-agent',
    '@deepseek-ai/dsh-session', '@deepseek-ai/dsh-brand', '@deepseek-ai/dsh-util-values', '@deepseek-ai/dsh-chunked-list']
  for (const peer of peers) {
    const selected = resolve(peer, native)
    const manifestPath = fs.realpathSync(nativeRequire.resolve(peer + '/package.json'))
    let directory = path.dirname(url.fileURLToPath(selected)), owned = false
    for (let remaining = 32; remaining > 0; remaining--) {
      const candidate = path.join(directory, 'package.json')
      if (fs.existsSync(candidate)) {
        const actualManifest = fs.realpathSync(candidate)
        if (actualManifest !== manifestPath || path.dirname(actualManifest) !== fs.realpathSync(directory)) {
          throw new Error('Canonical ESM peer manifest escaped its selected package: ' + peer)
        }
        owned = true
        break
      }
      const parent = path.dirname(directory)
      if (parent === directory) break
      directory = parent
    }
    if (!owned) throw new Error('Canonical ESM peer package ownership is unavailable: ' + peer)
    const info = fs.statSync(manifestPath)
    if (!info.isFile() || info.size > 65536) throw new Error('Canonical peer manifest exceeds inspection gate: ' + peer)
    const bytes = fs.readFileSync(manifestPath)
    if (bytes.length > 65536) throw new Error('Canonical peer manifest changed beyond inspection gate: ' + peer)
    const manifest = JSON.parse(bytes.toString('utf8')) as { name?: unknown; version?: unknown }
    const relative = path.relative(path.dirname(manifestPath), url.fileURLToPath(selected))
    if (manifest.name !== peer || typeof manifest.version !== 'string' || !relative || path.isAbsolute(relative) ||
      relative === '..' || relative.startsWith('..' + path.sep)) {
      throw new Error('Canonical ESM peer escaped or differs from its native-owned package: ' + peer)
    }
    result[peer] = selected
  }
  // These remain real bare imports in the wrapper. They may not use a Profile shadow.
  for (const peer of ['@deepseek-ai/cordis', '@deepseek-ai/cordis-plugin-loader', '@deepseek-ai/dsh-subagent', '@deepseek-ai/dsh-util-values']) {
    const expected = peer === '@deepseek-ai/cordis-plugin-loader'
      ? resolve(peer, installationAnchor) : resolve(peer, native)
    const own = module.createRequire(wrapper)
    const manifest = peer === '@deepseek-ai/cordis-plugin-loader' ? installation : nativeRequire
    const ownManifest = fs.realpathSync(own.resolve(peer + '/package.json'))
    const expectedManifest = fs.realpathSync(manifest.resolve(peer + '/package.json'))
    if (resolve(peer, wrapper) !== expected || ownManifest !== expectedManifest) {
      const versionOf = (filename: string): string => {
        const info = fs.statSync(filename)
        if (!info.isFile() || info.size > 65536) return 'unknown'
        const bytes = fs.readFileSync(filename)
        if (bytes.length > 65536) return 'unknown'
        const value = JSON.parse(bytes.toString('utf8')) as { version?: unknown }
        return typeof value.version === 'string' && value.version.length < 128 ? value.version : 'unknown'
      }
      throw new Error('Compatibility wrapper imports a different canonical public peer: ' + peer +
        ' (native version ' + versionOf(expectedManifest) + '; wrapper version ' + versionOf(ownManifest) +
        '). Equal versions alone do not establish shared module identity.')
    }
  }
  return Object.freeze(result)
}

/** Rebind only the hash-verified finite literal inventory; normal ESM keeps live bindings. */
export function bindCompatibleSubagentSource(source: string, inventory: ImportBindingInventory,
  peers: Readonly<Record<string, string>>): string {
  if (inventory?.id !== 'canonical-native-url-v1' || !Array.isArray(inventory.sites) || inventory.sites.length !== 17) {
    throw new Error('Unsupported compatible import binding inventory')
  }
  let previousEnd = 0
  for (const site of inventory.sites) {
    if (!site || !Number.isSafeInteger(site.offset) || !Number.isSafeInteger(site.length) || site.length < 3 ||
      site.offset < previousEnd || site.offset + site.length > source.length || site.literal !== JSON.stringify(site.specifier) ||
      source.slice(site.offset, site.offset + site.length) !== site.literal) throw new Error('Compatible import binding site mismatch')
    if (!site.specifier.startsWith('node:') && !Object.hasOwn(peers, site.specifier)) throw new Error('Compatible import missing canonical peer: ' + site.specifier)
    previousEnd = site.offset + site.length
  }
  let bound = source
  for (const site of [...inventory.sites].reverse()) {
    if (site.specifier.startsWith('node:')) continue
    const target = new URL(peers[site.specifier]!)
    if (target.protocol !== 'file:' || target.search || target.hash) throw new Error('Compatible import binding must use an exact canonical file URL')
    bound = bound.slice(0, site.offset) + JSON.stringify(target.href) + bound.slice(site.offset + site.length)
  }
  return 'data:text/javascript;base64,' + Buffer.from(bound, 'utf8').toString('base64')
}
