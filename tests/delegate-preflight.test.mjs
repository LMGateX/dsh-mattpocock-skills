import assert from 'node:assert/strict'
import {test} from 'node:test'
import {fixture,policy,caller} from './fixtures/runtime-host.mjs'

test('denied worktree preflight writes neither delegation fence nor binding intent and never calls native creation',async t=>{
 const f=await fixture(t,{initialPolicy:policy()});f.ports.capabilities={...f.ports.capabilities,nativeInitialChildCwd:'supported'}
 let starts=0;f.ports.createContinuable=async()=>{starts++;return {childId:'should-not-create',messageId:'none'}}
 const reason=new Error('outside parent native workspace');f.ports.authorizeInitialChildCwd=async()=>{throw reason}
 const before=[...f.units.keys()]
 await assert.rejects(f.runtime.delegate(caller('root'),{description:'task',prompt:'work',worktree:'/outside',operationId:'preflight-denied'},f.exec()),error=>error===reason)
 assert.equal(starts,0);assert.deepEqual([...f.units.keys()],before)
})
