import {activateLatest} from './updates.js';
const button=document.getElementById('update'),status=document.getElementById('status'),back=document.getElementById('return');
button.onclick=async()=>{
 button.disabled=true;back.hidden=true;status.textContent='正在检查并下载最新版本…';
 try{
  if(!('serviceWorker'in navigator)||!isSecureContext)throw Error('请使用 Safari 打开 HTTPS 更新链接。');
  const registration=await navigator.serviceWorker.register('./sw.js',{updateViaCache:'none'});
  if(registration.active)await registration.update();await activateLatest(registration);
  // Verify the shell through the active worker; an offline fallback is not a successful update.
  const response=await fetch('./index.html',{cache:'reload'});
  if(!response.ok)throw Error('应用页面暂不可用，请稍后重试。');
  status.textContent='更新完成，本机数据已保留。点击下方返回应用。';button.textContent='再次检查';back.hidden=false;
 }catch(error){status.textContent=error.message||'更新失败，请联网重试。';button.textContent='重试更新';}
 finally{button.disabled=false;}
};
