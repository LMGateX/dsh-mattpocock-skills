import assert from 'node:assert/strict'
import { test } from 'node:test'
import { registerHooks } from 'node:module'
import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { mkdtemp, rm, readFile } from 'node:fs/promises'
import { execFileSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { basename, isAbsolute, join } from 'node:path'
import ts from 'typescript'

const sourceRoot = new URL('../src/controls/', import.meta.url).href
const compiledRoot = new URL('../lib/controls/', import.meta.url).href
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (context.parentURL?.startsWith(sourceRoot) && specifier.startsWith('.') && specifier.endsWith('.js')) {
      const url = new URL(specifier.slice(0, -3) + '.ts', context.parentURL)
      if (existsSync(url)) return { url: url.href, shortCircuit: true }
    }
    const resolved=nextResolve(specifier,context)
    if(resolved.url.startsWith(compiledRoot) && resolved.url.endsWith('.js')) {const url=sourceRoot+resolved.url.slice(compiledRoot.length,-3)+'.ts';if(existsSync(fileURLToPath(url)))return {url,shortCircuit:true}}
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

const { SessionInstruments }=await import('../src/controls/instruments.ts')
const { MemoryInstrumentStorage, createDomainInstrumentStorage }=await import('../src/controls/instrument-storage.ts')
const { parseInstrumentDocument }=await import('../src/controls/instrument-state.ts')
const owner={instrumentInstanceId:'instance-A',ownerSessionId:'A',controlWorkspaceId:'W'}
const author=principal=>({kind:principal==='user'?'user':'agent',principalId:principal,sessionId:principal==='user'?null:principal})
const definition={title:'自由流程',axes:[]}
function fixture(storage=new MemoryInstrumentStorage()) {
  const revoked=new Set(),scopes=new Map([['child',{kind:'assigned',workflowId:'flow',ticketIds:['T1']}]]),identities=new Map([['A',owner],['child',owner],['B',{...owner,instrumentInstanceId:'instance-B',ownerSessionId:'B'}]])
  const controls={async readSession(principal,sid){if(revoked.has(principal)||!identities.has(sid))throw new Error('existing host access denied');return {instance:identities.get(sid),policy:{features:{ticketProgress:{status:'configured'},pendingDecisions:{status:'configured'}}}}}}
  const authority={async resolveAccess(principal,sid){return {author:author(principal),scope:scopes.get(principal)??{kind:'coordinator'}}}}
  const instruments=new SessionInstruments(controls,storage,authority,()=>12345)
  let serial=0
  const read=(principal='A',sid='A')=>instruments.read(principal,sid)
  const command=async(action,fields={},principal='A',sid='A')=>{const current=await read(principal,sid);return {operationId:'business-'+(++serial),expectedRevision:action==='set-decision-view'?current.viewerRevision:current.businessRevision,workflowId:'flow',action,...fields}}
  const apply=async(action,fields={},principal='A',sid='A')=>instruments.apply(principal,sid,await command(action,fields,principal,sid))
  return {storage,instruments,read,command,apply,revoked,scopes,identities,controls,authority}
}
const ticket=(summary='current-safe')=>({title:'票',statuses:{},summary})

async function nativeOpen(storageRoot) {
  const hostRoot=process.env.DSH_CONTROLS_HOST_ROOT
  assert(isAbsolute(hostRoot)&&isAbsolute(storageRoot))
  const load=parts=>import(pathToFileURL(join(hostRoot,'node_modules',...parts)).href)
  const {DomainFacility,defineDomain,domainTable}=await load(['@deepseek-ai','dsh-storage-domain','lib','index.js'])
  const {JsonStorageBackend}=await load(['@deepseek-ai','dsh-storage-json','lib','index.js'])
  const {z}=await load(['zod','index.js'])
  const backend=new JsonStorageBackend(storageRoot)
  const facility=new DomainFacility({storage:{backend:{get(){return backend}}},emit(){},logger:{warn(){},error(){}}},{backend:'json'})
  const close=async()=>{try{await facility.closeAll()}finally{await backend.close()}}
  try {
    const domain=await facility.open(defineDomain({name:'instrument_cleanup_probe',version:1,layout:'single',tables:{instruments:domainTable(z.unknown().transform(parseInstrumentDocument))}}))
    return {table:domain.table('instruments'),close}
  } catch(error){await close();throw error}
}
if(process.env.INSTRUMENT_CLEANUP_CHILD==='read') {
  const state=await nativeOpen(process.argv[2]),f=fixture(createDomainInstrumentStorage(state.table))
  try {
    const current=await f.read(),replay=await f.instruments.apply('A','A',JSON.parse(process.env.INSTRUMENT_CLEANUP_RETRY))
    const raw=await readFile(join(process.argv[2],'instrument_cleanup_probe.json'),'utf8')
    console.log(JSON.stringify({current,replay,markerPresent:raw.includes('unique-native-old-secret-marker'),refPresent:raw.includes('unique-native-old-reference-marker')}))
  } finally {await state.close()}
  process.exit(0)
}

test('V1 remains readable and an ordinary write upgrades to V2 without renumbering source or business revisions',async()=>{
  const storage=new MemoryInstrumentStorage()
  await storage.compareAndSwap(owner.instrumentInstanceId,0,{schemaVersion:1,...owner,revision:1,events:[{revision:1,recordedAt:7,author:author('A'),command:{operationId:'legacy-workflow',expectedRevision:0,workflowId:'flow',action:'put-workflow',value:definition}}]})
  const f=fixture(storage)
  assert.equal((await f.read()).businessRevision,1)
  await f.apply('put-ticket',{localTicketId:'T1',value:ticket()})
  const raw=await storage.read(owner.instrumentInstanceId)
  assert.equal(raw.schemaVersion,2)
  assert.equal(raw.checkpoint.throughRevision,0)
  assert.deepEqual(raw.events.map(event=>event.revision),[1,2])
  assert.equal((await f.read()).businessRevision,2)
  assert.equal((await f.read()).tickets[0].history[0].revision,2)
  assert.throws(()=>parseInstrumentDocument({...raw,schemaVersion:99}),error=>error.code==='invalid-state')
})

test('explicit compact materializes current state and retains every version while removing duplicate raw commands',async()=>{
  const f=fixture()
  await f.apply('put-workflow',{value:definition})
  await f.apply('put-ticket',{localTicketId:'T1',value:ticket('old-text')})
  await f.apply('put-ticket',{localTicketId:'T1',value:ticket('new-text')})
  const before=await f.read(),input={operationId:'compact-1',expectedRevision:before.revision}
  const result=await f.instruments.compact('A','A',input)
  const raw=await f.storage.read(owner.instrumentInstanceId),after=await f.read()
  assert.equal(result.appliedRevision,4)
  assert.equal(result.removedVersions,0)
  assert.equal(raw.checkpoint.throughRevision,4)
  assert.equal(raw.events.length,0)
  assert.deepEqual(after.tickets,before.tickets)
  assert.deepEqual(after.workflows,before.workflows)
  assert.equal(after.businessRevision,3)
  assert.equal(raw.dedup.length,4)
  assert(raw.dedup.every(row=>/^[a-f0-9]{64}$/.test(row.digest)))
  assert.equal(JSON.stringify(raw.dedup).includes('old-text'),false)
  assert.equal(after.historyCoverage.checkpointRevision,4)
  await f.apply('put-ticket',{localTicketId:'T1',value:ticket('after-compact')})
  assert.equal((await f.read()).businessRevision,4)
  assert.deepEqual((await f.read()).tickets[0].history.map(row=>row.revision),[2,3,5])
})

test('history-only purge physically removes selected old ticket body and refs while preserving latest and unselected versions',async()=>{
  const f=fixture()
  await f.apply('put-workflow',{value:definition})
  await f.apply('put-ticket',{localTicketId:'T1',value:ticket('unique-old-secret'),references:['unique-old-reference']})
  await f.apply('put-ticket',{localTicketId:'T2',value:ticket('unselected-secret')})
  await f.apply('put-ticket',{localTicketId:'T1',value:ticket('latest-safe')},'user','A')
  const before=await f.read()
  const input={operationId:'purge-1',expectedRevision:before.revision,throughRevision:4,targets:[{kind:'ticket',workflowId:'flow',localTicketId:'T1'}]}
  const result=await f.instruments.purgeHistory('A','A',input),after=await f.read()
  assert.equal(result.removedVersions,1)
  assert.deepEqual(after.tickets[0].history.map(row=>row.revision),[4])
  assert.deepEqual(after.tickets[1],before.tickets[1])
  assert.deepEqual(after.tickets[0].value,before.tickets[0].value)
  assert.equal(after.tickets[0].history[0].author.principalId,'user')
  assert.equal(after.businessRevision,before.businessRevision)
  assert.equal(after.historyCoverage.purged,true)
  const raw=JSON.stringify(await f.storage.read(owner.instrumentInstanceId))
  assert.equal(raw.includes('unique-old-secret'),false)
  assert.equal(raw.includes('unique-old-reference'),false)
  assert.equal(raw.includes('unselected-secret'),true)
  assert.equal(result.coverage.at(-1).author.principalId,'A')
  assert.deepEqual(result.coverage.at(-1).targets,input.targets)
})

test('purged original business operation retries return original receipt without restoring text and cleanup retries remain authorized',async()=>{
  const f=fixture()
  await f.apply('put-workflow',{value:definition})
  const original=await f.command('put-ticket',{localTicketId:'T1',value:ticket('deleted-source-text')})
  const first=await f.instruments.apply('A','A',original)
  await f.apply('put-ticket',{localTicketId:'T1',value:ticket('safe-now')})
  const request={operationId:'purge-replay',expectedRevision:3,throughRevision:2,targets:[{kind:'ticket',workflowId:'flow',localTicketId:'T1'}]}
  const removed=await f.instruments.purgeHistory('A','A',request)
  const replay=await f.instruments.apply('A','A',original)
  assert.equal(replay.appliedRevision,first.appliedRevision)
  assert.equal(replay.replayed,true)
  assert.equal(replay.snapshot.tickets[0].value.summary,'safe-now')
  assert.equal(JSON.stringify(await f.storage.read(owner.instrumentInstanceId)).includes('deleted-source-text'),false)
  await assert.rejects(f.instruments.apply('A','A',{...original,value:ticket('different')}),error=>error.code==='operation-conflict')
  await f.apply('put-ticket',{localTicketId:'T1',value:ticket('safe-later')})
  const repeated=await f.instruments.purgeHistory('A','A',request)
  assert.equal(repeated.appliedRevision,removed.appliedRevision)
  assert.equal(repeated.replayed,true)
  assert.equal(repeated.snapshot.tickets[0].value.summary,'safe-later')
  await assert.rejects(f.instruments.purgeHistory('user','A',request),error=>error.code==='operation-conflict')
  f.revoked.add('A')
  await assert.rejects(f.instruments.purgeHistory('A','A',request),/access denied/)
})

test('purging earliest decision history preserves original creator ACL, current obligations and independent viewer revisions',async()=>{
  const f=fixture()
  await f.apply('put-workflow',{value:definition})
  await f.apply('put-decision',{decisionId:'D',value:{question:'old-private-text',status:'free',pending:true}},'child','child')
  await f.apply('put-decision',{decisionId:'D',value:{question:'current obligation',status:'still-free'}})
  await f.apply('set-decision-view',{decisionId:'D',value:{read:true,hidden:false}},'user','A')
  assert.equal((await f.read('child','child')).decisions.length,1)
  await f.instruments.purgeHistory('A','A',{operationId:'purge-decision',expectedRevision:4,throughRevision:2,targets:[{kind:'decision',workflowId:'flow',decisionId:'D'}]})
  const child=await f.read('child','child')
  assert.equal(child.decisions.length,1)
  assert.equal(child.decisions[0].creator.principalId,'child')
  assert.equal(child.decisions[0].history[0].author.principalId,'A')
  assert.equal(child.summary.pendingDecisionCount,1)
  assert.equal((await f.read('user','A')).viewerRevision,1)
  await f.apply('put-decision',{decisionId:'D',value:{question:'creator continues',status:'free'}},'child','child')
  await f.apply('set-decision-view',{decisionId:'D',value:{read:false,hidden:true}},'user','A')
  assert.equal((await f.read('user','A')).viewerRevision,2)
  assert.equal((await f.read()).businessRevision,4)
  f.scopes.set('child',{kind:'coordinator'})
  await assert.rejects(f.instruments.compact('child','child',{operationId:'bad-child-cleanup',expectedRevision:7}),error=>error.code==='access-denied')
})

const nativeOptions={skip:process.env.DSH_CONTROLS_HOST_ROOT?false:'set DSH_CONTROLS_HOST_ROOT for actual native source cleanup probe'}
test('actual native JSON and an independent process contain no explicitly purged old source marker but retain current and unselected history',nativeOptions,async t=>{
  const temporary=await mkdtemp(join(tmpdir(),'dsh-instrument-cleanup-')),root=join(temporary,'storage')
  let current=await nativeOpen(root)
  t.after(async()=>{try{await current?.close()}finally{assert(isAbsolute(temporary)&&basename(temporary).startsWith('dsh-instrument-cleanup-'));await rm(temporary,{recursive:true,force:true})}})
  const f=fixture(createDomainInstrumentStorage(current.table))
  await f.apply('put-workflow',{value:definition})
  const original=await f.command('put-ticket',{localTicketId:'T1',value:ticket('unique-native-old-secret-marker'),references:['unique-native-old-reference-marker']})
  await f.instruments.apply('A','A',original)
  await f.apply('put-ticket',{localTicketId:'T2',value:ticket('unselected-native-history')})
  await f.apply('put-ticket',{localTicketId:'T1',value:ticket('native-current-safe')})
  await f.instruments.purgeHistory('A','A',{operationId:'native-purge',expectedRevision:4,throughRevision:2,targets:[{kind:'ticket',workflowId:'flow',localTicketId:'T1'}]})
  const before=await f.read()
  await current.close()
  const text=await readFile(join(root,'instrument_cleanup_probe.json'),'utf8')
  assert.equal(text.includes('unique-native-old-secret-marker'),false)
  assert.equal(text.includes('unique-native-old-reference-marker'),false)
  assert.equal(text.includes('unselected-native-history'),true)
  const output=execFileSync(process.execPath,[fileURLToPath(import.meta.url),root],{encoding:'utf8',env:{...process.env,INSTRUMENT_CLEANUP_CHILD:'read',INSTRUMENT_CLEANUP_RETRY:JSON.stringify(original)}})
  const proof=JSON.parse(output)
  assert.equal(proof.markerPresent,false)
  assert.equal(proof.refPresent,false)
  assert.deepEqual(proof.current,before)
  assert.equal(proof.replay.replayed,true)
  assert.equal(proof.replay.appliedRevision,2)
  current=await nativeOpen(root)
  assert.deepEqual(await fixture(createDomainInstrumentStorage(current.table)).read(),before)
})


test('source purge committed before a lost receipt is verified after fresh native reopen without blind retry or body restoration',nativeOptions,async t=>{
  const temporary=await mkdtemp(join(tmpdir(),'dsh-instrument-cleanup-')),root=join(temporary,'storage')
  let current=await nativeOpen(root)
  t.after(async()=>{try{await current?.close()}finally{assert(isAbsolute(temporary)&&basename(temporary).startsWith('dsh-instrument-cleanup-'));await rm(temporary,{recursive:true,force:true})}})
  const f=fixture(createDomainInstrumentStorage(current.table))
  await f.apply('put-workflow',{value:definition})
  await f.apply('put-ticket',{localTicketId:'T1',value:ticket('lost-receipt-purged-secret')})
  await f.apply('put-ticket',{localTicketId:'T1',value:ticket('safe-current')})
  const table={get:key=>current.table.get(key),put:(key,next)=>current.table.put(key,next),async update(key,fn){await current.table.update(key,fn);throw new Error('source purge committed receipt lost')}}
  const uncertain=fixture(createDomainInstrumentStorage(table))
  const request={operationId:'source-purge-uncertain',expectedRevision:3,throughRevision:2,targets:[{kind:'ticket',workflowId:'flow',localTicketId:'T1'}]}
  await assert.rejects(uncertain.instruments.purgeHistory('A','A',request),/receipt lost/)
  await assert.rejects(uncertain.read(),error=>error.code==='storage-uncertain')
  await current.close();current=await nativeOpen(root)
  const reopened=fixture(createDomainInstrumentStorage(current.table))
  assert.equal((await reopened.read()).tickets[0].history.length,1)
  assert.equal((await readFile(join(root,'instrument_cleanup_probe.json'),'utf8')).includes('lost-receipt-purged-secret'),false)
  const replay=await reopened.instruments.purgeHistory('A','A',request)
  assert.equal(replay.replayed,true)
  assert.equal(replay.appliedRevision,4)
  assert.equal(replay.snapshot.businessRevision,3)
})

async function compactedFixture() {
  const f=fixture()
  await f.apply('put-workflow',{value:definition})
  await f.apply('put-ticket',{localTicketId:'T1',value:ticket('retained-old')})
  await f.apply('put-ticket',{localTicketId:'T1',value:ticket('retained-latest')})
  await f.instruments.compact('A','A',{operationId:'invariant-compact',expectedRevision:3})
  return {f,raw:await f.storage.read(owner.instrumentInstanceId)}
}

test('checkpoint retained author is linked to the actual author of its source receipt',async()=>{
  const {raw}=await compactedFixture()
  const forged=structuredClone(raw)
  forged.checkpoint.state.tickets[0].history[0].author={kind:'user',principalId:'forged-user',sessionId:null}
  assert.throws(()=>parseInstrumentDocument(forged),error=>error.code==='invalid-state')
})

test('retained ticket version cannot borrow another object source revision even when its author is the same',async()=>{
  const {raw}=await compactedFixture()
  const forged=structuredClone(raw)
  forged.checkpoint.state.tickets[0].history[0].revision=1
  assert.throws(()=>parseInstrumentDocument(forged),error=>error.code==='invalid-state')
})

test('checkpoint business counter is exact command accounting rather than any number below the source cut',async()=>{
  const {raw}=await compactedFixture()
  const forged=structuredClone(raw)
  forged.checkpoint.state.businessRevision=0
  assert.throws(()=>parseInstrumentDocument(forged),error=>error.code==='invalid-state')
})

test('compact-only coverage cannot justify silently removing an older retained version',async()=>{
  const {raw}=await compactedFixture()
  const forged=structuredClone(raw)
  forged.checkpoint.state.tickets[0].history.shift()
  assert.throws(()=>parseInstrumentDocument(forged),error=>error.code==='invalid-state')
})

test('decision creator remains linked to the first command target receipt after its body was explicitly purged',async()=>{
  const f=fixture()
  await f.apply('put-workflow',{value:definition})
  await f.apply('put-decision',{decisionId:'D',value:{question:'old-child-body',status:'free'}},'child','child')
  await f.apply('put-decision',{decisionId:'D',value:{question:'latest-owner-body',status:'free'}})
  await f.instruments.purgeHistory('A','A',{operationId:'creator-link-purge',expectedRevision:3,throughRevision:2,targets:[{kind:'decision',workflowId:'flow',decisionId:'D'}]})
  const forged=structuredClone(await f.storage.read(owner.instrumentInstanceId))
  forged.checkpoint.state.decisions[0].creator=author('A')
  assert.throws(()=>parseInstrumentDocument(forged),error=>error.code==='invalid-state')
})

test('checkpoint personal view record cannot borrow a workflow source revision',async()=>{
  const f=fixture()
  await f.apply('put-workflow',{value:definition})
  await f.apply('put-decision',{decisionId:'D',value:{question:'matter',status:'free'}})
  await f.apply('set-decision-view',{decisionId:'D',value:{read:true,hidden:false}},'user','A')
  await f.instruments.compact('A','A',{operationId:'viewer-link-compact',expectedRevision:3})
  const forged=structuredClone(await f.storage.read(owner.instrumentInstanceId))
  forged.checkpoint.state.decisionViews[0].revision=1
  assert.throws(()=>parseInstrumentDocument(forged),error=>error.code==='invalid-state')
})

test('each independently damaged purge coverage field fails closed and cannot legitimize a resurrected old version',async()=>{
  const {f,raw:before}=await compactedFixture()
  const oldVersion=before.checkpoint.state.tickets[0].history[0]
  await f.instruments.purgeHistory('A','A',{operationId:'coverage-link-purge',expectedRevision:4,throughRevision:2,targets:[{kind:'ticket',workflowId:'flow',localTicketId:'T1'}]})
  const good=await f.storage.read(owner.instrumentInstanceId)
  assert.equal(good.coverage.at(-1).removedVersions,1)
  assert.deepEqual(good.coverage.at(-1).removedRevisions,[2])
  for(const [label,mutate] of [
    ['count',doc=>{doc.coverage.at(-1).removedVersions=0}],
    ['wrong removed source',doc=>{doc.coverage.at(-1).removedRevisions=[1]}],
    ['wrong target',doc=>{doc.coverage.at(-1).targets[0].localTicketId='other'}],
    ['missing current inventory',doc=>{doc.checkpoint.state.tickets=[]}],
    ['resurrected deleted history',doc=>{doc.checkpoint.state.tickets[0].history.unshift(oldVersion)}],
  ]) {
    const damaged=structuredClone(good);mutate(damaged)
    assert.throws(()=>parseInstrumentDocument(damaged),error=>error.code==='invalid-state',label)
  }
  // A later current version does not retroactively purge the version retained as latest at the first purge.
  await f.apply('put-ticket',{localTicketId:'T1',value:ticket('later-current')})
  await f.instruments.compact('A','A',{operationId:'later-compact',expectedRevision:6})
  assert.deepEqual((await f.read()).tickets[0].history.map(h=>h.revision),[3,6])
})

test('abort while the source core second read is held performs no source CAS for purge or compact',async()=>{
  for(const mode of ['purgeHistory','compact']) {
    const f=fixture()
    await f.apply('put-workflow',{value:definition})
    await f.apply('put-ticket',{localTicketId:'T1',value:ticket('abort-kept-old-secret')})
    await f.apply('put-ticket',{localTicketId:'T1',value:ticket('current-safe')})
    await f.apply('put-decision',{decisionId:'D',value:{question:'child-original',status:'free',pending:true}},'child','child')
    await f.apply('put-decision',{decisionId:'D',value:{question:'current obligation',status:'free'}})
    await f.instruments.compact('A','A',{operationId:'abort-baseline-compact',expectedRevision:5})
    const baseline=await f.read(),rawBefore=await f.storage.read(owner.instrumentInstanceId)
    let enteredResolve,releaseRead
    const entered=new Promise(resolve=>{enteredResolve=resolve}),held=new Promise(resolve=>{releaseRead=resolve})
    let reads=0,casCalls=0
    const storage={async read(id){reads++;if(reads===2){enteredResolve();await held}return f.storage.read(id)},async compareAndSwap(...args){casCalls++;return f.storage.compareAndSwap(...args)}}
    await storage.read(owner.instrumentInstanceId) // Outer caller/derived preparation has already read durable source.
    const source=new SessionInstruments(f.controls,storage,f.authority,()=>12345)
    const controller=new AbortController(),reason=new Error('cancel before source CAS')
    const input={operationId:'abort-'+mode,expectedRevision:6,...(mode==='purgeHistory'?{throughRevision:2,targets:[{kind:'ticket',workflowId:'flow',localTicketId:'T1'}]}:{})}
    const pending=source[mode]('A','A',input,controller.signal)
    await entered
    assert.equal(casCalls,0)
    controller.abort(reason);releaseRead()
    await assert.rejects(pending,error=>error===reason,mode)
    assert.equal(casCalls,0,mode)
    assert.deepEqual(await f.storage.read(owner.instrumentInstanceId),rawBefore)
    assert.deepEqual(await f.read(),baseline)
    assert.equal((await f.read()).decisions[0].creator.principalId,'child')
    assert.equal((await f.read()).tickets[0].history[0].value.summary,'abort-kept-old-secret')
  }
})

test('abort after source CAS begins does not disguise durable success or a lost acknowledgement as rollback',async()=>{
  for(const loseReceipt of [false,true]) {
    const f=fixture()
    await f.apply('put-workflow',{value:definition})
    await f.apply('put-ticket',{localTicketId:'T1',value:ticket('late-abort-deleted-secret')})
    await f.apply('put-ticket',{localTicketId:'T1',value:ticket('safe-current')})
    let committedResolve,releaseAck,casCalls=0
    const committed=new Promise(resolve=>{committedResolve=resolve}),heldAck=new Promise(resolve=>{releaseAck=resolve})
    const failure=new Error('source committed acknowledgement lost')
    const storage={read:id=>f.storage.read(id),async compareAndSwap(...args){casCalls++;const result=await f.storage.compareAndSwap(...args);committedResolve();await heldAck;if(loseReceipt)throw failure;return result}}
    const source=new SessionInstruments(f.controls,storage,f.authority,()=>12345)
    const controller=new AbortController(),reason=new Error('abort after source CAS began')
    const input={operationId:'late-abort-purge',expectedRevision:3,throughRevision:2,targets:[{kind:'ticket',workflowId:'flow',localTicketId:'T1'}]}
    const pending=source.purgeHistory('A','A',input,controller.signal)
    await committed
    assert.equal(casCalls,1)
    controller.abort(reason);releaseAck()
    if(loseReceipt) await assert.rejects(pending,error=>error===failure)
    else {const result=await pending;assert.equal(result.appliedRevision,4);assert.equal(result.removedVersions,1)}
    assert.equal((await f.read()).revision,4)
    assert.equal(JSON.stringify(await f.storage.read(owner.instrumentInstanceId)).includes('late-abort-deleted-secret'),false)
  }
})
