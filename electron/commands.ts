import type { Command } from '../src/core/types';
const simple=new Set(['pause','quiet','open','inspect','cancel-proposal','start-check','cancel-check','obs-disconnect','twitch-disconnect','auth-open','compact','copy-overlay','export','clear-history','clear-session']);
export function validateCommand(raw:unknown):Command {
  if(!raw||typeof raw!=='object'||Array.isArray(raw))throw new Error('Invalid command');
  const c=raw as Record<string,unknown>;
  if(typeof c.type!=='string')throw new Error('Invalid command');
  const str=(name:string,max=128)=>typeof c[name]==='string'&&(c[name] as string).length<=max;
  if(simple.has(c.type))return {type:c.type} as Command;
  if(c.type==='mode'&&['live','rehearsal'].includes(String(c.mode)))return {type:c.type,mode:c.mode} as Command;
  if(c.type==='propose'&&['muted','monitor'].includes(String(c.field)))return {type:c.type,field:c.field} as Command;
  if(['apply','reopen'].includes(c.type)&&str('id'))return {type:c.type,id:c.id} as Command;
  if(c.type==='close'&&['audience-returned','local-only','dismissed','unresolved'].includes(String(c.outcome)))return {type:c.type,outcome:c.outcome} as Command;
  if(c.type==='select-mic'&&str('uuid'))return {type:c.type,uuid:c.uuid} as Command;
  if(c.type==='twitch-connect'&&str('clientId',64))return {type:c.type,clientId:c.clientId} as Command;
  if(c.type==='obs-connect'&&Number.isInteger(c.port)&&Number(c.port)>=1024&&Number(c.port)<=65535&&str('password',256))return {type:c.type,port:c.port,password:c.password} as Command;
  if(c.type==='rehearsal'&&['report','reply','dispute','stale','duplicate','delete','gap','mute','normal'].includes(String(c.scenario)))return {type:c.type,scenario:c.scenario} as Command;
  if(c.type==='settings'&&c.settings&&typeof c.settings==='object'){
    const s=c.settings as Record<string,unknown>;
    if(Object.keys(s).some(k=>!['duration','retentionDays','trustedAccounts','intendedMonitor'].includes(k)))throw new Error('Unsupported setting');
    if(s.duration!==undefined&&![60,120,180].includes(Number(s.duration)))throw new Error('Invalid duration');
    if(s.retentionDays!==undefined&&![1,7,30].includes(Number(s.retentionDays)))throw new Error('Invalid retention');
    if(s.trustedAccounts!==undefined&&(!Array.isArray(s.trustedAccounts)||s.trustedAccounts.length>20||s.trustedAccounts.some(x=>typeof x!=='string'||x.length>25)))throw new Error('Invalid trusted accounts');
    return {type:'settings',settings:s} as Command;
  }
  throw new Error('Unsupported command');
}
