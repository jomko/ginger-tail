import test from 'node:test'
import assert from 'node:assert/strict'
import { createMemoryContinuity } from '../src/memory-continuity.mjs'
const memory = (verifyEvidence = async () => true) => {
  const notes = [], calls = []
  const port = createMemoryContinuity({
    recall: async (query, opts) => { calls.push([query,opts]); return notes.map((x,i)=>({ path:x.source, text:x.text, score:i })) },
    verifyEvidence, append: async note => { notes.push(note) },
  })
  return { port, notes, calls }
}
test('no write without host-verified source and no truth upgrade', async () => {
  const {port,notes}=memory(async()=>false)
  assert.deepEqual(await port.remember({source:'synthetic:42',text:'A speculation'}),{status:'denied',reason:'evidence-not-verified'})
  assert.equal(notes.length,0)
  assert.deepEqual(await port.recall('speculation'),[])
})
test('source verified by host is appended once and retrievable across calls', async () => {
  const {port,notes,calls}=memory()
  const note={source:'synthetic:42',text:'An observed scene'}
  assert.deepEqual(await port.remember(note),{status:'recorded',classification:'observation-not-fact'})
  assert.deepEqual(await port.recall('scene',{limit:2,maxChars:500}),[{path:note.source,text:note.text,score:0}])
  assert.deepEqual(calls,[['scene',{limit:2,maxChars:500}]])
  assert.deepEqual(notes,[note])
})
test('recall cannot return truncated or unsourced material', async()=>{
  const port=createMemoryContinuity({
    recall:()=>[{path:'a',text:'ok'},{path:'',text:'unproven'},{path:'c',text:'a'.repeat(20)}],
    verifyEvidence:()=>true,append:()=>{} })
  assert.deepEqual(await port.recall('q',{limit:3,maxChars:5}),[{path:'a',text:'ok'}])
})
test('invalid notes and bounds fail closed before any host adapter effect',async()=>{
  let calls=0
  const port=createMemoryContinuity({recall:()=>{calls++;return []},verifyEvidence:()=>{calls++;return true},append:()=>{calls++}})
  await assert.rejects(port.remember({source:'',text:'bad'}),/Invalid source/)
  await assert.rejects(port.recall('x',{limit:21}),/Invalid memory/)
  assert.equal(calls,0)
})
