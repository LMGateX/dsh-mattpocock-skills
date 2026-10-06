/**
 * Bounded public Loader composition for the pinned 0.2.1-alpha.1 topology.
 * These patches are data, not a live service replacement or an SDK disk patch.
 * The original stock row/config remains available to the compatibility bridge.
 *
 * Supported: exactly one ungrouped, unisolated stock row and one compatibility
 * sibling in the same EntryTree root, with the pinned peer resolved from public
 * launch metadata. Unrelated plugins are not blanket-rejected. Arbitrary custom
 * modules which also provide subagents, removed/replaced guards, and alternate
 * resolvers are outside this proof; native duplicate-service refusal still owns
 * those conflicts. Later stock-row boolean overlays remain authoritative.
 */
export const STOCK_SUBAGENT_ID = 'subagent';
export const STOCK_SUBAGENT_NAME = '@deepseek-ai/dsh-subagent';
export const COMPAT_SUBAGENT_ID = 'mattpocock-native-subagent';
export const COMPAT_SUBAGENT_NAME = '@lmgatex/dsh-mattpocock-skills/native-subagent';
// This entire function is serialized. Keep it closed: no module imports, captured
// constants, helper references or registration required before plugin import.
function F(ctx, provider) {
    const entry = ctx[Symbol.for('cordis.entry')];
    const tree = entry?.parent?.tree;
    if (!tree || !Array.isArray(tree.root.data))
        return provider === 'compat';
    const rows = tree.root.data;
    // Scan only public raw group data, never imports or private runtime metadata.
    // A finite budget and cycle check keep this pre-import expression bounded.
    const pending = [rows];
    const visited = new Set();
    let budget = 512;
    while (pending.length) {
        const group = pending.pop();
        if (visited.has(group))
            return provider === 'compat';
        visited.add(group);
        if (group.length > budget)
            return provider === 'compat';
        budget -= group.length;
        for (const row of group) {
            if (!row || typeof row !== 'object')
                return provider === 'compat';
            if (row.name === '@deepseek-ai/dsh-subagent' && (row.id !== 'subagent' || group !== rows) ||
                row.name === '@lmgatex/dsh-mattpocock-skills/native-subagent' && (row.id !== 'mattpocock-native-subagent' || group !== rows))
                return provider === 'compat';
            if (row.group && Array.isArray(row.config))
                pending.push(row.config);
        }
    }
    const stocks = rows.filter(row => row.id === 'subagent');
    const compats = rows.filter(row => row.id === 'mattpocock-native-subagent');
    const stock = stocks[0];
    const compat = compats[0];
    const plain = (row) => row && !row.group && row.isolate === undefined && row.intercept === undefined;
    if (stocks.length !== 1 || compats.length !== 1 || !plain(stock) || !plain(compat) ||
        stock?.name !== '@deepseek-ai/dsh-subagent' || compat?.name !== '@lmgatex/dsh-mattpocock-skills/native-subagent')
        return provider === 'compat';
    const expectedStock = '(' + F.toString() + ')(ctx,"stock")';
    if (typeof stock.disabled === 'boolean')
        return provider === 'compat';
    if (stock.disabled?.__jsExpr !== expectedStock)
        return provider === 'compat';
    const key = Symbol.for('@lmgatex/dsh-mattpocock-skills/subagent-composition-v1');
    const processState = globalThis;
    let choices = processState[key];
    if (!choices) {
        choices = new WeakMap();
        Object.defineProperty(processState, key, { value: choices });
    }
    let choice = choices.get(tree);
    if (!choice) {
        const service = tree.context.get('subagents');
        const stockFiber = tree.store['subagent']?.fiber;
        const compatFiber = tree.store['mattpocock-native-subagent']?.fiber;
        if (stockFiber && stockFiber.uid !== null)
            choice = 'stock';
        else if (compatFiber && compatFiber.uid !== null)
            choice = 'compat';
        else if (service)
            choice = 'blocked';
        else {
            // Unknown installation/resolution stays on the stock service. A wrapper
            // must never discover incompatibility only after the stock row is off.
            choice = 'stock';
            try {
                // Root-owned lifetime is admitted only in the same public service realm.
                // This is a fresh-start gate: ACTIVE/PENDING owners were handled above.
                const root = ctx.root;
                if (!root || tree.context.root !== root)
                    throw new Error('unknown or different application root context');
                for (const context of [ctx, tree.context]) {
                    for (const symbol of [Symbol.for('cordis.isolate'), Symbol.for('cordis.intercept')]) {
                        const scoped = context[symbol], rooted = root[symbol];
                        if (!scoped || !rooted || typeof scoped !== 'object' || typeof rooted !== 'object' ||
                            Array.isArray(scoped) || Array.isArray(rooted))
                            throw new Error('unknown public root scope maps');
                        const keys = new Set();
                        for (const key in scoped) {
                            keys.add(key);
                            if (keys.size > 512)
                                throw new Error('public root scope exceeds bounded inspection');
                        }
                        for (const key in rooted) {
                            keys.add(key);
                            if (keys.size > 512)
                                throw new Error('public root scope exceeds bounded inspection');
                        }
                        for (const key of keys) {
                            if (scoped[key] !== rooted[key]) {
                                throw new Error('root provider would escape the native service realm');
                            }
                        }
                    }
                }
                const profile = tree.context.get('profileContext');
                if (typeof process.getBuiltinModule !== 'function' || typeof profile?.installAnchor !== 'string' ||
                    typeof profile.dir !== 'string' || typeof tree.context.baseUrl !== 'string')
                    throw new Error('unknown launch metadata');
                const fs = process.getBuiltinModule('node:fs');
                const module = process.getBuiltinModule('node:module');
                const path = process.getBuiltinModule('node:path');
                const crypto = process.getBuiltinModule('node:crypto');
                if (!path.isAbsolute(profile.installAnchor) || !path.isAbsolute(profile.dir))
                    throw new Error('unknown anchor');
                const read = (filename, limit) => {
                    const stat = fs.statSync(filename);
                    if (!stat.isFile() || stat.size > limit)
                        throw new Error('source size is outside the bounded gate');
                    return fs.readFileSync(filename);
                };
                const app = JSON.parse(read(profile.installAnchor, 65536).toString('utf8'));
                if (app.name !== '@deepseek-ai/dsh' || app.version !== '0.2.1-alpha.1')
                    throw new Error('unknown SDK');
                const base = new URL('package.json', tree.context.baseUrl);
                if (base.protocol !== 'file:')
                    throw new Error('unknown base URL');
                const installation = module.createRequire(profile.installAnchor);
                let nativeRequire = module.createRequire(base);
                let filename;
                try {
                    filename = nativeRequire.resolve('@deepseek-ai/dsh-subagent');
                }
                catch (error) {
                    if (error.code !== 'MODULE_NOT_FOUND')
                        throw error;
                    nativeRequire = installation;
                    filename = nativeRequire.resolve('@deepseek-ai/dsh-subagent');
                }
                // A profile-local package must agree with the actual entry base; never
                // silently select an installation peer over a differing local provider.
                try {
                    const local = module.createRequire(path.join(profile.dir, 'package.json')).resolve('@deepseek-ai/dsh-subagent');
                    if (fs.realpathSync(local) !== fs.realpathSync(filename))
                        throw new Error('ambiguous profile resolution');
                }
                catch (error) {
                    if (error.code !== 'MODULE_NOT_FOUND')
                        throw error;
                }
                const manifestPath = nativeRequire.resolve('@deepseek-ai/dsh-subagent/package.json');
                const manifest = JSON.parse(read(manifestPath, 65536).toString('utf8'));
                const publicNative = manifest.exports?.['.'];
                const nativeExportPath = typeof publicNative === 'string' ? publicNative : publicNative?.default;
                if (nativeExportPath !== './lib/index.js' || typeof publicNative === 'object' &&
                    Object.keys(publicNative).some(key => key !== 'types' && key !== 'default'))
                    throw new Error('unknown native public export conditions');
                if (manifest.name !== '@deepseek-ai/dsh-subagent' || manifest.version !== '0.2.1-alpha.1' ||
                    fs.realpathSync(filename) !== fs.realpathSync(path.join(path.dirname(manifestPath), 'lib/index.js')))
                    throw new Error('unknown native peer');
                // Resolve the public wrapper exactly as the Loader's ordinary local
                // resolver does. Its own imports must share this canonical native peer,
                // not merely another copy with matching version and pristine bytes.
                let wrapperRequire = module.createRequire(base);
                let wrapper;
                try {
                    wrapper = wrapperRequire.resolve('@lmgatex/dsh-mattpocock-skills/native-subagent');
                }
                catch (error) {
                    if (error.code !== 'MODULE_NOT_FOUND')
                        throw error;
                    wrapperRequire = installation;
                    wrapper = wrapperRequire.resolve('@lmgatex/dsh-mattpocock-skills/native-subagent');
                }
                const pluginManifestPath = wrapperRequire.resolve('@lmgatex/dsh-mattpocock-skills/package.json');
                const pluginManifest = JSON.parse(read(pluginManifestPath, 65536).toString('utf8'));
                const exported = pluginManifest.exports?.['./native-subagent'];
                const exportPath = typeof exported === 'string' ? exported : exported?.default;
                if (typeof exported === 'object' && Object.keys(exported).some(key => key !== 'types' && key !== 'default')) {
                    throw new Error('unknown wrapper public export conditions');
                }
                const pluginRoot = fs.realpathSync(path.dirname(pluginManifestPath));
                const wrapperPath = fs.realpathSync(wrapper);
                if (pluginManifest.name !== '@lmgatex/dsh-mattpocock-skills' || exportPath !== './lib/compatibility/native-subagent.js' ||
                    wrapperPath !== fs.realpathSync(path.join(pluginRoot, 'lib/compatibility/native-subagent.js')) ||
                    read(wrapperPath, 65536).length === 0)
                    throw new Error('unknown compatibility wrapper export');
                try {
                    const localWrapper = module.createRequire(path.join(profile.dir, 'package.json')).resolve('@lmgatex/dsh-mattpocock-skills/native-subagent');
                    if (fs.realpathSync(localWrapper) !== wrapperPath)
                        throw new Error('ambiguous profile wrapper resolution');
                }
                catch (error) {
                    if (error.code !== 'MODULE_NOT_FOUND')
                        throw error;
                }
                const ownWrapper = module.createRequire(wrapperPath);
                if (fs.realpathSync(ownWrapper.resolve('@deepseek-ai/dsh-subagent')) !== fs.realpathSync(filename)) {
                    throw new Error('wrapper resolves a different native peer');
                }
                const artifactPath = fs.realpathSync(path.join(pluginRoot, 'compatibility/native-subagent-0.2.1-alpha.1.js'));
                const artifactRelative = path.relative(pluginRoot, artifactPath);
                if (artifactRelative === '..' || artifactRelative.startsWith('..' + path.sep) || path.isAbsolute(artifactRelative)) {
                    throw new Error('compatibility artifact is outside its package');
                }
                const ownArtifact = module.createRequire(artifactPath);
                const nativePeers = module.createRequire(fs.realpathSync(filename));
                // These are the pinned generated artifact's direct external imports.
                // Identity, not version equality, keeps native errors, schemas, scope,
                // Agent/Session and Remote lifecycle namespaces on the same module graph.
                const peers = ['@deepseek-ai/dsh-subagent', '@deepseek-ai/schemastery', '@deepseek-ai/dsh-scope',
                    '@deepseek-ai/dsh-tools', '@deepseek-ai/dsh-util-time', '@deepseek-ai/dsh-typert-protocol',
                    '@deepseek-ai/dsh-attachment', 'zod', '@deepseek-ai/dsh-llm', '@deepseek-ai/dsh-agent',
                    '@deepseek-ai/dsh-session', '@deepseek-ai/dsh-brand', '@deepseek-ai/dsh-util-values', '@deepseek-ai/dsh-chunked-list'];
                for (const peer of peers) {
                    const canonicalPeer = fs.realpathSync(nativePeers.resolve(peer));
                    const canonicalPackage = fs.realpathSync(nativePeers.resolve(peer + '/package.json'));
                    if (fs.realpathSync(ownWrapper.resolve(peer)) !== canonicalPeer || fs.realpathSync(ownArtifact.resolve(peer)) !== canonicalPeer ||
                        fs.realpathSync(ownWrapper.resolve(peer + '/package.json')) !== canonicalPackage ||
                        fs.realpathSync(ownArtifact.resolve(peer + '/package.json')) !== canonicalPackage) {
                        throw new Error('compatibility imports a different shared native peer');
                    }
                }
                if (fs.realpathSync(ownWrapper.resolve('@deepseek-ai/cordis')) !== fs.realpathSync(nativePeers.resolve('@deepseek-ai/cordis')) ||
                    fs.realpathSync(ownWrapper.resolve('@deepseek-ai/cordis/package.json')) !== fs.realpathSync(nativePeers.resolve('@deepseek-ai/cordis/package.json')) ||
                    fs.realpathSync(ownWrapper.resolve('@deepseek-ai/cordis-plugin-loader')) !== fs.realpathSync(installation.resolve('@deepseek-ai/cordis-plugin-loader')) ||
                    fs.realpathSync(ownWrapper.resolve('@deepseek-ai/cordis-plugin-loader/package.json')) !== fs.realpathSync(installation.resolve('@deepseek-ai/cordis-plugin-loader/package.json'))) {
                    throw new Error('compatibility wrapper imports a different public context or loader');
                }
                const digest = crypto.createHash('sha256').update(read(filename, 524288)).digest('hex');
                if (digest === '75b50b1c9452a6aeb10d1c859e3f45b05e062ea1fad6ed3bcd9577f2bc912541')
                    choice = 'compat';
                // An already supported pinned native image remains the preferred stock
                // provider; other digests are unknown, not an excuse to replace it.
            }
            catch {
                choice = 'stock';
            }
        }
        choices.set(tree, choice);
    }
    return choice === 'blocked' || provider !== choice;
}
export function createCompatibilityCompositionExpressions() {
    const expression = (provider) => ({ __jsExpr: '(' + F.toString() + ')(ctx,' + JSON.stringify(provider) + ')' });
    return { stock: expression('stock'), compat: expression('compat') };
}
export function createCompatibilityCompositionPatches() {
    const expressions = createCompatibilityCompositionExpressions();
    return [
        { id: STOCK_SUBAGENT_ID, name: STOCK_SUBAGENT_NAME, disabled: expressions.stock },
        { insert: [{ id: COMPAT_SUBAGENT_ID, name: COMPAT_SUBAGENT_NAME, disabled: expressions.compat }] },
    ];
}
