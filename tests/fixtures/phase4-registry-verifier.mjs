import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFile, writeFile } from 'node:fs/promises'
import { isAbsolute, resolve, sep } from 'node:path'

export const name = 'dsh-mattpocock-phase4-verifier'
export const inject = ['skills']

// Source-owned expectation, never the installed provider's derived invocation.
const catalog = JSON.parse(await readFile(new URL('../../generated/catalog.json', import.meta.url), 'utf8'))
const providerName = 'dsh-mattpocock-skills'
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex')

function invocationKind(invocation) {
  return invocation.modelInvocable ? 'model-invocable' : invocation.userInvocable ? 'user-only' : 'disabled'
}

function expectedInvocation(row) {
  return { modelInvocable: row.invocation.modelInvocable || row.invocation.userInvocable, userInvocable: row.invocation.userInvocable }
}

function pathLine(lines, label, expected) {
  const matching = lines.map((text, index) => ({ text, index })).filter(({ text }) => text.startsWith(label + ': '))
  assert.equal(matching.length, 1, label + ' must appear once in the adapter prelude')
  const line = matching[0]
  assert.equal(JSON.parse(line.text.slice(label.length + 2)), expected, label + ' must identify the verified source')
  assert.equal(line.text, label + ': ' + JSON.stringify(expected), label + ' must be safely JSON encoded')
  return line.index
}

async function inspectDefinition(summary, definition, row, packageRoot) {
  assert(definition, 'missing lazy definition: ' + row.name)
  assert.equal(definition.name, row.name)
  assert.equal(definition.provider, providerName)
  assert.equal(definition.source, summary.source)
  assert.equal(definition.description, summary.description)
  assert.deepEqual(definition.invocation, expectedInvocation(row), 'effective definition invocation: ' + row.name)
  const sourceFile = resolve(packageRoot, 'vendor/mattpocock-skills', row.skillPath)
  const resourcePath = resolve(packageRoot, 'vendor/mattpocock-skills', row.directory)
  assert.equal(summary.path, sourceFile, 'summary source location: ' + row.name)
  assert.equal(definition.path, sourceFile, 'definition source location: ' + row.name)
  assert.deepEqual(summary.resourceBase, { kind: 'directory', path: resourcePath })
  assert.deepEqual(definition.resourceBase, summary.resourceBase, 'definition resource base: ' + row.name)
  const expectedMetadata = row.metadata === undefined && row.frontmatterExtensions === undefined ? undefined : {
    ...(row.metadata ?? {}), ...(row.frontmatterExtensions === undefined ? {} : { frontmatterExtensions: row.frontmatterExtensions }),
  }
  assert.deepEqual(definition.metadata, expectedMetadata, 'source metadata: ' + row.name)
  const bytes = await readFile(sourceFile)
  assert.equal(hash(bytes), row.sha256, 'cataloged source bytes: ' + row.name)
  const body = new TextDecoder('utf-8', { fatal: true }).decode(bytes.subarray(row.bodyByteOffset))
  assert(body.length > 0, 'empty original body: ' + row.name)
  assert(definition.content.endsWith(body), 'original body must be the exact unchanged suffix: ' + row.name)
  const bodyIndex = definition.content.length - body.length
  assert.equal(definition.content.indexOf(body), bodyIndex, 'original body must appear exactly once: ' + row.name)
  const prelude = definition.content.slice(0, bodyIndex)
  assert(prelude.startsWith('[Matt Pocock Skills adapter]\n'), 'missing adapter prelude: ' + row.name)
  assert(prelude.endsWith('[Original Skill body]\n'), 'missing original body boundary: ' + row.name)
  const lines = prelude.split('\n')
  const invocation = row.invocation
  const sourceInvocation = 'Source invocation: ' + invocationKind(invocation)
    + ' (modelInvocable=' + invocation.modelInvocable + ', userInvocable=' + invocation.userInvocable + ').'
  assert.equal(lines.filter((line) => line.startsWith('Source invocation: ')).length, 1)
  assert(lines.includes(sourceInvocation), 'source invocation prelude: ' + row.name)
  const sourceBodyStartLine = 1 + [...bytes.subarray(0, row.bodyByteOffset)].filter((byte) => byte === 10).length
  assert.equal(lines.filter((line) => line.startsWith('sourceBodyStartLine: ')).length, 1)
  assert(lines.includes('sourceBodyStartLine: ' + sourceBodyStartLine), 'source body line: ' + row.name)
  const fileLine = pathLine(lines, 'sourceFile', sourceFile)
  const resourceLine = pathLine(lines, 'resourceBase', resourcePath)
  assert.match(prelude, /relative resources/i, 'resource resolution guidance: ' + row.name)
  assert.match(prelude, /as needed|on demand/i, 'resource loading guidance: ' + row.name)
  assert.match(prelude, /main body is already returned/i, 'main body availability guidance: ' + row.name)
  assert.match(prelude, /does not require starting or completing the workflow/, 'loading is not execution: ' + row.name)
  assert.match(prelude, /does not expand any operation permissions/, 'permission boundary guidance: ' + row.name)
  if (!invocation.modelInvocable && invocation.userInvocable) {
    assert.match(prelude, /Upstream positions this as a user-led workflow; this adapter permits body access/, 'upstream user-only guidance: ' + row.name)
    assert.match(prelude, /Decide how to use it according to the task and context/, 'advisory use guidance: ' + row.name)
  }
  // Normalize precisely these already validated path lines in the PRELUDE only.
  // No replacement touches the source body, even if it contains path-looking text.
  lines[fileLine] = 'sourceFile: ' + JSON.stringify('<package>/vendor/mattpocock-skills/' + row.skillPath)
  lines[resourceLine] = 'resourceBase: ' + JSON.stringify('<package>/vendor/mattpocock-skills/' + row.directory)
  return {
    name: definition.name, provider: definition.provider, source: definition.source,
    invocation: definition.invocation, sourceInvocation: row.invocation,
    resourceKind: definition.resourceBase.kind, sourceBodyStartLine,
    sourceBodySha256: hash(bytes.subarray(row.bodyByteOffset)),
    normalizedContentSha256: hash(lines.join('\n') + body),
  }
}

