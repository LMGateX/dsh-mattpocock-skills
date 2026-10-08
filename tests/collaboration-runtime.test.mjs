import assert from 'node:assert/strict'
import {test} from 'node:test'
import {fixture,mountedFixture,caller,signal,actualAgent,policy,workflow,ticket} from './fixtures/runtime-host.mjs'

function installCreation(f,{supported=true}={}) {
 const calls=[]
 // Controlled native checkpoint seam, not an instantiated AgentLoop or disk durability claim.
 f.ports.flushSession=async()=>true
 f.ports.capabilities={...f.ports.capabilities,nativeInitialChildCwd:supported?'supported':'unsupported'}
 f.ports.createContinuable=async (exec,request)=>{
  calls.push(request)
  const child=actualAgent(request.childId,{parent:exec.agent.id,managed:true,cwd:request.cwd??exec.agent.session.header.cwd})
  f.agents.set(child.id,child)
  return {childId:child.id,messageId:'native-'+child.id}
 }
 return calls
}

test('RuntimeFacade native-created assignment never widens a parent grant revoked during child creation',async t=>{
 const f=await fixture(t,{initialPolicy:policy()}),calls=installCreation(f),native=f.ports.createContinuable
 await f.apply('put-workflow',{value:workflow})
 await f.apply('put-ticket',{localTicketId:'A',value:ticket()})
 await f.apply('put-ticket',{localTicketId:'B',value:ticket()})
 await f.assign('old-child','flow',['A'])
 f.ports.createContinuable=async(exec,request)=>{
  await f.assign('old-child','flow',['B'])
  const receipt=await native(exec,request)
  await f.runtime.created(caller(receipt.childId),signal(),f.agents.get(receipt.childId))
  return receipt
 }
 const result=await f.runtime.delegate(caller('old-child'),{description:'Build A',prompt:'Implement',workflowId:'flow',ticketIds:['A']},f.exec('old-child'))
 assert.equal(result.accepted,true)
 assert.equal(result.recording,'failed')
 assert.equal(calls.length,1)
 assert.deepEqual((await f.read(result.childId)).records.scope,{kind:'assigned',workflowId:null,ticketIds:[]})
})

test('mounted native public history and worktree tools use the RuntimeFacade with authenticated caller scope',async t=>{
 const f=await mountedFixture(t)
 await f.runtime.savePolicy({kind:'user',principalId:'user:operator',sessionId:null},policy(),0,signal())
 await f.runtime.applyInstrument(caller('root'),'root',{action:'put-workflow',operationId:'mounted-history-flow',expectedRevision:0,workflowId:'flow',value:workflow},signal())
 const history=await f.execute('mattpocock_history',{request:{action:'query',query:{kind:'workflow'}}})
 assert.equal(history.isError,false)
 assert.equal(history.value.total,1)
 assert.equal(Object.hasOwn(history.value.rows[0],'snapshot'),false)
 const worktrees=await f.execute('mattpocock_worktree',{request:{action:'read'}})
 assert.equal(worktrees.isError,false)
 assert.deepEqual(worktrees.value.rows,[])
 const child=await f.execute('mattpocock_history',{request:{action:'query',query:{}}},f.child)
 assert.equal(child.isError,true)
})

test('RuntimeFacade delegation observes native-created child execution without making advisory limits a creation veto',async t=>{
 const f=await fixture(t,{initialPolicy:policy({enabled:true,ticketWindowSize:1,runningSubagentLimit:1})}),calls=installCreation(f),native=f.ports.createContinuable
 f.ports.createContinuable=async(exec,request)=>{const receipt=await native(exec,request);await f.runtime.created(caller(receipt.childId),signal(),f.agents.get(receipt.childId));return receipt}
 const request={description:'Research',prompt:'Inspect'}
 const first=await f.runtime.delegate(caller('root'),request,f.exec())
 await f.runtime.delegate(caller('root'),request,f.exec())
 const active=await f.read()
 assert.equal(active.windows.S.used,2)
 assert.equal(active.windows.S.overcommitted,true)
 assert.equal(calls.length,2)
 await f.event(f.agents.get(first.childId))
 assert.equal((await f.read()).windows.S.used,1)
})

