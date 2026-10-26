import { afterEach,beforeEach,describe,it,expect,vi } from 'vitest';
import { TwitchChat,type TwitchAuth } from '../electron/twitch';
class Socket extends EventTarget {
  static OPEN=1;static CLOSED=3;static instances:Socket[]=[];readyState=1;
  constructor(readonly url:string){super();Socket.instances.push(this);}
  close(){if(this.readyState===3)return;this.readyState=3;this.dispatchEvent(new Event('close'));}
  message(kind:string,payload:any,id='meta-'+Math.random()){
    this.dispatchEvent(new MessageEvent('message',{data:JSON.stringify({metadata:{message_type:kind,message_id:id,message_timestamp:new Date().toISOString()},payload})}));
  }
}
let clients:TwitchChat[]=[];
beforeEach(()=>{vi.useFakeTimers();vi.stubGlobal('WebSocket',Socket);Socket.instances=[];clients=[];});
afterEach(()=>{for(const client of clients)client.stop();vi.useRealTimers();vi.unstubAllGlobals();});
const setup=()=>{
  const api=vi.fn(async()=>({status:202}));const auth={token:{userId:'owner',login:'creator'},api} as unknown as TwitchAuth;
  const client=new TwitchChat(auth),health=vi.fn(),event=vi.fn();client.onHealth=health;client.onEvent=event;clients.push(client);client.start();return {client,health,event,api};
};
const welcome=async(s:Socket,id='session')=>{s.message('session_welcome',{session:{id,keepalive_timeout_seconds:10}});await vi.advanceTimersByTimeAsync(1);};
describe('EventSub lifecycle',()=>{
  it('subscribes to all four read/moderation types and deduplicates notifications',async()=>{
    const {api,health,event}=setup(),s=Socket.instances[0];await welcome(s);expect(api).toHaveBeenCalledTimes(4);expect(health).toHaveBeenLastCalledWith('ready',expect.any(String));
    const payload={subscription:{type:'channel.chat.message'},event:{broadcaster_user_id:'owner',message_id:'message',message:{text:'!signal audio'}}};
    s.message('notification',payload,'same');s.message('notification',payload,'same');expect(event).toHaveBeenCalledTimes(1);
    s.message('notification',{...payload,event:{...payload.event,source_broadcaster_user_id:'other'}},'foreign');expect(event).toHaveBeenCalledTimes(1);
  });
  it('hands over without new subscriptions and ignores the old socket closure',async()=>{
    const {api,health}=setup(),old=Socket.instances[0];await welcome(old);
    old.message('session_reconnect',{session:{reconnect_url:'wss://eventsub.wss.twitch.tv/ws?reconnect=fixture'}});
    expect(old.readyState).toBe(1);await welcome(Socket.instances[1],'replacement');expect(old.readyState).toBe(3);expect(api).toHaveBeenCalledTimes(4);expect(health.mock.calls.some(c=>c[0]==='gap')).toBe(false);
  });
  it('marks unexpected loss as a gap and resubscribes on a new socket',async()=>{
    const {api,health}=setup();await welcome(Socket.instances[0]);Socket.instances[0].close();expect(health).toHaveBeenLastCalledWith('gap',expect.any(String));
    await vi.advanceTimersByTimeAsync(1001);await welcome(Socket.instances[1],'new');expect(api).toHaveBeenCalledTimes(8);
  });
  it('stops intake on revocation instead of synthesizing chat',async()=>{
    const {health}=setup();await welcome(Socket.instances[0]);Socket.instances[0].message('revocation',{subscription:{status:'authorization_revoked'}});
    expect(health).toHaveBeenLastCalledWith('reauthorize',expect.any(String));await vi.advanceTimersByTimeAsync(30000);expect(Socket.instances).toHaveLength(1);
  });
  it('detects a missing keepalive',async()=>{
    const {health}=setup();await welcome(Socket.instances[0]);await vi.advanceTimersByTimeAsync(11001);expect(health.mock.calls.some(c=>c[0]==='gap')).toBe(true);
  });
});
