import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import ts from 'typescript'

export const BASELINE_EXTERNALS = Object.freeze([
  'react', 'react/jsx-runtime', 'react-dom', 'react-dom/client', '@deepseek-ai/cordis',
  '@deepseek-ai/dsh-client-store', '@deepseek-ai/dsh-client-ui-slots',
  '@deepseek-ai/dsh-client-ui-primitives', '@deepseek-ai/dsh-client-ui-dockkit',
])

/** Check the independent Client project and emit only its entry declaration in memory. */
export function generateClientDeclaration(root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')) {
  root = path.resolve(root)
  const configPath = path.join(root, 'tsconfig.client.json')
  const read = ts.readConfigFile(configPath, ts.sys.readFile)
  if (read.error) throw new Error(ts.flattenDiagnosticMessageText(read.error.messageText, ' '))
  const config = ts.parseJsonConfigFileContent(read.config, ts.sys, root)
  const options = { ...config.options, noEmit: false, declaration: true, emitDeclarationOnly: true, declarationMap: false, sourceMap: false, rootDir: path.join(root, 'src'), outDir: path.join(root, 'lib/types'), declarationDir: path.join(root, 'lib/types') }
  const program = ts.createProgram(config.fileNames, options)
  const errors = [...config.errors, ...ts.getPreEmitDiagnostics(program)].filter(row => row.category === ts.DiagnosticCategory.Error)
  if (errors.length) throw new Error(ts.formatDiagnostics(errors, { getCanonicalFileName: value => value, getCurrentDirectory: () => root, getNewLine: () => String.fromCharCode(10) }))
  const entry = program.getSourceFile(path.join(root, 'src/client.ts'))
  if (entry === undefined) throw new Error('Client declaration entry is unavailable')
  let declaration
  const result = program.emit(entry, (file, text) => {
    if (path.resolve(file) !== path.join(root, 'lib/types/client.d.ts')) throw new Error('Client declaration attempted an unexpected output: ' + file)
    declaration = text
  }, undefined, true)
  if (result.emitSkipped || declaration === undefined) throw new Error('Client declaration emission failed')
  return declaration
}

/** Build a closed browser graph; no dependency installation or host boot occurs. */
export async function buildClient({ root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'),
  entry = 'src/client.ts', packageName = '@lmgatex/dsh-mattpocock-skills', output, declaration = false, declarationOutput } = {}) {
  root = await fs.realpath(path.resolve(root))
  const modules = new Map()
  const externals = new Set()
  const visit = async (absolute) => {
    absolute = await fs.realpath(absolute)
    const relative = path.relative(root, absolute).split(path.sep).join('/')
    if (relative.startsWith('../') || path.isAbsolute(relative)) throw new Error('Client module escapes package: ' + relative)
    if (modules.has(relative)) return relative
    const source = await fs.readFile(absolute, 'utf8')
    const sourceAst = ts.createSourceFile(relative, source, ts.ScriptTarget.ES2022, true, ts.ScriptKind.TS)
    const rejectDynamic = (node) => {
      if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) throw new Error('Dynamic imports are not supported by this closed client build')
      if (ts.isMetaProperty(node)) throw new Error('import.meta is not supported by this lazy-CJS client build')
      ts.forEachChild(node, rejectDynamic)
    }
    rejectDynamic(sourceAst)
    const transpiled = ts.transpileModule(source, { fileName: absolute, reportDiagnostics: true,
      compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, isolatedModules: true,
        esModuleInterop: true, sourceMap: false, removeComments: false } })
    const errors = (transpiled.diagnostics ?? []).filter(row => row.category === ts.DiagnosticCategory.Error)
    if (errors.length) throw new Error(errors.map(row => ts.flattenDiagnosticMessageText(row.messageText, ' ')).join('; '))
    const record = { code: transpiled.outputText, dependencies: {} }
    modules.set(relative, record)
    const ast = ts.createSourceFile(relative, record.code, ts.ScriptTarget.ES2022, true, ts.ScriptKind.JS)
    const requests = new Set()
    const inspect = (node) => {
      if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) throw new Error('Dynamic imports are not supported by this closed client build')
      if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === 'require') {
        if (node.arguments.length !== 1 || !ts.isStringLiteral(node.arguments[0])) throw new Error('Client requires must be static string literals')
        requests.add(node.arguments[0].text)
      }
      ts.forEachChild(node, inspect)
    }
    inspect(ast)
    for (const request of requests) {
      if (request.startsWith('./') || request.startsWith('../')) {
        const target = path.resolve(path.dirname(absolute), request.replace(/\.js$/, '.ts'))
        if (!target.endsWith('.ts')) throw new Error('Only package-local TypeScript client dependencies are supported: ' + request)
        record.dependencies[request] = await visit(target)
      } else {
        if (!BASELINE_EXTERNALS.includes(request)) throw new Error('Non-baseline runtime import in client: ' + request)
        externals.add(request)
      }
    }
    return relative
  }
  const entryId = await visit(path.resolve(root, entry))
  const rows = [...modules].sort(([a], [b]) => a.localeCompare(b))
  const definitions = rows.map(([id, row]) => JSON.stringify(id) + ':function(require,module,exports){\n' + row.code + '\n}').join(',\n')
  const dependencyMap = Object.fromEntries(rows.map(([id, row]) => [id, row.dependencies]))
  const code = 'window.__ModuleLoader__.load({id:' + JSON.stringify(packageName) + ',factory:function(require){\n'
    + '"use strict";const modules={' + definitions + '};\nconst dependencies=' + JSON.stringify(dependencyMap) + ';\nconst cache=Object.create(null);\n'
    + 'function load(id){if(Object.hasOwn(cache,id))return cache[id].exports;const module={exports:{}};cache[id]=module;'
    + 'modules[id](function(request){const local=dependencies[id][request];return local===undefined?require(request):load(local)},module,module.exports);return module.exports;}\n'
    + 'return load(' + JSON.stringify(entryId) + ');}});\n'
  const declarationText = declaration || declarationOutput !== undefined ? generateClientDeclaration(root) : undefined
  if (output !== undefined) { await fs.mkdir(path.dirname(path.resolve(output)), { recursive: true }); await fs.writeFile(output, code) }
  if (declarationOutput !== undefined) { await fs.mkdir(path.dirname(path.resolve(declarationOutput)), { recursive: true }); await fs.writeFile(declarationOutput, declarationText) }
  return { code, declaration: declarationText, modules: rows.map(([id]) => id), externals: [...externals].sort() }
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  const args = process.argv.slice(2)
  let output
  let declarationOutput
  let check = false
  for (let index = 0; index < args.length; index++) {
    const arg = args[index]
    if (arg === '--check' && !check) check = true
    else if (arg === '--out' && output === undefined && args[index + 1] && !args[index + 1].startsWith('--')) output = path.resolve(args[++index])
    else if (arg === '--declaration' && declarationOutput === undefined) {
      const next = args[index + 1]
      declarationOutput = next && !next.startsWith('--') ? path.resolve(args[++index]) : path.resolve('lib/types/client.d.ts')
    } else throw new Error('Usage: node scripts/build-client.mjs [--check | --out <path> [--declaration [path]]]')
  }
  if (check && (output !== undefined || declarationOutput !== undefined)) throw new Error('--check cannot write artifacts')
  const result = await buildClient({ output, declarationOutput })
  console.log(JSON.stringify({ bytes: Buffer.byteLength(result.code), modules: result.modules, externals: result.externals, output: output ?? 'memory-only', declaration: declarationOutput ?? null }))
}
