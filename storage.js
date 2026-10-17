// Keep the database name stable across branding changes so existing matches survive.
const DB='lunjian-volleyball';
let db;
export async function openStore(){
  db=await new Promise((resolve,reject)=>{const req=indexedDB.open(DB,1);req.onupgradeneeded=()=>req.result.createObjectStore('app');req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);req.onblocked=()=>reject(Error('请关闭其他页面后重试。'));});
}
export function readState(){return new Promise((resolve,reject)=>{const req=db.transaction('app').objectStore('app').get('state');req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);});}
export function writeState(state){return new Promise((resolve,reject)=>{if(!db)return reject(Error('本机存储不可用'));const tx=db.transaction('app','readwrite');tx.objectStore('app').put(state,'state');tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error||Error('保存已中断'));});}
