import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { isAbsolute, join } from 'node:path'
import { pathToFileURL } from 'node:url'

export async function loadStorageSdk(hostRoot) {
  assert(isAbsolute(hostRoot), 'host root must be absolute')
  const manifest = join(hostRoot, 'package.json')
  // Resolve public package names as the installed CLI would, including npm hoisting.
  const host = createRequire(manifest)
  const domainName = '@deepseek-ai/dsh-storage-domain'
  const jsonName = '@deepseek-ai/dsh-storage-json'
  const versionOf = async path => JSON.parse(await readFile(path, 'utf8')).version
  const hostVersion = await versionOf(manifest)
  for (const name of [domainName, jsonName]) {
    assert.equal(await versionOf(host.resolve(name + '/package.json')), hostVersion, 'storage probe matches the inspected host build')
  }
  const domainEntry = host.resolve(domainName)
  // Zod is a dependency of storage-domain, not of the CLI.
  const fromDomain = createRequire(domainEntry)
  const load = path => import(pathToFileURL(path).href)
  const { DomainFacility, defineDomain, domainTable } = await load(domainEntry)
  const { JsonStorageBackend } = await load(host.resolve(jsonName))
  const { z } = await load(fromDomain.resolve('zod'))
  return { DomainFacility, defineDomain, domainTable, JsonStorageBackend, z }
}
