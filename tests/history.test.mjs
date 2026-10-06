import assert from 'node:assert/strict'
import { test } from 'node:test'
import { registerHooks } from 'node:module'
import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, isAbsolute, join } from 'node:path'
import ts from 'typescript'

const sourceRoot = new URL('../src/controls/', import.meta.url).href
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (context.parentURL?.startsWith(sourceRoot) && specifier.startsWith('.') && specifier.endsWith('.js')) {
      const url = new URL(specifier.slice(0, -3) + '.ts', context.parentURL)
      if (existsSync(url)) return { url: url.href, shortCircuit: true }
    }
    return nextResolve(specifier, context)
  },
  load(url, context, nextLoad) {
    if (url.startsWith(sourceRoot) && url.endsWith('.ts')) return { format: 'module', shortCircuit: true,
      source: ts.transpileModule(readFileSync(fileURLToPath(url), 'utf8'), { compilerOptions: {
        target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext, verbatimModuleSyntax: true,
      } }).outputText }
    return nextLoad(url, context)
  },
})
const { SessionHistory, MemoryHistoryStorage, createDomainHistoryStorage, parseHistoryDocument } = await import('../src/controls/history.ts')
const instance = owner => ({ instrumentInstanceId: 'instance-' + owner, ownerSessionId: owner, controlWorkspaceId: 'shared-workspace' })
const observation = (recordId = 'T1', version = 1, more = {}) => ({ kind: 'ticket', recordId, recordKey: 'event-' + version, version,
  snapshot: { title: '原文', status: '自定义部分完成' }, source: { kind: 'authored', domain: 'instruments',
    author: { kind: 'agent', principalId: 'A', sessionId: 'A' }, recordedAt: 10,
    coverage: 'recorded-history' }, ...more })
const fixture = owner => new SessionHistory(instance(owner), new MemoryHistoryStorage(instance(owner)), () => 100)
const actor = {kind:'authored',domain:'history-actions',author:{kind:'user',principalId:'user'},recordedAt:110,coverage:'recorded-history'}

test('captures preserve old authored provenance separately from observation time and replay without growth', async () => {
  const history = fixture('A'), input = observation()
  const first = await history.capture([input])
  input.snapshot.title = '调用者修改'
  const rows = (await history.query()).rows
  const detail = (await history.detail([rows[0].historyId])).rows[0]
  assert.equal(first.revision, 1)
  assert.equal(detail.snapshot.title, '原文')
  assert.equal(detail.source.recordedAt, 10)
  assert.equal(detail.capturedAt, 100)
  assert.equal(detail.source.author.sessionId, 'A')
  assert(Object.isFrozen(detail.snapshot))
  assert.equal((await history.capture([observation()])).revision, 1)
  assert.equal((await history.query()).rows.length, 1)
})

test('summary pages freeze the cut across new entities and new versions without omitting older versions', async () => {
  const history = fixture('A')
  await history.capture([observation('T1',1), observation('T1',2), observation('T2',1)])
  const first = await history.query({ limit: 1 })
  assert.equal(first.total, 3)
  assert.equal(first.rows[0].historyId, 'h:1')
  assert.equal('snapshot' in first.rows[0], false)
  assert(Object.isFrozen(first.nextCursor))
  await history.capture([observation('T1',3),observation('T3',1)])
  const second = await history.query({ limit: 1, cursor: first.nextCursor })
  const third = await history.query({ limit: 1, cursor: second.nextCursor })
  assert.deepEqual([first.rows[0].historyId,second.rows[0].historyId,third.rows[0].historyId],['h:1','h:2','h:3'])
  assert.equal(third.nextCursor, null)
  assert.equal(third.cut, 3)
  assert.equal((await history.query({kind:'ticket',recordId:'T1'})).total,3)
  await assert.rejects(history.query({limit:101}), /limit/)
  await assert.rejects(history.query({kind:'other',cursor:first.nextCursor}), /cursor/)
  assert.equal((await history.detail(['missing'])).notRecorded, true)
  await assert.rejects(history.detail(Array.from({length:21},(_,i)=>'h:'+i)), /detail/)
})

test('explicit retirement keeps history and uncleaned worktrees cannot be hidden by context exclusion', async () => {
  const history = fixture('A')
  await history.capture([observation('T1',1),observation('T2',1,{flags:{done:true}}),
    observation('W1',1,{kind:'worktree',snapshot:{status:'废弃待清理'}}),
    observation('W2',1,{kind:'worktrees',flags:{cleanedWorktree:true}})])
  assert.deepEqual((await history.activeContext()).map(row=>row.recordId),['T1','W1'])
  const result = await history.apply({action:'set-context',kind:'ticket',recordId:'T1',included:false},actor)
  assert.equal(result.operation.source.author.principalId,'user')
  await history.apply({action:'set-context',kind:'worktree',recordId:'W1',included:false},actor)
  assert.deepEqual((await history.activeContext()).map(row=>row.recordId),['W1'])
  assert.equal((await history.query()).total,4)
  await history.apply({action:'set-context',kind:'ticket',recordId:'T1',included:true},actor)
  assert.deepEqual((await history.activeContext()).map(row=>row.recordId),['T1','W1'])
  await assert.rejects(history.apply({action:'set-context',kind:'ticket',recordId:'T1',included:false}), /source/)
})

