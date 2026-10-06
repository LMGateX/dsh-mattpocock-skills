import { openInstrumentDomain } from './instrument-domain.mjs'
const state = await openInstrumentDomain(process.argv[2])
try { console.log(JSON.stringify(await state.read('user', 'A'))) }
finally { await state.close() }