test('RuntimeFacade scopes policy grants to this owner and confirmed children and keeps personal views out of shared history',async t=>{
 const f=await fixture(t,{initialPolicy:policy()})
 await f.apply('put-workflow',{value:workflow})
 await f.apply('put-ticket',{localTicketId:'A',value:ticket()})
 await f.assign('old-child','flow',['A'])
 await f.grants.compareAndSwap(0,{schemaVersion:1,revision:1,grants:[{sessionId:'root',enabled:true},{sessionId:'old-child',enabled:false},{sessionId:'other',enabled:true},{sessionId:'stranger',enabled:true}]})
 assert.deepEqual((await f.read()).policyGrants.grants.map(row=>row.sessionId),['root','old-child'])
 await f.apply('put-decision',{decisionId:'private-view',value:{question:'pending',status:'custom',pending:true}})
 await f.runtime.applyInstrument({kind:'user',principalId:'user:operator',sessionId:null},'root',{action:'set-decision-view',operationId:'private-reading',expectedRevision:0,workflowId:'flow',decisionId:'private-view',value:{read:true,hidden:true}},signal())
 await assert.rejects(f.runtime.historyAction(caller('root'),'root',{action:'query',query:{kind:'viewer'}},signal()),/personal|viewer|unsupported/)
 const page=await f.runtime.historyAction(caller('root'),'root',{action:'query',query:{kind:'decision'}},signal())
 const detail=await f.runtime.historyAction(caller('root'),'root',{action:'detail',historyIds:page.rows.map(row=>row.historyId)},signal())
 assert(detail.rows.every(row=>!Object.hasOwn(row.snapshot,'view')&&!Object.hasOwn(row.snapshot,'hidden')))
})

test('RuntimeFacade reports history and notification recording uncertainty without denying committed business input',async t=>{
 const f=await fixture(t,{initialPolicy:policy()})
 await f.apply('put-workflow',{value:workflow})
 const journal=f.units.get('runtime_bindings'),save=journal.compareAndSwap.bind(journal)
 journal.compareAndSwap=async()=>{throw new Error('outbox persistence failed after business commit')}
 const result=await f.apply('put-decision',{decisionId:'committed',value:{question:'still saved',status:'custom',pending:true}},'root',{kind:'user',principalId:'user:operator',sessionId:null})
 assert.equal(result.snapshot.decisions[0].value.question,'still saved')
 assert.equal(result.notificationRecording,'failed')
 journal.compareAndSwap=save
 const open=f.ports.openUnitStorage.bind(f.ports)
 f.ports.openUnitStorage=async(name,parse)=>{const store=await open(name,parse);if(name.startsWith('history_'))store.compareAndSwap=async()=>{throw new Error('history recording unavailable')};return store}
 await f.reopen()
 const next=await f.apply('put-ticket',{localTicketId:'A',value:ticket()})
 assert.equal(next.snapshot.tickets[0].localTicketId,'A')
 const current=await f.read()
 assert(current.health.some(row=>row.scope==='history'&&row.status==='unknown'))
 assert.equal(current.records.decisions[0].value.pending,true)
})

