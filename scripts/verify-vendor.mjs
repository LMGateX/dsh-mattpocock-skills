#!/usr/bin/env node
import { verifyCommittedArtifacts } from './lib/source-ingestion.mjs'

try {
  const result = await verifyCommittedArtifacts()
  console.log('OK: stable=' + result.stableSkillCount + ', beta=' + result.betaSkillCount)
  console.log('OK: vendor=' + result.vendorFileCount + ' files, ' + result.vendorBytes + ' bytes')
  console.log('OK: vendor root SHA-256 ' + result.vendorRootSha256)
} catch (error) {
  console.error('ERROR: ' + error.message)
  process.exitCode = 1
}
