// User-controlled Libero substitutions; structural validation only.
export const DEFAULT_LIBERO_ROLES=[1,5]; // 大主、大副
const CYCLE=[1,6,5,4,3,2];
export const rolePosition=(role,round)=>CYCLE[(CYCLE.indexOf(role+1)+round)%6];
export const isBackRole=(role,round)=>[1,5,6].includes(rolePosition(role,round));
export const validPlan=plan=>Array.isArray(plan)&&new Set(plan).size===plan.length&&plan.every(r=>Number.isInteger(r)&&r>=0&&r<6);
export const defaultLiberoChoices=plan=>Array.from({length:6},(_,round)=>[5,1,0,2,3,4].find(r=>plan.includes(r)&&isBackRole(r,round))??null);
export function validChoices(choices,plan){return Array.isArray(choices)&&choices.length===6&&choices.every(r=>r===null||Number.isInteger(r)&&r>=0&&r<6);}
export function newLiberoState(match,role=null,verified=true){return {role,replacedId:role===null?null:match.lineup[role],rally:0,lastRally:role===null?null:0,manualSeq:0,verified,events:[]};}
export function migrateLiberoState(state){
 state.liberoPlan??=[...DEFAULT_LIBERO_ROLES];state.liberoChoices??=defaultLiberoChoices(state.liberoPlan);
 if(state.match){const m=state.match;m.liberoPlan??=[...state.liberoPlan];m.liberoChoices??=structuredClone(state.liberoChoices);m.libero??=newLiberoState(m,null,!m.lineup[6]);}
 return state;
}
export function eligibleLiberoRoles(match){return match.lineup[6]?[0,1,2,3,4,5]:[];}
export function liberoReplacementError(match,role){
 if(role!==null&&!match.lineup[6])return '请先安排自由人。';
 if(role!==null&&!eligibleLiberoRoles(match).includes(role))return '请选择替换角色。';
 return '';
}
export function setLibero(match,role){
 const error=liberoReplacementError(match,role);if(error)throw Error(error);
 const l=match.libero??=newLiberoState(match);l.verified=true;if(role===l.role)return false;
 const from=l.role;l.role=role;l.replacedId=role===null?null:match.lineup[role];l.lastRally=l.rally;l.manualSeq++;
 l.events.push({from,to:role,rally:l.rally,score:[...match.score],reason:'manual'});return true;
}
export function calibrateLibero(match,role){
 const error=liberoReplacementError(match,role);if(error)throw Error(error);
 const old=match.libero,seq=(old?.manualSeq??0)+1;
 match.history=[];match.libero=newLiberoState(match,role,true);match.libero.manualSeq=seq;
 match.libero.events.push({from:old?.role??null,to:role,rally:0,score:[...match.score],reason:'correction'});
}
export function advanceLibero(match){if(match.libero)match.libero.rally++;}
export function validLiberoState(match){
 const l=match.libero;if(l===undefined)return true;
 if(!l||typeof l.verified!=='boolean'||!Number.isSafeInteger(l.rally)||l.rally<0||!Number.isSafeInteger(l.manualSeq)||l.manualSeq<0||!(l.lastRally===null||Number.isSafeInteger(l.lastRally)&&l.lastRally>=0&&l.lastRally<=l.rally)||!Array.isArray(l.events)||l.events.length>100000)return false;
 const validRole=r=>r===null||Number.isInteger(r)&&r>=0&&r<6;
 if(!l.events.every(e=>e&&validRole(e.from)&&validRole(e.to)&&Number.isSafeInteger(e.rally)&&e.rally>=0&&e.rally<=l.rally&&Array.isArray(e.score)&&e.score.length===2&&e.score.every(n=>Number.isInteger(n)&&n>=0&&n<=9999)&&['manual','rotation','correction'].includes(e.reason)))return false;
 if(l.role===null)return l.replacedId===null;
 return Number.isInteger(l.role)&&eligibleLiberoRoles(match).includes(l.role)&&l.replacedId===match.lineup[l.role];
}
