import { promises as fs } from 'node:fs'
import { join } from 'node:path'
import { createHash, randomUUID } from 'node:crypto'
export const MAX_BYTES = 50 * 1024 * 1024
export function failure(code,message,status=400){const error=new Error(message);Object.assign(error,{code,status});return error}
const empty=()=>({format:1,revision:0,artifacts:{},aliases:{},versions:{},reuses:{},preferences:{mode:'objects'}})
const safeId=id=>typeof id==='string'&&/^[a-zA-Z0-9-]{1,80}$/.test(id)&&!['constructor','prototype','__proto__'].includes(id)
const own=(map,key)=>Object.hasOwn(map,key)?map[key]:undefined
const clone=value=>structuredClone(value)
function aliasesOf(item){return [...new Set([item.id&&`id:${item.id}`,item.path&&`path:${item.path}`,item.attachmentId&&`attachment:${item.attachmentId}`,...(item.previousPaths||[]).map(p=>`path:${p}`)].filter(Boolean))].map(key=>`${item.sessionId}::${key}`)}
/** Single Host-owned catalog. On-disk lock serializes multiple writers; publish only after durable rename. */
export class LibraryStore {
  constructor(root){this.root=root;this.queue=Promise.resolve()}
  async init(){await fs.mkdir(join(this.root,'blobs'),{recursive:true,mode:0o700});await this.read();return this}
  async read(){try{const data=JSON.parse(await fs.readFile(join(this.root,'library.json'),'utf8'));if(data.format!==1||!data.artifacts||!data.aliases||!data.versions||!data.reuses)throw new Error('unsupported catalog');return data}catch(e){if(e.code==='ENOENT')return empty();throw failure('CATALOG_INVALID','成果库数据无法读取，已保留原文件，请检查后重试。',500)}}
  async snapshot(){await this.queue;return clone(await this.read())}
  transaction(change){
    const task=this.queue.catch(()=>{}).then(async()=>{
      const lock=join(this.root,'write.lock');let handle
      for(let attempt=0;attempt<100;attempt++){
        try{handle=await fs.open(lock,'wx',0o600);await handle.writeFile(JSON.stringify({pid:process.pid,time:Date.now()}));break}
        catch(e){if(e.code!=='EEXIST')throw e
          try{const info=await fs.stat(lock);let owner;try{owner=JSON.parse(await fs.readFile(lock,'utf8'))}catch{};let stale=false
            if(Number.isInteger(owner?.pid)&&owner.pid>0){try{process.kill(owner.pid,0)}catch(error){stale=error.code==='ESRCH'}}else stale=Date.now()-info.mtimeMs>30000
            if(stale&&(await fs.stat(lock)).ino===info.ino){await fs.unlink(lock);continue}
          }catch(error){if(error.code==='ENOENT')continue}
          await new Promise(r=>setTimeout(r,20))
        }
      }
      if(!handle)throw failure('BUSY','成果库正在保存，请稍后重试。',409)
      try{
        const data=await this.read();const before=JSON.stringify(data);const value=await change(data)
        if(JSON.stringify(data)!==before){data.revision++;const temp=join(this.root,`library-${randomUUID()}.tmp`);const file=await fs.open(temp,'wx',0o600);try{await file.writeFile(JSON.stringify(data));await file.sync()}finally{await file.close()};await fs.rename(temp,join(this.root,'library.json'))}
        return clone(value)
      }finally{await handle.close();await fs.unlink(lock)}
    });this.queue=task.then(()=>{},()=>{});return task
  }
  async register(items){
    if(!Array.isArray(items)||items.length>500)throw failure('INVALID_ITEMS','一次最多整理 500 项成果。')
    return this.transaction(data=>{
      for(const source of items){
        if(typeof source.sessionId!=='string'||typeof source.id!=='string'||typeof source.title!=='string')throw failure('INVALID_ITEM','成果缺少来源信息。')
        const aliases=aliasesOf(source);const ids=[...new Set(aliases.map(a=>data.aliases[a]).filter(Boolean))]
        ids.sort((a,b)=>data.artifacts[a].createdAt-data.artifacts[b].createdAt)
        const id=ids[0]||randomUUID()
        const record=data.artifacts[id]||{artifactId:id,important:false,note:'',revision:0,createdAt:source.firstTime||source.time||Date.now()}
        // A shared path/attachment alias is explicit evidence, never a same-name guess.
        for(const mergedId of ids.slice(1)){
          const merged=data.artifacts[mergedId];record.important ||= merged.important;if(merged.important&&!record.importantAt)record.importantAt=merged.importantAt||merged.annotatedAt
          record.note=[...new Set([record.note,merged.note].filter(Boolean))].join('\n')
          record.revision=Math.max(record.revision,merged.revision)+1
          if((merged.source?.seq||0)>(record.source?.seq||0))record.source=merged.source
          for(const alias of Object.keys(data.aliases))if(data.aliases[alias]===mergedId)data.aliases[alias]=id
          for(const version of Object.values(data.versions))if(version.artifactId===mergedId)version.artifactId=id
          for(const reuse of Object.values(data.reuses))for(const selection of reuse.selections)if(selection.artifactId===mergedId)selection.artifactId=id
          delete data.artifacts[mergedId]
        }
        // Keep user metadata separate from replayable discovery data.
        if(!record.source||!Number.isFinite(record.source.seq)||source.seq>=record.source.seq)record.source=clone(source);if(source.firstTime>0)record.createdAt=Math.min(record.createdAt,source.firstTime);record.updatedAt=source.time||Date.now();data.artifacts[id]=record
        for(const alias of aliases)data.aliases[alias]=id
      }
      return data
    })
  }
  async annotate(id,expectedRevision,patch){return this.transaction(data=>{
    const record=safeId(id)?own(data.artifacts,id):undefined;if(!record)throw failure('NOT_FOUND','成果不存在。',404)
    if(!Number.isInteger(expectedRevision)||expectedRevision<0||expectedRevision!==record.revision)throw failure('CONFLICT','另一处已修改这件成果，已保留修改，请刷新后重试。',409)
    if(patch.important!==undefined){if(typeof patch.important!=='boolean')throw failure('INVALID_PATCH','重要标记无效。');if(record.important!==patch.important)record.importantAt=patch.important?Date.now():null;record.important=patch.important}
    if(patch.note!==undefined){if(typeof patch.note!=='string'||patch.note.length>4000)throw failure('INVALID_PATCH','备注最多 4000 字。');record.note=patch.note}
    record.revision++;record.annotatedAt=Date.now();return record
  })}
  async preference(mode,window){if(!['objects','mac'].includes(mode))throw failure('INVALID_MODE','桌面模式无效。');return this.transaction(data=>{data.preferences.mode=mode;if(window){if(!Number.isFinite(window.x)||!Number.isFinite(window.y)||Math.abs(window.x)>2000||Math.abs(window.y)>2000||typeof window.maximized!=='boolean')throw failure('INVALID_WINDOW','窗口位置无效。');data.preferences.window={x:window.x,y:window.y,maximized:window.maximized}}return data.preferences})}
  async saveVersion(id,bytes,meta={}){
    if(!(bytes instanceof Uint8Array)||bytes.byteLength>MAX_BYTES)throw failure('TOO_LARGE','保存版本最多支持 50 MiB。',413)
    if(!['file','attachment','saved-preview','discussion'].includes(meta.source))throw failure('INVALID_SOURCE','版本来源无效。')
    const hash=createHash('sha256').update(bytes).digest('hex')
    return this.transaction(async data=>{
      const record=safeId(id)?own(data.artifacts,id):undefined;if(!record)throw failure('NOT_FOUND','成果不存在。',404)
      const existing=Object.values(data.versions).find(v=>v.artifactId===id&&v.hash===hash&&v.source===meta.source)
      const blob=join(this.root,'blobs',hash)
      let complete=false
      try{complete=createHash('sha256').update(await fs.readFile(blob)).digest('hex')===hash}catch(e){if(e.code!=='ENOENT')throw e}
      if(!complete){const temp=blob+'.'+randomUUID()+'.tmp';const file=await fs.open(temp,'wx',0o600);try{await file.writeFile(bytes);await file.sync()}finally{await file.close()};await fs.rename(temp,blob)}
      // A retry can recover an interrupted or corrupted private content-addressed copy.
      if(createHash('sha256').update(await fs.readFile(blob)).digest('hex')!==hash)throw failure('BLOB_INVALID','保存的内容校验失败，请重试。',500)
      if(existing)return existing
      const version={versionId:randomUUID(),artifactId:id,hash,bytes:bytes.length,source:meta.source,mediaType:String(meta.mediaType||'application/octet-stream'),fileName:String(meta.name||record.source.title).replace(/[\/\\\0]/g,'_').slice(0,240),savedAt:Date.now(),title:record.source.title,kind:record.source.kind,sessionId:record.source.sessionId,sourceSeq:record.source.seq,...(record.source.path?{sourcePath:record.source.path}:{})}
      data.versions[version.versionId]=version;return version
    })
  }
  async content(versionId){if(!safeId(versionId))throw failure('INVALID_VERSION','版本标识无效。');const data=await this.snapshot(),version=own(data.versions,versionId);if(!version)throw failure('NOT_FOUND','保存版本不存在。',404);const bytes=await fs.readFile(join(this.root,'blobs',version.hash));if(createHash('sha256').update(bytes).digest('hex')!==version.hash)throw failure('BLOB_INVALID','保存版本校验失败。',500);return{version,bytes}}
  async beginReuse(operationId,selections,instruction,kind,destination={}){
    if(!safeId(operationId)||!Array.isArray(selections)||!selections.length||selections.length>12||typeof instruction!=='string'||!instruction.trim()||instruction.length>10000||!['continue','template'].includes(kind))throw failure('INVALID_REUSE','请选择成果并填写这次任务的要求。')
    return this.transaction(data=>{
      if(own(data.reuses,operationId)){const old=data.reuses[operationId];if(JSON.stringify(old.selections)!==JSON.stringify(selections)||old.instruction!==instruction||old.kind!==kind||old.destination&&JSON.stringify(old.destination)!==JSON.stringify(destination))throw failure('CONFLICT','该操作已提交不同内容，请重新准备任务。',409);if(!old.destination)old.destination=clone(destination);return old}
      for(const selected of selections){if(!selected||!safeId(selected.artifactId)||!own(data.artifacts,selected.artifactId)||selected.versionId&&(!safeId(selected.versionId)||own(data.versions,selected.versionId)?.artifactId!==selected.artifactId))throw failure('INVALID_SOURCE','复用来源已变化，请重新选择。')}
      const reuse={operationId,selections:clone(selections),instruction,kind,destination:clone(destination),status:'preparing',createdAt:Date.now(),targetSessionId:null,requestId:randomUUID(),receipts:[]}
      data.reuses[operationId]=reuse;return reuse
    })
  }
  async updateReuse(id,patch){return this.transaction(data=>{
    const record=safeId(id)?own(data.reuses,id):undefined;if(!record)throw failure('NOT_FOUND','复用任务不存在。',404)
    if(record.status==='submitted')return record
    if(patch.resetCreation===true){if(record.targetSessionId)throw failure('CONFLICT','已有目标会话，请继续该任务。',409);record.creating=false}
    if(patch.creating===true){if(record.creating&&!record.targetSessionId)throw failure('CREATION_PENDING','会话创建尚未确认，请先核对会话列表。',409);record.creating=true}
    if(patch.targetSessionId!==undefined){if(typeof patch.targetSessionId!=='string'||!patch.targetSessionId)throw failure('INVALID_TARGET','目标会话无效。');if(record.targetSessionId&&record.targetSessionId!==patch.targetSessionId)throw failure('CONFLICT','复用任务已有目标会话。',409);record.targetSessionId=patch.targetSessionId}
    if(patch.status==='submitted'){if(!record.targetSessionId)throw failure('NO_TARGET','尚未创建目标会话。');record.status='submitted';record.submittedAt=Date.now()}
    if(patch.receipts!==undefined){if(!Array.isArray(patch.receipts)||patch.receipts.length>12)throw failure('INVALID_RECEIPTS','上传回执无效。');record.receipts=clone(patch.receipts)}
    return record
  })}
}
