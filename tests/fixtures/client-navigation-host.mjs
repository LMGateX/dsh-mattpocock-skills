import assert from 'node:assert/strict'
import vm from 'node:vm'
import { readFile, readdir } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { createHash } from 'node:crypto'
import * as React from 'react'
import { Window } from 'happy-dom'
import { buildClient } from '../../scripts/build-client.mjs'
import { PRIMITIVES_ID, clientPrimitives } from './client-primitives.mjs'

// Explicit read-only host. Never substitute an object ctx, patch compiled strings,
// deep-import private constructors, start a server, connect, or read real Sessions.
export const hostRoot = process.env.DSH_NAVIGATION_HOST_ROOT
if (!hostRoot) throw new Error('DSH_NAVIGATION_HOST_ROOT is required; no fake native fallback')
export const window = new Window({ url: 'http://navigation-fixture.test/' })
window.document.write('<!doctype html><html><head></head><body><div id="root"></div></body></html>')
const previous = new Map()
for (const key of ['window', 'document', 'navigator', 'HTMLElement', 'HTMLInputElement', 'Element', 'Node', 'Event', 'MouseEvent', 'MutationObserver', 'ResizeObserver', 'CSSStyleSheet', 'CustomEvent', 'IS_REACT_ACT_ENVIRONMENT']) {
  previous.set(key, Object.getOwnPropertyDescriptor(globalThis, key))
  Object.defineProperty(globalThis, key, { value: key === 'window' ? window : key === 'IS_REACT_ACT_ENVIRONMENT' ? true : window[key], writable: true, configurable: true })
}
const originals = new Map()
const digest = bytes => createHash('sha256').update(bytes).digest('hex')
const assets = join(hostRoot, 'node_modules/@deepseek-ai/dsh-web-frontend/dist/assets')
const shell = (await readdir(assets)).find(name => /^index-.*[.]js$/.test(name)); assert(shell)
const shellPath = join(assets, shell)
originals.set(shellPath, digest(await readFile(shellPath)))
let baseline, stopped = false
const stop = new Error('navigation fixture stops original shell at public module baseline handoff')
const originalError = console.error
console.error = (...args) => { if (args[0] === stop) stopped = true; else originalError(...args) }
globalThis.__ModuleLoader__ = { create(options) { baseline = options.staticModules; throw stop } }
try { await import(pathToFileURL(shellPath)); await new Promise(resolve => setImmediate(resolve)) }
finally { console.error = originalError; delete globalThis.__ModuleLoader__ }
assert(stopped && baseline, 'entire original shell stopped before runtime boot')
assert.equal(typeof baseline['@deepseek-ai/dsh-client-ui-slots'].SlotCore, 'function')
const req = createRequire(join(hostRoot, 'package.json')), local = createRequire(import.meta.url)
const cache = new Map(Object.entries(baseline))
cache.set('react', React); cache.set('react/jsx-runtime', local('react/jsx-runtime'))
cache.set('react-dom', local('react-dom')); cache.set('react-dom/client', local('react-dom/client'))
cache.set('@deepseek-ai/cordis', await import(pathToFileURL(req.resolve('@deepseek-ai/cordis'))))
export const cordis = cache.get('@deepseek-ai/cordis')
export async function loadNode(id) { const value = await import(pathToFileURL(req.resolve(id))); cache.set(id, value); return value }
export async function load(id) {
  if (cache.has(id)) return cache.get(id)
  const file = join(hostRoot, 'node_modules', id, 'lib/client.js'), bytes = await readFile(file)
  originals.set(file, digest(bytes))
  let registration
  vm.runInThisContext('(function(window){' + bytes.toString('utf8') + '\n})', { filename: file })({ __ModuleLoader__: { load: value => { registration = value } } })
  assert(registration, 'normal native loader registration: ' + id)
  const value = registration.factory(name => { assert(cache.has(name), id + ': load original dependency first: ' + name); return cache.get(name) })
  cache.set(id, value); return value
}
export function get(id) { assert(cache.has(id), id); return cache.get(id) }
const built = process.env.DSH_CONTROLS_CLIENT_BUNDLE ? { code: await readFile(process.env.DSH_CONTROLS_CLIENT_BUNDLE, 'utf8') } : await buildClient()
export const clientHash = digest(built.code)
let registration
vm.runInThisContext('(function(window){' + built.code + '\n})')({ __ModuleLoader__: { load: value => { registration = value } } })
export const client = registration.factory(name => name === 'react' ? React : name === PRIMITIVES_ID ? clientPrimitives(React) : assert.fail('unexpected client dependency ' + name))
export { React }
export const settle = () => new Promise(resolve => setTimeout(resolve, 15))
export async function unchanged() {
  for (const [file, hash] of originals) assert.equal(digest(await readFile(file)), hash, 'original host bytes unchanged: ' + file)
  if (process.env.DSH_CONTROLS_CLIENT_BUNDLE) assert.equal(digest(await readFile(process.env.DSH_CONTROLS_CLIENT_BUNDLE)), clientHash, 'closed client bundle bytes unchanged throughout native validation')
}
export async function closeHost() { await unchanged(); await window.happyDOM.close(); for (const [key, value] of previous) { if (value) Object.defineProperty(globalThis, key, value); else delete globalThis[key] } }
