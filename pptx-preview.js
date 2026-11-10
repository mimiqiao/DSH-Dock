import { unzipSync } from 'fflate'
/** Read slide text and embedded images locally; no third-party document upload. */
export function readPptx(bytes) {
  let total=0
  const files=unzipSync(bytes,{filter:f=>{
    if(!/^ppt\/(?:presentation.xml$|slides\/|media\/)/.test(f.name))return false
    total+=f.originalSize
    if(f.originalSize>16*1024*1024||total>100*1024*1024)throw new Error('演示稿内容过大，请下载查看')
    return true
  }})
  const xml=path=>files[path]?new DOMParser().parseFromString(new TextDecoder().decode(files[path]),'application/xml'):null
  const nodes=(root,name)=>root?Array.from(root.getElementsByTagNameNS('*',name)):[]
  const first=(root,name)=>nodes(root,name)[0]
  const attr=(root,name,key)=>first(root,name)?.getAttribute(key)
  const presentation=xml('ppt/presentation.xml')
  const size=first(presentation,'sldSz')
  const width=Number(size?.getAttribute('cx')||9144000)/9525,height=Number(size?.getAttribute('cy')||5143500)/9525
  const types={png:'image/png',jpg:'image/jpeg',jpeg:'image/jpeg',gif:'image/gif',svg:'image/svg+xml'}
  const slides=Object.keys(files).filter(n=>/^ppt\/slides\/slide\d+\.xml$/.test(n)).sort((a,b)=>Number(a.match(/slide(\d+)/)[1])-Number(b.match(/slide(\d+)/)[1])).map(path=>{
    const doc=xml(path),name=path.split('/').pop(),rels=xml(`ppt/slides/_rels/${name}.rels`)
    const relation=Object.fromEntries(nodes(rels,'Relationship').filter(r=>r.getAttribute('TargetMode')!=='External').map(r=>[r.getAttribute('Id'),r.getAttribute('Target')]))
    const shapes=nodes(doc,'sp').map(sp=>{
      const transform=first(sp,'xfrm'),off=first(transform,'off'),ext=first(transform,'ext')
      const paragraphs=nodes(sp,'p').map(p=>nodes(p,'t').map(t=>t.textContent).join('')).filter(Boolean)
      return {x:Number(off?.getAttribute('x')||0)/9525,y:Number(off?.getAttribute('y')||0)/9525,w:Number(ext?.getAttribute('cx')||width*9525)/9525,h:Number(ext?.getAttribute('cy')||height*9525)/9525,text:paragraphs,fill:attr(first(sp,'spPr'),'srgbClr','val'),color:attr(first(sp,'txBody'),'srgbClr','val')||'303030',font:Number(attr(sp,'rPr','sz')||2400)/100*96/72}
    })
    const images=nodes(doc,'pic').flatMap(pic=>{
      const embed=first(pic,'blip')?.getAttribute('r:embed'),target=relation[embed]
      if(!target)return []
      const media='ppt/'+target.replace(/^\.\.\//,'')
      const data=files[media],type=types[media.split('.').pop().toLowerCase()]
      if(!data||!type)return []
      const xfrm=first(pic,'xfrm'),off=first(xfrm,'off'),ext=first(xfrm,'ext')
      return [{data,type,x:Number(off?.getAttribute('x')||0)/9525,y:Number(off?.getAttribute('y')||0)/9525,w:Number(ext?.getAttribute('cx')||0)/9525,h:Number(ext?.getAttribute('cy')||0)/9525}]
    })
    return {shapes,images,background:attr(first(doc,'bg'),'srgbClr','val')||'ffffff'}
  })
  if(!slides.length)throw new Error('未找到可预览的幻灯片')
  return {width,height,slides}
}
