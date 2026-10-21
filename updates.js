/** Wait for the complete new shell before activating; never touches match storage. */
export function waitForWorker(worker,states,{timeoutMs=30000}={}){
 return new Promise((resolve,reject)=>{
  const finish=(error)=>{clearTimeout(timer);worker.removeEventListener('statechange',changed);error?reject(error):resolve(worker);};
  const changed=()=>{if(states.includes(worker.state))finish();else if(worker.state==='redundant')finish(Error('新版下载失败，请检查网络后重试。'));};
  const timer=setTimeout(()=>finish(Error('更新等待超时，请检查网络后重试。')),timeoutMs);
  worker.addEventListener('statechange',changed);changed();
 });
}
export async function activateLatest(registration,options){
 const worker=registration.waiting||registration.installing;
 if(!worker)return false;
 await waitForWorker(worker,['installed','activating','activated'],options);
 if(worker.state==='installed')worker.postMessage({type:'ACTIVATE'});
 await waitForWorker(worker,['activated'],options);return true;
}
