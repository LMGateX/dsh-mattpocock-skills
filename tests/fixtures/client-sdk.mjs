import assert from 'node:assert/strict'
import { readdir, readFile } from 'node:fs/promises'
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
  const canonicalId = id => id.endsWith('/client') ? id.slice(0, -'/client'.length) : id
  const get = requested => {
    const id = canonicalId(requested)
    if (!cache.has(id) && declarations.has(id)) cache.set(id, declarations.get(id).factory(get))
    assert(cache.has(id), 'Load SDK dependency first: ' + requested)
    return cache.get(id)
  }
  return { cache, get, has: requested => cache.has(canonicalId(requested)) || declarations.has(canonicalId(requested)) }
}

/** Evaluate the original registrations without altering their bytes. */
function clientRegistrations(source, filename, realm = globalThis.window ?? {}) {
  const registrations = []
  const previousLoader = Object.getOwnPropertyDescriptor(realm, '__ModuleLoader__')
  Object.defineProperty(realm, '__ModuleLoader__', { configurable: true, value: { load: value => { registrations.push(value) } } })
  try {
    vm.runInThisContext('(function(window){' + source + '\n})', { filename })(realm)
  } finally {
    if (previousLoader) Object.defineProperty(realm, '__ModuleLoader__', previousLoader)
    else delete realm.__ModuleLoader__
  }
  return registrations
}

export function clientRegistration(source, filename) {
  const registrations = clientRegistrations(source, filename)
  assert.equal(registrations.length, 1, 'one native browser registration: ' + filename)
  return registrations[0]
}

/** Use the published entry and its inline synchronous chunks; do not emulate lazy language assets. */
export async function loadClientModule(requireHost, modules, id, onBytes = () => {}) {
  if (modules.has(id)) return modules.get(id)
  const entry = requireHost.resolve(id + '/client')
  const bytes = await readFile(entry)
  onBytes(entry, bytes)
  const registrations = clientRegistrations(bytes.toString('utf8'), entry)
  const registrationsBySpecifier = new Map()
  for (const row of registrations) {
    assert.equal(row.id, id, entry)
    const key = row.chunk === undefined ? id : './' + row.chunk
    assert(!registrationsBySpecifier.has(key), 'duplicate registration: ' + key)
    registrationsBySpecifier.set(key, row)
  }
  assert(registrationsBySpecifier.has(id), 'missing native browser entry: ' + entry)
  for (const row of registrations) {
    for (const dependency of row.deps ?? []) {
      assert(registrationsBySpecifier.has(dependency), 'missing inline synchronous chunk: ' + dependency + ' in ' + entry)
    }
  }
  const values = new Map()
  const get = specifier => {
    if (!registrationsBySpecifier.has(specifier)) return modules.get(specifier)
    if (!values.has(specifier)) values.set(specifier, registrationsBySpecifier.get(specifier).factory(get))
    return values.get(specifier)
  }
  const value = get(id)
  modules.cache.set(id, value)
  return value
}
