import test from 'node:test'
import assert from 'node:assert/strict'
import { createPolicyCheck } from '../src/policy-action.mjs'
test('absence of approval always denies',async()=>{
  for(const response of [undefined,null,false,{},'yes',{allow:0}]){
    const policy=createPolicyCheck(()=>response)
    assert.deepEqual(await policy({kind:'write'},{}),{allow:false,reason:'policy-denied'})
  }
})
test('only host-owned approval passes; reasons are bounded',async()=>{
  const policy=createPolicyCheck((action,facts)=>facts.targetRead&&action.kind==='comment'?{allow:true}:{allow:false,reason:'target-not-read'})
  assert.deepEqual(await policy({kind:'comment'},{targetRead:false}),{allow:false,reason:'target-not-read'})
  assert.deepEqual(await policy({kind:'comment'},{targetRead:true}),{allow:true})
})
test('no executor or permission is synthesized; malformed proposal rejects',async()=>{
  assert.throws(()=>createPolicyCheck(null),/Trusted policy/)
  const p=createPolicyCheck(()=>true)
  await assert.rejects(p(null),/proposal/)
  assert.equal(typeof p.execute,'undefined')
})
