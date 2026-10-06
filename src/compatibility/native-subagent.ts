/** Public, same-process provider for the bounded pinned stock/compat root topology. */
import { Context, symbols } from '@deepseek-ai/cordis'
import type { Fiber } from '@deepseek-ai/cordis'
import { Entry, interpolate } from '@deepseek-ai/cordis-plugin-loader'
import type { EntryTree } from '@deepseek-ai/cordis-plugin-loader'
import OriginalSubagent from '@deepseek-ai/dsh-subagent'
import type { Config as NativeConfig } from '@deepseek-ai/dsh-subagent'
import { deepEqualJson } from '@deepseek-ai/dsh-util-values'
import { createHash } from 'node:crypto'
import { readFileSync, statSync } from 'node:fs'

const version = '0.2.1-alpha.1'
const artifactPath = 'compatibility/native-subagent-0.2.1-alpha.1.js'
const artifactHash = 'f6197aa3eb84c4f803e2b6517e70b1b62a804bb4e763abec94ebe961dabd77ba'
const artifactUrl = new URL('../../' + artifactPath, import.meta.url)
const origin = Symbol.for('@lmgatex/dsh-mattpocock-skills/compatible-subagent-origin')

function boundedRead(url: URL, limit: number): Buffer {
  const stat = statSync(url)
  if (!stat.isFile() || stat.size > limit) throw new Error('compatibility asset exceeds bounded file gate')
  return readFileSync(url)
}

// Verify owned bytes and pinned provenance before importing executable code. The
// stock public constructor is the fallback, never an invented capability getter.
let Native: typeof OriginalSubagent = OriginalSubagent
let assetFailure: unknown
try {
  const bytes = boundedRead(artifactUrl, 524288)
  const provenanceBytes = boundedRead(new URL('../../compatibility/native-subagent.provenance.json', import.meta.url), 65536)
  if (createHash('sha256').update(provenanceBytes).digest('hex') !== '017d4b1c0fd6735edd588576b6587872816a11bcfa9c33038a75e9fc1b8fe4e0') {
    throw new Error('compatibility provenance integrity mismatch')
  }
  const metadata = JSON.parse(provenanceBytes.toString('utf8'))
  if (createHash('sha256').update(bytes).digest('hex') !== artifactHash ||
      metadata.schemaVersion !== 1 || metadata.owner !== '@lmgatex/dsh-mattpocock-skills' ||
      metadata.sdk?.name !== '@deepseek-ai/dsh' || metadata.sdk?.version !== version ||
      metadata.source?.package !== '@deepseek-ai/dsh-subagent' || metadata.source?.version !== version ||
      metadata.source?.publicEntry !== 'lib/index.js' ||
      metadata.source?.originalSha256 !== '75b50b1c9452a6aeb10d1c859e3f45b05e062ea1fad6ed3bcd9577f2bc912541' ||
      metadata.upstream?.tag !== 'dsh-v' + version ||
      metadata.upstream?.commit !== '5badb15009ae1756c3afe0ae0cef1faafc290ccc' ||
      metadata.artifact?.path !== artifactPath || metadata.artifact?.sha256 !== artifactHash ||
      metadata.artifact?.bytes !== bytes.length ||
      metadata.transformation?.origin?.symbol !== '@lmgatex/dsh-mattpocock-skills/compatible-subagent-origin' ||
      metadata.transformation?.origin?.value !== 'native-subagent-' + version ||
      metadata.transformation?.origin?.readOnly !== true || metadata.transformation?.origin?.capability !== false) {
    throw new Error('compatibility asset integrity or provenance mismatch')
  }
  const candidate = (await import(artifactUrl.href)).default as typeof OriginalSubagent
  if (typeof candidate !== 'function' || (candidate.prototype as unknown as Record<symbol, unknown>)[origin] !== 'native-subagent-' + version) {
    throw new Error('compatibility constructor origin mismatch')
  }
  Native = candidate
} catch (error) {
  assetFailure = error
}

const rootedProvidersKey = Symbol.for('@lmgatex/dsh-mattpocock-skills/native-subagent-root-providers-v1')
const processState = globalThis as typeof globalThis & { [key: symbol]: WeakMap<EntryTree, Fiber> | undefined }
const rootedProviders = processState[rootedProvidersKey] ??= new WeakMap<EntryTree, Fiber>()

function plainRootRow(row: Record<string, unknown>): boolean {
  return !row.group && row.isolate === undefined && row.intercept === undefined
}

/** Root ownership must not escape a scoped Loader's service or intercept realm.
 * Both maps are declared public Context contracts; inherited keys matter too. */
function sharesRootScope(context: Context, root: Context): boolean {
  if (!root || context.root !== root) return false
  for (const symbol of [Context.isolate, Context.intercept] as const) {
    const scoped = context[symbol], rooted = root[symbol]
    if (!scoped || !rooted || typeof scoped !== 'object' || typeof rooted !== 'object' ||
        Array.isArray(scoped) || Array.isArray(rooted)) return false
    const keys = new Set<string>()
    for (const key in scoped) {
      keys.add(key)
      if (keys.size > 512) return false
    }
    for (const key in rooted) {
      keys.add(key)
      if (keys.size > 512) return false
    }
    for (const key of keys) {
      if (scoped[key] !== rooted[key]) return false
    }
  }
  return true
}

