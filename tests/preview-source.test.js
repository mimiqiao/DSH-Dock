import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readWorkBlob } from '../preview-source.js'
const item={kind:'image',path:'/private/tmp/desk-icon.png',attachmentId:'sha256:stored'}
test('missing temporary original opens durable preview instead of failing 404',async()=>{
 let reads=0
 const result=await readWorkBlob(item,{fileUrl:p=>p,fetchFile:async()=>new Response(null,{status:404}),readAttachment:async()=>{reads++;return new Blob(['stored'],{type:'image/webp'})}})
 assert.equal(reads,1);assert.equal(result.source,'saved-preview');assert.equal(await result.blob.text(),'stored')
})
test('current original wins over saved preview; no needless attachment reads',async()=>{
 const result=await readWorkBlob(item,{fileUrl:p=>p,fetchFile:async()=>new Response('current'),readAttachment:()=>{throw new Error('should not read')}})
 assert.equal(result.source,'file');assert.equal(await result.blob.text(),'current')
})
test('permission failures stay distinct; missing file without attachment is explained',async()=>{
 await assert.rejects(readWorkBlob(item,{fileUrl:p=>p,fetchFile:async()=>new Response(null,{status:403}),readAttachment:()=>{throw new Error('must not bypass')}}),e=>e.code==='FORBIDDEN')
 await assert.rejects(readWorkBlob({path:'/tmp/gone.png'},{fileUrl:p=>p,fetchFile:async()=>new Response(null,{status:404})}),e=>e.code==='FILE_MISSING')
})
test('attachment-only works load and aborted reads do not start',async()=>{
 const result=await readWorkBlob({kind:'image',attachmentId:'saved'},{fileUrl:()=>null,readAttachment:async()=>new Blob(['image'])})
 assert.equal(result.source,'attachment')
 const ctrl=new AbortController();ctrl.abort()
 await assert.rejects(readWorkBlob(item,{fileUrl:()=>{throw new Error('should not run')},signal:ctrl.signal}),e=>e.name==='AbortError')
})
