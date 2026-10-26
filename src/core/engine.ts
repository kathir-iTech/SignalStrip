import type { State, Incident, Observation, Contribution, Change, Check, Health, Mode, Outcome } from './types';

export const FRESH_MS = 5_000;
const MAX_REPORTS = 200;
const MAX_SEEN = 4_096;
export type Event =
  | {type:'tick'; at:number}
  | {type:'connection'; which:'obs'|'twitch'; health:Health; detail:string; at:number}
  | {type:'observation'; value:Observation|null}
  | {type:'open'; id:string; at:number}
  | {type:'report'; id:string; dedupe:string; contribution:Contribution}
  | {type:'ack'; checkId:string; dedupe:string; contribution:Contribution}
  | {type:'withdraw'; messageId?:string; account?:string; all?:boolean}
  | {type:'change'; value:Change}
  | {type:'check'; value:Check}
  | {type:'invalidate'; reason:string}
  | {type:'close'; outcome:Outcome; at:number}
  | {type:'reopen'; id:string; at:number}
  | {type:'pause'} | {type:'quiet'};

export const initialState = (mode:Mode='live', now=Date.now()):State => ({
  mode, now, paused:false, quiet:false, twitch:'offline', obs:'offline', login:'',
  twitchDetail:'Connect your channel', obsDetail:'Connect local OBS', observation:null,
  incident:null, history:[], seen:[], journalError:null,
});
const incident = (id:string, at:number, mode:Mode):Incident => ({id,startedAt:at,mode,reports:[],changes:[],check:null,suppressed:0});
export const active = (items:Contribution[]) => items.filter(x=>!x.withdrawn);
export const fresh = (s:State, now=s.now) => !!s.observation && s.obs==='ready' && now-s.observation.at<=FRESH_MS;
export const disputed = (i:Incident) => !!i.check && active(i.reports).some(x=>x.at>=i.check!.startedAt);
export const unknownChange = (i:Incident|null) => !!i?.changes.some(x=>x.status==='applying'||x.status==='unknown');
function invalidate(i:Incident|null, reason:string):Incident|null {
  if(!i?.check || i.check.status!=='active') return i;
  return {...i,check:{...i.check,status:'invalidated',invalidReason:reason}};
}