test('RuntimeFacade retains discarded bindings until cleaned and purges derived history without resurrecting old source versions',async t=>{
 const f=await fixture(t,{initialPolicy:policy()}),calls=installCreation(f)
 const created=await f.runtime.delegate(caller('root'),{description:'Build',prompt:'Implement',worktree:'/trees/archive',operationId:'archive-tree'},f.exec())
 const act=request=>f.runtime.worktreeAction(caller('root'),'root',request,signal())
 const first=(await act({action:'read'})).rows[0]
 const discarded=await act({action:'update',command:{operationId:'discard',bindingId:first.bindingId,expectedRevision:first.revision,state:'discarded'}})
 assert.equal((await f.read()).worktreeBindings.length,1)
 await act({action:'update',command:{operationId:'clean',bindingId:first.bindingId,expectedRevision:discarded.revision,state:'cleaned'}})
 assert.equal((await f.read()).worktreeBindings.length,0)
 const hist=request=>f.runtime.historyAction(caller('root'),'root',request,signal())
 const page=await hist({action:'query',query:{kind:'worktree'}})
 assert.equal(page.total,4)
 const purged=await hist({action:'purge',historyIds:page.rows.map(row=>row.historyId)})
 assert.equal(purged.scope,'derived-session-history')
 assert.equal(purged.sourceRecordsDeleted,false)
 assert.equal(purged.nativeConversationDeleted,false)
 await f.read();await f.reopen();await f.read()
 const detail=await hist({action:'detail',historyIds:page.rows.map(row=>row.historyId)})
 assert(detail.rows.every(row=>row.purged&&row.snapshot===null&&row.source===null))
 assert.equal((await act({action:'read'})).rows[0].history.length,4)
 assert.equal(calls.length,1)
 assert.equal(f.agents.get(created.childId).session.header.cwd,'/trees/archive')
})

test('RuntimeFacade rejects unsupported cwd and forged routing before effects, and preserves actual parent assignment scope',async t=>{
 const f=await fixture(t,{initialPolicy:policy()}),calls=installCreation(f,{supported:false})
 const delegate=request=>f.runtime.delegate(caller('root'),request,f.exec())
 await assert.rejects(delegate({description:'Build',prompt:'Implement',worktree:'/trees/A'}),/unsupported/)
 assert.equal(calls.length,0)
 assert.equal((await f.runtime.worktreeAction(caller('root'),'root',{action:'read'},signal())).rows.length,0)
 for(const forged of [{childId:'spoof'},{model:'override'},{modelOptions:{}},{ownerSessionId:'other'}])await assert.rejects(delegate({description:'Build',prompt:'Implement',...forged}),/unknown|unsupported|invalid|field/)
 await f.apply('put-workflow',{value:workflow})
 await f.apply('put-ticket',{localTicketId:'A',value:ticket()})
 await f.apply('put-ticket',{localTicketId:'B',value:ticket()})
 await f.assign('old-child','flow',['A'])
 await assert.rejects(f.runtime.delegate(caller('old-child'),{description:'Build',prompt:'Implement',workflowId:'flow',ticketIds:['B']},f.exec('old-child')),/assignment|scope|grant/)
 assert.equal(calls.length,0)
 const accepted=await f.runtime.delegate(caller('old-child'),{description:'Build',prompt:'Implement',workflowId:'flow',ticketIds:['A']},f.exec('old-child'))
 assert.equal(accepted.accepted,true)
 assert.deepEqual((await f.read(accepted.childId)).records.scope,{kind:'assigned',workflowId:'flow',ticketIds:['A']})
})

test('RuntimeFacade keeps accepted child identity when native header checkpoint fails and never redispatches',async t=>{
 const f=await fixture(t),calls=installCreation(f)
 f.ports.flushSession=async()=>false
 const request={description:'Build',prompt:'Implement',worktree:'/trees/uncertain',operationId:'checkpoint-failure'},exec=f.exec()
 const result=await f.runtime.delegate(caller('root'),request,exec)
 assert.equal(result.accepted,true)
 assert.equal(result.recording,'failed')
 const row=(await f.runtime.worktreeAction(caller('root'),'root',{action:'read'},signal())).rows[0]
 assert.equal(row.value.acceptance,'accepted')
 assert.equal(row.value.outcome,'accepted-unknown')
 const replay=await f.runtime.delegate(caller('root'),request,exec)
 assert.equal(replay.accepted,true)
 assert.equal(replay.childId,result.childId)
 assert.equal(calls.length,1)
 f.ports.flushSession=async()=>true
 const reconciled=await f.runtime.worktreeAction(caller('root'),'root',{action:'reconcile',operationId:'checkpoint-failure'},signal())
 assert.equal(reconciled.value.outcome,'confirmed')
})

