import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mkdtemp, rm, readFile } from 'node:fs/promises'
import { join, isAbsolute, basename } from 'node:path'
import { tmpdir } from 'node:os'
import { pathToFileURL } from 'node:url'
import { execFileSync } from 'node:child_process'
import { OwnerDecisionPolicyStore, SessionInstruments, parseOwnerDecisionPolicyDocument, parseInstrumentDocument, createDomainInstrumentStorage, ownerDecisionPolicyTableName } from '../lib/controls/index.js'
import { createDomainVersionedStorage } from '../lib/controls/versioned-storage.js'
import { instrumentFixture } from './fixtures/instrument-fixture.mjs'
const hostRoot=process.env.DSH_CONTROLS_HOST_ROOT
async function nativeOpen(root,instanceId) {
 assert(hostRoot&&isAbsolute(hostRoot),'mandatory native fixture: set DSH_CONTROLS_HOST_ROOT to an isolated installed SDK root')
 assert(isAbsolute(root)&&basename(root).startsWith('dsh-recommendation-'),'only an explicit fresh temporary storage root is allowed')
 const load=parts=>import(pathToFileURL(join(hostRoot,'node_modules',...parts)).href)
 const {DomainFacility,defineDomain,domainTable}=await load(['@deepseek-ai','dsh-storage-domain','lib','index.js'])
 const {JsonStorageBackend}=await load(['@deepseek-ai','dsh-storage-json','lib','index.js'])
 const {z}=await load(['zod','index.js'])
 const backend=new JsonStorageBackend(root)
 const facility=new DomainFacility({storage:{backend:{get(){return backend}}},emit(){},logger:{warn(){},error(){}}},{backend:'json'})
 const close=async()=>{try{await facility.closeAll()}finally{await backend.close()}}
 try {
  const policyName=ownerDecisionPolicyTableName(instanceId)
  const policy=await facility.open(defineDomain({name:policyName,version:1,layout:'single',tables:{state:domainTable(z.unknown().transform(parseOwnerDecisionPolicyDocument))}}))
  const records=await facility.open(defineDomain({name:'recommendation_records_probe',version:1,layout:'single',tables:{state:domainTable(z.unknown().transform(parseInstrumentDocument))}}))
  return {policy:policy.table('state'),records:records.table('state'),policyName,close}
 }catch(error){await close();throw error}
}
async function temporary(t) {
 const root=await mkdtemp(join(tmpdir(),'dsh-recommendation-'))
 t.after(async()=>{assert(isAbsolute(root)&&basename(root).startsWith('dsh-recommendation-'));await rm(root,{recursive:true,force:true})})
 return root
}
const author={kind:'user',principalId:'user',sessionId:null}
const make=(storage)=>new OwnerDecisionPolicyStore({storageFor:()=>storage,now:()=>12345,newEpochId:()=> 'native-epoch',authorizeOperator:async a=>assert.deepEqual(a,author),authorizeEnable:async()=>{}})
const storage=table=>createDomainVersionedStorage(table,'state',parseOwnerDecisionPolicyDocument)
const question={question:'Native source question',status:'open',pending:true,awaitingImplementation:true,result:null,context:'Preserve task commitments',addressee:{kind:'user',principalId:'user'},options:[{key:'B',label:'recommended'}],recommendation:'B'}
test('native JSON V4 checkpoint and cold handle recovery preserve policy source, nullable result, taskrefs and durable operation replay',async t=>{
 const root=await temporary(t),f=await instrumentFixture(),instance=(await f.read()).instance
 let native=await nativeOpen(root,instance.instrumentInstanceId);t.after(()=>native.close())
 let policy=make(storage(native.policy))
 const request={operationId:'enable',expectedRevision:0,expectedScope:instance,action:'enable',durationMs:3600000}
 await policy.save(instance,request,author)
 let instruments=new SessionInstruments(f.controls,createDomainInstrumentStorage(native.records),f.authority,()=>12345,policy)
 const apply=async(action,fields)=>instruments.apply('A','A',{operationId:crypto.randomUUID(),expectedRevision:(await instruments.read('A','A')).businessRevision,workflowId:'flow',action,...fields})
 await apply('put-workflow',{value:{title:'Task',axes:[]}})
 await apply('put-task-reference',{localTicketId:'T1',value:{source:{kind:'unverified'},locator:'source:task'}})
 await apply('put-decision',{decisionId:'D',value:{...question,ticketIds:['T1']},references:['task:commitments']})
 const before=await instruments.read('A','A'),candidate=before.decisions[0].recommendationSupport.candidate
 const command={operationId:'adopt',expectedRevision:before.businessRevision,workflowId:'flow',decisionId:'D',action:'adopt-decision-recommendation',references:['task:adoption'],value:{optionKey:'B',decisionRevision:candidate.decisionRevision,policyEpochId:candidate.policyEpochId,policyRevision:candidate.policyRevision}}
 const adopted=await instruments.apply('A','A',command)
 await instruments.compact('A','A',{operationId:'compact',expectedRevision:adopted.snapshot.revision})
 await native.close();native=await nativeOpen(root,instance.instrumentInstanceId)
 policy=make(storage(native.policy));instruments=new SessionInstruments(f.controls,createDomainInstrumentStorage(native.records),f.authority,()=>12345,policy)
 assert.equal((await policy.save(instance,request,author)).replayed,true)
 const replay=await instruments.apply('A','A',command),current=await instruments.readCurrent('A','A')
 assert.equal(replay.replayed,true);assert.equal(replay.recommendation.selection.policy.authorizedBy.principalId,'user')
 assert.equal(current.decisions[0].policySelection.decisionSourceRevision,3)
 assert.equal(current.decisions[0].value.result,null);assert.equal(current.decisions[0].value.awaitingImplementation,true)
 assert.equal(current.decisions[0].provenance.author.kind,'agent');assert.deepEqual(current.decisions[0].provenance.references,['task:commitments','task:adoption'])
 assert.equal(current.taskReferences[0].localTicketId,'T1')
 const raw=await readFile(join(root,'recommendation_records_probe.json'),'utf8');assert(raw.includes('policySelection'))
 const child=execFileSync(process.execPath,['--input-type=module','-e',
  'import {readFileSync} from "node:fs";import {parseInstrumentDocument,projectInstrumentDocument} from '+JSON.stringify(new URL('../lib/controls/instrument-state.js',import.meta.url).href)+';const raw=JSON.parse(readFileSync(process.argv[1],"utf8"));function visit(v){if(v&&typeof v==="object"){if(v.schemaVersion===4&&Array.isArray(v.events)){const state=projectInstrumentDocument(parseInstrumentDocument(v));console.log(JSON.stringify({selection:state.decisions[0].policySelection,refs:state.taskReferences.length}));return true}for(const x of Object.values(v))if(visit(x))return true}return false}if(!visit(raw))throw Error("no V4 document")',join(root,'recommendation_records_probe.json')],{encoding:'utf8'})
 assert.equal(JSON.parse(child).selection.selectedOptionKey,'B');assert.equal(JSON.parse(child).refs,1)
})
test('native policy durable write then lost receipt remains uncertain for new wrappers until a truly fresh backend reopens',async t=>{
 const root=await temporary(t),f=await instrumentFixture(),instance=(await f.read()).instance
 let native=await nativeOpen(root,instance.instrumentInstanceId);t.after(()=>native.close())
 const lost=Error('native durable receipt lost'),table=native.policy
 const fault={get:key=>table.get(key),put:async(...args)=>{await table.put(...args);throw lost},update:(...args)=>table.update(...args)}
 const request={operationId:'lost-enable',expectedRevision:0,expectedScope:instance,action:'enable',durationMs:3600000}
 await assert.rejects(make(storage(fault)).save(instance,request,author),e=>e===lost)
 await assert.rejects(make(storage(fault)).read(instance),e=>e.code==='storage-uncertain')
 await native.close();native=await nativeOpen(root,instance.instrumentInstanceId)
 const reopened=make(storage(native.policy)),replay=await reopened.save(instance,request,author)
 assert.equal(replay.replayed,true);assert.equal(replay.appliedRevision,1);assert.equal(replay.state.epoch.expiresAt,3612345)
})
