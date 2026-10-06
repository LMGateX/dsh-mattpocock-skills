import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile, lstat } from 'node:fs/promises'
const root = new URL('../', import.meta.url)
test('bundled cwd setup command is executable and does not need install lifecycle scripts', async () => {
  const pkg = JSON.parse(await readFile(new URL('package.json', root), 'utf8'))
  assert.deepEqual(pkg.bin, {'dsh-mattpocock-skills-cwd':'./lib/compatibility/cli.js'})
  assert.equal(pkg.scripts, undefined)
  assert.ok(pkg.files.includes('compatibility/initial-cwd.recipe.json'))
  const cli = new URL(pkg.bin['dsh-mattpocock-skills-cwd'], root)
  assert.ok((await lstat(cli)).mode & 0o111, 'packed command must execute directly')
  assert.ok((await readFile(cli, 'utf8')).startsWith('#!/usr/bin/env node'))
})
