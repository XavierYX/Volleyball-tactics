import {mkdir,rm,copyFile,cp} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
const root=new URL('../',import.meta.url),dist=new URL('../dist/',import.meta.url);
await rm(dist,{recursive:true,force:true});
await mkdir(dist,{recursive:true});
for(const name of ['index.html','styles.css','app.js','core.js','libero.js','shortlinks.js','sharing.js','storage.js','sw.js','manifest.webmanifest'])await copyFile(new URL(name,root),new URL(name,dist));
await cp(new URL('icons/',root),new URL('icons/',dist),{recursive:true});
console.log('Static app built at '+fileURLToPath(dist));
