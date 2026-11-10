import { MAC } from './mac-assets.js'
import { readPptx } from './pptx-preview.js'
import { readWorkBlob } from './preview-source.js'
import { DeskLibraryClient } from './library-client.js'
import { recordFor, versionsFor } from './review-model.js'
import { featureComponents } from './feature-ui.js'
window.__ModuleLoader__.load({
  id: '@local/desk-workbench',
  factory(require) {
    const React = require('react')
    const h = React.createElement
    const { useState, useEffect, useMemo, useRef } = React
    /* MODEL */
    const CSS = /* CSS */
    const STATUS = { running: '正在做', ready: '本轮完成', attention: '等你回应', problem: '遇到问题', idle: '待开始', unavailable: '待整理', archived: '保存版本' }
    const COLORS = ['#e0ae4a','#83b5a5','#d88f79','#828fbd','#be9871','#a1a876','#7dabb8','#bc977f','#d6b65a','#b3a7a0']
    const titleOf = item => (item.description || item.title).replace(/(?:\*\*|__|`)/g, '')
    function typeOf(item) {
      return item.path?.split('/').pop()?.match(/\.([a-z0-9]{1,10})$/i)?.[1]?.toUpperCase() || item.mediaType?.split('/')[1]?.split('+')[0]?.toUpperCase() || '文件'
    }
    function downloadName(item,source) {
      const ext=({ 'image/webp':'webp','image/png':'png','image/jpeg':'jpg','image/svg+xml':'svg','image/gif':'gif' })[item.mediaType]
      const name=item.downloadFileName || item.title || '图片'
      if(source==='file'||source==='saved-version')return /\.[a-z0-9]{1,10}$/i.test(name) || !ext ? name : `${name}.${ext}`
      return `${name.replace(/\.[a-z0-9]{1,10}$/i,'')}.${ext || 'png'}`
    }
    function button(text, props = {}) { return h('button', { type: 'button', ...props }, text) }
    function absolute(path) { return typeof path === 'string' && (/^\//.test(path) || /^[A-Za-z]:[/\\]/.test(path)) && !/^[\/\\]{2}|[\u0000-\u001f\u007f]/.test(path) }
    function fileUrl(path) {
      if (!absolute(path)) return undefined
      const base = document.baseURI
      if (!/^https?:|^dsh-app:\/\/app\//.test(base)) return undefined
      return new URL(`api/file?path=${encodeURIComponent(path)}`, base).href
    }
    // Generated HTML runs in an opaque sandbox. Relative assets refer to real source files.
    function htmlPreview(text, path) {
      const doc = new DOMParser().parseFromString(text, 'text/html')
      doc.querySelectorAll('base').forEach(n => n.remove())
      doc.querySelectorAll('[src],link[href],video[poster]').forEach(el => {
        for (const attr of ['src','href','poster']) {
          const value = el.getAttribute(attr)
          if (!value || /^(?:[a-z]+:|\/\/|#)/i.test(value)) continue
          const resolved = new URL(value, 'https://files.invalid' + path.replace(/\\/g, '/')).pathname
          const url = fileUrl(decodeURIComponent(resolved)); if (url) el.setAttribute(attr, url)
        }
      })
      return '<!doctype html>\n' + doc.documentElement.outerHTML
    }
    async function attachmentBlob(ctx,item,signal) {
      let blob
      await ctx.get('sessions').using(item.sessionId,{source:'controllerOperation',signal},async ref=>{
        const result=await ref.binding.session.readAttachment({attachmentId:item.attachmentId,mediaType:item.mediaType,width:item.width,height:item.height,bytes:item.bytes,name:item.attachmentName || item.title})
        if(!result?.ok)throw new Error('会话中保存的图片暂时无法读取。')
        blob=new Blob([new Uint8Array(result.value.data)],{type:item.mediaType})
      })
      return blob
    }
    function WorkThumbnail({item,ctx,fallback}) {
      const root=useRef(),[preview,setPreview]=useState(null)
      useEffect(()=>{
        if(item.kind!=='image')return
        const ctrl=new AbortController();let disposed=false,url,started=false
        async function load(){
          if(started)return;started=true
          try{const result=await readWorkBlob(item,{fileUrl,signal:ctrl.signal,readAttachment:(entry,signal)=>attachmentBlob(ctx,entry,signal)})
            if(disposed)return
            url=URL.createObjectURL(result.blob);setPreview({url})
          }catch(e){if(!disposed&&e.name!=='AbortError')setPreview({missing:true})}
        }
        const observer=new IntersectionObserver(entries=>{if(entries.some(e=>e.isIntersecting)){observer.disconnect();void load()}},{rootMargin:'160px'})
        observer.observe(root.current)
        return()=>{disposed=true;ctrl.abort();observer.disconnect();if(url)URL.revokeObjectURL(url)}
      },[item.id,item.seq,item.sessionId])
      return h('div',{className:`dw-thumbnail dw-thumb-${item.kind}`,ref:root,'aria-hidden':true},preview?.url?h('img',{src:preview.url,alt:'',onError:()=>setPreview({missing:true})}):fallback||h(DeskArt,{kind:item.kind}),preview?.missing?h('span',null,'文件暂不可用'):null)
    }
    function DeskArt({ kind }) {
      const p = (d, key) => h('path', { d, key })
      let drawing
      switch (kind) {
        case 'presentation': drawing = [h('rect',{key:1,x:8,y:8,width:144,height:7,rx:3}),h('rect',{key:2,x:14,y:15,width:132,height:78,fill:'#fff9e8'}),p('M22 92 H138 M80 94 V107 M67 107 H93','l'),p('M31 37 H72 M31 47 H62 M31 57 H79','t'),h('rect',{key:3,x:94,y:35,width:30,height:32,fill:'#e0ae4a'}),p('M26 20 H133','a')]; break
        case 'app': drawing = [h('rect',{key:1,x:13,y:12,width:134,height:78,rx:6,fill:'#343f40'}),h('rect',{key:2,x:20,y:19,width:120,height:62,fill:'#dcebe2'}),p('M68 92 V101 H92 V92 M53 105 H108','b'),p('M27 31 H133 M58 32 V74 M67 42 H117 M67 52 H108 M67 62 H124','t')];break
        case 'image': drawing = [h('rect',{key:1,x:29,y:5,width:103,height:99,rx:3,fill:'#c39465',transform:'rotate(5 80 55)'}),h('rect',{key:2,x:37,y:13,width:87,height:83,fill:'#e1e6cd'}),h('circle',{key:3,cx:102,cy:35,r:12,fill:'#edbc5e'}),p('M40 86 L64 49 L84 72 L96 59 L122 87 Z','m')];break
        case 'video': drawing = [h('circle',{key:1,cx:52,cy:26,r:20,fill:'#c8ced8'}),h('circle',{key:2,cx:96,cy:25,r:23,fill:'#c8ced8'}),h('rect',{key:3,x:29,y:49,width:88,height:44,rx:7,fill:'#828fbd'}),p('M119 60 L143 49 V92 L119 80 Z M45 94 L35 107 M103 94 L114 107','s'),h('circle',{key:4,cx:52,cy:26,r:6}),h('circle',{key:5,cx:96,cy:25,r:7})];break
        case 'audio': drawing=[h('rect',{key:1,x:38,y:10,width:84,height:93,rx:8,fill:'#b37c50'}),h('circle',{key:2,cx:80,cy:68,r:24,fill:'#354348'}),h('circle',{key:3,cx:80,cy:68,r:11,fill:'#a8bcb0'}),h('circle',{key:4,cx:80,cy:29,r:8,fill:'#354348'}),p('M132 40 Q148 52 132 66 M139 31 Q160 52 139 75','s')];break
        case 'document': drawing=[p('M14 99 H147 V106 H14 Z','s'),...['#a1a876','#c69b71','#e0c989','#91a7b5','#cd8f78'].map((fill,i)=>h('rect',{key:i,x:24+i*23,y:20+(i%2)*9,width:20,height:78-(i%2)*9,rx:2,fill})),p('M31 33 V72 M77 33 V72 M123 33 V72','l')];break
        case 'data': drawing=[p('M18 34 V19 H65 L75 30 H141 V101 H18 Z','back'),p('M12 48 H148 L135 105 H25 Z','front'),h('rect',{key:1,x:38,y:6,width:83,height:70,fill:'#faf5df'}),p('M48 24 H110 M48 35 H110 M48 46 H110 M48 57 H110 M68 17 V66 M90 17 V66','grid')];break
        case 'code':drawing=[h('rect',{key:1,x:17,y:40,width:127,height:63,rx:7,fill:'#ad7960'}),p('M57 40 V25 H104 V40 M17 61 H144','l'),h('rect',{key:2,x:68,y:54,width:25,height:19,fill:'#d9bd78'}),p('M33 34 L45 15 M121 34 L112 10','tools')];break
        case 'discussion':drawing=[p('M24 13 Q50 6 80 18 Q110 6 138 13 V100 Q110 90 80 103 Q51 90 24 100 Z','b'),p('M80 18 V103 M36 32 L66 34 M36 45 L66 47 M36 58 L66 60 M94 32 L125 30 M94 45 L125 43 M94 58 L125 56','l'),p('M119 83 L146 32 L153 36 L126 88 Z','p')];break
        default:drawing=[p('M16 42 L80 24 L144 42 V101 H16 Z','b'),p('M12 36 H148 V54 H12 Z','t'),h('rect',{key:1,x:59,y:69,width:44,height:19,fill:'#f1dfb7'})]
      }
      return h('svg',{viewBox:'0 0 160 116',className:'dw-art',fill:'var(--object)',stroke:'#423a30',strokeWidth:2.5,strokeLinejoin:'round','aria-hidden':true},drawing)
    }
    function SlidePreview({ deck }) {
      const [page,setPage]=useState(0)
      const [imageUrls,setImageUrls]=useState([])
      const slide=deck.slides[page]
      const root=useRef()
      useEffect(()=>{const urls=slide.images.map(i=>URL.createObjectURL(new Blob([i.data],{type:i.type})));setImageUrls(urls);return()=>urls.forEach(u=>URL.revokeObjectURL(u))},[slide])
      return h('div',{className:'dw-slides',ref:root},h('div',{className:'dw-slide-controls'},button('上一页',{disabled:page===0,onClick:()=>setPage(page-1)}),h('span',null,`${page+1} / ${deck.slides.length}`),button('下一页',{disabled:page===deck.slides.length-1,onClick:()=>setPage(page+1)}),button('全屏',{onClick:()=>root.current?.requestFullscreen?.()})),h('svg',{viewBox:`0 0 ${deck.width} ${deck.height}`,role:'img','aria-label':`第 ${page+1} 页`,className:'dw-slide'},h('rect',{width:deck.width,height:deck.height,fill:'#'+slide.background}),...slide.shapes.map((sp,i)=>h('g',{key:i},sp.fill?h('rect',{x:sp.x,y:sp.y,width:sp.w,height:sp.h,fill:'#'+sp.fill}):null,h('text',{x:sp.x+8,y:sp.y+sp.font,fill:'#'+sp.color,fontSize:sp.font,fontFamily:'sans-serif'},...sp.text.map((line,j)=>h('tspan',{key:j,x:sp.x+8,dy:j?sp.font*1.25:0},line))))),...slide.images.map((img,i)=>h('image',{key:i,href:imageUrls[i],x:img.x,y:img.y,width:img.w,height:img.h}))),h('small',null,'简版预览：显示幻灯片文字与内嵌图片；母版、图表及动画请打开原文件查看。'))
    }
    function Preview({ item, ctx }) {
      const [state,setState] = useState({loading:true})
      const [retry,setRetry] = useState(0)
      const root = useRef()
      useEffect(()=>{
        const controller = new AbortController(); let disposed=false; let objectUrl
        setState({loading:true})
        ;(async()=>{
          if (item.kind === 'discussion' && !item.contentUrl) { setState({text:item.body || ''}); return }
          const loaded = await readWorkBlob(item, { fileUrl, signal: controller.signal, readAttachment: (entry,signal)=>attachmentBlob(ctx,entry,signal) })
          if(disposed)return
          const blob=loaded.blob
          objectUrl=URL.createObjectURL(blob)
          const accept=value=>{if(!disposed)setState({...value,downloadUrl:objectUrl,source:loaded.source})}
          const ext=(item.versionId?item.title:(item.path || item.title)).split('.').pop().toLowerCase()
          if(ext==='pptx') {
            const deck=readPptx(new Uint8Array(await blob.arrayBuffer()));accept({deck})
          } else if(/^(html?|xhtml)$/.test(ext)) {
            const html=htmlPreview(await blob.text(), item.path)
            accept({html})
          } else if (['code','discussion'].includes(item.kind) || /^(md|txt|csv|tsv|json|yaml|yml|sql|log)$/.test(ext)) {
            if(blob.size>4*1024*1024) throw new Error('文件较大，请下载后查看')
            const text=await blob.text();accept({text})
          } else {
            accept({url:objectUrl,ext})
          }
        })().catch(error=>{ if(!disposed && error.name!=='AbortError') setState({error:error.message,code:error.code,...(objectUrl?{downloadUrl:objectUrl,source:'file'}:{})}) })
        return ()=>{disposed=true;controller.abort();if(objectUrl)URL.revokeObjectURL(objectUrl)}
      },[item.id,item.sessionId,item.seq,item.versionId,retry])
      return h('div',{className:'dw-preview',ref:root},
        state.downloadUrl ? h('div',{className:'dw-content-info'},h('span',null,state.source==='saved-version'?(item.savedVersionSource==='saved-preview'?'这是当时保存的图片预览（原文件不可用）':'这是保存时的版本内容'):state.source==='saved-preview'?'原文件不可用 · 正在显示会话中保存的图片预览':state.source==='attachment'?'会话保存的图片':'当前文件'),h('a',{href:state.downloadUrl,download:downloadName(item,state.source)},state.source==='saved-version'?'下载此版本':state.source==='file'?'下载文件':'下载保存的预览')) : null,
        state.loading ? h('p',{role:'status'},'正在打开作品…') :
        state.error ? h('div',{role:'alert',className:'dw-preview-error'},h(DeskArt,{kind:item.kind}),h('h3',null,state.error),h('p',null,state.code==='FILE_MISSING' ? (/^\/(private\/)?tmp\//.test(item.path||'')?'它来自临时目录，可能已被清理；当前没有可用的保存预览。':'文件可能已移动或删除，当前没有可用的保存预览。') : '可以重试，或点击上方“回原会话继续”核对文件。'),item.path?h('code',null,item.path):null,button('重新读取',{onClick:()=>setRetry(retry+1)})) :
        state.deck ? h(SlidePreview,{deck:state.deck}) :
        state.html ? h(React.Fragment,null,h('div',{className:'dw-preview-bar'},h('span',null,'点击作品后，可使用作品自身的翻页和播放控件'),button('全屏查看',{onClick:()=>root.current?.requestFullscreen?.()})),h('iframe',{title:titleOf(item),sandbox:'allow-scripts allow-downloads',srcDoc:state.html})) :
        state.text !== undefined ? h('pre',{className:'dw-text'},state.text) :
        state.url && item.kind==='image' ? h('img',{src:state.url,alt:titleOf(item),onError:()=>setState(v=>({...v,error:'图片内容无法显示',code:'MEDIA'}))}) :
        state.url && ['audio','video'].includes(item.kind) ? h(item.kind,{src:state.url,controls:true,preload:'metadata',onError:()=>setState(v=>({...v,error:'浏览器无法播放这份媒体文件',code:'MEDIA'}))}) :
        state.url && state.ext==='pdf' ? h('iframe',{src:state.url,title:titleOf(item)}) :
        h('div',{className:'dw-file-fallback'},h(DeskArt,{kind:item.kind}),h('p',null,state.unavailable?'这项成果尚无可读取的文件引用，可回原会话查看。':'此格式请下载后使用对应应用打开。'),fileUrl(item.path) ? h('a',{href:fileUrl(item.path),download:item.title},'下载原文件 ↗') : null),
      )
    }
    function WorkbenchPage({useSessions,ctx}) {
      const snapshots=useSessions(s=>s.projectionsBySession)
      const list=useSessions(s=>s.byId)
      const catalog=useMemo(()=>Object.entries(list||{}).map(([sessionId,row])=>({...row,sessionId})),[list])
      const desks=useMemo(()=>collectDesks(snapshots,list),[snapshots,list])
      const [indexing,setIndexing]=useState(false)
      const [indexError,setIndexError]=useState('')
      const [indexRetry,setIndexRetry]=useState(0),[libraryRetry,setLibraryRetry]=useState(0)
      const catalogIds=(catalog||[]).map(row=>row.sessionId).sort().join('\n')
      useEffect(()=>{
        const service=ctx.get('sessions')
        if(!service?.refreshProjections)return
        const ids=catalogIds.split('\n').filter(id=>id && !snapshots?.[id]?.values?.desk?.status)
        if(!ids.length)return
        let stopped=false,next=0
        setIndexing(true);setIndexError('')
        async function worker(){while(next<ids.length&&!stopped){const id=ids[next++];try{await service.refreshProjections(id)}catch{if(!stopped)setIndexError('部分历史会话暂时未能读取，可稍后重试。')}}}
        Promise.all([worker(),worker()]).then(()=>{if(!stopped)setIndexing(false)})
        return()=>{stopped=true}
      },[catalogIds,indexRetry])
      const unavailable=(catalog||[]).filter(row=>!snapshots?.[row.sessionId]?.values?.desk?.status)

      const [category,setCategory]=useState(null)
      const [selected,setSelected]=useState(null)
      const [query,setQuery]=useState('')
      const [topic,setTopic]=useState('all')
      const [status,setStatus]=useState('all')
      const [error,setError]=useState('')
      const opener=useRef(null), dialog=useRef(null)
      const rawItems=useMemo(()=>desks.filter(d=>!d.unindexed).flatMap(d=>d.items.map(item=>({...item,sessionId:d.sessionId,sessionTitle:d.title,cwd:d.cwd,status:d.status || (d.running?'running':'ready')}))),[desks])
      const api=useMemo(()=>new DeskLibraryClient(),[])
      const [library,setLibrary]=useState({artifacts:{},aliases:{},versions:{},reuses:{},preferences:{mode:'objects'},revision:-1})
      const [libraryError,setLibraryError]=useState(''),[mode,setMode]=useState('objects'),[composer,setComposer]=useState(null),[composerBusy,setComposerBusy]=useState(false)
      const [minimized,setMinimized]=useState(false),[windowState,setWindowState]=useState({x:0,y:0,maximized:false})
      const initialPrefs=useRef(false),drag=useRef(null)
      const acceptLibrary=value=>setLibrary(previous=>value.revision>=previous.revision?value:previous)
      async function refreshLibrary(){const value=await api.read();acceptLibrary(value);return value}
      const sourceSignature=JSON.stringify(rawItems.filter(i=>i.id!=='unindexed-session'))
      useEffect(()=>{let stopped=false;setLibraryError('');(async()=>{const values=JSON.parse(sourceSignature);let state=await api.read();for(let i=0;i<values.length&&!stopped;i+=100)state=await api.register(values.slice(i,i+100));if(stopped)return;acceptLibrary(state);if(!initialPrefs.current){initialPrefs.current=true;setMode(state.preferences.mode||'objects');if(state.preferences.window)setWindowState(boundedWindow(state.preferences.window))}})().catch(e=>{if(!stopped)setLibraryError(e.message)});return()=>{stopped=true}},[sourceSignature,libraryRetry])
      const items=useMemo(()=>{const actual=[...rawItems];for(const record of Object.values(library.artifacts)){if(!actual.some(i=>recordFor(library,i)?.artifactId===record.artifactId)&&(record.important||versionsFor(library,record.artifactId).length))actual.push({...record.source,status:'unavailable'})}return actual},[rawItems,library])
      const windowVisible=!!category&&!minimized
      async function changeMode(value){setMode(value);try{await api.preference(value,windowState);await refreshLibrary()}catch(e){setLibraryError(e.message)}}
      async function loadSource(item){
        const version=item.savedVersion||item.versionId&&library.versions[item.versionId]
        if(version){const response=await fetch(api.contentUrl(version.versionId));if(!response.ok)throw new Error('保存版本暂时无法读取。');return{blob:await response.blob(),source:'saved-version',label:(version.source==='saved-preview'?'保存的图片预览 · ':'保存版本 · ')+new Date(version.savedAt).toLocaleString(),name:version.fileName||version.title}}
        if(item.kind==='discussion')return{blob:new Blob([item.body||''],{type:'text/plain;charset=utf-8'}),source:'discussion',label:'当前讨论摘要',name:(item.title||'讨论').slice(0,60)+'.txt'}
        const loaded=await readWorkBlob(item,{fileUrl,readAttachment:(entry,signal)=>attachmentBlob(ctx,entry,signal)})
        return{...loaded,name:downloadName(item,loaded.source),label:loaded.source==='file'?'当前完整文件':loaded.source==='saved-preview'?'原文件失效，使用保存预览':'会话保存的图片'}
      }
      function versionItem(record,version){return{...record.source,mediaType:version.mediaType,path:version.sourcePath||record.source.path,savedVersionSource:version.source,downloadFileName:version.fileName,title:version.title,kind:version.kind,contentUrl:api.contentUrl(version.versionId),versionId:version.versionId,status:'archived'}}
      function showItem(item){if(!category)setCategory('all');setMinimized(false);setSelected(item)}
      function openReuse(item,kind){const record=recordFor(library,item);if(!record){setError('成果资料尚未整理完成，请稍后重试。');return}setComposer({ids:[record.artifactId],kind,choices:item.versionId?{[record.artifactId]:item.versionId}:{}});setMinimized(false)}
      async function star(item){const record=recordFor(library,item);if(!record)return;try{await api.annotate(record,{important:!record.important});await refreshLibrary()}catch(e){setError(e.message);await refreshLibrary().catch(()=>{})}}
      function boundedWindow(value){const maxX=Math.max(0,(innerWidth-Math.min(1100,innerWidth*.9))/2-8),maxY=Math.max(0,innerHeight*.09-8);return{...value,x:Math.max(-maxX,Math.min(maxX,value.x)),y:Math.max(-maxY,Math.min(maxY,value.y))}}
      useEffect(()=>{const resize=()=>setWindowState(value=>boundedWindow(value));window.addEventListener('resize',resize);return()=>window.removeEventListener('resize',resize)},[])
      function dragStart(event){if(mode!=='mac'||innerWidth<=520||windowState.maximized||event.target.closest('button,input,select,details'))return;drag.current={x:event.clientX,y:event.clientY,origin:windowState};event.currentTarget.setPointerCapture(event.pointerId)}
      function dragMove(event){if(!drag.current)return;setWindowState(boundedWindow({...drag.current.origin,x:drag.current.origin.x+event.clientX-drag.current.x,y:drag.current.origin.y+event.clientY-drag.current.y}))}
      function updateWindow(next){setWindowState(next);api.preference(mode,next).catch(e=>setLibraryError(e.message))}
      function dragEnd(){if(!drag.current)return;drag.current=null;api.preference(mode,windowState).catch(e=>setLibraryError(e.message))}

      const topics=[...new Set(items.map(i=>i.topic))].filter(Boolean)
      const filtered=items.filter(i=>(category==='important'&&recordFor(library,i)?.important||category==='all'||category==='attention'&&['running','attention','problem'].includes(i.status)||category===i.kind)&&(topic==='all'||topic===i.topic)&&(status==='all'||status===i.status)&&`${i.title} ${i.description||''} ${i.body||''} ${i.path||''} ${i.sessionTitle}`.toLowerCase().includes(query.toLowerCase()))
      const active=desks.filter(d=>['running','attention','problem'].includes(d.status))
      const open=(kind,e)=>{opener.current=e.currentTarget;if(minimized&&kind===category){setMinimized(false);return}setMinimized(false);setError('');setCategory(kind);setSelected(null);setQuery('');setTopic('all');setStatus('all')}
      const close=()=>{setMinimized(false);setComposer(null);setCategory(null);setSelected(null);opener.current?.focus()}
      useEffect(()=>{
        if(!windowVisible)return
        const before=document.activeElement
        dialog.current?.focus()
        function key(e){
          if(e.key==='Escape'){e.preventDefault();if(composer){if(!composerBusy)setComposer(null)}else if(selected)setSelected(null);else close()}
          if(e.key==='Tab'&&mode!=='mac'){
            const nodes=Array.from(dialog.current?.querySelectorAll('button:not(:disabled),a[href],input,textarea,select,summary,iframe,[tabindex="0"]')||[]).filter(node=>node.getClientRects().length)
            if(!nodes?.length)return
            const first=nodes[0],last=nodes[nodes.length-1]
            if(e.shiftKey&&(document.activeElement===first||document.activeElement===dialog.current)){e.preventDefault();last.focus()}
            else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus()}
          }
        }
        document.addEventListener('keydown',key)
        return ()=>{document.removeEventListener('keydown',key);if(before?.isConnected)before.focus()}
      },[category,selected,mode,minimized,composer,composerBusy])
      function go(id){
        setError('')
        try{
          const nav=ctx.get('uiWorkspace');if(!nav?.openSession)throw new Error('当前环境未提供会话导航')
          nav.openSession(id);ctx.get('layout')?.selectPanel(null)
        }catch(e){setError(e.message)}
      }
      const categoryName=category==='review'?'工作回顾':category==='important'?'重要成果':category==='all'?'全部工作':category==='attention'?'工作进展':CATEGORIES.find(c=>c[0]===category)?.[2]
      const maintenance=h('details',{className:'dw-maintenance'},h('summary',null,'整理状态'),
        h('div',null,
          libraryError?h(React.Fragment,null,h('p',null,'成果库未连接'),button('重试连接',{onClick:()=>setLibraryRetry(libraryRetry+1)}),h('details',null,h('summary',null,'错误详情'),h('p',null,libraryError))):null,
          indexing?h('p',null,'正在整理历史会话…'):unavailable.length||indexError?h(React.Fragment,null,h('p',null,`${unavailable.length} 个会话未整理`),button('重试整理',{onClick:()=>setIndexRetry(indexRetry+1)}),unavailable.length?h('details',null,h('summary',null,'查看会话'),...unavailable.map(row=>button(row.title||row.displayTitle||'未命名会话',{key:row.sessionId,onClick:()=>go(row.sessionId)}))):null):null,
          !libraryError&&!indexing&&!unavailable.length&&!indexError?h('p',null,desks.length?'已完成整理':'暂无可整理的工作'):null))
      return h('div',{className:`dw-root dw-mode-${mode}`},h('style',null,CSS),
        !windowVisible&&mode!=='mac'?h(DeskSettings,{mode,onChange:changeMode,onOpen:open,maintenance}):null,
        mode==='mac'?h(MacDesktop,{onOpen:open,hidden:false,settings:h(DeskSettings,{mode,onChange:changeMode,onOpen:open,maintenance,dock:true}),minimized,onRestore:()=>setMinimized(false)}):h('main',{className:'dw-room','aria-hidden':windowVisible?true:undefined,inert:windowVisible?'':undefined},h('div',{className:'dw-wall'},
          h('div',{className:'dw-room-note'},h('span',null,'成果工作台'),h('p',null,'想法、作品，还有下一步。'),null),
          button(h(React.Fragment,null,h('span',{className:'dw-pin'},'●'),h('b',null,'工作进展'),h('strong',null,active.length ? `${active.length} 项进行中 / 需关注`:'看看最近的工作'),...active.slice(0,3).map(d=>h('span',{className:'dw-note-line',key:d.sessionId},STATUS[d.status],' · ',d.title))),{className:'dw-noteboard',onClick:e=>open('attention',e)}),
          h('div',{className:'dw-window','aria-hidden':true},h('div',{className:'dw-sun'}),h('div',{className:'dw-city'})),
          ...CATEGORIES.slice(0,3).map(([kind,name,description],index)=>{
            const works=items.filter(i=>i.kind===kind)
            return button(h(React.Fragment,null,h(DeskArt,{kind}),h('span',{className:'dw-object-label'},name,h('b',null,works.length)),h('small',null,description),h('span',{className:'dw-latest'},works[0]?titleOf(works[0]):'等一件新作品')),{key:kind,className:`dw-object dw-wall-object dw-${kind}`,style:{'--object':COLORS[index]},onClick:e=>open(kind,e)})
          })),
          h('div',{className:'dw-table'},h('div',{className:'dw-table-edge'}),h('div',{className:'dw-desk-objects'},...CATEGORIES.slice(3).map(([kind,name,description],i)=>{
            const works=items.filter(w=>w.kind===kind)
            return button(h(React.Fragment,null,h(DeskArt,{kind}),h('span',{className:'dw-object-label'},name,h('b',null,works.length)),h('small',null,description)),{key:kind,className:'dw-object',style:{'--object':COLORS[i+3]},onClick:e=>open(kind,e)})
          })))),
        windowVisible ? h('div',{className:`dw-overlay ${mode==='mac'?'dw-finder-overlay':''}`,onClick:e=>{if(e.target===e.currentTarget)close()}},h('section',{className:`dw-dialog ${mode==='mac'?'dw-finder':''} ${windowState.maximized?'dw-window-max':''}`,style:mode==='mac'&&!windowState.maximized?{transform:`translate(${windowState.x}px,${windowState.y}px)`}:undefined,role:'dialog','aria-modal':mode!=='mac'?true:undefined,'aria-labelledby':'dw-dialog-title',tabIndex:-1,ref:dialog},
          h('header',{className:'dw-dialog-head',onPointerDown:dragStart,onPointerMove:dragMove,onPointerUp:dragEnd},mode==='mac'?h('div',{className:'dw-traffic'},button('●',{'aria-label':'关闭窗口',onClick:close}),button('●',{'aria-label':'最小化窗口',onClick:()=>setMinimized(true)}),button('●',{'aria-label':'最大化窗口',onClick:()=>updateWindow({...windowState,maximized:!windowState.maximized})})):null,selected?button(mode==='mac'?'‹':'← 返回作品',{'aria-label':'← 返回作品',className:'dw-back-button',onClick:()=>setSelected(null)}):null,mode!=='mac'?h(DeskSettings,{mode,onChange:changeMode,onOpen:open,maintenance}):null,h('h2',{id:'dw-dialog-title'},composer?'从已有成果开始':selected?titleOf(selected):category==='review'?categoryName:`${categoryName} · ${filtered.length}`),button('关闭 ×',{onClick:close})),
          mode==='mac'?h(FinderSidebar,{category,onOpen:open}):null,
          composer?h(ReuseComposer,{library,api,initialIds:composer.ids,initialChoices:composer.choices,kind:composer.kind,loadSource,ctx,onBusy:setComposerBusy,onClose:()=>setComposer(null),onDone:async()=>{await refreshLibrary();close();ctx.get('layout')?.selectPanel(null)}}):selected ? h(React.Fragment,null,h('div',{className:'dw-source'},h('span',null,`${selected.sessionTitle} · ${selected.topic} · ${STATUS[selected.status]} · ${selected.revisions} 次记录`),button('回原会话继续 ↗',{onClick:()=>go(selected.sessionId)}),selected.path && !/\/attachments\/v1\/objects\//.test(selected.path)?h('span',{className:'dw-source-path',title:selected.path},selected.path):null),h(ArtifactActions,{item:selected,library,api,refresh:refreshLibrary,loadSource,onReuse:openReuse,onNavigate:go,onVersion:value=>{if(value?.sourceArtifact)showItem(value.sourceArtifact.source);else{const record=recordFor(library,selected);if(record)setSelected(value?versionItem(record,value):record.source)}}}),h(Preview,{item:selected,ctx})) : category==='review'?h(ReviewPanel,{library,onArtifact:showItem,onVersion:(record,version)=>showItem(versionItem(record,version)),onNavigate:go}):h(React.Fragment,null,
            h('div',{className:'dw-toolbar'},h('input',{type:'search',placeholder:'找作品、内容或会话…','aria-label':'搜索工作',value:query,onChange:e=>setQuery(e.target.value)}),h('select',{'aria-label':'工作主题',value:topic,onChange:e=>setTopic(e.target.value)},h('option',{value:'all'},'全部主题'),...topics.map(t=>h('option',{key:t,value:t},t))),h('select',{'aria-label':'工作状态',value:status,onChange:e=>setStatus(e.target.value)},h('option',{value:'all'},'全部状态'),...Object.entries(STATUS).map(([key,label])=>h('option',{key,value:key},label)))),
            category==='attention'?h('div',{className:'dw-progress'},...active.map(d=>h('article',{key:d.sessionId},h('span',{className:`dw-status ${d.status}`},STATUS[d.status]),h('b',null,d.title),h('p',null,d.summary||d.request||'正在处理这项工作'),button('打开会话 ↗',{onClick:()=>go(d.sessionId)})))):null,
            h('div',{className:'dw-results'},...filtered.map(item=>h('article',{className:'dw-card',key:item.sessionId+item.id},
              button(h(React.Fragment,null,h(WorkThumbnail,{item,ctx,fallback:mode==='mac'?h(MacFileIcon,{item}):null}),h('div',{className:'dw-card-copy'},h('span',{className:`dw-status ${item.status}`},STATUS[item.status]),h('strong',{title:titleOf(item)},titleOf(item)),h('p',{title:item.path},item.kind==='discussion'?item.body?.slice(0,100):[typeOf(item),item.width&&item.height?`${item.width} × ${item.height}`:null,item.attachmentId?'有保存预览':null].filter(Boolean).join(' · ')),h('small',null,item.sessionTitle),h('span',{className:'dw-card-meta'},item.topic,' · ',new Date(item.time).toLocaleDateString('zh-CN',{month:'short',day:'numeric'}),item.revisions>1?` · ${item.revisions} 次记录`:''))),{className:'dw-result',onClick:()=>setSelected(item)}),
              button(recordFor(library,item)?.important?'★':'☆',{className:'dw-star','aria-label':(recordFor(library,item)?.important?'取消重要标记：':'标记重要：')+titleOf(item),'aria-pressed':!!recordFor(library,item)?.important,disabled:!recordFor(library,item),onClick:()=>star(item)})
            ))),
            filtered.length===0 && !(category==='attention'&&active.length) ? h('p',{className:'dw-list-empty'},query||topic!=='all'||status!=='all'?'没有匹配的工作。':'这里暂时没有工作，后续会自动收进来。'):null),
          error?h('p',{role:'alert',className:'dw-error'},error):null,
        )):null)
    }
    const {ModeSwitch,ArtifactActions,ReuseComposer,MacDesktop,MacFileIcon,FinderSidebar,ReviewPanel}=featureComponents(React,{DeskArt,WorkThumbnail,titleOf,button})
    function DeskSettings({mode,onChange,onOpen,maintenance,dock}){
      const root=useRef(null)
      useEffect(()=>{function outside(e){if(!root.current?.contains(e.target))root.current?.removeAttribute('open')}document.addEventListener('pointerdown',outside);return()=>document.removeEventListener('pointerdown',outside)},[])
      function dismiss(){root.current?.removeAttribute('open')}
      return h('details',{className:'dw-settings'+(dock?' dw-dock-settings':''),ref:root,onKeyDown:e=>{if(e.key==='Escape'&&root.current?.open){e.preventDefault();e.stopPropagation();dismiss();root.current.querySelector('summary')?.focus()}}},
        h('summary',{'aria-label':'桌面设置',title:'桌面设置'},dock?h('img',{src:MAC.settings,alt:''}):h('svg',{viewBox:'0 0 24 24',width:20,height:20,fill:'none',stroke:'currentColor',strokeWidth:1.6,'aria-hidden':true},h('path',{d:'m9 3-.6 2.2-2 .9-2-.6-2 3.5 1.6 1.6v2.8l-1.6 1.6 2 3.5 2-.6 2 .9L9 21h4l.6-2.2 2-.9 2 .6 2-3.5-1.6-1.6v-2.8L19.6 9l-2-3.5-2 .6-2-.9L13 3z'}),h('circle',{cx:11,cy:12,r:3}))),
        h('div',{className:'dw-settings-menu'},h(ModeSwitch,{mode,onChange:value=>{dismiss();onChange(value)}}),...['all','important','review'].map((kind,i)=>button(['全部工作 ↗','重要成果','工作回顾'][i],{key:kind,onClick:e=>{dismiss();onOpen(kind,e)}})),maintenance))
    }
    function DeskIcon(){return h('svg',{width:20,height:20,viewBox:'0 0 24 24',fill:'none',stroke:'currentColor',strokeWidth:1.6,'aria-hidden':true},h('path',{d:'M2 14h20M4 14v7m16-7v7M5 3h14v8H5zM12 11v3'}))}
    return {
      inject:['slots','locale','sessions','uiWorkspace','layout'],
      apply(ctx){
        ctx.effect(()=>ctx.locale.register('deskWorkbench',{zh:{panel:'成果工作台'},en:{panel:'Results Workbench'}}),'desk dictionaries')
        const t=ctx.locale.bind('deskWorkbench')
        ctx.effect(()=>ctx.slots.inject('main',()=>ctx.slots.register({name:'main',key:'desk-workbench',locale:'deskWorkbench',inject:()=>({ctx})},props=>h(WorkbenchPage,{useSessions:props.useSessions,ctx:props.ctx}))),'desk main')
        ctx.effect(()=>ctx.slots.inject('sidebar.panellist',()=>ctx.slots.register({name:'sidebar.panellist',id:'desk-workbench',order:20,locale:'deskWorkbench',label:()=>t('panel')},DeskIcon)),'desk sidebar')
      }
    }
  }
})
