import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createHash } from 'node:crypto'
import { actualAgent, caller, mountedFixture, operator, policy, signal, workflow, sdk, loadSDK, deferred } from './fixtures/runtime-host.mjs'
import { executeRegistryTool } from './fixtures/nested-tool.mjs'

const value = result => {
  assert.notEqual(result.isError, true, result.error?.message)
  const text = result.content.find(row => row.type === 'text').text
  const parsed = JSON.parse(text)
  assert.deepEqual(result.value, parsed, 'the actual typed value and rendered compact JSON must be the same DTO')
  assert.equal(text, JSON.stringify(result.value))
  assert.ok(Buffer.byteLength(text) <= (parsed.kind === 'receipt' ? 8192 : 65536))
  return parsed
}

test('model execute returns a current-only schema2 value and a small committed receipt', async t => {
  const f = await mountedFixture(t)
  await f.runtime.savePolicy(operator, policy(), 0, signal())
  const written = value(await f.execute('mattpocock_record', { request: { action: 'apply', command: { operationId: 'flow', expectedRevision: 0, action: 'put-workflow', workflowId: 'wf', references: [], value: workflow } } }))
  assert.equal(written.schemaVersion, 2)
  assert.equal(written.kind, 'receipt')
  assert.equal(written.appliedRevision, 1)
  assert.equal(written.businessRevision, 1)
  assert.equal(written.snapshot, undefined)
  const current = value(await f.execute('mattpocock_record', { request: { action: 'read' } }))
  assert.equal(current.schemaVersion, 2)
  assert.equal(current.kind, 'current')
  assert.ok(current.instance.instrumentInstanceId)
  assert.ok(current.windows.S)
  assert.ok(current.collections.health)
  assert.ok(Buffer.byteLength(JSON.stringify(current)) <= 65536)
  assert.doesNotMatch(JSON.stringify(current), /"history":|"changes":/)
})

async function content(f, locator, agent = f.root) {
  const chunks=[]
  let offset=0,hash,total
  for (;;) {
    const part=value(await f.execute('mattpocock_record',{request:{action:'detail',locator,offset}},agent))
    assert.equal(part.offset,offset)
    assert.ok(part.nextOffset>offset||part.done)
    hash??=part.contentHash;total??=part.totalBytes
    assert.equal(part.contentHash,hash);assert.equal(part.totalBytes,total)
    chunks.push(part.data);offset=part.nextOffset
    if(part.done)break
  }
  const text=chunks.join('')
  assert.equal(Buffer.byteLength(text),total)
  assert.equal(createHash('sha256').update(text).digest('hex'),hash)
  return JSON.parse(text)
}

test('a cleaned observation receipt still resolves its real creation provenance and authored update', async t => {
  const f=await mountedFixture(t)
  const who=await f.runtime.readModelIdentity(caller('root'),'root',signal())
  const module=await import('../src/controls/worktree-observations.ts')
  const suffix='worktree_observations_'+createHash('sha256').update(who.instance.instrumentInstanceId).digest('hex').slice(0,40)
  const store=await f.mounted.ports.openUnitStorage(suffix,module.parseWorktreeObservationsDocument)
  const observations=module.createWorktreeObservations(()=>store)
  const author={kind:'agent',principalId:'agent:root',sessionId:'root'}
  const observed=await observations.observe(who.instance,author,{creatorSessionId:'root',callId:'observed-one',rootCallId:'observed-one',turn:1,step:1,path:'/trees/A',branch:'branch-A',baseCommit:'a'.repeat(40),repositoryRoot:'/repo'},'replay')
  const receipt=value(await f.execute('mattpocock_worktree',{request:{action:'update-observation',command:{operationId:'clean',observationId:observed.row.observationId,expectedRevision:observed.row.revision,state:'cleaned',notes:'authored cleanup'}}}))
  assert.equal(receipt.kind,'receipt')
  const body=await content(f,receipt.detail.locator)
  assert.equal(body.source,'replay','an authored cleanup must not upgrade the creation evidence')
  assert.equal(body.value.business.state,'cleaned')
  assert.equal(body.value.business.notes,'authored cleanup')
  assert.equal(body.provenance.source,'agent')
  const page=value(await f.execute('mattpocock_worktree',{request:{action:'read',query:{kind:'observation'}}}))
  assert.equal(page.total,1,'cleaned observations remain explicitly queryable')
  assert.equal(page.rows[0].source,'replay')
  assert.deepEqual(await content(f,page.rows[0].detail.locator),body)
  assert.equal(receipt.appliedRevision,null)
  assert.equal(receipt.appliedRevisionCoverage,'source-does-not-report-original-commit')
  const before=await store.read()
  const unchanged=value(await f.execute('mattpocock_worktree',{request:{action:'update-observation',command:{operationId:'same-value-no-op',observationId:observed.row.observationId,expectedRevision:receipt.businessRevision,state:'cleaned',notes:'authored cleanup'}}}))
  assert.equal(unchanged.businessRevision,receipt.businessRevision)
  assert.equal(unchanged.businessState,'cleaned')
  assert.equal(unchanged.appliedRevision,null,'a no-op current row is not a new operation commit')
  assert.equal(unchanged.appliedRevisionCoverage,'source-does-not-report-original-commit')
  assert.deepEqual(await store.read(),before)
  assert.deepEqual(await content(f,unchanged.detail.locator),body)
})

