import {DEFAULT_LIBERO_ROLES,defaultLiberoChoices,validPlan,validChoices,newLiberoState,advanceLibero,validLiberoState,calibrateLibero,eligibleLiberoRoles,rolePosition} from './libero.js';
/** Pure match and rotation rules. Coordinates are percentages of our half court. */
export const ROLES = ['二传', '大主', '小副', '接应', '小主', '大副'];
export const PLAYER_POSITIONS=['二传','主攻','副攻','接应','自由人','其他'];
export const shortName=name=>Array.from(String(name??'').trim()).at(-1)||'？';
/** A player's position is independent of their assigned starting rotation role. */
export function resolvePlayerPosition(player){
  if(['大主','小主'].includes(player.position))return '主攻';
  if(['大副','小副'].includes(player.position))return '副攻';
  return PLAYER_POSITIONS.includes(player.position)?player.position:'';
}
export const POSITIONS = [4, 3, 2, 5, 6, 1];
const CYCLE = [1, 6, 5, 4, 3, 2];
export const clone = value => structuredClone(value);
export const id = () => globalThis.crypto.randomUUID();
export function standardFormations() {
  return Array.from({ length: 6 }, () => ({1:[79,74],2:[79,26],3:[50,26],4:[21,26],5:[21,74],6:[50,74]}));
}
export function roleAt(position, round) {
  return CYCLE[(CYCLE.indexOf(position) - round + 6) % 6] - 1;
}
export function createState() {
  const players = [...ROLES,'自由人'].map(name => ({id:id(),name,short:shortName(name),position:resolvePlayerPosition({position:name})}));
  return {version:1,players,lineup:players.map(p=>p.id),formations:standardFormations(),liberoPlan:[...DEFAULT_LIBERO_ROLES],liberoChoices:defaultLiberoChoices(DEFAULT_LIBERO_ROLES),match:null};
}
export function startMatch(state, config) {
  if (new Set(config.lineup.filter(Boolean)).size !== config.lineup.filter(Boolean).length || config.lineup.slice(0,6).some(x=>!x)) throw Error('六个首发角色不能重复或留空，自由人也不能兼任首发。');
  if(config.lineup.some(x=>x&&!rosterPlayers(state).some(p=>p.id===x))) throw Error('首发名单中有不存在的队员。');
  if(!Number.isInteger(config.round)||config.round<0||config.round>5||typeof config.serving!=='boolean'||!validScore(config.score)) throw Error('请检查轮次和比分。');
  const plan=state.liberoPlan??DEFAULT_LIBERO_ROLES,choices=state.liberoChoices??defaultLiberoChoices(plan),initial=config.liberoRole??null;
  if(initial!==null&&(!config.lineup[6]||!plan.includes(initial)||![1,5,6].includes(rolePosition(initial,config.round))||(config.serving&&roleAt(1,config.round)===initial)))throw Error('自由人开场只能替换允许的后排角色，不能替换发球队员。');
  if(state.match)throw Error('请先退出当前比赛。');
  state.lineup=clone(config.lineup);
  syncLineup(state);
  state.match={rosterIds:rosterPlayers(state).map(p=>p.id),lineupId:state.activeLineupId??null,round:config.round,serving:config.serving,score:clone(config.score),teams:config.teams.map(x=>x.trim()||'球队'),lineup:clone(config.lineup),originalLineup:clone(config.lineup),formations:clone(state.formations),history:[],substitutions:[],startedAt:new Date().toISOString(),liberoPlan:clone(plan),liberoChoices:clone(choices)};
  state.match.libero=newLiberoState(state.match,initial);
}
export function validScore(score) { return Array.isArray(score)&&score.length===2&&score.every(n=>Number.isSafeInteger(n)&&n>=0&&n<9999); }
function snapshot(match) {return {score:clone(match.score),round:match.round,serving:match.serving,...(match.libero?{libero:clone(match.libero)}:{})};}
export function scorePoint(match, team, delta=1) {
  if(match.libero&&!match.libero.verified)throw Error('请先确认当前自由人状态。');
  if(![0,1].includes(team)||![1,-1].includes(delta))throw Error('无效记分。');
  if(delta===-1&&match.score[team]===0)return false;
  if(delta===1&&match.score[team]>=9998)throw Error('分数已达到上限。');
  match.history.push(snapshot(match));
  match.score[team]+=delta;
  if(delta===1){
    if(team===0&&!match.serving)match.round=(match.round+1)%6;
    match.serving=team===0;
    advanceLibero(match);
  }
  return true;
}
export function undoPoint(match) {
  const previous=match.history.at(-1);
  if(previous?.libero&&match.libero&&previous.libero.manualSeq!==match.libero.manualSeq)throw Error('该球之后已有自由人替换，请使用校正比赛核对比分和场上人员。');
  if(previous?.libero?.role!==null&&previous?.libero?.role!==undefined&&previous.libero.replacedId!==match.lineup[previous.libero.role])throw Error('该球后已更换原队员，请使用校正比赛核对自由人状态。');
  match.history.pop();
  if(!previous)return false;
  Object.assign(match,previous);return true;
}
export function correctMatch(match,{score,round,serving,liberoRole}) {
  if(!validScore(score)||!Number.isInteger(round)||round<0||round>5||typeof serving!=='boolean')throw Error('请输入有效比分和轮次。');
  const next=clone(match);Object.assign(next,{score:clone(score),round,serving,history:[]});
  let role=liberoRole===undefined?(next.libero?.role??null):liberoRole;
  if(liberoRole===undefined&&role!==null&&!eligibleLiberoRoles(next).includes(role))role=null;
  calibrateLibero(next,role,{deadBallConfirmed:true});Object.assign(match,next);
}
// The same ordered pairs drive center-point validation and editing guides.
export const POSITION_RELATIONS=Object.freeze([[4,3,0],[3,2,0],[5,6,0],[6,1,0],[4,5,1],[3,6,1],[2,1,1]].map(Object.freeze));
export function positionRelations(coords,position) {
  return POSITION_RELATIONS.filter(([a,b])=>a===position||b===position).map(([from,to,axis])=>({from,to,axis,neighbor:from===position?to:from,valid:coords[from][axis]<coords[to][axis]}));
}
export function checkFormation(coords) {
  const errors=[];
  for(const [a,b,axis] of POSITION_RELATIONS) {
    if(coords[a][axis]>=coords[b][axis])errors.push({positions:[a,b],message:axis===0?`${a}号位应在${b}号位左侧`:`${a}号位应在${b}号位前方`});
  }
  return errors;
}
export function displayedPlayer(state,match,position,round) {
  const role=roleAt(position,round);
  const selected=match.libero&&round===match.round?match.libero.role:(match.liberoChoices??state.liberoChoices??defaultLiberoChoices(state.liberoPlan??DEFAULT_LIBERO_ROLES))[round];
  const libero=[1,5,6].includes(position)&&selected===role&&!!match.lineup[6];
  const player=state.players.find(p=>p.id===match.lineup[libero?6:role]);
  return {player,role,libero,back:[1,5,6].includes(position)};
}
export function substitute(state,role,playerId) {
  const m=state.match;
  if(!m||!Number.isInteger(role)||role<0||role>6)throw Error('没有可替换的角色。');
  if(role===6)throw Error('自由人不是普通换人角色；伤病重新指定需由裁判处理。');
  if(m.libero?.role===role)throw Error('请先换回自由人所替换的原队员，再进行普通换人。');
  if(!rosterPlayers(state,m).some(p=>p.id===playerId))throw Error('请选择当前阵容中的替补队员。');
  if(m.lineup.includes(playerId))throw Error('该队员已在当前阵容中。');
  const from=m.lineup[role];
  m.lineup[role]=playerId;
  m.substitutions.push({id:id(),role,from,to:playerId,score:clone(m.score),at:new Date().toISOString()});
}
export function returnStarter(state,role) {
  const m=state.match,original=m?.originalLineup[role];
  if(!original||original===m.lineup[role])throw Error('该角色无需换回。');
  substitute(state,role,original);
}
export function endMatch(state,overwrite) {
  if(!state.match)return;
  if(overwrite)state.formations=clone(state.match.formations);
  state.match=null;
  syncLineup(state);
}
function validFormations(f) {
  return Array.isArray(f)&&f.length===6&&f.every(c=>c&&POSITIONS.every(p=>Array.isArray(c[p])&&c[p].length===2&&c[p].every(n=>typeof n==='number'&&Number.isFinite(n)&&n>=0&&n<=100)));
}
function validLineup(l,players) {
  return Array.isArray(l)&&l.length===7&&l.slice(0,6).every(x=>typeof x==='string'&&players.some(p=>p.id===x))&&(l[6]===null||players.some(p=>p.id===l[6]))&&new Set(l.filter(Boolean)).size===l.filter(Boolean).length;
}
function validRoster(ids,players,required=[]){return Array.isArray(ids)&&ids.length>=6&&ids.length<=200&&new Set(ids).size===ids.length&&ids.every(pid=>typeof pid==='string'&&players.some(p=>p.id===pid))&&required.filter(Boolean).every(pid=>ids.includes(pid));}
/** Return only this lineup's members; legacy standalone templates contain their own full roster. */
export function rosterPlayers(state,source=state){
  const ids=source.rosterIds;
  return ids?ids.map(pid=>state.players.find(p=>p.id===pid)).filter(Boolean):state.players;
}
/** Reject malformed backups before replacing any local data. */
export function validateState(s) {
  if(!s||s.version!==1||!Array.isArray(s.players)||s.players.length<6||s.players.length>200)throw Error('备份版本或队员数据不正确。');
  if(new Set(s.players.map(p=>p.id)).size!==s.players.length||s.players.some(p=>!p||typeof p.id!=='string'||!p.id||typeof p.name!=='string'||!p.name.trim()||p.name.length>32||typeof p.short!=='string'||Array.from(p.short).length!==1||![...PLAYER_POSITIONS,...ROLES].includes(p.position)))throw Error('队员信息不完整。');
  if(s.liberoPlan!==undefined&&!validPlan(s.liberoPlan)||s.liberoChoices!==undefined&&!validChoices(s.liberoChoices,s.liberoPlan??DEFAULT_LIBERO_ROLES))throw Error('自由人预设不正确。');
  if(s.rosterIds!==undefined&&!validRoster(s.rosterIds,s.players,s.lineup))throw Error('阵容队员名单不正确。');
  if(!validLineup(s.lineup,s.players)||!validFormations(s.formations))throw Error('首发名单或六轮站位不正确。');
  if(s.lineupSets!==undefined){
    if(!Array.isArray(s.lineupSets)||!s.lineupSets.length||s.lineupSets.length>30||new Set(s.lineupSets.map(x=>x?.id)).size!==s.lineupSets.length||!s.lineupSets.some(x=>x.id===s.activeLineupId)||new Set(s.lineupSets.map(x=>x?.name)).size!==s.lineupSets.length)throw Error('阵容列表不正确。');
    for(const set of s.lineupSets){
      if(!set||typeof set.id!=='string'||!set.id||typeof set.name!=='string'||!set.name.trim()||set.name.length>24)throw Error('阵容名称不正确。');
      if(set.rosterIds!==undefined&&!validRoster(set.rosterIds,s.players,set.id===s.activeLineupId?[]:set.lineup))throw Error('阵容队员名单不正确。');
      // The top-level fields are the current working copy; the selected record is synchronized before saving.
      if(set.id!==s.activeLineupId&&(!validLineup(set.lineup,s.players)||!validFormations(set.formations)||!validPlan(set.liberoPlan)||!validChoices(set.liberoChoices,set.liberoPlan)))throw Error('阵容首发或站位不正确。');
    }
    if(s.match?.lineupId&&s.match.lineupId!==s.activeLineupId)throw Error('比赛阵容与所选阵容不一致。');
  }
  if(s.match!==null){
    const m=s.match;
    if(!m||!validScore(m.score)||!Number.isInteger(m.round)||m.round<0||m.round>5||typeof m.serving!=='boolean'||!validLineup(m.lineup,s.players)||!validLineup(m.originalLineup,s.players)||!validFormations(m.formations)||!Array.isArray(m.history)||m.history.length>100000||!Array.isArray(m.substitutions)||!Array.isArray(m.teams)||m.teams.length!==2||m.teams.some(x=>typeof x!=='string'||x.length>24))throw Error('比赛数据不正确。');
    if(m.rosterIds!==undefined&&!validRoster(m.rosterIds,s.players,[...m.lineup,...m.originalLineup,...m.substitutions.flatMap(e=>[e?.from,e?.to])]))throw Error('本场队员名单不正确。');
    if(m.liberoPlan!==undefined&&!validPlan(m.liberoPlan)||m.liberoChoices!==undefined&&!validChoices(m.liberoChoices,m.liberoPlan??DEFAULT_LIBERO_ROLES)||!validLiberoState(m))throw Error('自由人记录不正确。');
    if(m.history.some(e=>!validScore(e.score)||!Number.isInteger(e.round)||e.round<0||e.round>5||typeof e.serving!=='boolean'))throw Error('记分历史不正确。');
    if(m.substitutions.some(e=>!e||!Number.isInteger(e.role)||e.role<0||e.role>6||typeof e.at!=='string'||!validScore(e.score)||![e.from,e.to].every(pid=>pid===null||s.players.some(p=>p.id===pid))))throw Error('换人历史不正确。');
  }
  return s;
}

