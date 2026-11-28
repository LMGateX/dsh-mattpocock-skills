import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { isAbsolute, join } from 'node:path'
import { test } from 'node:test'
import { pathToFileURL } from 'node:url'
import { stripSilentPtcSdk } from '../src/silent-ptc-sdk.ts'

const owned = [
  'mattpocock_assign', 'mattpocock_audit', 'mattpocock_controls', 'mattpocock_delegate',
  'mattpocock_history', 'mattpocock_record', 'mattpocock_resource', 'mattpocock_window', 'mattpocock_worktree',
]

test('unknown SDK layouts retain definite old declarations and report unsupported', () => {
  for (const text of [
    'interface ToolOutputMap { mattpocock_record: string; }',
    'interface ToolArgsMap\r\n{\r\n  readonly "mattpocock_audit"?: string\r\n}',
    "type ToolArgsMap = { native_run: string, 'mattpocock_delegate': unknown }",
    'declare const tools: { mattpocock_history(): string; native_run(): void }',
    'declare const tools: { native_run: (x: string) => Promise<unknown>; mattpocock_resource: () => string; }',
    '```typescript\ninterface ToolArgsMap { mattpocock_assign: unknown }\n```',
  ]) assert.deepEqual(stripSilentPtcSdk(text), { status: 'unsupported', text })
})

test('prose, comments, literals, nested members, near names and retired tools are not declarations', () => {
  for (const text of [
    'Do not call tools.mattpocock_record, or use mattpocock_delegate: unknown in an example.',
    '/* interface ToolArgsMap { mattpocock_record: string; } */',
    'type Reminder = "interface ToolArgsMap { mattpocock_record: string; }"',
    'interface ToolArgsMap { native_run: { mattpocock_record: string; }; }',
    'interface ThirdParty { mattpocock_record: string; }',
    'interface ToolOutputMap { mattpocock_recording: string; mattpocock_execute: unknown; }',
  ]) assert.deepEqual(stripSilentPtcSdk(text), { status: 'unchanged', text })
})

const hostRoot = process.env.DSH_CONTROLS_HOST_ROOT
test('exact alpha.3 renderer: paired projection is identical to rendering with only unrelated tools', {
  skip: !hostRoot && 'set DSH_CONTROLS_HOST_ROOT to the exact installed alpha.3 Host',
}, async () => {
  assert(isAbsolute(hostRoot))
  const requireHost = createRequire(pathToFileURL(join(hostRoot, 'package.json')))
  const packageName = '@deepseek-ai/dsh-tool-registry-ptc'
  assert.equal(requireHost(`${packageName}/package.json`).version, '0.2.3-alpha.3')
  const { renderToolsSdk } = await import(pathToFileURL(requireHost.resolve(packageName)).href)

  const request = { type: 'object', properties: { request: {} }, required: ['request'] }
  const tool = (name, parameters = request, output = {}, description = `Documentation for ${name}`) => ({ name, parameters, output, description })
  const nested = { type: 'object', properties: {
    mattpocock_record: { type: 'string', description: 'Keep this nested data key and */ text.' },
    'symbols :};': { type: 'array', items: { oneOf: [
      { type: 'string', enum: ['literal mattpocock_record: unknown;', '\n};', '\u2028literal', '*/', '\"'] },
      { type: 'object', properties: { inside: { type: 'boolean' } }, additionalProperties: false },
    ] } },
  } }
  const other = [
    tool('bash', { type: 'object', properties: { command: { type: 'string' }, description: { type: 'string' } }, required: ['command', 'description'] }),
    tool('a-third-party'),
    tool('cua'),
    tool('mattpocock_audit-extra', nested, nested, 'References mattpocock_audit and mattpocock_record: unknown; must remain verbatim. */'),
    tool('mattpocock_delegate\n}\ninterface ToolOutputMap {'),
    tool('mattpocock_execute'),
    tool('mattpocock_recording'),
    tool('quoted\"\\\u2028tool'),
    tool('read_image'),
    tool('工具'),
  ]
  const collaboration = owned.map(name => tool(name)).reverse()
  for (const format of ['function-body', 'repl', 'script', 'scoped-repl']) {
    for (const remaining of [other, other.filter(({ name }) => name !== 'bash'), []]) {
      for (const removed of [collaboration, [collaboration[0]]]) {
        const text = renderToolsSdk([...remaining, ...removed], format)
        const expected = renderToolsSdk(remaining, format)
        assert.deepEqual(stripSilentPtcSdk(text), { status: 'stripped', text: expected })
        assert.deepEqual(stripSilentPtcSdk(expected), { status: 'unchanged', text: expected })
      }
    }
  }

  const text = renderToolsSdk([tool('mattpocock_record'), tool('native_run')])
  for (const changed of [
    text.replace('  mattpocock_record: JsonValue;\n', ''), // a declaration exists in just one map
    text.replace('  mattpocock_record: JsonValue;', '  mattpocock_record: JsonValue;\n  mattpocock_record: JsonValue;'),
    text.replace('  mattpocock_record: JsonValue;', '  "mattpocock_record": JsonValue;'), // not alpha.2 spelling
    text.replace('interface ToolOutputMap {', 'interface ToolOutputMap\n{'),
    text.replaceAll('\n', '\r\n'),
  ]) assert.deepEqual(stripSilentPtcSdk(changed), { status: 'unsupported', text: changed })
})