test('explicit purge redacts source fields and suppresses repeated old captures even with changed replay keys', async () => {
  const storage=new MemoryHistoryStorage(instance('A')), history=new SessionHistory(instance('A'),storage,()=>100)
  await history.capture([observation('T1',1),observation('T1',2),observation('T2',1,{flags:{done:true}})])
  const first=await history.query({limit:1})
  await history.apply({action:'purge',historyIds:['h:2']},actor)
  const second=await history.query({limit:1,cursor:first.nextCursor})
  assert.equal(second.rows[0].historyId,'h:2')
  assert.equal(second.rows[0].source,null)
  assert.equal(second.coverage.purged,true)
  const detail=(await history.detail(['h:2'])).rows[0]
  assert.equal(detail.snapshot,null)
  assert.equal(detail.purged,true)
  assert.equal('summary' in detail,false)
  const before=(await history.query()).revision
  await history.capture([observation('T1',2),observation('T1',1,{recordKey:'regenerated-old-id'})])
  assert.equal((await history.query()).revision,before)
  const reopened=new SessionHistory(instance('A'),new MemoryHistoryStorage(instance('A'),await storage.read()),()=>200)
  await reopened.capture([observation('T1',2,{recordKey:'new-wrapper-key'})])
  assert.equal((await reopened.query()).total,3)
  await reopened.capture([observation('T1',3)])
  assert.equal((await reopened.query()).total,4)
  await assert.rejects(history.apply({action:'purge'},actor),/explicit/)
  await history.apply({action:'purge',range:{fromSequence:1,toSequence:3},archivedOnly:true},actor)
  assert.equal((await history.detail(['h:1'])).rows[0].purged,false)
  assert.equal((await history.detail(['h:3'])).rows[0].purged,true)
  await history.compact()
  assert.equal((await history.query()).total,3)
})

test('the same entity source version cannot grow under a new capture key or accept conflicting content', async () => {
  const history=fixture('A')
  await history.capture([observation()])
  await history.capture([observation('T1',1,{recordKey:'another-observer-key'})])
  assert.equal((await history.query()).total,1)
  await assert.rejects(history.capture([observation('T1',1,{recordKey:'third-key',snapshot:{title:'不同正文'}})]), /version/)
  await assert.rejects(history.apply({action:'set-context',kind:'ticket',recordId:'T1',included:false},{...actor,author:null}),/author/)
})

test('corrupt suppression is not accepted as a reason to silently drop future observations', async () => {
  const storage=new MemoryHistoryStorage(instance('A')),history=new SessionHistory(instance('A'),storage)
  await history.capture([observation()])
  const bad=structuredClone(await storage.read())
  bad.suppression=[{kind:'ticket',recordId:'T1',sourceDomain:'instruments',throughVersion:100}]
  assert.throws(()=>parseHistoryDocument(bad),/suppression/)
  bad.suppression=[];bad.contexts=[{kind:'ticket',recordId:'unrecorded',included:false}]
  assert.throws(()=>parseHistoryDocument(bad),/context/)
  bad.contexts=[]
  bad.actions=[{revision:1,action:{action:'set-context',kind:'ticket',recordId:'T1',included:false},source:{...actor,author:null},capturedAt:100}]
  assert.throws(()=>parseHistoryDocument(bad),/author/)
})

test('scoped core rejects cross-owner storage and foreign cursors instead of returning another owner history', async () => {
  const storage=new MemoryHistoryStorage(instance('A')),a=new SessionHistory(instance('A'),storage),b=fixture('B')
  await a.capture([observation('shared',1),observation('shared',2)])
  await b.capture([observation('shared',1,{snapshot:{title:'独立 owner'}})])
  assert.equal((await b.detail(['h:1'])).rows[0].snapshot.title,'独立 owner')
  await assert.rejects(new SessionHistory(instance('B'),storage).query(),/identity/)
  const page=await a.query({limit:1})
  await assert.rejects(b.query({cursor:page.nextCursor}),/cursor/)
  await assert.rejects(a.query({ownerSessionId:'B'}),/unknown key/)
})

test('purging history does not hide the mandatory uncleaned-worktree context reminder',async()=>{
  const history=fixture('A')
  await history.capture([observation('W',1,{kind:'worktree',snapshot:{status:'废弃但未清理'}})])
  await history.apply({action:'purge',historyIds:['h:1']},actor)
  const reminder=await history.activeContext()
  assert.equal(reminder.length,1)
  assert.equal(reminder[0].recordId,'W')
  assert.equal(reminder[0].purged,true)
  assert.equal(reminder[0].source,null)
})