test('RuntimeFacade injects changed or unconfirmed active context, keeps pending obligations, and retains explicit conclusions',async t=>{
 const f=await fixture(t,{initialPolicy:policy()})
 await f.apply('put-workflow',{value:workflow})
 await f.apply('put-ticket',{localTicketId:'A',value:ticket('partial','ticket-secret')})
 await f.apply('put-decision',{decisionId:'D',value:{question:'question-secret',status:'custom',pending:true,result:'durable useful conclusion'}})
 const act=request=>f.runtime.historyAction(caller('root'),'root',request,signal())
 await act({action:'set-context',kind:'ticket',recordId:JSON.stringify(['flow','A']),included:false})
 await act({action:'set-context',kind:'decision',recordId:JSON.stringify(['flow','D']),included:false})
 const messages=await f.runtime.preStep(caller('root'),signal())
 assert.equal(messages.length,1)
 const text=messages[0].content[0].text
 assert(!text.includes('ticket-secret'))
 assert(text.includes('question-secret'),'pending obligations cannot be hidden')
 assert.equal((await f.read()).records.tickets.length,1,'UI keeps full current records')
 const retry=await f.runtime.preStep(caller('root'),signal())
 assert.equal(retry.length,1,'this source-only fixture has no actual surface visibility proof')
 assert.equal(retry[0].content[0].text,text)
 assert(!f.runtime.context(caller('root')).includes('question-secret'),'system context is short tool pointers, not repeated instrument payload')
 await f.apply('put-decision',{decisionId:'D',value:{question:'question-secret',pending:false,awaitingImplementation:false,status:'custom'}})
 await act({action:'set-context',kind:'decision',recordId:JSON.stringify(['flow','D']),included:true})
 const sameStep=await f.runtime.postExecute(caller('root'),f.exec(),{isError:false,value:null})
 assert.equal(sameStep.length,0,'one bounded current view per admitted step')
 const changed=await f.runtime.preStep(caller('root'),signal())
 assert.equal(changed.length,1)
 assert(changed[0].content[0].text.includes('durable useful conclusion'))
 assert(!changed[0].content[0].text.includes('question-secret'))
})

test('RuntimeFacade history preserves native window payloads and real configuration changes without claiming old history',async t=>{
 const f=await fixture(t,{initialPolicy:policy()})
 await f.apply('put-workflow',{value:workflow})
 await f.apply('put-ticket',{localTicketId:'A',value:ticket()})
 await f.window('reserve','A')
 await f.window('release','A',{generation:1})
 const page=await f.runtime.historyAction(caller('root'),'root',{action:'query',query:{kind:'ticket-window',recordId:JSON.stringify(['flow','A'])}},signal())
 assert.equal(page.total,2)
 const detail=await f.runtime.historyAction(caller('root'),'root',{action:'detail',historyIds:page.rows.map(row=>row.historyId)},signal())
 assert.deepEqual(detail.rows.map(row=>row.snapshot.payload.action),['reserve','release'])
 assert(detail.rows.every(row=>row.source.kind==='program'&&row.source.recordedAt===null))
 const cfg=()=>f.runtime.historyAction(caller('root'),'root',{action:'query',query:{kind:'configuration'}},signal())
 const before=await cfg()
 assert(before.total>=1)
 await f.save(policy({enabled:true,ticketWindowSize:9,runningSubagentLimit:9}))
 const after=await cfg()
 assert.equal(after.total,before.total+1)
 assert.equal(before.rows[0].source.coverage,'snapshot-only')
 assert.equal(after.rows.at(-1).source.coverage,'recorded-history')
})