test('same workflow ticket and decision IDs have independent exact-version Unicode content', async t => {
  const f=await mountedFixture(t)
  await f.runtime.savePolicy(operator,policy(),0,signal())
  let revision=0
  const apply=async(command)=>{const receipt=value(await f.execute('mattpocock_record',{request:{action:'apply',command:{operationId:'op-'+revision,expectedRevision:revision,workflowId:'same',...command}}}));revision=receipt.businessRevision;return receipt}
  await apply({action:'put-workflow',value:workflow})
  await apply({action:'put-ticket',localTicketId:'same',value:{title:'ticket title',statuses:{delivery:['partial']},summary:'ticket value'}})
  const long=String.fromCodePoint(0x4e2d,0x1f600,92,10,1).repeat(7000)
  await apply({action:'put-decision',decisionId:'same',value:{question:'decision question',status:'open',pending:true,ticketIds:['same'],context:long}})
  const pages={}
  for(const kind of ['workflow','ticket','decision']){
    const page=value(await f.execute('mattpocock_record',{request:{action:'read',query:{kind,limit:1}}}))
    assert.equal(page.rows.length,1)
    assert.equal(page.more,false)
    pages[kind]=page.rows[0]
  }
  assert.equal((await content(f,pages.workflow.detail.locator)).value.title,workflow.title)
  assert.equal((await content(f,pages.ticket.detail.locator)).value.summary,'ticket value')
  const decision=await content(f,pages.decision.detail.locator)
  assert.equal(decision.value.question,'decision question')
  assert.equal(decision.value.context,long)
  assert.equal(decision.provenance.author.sessionId,'root')
  assert.equal(decision.history,undefined)
  await apply({action:'put-decision',decisionId:'same',value:{question:'decision question',status:'answered',result:'new version'}})
  const stale=await f.execute('mattpocock_record',{request:{action:'detail',locator:pages.decision.detail.locator,offset:0}})
  assert.equal(stale.isError,true)
  assert.match(stale.error.message,/changed/)
  const wrongCaller=await f.execute('mattpocock_record',{request:{action:'detail',locator:pages.ticket.detail.locator}},f.child)
  assert.equal(wrongCaller.isError,true,'a source selector is not a grant to another caller')
})

test('policy pages and content fully reconstruct one revision without becoming a save intent', async t => {
  const f=await mountedFixture(t)
  const intent=policy()
  intent.workspaceOverrides=Object.fromEntries([['defaults',{workspace:{enabled:false}}],...Array.from({length:35},(_,index)=>['workspace-'+index,{windows:{enabled:index%2===0,ticketWindowSize:index+1}}])])
  const saved=await f.runtime.savePolicy(operator,intent,0,signal())
  const current=value(await f.execute('mattpocock_controls',{request:{action:'read'}}))
  assert.equal(current.completeIntent,false)
  assert.equal(current.revision,saved.revision)
  const defaults=value(await f.execute('mattpocock_controls',{request:{action:'read',query:{kind:'defaults'}}}))
  assert.equal(defaults.completeIntent,false)
  assert.deepEqual(await content(f,defaults.rows[0].detail.locator),saved.defaults)
  const overrides={}
  let cursor,firstCursor
  do {
    const page=value(await f.execute('mattpocock_controls',{request:{action:'read',query:{kind:'workspace',limit:7,...(cursor?{cursor}:{})}}}))
    assert.equal(page.completeIntent,false)
    assert.equal(page.revision,saved.revision)
    assert.ok(page.rows.length>0)
    for(const row of page.rows){assert.equal(Object.hasOwn(overrides,row.recordId),false);overrides[row.recordId]=await content(f,row.detail.locator)}
    cursor=page.nextCursor;firstCursor??=cursor
  }while(cursor)
  assert.deepEqual(overrides,saved.workspaceOverrides)
  const updated=await f.runtime.savePolicy(operator,{extensionEnabled:false,defaults:saved.defaults,workspaceOverrides:saved.workspaceOverrides},saved.revision,signal())
  assert.equal(updated.revision,saved.revision+1)
  const stale=await f.execute('mattpocock_controls',{request:{action:'read',query:{kind:'workspace',limit:7,cursor:firstCursor}}})
  assert.equal(stale.isError,true)
  assert.match(stale.error.message,/changed/)
})

test('assignment receipts expose only the authenticated target and content rechecks narrowed scope', async t => {
  const f=await mountedFixture(t)
  await f.runtime.savePolicy(operator,policy(),0,signal())
  let revision=0
  for(const command of [{action:'put-workflow',value:workflow},{action:'put-ticket',localTicketId:'A',value:{title:'A',statuses:{delivery:['partial']}}},{action:'put-ticket',localTicketId:'B',value:{title:'B',statuses:{delivery:['partial']}}},{action:'put-decision',decisionId:'shared',value:{question:'requires both tickets',status:'open',pending:true,ticketIds:['A','B']}},{action:'put-decision',decisionId:'A-only',value:{question:'for A',status:'open',pending:true,ticketIds:['A']}}]){
    const written=await f.runtime.applyInstrument(caller('root'),'root',{operationId:'seed-'+revision,expectedRevision:revision,workflowId:'flow',...command},signal());revision=written.snapshot.businessRevision
  }
  await f.runtime.assign(caller('root'),{sessionId:'child'},signal())
  const old=await f.runtimeStorage.read()
  await f.runtimeStorage.compareAndSwap(old.revision,{...old,revision:old.revision+1,assignments:[...old.assignments,{sessionId:'SECRET-other-owner-child',parentSessionId:'SECRET-other-owner-parent',instrumentInstanceId:'SECRET-other-owner-instance',workflowId:'SECRET-other-owner-workflow',ticketIds:['SECRET-other-owner-ticket']}]})
  const assigned=value(await f.execute('mattpocock_assign',{request:{sessionId:'child',workflowId:'flow',ticketIds:['A']}}))
  assert.equal(assigned.assignment,'granted');assert.equal(assigned.ticketCount,1)
  assert.equal(assigned.sessionId,'child');assert.equal(assigned.parentSessionId,'root')
  assert.equal(assigned.revision,undefined,'the shared document revision is not an assignment result')
  assert.doesNotMatch(JSON.stringify(assigned),/SECRET|assignments|notifications|nativeExecutions/)
  assert.deepEqual((await content(f,assigned.detail.locator)).ticketIds,['A'])
  const childCurrent=value(await f.execute('mattpocock_record',{request:{action:'read'}},f.child))
  assert.equal(childCurrent.scope.kind,'assigned');assert.equal(childCurrent.scope.ticketCount,1)
  assert.deepEqual((await content(f,childCurrent.scopeDetail.locator,f.child)).ticketIds,['A'])
  const decisions=value(await f.execute('mattpocock_record',{request:{action:'read',query:{kind:'decision'}}},f.child))
  assert.equal(decisions.total,1,'a root-authored decision requires every associated ticket')
  assert.equal(decisions.rows[0].decisionId,'A-only')
  const tickets=value(await f.execute('mattpocock_record',{request:{action:'read',query:{kind:'ticket'}}},f.child))
  const ticketLocator=tickets.rows[0].detail.locator
  assert.equal((await content(f,ticketLocator,f.child)).localTicketId,'A')
  await f.runtime.assign(caller('root'),{sessionId:'child',workflowId:'flow',ticketIds:['B']},signal())
  const revoked=await f.execute('mattpocock_record',{request:{action:'detail',locator:ticketLocator}},f.child)
  assert.equal(revoked.isError,true)
  const registry=await f.execute('mattpocock_worktree',{request:{action:'read'}},f.child)
  assert.equal(registry.isError,true)
  const native=value(await f.execute('mattpocock_record',{request:{action:'read',query:{kind:'native-execution'}}},f.child))
  assert.equal(native.coverage,'restricted')
})

