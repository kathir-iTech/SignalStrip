import { describe,it,expect } from 'vitest';
import { validateCommand } from '../electron/commands';
import { isOwnChannel,isReconnectUrl,TwitchAuth } from '../electron/twitch';
import { parseJournal,Storage } from '../electron/storage';
import { mkdtemp,readFile,rm } from 'node:fs/promises';
import os from 'node:os';import path from 'node:path';
import { initialState,reduce } from '../src/core/engine';
describe('trust boundaries',()=>{
  it('rejects arbitrary IPC setters, file paths, invalid ports and hidden settings',()=>{
    for(const c of [{type:'SetInputMute',inputMuted:false},{type:'obs-connect',port:80,password:'x'},{type:'settings',settings:{mic:{uuid:'attacker'}}},{type:'settings',settings:{trustedAccounts:[{}]}},{type:'open',__proto__:{type:'apply'}}]){
      if(c.type==='open')continue;expect(()=>validateCommand(c)).toThrow();
    }
    expect(validateCommand({type:'open',secret:'discarded'})).toEqual({type:'open'});
  });
  it('rejects foreign Shared Chat contributions',()=>{
    expect(isOwnChannel({broadcaster_user_id:'ours',source_broadcaster_user_id:'foreign'},'ours')).toBe(false);
    expect(isOwnChannel({broadcaster_user_id:'ours',source_broadcaster_user_id:'ours'},'ours')).toBe(true);
    expect(isOwnChannel({broadcaster_user_id:'ours'},'ours')).toBe(true);
  });
  it('never follows arbitrary server reconnect URLs',()=>{
    expect(isReconnectUrl('wss://eventsub.wss.twitch.tv/ws?reconnect=abc')).toBe(true);
    for(const u of ['ws://eventsub.wss.twitch.tv/ws','wss://evil.example/ws','wss://user@eventsub.wss.twitch.tv/ws','wss://eventsub.wss.twitch.tv:8080/ws'])expect(isReconnectUrl(u)).toBe(false);
  });
  it('tolerates only a torn last journal record',()=>{
    expect(parseJournal('{"event":"open"}\n{"event":')).toEqual([{event:'open'}]);
    expect(()=>parseJournal('{"event":\n{"event":"close"}\n')).toThrow();
  });
  it('serializes snapshots and clear against pending writes',async()=>{
    const dir=await mkdtemp(path.join(os.tmpdir(),'signalstrip-storage-test-'));
    try{
      const storage=new Storage(dir,{encrypt:async x=>Buffer.from(x),decrypt:async x=>x.toString()});
      const s=reduce(initialState(),{type:'open',id:'first',at:1});
      const a=storage.record(s,'open');const b=storage.clear();await Promise.all([a,b]);
      await expect(readFile(path.join(dir,'session.json'))).rejects.toThrow();
      await storage.record({...s,incident:null},'cleared');expect((await storage.load()).incident).toBeNull();
    }finally{await rm(dir,{recursive:true,force:true});}
  });
  it('coalesces token refresh, persists rotation, and validates identity',async()=>{
    let calls=0;const saved:any[]=[];
    const fetcher=async(url:any)=>{calls++;return new Response(JSON.stringify(String(url).endsWith('/token')?{access_token:'new-access',refresh_token:'new-refresh'}:{client_id:'client',user_id:'user',login:'owner',scopes:['user:read:chat']}),{status:200});};
    const auth=new TwitchAuth(async t=>{saved.push(structuredClone(t));},fetcher as typeof fetch);
    auth.token={access_token:'old',refresh_token:'old-refresh',userId:'user',clientId:'client',login:'owner'};
    const [a,b]=await Promise.all([auth.refresh(),auth.refresh()]);expect(a).toEqual(b);expect(calls).toBe(2);expect(saved[0].refresh_token).toBe('new-refresh');auth.stop();
  });
  it('revoked refresh removes saved credentials and signals reauthorization',async()=>{
    let removed=false,invalid=false;
    const auth=new TwitchAuth(async t=>{removed=!t;},(async()=>new Response('{}',{status:400})) as typeof fetch);
    auth.token={access_token:'old',refresh_token:'revoked',userId:'user',clientId:'client',login:'owner'};auth.onInvalid=()=>{invalid=true;};
    await expect(auth.refresh()).rejects.toThrow();expect(removed&&invalid).toBe(true);expect(auth.token).toBeUndefined();auth.stop();
  });
  it('disconnect during refresh validation cannot restore forgotten credentials',async()=>{
    let finish!:(r:Response)=>void;let validationStarted!:()=>void;
    const started=new Promise<void>(r=>{validationStarted=r;});
    const saved:any[]=[];
    const auth=new TwitchAuth(async t=>{saved.push(t);},(async(url:any)=>{
      if(String(url).endsWith('/validate')){validationStarted();return new Promise<Response>(r=>{finish=r;});}
      return new Response(JSON.stringify({access_token:'rotated',refresh_token:'rotated-refresh'}),{status:200});
    }) as typeof fetch);
    auth.token={access_token:'old',refresh_token:'refresh',userId:'user',clientId:'client',login:'owner'};
    const refreshing=auth.refresh();const rejected=expect(refreshing).rejects.toThrow('cancelled');
    await started;await auth.forget();
    finish(new Response(JSON.stringify({client_id:'client',user_id:'user',login:'owner',scopes:['user:read:chat']}),{status:200}));
    await rejected;expect(auth.token).toBeUndefined();expect(saved.at(-1)).toBeUndefined();auth.stop();
  });
});