test('RuntimeFacade captures authored ticket versions without repeat growth and isolates owner history',async t=>{
 const f=await fixture(t,{initialPolicy:policy()})
 await f.apply('put-workflow',{value:workflow})
 await f.apply('put-ticket',{localTicketId:'A',value:ticket('partial','first')})
 await f.apply('put-ticket',{localTicketId:'A',value:ticket('repair','second')})
 const read=()=>f.runtime.historyAction(caller('root'),'root',{action:'query',query:{kind:'ticket',recordId:JSON.stringify(['flow','A'])}},signal())
 const page=await read()
 assert.equal(page.total,2)
 assert.equal(Object.hasOwn(page.rows[0],'snapshot'),false)
 const detail=await f.runtime.historyAction(caller('root'),'root',{action:'detail',historyIds:page.rows.map(row=>row.historyId)},signal())
 assert.deepEqual(detail.rows.map(row=>row.snapshot.summary),['first','second'])
 assert.equal(detail.rows[0].source.kind,'authored')
 assert.equal(detail.rows[0].source.author.principalId,'agent:root')
 assert.equal(typeof detail.rows[0].source.recordedAt,'number')
 await f.read();await f.read()
 assert.equal((await read()).total,2)
 await assert.rejects(f.runtime.historyAction(caller('old-child'),'old-child',{action:'query',query:{}},signal()),/coordinator/)
 assert.equal((await f.runtime.historyAction(caller('other'),'other',{action:'query',query:{kind:'ticket'}},signal())).total,0)
})

test('RuntimeFacade persists worktree intent before native creation and confirms actual header',async t=>{
 const f=await fixture(t),calls=installCreation(f),native=f.ports.createContinuable
 f.ports.createContinuable=async(exec,request)=>{
  const before=await f.runtime.worktreeAction(caller('root'),'root',{action:'read'},signal())
  assert.equal(before.rows.length,1)
  assert.equal(before.rows[0].value.plannedChildSessionId,request.childId)
  assert.equal(before.rows[0].value.outcome,'pending')
  return native(exec,request)
 }
 const first=await f.runtime.delegate(caller('root'),{description:'Build A',prompt:'Implement A',worktree:'/trees/A',operationId:'bind-A'},f.exec())
 assert.equal(first.accepted,true)
 assert.equal(calls[0].cwd,'/trees/A')
 const binding=await f.runtime.worktreeAction(caller('root'),'root',{action:'read'},signal())
 assert.equal(binding.rows[0].value.actualChildSessionId,first.childId)
 assert.equal(binding.rows[0].value.actualCwd,'/trees/A')
 assert.equal(binding.rows[0].value.outcome,'confirmed')
 assert.equal((await f.read()).worktreeBindings.length,1)
 assert.equal(Object.hasOwn((await f.read()).worktreeBindings[0],'history'),false)
})

test('RuntimeFacade delegates an uninstrumented child with native inherited cwd and durable call identity',async t=>{
 const f=await fixture(t),calls=installCreation(f),exec=f.exec('root','delegate-inherited')
 const request={description:'Research',prompt:'Inspect independently'}
 const first=await f.runtime.delegate(caller('root'),request,exec)
 assert.equal(first.accepted,true)
 assert.equal(calls.length,1)
 assert.equal(calls[0].provider,'spawn')
 assert.equal(calls[0].label,'Research')
 assert.equal(calls[0].prompt,'Inspect independently')
 assert.equal(Object.hasOwn(calls[0],'cwd'),false)
 assert.equal(first.childId,calls[0].childId)
 const replay=await f.runtime.delegate(caller('root'),request,exec)
 assert.equal(replay.childId,first.childId)
 assert.equal(replay.replayed,true)
 assert.equal(calls.length,1)
 await f.reopen()
 const recovered=await f.runtime.delegate(caller('root'),request,exec)
 assert.equal(recovered.childId,first.childId)
 assert.equal(calls.length,1)
})
