export function monthKey(time){const d=new Date(time);return`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`}
/** Every card is backed by a real artifact/version/reuse event; old current paths are not historical snapshots. */
export function buildReview(library){
  const months=new Map()
  const add=(time,event)=>{if(!Number.isFinite(time)||time<=0)return;const key=monthKey(time);if(!months.has(key))months.set(key,{key,events:[],artifacts:[],versions:[],reuses:[],important:[]});const bucket=months.get(key);bucket.events.push({...event,time});bucket[event.group].push(event)}
  for(const record of Object.values(library.artifacts||{})){
    add(record.createdAt,{group:'artifacts',type:'artifact',artifactId:record.artifactId,title:record.source.title,kind:record.source.kind})
    if(record.important)add(record.importantAt||record.annotatedAt,{group:'important',type:'important',artifactId:record.artifactId,title:record.source.title,kind:record.source.kind})
  }
  for(const version of Object.values(library.versions||{}))add(version.savedAt,{group:'versions',type:'version',artifactId:version.artifactId,versionId:version.versionId,title:version.title,kind:version.kind})
  for(const reuse of Object.values(library.reuses||{}))if(reuse.status==='submitted')add(reuse.submittedAt,{group:'reuses',type:'reuse',operationId:reuse.operationId,title:reuse.instruction,targetSessionId:reuse.targetSessionId})
  return [...months.values()].map(bucket=>({...bucket,events:bucket.events.sort((a,b)=>b.time-a.time)})).sort((a,b)=>b.key.localeCompare(a.key))
}
export function recordFor(library,item){const prefix=item.sessionId+'::';const id=library.aliases?.[prefix+'id:'+item.id]||item.path&&library.aliases?.[prefix+'path:'+item.path]||item.attachmentId&&library.aliases?.[prefix+'attachment:'+item.attachmentId];return id?library.artifacts[id]:undefined}
export function versionsFor(library,id){return Object.values(library.versions||{}).filter(v=>v.artifactId===id).sort((a,b)=>b.savedAt-a.savedAt)}