export async function apply(ctx: Context): Promise<void> {
  // Never instantiate a second canonical service, including in a hand-written
  // custom tree. The composition guard owns selection, not service overwrites.
  if (ctx.get('subagents')) return
  const entry = (ctx as Context & { [Entry.key]?: Entry })[Entry.key]
  const tree = entry?.parent.tree
  const stock = tree?.store.subagent
  const rows = tree?.root.data
  // An extant canonical stock Fiber, including PENDING, is never replaced.
  if (stock?.fiber && stock.fiber.uid !== null) return
  const applicationRoot = ctx.root
  if (!entry || !tree || !stock || !rows || entry.parent !== tree.root || stock.parent !== tree.root ||
      entry.options.id !== 'mattpocock-native-subagent' || entry.options.name !== '@lmgatex/dsh-mattpocock-skills/native-subagent' ||
      stock.options.name !== '@deepseek-ai/dsh-subagent' || !stock.disabled ||
      rows.filter(row => row.id === 'subagent').length !== 1 || rows.filter(row => row.id === 'mattpocock-native-subagent').length !== 1 ||
      !plainRootRow(entry.options as unknown as Record<string, unknown>) || !plainRootRow(stock.options as unknown as Record<string, unknown>) ||
      !sharesRootScope(ctx, applicationRoot) || !sharesRootScope(tree.context, applicationRoot)) {
    throw new Error('unsupported native subagent compatibility topology')
  }
  const retained = rootedProviders.get(tree)
  if (retained && retained.uid !== null) {
    await retained.await()
    return
  }
  // A disabled stock Entry has never had its ctx patched by Loader. Evaluate
  // its raw config in this sibling's public same-scope context with stock identity.
  const scope = ctx.extend({ [Entry.key]: stock })
  let raw = structuredClone(stock.options.config)
  let validated: NativeConfig = OriginalSubagent.Config(interpolate(scope, raw))
  const refresh = () => {
    if (deepEqualJson(raw, stock.options.config)) return
    raw = structuredClone(stock.options.config)
    try {
      // Validate the entire native schema atomically. An invalid operator
      // candidate cannot partially update one limit or silently become a default.
      validated = OriginalSubagent.Config(interpolate(scope, raw))
    } catch (error) {
      ctx.logger.warn('Native subagent config update failed; retaining last valid limits', error)
    }
  }
  const config: NativeConfig = {
    maxDepth: { get() { refresh(); return validated.maxDepth.get() } },
    maxActiveSubagents: { get() { refresh(); return validated.maxActiveSubagents.get() } },
  }
  // Context.root is a public, experimental Cordis lifetime seam. The removable
  // carrier must neither own this provider nor return its disposer as an effect.
  // The factory has no Config schema: config already holds native-validated refs.
  const provider = applicationRoot.plugin({
    name: 'mattpocock-native-subagent-provider',
    apply(rootedCtx: Context) {
      let ownedService: OriginalSubagent | undefined
      rootedCtx.on('internal/plugin', fiber => {
        if (fiber.uid === null || fiber.runtime?.callback !== OriginalSubagent) return
        const candidate = (fiber.ctx as Context & { [Entry.key]?: Entry })[Entry.key]
        if (!candidate || candidate.parent.tree !== tree || candidate.parent !== tree.root ||
            candidate.options.id !== 'subagent' || candidate.options.name !== '@deepseek-ai/dsh-subagent' ||
            !plainRootRow(candidate.options as unknown as Record<string, unknown>) ||
            rootedCtx.root !== applicationRoot || fiber.ctx.root !== applicationRoot || tree.context.root !== applicationRoot) return
        // Fresh admission has a bounded complete-map proof. Retention instead
        // proves the exact existing service in this same root; growing unrelated
        // public labels must not allow a second canonical native constructor.
        const retainedService = fiber.ctx.get('subagents') as unknown as { [symbols.original]?: unknown } | undefined
        if (!ownedService || retainedService?.[symbols.original] !== ownedService) return
        const canonicalRows = tree.root.data.filter(row => row.id === 'subagent')
        if (canonicalRows.length !== 1 || canonicalRows[0]?.name !== '@deepseek-ai/dsh-subagent' ||
            !plainRootRow(canonicalRows[0] as unknown as Record<string, unknown>)) return
        // Public publication happens before activation with an assigned disposer.
        // Suppress only a new stock contender; never veto removal of its Entry.
        void fiber.dispose().catch(error => rootedCtx.logger.error(error))
      }, { global: true })
      rootedCtx.effect(() => () => {
        if (rootedCtx.fiber.uid === null && rootedProviders.get(tree) === rootedCtx.fiber) {
          rootedProviders.delete(tree)
        }
      })
      if (assetFailure) rootedCtx.logger.warn('Compatible subagent asset unavailable; retaining ordinary native behavior', assetFailure)
      ownedService = new Native(rootedCtx, config)
    },
  }).ctx.fiber
  rootedProviders.set(tree, provider)
  await provider.await()
}

export default apply
