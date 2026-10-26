import { describe,it,expect,vi,beforeEach } from 'vitest';
import { EventEmitter } from 'node:events';
import type { Proposal,Mic } from '../src/core/types';
const model=vi.hoisted(()=>({muted:true,version:'33.0.0',authenticated:true,calls:[] as string[],renamed:false,failSet:false,lateEvent:false,emitDuringRead:false,failVersion:false,disconnects:0}));
vi.mock('obs-websocket-js',()=>({default:class extends EventEmitter {
  async connect(){this.emit('Hello',{authentication:model.authenticated?{salt:'fixture',challenge:'fixture'}:undefined});return {};}
  async disconnect(){model.disconnects++;this.emit('ConnectionClosed');}
  async call(name:string,data:any){
    model.calls.push(name);
    if(name==='GetVersion'){if(model.failVersion)throw Error('Capability read timed out');return {obsVersion:model.version,availableRequests:['GetInputMute','SetInputMute','GetInputAudioMonitorType','SetInputAudioMonitorType','GetInputAudioTracks']};}
    if(name==='GetInputList'){if(model.emitDuringRead){model.emitDuringRead=false;this.emit('InputMuteStateChanged',{});}return {inputs:[{inputUuid:'mic',inputName:model.renamed?'Other mic':'Selected mic',inputKind:'wasapi_input_capture'},{inputUuid:'desktop',inputName:'Desktop Audio',inputKind:'wasapi_output_capture'}]};}
    if(name==='GetInputMute')return {inputMuted:model.muted};
    if(name==='GetInputAudioMonitorType')return {monitorType:'OBS_MONITORING_TYPE_NONE'};
    if(name==='GetInputAudioTracks')return {inputAudioTracks:{1:true,2:false}};
    if(name==='SetInputMute'){model.muted=data.inputMuted;if(model.lateEvent)model.emitDuringRead=true;else this.emit('InputMuteStateChanged',{});if(model.failSet)throw Error('Connection lost after write');return {};}
    if(name==='SetInputAudioMonitorType')return {};
    throw Error('Unexpected request '+name);
  }
}}));
import { ObsAdapter } from '../electron/obs';
const mic:Mic={uuid:'mic',name:'Selected mic',kind:'wasapi_input_capture'};
async function ready(){const adapter=new ObsAdapter();await adapter.connect(4455,'fixture-password');return adapter;}
async function proposal(adapter:ObsAdapter):Promise<Proposal>{return {id:'approval',incidentId:'incident',observation:await adapter.inspect(mic),field:'muted',before:true,after:false,expiresAt:Date.now()+15000};}
beforeEach(()=>{model.muted=true;model.version='33.0.0';model.authenticated=true;model.calls=[];model.renamed=false;model.failSet=false;model.lateEvent=false;model.emitDuringRead=false;model.failVersion=false;model.disconnects=0;});
describe('OBS correction boundary',()=>{
  it('reads only selected capture sources and disables legacy correction on OBS 33',async()=>{const a=await ready();expect(await a.sources()).toEqual([mic]);const o=await a.inspect(mic);expect(o.legacyMonitor).toBe(false);expect(o.tracks).toEqual([1]);expect(model.calls.some(x=>x.startsWith('Set'))).toBe(false);await a.disconnect();});
  it('rechecks before an explicit Set, never Toggle, then reads back',async()=>{const a=await ready();const p=await proposal(a);const o=await a.apply(p);expect(o.muted).toBe(false);expect(model.calls.filter(x=>x.startsWith('Set'))).toEqual(['SetInputMute']);expect(model.calls).not.toContain('ToggleInputMute');expect(model.calls.lastIndexOf('GetInputMute')).toBeGreaterThan(model.calls.indexOf('SetInputMute'));await a.disconnect();});
  it('refuses expired and manually changed proposals without any write',async()=>{const a=await ready();const p=await proposal(a);p.expiresAt=Date.now()-1;await expect(a.apply(p)).rejects.toThrow();p.expiresAt=Date.now()+15000;model.muted=false;await expect(a.apply(p)).rejects.toThrow();expect(model.calls).not.toContain('SetInputMute');await a.disconnect();});
  it('refuses renamed sources and unsupported monitor repair',async()=>{const a=await ready();const p=await proposal(a);model.renamed=true;await expect(a.apply(p)).rejects.toThrow(/renamed/);model.renamed=false;p.field='monitor';p.before='OBS_MONITORING_TYPE_NONE';p.after='OBS_MONITORING_TYPE_MONITOR_AND_OUTPUT';await expect(a.apply(p)).rejects.toThrow(/not supported/);expect(model.calls).not.toContain('SetInputAudioMonitorType');await a.disconnect();});
  it('does not repeat a write whose response was lost',async()=>{const a=await ready();const p=await proposal(a);model.failSet=true;await expect(a.apply(p)).rejects.toThrow();expect(model.calls.filter(x=>x==='SetInputMute')).toHaveLength(1);expect((await a.inspect(mic)).muted).toBe(false);await a.disconnect();});
  it('refuses an unauthenticated OBS listener',async()=>{model.authenticated=false;const a=new ObsAdapter();await expect(a.connect(4455,'fixture')).rejects.toThrow(/authentication/);expect(a.ready).toBe(false);expect(model.calls).toEqual([]);await a.disconnect();});
  it('retries only readback if the owned setting event arrives during inspection',async()=>{const a=await ready();const p=await proposal(a);model.lateEvent=true;expect((await a.apply(p)).muted).toBe(false);expect(model.calls.filter(x=>x==='SetInputMute')).toHaveLength(1);await a.disconnect();});
  it('reconnects after capability inspection fails on an otherwise open socket',async()=>{
    vi.useFakeTimers();const a=new ObsAdapter();
    try{model.failVersion=true;await expect(a.connect(4455,'fixture')).rejects.toThrow('Capability');expect(model.disconnects).toBe(1);expect(a.ready).toBe(false);model.failVersion=false;await vi.advanceTimersByTimeAsync(1000);expect(a.ready).toBe(true);expect(model.calls.filter(x=>x==='GetVersion')).toHaveLength(2);expect(model.calls.some(x=>x.startsWith('Set'))).toBe(false);}
    finally{await a.disconnect();vi.useRealTimers();}
  });
});
