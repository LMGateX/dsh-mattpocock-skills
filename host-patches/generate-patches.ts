/** Regenerate reviewable diffs and postimage hashes from the pinned recipe; never touches the SDK. */
import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { isAbsolute, join } from 'node:path'
import type { PatchFile } from './apply-initial-cwd.ts'

const hostRoot = process.env.DSH_CONTROLS_HOST_ROOT
if (hostRoot === undefined || !isAbsolute(hostRoot)) throw new Error('DSH_CONTROLS_HOST_ROOT must identify the read-only exact SDK')
const manifestURL = new URL('./manifest.json', import.meta.url)
const manifest = JSON.parse(await readFile(manifestURL, 'utf8')) as {
  source: (PatchFile & { patchedSha256?: string })[]
  compiled: (PatchFile & { patchedSha256?: string })[]
}
const hash = (text: string): string => createHash('sha256').update(text).digest('hex')
const temp = await mkdtemp(join(tmpdir(), 'dsh-cwd-diffs-'))
try {
  for (const mode of ['source', 'compiled'] as const) {
    let patch = ''
    for (const file of manifest[mode]) {
      let original: string
      if (mode === 'source') {
        original = await readFile(new URL('./source/' + file.path, import.meta.url), 'utf8')
        for (const change of [...file.replacements].reverse()) original = original.replace(change.after, change.before)
      } else original = await readFile(join(hostRoot, file.path), 'utf8')
      if (hash(original) !== file.sha256) throw new Error('original hash mismatch: ' + file.path)
      let patched = original
      for (const change of file.replacements) {
        if (!patched.includes(change.before) || patched.indexOf(change.before) !== patched.lastIndexOf(change.before)) throw new Error('nonunique patch context')
        patched = patched.replace(change.before, change.after)
      }
      file.patchedSha256 = hash(patched)
      const before = join(temp, 'before'), after = join(temp, 'after')
      await writeFile(before, original)
      await writeFile(after, patched)
      const diff = spawnSync('diff', ['-u', '--label', 'a/' + file.path, '--label', 'b/' + file.path, before, after], { encoding: 'utf8' })
      if (diff.status !== 1) throw new Error('diff failed or produced no change: ' + diff.stderr)
      patch += diff.stdout
    }
    await writeFile(new URL('./initial-cwd.' + mode + '.patch', import.meta.url), patch)
  }
  await writeFile(manifestURL, JSON.stringify(manifest, null, 2) + '\n')
} finally { await rm(temp, { recursive: true, force: true }) }
console.log('source and compiled review patches regenerated; original SDK was read-only')
