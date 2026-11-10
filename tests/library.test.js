import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp,readFile,writeFile,rm,readdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { LibraryStore } from '../library-store.js'
import { libraryRoutes } from '../library-routes.js'
const item=(path='/a.md')=>({id:`file:${path}`,path,title:path.slice(1),kind:'document',sessionId:'session-a',seq:1,firstSeq:1,time:1000})
async function setup(t){const root=await mkdtemp(join(tmpdir(),'desk-library-'));t.after(()=>rm(root,{recursive:true,force:true}));return{root,store:await new LibraryStore(root).init()}}
test('important flags/notes survive reopen and projection replay with stable identity',async t=>{
 const{root,store}=await setup(t);let state=await store.register([item()]);const id=Object.keys(state.artifacts)[0]
 await store.annotate(id,0,{important:true,note:'下次复用'})
 await store.register([{...item(),title:'新的显示名称',seq:2}])
 state=await new LibraryStore(root).init().then(s=>s.snapshot())
 assert.equal(Object.keys(state.artifacts).length,1);assert.equal(state.artifacts[id].important,true);assert.equal(state.artifacts[id].note,'下次复用')
 await assert.rejects(store.annotate(id,0,{note:'stale'}),e=>e.code==='CONFLICT')
})
test('path aliases preserve identity across proven rename; same filenames in other sessions stay distinct',async t=>{
 const{store}=await setup(t);const old=await store.register([item()]);const id=Object.keys(old.artifacts)[0]
 const state=await store.register([{...item('/renamed.md'),previousPaths:['/a.md']},{...item(),sessionId:'another'}])
 assert.equal(state.aliases['session-a::path:/renamed.md'],id);assert.equal(Object.keys(state.artifacts).length,2)
})
test('concurrent writers serialize and optimistic updates reject stale clients',async t=>{
 const{root,store}=await setup(t);const other=await new LibraryStore(root).init();const state=await store.register([item()]);const id=Object.keys(state.artifacts)[0]
 const results=await Promise.allSettled([store.annotate(id,0,{important:true}),other.annotate(id,0,{note:'other'})])
 assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(results.filter(r=>r.status==='rejected')[0].reason.code,'CONFLICT')
 assert.equal((await store.snapshot()).artifacts[id].revision,1)
})
test('saved versions persist exact bytes independently of original; duplicate content is deduplicated',async t=>{
 const{root,store}=await setup(t);const id=Object.keys((await store.register([item()])).artifacts)[0]
 const original=new TextEncoder().encode('完整的内容\n不截断')
 const v=await store.saveVersion(id,original,{source:'file',mediaType:'text/plain'})
 assert.equal((await store.saveVersion(id,original,{source:'file'})).versionId,v.versionId)
 const loaded=await new LibraryStore(root).init().then(s=>s.content(v.versionId))
 assert.deepEqual(new Uint8Array(loaded.bytes),original);assert.equal((await readdir(join(root,'blobs'))).length,1)
 await writeFile(join(root,'blobs',v.hash),'corrupt')
 await assert.rejects(store.content(v.versionId),e=>e.code==='BLOB_INVALID')
})
test('reuse operations are idempotent, source-bound and count only submitted tasks',async t=>{
 const{store}=await setup(t);const artifactId=Object.keys((await store.register([item()])).artifacts)[0]
 const selections=[{artifactId}];const a=await store.beginReuse('op-1',selections,'做下一版','continue');const b=await store.beginReuse('op-1',selections,'做下一版','continue')
 assert.equal(a.requestId,b.requestId);await assert.rejects(store.updateReuse('op-1',{status:'submitted'}),e=>e.code==='NO_TARGET')
 await store.updateReuse('op-1',{targetSessionId:'new-session'});await store.updateReuse('op-1',{status:'submitted'})
 const state=await store.snapshot();assert.equal(Object.values(state.reuses).filter(r=>r.status==='submitted').length,1)
 await assert.rejects(store.beginReuse('op-1',selections,'不同任务','continue'),e=>e.code==='CONFLICT')
})
test('bad catalog fails without replacing user data; invalid content IDs cannot traverse paths',async t=>{
 const{root,store}=await setup(t);await writeFile(join(root,'library.json'),'broken')
 await assert.rejects(store.snapshot(),e=>e.code==='CATALOG_INVALID');assert.equal(await readFile(join(root,'library.json'),'utf8'),'broken')
 await assert.rejects(store.content('../../secret'),e=>e.code==='INVALID_VERSION')
})
test('real route handlers persist preferences and return explicit conflicts/errors',async t=>{
 const{store}=await setup(t);const routes=libraryRoutes(store);const route=routes.find(r=>r.path==='/api/desk.library')
 const request=action=>new Request('http://local/api/desk.library',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(action)})
 assert.equal((await route.fetch(request({action:'preference',mode:'mac'}))).status,200)
 assert.equal((await (await route.fetch(new Request('http://local/api/desk.library'))).json()).preferences.mode,'mac')
 assert.equal((await route.fetch(request({action:'unknown'}))).status,400)
})
test('retry recovers dead writer lock and interrupted private blob without publishing a false version',async t=>{
 const{root,store}=await setup(t);await writeFile(join(root,'write.lock'),JSON.stringify({pid:2147483647,time:1}))
 const id=Object.keys((await store.register([item()])).artifacts)[0],bytes=new TextEncoder().encode('complete')
 const v=await store.saveVersion(id,bytes,{source:'file'});await writeFile(join(root,'blobs',v.hash),'partial')
 assert.equal((await store.saveVersion(id,bytes,{source:'file'})).versionId,v.versionId)
 assert.equal((await store.content(v.versionId)).bytes.toString(),'complete')
})
test('proven attachment/path identity merges preserve both notes, stars and saved versions',async t=>{
 const{store}=await setup(t);const initial=await store.register([item('/picture.png'),{...item(),id:'attachment:saved',path:undefined,attachmentId:'saved',title:'picture.png',kind:'image'}])
 const ids=Object.keys(initial.artifacts);await store.annotate(ids[0],0,{note:'第一份备注'});await store.annotate(ids[1],0,{important:true,note:'第二份备注'})
 const v=await store.saveVersion(ids[1],new Uint8Array([1]),{source:'attachment',mediaType:'image/webp',name:'picture.webp'})
 const merged=await store.register([{...item('/picture.png'),attachmentId:'saved',kind:'image',seq:2}])
 assert.equal(Object.keys(merged.artifacts).length,1);const record=Object.values(merged.artifacts)[0];assert.equal(record.important,true);assert.match(record.note,/第一份备注/);assert.match(record.note,/第二份备注/);assert.equal(merged.versions[v.versionId].artifactId,record.artifactId);assert.equal(merged.versions[v.versionId].fileName,'picture.webp')
})
test('delayed discovery cannot replace newer file source metadata',async t=>{
 const{store}=await setup(t);await store.register([{...item(),seq:20,title:'最新标题'}]);const old=await store.register([{...item(),seq:1,title:'旧标题'}]);assert.equal(Object.values(old.artifacts)[0].source.title,'最新标题')
})
test('reserved object keys and unconfirmed creation cannot mutate catalog or create duplicates',async t=>{
 const{store}=await setup(t);await assert.rejects(store.annotate('__proto__',undefined,{important:true}),e=>e.code==='NOT_FOUND');assert.equal({}.important,undefined)
 await assert.rejects(store.beginReuse('constructor',[],'test','continue'),e=>e.code==='INVALID_REUSE')
 const id=Object.keys((await store.register([item()])).artifacts)[0];await store.beginReuse('pending',[{artifactId:id}],'下一版','continue');await store.updateReuse('pending',{creating:true})
 await assert.rejects(store.updateReuse('pending',{creating:true}),e=>e.code==='CREATION_PENDING')
 await store.updateReuse('pending',{resetCreation:true});assert.equal((await store.updateReuse('pending',{creating:true})).creating,true)
})
