/** Offline, hash-bound patching of an explicitly marked independent source/SDK copy. */
import { createHash } from 'node:crypto'
import { lstat, readFile, realpath, writeFile } from 'node:fs/promises'
import { isAbsolute, join, relative, sep } from 'node:path'
import { pathToFileURL } from 'node:url'

export interface PatchOptions {
  readonly targetRoot: string
  readonly mode: 'source' | 'compiled'
  readonly check?: boolean
}
interface Replacement { readonly before: string; readonly after: string }
export interface PatchFile {
  readonly path: string
  readonly sha256: string
  readonly patchedSha256: string
  readonly replacements: readonly Replacement[]
}
const hash = (text: string): string => createHash('sha256').update(text).digest('hex')

export async function applyInitialCwdPatch(options: PatchOptions): Promise<readonly string[]> {
  if (!isAbsolute(options.targetRoot)) throw new Error('targetRoot must be absolute')
  const root = await realpath(options.targetRoot)
  if (await readFile(join(root, '.dsh-cwd-patch-target'), 'utf8') !== 'isolated-cwd-patch-target\n') {
    throw new Error('target must explicitly identify an isolated patch copy')
  }
  const manifest = JSON.parse(await readFile(new URL('./manifest.json', import.meta.url), 'utf8')) as Record<'source' | 'compiled', readonly PatchFile[]>
  const files = manifest[options.mode]
  if (!Array.isArray(files)) throw new Error('unknown patch mode')
  const prepared: { path: string; text: string }[] = []
  for (const file of files) {
    const path = join(root, file.path)
    const resolved = await realpath(path)
    const inside = relative(root, resolved)
    if (inside === '..' || inside.startsWith('..' + sep) || isAbsolute(inside) || !(await lstat(path)).isFile()) {
      throw new Error('refuse symlink or file outside independent target: ' + file.path)
    }
    const original = await readFile(path, 'utf8')
    if (hash(original) !== file.sha256) throw new Error('baseline SHA-256 mismatch: ' + file.path)
    let text = original
    for (const replacement of file.replacements) {
      if (!text.includes(replacement.before) || text.indexOf(replacement.before) !== text.lastIndexOf(replacement.before)) {
        throw new Error('patch context is not unique: ' + file.path)
      }
      text = text.replace(replacement.before, replacement.after)
    }
    if (hash(text) !== file.patchedSha256) throw new Error('postimage SHA-256 mismatch: ' + file.path)
    prepared.push({ path, text })
  }
  // Validate every hash/context before writing any file. Not a deployment/transaction manager.
  if (!options.check) for (const file of prepared) await writeFile(file.path, file.text)
  return prepared.map(file => file.path)
}

if (process.argv[1] !== undefined && pathToFileURL(process.argv[1]).href === import.meta.url) {
  const [mode, targetRoot, flag] = process.argv.slice(2)
  if ((mode !== 'source' && mode !== 'compiled') || targetRoot === undefined || (flag !== undefined && flag !== '--check')) {
    throw new Error('usage: node apply-initial-cwd.ts source|compiled /absolute/independent-copy [--check]')
  }
  console.log(JSON.stringify(await applyInitialCwdPatch({ mode, targetRoot, ...(flag === '--check' ? { check: true } : {}) })))
}