const nativeOptions={skip:process.env.DSH_CONTROLS_HOST_ROOT ? false : 'set DSH_CONTROLS_HOST_ROOT for actual native storageDomain probe'}
async function nativeFixture(t) {
  const hostRoot=process.env.DSH_CONTROLS_HOST_ROOT
  assert(isAbsolute(hostRoot))
  const load=parts=>import(pathToFileURL(join(hostRoot,'node_modules',...parts)).href)
  const {DomainFacility,defineDomain,domainTable}=await load(['@deepseek-ai','dsh-storage-domain','lib','index.js'])
  const {JsonStorageBackend}=await load(['@deepseek-ai','dsh-storage-json','lib','index.js'])
  const {z}=await load(['zod','index.js'])
  const temporary=await mkdtemp(join(tmpdir(),'dsh-history-'))
  let current
  const reopen=async()=>{
    await current?.close()
    const backend=new JsonStorageBackend(join(temporary,'storage'))
    const facility=new DomainFacility({storage:{backend:{get(){return backend}}},emit(){},logger:{warn(){},error(){}}},{backend:'json'})
    const close=async()=>{try{await facility.closeAll()}finally{await backend.close()}}
    try {
      const domain=await facility.open(defineDomain({name:'history_core_probe',version:1,layout:'single',tables:{history:domainTable(z.unknown().transform(parseHistoryDocument))}}))
      const table=domain.table('history')
      current={table,close,history:(owner,clock=()=>100)=>new SessionHistory(instance(owner),createDomainHistoryStorage(table,instance(owner)),clock)}
      return current
    } catch(error) {await close();throw error}
  }
  t.after(async()=>{try{await current?.close()}finally{assert(isAbsolute(temporary)&&basename(temporary).startsWith('dsh-history-'));await rm(temporary,{recursive:true,force:true})}})
  return {reopen}
}

test('actual native storageDomain restores every version, cleaned-worktree history and purged notification dedup independently per owner',nativeOptions,async t=>{
  const f=await nativeFixture(t)
  let state=await f.reopen(),a=state.history('A'),b=state.history('B')
  await Promise.all([a.capture([observation('shared',1),observation('shared',2),
    observation('W',1,{kind:'worktree',flags:{cleanedWorktree:true}}),
    observation('N',1,{kind:'notification',recordKey:'native-message-1'})]),
    b.capture([observation('shared',1,{snapshot:{title:'另一个 owner'}})])])
  await a.apply({action:'purge',historyIds:['h:4']},actor)
  const before=await a.detail(['h:1','h:2','h:3','h:4'])
  const first=await a.query({limit:1})
  state=await f.reopen();a=state.history('A',()=>9000000000000);b=state.history('B')
  assert.deepEqual(await a.detail(['h:1','h:2','h:3','h:4']),before)
  assert.equal((await b.detail(['h:1'])).rows[0].snapshot.title,'另一个 owner')
  const next=await a.query({limit:1,cursor:first.nextCursor})
  assert.equal(next.rows[0].historyId,'h:2')
  assert.equal((await a.query({kind:'worktree'})).total,1)
  assert.equal((await a.activeContext()).some(row=>row.recordId==='W'),false)
  await a.capture([observation('N',1,{kind:'notification',recordKey:'new-notification-replay-key'})])
  assert.equal((await a.query()).total,4)
  assert.equal((await a.detail(['h:4'])).rows[0].snapshot,null)
  await a.compact()
  assert.deepEqual(await a.detail(['h:1','h:2','h:3','h:4']),before)
})

test('native committed write with lost receipt latches every owner until a fresh domain handle verifies durable history',nativeOptions,async t=>{
  const f=await nativeFixture(t),state=await f.reopen()
  await state.history('A').capture([observation('T1',1)])
  await state.history('B').capture([observation('T1',1,{snapshot:{title:'B'}})])
  let loseReceipt=true
  const table={get:key=>state.table.get(key),put:(key,next)=>state.table.put(key,next),
    async update(key,fn){const result=await state.table.update(key,fn);if(loseReceipt){loseReceipt=false;throw new Error('test committed write lost receipt')}return result}}
  const a=new SessionHistory(instance('A'),createDomainHistoryStorage(table,instance('A')))
  await assert.rejects(a.capture([observation('T1',2)]),/lost receipt/)
  await assert.rejects(a.query(),error=>error.code==='storage-uncertain')
  const b=new SessionHistory(instance('B'),createDomainHistoryStorage(table,instance('B')))
  await assert.rejects(b.query(),error=>error.code==='storage-uncertain')
  await assert.rejects(b.capture([observation('T1',2,{snapshot:{title:'B2'}})]),error=>error.code==='storage-uncertain')
  const reopened=await f.reopen()
  assert.equal((await reopened.history('A').query()).total,2)
  assert.equal((await reopened.history('B').query()).total,1)
  assert.equal((await reopened.history('A').capture([observation('T1',2)])).revision,2)
})
