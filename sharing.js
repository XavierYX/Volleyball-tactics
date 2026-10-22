import {DEFAULT_LIBERO_ROLES,defaultLiberoChoices} from './libero.js';
import {expandLink} from './shortlinks.js';
import {clone,id,validateState,POSITIONS,shortName,resolvePlayerPosition,migrateLineups,syncLineup,createLineup,nextLineupName,MAX_LINEUPS,rosterPlayers} from './core.js';
// Codes 0–5 remain stable for links created before specific positions were introduced.
const TYPES=['二传','主攻','副攻','接应','自由人','其他','大主','小主','大副','小副'];
export const MAX_LINK_LENGTH=16000;
const MAX_BYTES=65536;
export function templateSnapshot(state,source='default'){
  const saved=source.startsWith('lineup:')?state.lineupSets?.find(x=>x.id===source.slice(7)):null;
  if(source.startsWith('lineup:')&&!saved)throw Error('该阵容不存在。');
  const from=source==='match'?state.match:saved;
  const name=saved?.name||state.lineupSets?.find(x=>x.id===state.activeLineupId)?.name||'阵容';
  if(source==='match'&&!from)throw Error('没有正在进行的比赛。');
  const clean={version:1,players:rosterPlayers(state,from??state).map(p=>({id:p.id,name:p.name,short:shortName(p.name),position:resolvePlayerPosition(p)||p.position})),lineup:clone(from?.lineup||state.lineup),formations:clone(from?.formations||state.formations),match:null,liberoPlan:clone(from?.liberoPlan??state.liberoPlan??DEFAULT_LIBERO_ROLES),liberoChoices:clone(from?.liberoChoices??state.liberoChoices??defaultLiberoChoices(from?.liberoPlan??state.liberoPlan??DEFAULT_LIBERO_ROLES))};
  clean.lineupName=source==='match'?name+'（本场）':name;
  return clone(validateState(clean));
}
function pack(template){
  return {v:4,n:template.lineupName,a:[template.liberoPlan,template.liberoChoices],p:template.players.map(p=>[p.name,p.short,TYPES.indexOf(p.position)]),l:template.lineup.map(pid=>pid===null?null:template.players.findIndex(p=>p.id===pid)),f:template.formations.map(f=>POSITIONS.map(p=>f[p]))};
}
function unpack(data){
  if(![1,2,3,4].includes(data?.v))throw Error('分享链接版本不支持，请更新应用。');
  if(!Array.isArray(data.p)||data.p.length<6||data.p.length>200||data.p.some(p=>!Array.isArray(p)||p.length!==3||!Number.isInteger(p[2])||p[2]<0||p[2]>=(data.v===1?6:TYPES.length))||!Array.isArray(data.l)||data.l.length!==7||data.l.some(i=>i!==null&&(!Number.isInteger(i)||i<0||i>=data.p.length))||!Array.isArray(data.f)||data.f.length!==6||data.f.some(f=>!Array.isArray(f)||f.length!==6))throw Error('分享链接中的队员或阵型不完整。');
  const players=data.p.map(([name,short,type])=>({id:id(),name,short,position:resolvePlayerPosition({position:TYPES[type]})}));
  if(data.v>=3&&(!Array.isArray(data.a)||data.a.length!==2))throw Error('自由人预设不完整。');
  const plan=data.v>=3?data.a[0]:[...DEFAULT_LIBERO_ROLES],choices=data.v>=3?data.a[1]:defaultLiberoChoices(plan);
  if(data.v===4&&(typeof data.n!=='string'||!data.n.trim()||data.n.length>32))throw Error('阵容名称不正确。');
  const template={version:1,lineupName:data.v===4?data.n:'导入阵容',liberoPlan:plan,liberoChoices:choices,players,lineup:data.l.map(i=>i===null?null:players[i].id),formations:data.f.map(f=>Object.fromEntries(POSITIONS.map((p,i)=>[p,f[i]]))),match:null};
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
export async function parseShareLink(value,options={}){
  if(typeof value!=='string'||value.length>MAX_LINK_LENGTH)throw Error('分享链接无效或过长。');
  value=await expandLink(value.trim(),options);
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
  const clean=templateSnapshot(template),next=clone(state);migrateLineups(next);
  if(next.lineupSets.length>=MAX_LINEUPS)throw Error('最多保存 30 套阵容，请先移除不需要的阵容。');
  const mapping=new Map();
  // Reuse unambiguous matching players; never alter another lineup's references.
  for(const player of clean.players){
    const matches=next.players.filter(p=>p.name.trim()===player.name.trim()&&resolvePlayerPosition(p)===resolvePlayerPosition(player));
    const existing=matches.length===1&&!Array.from(mapping.values()).includes(matches[0].id)?matches[0]:null;
    if(existing)mapping.set(player.id,existing.id);
    else {const added={...clone(player),id:id()};next.players.push(added);mapping.set(player.id,added.id);}
  }
  const base=(template.lineupName||'导入阵容').trim().slice(0,24)||'导入阵容';
  const name=next.lineupSets.some(x=>x.name===base)?nextLineupName(next,base.slice(0,18)):base;
  createLineup(next,name);
  next.rosterIds=clean.players.map(p=>mapping.get(p.id));
  next.lineup=clean.lineup.map(pid=>pid===null?null:mapping.get(pid));next.formations=clean.formations;next.liberoPlan=clean.liberoPlan;next.liberoChoices=clean.liberoChoices;
  syncLineup(next);validateState(next);Object.assign(state,next);
}
