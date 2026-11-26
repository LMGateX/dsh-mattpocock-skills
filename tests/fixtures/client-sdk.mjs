import assert from 'node:assert/strict'
import { readdir } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { pathToFileURL } from 'node:url'
import vm from 'node:vm'

export const clientSdk = root => createRequire(join(root, 'package.json'))

/** Stop the original shell at the public loader handoff before any plugin dispatch. */
export async function readShellModules(requireHost, onBytes = async () => {}) {
  const assets = join(dirname(requireHost.resolve('@deepseek-ai/dsh-web-frontend/package.json')), 'dist/assets')
  const name = (await readdir(assets)).find(name => /^index-.*[.]js$/.test(name))
  assert(name, 'the installed SDK supplies its original Web shell')
  const path = join(assets, name)
  await onBytes(path)
  let registrations, stopped = false
  const sentinel = new Error('Stop original Web shell at the module handoff')
  const originalError = console.error
  const previousLoader = Object.getOwnPropertyDescriptor(globalThis, '__ModuleLoader__')
  console.error = (...args) => { if (args[0] === sentinel) stopped = true; else originalError(...args) }
  globalThis.__ModuleLoader__ = { create(options) { registrations = options.staticModules; throw sentinel } }
  try {
    await import(pathToFileURL(path))
    await new Promise(resolve => setImmediate(resolve))
  } finally {
    console.error = originalError
    if (previousLoader) Object.defineProperty(globalThis, '__ModuleLoader__', previousLoader)
    else delete globalThis.__ModuleLoader__
  }
  assert(stopped && registrations, 'original shell stopped before runtime boot')
  return registrations
}

/** Older shells hand off materialized exports; alpha.2 hands off lazy manifests. */
export function staticModules(registrations, overrides = {}) {
  const declarations = new Map(Array.isArray(registrations) ? registrations.map(row => [row.id, row]) : [])
  const cache = new Map(Object.entries(Array.isArray(registrations) ? overrides : { ...registrations, ...overrides }))
  const get = id => {
    if (!cache.has(id) && declarations.has(id)) cache.set(id, declarations.get(id).factory(get))
    assert(cache.has(id), 'Load SDK dependency first: ' + id)
    return cache.get(id)
  }
  return { cache, get, has: id => cache.has(id) || declarations.has(id) }
}

/** Evaluate the original registration without altering its bytes. */
export function clientRegistration(source, filename) {
  let registration
  vm.runInThisContext('(function(window){' + source + '\n})', { filename })({ __ModuleLoader__: { load: value => { registration = value } } })
  assert(registration, 'native browser registration: ' + filename)
  return registration
}
