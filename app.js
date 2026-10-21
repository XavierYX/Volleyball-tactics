import {DEFAULT_LIBERO_ROLES,defaultLiberoChoices,migrateLiberoState,eligibleLiberoRoles,rolePosition,liberoReplacementError,setLibero,calibrateLibero} from './libero.js';
import {shortenLink} from './shortlinks.js';
import {templateSnapshot,makeShareLink,parseShareLink,importTemplate} from './sharing.js';
import {ROLES,PLAYER_POSITIONS,shortName,resolvePlayerPosition,POSITIONS,clone,id,createState,startMatch,roleAt,displayedPlayer,scorePoint,undoPoint,correctMatch,checkFormation,substitute,returnStarter,endMatch,validateState,saveRoster} from './core.js';
import {openStore,readState,writeState} from './storage.js';
const $=id=>document.getElementById(id);
let state,viewRound=0,editing=false,editSnapshot=null,mode='match',saveQueue=Promise.resolve(),revision=0,storageBlocked=false,rosterDraft=[],rosterLineup=[],rosterLiberoPlan=[],confirmAction,rosterReturnToSub=false,toastTimer,workerRegistration,updateRequested=false;
function el(tag,props={},...children){const e=document.createElement(tag);for(const [k,v]of Object.entries(props)){if(k==='text')e.textContent=v;else if(k==='class')e.className=v;else e.setAttribute(k,v)}for(const c of children)e.append(c);return e}
const playerName=pid=>state.players.find(p=>p.id===pid)?.name||'未安排';
function toast(message){clearTimeout(toastTimer);$('toast').textContent=message;$('toast').hidden=false;toastTimer=setTimeout(()=>$('toast').hidden=true,2800)}
function showSaveError(message){$('save-error').hidden=false;$('save-error').textContent=message;$('save-status').textContent='保存失败，请复制分享链接';}
function save(){
  if(storageBlocked){showSaveError('无法访问原有本机数据，当前变更仅在内存中，请复制分享链接保存名单与阵型后重新打开。');return;}
  const current=++revision,data=clone(state);$('save-status').textContent='正在保存…';
  saveQueue=saveQueue.then(()=>writeState(data)).then(()=>{if(current===revision){$('save-error').hidden=true;$('save-status').textContent='已保存到本机';}}).catch(()=>showSaveError('本机保存失败，当前数据仍在页面中，请复制分享链接保存名单与阵型。'));
}
function active(){return state.match||{lineup:state.lineup,formations:state.formations,round:viewRound,score:[0,0],serving:false};}
function formations(){return mode==='default'?state.formations:active().formations;}
function finishEditing(){if(editing){editing=false;editSnapshot=null;save();render();}}
function render(){
  const m=active(),hasMatch=!!state.match,preview=hasMatch&&viewRound!==m.round;
  $('welcome').hidden=hasMatch;
  $('scoreboard').hidden=!hasMatch;
  $('exit').hidden=!hasMatch;
  $('device').classList.toggle('in-match',hasMatch);
  $('match-caption').textContent=hasMatch?`R${m.round+1}`:'';
  $('team-us').textContent=hasMatch?m.teams[0]:'我方';$('team-them').textContent=hasMatch?m.teams[1]:'对方';
  $('score-us').textContent=String(m.score[0]).padStart(2,'0');$('score-them').textContent=String(m.score[1]).padStart(2,'0');
  const canScore=hasMatch&&!editing&&!preview&&mode==='match'&&m.libero.verified;
  for(const side of ['us','them']){const index=side==='us'?0:1;$('add-'+side).disabled=!canScore;$('minus-'+side).disabled=!canScore||m.score[index]===0;}
  $('undo').disabled=!hasMatch||!m.history.length||editing||preview||mode!=='match';
  $('correct').disabled=!hasMatch||editing;$('exit').disabled=editing;$('substitute').hidden=!hasMatch||editing; $('substitute').disabled=!hasMatch||editing||preview||mode!=='match';
  const server=hasMatch?playerName(m.lineup[roleAt(1,m.round)]):'';
  $('serve-label').textContent=!hasMatch?'未开始':m.serving?`我方发球 · ${server}`:'对方发球 · 我方接发';
  $('court-heading').textContent=!hasMatch?'默认接发阵型':preview?`R${viewRound+1} 接发预览`:m.serving?'接发预览':'接发站位';
  $('preview-banner').hidden=!preview&&!editing;
  $('preview-copy').textContent=editing?`调整 R${viewRound+1} 站位`:`查看 R${viewRound+1} · 比赛 R${m.round+1}`;
  $('players').replaceChildren();$('mini-court').replaceChildren();
  for(const p of POSITIONS){
    const {player,role,libero,back}=displayedPlayer(state,m,p,viewRound);
    const full=player?.name||'未安排',short=shortName(player?.name);
    const b=el('button',{class:'player'+(back?' back':'')+(libero?' libero':''),'data-position':p,'aria-label':`${full}，${libero?'自由人替换'+ROLES[role]:ROLES[role]}，${back?'后排':'前排'}，${p}号位`,title:`${full} · ${libero?'自由人（替换'+ROLES[role]+'）':ROLES[role]}`},el('b',{text:short}));
    b.disabled=!editing;b.addEventListener('pointerdown',startDrag);b.addEventListener('keydown',e=>moveByKeyboard(e,p));$('players').append(b);
    const original=state.players.find(x=>x.id===m.lineup[role]);
    const cell=el('div',{class:'mini-cell'},el('i',{text:p}),el('span',{text:ROLES[role]}));
    cell.title=libero?`${full}替换${original?.name||ROLES[role]}`:full;$('mini-court').append(cell);
  }
  $('rounds').replaceChildren();
  for(let i=0;i<6;i++){
    const b=el('button',{class:'round','aria-pressed':String(i===viewRound),'aria-label':`查看 R${i+1}${hasMatch&&i===m.round?'，比赛当前轮':''}`},document.createTextNode('R'+(i+1)),el('small',{text:hasMatch&&i===m.round?'当前':''}));
    b.onclick=()=>{finishEditing();viewRound=i;render();$('rounds').children[i].focus({preventScroll:true});};$('rounds').append(b);
  }
  $('mini-round').replaceChildren(document.createTextNode('R'+(viewRound+1)),el('small',{text:hasMatch?(preview?'预览轮次':'当前轮次'):'默认轮次'}));
  $('round-label').textContent=preview?'查看轮次':'当前轮次';
  $('rounds').setAttribute('aria-label','选择查看轮次');
  $('return-current').hidden=!preview||editing;$('return-current').textContent=`返回 R${m.round+1} 记分`;
  $('court').classList.toggle('editing',editing);$('edit').textContent=editing?'完成':'调整站位';$('cancel-edit').hidden=!editing;
  $('edit').setAttribute('aria-pressed',String(editing));
  $('restore-round').hidden=!editing;
  $('restore-round').textContent=mode==='default'?'本轮恢复规整站位':'恢复本轮默认';

  const selected=hasMatch&&!preview?m.libero.role:(m.liberoChoices??state.liberoChoices)[viewRound];
  $('libero-bar').hidden=editing;
  $('libero-status').textContent=!m.lineup[6]?'未安排自由人':hasMatch&&!preview&&!m.libero.verified?'自由人状态待确认':selected===null?'自由人场下':`自由人替换${ROLES[selected]}`;
  $('libero-open').disabled=!m.lineup[6]||preview;
  updateGeometry();
}
function updateGeometry(){
  const coords=formations()[viewRound],errors=checkFormation(coords),bad=new Set(errors.flatMap(e=>e.positions));
  for(const [name,positions,color]of [['front',[4,3,2],'var(--front)'],['back',[5,6,1],'var(--back)']]){
    const line=$(name+'-link');line.setAttribute('points',positions.map(p=>coords[p].join(',')).join(' '));line.style.stroke=positions.some(p=>bad.has(p))?'#e45568':color;
  }
  document.querySelectorAll('.player').forEach(b=>{const p=+b.dataset.position;b.style.left=coords[p][0]+'%';b.style.top=coords[p][1]+'%';b.classList.toggle('invalid',bad.has(p));});
  $('valid-status').textContent=errors.length?'站位需调整':'站位正确';$('valid-status').classList.toggle('error',!!errors.length);
  $('relation-errors').textContent=errors.map(e=>e.message).join('；');$('relation-errors').hidden=!errors.length;
}
function startDrag(e){
  if(!editing)return;e.preventDefault();const b=e.currentTarget,p=+b.dataset.position,start=[e.clientX,e.clientY],origin=[...formations()[viewRound][p]],rect=$('court').getBoundingClientRect();b.setPointerCapture(e.pointerId);
  const move=event=>{formations()[viewRound][p]=[Math.max(9,Math.min(91,origin[0]+(event.clientX-start[0])/rect.width*100)),Math.max(8,Math.min(92,origin[1]+(event.clientY-start[1])/rect.height*100))];updateGeometry();};
  const stop=()=>{b.removeEventListener('pointermove',move);b.removeEventListener('pointerup',stop);b.removeEventListener('pointercancel',stop);};
  b.addEventListener('pointermove',move);b.addEventListener('pointerup',stop);b.addEventListener('pointercancel',stop);
}
function moveByKeyboard(e,p){if(!editing||!['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.key))return;e.preventDefault();const [x,y]=formations()[viewRound][p];formations()[viewRound][p]=[Math.max(9,Math.min(91,x+(e.key==='ArrowRight'?1:e.key==='ArrowLeft'?-1:0))),Math.max(8,Math.min(92,y+(e.key==='ArrowDown'?1:e.key==='ArrowUp'?-1:0)))];updateGeometry();}
function run(action){try{action();save();render();}catch(e){toast(e.message)}}
function selectOptions(select,options,value){select.replaceChildren(...options.map(o=>el('option',{value:o.value,text:o.label})));if(value!==undefined)select.value=String(value);}
function roundOptions(select,value){selectOptions(select,Array.from({length:6},(_,i)=>({value:i,label:'R'+(i+1)})),value)}
function confirm(message,action){$('confirm-copy').textContent=message;confirmAction=action;$('confirm-dialog').showModal();}
$('confirm-yes').onclick=()=>{const action=confirmAction;confirmAction=null;$('confirm-dialog').close();action?.();};
function openSetup(){
  finishEditing();$('setup-error').textContent='';roundOptions($('setup-round'),viewRound);$('setup-score-us').value=0;$('setup-score-them').value=0;$('setup-lineup').replaceChildren();
  [...ROLES,'自由人'].forEach((role,i)=>{const select=el('select',{id:'setup-role-'+i});selectOptions(select,[...(i===6?[{value:'',label:'不使用自由人'}]:[]),...state.players.map(p=>({value:p.id,label:`${p.name} · ${resolvePlayerPosition(p)||'未指定'}`}))],state.lineup[i]||'');select.onchange=renderSetupLibero;$('setup-lineup').append(el('label',{class:'field'},document.createTextNode(role),select));});renderSetupLibero();$('setup-dialog').showModal();
}

const readLiberoRole=select=>select.value===''?null:+select.value;
function liberoOptions(m){return [{value:'',label:'自由人场下'},...eligibleLiberoRoles(m).map(r=>({value:r,label:`替换${ROLES[r]} · ${playerName(m.lineup[r])}`}))];}
function renderSetupLibero(){
 const m={lineup:Array.from({length:7},(_,i)=>$('setup-role-'+i).value||null),round:+$('setup-round').value,serving:$('setup-serve').value==='us',liberoPlan:state.liberoPlan};
 const preferred=state.liberoChoices[m.round],role=eligibleLiberoRoles(m).includes(preferred)?preferred:null;selectOptions($('setup-libero'),liberoOptions(m),role??'');
}
$('setup-round').onchange=renderSetupLibero;$('setup-serve').onchange=renderSetupLibero;
function renderCorrectLibero(){const m={...state.match,round:+$('correct-round').value,serving:$('correct-serve').value==='us',liberoRole:readLiberoRole($('correct-libero'))};const r=state.match.libero.role;selectOptions($('correct-libero'),liberoOptions(m),eligibleLiberoRoles(m).includes(r)?r:'');}
$('correct-round').onchange=renderCorrectLibero;$('correct-serve').onchange=renderCorrectLibero;
function updateLiberoSubmit(){
 const role=readLiberoRole($('libero-role')),m=state.match;
 const error=m&&m.libero.verified?liberoReplacementError(m,role):'';$('libero-error').textContent=error;
 $('libero-submit').disabled=!!error||!!m&&m.libero.verified&&role===m.libero.role;
 $('libero-submit').textContent=!m?'保存本轮预设':!m.libero.verified?'确认当前状态':role===null?'原队员回场':'自由人上场';
}
$('libero-open').onclick=()=>{
 finishEditing();const m=state.match||{...active(),liberoPlan:state.liberoPlan,serving:false,round:viewRound};
 $('libero-current').textContent=$('libero-status').textContent;$('libero-confirm-label').hidden=!state.match;$('libero-confirm').checked=false;
 $('libero-confirm-label').lastChild.textContent=state.match&&!state.match.libero.verified?'已核对现场自由人状态和替换间隔；当前死球且未鸣哨':'当前为死球，且尚未鸣发球哨';
 const r=state.match?m.libero.role:state.liberoChoices[viewRound];selectOptions($('libero-role'),liberoOptions(m),r??'');
 $('libero-history').replaceChildren();for(const e of [...(m.libero?.events??[])].reverse().slice(0,20))$('libero-history').append(el('p',{text:`${e.score.join(':')} · ${e.reason==='correction'?(e.to===null?'自由人场下':'自由人替换'+ROLES[e.to]):e.to===null?ROLES[e.from]+'原队员回场':'自由人替换'+ROLES[e.to]}${e.reason==='rotation'?'（轮转）':e.reason==='correction'?'（核对）':''}`}));
 $('libero-records').hidden=!state.match;updateLiberoSubmit();$('libero-dialog').showModal();
};
$('libero-role').onchange=updateLiberoSubmit;
$('libero-form').onsubmit=e=>{e.preventDefault();try{
 const role=readLiberoRole($('libero-role'));
 if(state.match){if(!state.match.libero.verified)calibrateLibero(state.match,role,{deadBallConfirmed:$('libero-confirm').checked});else setLibero(state.match,role,{deadBallConfirmed:$('libero-confirm').checked});}
 else state.liberoChoices[viewRound]=role;
 save();render();$('libero-dialog').close();
}catch(err){$('libero-error').textContent=err.message;}};

$('start').onclick=openSetup;
$('setup-form').onsubmit=e=>{e.preventDefault();try{startMatch(state,{lineup:Array.from({length:7},(_,i)=>$('setup-role-'+i).value||null),score:[+$('setup-score-us').value,+$('setup-score-them').value],round:+$('setup-round').value,serving:$('setup-serve').value==='us',teams:[$('setup-us').value,$('setup-them').value],liberoRole:readLiberoRole($('setup-libero'))});mode='match';viewRound=state.match.round;$('setup-dialog').close();save();render();}catch(err){$('setup-error').textContent=err.message}};
for(const [side,team]of [['us',0],['them',1]])for(const [prefix,delta]of [['add',1],['minus',-1]])$(prefix+'-'+side).onclick=()=>run(()=>{if(!state.match||editing||viewRound!==state.match.round)return;scorePoint(state.match,team,delta);viewRound=state.match.round;});
$('undo').onclick=()=>run(()=>{undoPoint(state.match);viewRound=state.match.round;});
$('return-current').onclick=()=>{finishEditing();viewRound=state.match.round;mode='match';render()};
$('edit').onclick=()=>{if(editing)finishEditing();else{editSnapshot=clone(formations()[viewRound]);editing=true;}render();$('edit').focus({preventScroll:true});};
$('cancel-edit').onclick=()=>{if(!editing)return;formations()[viewRound]=clone(editSnapshot);editing=false;editSnapshot=null;render();$('edit').focus({preventScroll:true});};
$('correct').onclick=()=>{const m=state.match;$('correct-us').value=m.score[0];$('correct-them').value=m.score[1];roundOptions($('correct-round'),m.round);$('correct-serve').value=m.serving?'us':'them';$('correct-error').textContent='';$('correct-libero-confirm').checked=false;renderCorrectLibero();$('correct-dialog').showModal();};
$('correct-form').onsubmit=e=>{e.preventDefault();try{correctMatch(state.match,{score:[+$('correct-us').value,+$('correct-them').value],round:+$('correct-round').value,serving:$('correct-serve').value==='us',liberoRole:readLiberoRole($('correct-libero'))});viewRound=state.match.round;$('correct-dialog').close();save();render();}catch(err){$('correct-error').textContent=err.message}};
$('restore-round').onclick=()=>{if(!editing)return;confirm(`确认恢复 R${viewRound+1} 的${mode==='default'?'规整站位':'默认站位'}？本轮调整将被替换。`,()=>{formations()[viewRound]=clone(mode==='default'?{1:[79,74],2:[79,26],3:[50,26],4:[21,26],5:[21,74],6:[50,74]}:state.formations[viewRound]);render();});};
$('exit').onclick=()=>{finishEditing();$('exit-dialog').showModal()};
for(const [button,overwrite]of [['exit-save',true],['exit-discard',false]])$(button).onclick=()=>run(()=>{endMatch(state,overwrite);viewRound=0;mode='default';$('exit-dialog').close();toast(overwrite?'已保存默认六轮站位':'已退出，默认站位保持不变');});
function referencedIds(){return new Set([...state.lineup,...(state.match?[...state.match.lineup,...state.match.originalLineup,...state.match.substitutions.flatMap(s=>[s.from,s.to])]:[])].filter(Boolean));}
function refreshRosterRemoval(){
  for(const button of $('roster-fields').querySelectorAll('[data-remove-player]'))button.disabled=referencedIds().has(button.dataset.removePlayer)||rosterLineup.includes(button.dataset.removePlayer);
}
function renderRosterRoles(){
  $('roster-lineup-title').textContent=state.match?'本场角色':'首发角色';
  $('roster-lineup').replaceChildren();
  [...ROLES,'自由人'].forEach((role,i)=>{
    const select=el('select',{'aria-label':role+'队员'});
    selectOptions(select,[...(i===6?[{value:'',label:'不使用自由人'}]:[]),...rosterDraft.map(p=>({value:p.id,label:p.name||'未命名队员'}))],rosterLineup[i]||'');
    select.disabled=!!state.match;
    select.onchange=()=>{rosterLineup[i]=select.value||null;refreshRosterRemoval();};
    $('roster-lineup').append(el('label',{class:'field'},document.createTextNode(role),select));
  });
}
function renderRoster(){
  renderRosterRoles();$('libero-plan-options').replaceChildren(...ROLES.map((role,i)=>{const check=el('input',{type:'checkbox',value:i,'aria-label':'自由人可替换'+role});check.checked=rosterLiberoPlan.includes(i);check.disabled=!!state.match;check.onchange=()=>{rosterLiberoPlan=check.checked?[...rosterLiberoPlan,i]:rosterLiberoPlan.filter(r=>r!==i);};return el('label',{},check,document.createTextNode(role));}));$('roster-fields').replaceChildren();
  for(const p of rosterDraft){
    const name=el('input',{value:p.name,maxlength:32,required:'',placeholder:'姓名','aria-label':'队员姓名'}),position=el('select',{'aria-label':'队员位置',required:''});
    selectOptions(position,[{value:'',label:'请选择位置'},...PLAYER_POSITIONS.map(v=>({value:v,label:v}))],p.position);position.options[0].disabled=true;
    name.oninput=()=>{p.name=name.value;p.short=shortName(p.name);renderRosterRoles();};
    position.onchange=()=>p.position=position.value;
    const remove=el('button',{type:'button',text:'移除','data-remove-player':p.id,'aria-label':'移除'+(p.name||'新队员')});remove.disabled=referencedIds().has(p.id)||rosterLineup.includes(p.id);remove.onclick=()=>{rosterDraft=rosterDraft.filter(x=>x.id!==p.id);renderRoster()};
    const row=el('div',{class:'roster-item'},el('div',{class:'roster-fields'},name,position,remove));$('roster-fields').append(row);
  }
}
$('nav-roster').onclick=()=>{rosterReturnToSub=false;finishEditing();rosterLiberoPlan=clone(state.liberoPlan);rosterDraft=clone(state.players).map(p=>({...p,position:resolvePlayerPosition(p)}));rosterLineup=clone(state.match?.lineup||state.lineup);$('roster-error').textContent='';renderRoster();$('roster-dialog').showModal()};
$('add-player').onclick=()=>{if(rosterDraft.length>=200){$('roster-error').textContent='最多支持 200 名队员。';return}rosterDraft.push({id:id(),name:'',short:'',position:'其他'});renderRoster();$('roster-fields').lastElementChild.querySelector('input').focus();};
$('roster-form').onsubmit=e=>{e.preventDefault();try{const players=rosterDraft.map(p=>({...p,name:p.name.trim(),short:shortName(p.name)}));const next=clone(state);saveRoster(next,players,rosterLineup);if(!next.match&&JSON.stringify(next.liberoPlan)!==JSON.stringify(rosterLiberoPlan)){next.liberoPlan=clone(rosterLiberoPlan);next.liberoChoices=defaultLiberoChoices(rosterLiberoPlan);}validateState(next);state=next;const returnToSub=rosterReturnToSub;rosterReturnToSub=false;$('roster-dialog').close();save();render();if(returnToSub&&state.match){renderSub();$('sub-dialog').showModal();}toast('队员名单已保存');}catch(err){$('roster-error').textContent=err.message}};
function renderSub(){
  const m=state.match;$('sub-error').textContent='';
  selectOptions($('sub-role'),ROLES.map((label,i)=>({value:i,label:`${label} · ${playerName(m.lineup[i])}`})));
  const bench=state.players.filter(p=>!m.lineup.includes(p.id));selectOptions($('sub-player'),bench.length?bench.map(p=>({value:p.id,label:`${p.name} · ${resolvePlayerPosition(p)||'未指定'}`})):[{value:'',label:'请先在队员中添加替补'}]);
  $('sub-add-player').hidden=bench.length>0;$('sub-form').querySelector('[type=submit]').disabled=!bench.length;
  $('return-list').replaceChildren();m.lineup.forEach((pid,role)=>{const original=m.originalLineup[role];if(!original||pid===original)return;const b=el('button',{type:'button',class:'secondary',text:`${ROLES[role]||'自由人'}换回 ${playerName(original)}`});b.style.width='100%';b.style.marginTop='10px';b.onclick=()=>{try{returnStarter(state,role);save();render();renderSub();}catch(e){$('sub-error').textContent=e.message}};$('return-list').append(b);});
  $('sub-history').replaceChildren();if(m.substitutions.length)$('sub-history').append(el('h3',{text:'本场换人记录'}));
  for(const s of [...m.substitutions].reverse())$('sub-history').append(el('div',{class:'sub-item',text:`${s.score.join(':')} · ${ROLES[s.role]||'自由人'}：${playerName(s.from)} → ${playerName(s.to)}`}));
}
$('sub-add-player').onclick=()=>{$('sub-dialog').close();$('nav-roster').click();rosterReturnToSub=true;$('add-player').click();};
$('substitute').onclick=()=>{renderSub();$('sub-dialog').showModal()};
$('sub-form').onsubmit=e=>{e.preventDefault();try{substitute(state,+$('sub-role').value,$('sub-player').value);save();render();renderSub();toast('已换人，轮次和站位保持不变');}catch(err){$('sub-error').textContent=err.message}};
$('help').onclick=()=>{finishEditing();$('help-dialog').showModal()};
let shareRequest=0,importRequest=0,pendingTemplate=null,fullShareLink='';const shortCache=new Map();
function clearShareHash(){
  const url=new URL(location.href),params=new URLSearchParams(url.hash.slice(1));
  if(params.has('pz')){params.delete('pz');url.hash=params.toString();history.replaceState(null,'',url.href);}
}
async function prepareShare(){
 const request=++shareRequest;$('share-error').textContent='';$('share-link').value='正在生成短链接…';$('copy-share').disabled=true;$('copy-full-share').disabled=true;fullShareLink='';
 try{
  const source=$('share-source').value,snapshot=templateSnapshot(state,source);$('share-summary').textContent=`${snapshot.players.length} 名队员 · 6 轮阵型`;
  const full=await makeShareLink(state,location.href,source);if(request!==shareRequest||!$('share-dialog').open)return;
  fullShareLink=full;$('copy-full-share').disabled=false;
  const short=shortCache.get(full)||await shortenLink(full);shortCache.set(full,short);
  if(request!==shareRequest||!$('share-dialog').open)return;$('share-link').value=short;$('copy-share').disabled=false;
 }catch(err){if(request===shareRequest){$('share-link').value='';$('share-error').textContent=err.message;}}
}
function openShare(){
  finishEditing();$('help-dialog').close();
  selectOptions($('share-source'),[{value:'default',label:'默认阵型与首发'},...(state.match?[{value:'match',label:'本场阵型与当前队员'}]:[])],'default');
  $('share-dialog').showModal();prepareShare();
}
function openImport(){finishEditing();$('help-dialog').close();$('import-error').textContent='';$('import-dialog').showModal();}
$('open-share').onclick=openShare;$('open-import').onclick=openImport;$('share-source').onchange=prepareShare;
async function copyLink(value){try{if(!navigator.clipboard?.writeText)throw Error();await navigator.clipboard.writeText(value);toast('分享链接已复制');}catch{$('share-link').value=value;$('share-link').focus();$('share-link').select();toast('请长按链接选择复制');}}
$('copy-share').onclick=()=>copyLink($('share-link').value);
$('copy-full-share').onclick=()=>copyLink(fullShareLink);
async function previewImportLink(){
  const request=++importRequest;$('import-error').textContent='';$('preview-import').disabled=true;$('preview-import').textContent='正在读取…';
  try{
    const incoming=await parseShareLink($('import-link').value);
    if(request!==importRequest||!$('import-dialog').open)return;
    pendingTemplate=incoming;
    $('import-summary').textContent=`${incoming.players.length} 名队员 · 6 轮阵型`;
    $('import-lineup').replaceChildren(...[...ROLES,'自由人'].map((role,i)=>{
      const name=incoming.players.find(p=>p.id===incoming.lineup[i])?.name||'不使用';
      return el('div',{class:'import-member'},el('b',{text:role}),el('span',{text:name}));
    }));
    $('apply-import').disabled=!!state.match;
    $('import-preview-error').textContent=state.match?'请先退出当前比赛，再导入队员与阵型。':'';
    $('import-dialog').close();clearShareHash();$('import-preview-dialog').showModal();
  }catch(err){if(request===importRequest)$('import-error').textContent=err.message;}
  finally{if(request===importRequest){$('preview-import').disabled=false;$('preview-import').textContent='预览队员与阵型';}}
}
$('preview-import').onclick=previewImportLink;
$('import-dialog').addEventListener('close',()=>{importRequest++;$('preview-import').disabled=false;$('preview-import').textContent='预览队员与阵型';clearShareHash();});
$('apply-import').onclick=async()=>{
  if(!pendingTemplate)return;
  try{
    if(state.match)throw Error('请先退出当前比赛，再导入队员与阵型。');
    if(storageBlocked){await openStore();storageBlocked=false;}
    importTemplate(state,pendingTemplate);pendingTemplate=null;viewRound=0;mode='default';editing=false;
    save();render();$('import-preview-dialog').close();toast('队员与六轮阵型已导入');
  }catch(err){$('import-preview-error').textContent=err.message||'无法保存导入内容，请重试。';}
};
function receiveShareHash(){
  if(!new URLSearchParams(location.hash.slice(1)).has('pz'))return;
  if($('import-preview-dialog').open)$('import-preview-dialog').close();
  if($('share-dialog').open)$('share-dialog').close();
  $('import-link').value=location.href;
  if(!$('import-dialog').open)openImport();
  previewImportLink();
}
window.addEventListener('hashchange',receiveShareHash);
for(const b of document.querySelectorAll('[data-close]'))b.onclick=()=>b.closest('dialog').close();
for(const d of document.querySelectorAll('dialog'))d.addEventListener('click',e=>{if(e.target!==d)return;const r=d.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)d.close();});
async function offlineSetup(){
  if(!('serviceWorker'in navigator)||!isSecureContext){$('offline-status').textContent='离线功能需要 HTTPS 或本机 localhost。';return;}
  try{
    workerRegistration=await navigator.serviceWorker.register('./sw.js');
    const updateStatus=async()=>{const cached=(await caches.keys()).some(key=>key.startsWith('lunjian-'));$('offline-status').textContent=cached?(navigator.onLine?'离线已就绪 · 可添加到主屏幕':'当前离线 · 数据继续保存在本机'):'离线资源尚未缓存，请联网重新打开';};
    navigator.serviceWorker.ready.then(updateStatus);window.addEventListener('online',updateStatus);window.addEventListener('offline',updateStatus);
    const waiting=()=>{$('apply-update').hidden=false;$('offline-status').textContent='新版本已就绪，退出比赛后可在“分享与备份”中更新。'};
    if(workerRegistration.waiting)waiting();
    workerRegistration.addEventListener('updatefound',()=>{const worker=workerRegistration.installing;worker?.addEventListener('statechange',()=>{if(worker.state==='installed'&&navigator.serviceWorker.controller)waiting()});});
    $('apply-update').onclick=()=>{if(state.match){toast('请先退出比赛，再更新应用。');return}updateRequested=true;workerRegistration.waiting?.postMessage({type:'ACTIVATE'});};
    navigator.serviceWorker.addEventListener('controllerchange',()=>{if(updateRequested&&!state.match)location.reload();});
  }catch{$('offline-status').textContent='离线缓存未完成，请联网重试；当前编辑仍可保存。';}
}
try{await openStore();const saved=await readState();state=migrateLiberoState(saved?validateState(saved):createState());viewRound=state.match?.round||0;mode=state.match?'match':'default';$('save-status').textContent=saved?'已恢复本机数据':'已准备好';if(!saved)save();}
catch{state=createState();storageBlocked=true;showSaveError('本机数据读取失败，未覆盖原数据。当前可临时使用，请复制分享链接保存名单与阵型；可尝试关闭其他页面再打开。');}
render();offlineSetup();receiveShareHash();
