import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'
import { createImportBindings } from '../scripts/build-compatible-subagent.mjs'

const artifactUrl = new URL('../compatibility/native-subagent-0.2.1-alpha.1.js', import.meta.url)
const provenanceUrl = new URL('../compatibility/native-subagent.provenance.json', import.meta.url)

// Accepted seam: generated provenance describes the actual immutable packaged
// artifact. These tests never import SDK/runtime modules or need a machine path.
test('pinned artifact has a complete ordered canonical-native import literal inventory without changing executable bytes', async () => {
  const bytes = await readFile(artifactUrl)
  const source = bytes.toString('utf8')
  const provenance = JSON.parse(await readFile(provenanceUrl, 'utf8'))
  assert.equal(createHash('sha256').update(bytes).digest('hex'), 'f6197aa3eb84c4f803e2b6517e70b1b62a804bb4e763abec94ebe961dabd77ba')
  assert.equal(bytes.length, 136833)
  const bindings = provenance.transformation.importBindings
  assert.equal(bindings?.id, 'canonical-native-url-v1')
  assert.deepEqual(bindings.sites.map(site => site.specifier), [
    '@deepseek-ai/dsh-subagent', '@deepseek-ai/schemastery', '@deepseek-ai/dsh-scope',
    '@deepseek-ai/dsh-tools', '@deepseek-ai/dsh-util-time', '@deepseek-ai/dsh-typert-protocol',
    '@deepseek-ai/dsh-attachment', 'zod', '@deepseek-ai/dsh-llm', 'node:crypto',
    '@deepseek-ai/dsh-agent', '@deepseek-ai/dsh-session', '@deepseek-ai/dsh-brand',
    '@deepseek-ai/dsh-util-values', '@deepseek-ai/dsh-chunked-list', 'node:fs', 'node:path',
  ])
  let end = 0
  for (const site of bindings.sites) {
    assert.deepEqual(Object.keys(site), ['offset', 'length', 'specifier', 'literal'])
    assert(Number.isSafeInteger(site.offset) && site.offset >= end)
    assert(Number.isSafeInteger(site.length) && site.length > 0)
    assert.equal(site.literal, JSON.stringify(site.specifier))
    assert.equal(source.slice(site.offset, site.offset + site.length), site.literal)
    assert.equal(site.length, site.literal.length)
    end = site.offset + site.length
  }
  assert.deepEqual([...new Set(bindings.sites.map(site => site.specifier))].sort(), provenance.externalImports)
  assert.deepEqual(createImportBindings(source), bindings)
})

test('generator syntax seam records duplicate and multiline imports with UTF-16 literal offsets, not comments or string decoys', () => {
  const source = '// 😀 import "node:fake";\nimport {\n  readFile\n} from "node:fs";\nimport "node:fs";\nconst decoy = \'import("node:ignored") import.meta\';\n'
  assert.deepEqual(createImportBindings(source), { id: 'canonical-native-url-v1', sites: [
    { offset: 53, length: 9, specifier: 'node:fs', literal: '"node:fs"' },
    { offset: 71, length: 9, specifier: 'node:fs', literal: '"node:fs"' },
  ] })
})

for (const [label, addition, diagnostic] of [
  ['unrecorded require import', 'const fs = require("node:fs");', /unrecorded require/],
  ['dynamic literal import', 'const load = () => import("node:fs");', /dynamic import/],
  ['dynamic computed import', 'const load = name => import(name);', /dynamic import/],
  ['import.meta URL', 'const url = import.meta.url;', /import[.]meta/],
  ['import.meta resolver', 'const load = name => import.meta.resolve(name);', /import[.]meta/],
  ['relative import', 'import value from "./relative.js";', /non-host or relative/],
  ['absolute import', 'import value from "/absolute.js";', /non-host or relative/],
  ['URL import', 'import value from "file:///absolute.js";', /non-host or relative/],
  ['unrecorded re-export', 'export { readFile } from "node:fs";', /unrecorded re-export/],
  ['unrecorded export-star', 'export * from "node:fs";', /unrecorded re-export/],
  ['import-equals', 'import fs = require("node:fs");', /unrecorded import/],
  ['import attributes', 'import fs from "node:fs" with { type: "json" };', /unsupported static import/],
  ['single-quoted import', "import fs from 'node:fs';", /JSON-quoted/],
  ['escaped literal', 'import fs from "node:\\u0066s";', /JSON-quoted/],
  ['syntax error', 'import { from "node:fs";', /invalid JavaScript syntax/],
]) {
  test('generator rejects ' + label + ' before emitting an incomplete binding inventory', () => {
    assert.throws(() => createImportBindings('import "node:crypto";\n' + addition), diagnostic)
  })
}

test('generator refuses empty or oversized source and more than 64 static import sites', () => {
  assert.throws(() => createImportBindings(''), /bounded input/)
  assert.throws(() => createImportBindings(' '.repeat(524289)), /bounded input/)
  assert.throws(() => createImportBindings('const noImports = true;'), /no static import/)
  assert.throws(() => createImportBindings('import "node:fs";\n'.repeat(65)), /bounded ordered site/)
})