/** Save only the active lineup's members; retain other lineups and live references. */
export function saveRoster(state,players,lineup){
  if(!state.match&&!validLineup(lineup,players))throw Error('首发角色不能重复，六个首发角色均需选择队员。');
  const next=clone(state),members=players.map(p=>p.id),oldMembers=rosterPlayers(state).map(p=>p.id);
  const keep=new Set(next.lineupSets?.filter(x=>x.id!==next.activeLineupId).flatMap(x=>x.rosterIds??x.lineup)??[]);
  const merged=new Map(next.players.filter(p=>!oldMembers.includes(p.id)||members.includes(p.id)||keep.has(p.id)).map(p=>[p.id,p]));
  for(const player of players)merged.set(player.id,{...clone(player),position:resolvePlayerPosition(player)});
  next.players=[...merged.values()];next.rosterIds=members;
  if(!next.match)next.lineup=clone(lineup);else next.match.rosterIds=clone(members);
  syncLineup(next);validateState(next);Object.assign(state,next);
}

/** Players may be reused by copied lineups, while membership belongs to each lineup. */
export const MAX_LINEUPS=30;
const lineupFields=['lineup','formations','liberoPlan','liberoChoices','rosterIds'];
export function lineupData(state){return {rosterIds:rosterPlayers(state).map(p=>p.id),lineup:clone(state.lineup),formations:clone(state.formations),liberoPlan:clone(state.liberoPlan??DEFAULT_LIBERO_ROLES),liberoChoices:clone(state.liberoChoices??defaultLiberoChoices(state.liberoPlan??DEFAULT_LIBERO_ROLES))};}
export function migrateLineups(state){
  if(!state.lineupSets){const first={id:id(),name:'阵容 1',...lineupData(state)};state.lineupSets=[first];state.activeLineupId=first.id;}
  // Older versions kept a common bench without ownership metadata. Preserve those
  // unassigned reserves in each legacy lineup, but exclude other lineups' starters.
  const assigned=new Set([...state.lineupSets.flatMap(x=>x.lineup),...state.lineup]);
  const reserves=state.players.filter(p=>!assigned.has(p.id)).map(p=>p.id);
  for(const set of state.lineupSets)set.rosterIds??=[...new Set([...set.lineup.filter(Boolean),...reserves])];
  state.rosterIds??=clone(state.lineupSets.find(x=>x.id===state.activeLineupId).rosterIds);
  if(state.match){state.match.lineupId??=state.activeLineupId;state.match.rosterIds??=[...new Set([...state.rosterIds,...state.match.lineup,...state.match.originalLineup,...state.match.substitutions.flatMap(e=>[e.from,e.to])].filter(Boolean))];}
  return state;
}
export function syncLineup(state){const current=state.lineupSets?.find(x=>x.id===state.activeLineupId);if(current)Object.assign(current,lineupData(state));}
function editableLineups(state){if(state.match)throw Error('请先退出当前比赛，再切换或管理阵容。');migrateLineups(state);}
function lineupName(state,name,except){
  if(typeof name!=='string'||!name.trim()||name.trim().length>24)throw Error('阵容名称需为 1–24 个字。');
  const clean=name.trim();if(state.lineupSets.some(x=>x.id!==except&&x.name===clean))throw Error('已存在同名阵容，请换一个名称。');return clean;
}
export function nextLineupName(state,prefix='阵容'){let n=1;while(state.lineupSets?.some(x=>x.name===`${prefix} ${n}`))n++;return `${prefix} ${n}`;}
export function selectLineup(state,lineupId){
  editableLineups(state);const target=state.lineupSets.find(x=>x.id===lineupId);if(!target)throw Error('该阵容不存在。');
  syncLineup(state);state.activeLineupId=target.id;for(const key of lineupFields)state[key]=clone(target[key]);
}
export function createLineup(state,name,{regular=false}={}){
  editableLineups(state);if(state.lineupSets.length>=MAX_LINEUPS)throw Error('最多保存 30 套阵容。');
  const clean=lineupName(state,name);syncLineup(state);const set={id:id(),name:clean,...lineupData(state)};
  if(regular)set.formations=standardFormations();state.lineupSets.push(set);selectLineup(state,set.id);return set;
}
export function renameLineup(state,name){editableLineups(state);const clean=lineupName(state,name,state.activeLineupId);state.lineupSets.find(x=>x.id===state.activeLineupId).name=clean;}
export function deleteLineup(state,lineupId){
  editableLineups(state);if(state.lineupSets.length===1)throw Error('至少保留一套阵容。');
  if(!state.lineupSets.some(x=>x.id===lineupId))throw Error('该阵容不存在。');
  if(lineupId===state.activeLineupId)selectLineup(state,state.lineupSets.find(x=>x.id!==lineupId).id);
  state.lineupSets=state.lineupSets.filter(x=>x.id!==lineupId);
}
