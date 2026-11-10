import { readFile, mkdir, writeFile } from 'node:fs/promises'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { resolve, sep } from 'node:path'
import { zipSync } from 'fflate'
const root=fileURLToPath(new URL('../',import.meta.url)),dist=resolve(root,'dist')
await mkdir(dist,{recursive:true})
const npm=process.platform==='win32'?'npm.cmd':'npm'
const [pack]=JSON.parse(execFileSync(npm,['pack','--json','--pack-destination',dist],{cwd:root,encoding:'utf8'}))
const entries={}
for(const {path} of pack.files){const absolute=resolve(root,path);if(!absolute.startsWith(root.endsWith(sep)?root:root+sep))throw new Error('Invalid package path');entries[path]=new Uint8Array(await readFile(absolute))}
const manifest=JSON.parse(new TextDecoder().decode(entries['package.json']))
for(const file of ['index.js','client.js',manifest.dsh.bundle.patch.replace(/^\.\//,''),'LICENSE','README.md'])if(!entries[file])throw new Error('Missing release file: '+file)
if(manifest.private)throw new Error('Release cannot be private')
const filename='dsh-dock-'+manifest.version+'.zip'
await writeFile(resolve(dist,filename),zipSync(entries,{level:9}))
console.log('Release ZIP: dist/'+filename+' ('+pack.files.length+' files)')
console.log('npm tarball: dist/'+pack.filename)
