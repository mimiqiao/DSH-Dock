export function deskUrl(path,base=document.baseURI){return new URL(path.replace(/^\//,''),base).href}
export class DeskLibraryClient {
  constructor(fetcher=fetch,base){this.fetcher=(...args)=>fetcher.call(globalThis,...args);this.base=base}
  async request(path,options={}){const response=await this.fetcher(deskUrl(path,this.base),{...options,headers:{...options.headers},cache:'no-store'});let value;try{value=await response.json()}catch{throw new Error('成果库尚未就绪，请重新打开 Harness 后重试。')};if(!response.ok){const error=new Error(value.error?.message||'成果库读取失败');error.code=value.error?.code;throw error}return value}
  read(){return this.request('/api/desk.library')}
  command(action,fields={}){return this.request('/api/desk.library',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action,...fields})})}
  register(items){return this.command('register',{items})}
  annotate(record,patch){return this.command('annotate',{artifactId:record.artifactId,expectedRevision:record.revision,patch})}
  preference(mode,window){return this.command('preference',{mode,window})}
  save(artifactId,loaded){const query=new URLSearchParams({artifactId,source:loaded.source,name:loaded.name||''});return this.request('/api/desk.version?'+query,{method:'POST',headers:{'content-type':loaded.blob.type||'application/octet-stream'},body:loaded.blob})}
  contentUrl(versionId){return deskUrl('/api/desk.content?'+new URLSearchParams({versionId}),this.base)}
}
/** Submit only prepared, exact bytes. A durable operation remembers target and receipts across retries. */
export async function submitReuse({api,operationId,selections,instruction,kind,prepared,sessions,upload,navigate,cwd,workspaceId}) {
  if(!prepared.length||prepared.some(p=>!p.blob))throw new Error('来源文件尚未准备完成。')
  let operation=await api.command('reuse.begin',{operationId,selections,instruction,kind,destination:{...(workspaceId?{workspaceId}:{}),...(!workspaceId&&cwd?{cwd}:{})}})
  if(operation.status==='submitted'){navigate?.(operation.targetSessionId);return operation}
  if(!operation.targetSessionId){
    if(operation.creating)throw new Error('上次创建会话的结果尚未确认，请先在会话列表核对，避免重复创建。')
    operation=await api.command('reuse.update',{operationId,patch:{creating:true}})
    const targetSessionId=await sessions.create(workspaceId?{workspaceId}:cwd?{cwd}:{})
    operation=await api.command('reuse.update',{operationId,patch:{targetSessionId}})
  }
  const targetSessionId=operation.targetSessionId
  await sessions.using(targetSessionId,{source:'controllerOperation'},async ref=>{
    if(operation.receipts.length!==prepared.length){
      const receipts=[]
      for(const source of prepared){
        const result=await upload(targetSessionId,source.blob,source.name)
        if(!result?.ok)throw new Error(result?.error?.message||'来源文件上传失败，可重试已创建的任务。')
        receipts.push({type:'file',receiptId:result.value.receiptId})
      }
      operation=await api.command('reuse.update',{operationId,patch:{receipts}})
    }
    const context=prepared.map((p,i)=>`${i+1}. ${p.name}（${p.label}）${p.note?'；备注：'+p.note:''}`).join('\n')
    const text=`${kind==='template'?'请沿用以下成果的结构和方法，为这次需求制作新成果。':'请以以下成果为基础继续制作新成果。'}\n\n来源文件已随本消息完整附上：\n${context}\n\n这次的要求：\n${instruction.trim()}\n\n请保留源文件，创建新文件名交付本次成果。不要覆盖原稿。`
    const outcome=await ref.binding.session.prompt([{type:'text',text},...operation.receipts],'queue',undefined,operation.requestId)
    if(!outcome?.ok)throw new Error(outcome?.error?.message||'任务提交未确认；可回目标会话核对后重试。')
  })
  operation=await api.command('reuse.update',{operationId,patch:{status:'submitted'}})
  navigate?.(targetSessionId);return operation
}
