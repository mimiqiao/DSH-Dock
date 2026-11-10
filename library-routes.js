import { MAX_BYTES, failure } from './library-store.js'
const HEADERS={'cache-control':'private, no-store','x-content-type-options':'nosniff'}
async function body(request,max){const chunks=[];let length=0;const reader=request.body?.getReader();if(!reader)return new Uint8Array();try{for(;;){const{value,done}=await reader.read();if(done)break;length+=value.length;if(length>max){await reader.cancel();throw failure('TOO_LARGE','请求内容过大。',413)}chunks.push(value)}}finally{reader.releaseLock()}const result=new Uint8Array(length);let offset=0;for(const chunk of chunks){result.set(chunk,offset);offset+=chunk.length}return result}
async function json(request){try{return JSON.parse(new TextDecoder().decode(await body(request,2*1024*1024)))}catch(e){if(e.code)throw e;throw failure('INVALID_JSON','请求数据无法读取。')}}
/** Exact Connection routes are authenticated and restricted to owner Peers by Harness. */
export function libraryRoutes(store){
  const guarded=handler=>async request=>{try{return await handler(request)}catch(e){return Response.json({error:{code:e.code||'INTERNAL',message:e.code?e.message:'保存失败，请重试。'}},{status:e.status||500,headers:HEADERS})}}
  return [
    {path:'/api/desk.library',methods:['GET','POST'],requestBody:'buffered',fetch:guarded(async request=>{
      if(request.method==='GET')return Response.json(await store.snapshot(),{headers:HEADERS})
      if(request.headers.get('content-type')?.split(';')[0]!=='application/json')throw failure('CONTENT_TYPE','请求类型必须为 application/json。',415)
      const input=await json(request);let result
      switch(input.action){
        case'register':result=await store.register(input.items);break
        case'annotate':result=await store.annotate(input.artifactId,input.expectedRevision,input.patch||{});break
        case'preference':result=await store.preference(input.mode,input.window);break
        case'reuse.begin':result=await store.beginReuse(input.operationId,input.selections,input.instruction,input.kind,input.destination);break
        case'reuse.update':result=await store.updateReuse(input.operationId,input.patch||{});break
        default:throw failure('INVALID_ACTION','未知操作。')
      }
      return Response.json(result,{headers:HEADERS})
    })},
    {path:'/api/desk.version',methods:['POST'],requestBody:'streaming',fetch:guarded(async request=>{
      const params=new URL(request.url).searchParams
      const bytes=await body(request,MAX_BYTES)
      return Response.json(await store.saveVersion(params.get('artifactId'),bytes,{source:params.get('source'),name:params.get('name'),mediaType:request.headers.get('content-type')}),{headers:HEADERS})
    })},
    {path:'/api/desk.content',methods:['GET'],requestBody:'buffered',fetch:guarded(async request=>{
      const{version,bytes}=await store.content(new URL(request.url).searchParams.get('versionId'))
      return new Response(bytes,{headers:{...HEADERS,'content-type':version.mediaType,'content-security-policy':"sandbox; default-src 'none'"}})
    })}
  ]
}