test('window receipts preserve original replay cut ignored fence and generation with current detail', async t => {
  const f=await mountedFixture(t)
  await f.runtime.savePolicy(operator,policy(),0,signal())
  await f.runtime.applyInstrument(caller('root'),'root',{operationId:'flow',expectedRevision:0,workflowId:'flow',action:'put-workflow',value:workflow},signal())
  await f.runtime.applyInstrument(caller('root'),'root',{operationId:'ticket',expectedRevision:1,workflowId:'flow',localTicketId:'A',action:'put-ticket',value:{title:'A',statuses:{delivery:['partial']}}},signal())
  const run=async(action,operationId,generation)=>value(await f.execute('mattpocock_window',{request:{action,operationId,workflowId:'flow',localTicketId:'A',...(generation===undefined?{}:{generation})}}))
  const first=await run('reserve','reserve')
  assert.equal(first.replayed,false);assert.equal(first.ignored,false);assert.equal(first.generation,1)
  await run('release','release',1)
  const second=await run('reacquire','reacquire',1)
  assert.equal(second.generation,2)
  const stale=await run('release','stale-release',1)
  assert.equal(stale.ignored,true);assert.equal(stale.generation,1,'receipt keeps the stale command generation, not a fabricated current generation')
  const replay=await run('reserve','reserve')
  assert.equal(replay.replayed,true);assert.equal(replay.appliedRevision,first.appliedRevision)
  assert.ok(replay.revision>replay.appliedRevision,'applied cut stays the original while current revision advances')
  assert.equal(replay.snapshot,undefined)
  const current=value(await f.execute('mattpocock_record',{request:{action:'read',query:{kind:'window-ticket'}}}))
  const body=await content(f,current.rows[0].detail.locator)
  assert.equal(body.generation,2);assert.equal(body.held,true)
})

test('projection failure after a committed business action returns its real receipt without another write', async t => {
  const f=await mountedFixture(t)
  await f.runtime.savePolicy(operator,policy(),0,signal())
  const apply=f.runtime.applyInstrument.bind(f.runtime)
  let calls=0
  f.runtime.applyInstrument=async(...args)=>{calls++;return {...await apply(...args),diagnostic:{notJson:1n}}}
  const receipt=value(await f.execute('mattpocock_record',{request:{action:'apply',command:{operationId:'once',expectedRevision:0,workflowId:'flow',action:'put-workflow',value:workflow}}}))
  assert.equal(receipt.projection,'failed')
  assert.equal(receipt.commit,'confirmed')
  assert.equal(receipt.appliedRevision,1)
  assert.equal(receipt.businessRevision,1)
  assert.equal(receipt.replayed,false)
  assert.equal(calls,1)
  const current=value(await f.execute('mattpocock_record',{request:{action:'read'}}))
  assert.equal(current.revisions.business,1)
  assert.equal(current.collections.workflow.total,1)
})

test('projection failure keeps an accepted delegate child and all separate effect facts on retry', async t => {
  const f=await mountedFixture(t,{delegate:true})
  await f.runtime.savePolicy(operator,policy({enabled:false}),0,signal())
  let creations=0
  f.mounted.ports.flushSession=async()=>true
  f.mounted.ports.createContinuable=async(exec,request)=>{creations++;f.agents.set(request.childId,actualAgent(request.childId,{parent:'root',managed:true}));return {childId:request.childId,messageId:'accepted-message'}}
  const delegate=f.runtime.delegate.bind(f.runtime)
  f.runtime.delegate=async(...args)=>({...await delegate(...args),diagnostic:{notJson:1n}})
  const request={operationId:'create-once',description:'One lane',prompt:'One task'}
  const first=value(await f.execute('mattpocock_delegate',{request}))
  assert.equal(first.projection,'failed')
  assert.equal(first.accepted,true)
  assert.equal(first.creation,'accepted')
  assert.equal(first.binding,'confirmed')
  assert.equal(first.assignment,'granted')
  assert.equal(first.recording,'recorded')
  assert.equal(first.messageId,'accepted-message')
  assert.equal(first.replayed,false)
  const second=value(await f.execute('mattpocock_delegate',{request}))
  assert.equal(second.childId,first.childId)
  assert.equal(second.accepted,true)
  assert.equal(second.replayed,true)
  assert.deepEqual(second.recovery,{binding:'confirmed',assignment:'granted'})
  assert.equal(creations,1,'projection failure and replay never dispatch the task twice')
})

