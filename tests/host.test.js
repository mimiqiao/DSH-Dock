import { test } from 'node:test'
import assert from 'node:assert/strict'
import { apply } from '../index.js'
import { initialState, fold } from '../model.js'
test('host registers versioned replayable projection with valid summary and no pending payload',()=>{
  let definition
  apply({inject:()=>{},get:name=>name==='sessionProjections'?{register:d=>{definition=d;return ()=>{}}}:null})
  assert.equal(definition.stateVersion,6)
  let state=definition.init()
  for(const e of [
    {type:'user/message',data:{content:[{type:'text',text:'制作网页'}]}},
    {type:'turn/start',data:{}},
    {type:'tool/call',data:{callId:'1',name:'write',arguments:'{"file_path":"/tmp/page.html","content":"<h1>作品</h1>"}'}},
    {type:'tool/result',data:{message:{toolCallId:'1',content:[{type:'text',text:'{"path":"/tmp/page.html","operation":"create"}'}]}}},
    {type:'turn/end',data:{reason:{kind:'completed'}}},
  ].map((e,i)=>({...e,seq:i,time:1000+i}))){state=definition.apply(state,e);definition.stateSchema.parse(state)}
  const view=definition.wire.viewSchema.parse(definition.wire.view(state))
  assert.equal(view.items[0].kind,'app');assert.equal(view.status,'ready');assert.equal('pending' in view,false)
})
test('structured blocked termination yields actionable status',()=>{
 const s=fold(initialState(),{type:'turn/end',seq:1,time:1000,data:{reason:{kind:'blocked'}}})
 assert.equal(s.status,'problem')
})
