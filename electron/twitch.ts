import type { TokenRecord } from './storage';
import type { Health } from '../src/core/types';

const ID='https://id.twitch.tv/oauth2';
const EVENTSUB='wss://eventsub.wss.twitch.tv/ws';
const TYPES=['channel.chat.message','channel.chat.message_delete','channel.chat.clear','channel.chat.clear_user_messages'];
export type Fetcher = typeof fetch;
export async function jsonRequest(url:string,init:RequestInit={},fetcher:Fetcher=fetch) {
  const response=await fetcher(url,{...init,signal:AbortSignal.timeout(12_000)});
  const data=await response.json() as any;
  return {status:response.status,ok:response.ok,data};
}
export function isReconnectUrl(url:string) {
  try {const u=new URL(url);return u.protocol==='wss:'&&u.hostname==='eventsub.wss.twitch.tv'&&!u.username&&!u.password&&(!u.port||u.port==='443');}catch{return false;}
}
export function isOwnChannel(event:any,userId:string) {
  return event.broadcaster_user_id===userId && (!event.source_broadcaster_user_id||event.source_broadcaster_user_id===userId);
}

export class TwitchAuth {
  token:TokenRecord|undefined;
  private refreshTask:Promise<TokenRecord>|null=null;
  private flow=0;
  private validateTimer:ReturnType<typeof setInterval>|null=null;
  onInvalid:()=>void=()=>{};
  onDevice:(d:{code:string;url:string;expiresAt:number}|null)=>void=()=>{};
  constructor(private save:(t:TokenRecord|undefined)=>Promise<void>, private fetcher:Fetcher=fetch) {}
  async validate(token:TokenRecord):Promise<TokenRecord> {
    const r=await jsonRequest(`${ID}/validate`,{headers:{Authorization:`OAuth ${token.access_token}`}},this.fetcher);
    if(r.status===401) throw new Error('AUTH_INVALID');
    if(!r.ok) throw new Error('Twitch validation is temporarily unavailable.');
    if(r.data.client_id!==token.clientId||!r.data.user_id||!r.data.scopes?.includes('user:read:chat')) throw new Error('The authorized account or read-chat permission is not valid for this app.');
    if(token.userId && token.userId!==r.data.user_id) throw new Error('Twitch account identity changed. Reconnect.');
    return {...token,userId:r.data.user_id,login:r.data.login};
  }
  async resume(token:TokenRecord) {
    const epoch=++this.flow;
    this.token=token;
    try {const validated=await this.validate(token);this.assertFlow(epoch);this.token=validated;} catch(e) {
      this.assertFlow(epoch);
      if((e as Error).message==='AUTH_INVALID') await this.refresh(); else throw e;
    }
    this.assertFlow(epoch);await this.save(this.token);this.assertFlow(epoch);this.startValidation();return this.token!;
  }
  private assertFlow(epoch:number){if(this.flow!==epoch)throw new Error('Authorization changed or was cancelled.');}
  refresh():Promise<TokenRecord> {
    if(this.refreshTask) return this.refreshTask;
    this.refreshTask=(async()=>{
      const epoch=this.flow;
      const old=this.token;if(!old) throw new Error('Connect Twitch first.');
      const r=await jsonRequest(`${ID}/token`,{method:'POST',body:new URLSearchParams({grant_type:'refresh_token',refresh_token:old.refresh_token,client_id:old.clientId})},this.fetcher);
      if(this.flow!==epoch||this.token!==old)throw new Error('Authorization changed while refreshing.');
      if(!r.ok) {
        if(r.status===400||r.status===401) {this.token=undefined;await this.save(undefined);this.onInvalid();}
        throw new Error('Twitch authorization could not be renewed. Reconnect Twitch.');
      }
      const rotated={...old,access_token:r.data.access_token,refresh_token:r.data.refresh_token??old.refresh_token};
      // Persist rotation before making another authenticated request.
      this.token=rotated;await this.save(rotated);this.assertFlow(epoch);
      const validated=await this.validate(rotated);this.assertFlow(epoch);
      this.token=validated;await this.save(validated);this.assertFlow(epoch);return validated;
    })().finally(()=>{this.refreshTask=null;});return this.refreshTask;
  }
  private startValidation() {
    if(this.validateTimer) clearInterval(this.validateTimer);
    this.validateTimer=setInterval(()=>{
      if(this.token) void this.validate(this.token).catch(async e=>{
        if((e as Error).message==='AUTH_INVALID') {try{await this.refresh();}catch{this.onInvalid();}}
        else this.onInvalid();
      });
    },55*60_000);
  }
  async authorize(clientId:string) {
    if(!/^[a-z0-9]{20,64}$/i.test(clientId)) throw new Error('Enter a public Twitch Client ID.');
    const flow=++this.flow;
    const r=await jsonRequest(`${ID}/device`,{method:'POST',body:new URLSearchParams({client_id:clientId,scopes:'user:read:chat'})},this.fetcher);
    this.assertFlow(flow);
    if(!r.ok) throw new Error('Twitch did not accept this Public Client ID.');
    const expiresAt=Date.now()+r.data.expires_in*1000;
    this.onDevice({code:r.data.user_code,url:`https://www.twitch.tv/activate?device-code=${encodeURIComponent(r.data.user_code)}`,expiresAt});
    let interval=Math.max(5,r.data.interval??5)*1000;
    try {
      while(Date.now()<expiresAt&&this.flow===flow) {
        await new Promise(resolve=>setTimeout(resolve,interval));
        if(this.flow!==flow) throw new Error('Authorization cancelled.');
        const p=await jsonRequest(`${ID}/token`,{method:'POST',body:new URLSearchParams({client_id:clientId,device_code:r.data.device_code,grant_type:'urn:ietf:params:oauth:grant-type:device_code'})},this.fetcher);
        if(p.ok) {
          if(this.flow!==flow) throw new Error('Authorization cancelled.');
          const token=await this.validate({access_token:p.data.access_token,refresh_token:p.data.refresh_token,clientId,userId:'',login:''});
          this.assertFlow(flow);this.token=token;await this.save(token);this.assertFlow(flow);this.startValidation();return token;
        }
        const reason=String(p.data.message??p.data.error??'').toLowerCase();
        if(reason.includes('authorization_pending')||reason.includes('authorization pending')) continue;
        if(reason.includes('slow_down')||p.status===429) {interval+=5000;continue;}
        throw new Error('Authorization was declined or expired. Try Connect Twitch again.');
      }
      throw new Error('Authorization expired or was cancelled.');
    } finally {if(this.flow===flow) this.onDevice(null);}
  }
  async api(path:string,body:unknown) {
    const send=async()=>{
      if(!this.token) throw new Error('Twitch authorization is missing.');
      return jsonRequest(`https://api.twitch.tv/helix/${path}`,{method:'POST',headers:{'Client-Id':this.token.clientId,Authorization:`Bearer ${this.token.access_token}`,'Content-Type':'application/json'},body:JSON.stringify(body)},this.fetcher);
    };
    let r=await send();if(r.status===401){await this.refresh();r=await send();}return r;
  }
  async forget() {
    ++this.flow;this.onDevice(null);if(this.validateTimer) clearInterval(this.validateTimer);
    const t=this.token;this.token=undefined;await this.save(undefined);
    if(t) {
      const r=await jsonRequest(`${ID}/revoke`,{method:'POST',body:new URLSearchParams({client_id:t.clientId,token:t.access_token})},this.fetcher);
      if(!r.ok) throw new Error('Local credentials removed. Twitch revocation was not confirmed; remove SignalStrip in Twitch Connections if needed.');
    }
  }
  stop() {++this.flow;if(this.validateTimer) clearInterval(this.validateTimer);}
}