test('long status-count dimensions are recoverable as exact authorized stable current content', async t => {
  const f=await mountedFixture(t)
  await f.runtime.savePolicy(operator,policy(),0,signal())
  const statuses=Array.from({length:64},(_,index)=>({statusKey:'s'+index,label:'Label-'+index+'-中'.repeat(700)}))
  const valueOfWorkflow={title:'Many statuses',axes:[{axisKey:'delivery',label:'Dimensions',counting:'exclusive',statuses}]}
  await f.runtime.applyInstrument(caller('root'),'root',{action:'put-workflow',operationId:'flow',expectedRevision:0,workflowId:'flow',value:valueOfWorkflow},signal())
  await f.runtime.applyInstrument(caller('root'),'root',{action:'put-ticket',operationId:'ticket',expectedRevision:1,workflowId:'flow',localTicketId:'A',value:{title:'A',statuses:{delivery:['s63']}}},signal())
  const page=value(await f.execute('mattpocock_record',{request:{action:'read',query:{kind:'status-count'}}}))
  assert.equal(page.total,1)
  assert.ok(page.rows[0].detail.locator)
  const body=await content(f,page.rows[0].detail.locator)
  assert.equal(body.statuses.length,64)
  assert.deepEqual(body.statuses.map(row=>[row.statusKey,row.label,row.count]),statuses.map((row,index)=>[row.statusKey,row.label,index===63?1:0]))
})

