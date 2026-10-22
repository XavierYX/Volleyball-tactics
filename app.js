import {preventScoreboardDoubleTap} from './touch.js';
import {activateLatest} from './updates.js';
import {DEFAULT_LIBERO_ROLES,defaultLiberoChoices,migrateLiberoState,eligibleLiberoRoles,rolePosition,liberoReplacementError,setLibero,calibrateLibero} from './libero.js';
import {shortenLink} from './shortlinks.js';
import {templateSnapshot,makeShareLink,parseShareLink,importTemplate} from './sharing.js';
import {ROLES,PLAYER_POSITIONS,shortName,resolvePlayerPosition,POSITIONS,clone,id,createState,startMatch,roleAt,displayedPlayer,scorePoint,undoPoint,correctMatch,checkFormation,positionRelations,substitute,endMatch,validateState,saveRoster,migrateLineups,syncLineup,createLineup,selectLineup,renameLineup,deleteLineup,nextLineupName,rosterPlayers} from './core.js';
import {openStore,readState,writeState} from './storage.js';
const $=id=>document.getElementById(id);
let activePosition=null,dragCleanup=null,formationFrame=0;
let state,viewRound=0,editing=false,editSnapshot=null,mode='match',saveQueue=Promise.resolve(),revision=0,storageBlocked=false,rosterDraft=[],rosterLineup=[],rosterLiberoPlan=[],confirmAction,rosterReturnToSub=false,toastTimer,workerRegistration,updateRequested=false,checkForAppUpdate=async()=>{};
function el(tag,props={},...children){const e=document.createElement(tag);for(const [k,v]of Object.entries(props)){if(k==='text')e.textContent=v;else if(k==='class')e.className=v;else e.setAttribute(k,v)}for(const c of children)e.append(c);return e}
const playerName=pid=>state.players.find(p=>p.id===pid)?.name||'未安排';
function toast(message){clearTimeout(toastTimer);$('toast').textContent=message;$('toast').hidden=false;toastTimer=setTimeout(()=>$('toast').hidden=true,2800)}
function showSaveError(message){$('save-error').hidden=false;$('save-error').textContent=message;$('save-status').textContent='保存失败，请复制分享链接';}
function save(){
  if(storageBlocked){showSaveError('无法访问原有本机数据，当前变更仅在内存中，请复制分享链接保存名单与阵型后重新打开。');return;}
  syncLineup(state);const current=++revision,data=clone(state);$('save-status').textContent='正在保存…';
  saveQueue=saveQueue.then(()=>writeState(data)).then(()=>{if(current===revision){$('save-error').hidden=true;$('save-status').textContent='已保存到本机';}}).catch(()=>showSaveError('本机保存失败，当前数据仍在页面中，请复制分享链接保存名单与阵型。'));
}
function active(){return state.match||{lineup:state.lineup,formations:state.formations,round:viewRound,score:[0,0],serving:false};}
function formations(){return mode==='default'?state.formations:active().formations;}
function finishEditing(){if(editing){editing=false;editSnapshot=null;save();render();}}
const reduceMotion=()=>window.matchMedia('(prefers-reduced-motion: reduce)').matches;
function softenChange(node){
  node.getAnimations().forEach(animation=>animation.cancel());
  if(!reduceMotion())node.animate([{opacity:.6,transform:'translateY(2px)'},{opacity:1,transform:'translateY(0)'}],{duration:180,easing:'cubic-bezier(.2,.8,.2,1)'});
}
function paintFormation(coords){
  for(const b of $('players').children){const p=+b.dataset.position;b.style.left=coords[p][0]+'%';b.style.top=coords[p][1]+'%';}
  for(const [name,positions]of [['front',[4,3,2]],['back',[5,6,1]]])$(name+'-link').setAttribute('points',positions.map(p=>coords[p].join(',')).join(' '));
}
function softenFormation(previous){
  if(editing||reduceMotion()||!previous.size)return;
  const target=clone(formations()[viewRound]),from={};
  for(const b of $('players').children){const p=+b.dataset.position;from[p]=previous.get(b.dataset.playerId)||target[p];}
  const paint=progress=>{
    const eased=1-(1-progress)**3;
    paintFormation(Object.fromEntries(POSITIONS.map(p=>[p,target[p].map((value,axis)=>from[p][axis]+(value-from[p][axis])*eased)])));
  };
  const started=performance.now();paint(0);
  const step=now=>{
    const progress=reduceMotion()?1:Math.max(0,Math.min(1,(now-started)/180));paint(progress);
    formationFrame=progress<1?requestAnimationFrame(step):0;
  };
  formationFrame=requestAnimationFrame(step);
  softenChange($('mini-court'));softenChange($('mini-round'));
}
function render(){
  cancelAnimationFrame(formationFrame);formationFrame=0;
  const previousPlayers=new Map([...$('players').children].map(b=>[b.dataset.playerId,[parseFloat(b.style.left),parseFloat(b.style.top)]]));
  const roundChanged=$('court').dataset.round!==String(viewRound),oldScores=[$('score-us').textContent,$('score-them').textContent];
  clearRelationshipFocus(false);
  const m=active(),hasMatch=!!state.match,preview=hasMatch&&viewRound!==m.round;
  renderLineupPicker();
  $('lineup-select').disabled=hasMatch||editing;$('manage-lineups').disabled=editing;
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
  $('court-heading').textContent=!hasMatch?'接发阵型':preview?`R${viewRound+1} 接发预览`:m.serving?'接发预览':'接发站位';
  $('preview-banner').hidden=!preview||editing;
  $('preview-copy').textContent=editing?`调整 R${viewRound+1} 站位`:`查看 R${viewRound+1} · 比赛 R${m.round+1}`;
  $('players').replaceChildren();$('mini-court').replaceChildren();
  for(const p of POSITIONS){
    const {player,role,libero,back}=displayedPlayer(state,m,p,viewRound);
    const full=player?.name||'未安排',short=shortName(player?.name);
    const b=el('button',{class:'player'+(back?' back':'')+(libero?' libero':''),'data-position':p,'data-player-id':player?.id||'role-'+role,'aria-label':`${full}，${libero?'自由人替换'+ROLES[role]:ROLES[role]}，${back?'后排':'前排'}，${p}号位`,title:`${full} · ${libero?'自由人（替换'+ROLES[role]+'）':ROLES[role]}`},el('b',{text:short}));
    b.disabled=!editing;b.addEventListener('pointerdown',startDrag);b.addEventListener('keydown',e=>moveByKeyboard(e,p));b.addEventListener('blur',()=>{if(!dragCleanup&&activePosition===p)clearRelationshipFocus();});$('players').append(b);
    const original=state.players.find(x=>x.id===m.lineup[role]);
    const cell=el('div',{class:'mini-cell'},el('i',{text:p}),el('span',{text:ROLES[role]}));
    cell.title=libero?`${full}替换${original?.name||ROLES[role]}`:full;
    if(hasMatch&&m.serving&&!preview&&p===1){cell.classList.add('is-server');cell.title=`当前发球：${full} · ${ROLES[role]}`;cell.setAttribute('aria-label',cell.title);cell.append(el('img',{class:'serve-icon',src:'./icons/serve-volleyball.svg',alt:'','aria-hidden':'true',width:16,height:16}));}
    $('mini-court').append(cell);
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
  $('court').classList.toggle('editing',editing);$('edit-label').textContent=editing?'完成':'调整站位';$('edit-toolbar').hidden=!editing;$('cancel-edit').hidden=!editing;
  $('edit').setAttribute('aria-pressed',String(editing));
  $('restore-round').hidden=!editing;
  $('restore-round').textContent=mode==='default'?'本轮恢复规整站位':'恢复本轮已存站位';

  const selected=hasMatch&&!preview?m.libero.role:(m.liberoChoices??state.liberoChoices)[viewRound];
  $('libero-bar').hidden=editing;
  $('libero-status').textContent=!m.lineup[6]?'未安排自由人':hasMatch&&!preview&&!m.libero.verified?'自由人状态待确认':selected===null?'自由人场下':`自由人替换${ROLES[selected]}`;
  $('libero-open').disabled=!m.lineup[6]||preview;
  updateGeometry();
  $('court').dataset.round=String(viewRound);
  if(roundChanged)softenFormation(previousPlayers);
  for(const [i,side]of ['us','them'].entries())if(hasMatch&&oldScores[i]!==$('score-'+side).textContent)softenChange($('score-'+side));
}
function clearRelationshipFocus(update=true){
  const cleanup=dragCleanup;dragCleanup=null;cleanup?.();activePosition=null;
  if(update)updateGeometry();
}
function updateGeometry(){
  const coords=formations()[viewRound],errors=checkFormation(coords),bad=new Set(errors.flatMap(e=>e.positions));
  const relations=activePosition===null?[]:positionRelations(coords,activePosition),neighbors=new Set(relations.map(r=>r.neighbor));
  $('court').classList.toggle('has-active-player',activePosition!==null);
  for(const [name,positions,color]of [['front',[4,3,2],'var(--front)'],['back',[5,6,1],'var(--back)']]){
    const line=$(name+'-link');line.setAttribute('points',positions.map(p=>coords[p].join(',')).join(' '));line.style.stroke=positions.some(p=>bad.has(p))?'var(--error)':color;
  }
  $('relationship-links').replaceChildren(...relations.map(r=>{
    const line=document.createElementNS('http://www.w3.org/2000/svg','line');
    for(const [key,value]of Object.entries({x1:coords[r.from][0],y1:coords[r.from][1],x2:coords[r.to][0],y2:coords[r.to][1],class:'relation-link'+(r.valid?'':' invalid'),'data-from':r.from,'data-to':r.to}))line.setAttribute(key,value);
    line.style.stroke=r.valid?([4,3,2].includes(activePosition)?'var(--front)':'var(--back)'):'var(--error)';return line;
  }));
  document.querySelectorAll('.player').forEach(b=>{const p=+b.dataset.position;b.style.left=coords[p][0]+'%';b.style.top=coords[p][1]+'%';b.classList.toggle('invalid',bad.has(p));b.classList.toggle('selected-player',activePosition===p);b.classList.toggle('related-player',neighbors.has(p));b.classList.toggle('unrelated-player',activePosition!==null&&activePosition!==p&&!neighbors.has(p));});
  $('valid-status').textContent=errors.length?'站位需调整':'站位正确';$('valid-status').classList.toggle('error',!!errors.length);
  $('relation-errors').textContent=errors.map(e=>e.message).join('；');$('relation-errors').hidden=!errors.length;
}
function startDrag(e){
  if(!editing||e.isPrimary===false||e.button!==0)return;
  e.preventDefault();clearRelationshipFocus(false);
  const b=e.currentTarget,p=+b.dataset.position,start=[e.clientX,e.clientY],origin=[...formations()[viewRound][p]],rect=$('court').getBoundingClientRect();
  activePosition=p;b.setPointerCapture(e.pointerId);updateGeometry();
  const move=event=>{if(event.pointerId!==e.pointerId)return;formations()[viewRound][p]=[Math.max(9,Math.min(91,origin[0]+(event.clientX-start[0])/rect.width*100)),Math.max(8,Math.min(92,origin[1]+(event.clientY-start[1])/rect.height*100))];updateGeometry();};
  const stop=event=>{if(event.pointerId===e.pointerId)clearRelationshipFocus();};
  dragCleanup=()=>{b.removeEventListener('pointermove',move);for(const type of ['pointerup','pointercancel','lostpointercapture'])b.removeEventListener(type,stop);if(b.hasPointerCapture(e.pointerId))b.releasePointerCapture(e.pointerId);};
  b.addEventListener('pointermove',move);for(const type of ['pointerup','pointercancel','lostpointercapture'])b.addEventListener(type,stop);
}
function moveByKeyboard(e,p){
  if(!editing||!['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.key))return;
  e.preventDefault();activePosition=p;const [x,y]=formations()[viewRound][p];
  formations()[viewRound][p]=[Math.max(9,Math.min(91,x+(e.key==='ArrowRight'?1:e.key==='ArrowLeft'?-1:0))),Math.max(8,Math.min(92,y+(e.key==='ArrowDown'?1:e.key==='ArrowUp'?-1:0)))];updateGeometry();
}
function run(action){try{action();save();render();}catch(e){toast(e.message)}}
function selectOptions(select,options,value){select.replaceChildren(...options.map(o=>el('option',{value:o.value,text:o.label})));if(value!==undefined)select.value=String(value);}
function roundOptions(select,value){selectOptions(select,Array.from({length:6},(_,i)=>({value:i,label:'R'+(i+1)})),value)}
function confirm(message,action){$('confirm-copy').textContent=message;confirmAction=action;$('confirm-dialog').showModal();}
$('confirm-yes').onclick=()=>{const action=confirmAction;confirmAction=null;$('confirm-dialog').close();action?.();};
function openSetup(){
  finishEditing();$('setup-error').textContent='';$('setup-lineup-name').textContent=state.lineupSets.find(x=>x.id===state.activeLineupId).name;roundOptions($('setup-round'),viewRound);$('setup-score-us').value=0;$('setup-score-them').value=0;$('setup-lineup').replaceChildren();
  [...ROLES,'自由人'].forEach((role,i)=>{const select=el('select',{id:'setup-role-'+i});selectOptions(select,[...(i===6?[{value:'',label:'不使用自由人'}]:[]),...rosterPlayers(state).map(p=>({value:p.id,label:`${p.name} · ${resolvePlayerPosition(p)||'未指定'}`}))],state.lineup[i]||'');select.onchange=renderSetupLibero;$('setup-lineup').append(el('label',{class:'field'},document.createTextNode(role),select));});renderSetupLibero();$('setup-dialog').showModal();
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

function closeLineupMenu(focus=false){$('lineup-menu').hidden=true;$('lineup-select').setAttribute('aria-expanded','false');if(focus)$('lineup-select').focus({preventScroll:true});}
function renderLineupPicker(){
  closeLineupMenu();
  $('lineup-current').textContent=state.lineupSets.find(x=>x.id===state.activeLineupId).name;
  $('lineup-menu').replaceChildren(...state.lineupSets.map(set=>{
    const option=el('button',{type:'button',role:'option','aria-selected':String(set.id===state.activeLineupId),tabindex:'-1',text:set.name});
    option.onclick=()=>{closeLineupMenu();if(set.id!==state.activeLineupId)run(()=>{selectLineup(state,set.id);viewRound=0;mode='default';});$('lineup-select').focus({preventScroll:true});};return option;
  }));
}
function openLineupMenu(last=false){
  if($('lineup-select').disabled)return;
  $('lineup-menu').hidden=false;$('lineup-select').setAttribute('aria-expanded','true');
  const options=[...$('lineup-menu').children],selected=options.find(x=>x.getAttribute('aria-selected')==='true');
  (last?options.at(-1):selected||options[0])?.focus({preventScroll:true});
}
$('lineup-select').onclick=()=>{$('lineup-menu').hidden?openLineupMenu():closeLineupMenu(true);};
$('lineup-select').onkeydown=e=>{if(['ArrowDown','ArrowUp'].includes(e.key)){e.preventDefault();openLineupMenu(e.key==='ArrowUp');}};
$('lineup-menu').onkeydown=e=>{
  if(e.key==='Escape'){e.preventDefault();closeLineupMenu(true);return;}
  if(e.key==='Tab'){e.preventDefault();closeLineupMenu();$(e.shiftKey?'lineup-select':'manage-lineups').focus();return;}
  const options=[...$('lineup-menu').children],current=options.indexOf(document.activeElement);
  if(!['ArrowDown','ArrowUp','Home','End'].includes(e.key))return;e.preventDefault();
  const index=e.key==='Home'?0:e.key==='End'?options.length-1:(current+(e.key==='ArrowDown'?1:-1)+options.length)%options.length;
  options[index].focus({preventScroll:true});options[index].scrollIntoView({block:'nearest'});
};
document.addEventListener('pointerdown',e=>{if(!$('lineup-picker').contains(e.target))closeLineupMenu();});
function openManageLineup(){
  finishEditing();closeLineupMenu();rosterReturnToSub=false;
  $('lineup-rename').value=state.lineupSets.find(x=>x.id===state.activeLineupId).name;
  $('lineup-rename').disabled=!!state.match;$('delete-lineup').disabled=!!state.match||state.lineupSets.length===1;$('new-lineup').disabled=!!state.match;
  rosterLiberoPlan=clone(state.liberoPlan);rosterDraft=clone(rosterPlayers(state,state.match||state)).map(p=>({...p,position:resolvePlayerPosition(p)}));
  rosterLineup=clone(state.match?.lineup||state.lineup);$('roster-error').textContent='';renderRoster();$('lineups-dialog').showModal();
}
function saveManagedLineup(){
  const players=rosterDraft.map(p=>({...p,name:p.name.trim(),short:shortName(p.name)})),next=clone(state);
  saveRoster(next,players,rosterLineup);
  if(!next.match){renameLineup(next,$('lineup-rename').value);if(JSON.stringify(next.liberoPlan)!==JSON.stringify(rosterLiberoPlan)){next.liberoPlan=clone(rosterLiberoPlan);next.liberoChoices=defaultLiberoChoices(rosterLiberoPlan);}}
  syncLineup(next);validateState(next);state=next;save();render();
}
$('manage-lineups').onclick=openManageLineup;
$('new-lineup').onclick=()=>{
  if(!$('roster-form').reportValidity())return;
  try{saveManagedLineup();$('lineups-dialog').close();$('new-lineup-name').value=nextLineupName(state);$('new-lineup-basis').value='copy';$('new-lineup-error').textContent='';$('new-lineup-dialog').showModal();}catch(err){$('roster-error').textContent=err.message;}
};
$('new-lineup-dialog').addEventListener('close',()=>{if(!state.match)openManageLineup();});
$('new-lineup-form').onsubmit=e=>{e.preventDefault();try{createLineup(state,$('new-lineup-name').value,{regular:$('new-lineup-basis').value==='regular'});save();viewRound=0;mode='default';render();$('new-lineup-dialog').close();}catch(err){$('new-lineup-error').textContent=err.message;}};
$('delete-lineup').onclick=()=>{const current=state.lineupSets.find(x=>x.id===state.activeLineupId);confirm(`移除「${current.name}」？其他阵容及其队员会保留。`,()=>{try{deleteLineup(state,current.id);save();viewRound=0;render();$('lineups-dialog').close();}catch(err){$('roster-error').textContent=err.message;}});};
$('lineups-dialog').addEventListener('close',()=>{if(rosterReturnToSub&&state.match){rosterReturnToSub=false;renderSub();$('sub-dialog').showModal();}});

$('start').onclick=openSetup;
$('setup-form').onsubmit=e=>{e.preventDefault();try{startMatch(state,{lineup:Array.from({length:7},(_,i)=>$('setup-role-'+i).value||null),score:[+$('setup-score-us').value,+$('setup-score-them').value],round:+$('setup-round').value,serving:$('setup-serve').value==='us',teams:[$('setup-us').value,$('setup-them').value],liberoRole:readLiberoRole($('setup-libero'))});mode='match';viewRound=state.match.round;$('setup-dialog').close();save();render();}catch(err){$('setup-error').textContent=err.message}};
for(const [side,team]of [['us',0],['them',1]])for(const [prefix,delta]of [['add',1],['minus',-1]])$(prefix+'-'+side).onclick=()=>run(()=>{if(!state.match||editing||viewRound!==state.match.round)return;scorePoint(state.match,team,delta);viewRound=state.match.round;});
$('undo').onclick=()=>run(()=>{undoPoint(state.match);viewRound=state.match.round;});
$('return-current').onclick=()=>{finishEditing();viewRound=state.match.round;mode='match';render()};
$('edit').onclick=()=>{if(editing)finishEditing();else{editSnapshot=clone(formations()[viewRound]);editing=true;}render();$('edit').focus({preventScroll:true});};
$('cancel-edit').onclick=()=>{if(!editing)return;formations()[viewRound]=clone(editSnapshot);editing=false;editSnapshot=null;render();$('edit').focus({preventScroll:true});};
$('correct').onclick=()=>{const m=state.match;$('correct-us').value=m.score[0];$('correct-them').value=m.score[1];roundOptions($('correct-round'),m.round);$('correct-serve').value=m.serving?'us':'them';$('correct-error').textContent='';$('correct-libero-confirm').checked=false;renderCorrectLibero();$('correct-dialog').showModal();};
$('correct-form').onsubmit=e=>{e.preventDefault();try{correctMatch(state.match,{score:[+$('correct-us').value,+$('correct-them').value],round:+$('correct-round').value,serving:$('correct-serve').value==='us',liberoRole:readLiberoRole($('correct-libero'))});viewRound=state.match.round;$('correct-dialog').close();save();render();}catch(err){$('correct-error').textContent=err.message}};
$('restore-round').onclick=()=>{if(!editing)return;confirm(`确认恢复 R${viewRound+1} 的${mode==='default'?'规整站位':'已存站位'}？本轮调整将被替换。`,()=>{formations()[viewRound]=clone(mode==='default'?{1:[79,74],2:[79,26],3:[50,26],4:[21,26],5:[21,74],6:[50,74]}:state.formations[viewRound]);render();});};
$('exit').onclick=()=>{finishEditing();const name=state.lineupSets.find(x=>x.id===state.activeLineupId).name;$('exit-copy').textContent=`将本场六轮站位保存到「${name}」？临时换人不会改变首发。退出后清除本场比分与记分历史。`;$('exit-dialog').showModal()};
for(const [button,overwrite]of [['exit-save',true],['exit-discard',false]])$(button).onclick=()=>run(()=>{endMatch(state,overwrite);viewRound=0;mode='default';$('exit-dialog').close();toast(overwrite?'已保存到当前阵容':'已退出，阵容保持不变');});
function referencedIds(){return new Set([...rosterLineup,...(state.match?[...state.lineup,...state.match.lineup,...state.match.originalLineup,...state.match.substitutions.flatMap(s=>[s.from,s.to])]:[])].filter(Boolean));}
function refreshRosterRemoval(){
  for(const button of $('roster-fields').querySelectorAll('[data-remove-player]'))button.disabled=referencedIds().has(button.dataset.removePlayer)||rosterLineup.includes(button.dataset.removePlayer);
}
function renderRosterRoles(){
  $('roster-lineup-title').textContent=state.match?'本场角色':state.lineupSets.find(x=>x.id===state.activeLineupId).name+' · 首发';
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
$('add-player').onclick=()=>{if(rosterDraft.length>=200){$('roster-error').textContent='最多支持 200 名队员。';return}rosterDraft.push({id:id(),name:'',short:'',position:'其他'});renderRoster();$('roster-fields').lastElementChild.querySelector('input').focus();};
$('roster-form').onsubmit=e=>{e.preventDefault();try{const returnToSub=rosterReturnToSub;saveManagedLineup();rosterReturnToSub=false;$('lineups-dialog').close();if(returnToSub&&state.match){renderSub();$('sub-dialog').showModal();}toast('阵容已保存');}catch(err){$('roster-error').textContent=err.message}};
function renderSub(){
  const m=state.match;$('sub-error').textContent='';
  selectOptions($('sub-role'),ROLES.map((label,i)=>({value:i,label:`${label} · ${playerName(m.lineup[i])}`})));
  const bench=rosterPlayers(state,m).filter(p=>!m.lineup.includes(p.id));selectOptions($('sub-player'),bench.length?bench.map(p=>({value:p.id,label:`${p.name} · ${resolvePlayerPosition(p)||'未指定'}`})):[{value:'',label:'请先在队员中添加替补'}]);
  $('sub-add-player').hidden=bench.length>0;$('sub-form').querySelector('[type=submit]').disabled=!bench.length;
  $('sub-history').replaceChildren();if(m.substitutions.length)$('sub-history').append(el('h3',{text:'本场换人记录'}));
  for(const s of [...m.substitutions].reverse())$('sub-history').append(el('div',{class:'sub-item',text:`${s.score.join(':')} · ${ROLES[s.role]||'自由人'}：${playerName(s.from)} → ${playerName(s.to)}`}));
}
$('sub-add-player').onclick=()=>{$('sub-dialog').close();openManageLineup();rosterReturnToSub=true;$('add-player').click();};
$('substitute').onclick=()=>{renderSub();$('sub-dialog').showModal()};
$('sub-form').onsubmit=e=>{e.preventDefault();try{substitute(state,+$('sub-role').value,$('sub-player').value);save();render();renderSub();toast('已换人，轮次和站位保持不变');}catch(err){$('sub-error').textContent=err.message}};
$('help').onclick=()=>{finishEditing();$('help-dialog').showModal();checkForAppUpdate();};
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
  syncLineup(state);selectOptions($('share-source'),[...state.lineupSets.map(x=>({value:'lineup:'+x.id,label:x.name})),...(state.match?[{value:'match',label:'本场阵型与当前队员'}]:[])],'lineup:'+state.activeLineupId);
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
    $('import-summary').textContent=`${incoming.lineupName} · ${incoming.players.length} 名队员 · 6 轮阵型`;
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
    let reloading=false,lastCheck=0;
    const reload=()=>{if(!reloading&&updateRequested&&!state.match){reloading=true;location.reload();}};
    navigator.serviceWorker.addEventListener('controllerchange',reload);
    workerRegistration=await navigator.serviceWorker.register('./sw.js',{updateViaCache:'none'});
    const updateStatus=async()=>{
      const cached=(await caches.keys()).some(key=>key.startsWith('lunjian-'));
      if(workerRegistration.waiting){$('apply-update').hidden=false;$('offline-status').textContent='新版本已就绪，退出比赛后点击更新。';return;}
      $('offline-status').textContent=cached?(navigator.onLine?'离线已就绪':'当前离线 · 数据继续保存在本机'):'离线资源尚未缓存，请联网重试';
    };
    const observe=()=>{const worker=workerRegistration.installing;if(worker){const changed=()=>{if(worker.state==='installed'||worker.state==='activated')updateStatus();};worker.addEventListener('statechange',changed);changed();}updateStatus();};
    workerRegistration.addEventListener('updatefound',observe);observe();
    let checking=false;
    checkForAppUpdate=async(force=false)=>{
      if(!navigator.onLine){if(force)$('offline-status').textContent='当前离线，请联网后检查更新。';return;}
      if(checking||!force&&Date.now()-lastCheck<60000)return;
      checking=true;lastCheck=Date.now();if(force)$('offline-status').textContent='正在检查更新…';
      try{await workerRegistration.update();if(workerRegistration.installing)$('offline-status').textContent='正在下载新版…';else{await updateStatus();if(force&&!workerRegistration.waiting)$('offline-status').textContent='已是最新版本 · 离线资源已就绪';}}
      catch{if(force)$('offline-status').textContent='检查失败，请联网重试，或打开独立更新页。';}
      finally{checking=false;}
    };
    $('check-update').onclick=()=>checkForAppUpdate(true);
    window.addEventListener('online',()=>{updateStatus();checkForAppUpdate(true);});window.addEventListener('offline',updateStatus);
    document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')checkForAppUpdate();});
    window.addEventListener('pageshow',()=>checkForAppUpdate());
    $('apply-update').onclick=async()=>{
      if(state.match){toast('请先退出比赛，再更新应用。');return;}
      $('apply-update').disabled=true;
      try{await saveQueue;updateRequested=true;const changed=await activateLatest(workerRegistration);if(changed)reload();else{updateRequested=false;await checkForAppUpdate(true);}}
      catch(error){updateRequested=false;$('offline-status').textContent=error.message;}
      finally{$('apply-update').disabled=false;}
    };
    navigator.serviceWorker.ready.then(updateStatus);await checkForAppUpdate(true);
  }catch{$('offline-status').textContent='离线缓存未完成，请联网重试；也可打开独立更新页。';}
}

try{await openStore();const saved=await readState();state=migrateLineups(migrateLiberoState(saved?validateState(saved):createState()));viewRound=state.match?.round||0;mode=state.match?'match':'default';$('save-status').textContent=saved?'已恢复本机数据':'已准备好';if(!saved)save();}
catch{state=migrateLineups(createState());storageBlocked=true;showSaveError('本机数据读取失败，未覆盖原数据。当前可临时使用，请复制分享链接保存名单与阵型；可尝试关闭其他页面再打开。');}
preventScoreboardDoubleTap($('scoreboard'));
render();offlineSetup();receiveShareHash();
