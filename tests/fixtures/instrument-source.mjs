import { registerHooks } from 'node:module'
import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'

// Exercise this source seam without rebuilding or mutating the checked-in lib artifacts.
const sourceRoot = new URL('../../src/controls/', import.meta.url).href
const compiledRoot = new URL('../../lib/controls/', import.meta.url).href
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (context.parentURL?.startsWith(sourceRoot) && specifier.startsWith('.') && specifier.endsWith('.js')) {
      const url = new URL(specifier.slice(0, -3) + '.ts', context.parentURL)
      if (existsSync(url)) return { url: url.href, shortCircuit: true }
    }
    const resolved = nextResolve(specifier, context)
    if (resolved.url.startsWith(compiledRoot) && resolved.url.endsWith('.js')) {
      const url = sourceRoot + resolved.url.slice(compiledRoot.length, -3) + '.ts'
      if (existsSync(fileURLToPath(url))) return { url, shortCircuit: true }
    }
    return resolved
  },
  load(url, context, nextLoad) {
    if (url.startsWith(sourceRoot) && url.endsWith('.ts')) return { format: 'module', shortCircuit: true,
      source: ts.transpileModule(readFileSync(fileURLToPath(url), 'utf8'), { compilerOptions: {
        target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext, verbatimModuleSyntax: true,
      } }).outputText }
    return nextLoad(url, context)
  },
})
