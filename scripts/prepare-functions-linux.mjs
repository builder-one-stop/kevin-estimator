import fs from 'node:fs'
import path from 'node:path'
import {createHash} from 'node:crypto'
import {execFileSync} from 'node:child_process'
const repo=process.cwd(),lockFile=path.join(repo,'package-lock.json'),pkgFile=path.join(repo,'package.json')
const digest=p=>createHash('sha256').update(fs.readFileSync(p)).digest('hex')
const before={package:digest(pkgFile),lock:digest(lockFile)}
const lock=JSON.parse(fs.readFileSync(lockFile,'utf8')),sharp=JSON.parse(fs.readFileSync(path.join(repo,'node_modules/sharp/package.json'),'utf8'))
const base=path.join(repo,'.netlify/native-linux');fs.mkdirSync(base,{recursive:true})
for(const name of ['@img/sharp-libvips-linux-x64','@img/sharp-linux-x64']){
 const item=lock.packages['node_modules/'+name]
 if(!item||sharp.optionalDependencies[name]!==item.version||new URL(item.resolved).origin!=='https://registry.npmjs.org'||!item.integrity.startsWith('sha512-'))throw Error('LOCK_OR_SOURCE_MISMATCH')
 const dest=path.resolve(repo,'node_modules',name)
 if(!dest.startsWith(path.resolve(repo,'node_modules/@img')+path.sep))throw Error('UNSAFE_TARGET')
 const alreadyPresent=fs.existsSync(dest)
 const archive=path.join(base,name.split('/')[1]+'-'+item.version+'.tgz')
 let bytes
 if(fs.existsSync(archive))bytes=fs.readFileSync(archive)
 else{const response=await fetch(item.resolved,{signal:AbortSignal.timeout(60000)});if(!response.ok)throw Error('REGISTRY_DOWNLOAD_FAILED');bytes=Buffer.from(await response.arrayBuffer());if(bytes.length>50000000)throw Error('ARCHIVE_TOO_LARGE')}
 if('sha512-'+createHash('sha512').update(bytes).digest('base64')!==item.integrity)throw Error('INTEGRITY_MISMATCH')
 if(!fs.existsSync(archive))fs.writeFileSync(archive,bytes,{flag:'wx'})
 const entries=execFileSync('tar.exe',['-tzf',archive],{encoding:'utf8'}).trim().split(/\r?\n/)
 if(entries.some(e=>!e.startsWith('package/')||e.split('/').includes('..')||e.includes('\\')))throw Error('UNSAFE_ARCHIVE_ENTRY')
 if(!alreadyPresent){fs.mkdirSync(dest,{recursive:true});execFileSync('tar.exe',['-xzf',archive,'--strip-components=1','-C',dest],{stdio:'pipe'})}
 const installed=JSON.parse(fs.readFileSync(path.join(dest,'package.json'),'utf8'))
 if(installed.version!==item.version||installed.name!==name)throw Error('PACKAGE_IDENTITY_MISMATCH')
 const bins=fs.readdirSync(path.join(dest,'lib')).filter(n=>/\.node$|\.so\./.test(n))
 if(!bins.length)throw Error('NATIVE_BINARY_MISSING')
 for(const binary of bins){const header=fs.readFileSync(path.join(dest,'lib',binary));if(header.subarray(0,4).toString('hex')!=='7f454c46'||header.readUInt16LE(18)!==62)throw Error('EXPECTED_LINUX_X64_ELF')}
 console.info(JSON.stringify({package:name,version:item.version,source:'registry.npmjs.org',sha512Verified:true,linuxX64ElfVerified:true,alreadyPresent,installScriptsExecuted:false,globalInstall:false}))
}
if(before.package!==digest(pkgFile)||before.lock!==digest(lockFile))throw Error('PROJECT_DEPENDENCY_GRAPH_CHANGED')
console.info('Existing package.json and lock unchanged; only locked optional Linux artifacts added for function packaging.')
