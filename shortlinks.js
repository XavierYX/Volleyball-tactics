// da.gd provides a public CORS API; no API token is shipped to the browser.
const ORIGIN='https://da.gd';
export function shortCode(value){try{const u=new URL(value);return u.protocol==='https:'&&u.hostname==='da.gd'&&!u.port&&!u.search&&!u.hash&&/^\/[A-Za-z0-9_-]{1,100}$/.test(u.pathname)?u.pathname.slice(1):null;}catch{return null;}}
async function request(path,params,fetcher){
 const u=new URL(path,ORIGIN);for(const [k,v]of Object.entries(params))u.searchParams.set(k,v);
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),10000);
 try{const response=await fetcher(u.href,{signal:controller.signal,credentials:'omit',referrerPolicy:'no-referrer'});if(!response.ok)throw Error();const result=(await response.text()).trim();if(result.length>16000)throw Error();return result;}
 catch{throw Error('短链接服务暂不可用，请联网重试或复制完整链接。');}finally{clearTimeout(timer);}
}
export async function shortenLink(link,{fetcher=globalThis.fetch}={}){
 const u=new URL(link);if(!['http:','https:'].includes(u.protocol)||!new URLSearchParams(u.hash.slice(1)).has('pz'))throw Error('只能缩短包含队员与阵型的分享链接。');
 const result=await request('/s',{url:link},fetcher);if(!shortCode(result))throw Error('短链接服务返回了无效链接。');return result;
}
export async function expandLink(value,{fetcher=globalThis.fetch}={}){
 const code=shortCode(value);if(!code)return value;
 const result=await request('/coshorten/'+code,{},fetcher);let u;try{u=new URL(result);}catch{throw Error('短链接已失效。');}
 if(!['https:','http:'].includes(u.protocol)||!new URLSearchParams(u.hash.slice(1)).has('pz')||result.length>16000)throw Error('这不是排阵的队员与阵型分享链接。');return result;
}
