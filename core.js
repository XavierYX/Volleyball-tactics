/** Pure match and rotation rules. Coordinates are percentages of our half court. */
export const ROLES = ['二传', '大主', '小副', '接应', '小主', '大副'];
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
  const positions = ['二传','主攻','副攻','接应','主攻','副攻','自由人'];
  const short = ['传','大','小','应','主','副','自'];
  const players = [...ROLES,'自由人'].map((name,i) => ({id:id(),name,short:short[i],position:positions[i]}));
  return {version:1,players,lineup:players.map(p=>p.id),formations:standardFormations(),match:null};
}
export function startMatch(state, config) {
  if (new Set(config.lineup.filter(Boolean)).size !== config.lineup.filter(Boolean).length || config.lineup.slice(0,6).some(x=>!x)) throw Error('六个首发角色不能重复或留空，自由人也不能兼任首发。');
  if(config.lineup.some(x=>x&&!state.players.some(p=>p.id===x))) throw Error('首发名单中有不存在的队员。');
  if(!Number.isInteger(config.round)||config.round<0||config.round>5||typeof config.serving!=='boolean'||!validScore(config.score)) throw Error('请检查轮次和比分。');
  state.lineup=clone(config.lineup);
  state.match={round:config.round,serving:config.serving,score:clone(config.score),teams:config.teams.map(x=>x.trim()||'球队'),lineup:clone(config.lineup),originalLineup:clone(config.lineup),formations:clone(state.formations),history:[],substitutions:[],startedAt:new Date().toISOString()};
}
export function validScore(score) { return Array.isArray(score)&&score.length===2&&score.every(n=>Number.isSafeInteger(n)&&n>=0&&n<9999); }
function snapshot(match) {return {score:clone(match.score),round:match.round,serving:match.serving};}
export function scorePoint(match, team, delta=1) {
  if(![0,1].includes(team)||![1,-1].includes(delta))throw Error('无效记分。');
  if(delta===-1&&match.score[team]===0)return false;
  if(delta===1&&match.score[team]>=9998)throw Error('分数已达到上限。');
  match.history.push(snapshot(match));
  match.score[team]+=delta;
  if(delta===1){
    if(team===0&&!match.serving)match.round=(match.round+1)%6;
    match.serving=team===0;
  }
  return true;
}
export function undoPoint(match) {
  const previous=match.history.pop();
  if(!previous)return false;
  Object.assign(match,previous);return true;
}
export function correctMatch(match,{score,round,serving}) {
  if(!validScore(score)||!Number.isInteger(round)||round<0||round>5||typeof serving!=='boolean')throw Error('请输入有效比分和轮次。');
  Object.assign(match,{score:clone(score),round,serving,history:[]});
}
export function checkFormation(coords) {
  const errors=[];
  for(const [a,b,axis] of [[4,3,0],[3,2,0],[5,6,0],[6,1,0],[4,5,1],[3,6,1],[2,1,1]]) {
    if(coords[a][axis]>=coords[b][axis])errors.push({positions:[a,b],message:axis===0?`${a}号位应在${b}号位左侧`:`${a}号位应在${b}号位前方`});
  }
  return errors;
}
export function displayedPlayer(state,match,position,round) {
  const role=roleAt(position,round);
  const libero=[1,5,6].includes(position)&&[2,5].includes(role)&&!!match.lineup[6];
  const player=state.players.find(p=>p.id===match.lineup[libero?6:role]);
  return {player,role,libero,back:[1,5,6].includes(position)};
}
export function substitute(state,role,playerId) {
  const m=state.match;
  if(!m||!Number.isInteger(role)||role<0||role>6)throw Error('没有可替换的角色。');
  if(!state.players.some(p=>p.id===playerId))throw Error('请选择替补队员。');
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
}
function validFormations(f) {
  return Array.isArray(f)&&f.length===6&&f.every(c=>c&&POSITIONS.every(p=>Array.isArray(c[p])&&c[p].length===2&&c[p].every(n=>typeof n==='number'&&Number.isFinite(n)&&n>=0&&n<=100)));
}
function validLineup(l,players) {
  return Array.isArray(l)&&l.length===7&&l.slice(0,6).every(x=>typeof x==='string'&&players.some(p=>p.id===x))&&(l[6]===null||players.some(p=>p.id===l[6]))&&new Set(l.filter(Boolean)).size===l.filter(Boolean).length;
}
/** Reject malformed backups before replacing any local data. */
export function validateState(s) {
  if(!s||s.version!==1||!Array.isArray(s.players)||s.players.length<6||s.players.length>200)throw Error('备份版本或队员数据不正确。');
  if(new Set(s.players.map(p=>p.id)).size!==s.players.length||s.players.some(p=>!p||typeof p.id!=='string'||!p.id||typeof p.name!=='string'||!p.name.trim()||p.name.length>32||typeof p.short!=='string'||Array.from(p.short).length!==1||!['二传','主攻','副攻','接应','自由人','其他'].includes(p.position)))throw Error('队员信息不完整。');
  if(!validLineup(s.lineup,s.players)||!validFormations(s.formations))throw Error('首发名单或六轮站位不正确。');
  if(s.match!==null){
    const m=s.match;
    if(!m||!validScore(m.score)||!Number.isInteger(m.round)||m.round<0||m.round>5||typeof m.serving!=='boolean'||!validLineup(m.lineup,s.players)||!validLineup(m.originalLineup,s.players)||!validFormations(m.formations)||!Array.isArray(m.history)||m.history.length>100000||!Array.isArray(m.substitutions)||!Array.isArray(m.teams)||m.teams.length!==2||m.teams.some(x=>typeof x!=='string'||x.length>24))throw Error('比赛数据不正确。');
    if(m.history.some(e=>!validScore(e.score)||!Number.isInteger(e.round)||e.round<0||e.round>5||typeof e.serving!=='boolean'))throw Error('记分历史不正确。');
    if(m.substitutions.some(e=>!e||!Number.isInteger(e.role)||e.role<0||e.role>6||typeof e.at!=='string'||!validScore(e.score)||![e.from,e.to].every(pid=>pid===null||s.players.some(p=>p.id===pid))))throw Error('换人历史不正确。');
  }
  return s;
}
