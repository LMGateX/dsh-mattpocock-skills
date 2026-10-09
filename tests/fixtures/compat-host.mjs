import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { createRequire } from 'node:module'
import { rmSync } from 'node:fs'
import { mkdir, mkdtemp, readdir, readFile, realpath, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, isAbsolute, join } from 'node:path'

// Released bridge evidence is pinned to the 0.2.1-alpha.1 native subagent entry.
// Tests that exercise the compatibility bridge read it through
// DSH_CONTROLS_COMPAT_HOST_ROOT, never through the canonical host root.
export const ALPHA1_NATIVE_SHA256 = '75b50b1c9452a6aeb10d1c859e3f45b05e062ea1fad6ed3bcd9577f2bc912541'

export async function nativeEntrySha256(root) {
  assert(isAbsolute(root), 'a host root must be an absolute directory')
  const require = createRequire(join(root, 'package.json'))
  return createHash('sha256').update(await readFile(require.resolve('@deepseek-ai/dsh-subagent'))).digest('hex')
}

// `npm install --install-strategy=nested @deepseek-ai/dsh@0.2.1-alpha.1 <prefix>` keeps
// the CLI's transitive closure under whichever package owns each dependency instead
// of hoisting every @deepseek-ai peer to the prefix root. The bridge fixtures need the
// alpha.1 closure resolvable from one root, so this builds a private read-only view:
// every package found in the installed prefix is linked into a fresh scratch tree at
// its Node-visible name. All links point back into the untouched prefix; the pinned
// bytes keep their identity and no installed file is written.
export async function openCompatHostView(root) {
  assert(isAbsolute(root), 'DSH_CONTROLS_COMPAT_HOST_ROOT must be an absolute directory')
  const view = await mkdtemp(join(tmpdir(), 'dsh-compat-host-view-'))
  process.once('exit', () => { try { rmSync(view, { recursive: true, force: true }) } catch { /* scratch cleanup is best effort */ } })
  await mkdir(join(view, 'node_modules'), { recursive: true })
  await writeFile(join(view, 'package.json'), await readFile(join(root, 'package.json')))
  const linked = new Set()
  const link = async (name, target) => {
    if (linked.has(name)) return
    linked.add(name)
    const destination = join(view, 'node_modules', name)
    await mkdir(dirname(destination), { recursive: true })
    await symlink(target, destination)
  }
  const visited = new Set()
  const pending = [join(root, 'node_modules')]
  while (pending.length > 0) {
    const nodeModules = pending.shift()
    const real = await realpath(nodeModules).catch(() => undefined)
    if (real === undefined || visited.has(real)) continue
    visited.add(real)
    let entries
    try { entries = await readdir(nodeModules, { withFileTypes: true }) } catch { continue }
    for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
      if (entry.name.startsWith('.') || (!entry.isDirectory() && !entry.isSymbolicLink())) continue
      const discovered = []
      if (entry.name.startsWith('@')) {
        let children
        try { children = await readdir(join(nodeModules, entry.name)) } catch { continue }
        for (const child of children.sort()) discovered.push([entry.name + '/' + child, join(nodeModules, entry.name, child)])
      } else discovered.push([entry.name, join(nodeModules, entry.name)])
      for (const [name, target] of discovered) {
        await link(name, target)
        pending.push(join(target, 'node_modules'))
      }
    }
  }
  return view
}
