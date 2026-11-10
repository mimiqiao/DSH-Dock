import { LibraryStore } from '../library-store.js'
import { libraryRoutes } from '../library-routes.js'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createServer } from 'node:http'
import { readFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { buildSync } from 'esbuild'
import { zipSync, strToU8 } from 'fflate'
const root=fileURLToPath(new URL('../',import.meta.url))
const bundle=buildSync({entryPoints:[root+'tests/preview-entry.js'],bundle:true,write:false,format:'iife'}).outputFiles[0].contents
const pptx=zipSync({'ppt/presentation.xml':strToU8('<p:presentation xmlns:p="p"><p:sldSz cx="9144000" cy="5143500"/></p:presentation>'),'ppt/slides/slide1.xml':strToU8('<p:sld xmlns:p="p" xmlns:a="a"><p:sp><p:spPr><a:xfrm><a:off x="400000" y="400000"/><a:ext cx="8000000" cy="2000000"/></a:xfrm></p:spPr><p:txBody><a:p><a:r><a:rPr sz="4000"/><a:t>真实 PPTX 内容预览</a:t></a:r></a:p></p:txBody></p:sp></p:sld>'),'ppt/slides/slide2.xml':strToU8('<p:sld xmlns:p="p" xmlns:a="a"><p:sp><p:txBody><a:p><a:r><a:t>第二页：继续修改</a:t></a:r></a:p></p:txBody></p:sp></p:sld>')})
const fixtures={
 '/fixtures/deck.html':['text/html',readFileSync(root+'tests/fixtures/deck.html')],
 '/fixtures/example.pptx':['application/vnd.openxmlformats-officedocument.presentationml.presentation',pptx],
 '/fixtures/site.html':['text/html','<h1>一个真实网页</h1><button onclick="this.textContent=\'已点击\'">试试看</button>'],
 '/fixtures/poster.svg':['image/svg+xml','<svg xmlns="http://www.w3.org/2000/svg" width="600" height="400"><rect width="600" height="400" fill="#839d86"/><text x="50" y="200" fill="white" font-size="40">A SMALL IDEA</text></svg>'],
 '/fixtures/plan.md':['text/plain','# 工作计划\n\n把想法做成作品，再回来看看。'],
 '/fixtures/sales.csv':['text/plain','月份,销售额\n九月,120\n十月,160'],
 '/fixtures/tool.py':['text/plain','print("hello workbench")'],
 '/fixtures/archive.zip':['application/zip',zipSync({'note.txt':strToU8('fixture')})],
 '/fixtures/tone.wav':['audio/wav',readFileSync(root+'tests/fixtures/tone.wav')],
 '/fixtures/movie.webm':['video/webm',readFileSync(root+'tests/fixtures/movie.webm')],
}
const qaRoot=process.env.DESK_QA_HOME || await mkdtemp(join(tmpdir(),'desk-qa-library-'))
const library=await new LibraryStore(qaRoot).init()
const routes=libraryRoutes(library)
const uploads=new Map()
const server=createServer(async(req,res)=>{const url=new URL(req.url,'http://localhost');const route=routes.find(r=>r.path===url.pathname&&r.methods.includes(req.method));
if(route){const chunks=[];for await(const chunk of req)chunks.push(chunk);const request=new Request(url,{method:req.method,headers:req.headers,...(['GET','HEAD'].includes(req.method)?{}:{body:Buffer.concat(chunks)})});const response=await route.fetch(request);res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));return}
if(url.pathname==='/api/session/uploadFileBinary'){const chunks=[];for await(const chunk of req)chunks.push(chunk);const data=Buffer.concat(chunks),receiptId='qa-'+uploads.size;uploads.set(receiptId,{name:url.searchParams.get('name'),sessionId:url.searchParams.get('sessionId'),bytes:data.length,base64:data.toString('base64')});res.setHeader('Content-Type','application/json');res.end(JSON.stringify({ok:true,value:{receiptId,file:{name:url.searchParams.get('name'),attachmentId:receiptId,bytes:data.length}}}));return}
if(url.pathname==='/qa/uploads'){res.setHeader('Content-Type','application/json');res.end(JSON.stringify(Object.fromEntries(uploads)));return}
if(url.pathname==='/'){res.setHeader('Content-Type','text/html');res.end('<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>成果工作台 · 测试预览</title><style>body{margin:0}#root{height:calc(100vh - 27px)}aside{height:27px;background:#403a31;color:#fff1d8;text-align:center;font:11px/27px sans-serif}</style><aside>开发测试预览 · 以下为验证夹具，不是你的真实会话</aside><div id="root"></div><script src="/entry.js"></script>');return}if(url.pathname==='/entry.js'){res.setHeader('Content-Type','text/javascript');res.end(bundle);return}if(url.pathname==='/client.js'){res.setHeader('Content-Type','text/javascript');res.end(readFileSync(root+'client.js'));return}if(url.pathname==='/api/file'){const fixture=fixtures[url.searchParams.get('path')];if(fixture){res.setHeader('Content-Type',fixture[0]);res.end(fixture[1]);return}}res.statusCode=404;res.end('Not found')})
server.listen(43189,'127.0.0.1',()=>console.log('Desk test preview http://127.0.0.1:43189'))