// Pure state transition. There is deliberately no OBS effect in a chat event.
export function reduce(s:State, e:Event):State {
  switch(e.type) {
    case 'tick': return {...s,now:e.at,incident:s.incident?.check?.status==='active' && e.at>=s.incident.check.expiresAt
      ? {...s.incident,check:{...s.incident.check,status:'expired'}} : s.incident};
    case 'connection': {
      const gap=e.health!=='ready';
      return {...s,[e.which]:e.health,[`${e.which}Detail`]:e.detail,
        observation:e.which==='obs'&&gap?null:s.observation,
        incident:gap?invalidate(s.incident,`${e.which==='obs'?'OBS':'Chat'} connection changed; start a fresh check`):s.incident};
    }
    case 'observation': return {...s,observation:e.value};
    case 'open': return s.incident?s:{...s,incident:incident(e.id,e.at,s.mode)};
    case 'pause': return {...s,paused:!s.paused};
    case 'quiet': return {...s,quiet:!s.quiet};
    case 'report': {
      if(s.paused || s.seen.includes(e.dedupe)) return s;
      const i=s.incident??incident(e.id,e.contribution.at,s.mode);
      const repeated=active(i.reports).some(x=>x.account===e.contribution.account && e.contribution.at-x.at<30_000);
      const next=repeated || i.reports.length>=MAX_REPORTS ? {...i,suppressed:i.suppressed+1}
        : {...i,reports:[...i.reports,e.contribution]};
      return {...s,incident:next,seen:[...s.seen,e.dedupe].slice(-MAX_SEEN)};
    }
    case 'ack': {
      const i=s.incident,c=i?.check;
      if(!i||!c||c.status!=='active'||e.checkId!==c.id||e.contribution.at<c.startedAt||e.contribution.at>=c.expiresAt||s.twitch!=='ready'||s.seen.includes(e.dedupe)) return s;
      if(active(c.responses).some(x=>x.account===e.contribution.account)||c.responses.length>=MAX_REPORTS) return s;
      return {...s,seen:[...s.seen,e.dedupe].slice(-MAX_SEEN),incident:{...i,check:{...c,responses:[...c.responses,e.contribution]}}};
    }
    case 'withdraw': {
      const match=(c:Contribution)=>e.all || (!!e.messageId&&c.messageId===e.messageId) || (!!e.account&&c.account===e.account);
      const update=(i:Incident):Incident=>{
        const changed=i.reports.some(c=>!c.withdrawn&&match(c)) || i.check?.responses.some(c=>!c.withdrawn&&match(c));
        return {...i,evidenceWithdrawn:i.evidenceWithdrawn||!!changed,
          reports:i.reports.map(c=>match(c)?{...c,withdrawn:true}:c),
          check:i.check?{...i.check,responses:i.check.responses.map(c=>match(c)?{...c,withdrawn:true}:c)}:null};
      };
      return {...s,incident:s.incident?update(s.incident):null,history:s.history.map(update)};
    }
    case 'change': {
      if(!s.incident) return s;
      const exists=s.incident.changes.some(x=>x.id===e.value.id);
      return {...s,incident:{...invalidate(s.incident,'Microphone setting changed; start a fresh check')!,
        changes:exists?s.incident.changes.map(x=>x.id===e.value.id?e.value:x):[...s.incident.changes,e.value]}};
    }
    case 'check': return !s.incident?s:{...s,incident:{...s.incident,check:e.value}};
    case 'invalidate': return {...s,incident:invalidate(s.incident,e.reason)};
    case 'close': {
      const i=s.incident;
      if(!i || unknownChange(i)) return s;
      if(e.outcome==='audience-returned'&&(!i.check||i.check.status==='invalidated'||!active(i.check.responses).length||disputed(i))) return s;
      if(e.outcome==='local-only'&&!i.changes.some(x=>x.status==='verified')) return s;
      return {...s,incident:null,history:[{...i,endedAt:e.at,outcome:e.outcome},...s.history].slice(0,200)};
    }
    case 'reopen': {
      if(s.incident) return s;
      const i=s.history.find(x=>x.id===e.id);
      if(!i) return s;
      return {...s,incident:{...i,endedAt:undefined,outcome:undefined,check:i.check?{...i.check,status:'invalidated',invalidReason:'Reopened; a fresh check is required'}:null},history:s.history.filter(x=>x.id!==i.id)};
    }
  }
}

export function recover(saved:Partial<State>, now:number, retentionDays:number):State {
  const s=initialState('live',now);
  const cutoff=now-retentionDays*86_400_000;
  s.history=(saved.history??[]).filter(i=>i.startedAt>=cutoff).slice(0,200);
  if(saved.incident && saved.incident.mode==='live') {
    s.incident={...saved.incident,interrupted:true,
      check:saved.incident.check?{...saved.incident.check,status:'invalidated',invalidReason:'App restarted; start a new check'}:null,
      changes:saved.incident.changes.map(x=>x.status==='applying'?{...x,status:'unknown',note:'App stopped during request. Inspect before another change.'}:x)};
  }
  return s;
}

export type ChatCommand = {kind:'report'}|{kind:'heard'; id:string; word:string}|null;
export function parseChat(text:string):ChatCommand {
  if(/^!signal audio$/i.test(text.trim())) return {kind:'report'};
  const m=/^!heard ([A-Z2-9]{4}) ([a-z]{3,16})$/i.exec(text.trim());
  return m?{kind:'heard',id:m[1].toUpperCase(),word:m[2].toLowerCase()}:null;
}

export function publicCheck(s:State) {
  const c=s.incident?.check;
  return c?.status==='active' && s.now<c.expiresAt ? {
    active:true, id:c.id, expiresAt:c.expiresAt,
    rehearsal:s.mode==='rehearsal', instruction:`Type !heard ${c.id} followed by the word you hear`,
  } : {active:false};
}
