import {test} from 'node:test'
import assert from 'node:assert/strict'
import {buildReview,recordFor} from '../review-model.js'
import {submitReuse} from '../library-client.js'
test('review counts only true submitted reuses and distinguishes saved versions',()=>{
 const now=Date.now(),library={artifacts:{a:{artifactId:'a',source:{title:'作品',kind:'app'},createdAt:now,important:true,importantAt:now}},versions:{v:{versionId:'v',artifactId:'a',title:'作品',savedAt:now}},reuses:{r:{operationId:'r',status:'preparing',createdAt:now},s:{operationId:'s',status:'submitted',submittedAt:now,instruction:'下一版'}}}
 const [month]=buildReview(library);assert.equal(month.artifacts.length,1);assert.equal(month.important.length,1);assert.equal(month.versions.length,1);assert.equal(month.reuses.length,1);assert.ok(month.events.find(e=>e.versionId==='v'))
 assert.equal(recordFor({aliases:{'s::path:/a':'id'},artifacts:{id:{artifactId:'id'}}},{sessionId:'s',path:'/a'}).artifactId,'id')
})
test('reuse uploads exact bytes into new session and uses file receipts and stable request ID',async()=>{
 let operation={requestId:'request-1',targetSessionId:null,receipts:[],status:'preparing'},creates=0,prompts=0
 const api={command:async(action,args)=>{if(action==='reuse.begin')return structuredClone(operation);Object.assign(operation,args.patch);return structuredClone(operation)}}
 const sessions={create:async()=>{creates++;return'new'},using:async(id,opts,callback)=>callback({binding:{session:{prompt:async(content,mode,signal,requestId)=>{prompts++;assert.equal(requestId,'request-1');assert.equal(content[1].receiptId,'receipt');return{ok:true}}}}})}
 const prepared=[{blob:new Blob(['all bytes']),name:'deck.pptx',label:'当前文件'}]
 const options={api,operationId:'op',selections:[{artifactId:'a'}],instruction:'更新数据',kind:'continue',prepared,sessions,upload:async(id,blob)=>{assert.equal(await blob.text(),'all bytes');return{ok:true,value:{receiptId:'receipt'}}}}
 await submitReuse(options);await submitReuse(options);assert.equal(creates,1);assert.equal(prompts,1)
})
