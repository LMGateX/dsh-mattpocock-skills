#!/usr/bin/env node
import { verifyCommittedArtifacts } from './lib/source-ingestion.mjs'

try {
  const result = await verifyCommittedArtifacts()
  console.log('OK: ' + Object.entries(result.channelSkillCounts).map(([name, count]) => name + '=' + count).join(', '))
  console.log('OK: vendor=' + result.vendorFileCount + ' files, ' + result.vendorBytes + ' bytes')
  console.log('OK: vendor root SHA-256 ' + result.vendorRootSha256)
} catch (error) {
  console.error('ERROR: ' + error.message)
  process.exitCode = 1
}