test('all seven tools plus optional delegate and standalone audit bound direct and genuinely nested typed values', async t => {
  const config={schemaVersion:1,revision:0,defaults:{enabled:true,dryRun:true},workspaceOverrides:{}}
  const f=await mountedFixture(t,{delegate:true,seedUnits:new Map([['mattpocock_supervision_config',new Map([['state',config]])]])})
  await f.runtime.savePolicy(operator,policy(),0,signal())
  const flow=await f.runtime.applyInstrument(caller('root'),'root',{operationId:'flow',expectedRevision:0,workflowId:'flow',action:'put-workflow',value:workflow},signal())
  await f.runtime.applyInstrument(caller('root'),'root',{operationId:'ticket',expectedRevision:flow.snapshot.businessRevision,workflowId:'flow',localTicketId:'A',action:'put-ticket',value:{title:'A',statuses:{delivery:['partial']}}},signal())
  const who=await f.runtime.readModelIdentity(caller('root'),'root',signal())
  const resourceModule=await import('../src/controls/resources.ts')
  const resource={resourceId:'R',controlWorkspaceId:'W',ownerInstanceId:who.instance.instrumentInstanceId,identity:{repositoryPath:'/fixture/repo',root:'/fixture',path:'/fixture/tree',gitCommonDir:'/fixture/repo/.git',gitCommonDirIdentity:'common',gitDir:'/fixture/repo/.git/worktrees/tree',gitDirIdentity:'private',pathIdentity:'tree',rootIdentity:'root',branchRef:'refs/heads/tree',branchOwned:true,ownership:'owned',baseOid:'a'.repeat(40)},status:'retained',business:{status:'unknown physical state'},businessAuthorId:'agent:root',references:[],retireRequest:null,entrancesClosed:false,nativeColdResumeClosed:false,diagnostic:null}
  await f.mounted.ports.resourceStorage.compareAndSwap(0,resourceModule.parseResourceDocument({schemaVersion:1,revision:1,resources:[resource],leases:[]}))
  let creations=0
  f.mounted.ports.flushSession=async()=>true
  f.mounted.ports.createContinuable=async(exec,request)=>{creations++;f.agents.set(request.childId,actualAgent(request.childId,{parent:'root',managed:true}));return {childId:request.childId,messageId:'accepted'}}
  const requests=[
    ['mattpocock_controls',{action:'read'}],['mattpocock_record',{action:'read'}],
    ['mattpocock_window',{action:'reserve',operationId:'surface-T',workflowId:'flow',localTicketId:'A'}],
    ['mattpocock_resource',{action:'read',resourceId:'R'}],['mattpocock_assign',{sessionId:'child',workflowId:'flow',ticketIds:['A']}],
    ['mattpocock_history',{action:'query',query:{kind:'workflow'}}],['mattpocock_worktree',{action:'read'}],
    ['mattpocock_delegate',{operationId:'surface-delegate',description:'One lane',prompt:'One task'}],['mattpocock_audit',{action:'read'}],
  ]
  const auditDescription=f.ctx.tools.get('mattpocock_audit').description
  assert.match(auditDescription,/\{action:"read"/u)
  assert.doesNotMatch(auditDescription,/\bread=\{/u)
  const direct=new Map()
  for(const [name,request] of requests)direct.set(name,value(await f.execute(name,{request})))
  assert.equal(direct.get('mattpocock_resource').actualCanRetire.allowed,false)
  assert.equal(direct.get('mattpocock_resource').actualCanRetire.facts,null)
  assert.ok(Number.isFinite(direct.get('mattpocock_resource').checkedAt))
  assert.deepEqual(await content(f,direct.get('mattpocock_resource').detail.locator),resource)
  assert.equal(direct.get('mattpocock_audit').coverage.persistence,'memory-only')
  const observed=new Map()
  let outerToken,rootCall
  f.ctx.on('tools/post-execute',async(exec,result,next)=>{if(requests.some(([name])=>name===exec.name)&&exec.parent!==undefined)observed.set(exec.name,{parent:exec.parent,rootCallId:exec.rootCallId});return next()})
  f.ctx.tools.register(sdk.defineTool({name:'bounded_public_outer',description:'mechanical nested pipeline probe',parameters:{},output:{schema:{type:'json'},render:()=>[]},async execute(_,exec){
    outerToken=exec.token;rootCall=exec.rootCallId
    const results=[]
    for(const [name,request] of requests){
      const result=await executeRegistryTool(f.ctx,{name,arguments:{request},callId:'nested-'+name,rootCallId:exec.rootCallId,parent:exec.token,agent:exec.agent,signal:exec.signal},loadSDK)
      results.push({name,value:value(result)})
    }
    return results
  }}))
  const outer=await f.execute('bounded_public_outer')
  assert.equal(outer.isError,false,outer.error?.message)
  assert.equal(outer.value.length,requests.length)
  for(const [name] of requests){assert.equal(observed.get(name)?.parent,outerToken,name+' must preserve the real outer execution token');assert.equal(observed.get(name)?.rootCallId,rootCall)}
  assert.equal(creations,1,'nested delegate retry still reuses the single accepted child')
})

test('detail encoding and a concurrent assignment revocation share the permission FIFO through completion', async t => {
  const f=await mountedFixture(t)
  await f.runtime.savePolicy(operator,policy(),0,signal())
  await f.runtime.applyInstrument(caller('root'),'root',{operationId:'flow',expectedRevision:0,workflowId:'flow',action:'put-workflow',value:workflow},signal())
  await f.runtime.applyInstrument(caller('root'),'root',{operationId:'ticket',expectedRevision:1,workflowId:'flow',localTicketId:'A',action:'put-ticket',value:{title:'A',statuses:{delivery:['partial']},summary:'中😀'.repeat(16000)}},signal())
  await f.runtime.assign(caller('root'),{sessionId:'child',workflowId:'flow',ticketIds:['A']},signal())
  const page=value(await f.execute('mattpocock_record',{request:{action:'read',query:{kind:'ticket'}}},f.child))
  const locator=page.rows[0].detail.locator
  const entered=deferred(),release=deferred(),source=f.runtime.readModelSource.bind(f.runtime)
  let revoked=false,encodedBeforeRevocation=false
  if(f.runtime.withModelRead){const permit=f.runtime.withModelRead.bind(f.runtime);f.runtime.withModelRead=(who,session,control,effect)=>permit(who,session,control,async()=>{const output=await effect();encodedBeforeRevocation=!revoked;return output})}
  f.runtime.readModelSource=async(...args)=>{const selected=await source(...args);if(args[2].domain==='records'){entered.resolve();await release.promise}return selected}
  const reading=f.execute('mattpocock_record',{request:{action:'detail',locator}},f.child)
  await entered.promise
  const revocation=f.runtime.assign(caller('root'),{sessionId:'child',workflowId:'flow',ticketIds:[]},signal()).then(()=>{revoked=true})
  // Deliberate event-loop handoff exposes an in-flight encoder; this is not polling or sleeping.
  await new Promise(resolve=>setImmediate(resolve))
  release.resolve()
  const result=await reading
  await revocation
  assert.ok(result.isError||encodedBeforeRevocation,'a successfully encoded old body must complete inside its permission permit, before revocation can commit')
  const stale=await f.execute('mattpocock_record',{request:{action:'detail',locator}},f.child)
  assert.equal(stale.isError,true,'a read arriving after revocation cannot resume the old body')
})

test('native recovery discovers more than the injection cap and fences lane and observation association changes', async t => {
  const f=await mountedFixture(t)
  await f.runtime.savePolicy(operator,policy(),0,signal())
  await f.runtime.assign(caller('root'),{sessionId:'child'},signal())
  const who=await f.runtime.readModelIdentity(caller('root'),'root',signal())
  const old=await f.runtimeStorage.read()
  const nativeExecutions=Array.from({length:65},(_,index)=>({executionId:'native-'+index,sessionId:'native-'+index,parentSessionId:'root',instrumentInstanceId:who.instance.instrumentInstanceId,provider:null,runId:null,headerCwd:null,state:'created',outcome:null,observed:'agent/created',startedAt:1,endedAt:null,recordedAt:index+1}))
  await f.runtimeStorage.compareAndSwap(old.revision,{...old,revision:old.revision+1,nativeExecutions})
  const current=value(await f.execute('mattpocock_record',{request:{action:'read'}}))
  assert.equal(current.collections['native-execution'].total,65)
  const found=new Set()
  let cursor
  do {
    const page=value(await f.execute('mattpocock_record',{request:{action:'read',query:{kind:'native-execution',limit:9,...(cursor?{cursor}:{})}}}))
    for(const row of page.rows){assert.equal(found.has(row.recordId),false);found.add(row.recordId)}
    cursor=page.nextCursor
  }while(cursor)
  assert.equal(found.size,65)
  const last=value(await f.execute('mattpocock_record',{request:{action:'read',query:{kind:'native-execution',recordId:'native-64'}}}))
  assert.equal(last.total,1)
  const first=value(await f.execute('mattpocock_record',{request:{action:'read',query:{kind:'native-execution',limit:1}}}))
  await f.runtime.assign(caller('root'),{sessionId:'child',workflowId:'flow',ticketIds:['A']},signal())
  const stale=await f.execute('mattpocock_record',{request:{action:'read',query:{kind:'native-execution',limit:1,cursor:first.nextCursor}}})
  assert.equal(stale.isError,true);assert.match(stale.error.message,/changed/)
  const module=await import('../src/controls/worktree-observations.ts')
  const store=await f.mounted.ports.openUnitStorage('worktree_observations_'+createHash('sha256').update(who.instance.instrumentInstanceId).digest('hex').slice(0,40),module.parseWorktreeObservationsDocument)
  const observations=module.createWorktreeObservations(()=>store)
  for(const index of [1,2])await observations.observe(who.instance,{kind:'agent',principalId:'agent:child',sessionId:'child'},{creatorSessionId:'child',callId:'obs-'+index,rootCallId:'obs-'+index,turn:1,step:index,path:'/trees/'+index,branch:'branch-'+index,baseCommit:'a'.repeat(40),repositoryRoot:'/repo'},'program')
  const before=value(await f.execute('mattpocock_record',{request:{action:'read',query:{kind:'worktree-observation',limit:1}}}))
  await f.runtime.created(caller('child'),signal(),f.child)
  const after=await f.execute('mattpocock_record',{request:{action:'read',query:{kind:'worktree-observation',limit:1,cursor:before.nextCursor}}})
  assert.equal(after.isError,true,'new nativeChildren evidence invalidates the old observation cut')
  assert.match(after.error.message,/changed/)
})

test('a history capture failure is associated with the committed receipt even if the later hook repairs health', async t => {
  const f=await mountedFixture(t)
  await f.runtime.savePolicy(operator,policy(),0,signal())
  const who=await f.runtime.readModelIdentity(caller('root'),'root',signal())
  const historyModule=await import('../src/controls/history.ts')
  const history=await f.mounted.ports.openUnitStorage('history_'+createHash('sha256').update(who.instance.instrumentInstanceId).digest('hex').slice(0,56),historyModule.parseHistoryDocument)
  const writeHistory=history.compareAndSwap.bind(history)
  let fail=true,businessWrites=0
  history.compareAndSwap=async(...args)=>{if(fail){fail=false;throw new Error('injected history capture failure')}return writeHistory(...args)}
  const writeBusiness=f.mounted.ports.instrumentStorage.compareAndSwap.bind(f.mounted.ports.instrumentStorage)
  f.mounted.ports.instrumentStorage.compareAndSwap=async(...args)=>{businessWrites++;return writeBusiness(...args)}
  const request={action:'apply',command:{operationId:'business-once',expectedRevision:0,workflowId:'flow',action:'put-workflow',value:workflow}}
  const first=value(await f.execute('mattpocock_record',{request}))
  assert.equal(first.appliedRevision,1)
  assert.equal(first.businessRevision,1)
  assert.equal(first.historyCapture.status,'failed')
  assert.match(first.historyCapture.diagnostic,/injected history capture failure/)
  const replay=value(await f.execute('mattpocock_record',{request}))
  assert.equal(replay.replayed,true)
  assert.equal(replay.appliedRevision,1)
  assert.equal(businessWrites,1,'capture failure never repeats the business effect')
})

test('standalone audit pages every retained episode and never resurrects an evicted observation', async t => {
  const module=await import('../src/controls/supervision-audit.ts')
  const now=Date.now(),episodes=Array.from({length:27},(_,index)=>({episodeId:'episode-'+index,ownerSessionId:'root',ticketId:null,research:false,at:now,trigger:'scheduled',verdict:'uncertain',severity:'info',observed:'observed fact '+index,possibleIssue:'possible issue '+index,confidence:0.2,delivery:'none',evidence:{events:0,productWrites:0,supportWrites:0,productFiles:[],supportFiles:[],noProductHours:null,rootsConfigured:false}}))
  const state=module.parseSupervisionDocument({...module.initialSupervisionDocument('root','W',now),revision:1,episodes})
  const suffix='supervision_state_'+createHash('sha256').update('root').digest('hex').slice(0,32)
  const config={schemaVersion:1,revision:0,defaults:{enabled:true,dryRun:true},workspaceOverrides:{}}
  const f=await mountedFixture(t,{seedUnits:new Map([['mattpocock_supervision_config',new Map([['state',config]])],['mattpocock_'+suffix,new Map([['state',state]])]])})
  await f.runtime.savePolicy(operator,policy(),0,signal())
  const current=value(await f.execute('mattpocock_audit',{request:{action:'read'}}))
  assert.equal(current.coverage.persistence,'memory-only')
  assert.equal(current.collections.episode.total,27,'the legacy latest-20 display cap is not a retained episode query limit')
  const seen=new Set()
  let cursor,chosen
  do {
    const page=value(await f.execute('mattpocock_audit',{request:{action:'read',query:{kind:'episode',limit:6,...(cursor?{cursor}:{})}}}))
    for(const row of page.rows){assert.equal(seen.has(row.recordId),false);seen.add(row.recordId);chosen??=row}
    cursor=page.nextCursor
  }while(cursor)
  assert.equal(seen.size,27)
  assert.deepEqual(await content(f,chosen.detail.locator),episodes.find(row=>row.episodeId===chosen.recordId))
  const denied=await f.execute('mattpocock_audit',{request:{action:'read'}},f.child)
  assert.equal(denied.isError,true)
  const store=await f.mounted.ports.openUnitStorage(suffix,module.parseSupervisionDocument)
  await store.compareAndSwap(1,module.parseSupervisionDocument({...state,revision:2,episodes:episodes.filter(row=>row.episodeId!==chosen.recordId)}))
  const unavailable=await f.execute('mattpocock_record',{request:{action:'detail',locator:chosen.detail.locator}})
  assert.equal(unavailable.isError,true)
  assert.match(unavailable.error.message,/unavailable/)
})

test('an asynchronous descendant cannot keep a closed model read permit and bypass a later FIFO holder', async t => {
  const f=await mountedFixture(t)
  const trigger=deferred(),entered=deferred(),release=deferred()
  let late,completed=false
  await f.runtime.withModelRead(caller('root'),'root',signal(),async()=>{
    late=(async()=>{await trigger.promise;await f.runtime.readModelIdentity(caller('root'),'root',signal());completed=true})()
  })
  const holder=f.runtime.withModelRead(caller('root'),'root',signal(),async()=>{entered.resolve();await release.promise})
  await entered.promise
  trigger.resolve()
  await new Promise(resolve=>setImmediate(resolve))
  assert.equal(completed,false,'a closed inherited permit must queue behind the active holder')
  release.resolve();await holder;await late
  assert.equal(completed,true)
})

test('plugin errors stay bounded and cancellation releases the content read permit without exposing a body', async t => {
  const f=await mountedFixture(t)
  const bad=await f.execute('mattpocock_worktree',{request:{action:'x'.repeat(200000)}})
  assert.equal(bad.isError,true)
  assert.ok(Buffer.byteLength(JSON.stringify({error:bad.error,content:bad.content}))<=8192)
  await f.runtime.savePolicy(operator,policy(),0,signal())
  await f.runtime.applyInstrument(caller('root'),'root',{action:'put-workflow',operationId:'flow',expectedRevision:0,workflowId:'flow',value:workflow},signal())
  const page=value(await f.execute('mattpocock_record',{request:{action:'read',query:{kind:'workflow'}}}))
  const original=f.runtime.readModelSource.bind(f.runtime),entered=deferred(),release=deferred()
  f.runtime.readModelSource=async(...args)=>{const result=await original(...args);entered.resolve();await release.promise;return result}
  const controller=new AbortController()
  const pending=executeRegistryTool(f.ctx,{name:'mattpocock_record',arguments:{request:{action:'detail',locator:page.rows[0].detail.locator}},callId:'cancel-content',agent:f.root,signal:controller.signal},loadSDK).then(result=>result,error=>error)
  await entered.promise
  controller.abort(new Error('cancel selected content'))
  release.resolve()
  const result=await pending
  assert.ok(result instanceof Error||result.isError)
  assert.match(result instanceof Error?result.message:JSON.stringify(result.content),/cancel selected content/)
  assert.notEqual(result.value?.kind,'content','cancelled content is not delivered as a successful body')
  await f.runtime.readModelIdentity(caller('root'),'root',signal())
})

test('binding update receipts resolve exact current header provenance without embedding retained versions', async t => {
  const f=await mountedFixture(t)
  const who=await f.runtime.readModelIdentity(caller('root'),'root',signal())
  const module=await import('../src/controls/worktree-bindings.ts')
  const store=await f.mounted.ports.openUnitStorage('worktrees_'+createHash('sha256').update(who.instance.instrumentInstanceId).digest('hex').slice(0,48),module.parseWorktreeBindingsDocument)
  const bindings=module.createWorktreeBindings(()=>store)
  const author={kind:'agent',principalId:'agent:root',sessionId:'root'}
  const initial=await bindings.registerIntent(who.instance,author,{operationId:'bind',parentSessionId:'root',plannedChildSessionId:'child',requestedCwd:'/fixture',task:'task from authored intent',ticketIds:['A']})
  const confirmed=await bindings.confirm(who.instance,'bind',{sessionId:'child',parentSessionId:'root',cwd:'/fixture'},author)
  const notes='notes 中😀'.repeat(5000)
  const receipt=value(await f.execute('mattpocock_worktree',{request:{action:'update',command:{operationId:'discard',bindingId:initial.row.bindingId,expectedRevision:confirmed.revision,state:'discarded',notes}}}))
  assert.equal(receipt.kind,'receipt')
  assert.equal(receipt.acceptance,'accepted')
  assert.equal(receipt.outcome,'confirmed')
  const selected=await content(f,receipt.detail.locator)
  assert.equal(selected.value.business.state,'discarded')
  assert.equal(selected.value.business.notes,notes)
  assert.equal(selected.value.requestedCwd,'/fixture')
  assert.equal(selected.value.actualCwd,'/fixture')
  assert.equal(selected.source,'agent')
  assert.equal(selected.history,undefined)
  const page=value(await f.execute('mattpocock_worktree',{request:{action:'read',query:{kind:'binding',recordId:initial.row.bindingId}}}))
  assert.equal(page.rows[0].plannedChildSessionId,'child')
  assert.equal(page.rows[0].operationId,'bind')
  assert.deepEqual(await content(f,page.rows[0].detail.locator),selected)
  const denied=await f.execute('mattpocock_record',{request:{action:'detail',locator:receipt.detail.locator}},f.child)
  assert.equal(denied.isError,true)
})

test('binding cleanup observation changes invalidate record and worktree cursors without changing durable content', async t => {
  const f=await mountedFixture(t)
  const second=actualAgent('cursor-child',{parent:'root',managed:true});f.agents.set(second.id,second)
  const who=await f.runtime.readModelIdentity(caller('root'),'root',signal())
  const module=await import('../src/controls/worktree-bindings.ts')
  const store=await f.mounted.ports.openUnitStorage('worktrees_'+createHash('sha256').update(who.instance.instrumentInstanceId).digest('hex').slice(0,48),module.parseWorktreeBindingsDocument)
  const bindings=module.createWorktreeBindings(()=>store),author={kind:'agent',principalId:'agent:root',sessionId:'root'}
  const byChild=new Map()
  for(const child of [f.child,second]){
    const operationId='binding-'+child.id
    const intent=await bindings.registerIntent(who.instance,author,{operationId,parentSessionId:'root',plannedChildSessionId:child.id,requestedCwd:'/fixture'})
    await bindings.confirm(who.instance,operationId,{sessionId:child.id,parentSessionId:'root',cwd:'/fixture'},author)
    byChild.set(child.id,intent.row.bindingId)
  }
  const entries=[['mattpocock_record','worktree-binding'],['mattpocock_worktree','binding']]
  const firstPages=[]
  for(const [tool,kind] of entries){
    const page=value(await f.execute(tool,{request:{action:'read',query:{kind,limit:1}}}))
    assert.equal(page.total,2);assert.equal(page.shown,1);assert.equal(page.more,true)
    const stable=value(await f.execute(tool,{request:{action:'read',query:{kind,limit:1,cursor:page.nextCursor}}}))
    assert.equal(stable.shown,1);assert.equal(stable.more,false)
    assert.notEqual(stable.rows[0].recordId,page.rows[0].recordId)
    firstPages.push(page)
  }
  const hidden=[f.child.id,second.id].find(id=>id!==firstPages[0].rows[0].actualChildSessionId)
  const selected=value(await f.execute('mattpocock_worktree',{request:{action:'read',query:{kind:'binding',recordId:byChild.get(hidden)}}})).rows[0]
  assert.equal(selected.cleanupDue,false)
  const before=await content(f,selected.detail.locator)
  const revision=(await store.read()).revision
  f.agents.delete(hidden)
  for(let index=0;index<entries.length;index++){
    const [tool,kind]=entries[index]
    const stale=await f.execute(tool,{request:{action:'read',query:{kind,limit:1,cursor:firstPages[index].nextCursor}}})
    assert.equal(stale.isError,true,tool+' must fence changed live cleanup observations')
    assert.match(stale.error.message,/Current view changed/)
    // The SDK intentionally serializes only error.message. The registered public tool
    // throws the structured conflict before that unchanged SDK error projection.
    const request={action:'read',query:{kind,limit:1,cursor:firstPages[index].nextCursor}}
    await assert.rejects(f.ctx.tools.get(tool).execute({request},{name:tool,arguments:{request},callId:'cut-'+index,rootCallId:'cut-'+index,token:{},agent:f.root,signal:signal(),concludeTurn(){},deferContext(){}}),error=>error.code==='revision-conflict'&&error.reason==='current-view-changed')
  }
  const fresh=value(await f.execute('mattpocock_worktree',{request:{action:'read',query:{kind:'binding',recordId:byChild.get(hidden)}}})).rows[0]
  assert.equal(fresh.cleanupDue,true)
  assert.equal(fresh.sourceVersion,selected.sourceVersion,'live cleanup observation is not a durable content revision')
  assert.deepEqual(await content(f,selected.detail.locator),before)
  assert.equal((await store.read()).revision,revision,'observing a missing child makes no business write')
})

test('a replayed binding operation reports current business facts but never invents its original commit revision', async t => {
  const f=await mountedFixture(t)
  const who=await f.runtime.readModelIdentity(caller('root'),'root',signal())
  const module=await import('../src/controls/worktree-bindings.ts')
  const store=await f.mounted.ports.openUnitStorage('worktrees_'+createHash('sha256').update(who.instance.instrumentInstanceId).digest('hex').slice(0,48),module.parseWorktreeBindingsDocument)
  const bindings=module.createWorktreeBindings(()=>store),author={kind:'agent',principalId:'agent:root',sessionId:'root'}
  const initial=await bindings.registerIntent(who.instance,author,{operationId:'receipt-bind',parentSessionId:'root',plannedChildSessionId:'child',requestedCwd:'/fixture'})
  const confirmed=await bindings.confirm(who.instance,'receipt-bind',{sessionId:'child',parentSessionId:'root',cwd:'/fixture'},author)
  const a={action:'update',command:{operationId:'update-a',bindingId:initial.row.bindingId,expectedRevision:confirmed.revision,state:'discarded',notes:'first authored disposition'}}
  const first=value(await f.execute('mattpocock_worktree',{request:a}))
  assert.equal(first.businessRevision,3)
  const oldBody=await content(f,first.detail.locator)
  const second=value(await f.execute('mattpocock_worktree',{request:{action:'update',command:{operationId:'update-b',bindingId:initial.row.bindingId,expectedRevision:first.businessRevision,state:'active',notes:'later authored disposition'}}}))
  assert.equal(second.businessRevision,4)
  const before=await store.read()
  assert.equal(before.operations.find(row=>row.operationId==='update-a').revision,3)
  const replay=value(await f.execute('mattpocock_worktree',{request:a}))
  assert.equal(replay.businessRevision,4)
  assert.equal(replay.businessState,'active')
  assert.equal(replay.appliedRevision,null,'current revision 4 is not the original update-a commit at revision 3')
  assert.equal(replay.appliedRevisionCoverage,'source-does-not-report-original-commit')
  assert.equal(replay.replayed,null)
  assert.equal(replay.replayCoverage,'source-does-not-report-replay')
  assert.equal(first.appliedRevision,null,'a source that only returns its current row cannot prove the original commit even on a fresh write')
  assert.equal(second.appliedRevision,null)
  assert.equal(replay.acceptance,'accepted');assert.equal(replay.outcome,'confirmed')
  const current=await content(f,replay.detail.locator)
  assert.equal(current.revision,4);assert.equal(current.value.business.state,'active');assert.equal(current.value.business.notes,'later authored disposition')
  assert.notDeepEqual(current,oldBody)
  assert.deepEqual(await store.read(),before,'retry never rewrites a row, restores old state or creates another dispatch')
  const stale=await f.execute('mattpocock_record',{request:{action:'detail',locator:first.detail.locator}})
  assert.equal(stale.isError,true,'an original body locator is not silently rebound to later content')
  const action=f.runtime.worktreeAction.bind(f.runtime)
  f.runtime.worktreeAction=async(...args)=>({...await action(...args),diagnostic:1n})
  const fallback=value(await f.execute('mattpocock_worktree',{request:a}))
  assert.equal(fallback.projection,'failed');assert.equal(fallback.commit,'not-reported')
  assert.equal(fallback.businessRevision,4);assert.equal(fallback.businessState,'active')
  assert.equal(fallback.appliedRevision,null);assert.equal(fallback.appliedRevisionCoverage,'source-does-not-report-original-commit')
  assert.deepEqual(await store.read(),before)
})
