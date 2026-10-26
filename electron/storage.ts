import { mkdir, readFile, writeFile, rename, appendFile, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import type { State, Settings } from '../src/core/types';

export interface TokenRecord { access_token:string; refresh_token:string; clientId:string; userId:string; login:string }
export interface Secrets { installKey:string; overlayKey?:string; twitch?:TokenRecord; obsPassword?:string }
export interface Codec { encrypt(value:string):Promise<Buffer>; decrypt(value:Buffer):Promise<string> }
export const defaultSettings:Settings={clientId:'n3ntudsccotfzw2c0bvsccofijiwwh',obsPort:4455,mic:null,intendedMonitor:'OBS_MONITORING_TYPE_NONE',duration:120,retentionDays:7,trustedAccounts:[]};

export async function atomicWrite(file:string,data:string|Buffer) {
  await mkdir(path.dirname(file),{recursive:true});
  const tmp=file+'.tmp';
  await writeFile(tmp,data,{mode:0o600});
  await rename(tmp,file);
}
export function parseJournal(text:string):unknown[] {
  const lines=text.split('\n'),result:unknown[]=[];
  for(let i=0;i<lines.length;i++) {
    if(!lines[i].trim()) continue;
    try {result.push(JSON.parse(lines[i]));}
    catch {if(i===lines.length-1) break; throw new Error('History contains a damaged record');}
  }
  return result;
}
export class Storage {
  private tail:Promise<void>=Promise.resolve();
  private secretTail:Promise<void>=Promise.resolve();
  constructor(readonly dir:string, private codec:Codec) {}
  async settings():Promise<Settings> {
    try {return {...defaultSettings,...JSON.parse(await readFile(path.join(this.dir,'settings.json'),'utf8'))};}
    catch(e) {if((e as NodeJS.ErrnoException).code==='ENOENT') return {...defaultSettings}; throw new Error('Settings could not be read. Your files have been preserved.');}
  }
  async saveSettings(settings:Settings) { await atomicWrite(path.join(this.dir,'settings.json'),JSON.stringify(settings)); }
  async secrets():Promise<Secrets> {
    try {return JSON.parse(await this.codec.decrypt(await readFile(path.join(this.dir,'secrets.bin'))));}
    catch(e) {if((e as NodeJS.ErrnoException).code==='ENOENT') return {installKey:randomBytes(32).toString('hex')}; throw new Error('Windows could not unlock saved credentials. Reconnect or use the original Windows account.');}
  }
  saveSecrets(secrets:Secrets) {
    const value=JSON.stringify(secrets);
    const next=this.secretTail.then(async()=>atomicWrite(path.join(this.dir,'secrets.bin'),await this.codec.encrypt(value)));
    this.secretTail=next.catch(()=>{}); return next;
  }
  async load():Promise<Partial<State>> {
    try {return JSON.parse(await readFile(path.join(this.dir,'session.json'),'utf8'));}
    catch(e) {if((e as NodeJS.ErrnoException).code==='ENOENT') return {}; throw new Error('Saved incident could not be read. No OBS actions were replayed.');}
  }
  record(s:State,event:string) {
    const snapshot=JSON.stringify({history:s.history,incident:s.incident});
    const note=JSON.stringify({at:Date.now(),event,mode:s.mode,incident:s.incident?.id??null})+'\n';
    const next=this.tail.then(async()=>{
      await mkdir(this.dir,{recursive:true});
      const journal=path.join(this.dir,'journal.jsonl');
      const size=await stat(journal).then(x=>x.size).catch(()=>0);
      if(size>2_000_000) await atomicWrite(journal,'');
      await appendFile(journal,note,{mode:0o600});
      await atomicWrite(path.join(this.dir,'session.json'),snapshot);
    });
    this.tail=next.catch(()=>{}); return next;
  }
  clear() {
    const next=this.tail.then(async()=>{
      for(const name of ['journal.jsonl','session.json','session.json.tmp','journal.jsonl.tmp']) await rm(path.join(this.dir,name),{force:true});
    }); this.tail=next.catch(()=>{}); return next;
  }
  pruneJournal(retentionDays:number) {
    const next=this.tail.then(async()=>{
      const file=path.join(this.dir,'journal.jsonl');
      const content=await readFile(file,'utf8').catch((e:NodeJS.ErrnoException)=>{if(e.code==='ENOENT')return '';throw e;});
      const cutoff=Date.now()-retentionDays*86_400_000;
      const kept=parseJournal(content).filter((x:any)=>typeof x.at==='number'&&x.at>=cutoff);
      await atomicWrite(file,kept.map(x=>JSON.stringify(x)).join('\n')+(kept.length?'\n':''));
    });this.tail=next.catch(()=>{});return next;
  }
  async flush() {await this.tail; await this.secretTail;}
}
