#!/usr/bin/env node
/** Developer-only generation. Never import/boot the SDK or modify its files. */
import { createHash } from 'node:crypto'
import { constants } from 'node:fs'
import { lstat, open, readFile, realpath } from 'node:fs/promises'
import { dirname, isAbsolute, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'

const version = '0.2.1-alpha.1'
const owner = '@lmgatex/dsh-mattpocock-skills'
const recipeId = 'initial-cwd-dsh-0.2.1-alpha.1-v1'
const recipeDigest = 'd37a15a5712b62af03a150b6ef44e906f3dc26aa06924818b53dd5a08158f22d'
const recipeFileDigest = '73c68247d58115f77f29bf85bba9a65db51e00bab0609f78fd1eb09b572a3b74'
const originalDigest = '75b50b1c9452a6aeb10d1c859e3f45b05e062ea1fad6ed3bcd9577f2bc912541'
const patchedDigest = '2ab17b8ee4f1a2d88a91fcc011391a271188dad4b479d571132bf8d71e4a534d'
const licenseDigest = 'ebb4f09972aee8608be255debaf78451a68e95c290f55c240dec2ecfa16ea6be'
const bundlePath = 'node_modules/@deepseek-ai/dsh-subagent/lib/index.js'
const artifactPath = 'compatibility/native-subagent-0.2.1-alpha.1.js'
const provenancePath = 'compatibility/native-subagent.provenance.json'
const originKey = '@lmgatex/dsh-mattpocock-skills/compatible-subagent-origin'
const originValue = 'native-subagent-0.2.1-alpha.1'
const hash = bytes => createHash('sha256').update(bytes).digest('hex')
const assert = (condition, message) => { if (!condition) throw new Error(message) }
const repoRoot = fileURLToPath(new URL('../', import.meta.url))

function replaceOnce(text, before, after, label) {
  const index = text.indexOf(before)
  assert(index !== -1 && text.indexOf(before, index + before.length) === -1, label + ': expected exactly one literal context')
  return text.slice(0, index) + after + text.slice(index + before.length)
}

async function readCanonical(root, relative) {
  const target = resolve(root, relative)
  assert(target.startsWith(root + '/') && await realpath(target) === target, 'Input must be a canonical file beneath its declared root: ' + relative)
  assert((await lstat(target)).isFile(), 'Input must be a regular file: ' + relative)
  return readFile(target)
}

function verifyPackage(value, name) {
  assert(value.name === name && value.version === version && value.type === 'module' && value.license === 'MIT', 'Pinned SDK package identity/version/type/license mismatch: ' + name)
  assert(value.repository?.url === 'git+https://github.com/deepseek-ai/deepseek-harness.git', 'Pinned SDK repository mismatch: ' + name)
}

// Entire definitions, not regex class-boundary guesses; inputs are hash-pinned too.
const errorTransforms = [
  {
    name: 'share-public-SubagentError',
    before: 'var SubagentError = class extends HarnessError {\n\tconstructor(message, code, options) {\n\t\tsuper(message, code, options);\n\t\tthis.name = "SubagentError";\n\t}\n};',
    after: 'const SubagentError = NativeSubagentError;',
  },
  {
    name: 'share-public-SubagentDepthError',
    before: "var SubagentDepthError = class extends Error {\n\tattemptedDepth;\n\tmaxDepth;\n\tconstructor(attemptedDepth, maxDepth) {\n\t\tsuper(`subagent depth ${attemptedDepth} exceeds maxDepth ${maxDepth}`);\n\t\tthis.attemptedDepth = attemptedDepth;\n\t\tthis.maxDepth = maxDepth;\n\t\tthis.name = \"SubagentDepthError\";\n\t}\n};",
    after: 'const SubagentDepthError = NativeSubagentDepthError;',
  },
]

async function main() {
  const { values } = parseArgs({ options: { 'host-root': { type: 'string' }, check: { type: 'boolean', default: false } }, strict: true, allowPositionals: false })
  assert(typeof values['host-root'] === 'string' && isAbsolute(values['host-root']), 'Developer-only usage: node scripts/build-compatible-subagent.mjs --host-root /absolute/sdk [--check]')
  const hostRoot = resolve(values['host-root'])
  assert(await realpath(hostRoot) === hostRoot && (await lstat(hostRoot)).isDirectory(), 'Host root must be a canonical SDK directory')
  assert(await realpath(repoRoot) === resolve(repoRoot), 'Generator repository must be canonical')
  const root = resolve(repoRoot)
  const pluginPackage = JSON.parse(await readCanonical(root, 'package.json'))
  assert(pluginPackage.name === owner && pluginPackage.type === 'module', 'Generator is not in the expected plugin repository')
  verifyPackage(JSON.parse(await readCanonical(hostRoot, 'package.json')), '@deepseek-ai/dsh')
  const subagentPackage = JSON.parse(await readCanonical(hostRoot, 'node_modules/@deepseek-ai/dsh-subagent/package.json'))
  verifyPackage(subagentPackage, '@deepseek-ai/dsh-subagent')
  assert(subagentPackage.main === 'lib/index.js' && subagentPackage.exports?.['.']?.default === './lib/index.js', 'Pinned public subagent entry mismatch')
  const recipeBytes = await readCanonical(root, 'compatibility/initial-cwd.recipe.json')
  assert(hash(recipeBytes) === recipeFileDigest, 'Recipe file integrity mismatch')
  const recipe = JSON.parse(recipeBytes)
  const { manifestSha256, ...recipeBody } = recipe
  assert(manifestSha256 === recipeDigest && hash(JSON.stringify(recipeBody)) === recipeDigest, 'Recipe manifest integrity mismatch')
  assert(recipe.recipeId === recipeId && recipe.sdkName === '@deepseek-ai/dsh' && recipe.sdkVersion === version, 'Recipe identity mismatch')
  const entry = recipe.files.find(file => file.path === bundlePath)
  assert(entry?.sha256 === originalDigest && entry.patchedSha256 === patchedDigest && entry.replacements.length === 4, 'Reviewed four-substitution recipe mismatch')
  const inputs = new Map()
  // Validate all five reviewed recipe preimages and postimages before any effects.
  for (const file of recipe.files) {
    const bytes = await readCanonical(hostRoot, file.path)
    assert(hash(bytes) === file.sha256, 'SDK code integrity mismatch: ' + file.path)
    let patched = bytes.toString('utf8')
    for (const change of file.replacements) patched = replaceOnce(patched, change.before, change.after, file.path)
    assert(hash(patched) === file.patchedSha256, 'Recipe postimage mismatch: ' + file.path)
    inputs.set(file.path, { bytes, patched })
  }
  const licenseBytes = await readCanonical(hostRoot, 'node_modules/@deepseek-ai/dsh-subagent/LICENSE')
  assert(hash(licenseBytes) === licenseDigest, 'Pinned MIT license integrity mismatch')
  const { bytes: original, patched } = inputs.get(bundlePath)
  const publicExports = original.toString('utf8').split('\n').find(line => line.startsWith('export { '))
  assert(publicExports?.includes('SubagentError,') && publicExports.includes('SubagentDepthError,'), 'Shared errors must be verified public exports')
  let transformed = patched
  for (const change of errorTransforms) transformed = replaceOnce(transformed, change.before, change.after, change.name)
  const imports = 'import { SubagentError as NativeSubagentError, SubagentDepthError as NativeSubagentDepthError } from "@deepseek-ai/dsh-subagent";\n'
  const notice = '/*!\n' + licenseBytes.toString('utf8').trimEnd() + '\n*/\n'
  const header = '// Generated by scripts/build-compatible-subagent.mjs; development-only, not an integration receipt.\n'
  const tag = '\n// Plugin-owned origin only; initialCwdSupported still checks the real native manager.\nObject.defineProperty(SubagentRuntime.prototype, Symbol.for(' + JSON.stringify(originKey) + '), {\n\tget() { return ' + JSON.stringify(originValue) + '; }\n});\n'
  const output = notice + header + imports + transformed + tag
  const externalImports = [...new Set([...output.matchAll(/^import .* from ["']([^"']+)["'];$/gm)].map(match => match[1]))].sort()
  assert(externalImports.every(name => name.startsWith('@deepseek-ai/') || name.startsWith('node:') || name === 'zod'), 'Unexpected non-host or relative import')
  // These entire native regions must not change beyond the reviewed cwd recipe.
  const region = (text, name) => text.slice(text.indexOf('//#region lib/types/' + name + '.js'), text.indexOf('//#endregion', text.indexOf('//#region lib/types/' + name + '.js')))
  for (const name of ['continuation-activation', 'continuation']) assert(region(output, name) === region(patched, name), 'Native manager/activation implementation changed: ' + name)
  const provenance = {
    schemaVersion: 1,
    owner,
    status: 'plugin-integrated',
    upstream: recipe.upstream,
    sdk: { name: recipe.sdkName, version },
    source: { package: subagentPackage.name, version, publicEntry: 'lib/index.js', originalSha256: hash(original), patchedSha256: hash(patched) },
    recipe: { id: recipeId, manifestSha256: recipeDigest, fileSha256: hash(recipeBytes), substitutions: entry.replacements.length },
    transformation: { id: 'native-subagent-public-errors-origin-mit-v1', sharedPublicErrors: ['SubagentError', 'SubagentDepthError'], replacements: errorTransforms.map(({ name, before, after }) => ({ name, beforeSha256: hash(before), afterSha256: hash(after) })), transformedBodySha256: hash(transformed), origin: { symbol: originKey, value: originValue, readOnly: true, capability: false }, preservedRegions: ['continuation-activation', 'continuation'] },
    artifact: { path: artifactPath, sha256: hash(output), bytes: Buffer.byteLength(output) },
    externalImports,
    license: { spdx: 'MIT', copyright: 'Copyright (c) 2026 DeepSeek', source: '@deepseek-ai/dsh-subagent/LICENSE', sha256: hash(licenseBytes), fullNoticeEmbeddedInArtifact: true },
  }
  const outputs = [[artifactPath, Buffer.from(output)], [provenancePath, Buffer.from(JSON.stringify(provenance, null, 2) + '\n')]]
  // Inspect existing bytes and all output paths before writing either artifact.
  const inspected = []
  for (const [relative, bytes] of outputs) {
    const path = resolve(root, relative)
    assert(await realpath(dirname(path)) === dirname(path), 'Output directory must be canonical')
    let existing = null
    try {
      assert((await lstat(path)).isFile() && await realpath(path) === path, 'Output must be a regular non-symlink file: ' + relative)
      existing = await readFile(path)
    } catch (error) { if (error.code !== 'ENOENT') throw error }
    if (values.check) assert(existing?.equals(bytes), 'Generated bytes differ or are missing: ' + relative)
    inspected.push({ path, bytes, existing })
  }
  if (!values.check) for (const { path, bytes, existing } of inspected) {
    if (existing?.equals(bytes)) continue
    const flags = constants.O_WRONLY | constants.O_NOFOLLOW | (existing === null ? constants.O_CREAT | constants.O_EXCL : 0)
    const handle = await open(path, flags, 0o644)
    try { await handle.truncate(0); await handle.writeFile(bytes) } finally { await handle.close() }
  }
  console.log(JSON.stringify({ check: values.check, artifactSha256: hash(output), artifactBytes: Buffer.byteLength(output), provenanceSha256: hash(outputs[1][1]), externalImports }))
}

main().catch(error => { console.error(error.message); process.exitCode = 1 })
