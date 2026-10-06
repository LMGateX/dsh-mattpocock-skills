/** Typecheck the delivered TS against matching read-only SDK declarations, without installing it. */
import { cp, mkdtemp, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { isAbsolute, join } from 'node:path'
import ts from 'typescript'

const hostRoot = process.env.DSH_CONTROLS_HOST_ROOT
if (hostRoot === undefined || !isAbsolute(hostRoot)) throw new Error('DSH_CONTROLS_HOST_ROOT must identify a read-only installed SDK')
const root = await mkdtemp(join(tmpdir(), 'dsh-cwd-types-'))
try {
  const target = join(root, 'node_modules/@deepseek-ai/dsh-subagent')
  await cp(join(hostRoot, 'node_modules/@deepseek-ai/dsh-subagent'), target, { recursive: true })
  for (const name of await readdir(join(hostRoot, 'node_modules'))) {
    if (name === '@deepseek-ai') {
      for (const child of await readdir(join(hostRoot, 'node_modules', name))) {
        if (child !== 'dsh-subagent') await symlink(join(hostRoot, 'node_modules', name, child), join(root, 'node_modules', name, child))
      }
    } else await symlink(join(hostRoot, 'node_modules', name), join(root, 'node_modules', name))
  }
  const files = ['index', 'continuation', 'types']
  for (const file of files) {
    await writeFile(join(target, 'lib/types', file + '.ts'), await readFile(new URL('./source/packages/subagent/subagent/src/' + file + '.ts', import.meta.url), 'utf8'))
  }
  const compilerOptions: ts.CompilerOptions = {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.NodeNext,
    moduleResolution: ts.ModuleResolutionKind.NodeNext,
    strict: true,
    exactOptionalPropertyTypes: true,
    noUncheckedIndexedAccess: true,
    skipLibCheck: true,
    noEmit: true,
    allowImportingTsExtensions: true,
    types: ['node'],
    typeRoots: [new URL('../node_modules/@types/', import.meta.url).pathname],
    paths: { '@deepseek-ai/dsh-subagent': [join(target, 'lib/types/index.ts')] },
  }
  const program = ts.createProgram(files.map(file => join(target, 'lib/types', file + '.ts')), compilerOptions)
  const diagnostics = ts.getPreEmitDiagnostics(program)
  console.log(ts.formatDiagnosticsWithColorAndContext(diagnostics, {
    getCanonicalFileName: file => file,
    getCurrentDirectory: () => root,
    getNewLine: () => '\n',
  }))
  if (diagnostics.length !== 0) process.exitCode = 1
  else console.log('patched official TS: strict + exactOptionalPropertyTypes + noUncheckedIndexedAccess passed')
} finally {
  await rm(root, { recursive: true, force: true })
}
