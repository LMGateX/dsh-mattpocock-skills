import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'
import { createHash } from 'node:crypto'
import * as React from 'react'
import { Window } from 'happy-dom'
import { buildClient } from '../../scripts/build-client.mjs'
import { PRIMITIVES_ID, clientPrimitives } from './client-primitives.mjs'
import { clientSdk, clientRegistration, loadClientModule, readShellModules, staticModules } from './client-sdk.mjs'

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
const req = clientSdk(hostRoot), local = createRequire(import.meta.url)
const baseline = await readShellModules(req, async file => originals.set(file, digest(await readFile(file))))
export const cordis = await import(pathToFileURL(req.resolve('@deepseek-ai/cordis')))
const modules = staticModules(baseline, {
  react: React, 'react/jsx-runtime': local('react/jsx-runtime'),
  'react-dom': local('react-dom'), 'react-dom/client': local('react-dom/client'), '@deepseek-ai/cordis': cordis,
})
export const get = modules.get
export async function loadNode(id) {
  const value = await import(pathToFileURL(req.resolve(id)))
  modules.cache.set(id.endsWith('/client') ? id.slice(0, -'/client'.length) : id, value)
  return value
}
export const load = id => loadClientModule(req, modules, id, (file, bytes) => originals.set(file, digest(bytes)))
assert.equal(typeof (await load('@deepseek-ai/dsh-client-ui-slots')).SlotCore, 'function')
// Dockkit, the native sidebar, and the opt-in native primitive probe depend on this row.
await load(PRIMITIVES_ID)
const built = process.env.DSH_CONTROLS_CLIENT_BUNDLE ? { code: await readFile(process.env.DSH_CONTROLS_CLIENT_BUNDLE, 'utf8') } : await buildClient()
export const clientHash = digest(built.code)
const registration = clientRegistration(built.code, 'navigation-plugin.js')
export const client = registration.factory(name => name === 'react' ? React : name === PRIMITIVES_ID ? (process.env.DSH_CONTROLS_NATIVE_PRIMITIVES === '1' ? get(PRIMITIVES_ID) : clientPrimitives(React)) : assert.fail('unexpected client dependency ' + name))
export { React }
export const settle = () => new Promise(resolve => setTimeout(resolve, 15))
export async function unchanged() {
  for (const [file, hash] of originals) assert.equal(digest(await readFile(file)), hash, 'original host bytes unchanged: ' + file)
  if (process.env.DSH_CONTROLS_CLIENT_BUNDLE) assert.equal(digest(await readFile(process.env.DSH_CONTROLS_CLIENT_BUNDLE)), clientHash, 'closed client bundle bytes unchanged throughout native validation')
}
export async function closeHost() { await unchanged(); await window.happyDOM.close(); for (const [key, value] of previous) { if (value) Object.defineProperty(globalThis, key, value); else delete globalThis[key] } }
