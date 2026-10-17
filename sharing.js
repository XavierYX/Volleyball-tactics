import {clone,id,validateState,POSITIONS} from './core.js';
const TYPES=['二传','主攻','副攻','接应','自由人','其他'];
export const MAX_LINK_LENGTH=16000;
const MAX_BYTES=65536;
export function templateSnapshot(state,source='default'){
  const from=source==='match'?state.match:null;
  if(source==='match'&&!from)throw Error('没有正在进行的比赛。');
  const clean={version:1,players:state.players.map(p=>({id:p.id,name:p.name,short:p.short,position:p.position})),lineup:clone(from?.lineup||state.lineup),formations:clone(from?.formations||state.formations),match:null};
  return clone(validateState(clean));
}
function pack(template){
  return {v:1,p:template.players.map(p=>[p.name,p.short,TYPES.indexOf(p.position)]),l:template.lineup.map(pid=>pid===null?null:template.players.findIndex(p=>p.id===pid)),f:template.formations.map(f=>POSITIONS.map(p=>f[p]))};
}
function unpack(data){
  if(data?.v!==1)throw Error('分享链接版本不支持，请更新应用。');
  if(!Array.isArray(data.p)||data.p.length<6||data.p.length>200||data.p.some(p=>!Array.isArray(p)||p.length!==3||!Number.isInteger(p[2])||p[2]<0||p[2]>=TYPES.length)||!Array.isArray(data.l)||data.l.length!==7||data.l.some(i=>i!==null&&(!Number.isInteger(i)||i<0||i>=data.p.length))||!Array.isArray(data.f)||data.f.length!==6||data.f.some(f=>!Array.isArray(f)||f.length!==6))throw Error('分享链接中的队员或阵型不完整。');
  const players=data.p.map(([name,short,type])=>({id:id(),name,short,position:TYPES[type]}));
  const template={version:1,players,lineup:data.l.map(i=>i===null?null:players[i].id),formations:data.f.map(f=>Object.fromEntries(POSITIONS.map((p,i)=>[p,f[i]]))),match:null};
  try{return validateState(template);}catch{throw Error('分享链接中的队员或阵型不正确。');}
}
function base64url(bytes){let s='';for(const b of bytes)s+=String.fromCharCode(b);return btoa(s).replaceAll('+','-').replaceAll('/','_').replace(/=+$/,'');}
function fromBase64url(s){if(!s||!/^[\w-]+$/.test(s))throw Error('分享链接已损坏，请重新复制完整链接。');const binary=atob(s.replaceAll('-','+').replaceAll('_','/'));return Uint8Array.from(binary,c=>c.charCodeAt(0));}
async function limitedRead(stream){
  const reader=stream.getReader(),chunks=[];let size=0;
  try{while(true){const {value,done}=await reader.read();if(done)break;size+=value.byteLength;if(size>MAX_BYTES){await reader.cancel();throw Error('分享数据过大。');}chunks.push(value);}}
  finally{reader.releaseLock();}
  const bytes=new Uint8Array(size);let offset=0;for(const c of chunks){bytes.set(c,offset);offset+=c.length;}return bytes;
}
/** The fragment carries a snapshot and is never sent in the page's HTTP request. */
export async function makeShareLink(state,baseURL,source='default',{compress=true}={}){
  const template=templateSnapshot(state,source),raw=new TextEncoder().encode(JSON.stringify(pack(template)));
  if(raw.length>MAX_BYTES)throw Error('名单过大，请缩短姓名或减少替补后重试。');
  let bytes=raw,format='j1';
  if(compress&&typeof CompressionStream==='function'){
    try{const zipped=await limitedRead(new Blob([raw]).stream().pipeThrough(new CompressionStream('deflate')));if(zipped.length<raw.length){bytes=zipped;format='z1';}}catch{/* Plain format remains available if compression is unavailable. */}
  }
  const url=new URL(baseURL);url.hash='';url.search='';url.hash='pz='+format+'.'+base64url(bytes);
  if(url.href.length>MAX_LINK_LENGTH)throw Error('分享链接过长，请缩短姓名或减少替补名单后重试。');
  return url.href;
}
export async function parseShareLink(value){
  if(typeof value!=='string'||value.length>MAX_LINK_LENGTH)throw Error('分享链接无效或过长。');
  let url;try{url=new URL(value.trim());}catch{throw Error('请粘贴完整的排阵分享链接。');}
  if(!['https:','http:'].includes(url.protocol))throw Error('请粘贴网页分享链接。');
  const token=new URLSearchParams(url.hash.slice(1)).get('pz');
  if(!token)throw Error('这不是包含队员和阵型的分享链接。');
  const split=token.indexOf('.'),format=token.slice(0,split),encoded=token.slice(split+1);
  if(!['j1','z1'].includes(format))throw Error('分享链接版本不支持，请更新应用。');
  try{
    let bytes=fromBase64url(encoded);
    if(format==='z1'){
      if(typeof DecompressionStream!=='function')throw Error('当前浏览器无法读取压缩链接，请用 Safari 或更新浏览器。');
      bytes=await limitedRead(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate')));
    }
    if(bytes.length>MAX_BYTES)throw Error('分享数据过大。');
    const data=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
    return unpack(data);
  }catch(e){if(e.message?.includes('请')||e.message?.startsWith('分享'))throw e;throw Error('分享链接已损坏，请重新复制完整链接。');}
}
export function importTemplate(state,template){
  if(state.match)throw Error('请先退出当前比赛，再导入队员与阵型。');
  const clean=templateSnapshot(template);
  state.players=clean.players;state.lineup=clean.lineup;state.formations=clean.formations;
}