/** Inspect every installed definition through an actual booted DSH Skill Registry. */
export async function apply(ctx, config) {
  assert(Object.hasOwn(catalog.channels, config.channel), 'unknown verification channel')
  const rows = catalog.skills.filter((row) => row.channels.includes(config.channel))
  assert.equal(rows.length, 27)
  const sourceInvocationCounts = {
    modelInvocable: rows.filter((row) => row.invocation.modelInvocable).length,
    userOnly: rows.filter((row) => !row.invocation.modelInvocable && row.invocation.userInvocable).length,
  }
  assert.deepEqual(sourceInvocationCounts, { modelInvocable: 11, userOnly: 16 }, 'original source invocation split')
  const summaries = (await ctx.skills.list()).filter((skill) => skill.provider === providerName)
  assert.deepEqual(summaries.map((skill) => skill.name), catalog.channels[config.channel], 'channel membership/order')
  assert.equal(summaries.filter((skill) => skill.invocation.modelInvocable).length, 27, 'effective model-visible count')
  assert.equal(summaries.filter((skill) => skill.invocation.userInvocable).length, 27, 'effective user-invocable count')
  const firstPath = summaries[0].path
  assert(typeof firstPath === 'string' && isAbsolute(firstPath), 'installed source path must be absolute')
  const suffix = sep + ['vendor', 'mattpocock-skills', ...rows[0].skillPath.split('/')].join(sep)
  assert(firstPath.endsWith(suffix), 'installed source path must retain its catalog location')
  const packageRoot = firstPath.slice(0, -suffix.length)
  assert(packageRoot.length > 0 && isAbsolute(packageRoot))
  const definitions = []
  const skills = []
  for (const summary of summaries) {
    const row = rows.find((entry) => entry.name === summary.name)
    assert.deepEqual(summary.invocation, expectedInvocation(row), 'effective summary invocation: ' + row.name)
    if (!row.invocation.modelInvocable && row.invocation.userInvocable) {
      assert(summary.description.endsWith(row.description), 'original description suffix: ' + row.name)
      assert.match(summary.description.slice(0, -row.description.length), /upstream user-only/i)
    } else assert.equal(summary.description, row.description)
    assert.equal(summary.source, 'bundled')
    skills.push({ name: summary.name, descriptionSha256: hash(summary.description), provider: summary.provider,
      source: summary.source, rank: summary.rank, invocation: summary.invocation })
    definitions.push(await inspectDefinition(summary, await ctx.skills.get(summary.name), row, packageRoot))
  }
  await writeFile(config.output, JSON.stringify({
    channel: config.channel, count: summaries.length, modelVisible: 27,
    sourceInvocationCounts, names: summaries.map((skill) => skill.name), skills, definitions,
    definition: definitions.find((definition) => definition.name === 'implement-spec'),
  }, null, 2) + '\n')
}