export class TwitchChat {
  private current:WebSocket|null=null;private pending:WebSocket|null=null;
  private stopped=true;private retry:ReturnType<typeof setTimeout>|null=null;private tries=0;
  private seen=new Set<string>();private watches=new Map<WebSocket,ReturnType<typeof setTimeout>>();
  onHealth:(health:Health,detail:string)=>void=()=>{};
  onEvent:(type:string,event:any,at:number)=>void=()=>{};
  constructor(private auth:TwitchAuth) {}
  start() {this.stop();this.stopped=false;this.onHealth('connecting','Connecting read-only chat');this.open(EVENTSUB,false);}
  stop() {
    this.stopped=true;if(this.retry) clearTimeout(this.retry);
    for(const timer of this.watches.values()) clearTimeout(timer);this.watches.clear();
    const a=this.current,b=this.pending;this.current=null;this.pending=null;
    a?.close();if(b!==a)b?.close();
  }
  private open(url:string,handover:boolean) {
    if(this.stopped||!this.auth.token) return;
    if(!isReconnectUrl(url)){this.onHealth('gap','Twitch supplied an unexpected reconnect address.');return;}
    const socket=new WebSocket(url);let welcomed=false,timeout=15_000;
    if(handover)this.pending=socket;else this.current=socket;
    const watchdog=()=>{
      clearTimeout(this.watches.get(socket));
      this.watches.set(socket,setTimeout(()=>socket.close(),timeout+1000));
    };watchdog();
    socket.addEventListener('message',async raw=>{
      try {
        const m=JSON.parse(String(raw.data));watchdog();
        const kind=m.metadata?.message_type;
        if(kind==='session_welcome') {
          if(this.stopped){socket.close();return;}
          welcomed=true;timeout=(m.payload.session.keepalive_timeout_seconds??10)*1000;watchdog();
          if(handover) {
            const previous=this.current;this.current=socket;this.pending=null;
            if(previous&&previous!==socket)previous.close();
          } else {
            const userId=this.auth.token!.userId;
            await Promise.all(TYPES.map(async type=>{
              const r=await this.auth.api('eventsub/subscriptions',{type,version:'1',condition:{broadcaster_user_id:userId,user_id:userId},transport:{method:'websocket',session_id:m.payload.session.id}});
              if(r.status!==202) throw new Error(`Chat subscription failed (${r.status}). Reconnect Twitch.`);
            }));
            if(this.stopped||socket!==this.current){socket.close();return;}
          }
          this.tries=0;this.onHealth('ready',`Listening to ${this.auth.token?.login??'your channel'} · read-only`);
        } else if(kind==='session_reconnect') {
          if(!this.pending&&socket===this.current)this.open(m.payload.session.reconnect_url,true);
        } else if(kind==='revocation') {
          this.stop();this.onHealth('reauthorize','Twitch revoked a required chat subscription. Reconnect.');
        } else if(kind==='notification') {
          const key=m.metadata.message_id;if(this.seen.has(key))return;
          this.seen.add(key);if(this.seen.size>4096)this.seen.delete(this.seen.values().next().value!);
          const event=m.payload.event,at=Date.parse(m.metadata.message_timestamp);
          if(!Number.isFinite(at)||Date.now()-at>10*60_000||at>Date.now()+30_000)return;
          if(isOwnChannel(event,this.auth.token?.userId??''))this.onEvent(m.payload.subscription.type,event,at);
        }
      } catch {
        if(!this.stopped)this.onHealth('gap','Chat intake interrupted. Reconnecting; active checks are invalidated.');
        socket.close();
      }
    });
    socket.addEventListener('error',()=>socket.close());
    socket.addEventListener('close',()=>{
      clearTimeout(this.watches.get(socket));this.watches.delete(socket);
      if(this.stopped)return;
      if(socket===this.pending){this.pending=null;if(this.current?.readyState===WebSocket.OPEN)return;}
      if(socket!==this.current&&welcomed)return;
      if(socket===this.current)this.current=null;
      if(this.pending)return;
      this.onHealth(this.auth.token?'gap':'reauthorize','Chat connection lost. Messages during this gap cannot be recovered.');
      if(this.auth.token)this.retry=setTimeout(()=>this.open(EVENTSUB,false),Math.min(30_000,1000*2**this.tries++));
    });
  }
}
