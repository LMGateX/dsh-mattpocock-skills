#!/usr/bin/env node
import { updateSource } from './lib/source-ingestion.mjs'

function usage() {
  return [
    'Usage: node scripts/update-source.mjs [--source <git-url-or-path>] [--check]',
    '',
    'The expected repository, annotated tag object, commit, and upstream commit',
    'come from source-lock.json. --source changes only the Git transport used',
    'to obtain those immutable objects.',
  ].join('\n')
}

function parseArgs(argv) {
  const options = { check: false }
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index]
    if (argument === '--check') {
      options.check = true
    } else if (argument === '--source') {
      index += 1
      if (index >= argv.length) throw new Error('--source requires a value')
      options.source = argv[index]
    } else if (argument === '--help' || argument === '-h') {
      console.log(usage())
      process.exit(0)
    } else {
      throw new Error('unknown argument ' + JSON.stringify(argument) + '\n' + usage())
    }
  }
  return options
}

try {
  const result = await updateSource(parseArgs(process.argv.slice(2)))
  console.log(result.check ? 'OK: source artifacts are current' : 'OK: source artifacts updated')
  console.log('OK: ' + Object.entries(result.channelSkillCounts).map(([name, count]) => name + '=' + count).join(', '))
  console.log('OK: vendor=' + result.vendorFileCount + ' files, ' + result.vendorBytes + ' bytes')
  console.log('OK: vendor root SHA-256 ' + result.vendorRootSha256)
} catch (error) {
  console.error('ERROR: ' + error.message)
  process.exitCode = 1
}
