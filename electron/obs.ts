import OBSWebSocket from 'obs-websocket-js';
import type { Mic, Observation, Monitor, Proposal } from '../src/core/types';

export class ObsAdapter {
  private socket=new OBSWebSocket();
  ready=false; generation=0; version=''; requests=new Set<string>();
  private timer:ReturnType<typeof setTimeout>|null=null;
  private reconnectTimer:ReturnType<typeof setTimeout>|null=null;
  private stopped=true; private port=4455; private password=''; private tries=0;
  onHealth:(ready:boolean,detail:string)=>void=()=>{};
  onInvalidate:()=>void=()=>{};
  onLevel:(uuid:string,level:number)=>void=()=>{};
  constructor() {
    this.socket.on('ConnectionClosed',()=>{
      this.ready=false; this.generation++; this.onHealth(false,this.stopped?'Disconnected':'OBS disconnected. Corrections are disabled.');
      this.scheduleReconnect();
    });
    this.socket.on('ConnectionError',()=>{});
    for(const event of ['InputNameChanged','InputRemoved','CurrentProgramSceneChanged','SceneCollectionChanged','InputMuteStateChanged','InputAudioMonitorTypeChanged','InputAudioTracksChanged'] as const) {
      this.socket.on(event as any,()=>{this.generation++;this.onInvalidate();});
    }
    this.socket.on('InputVolumeMeters',(data:any)=>{
      for(const input of data.inputs??[]) {
        const peak=Math.max(0,...(input.inputLevelsMul??[]).map((x:number[])=>x[0]??0));
        this.onLevel(input.inputUuid,peak);
      }
    });
  }
  private scheduleReconnect(){
    if(this.stopped||this.reconnectTimer)return;
    this.reconnectTimer=setTimeout(()=>{this.reconnectTimer=null;void this.connect(this.port,this.password).catch(()=>{});},Math.min(15_000,1000*2**this.tries++));
  }
  async connect(port:number,password:string) {
    if(!Number.isInteger(port)||port<1024||port>65535||!password) throw new Error('Enter the OBS port and authentication password.');
    this.stopped=false;this.port=port;this.password=password;
    if(this.reconnectTimer) clearTimeout(this.reconnectTimer);this.reconnectTimer=null;
    let authenticated=false;
    const hello=(value:any)=>{authenticated=!!value.authentication;};
    this.socket.once('Hello',hello);
    try {
      await this.socket.connect(`ws://127.0.0.1:${port}`,password,{rpcVersion:1,eventSubscriptions:1|2|4|8|64|65536});
      if(!authenticated){this.stopped=true;await this.socket.disconnect();throw new Error('Enable authentication in OBS WebSocket Server Settings.');}
      const v=await this.call('GetVersion');
      this.version=v.obsVersion;this.requests=new Set(v.availableRequests);
      if(!this.requests.has('GetInputMute')||!this.requests.has('SetInputMute')) throw new Error('OBS WebSocket lacks required microphone controls.');
      this.ready=true;this.generation++;this.tries=0;
      this.onHealth(true,`OBS ${this.version} · authenticated on this PC`);
    } catch(e) {
      this.ready=false;this.onHealth(false,'Cannot connect to authenticated OBS. Check its port, password, and server setting.');
      // A successful handshake followed by a failed capability read must not leave
      // an open but permanently unusable connection. Retry connection, never Set.
      await this.socket.disconnect().catch(()=>{});this.scheduleReconnect();
      throw e;
    }finally{this.socket.off('Hello',hello);}
  }
  async disconnect() {
    this.stopped=true;this.ready=false;this.password='';
    if(this.reconnectTimer) clearTimeout(this.reconnectTimer);this.reconnectTimer=null;
    if(this.timer) clearTimeout(this.timer);
    await this.socket.disconnect();this.onHealth(false,'Disconnected');
  }
  private async call(name:string,data:Record<string,unknown>={}) {
    let timeout:ReturnType<typeof setTimeout>;
    try {return await Promise.race([this.socket.call(name as any,data as any),new Promise<never>((_,reject)=>{timeout=setTimeout(()=>reject(new Error('OBS request timed out')),4000);})]) as any;}
    finally {clearTimeout(timeout!);}
  }
  async sources():Promise<Mic[]> {
    const r=await this.call('GetInputList');
    // Select capture inputs, not arbitrary desktop audio, browser sources, or scene groups.
    return r.inputs.filter((x:any)=>/wasapi_input_capture|coreaudio_input_capture|pulse_input_capture|alsa_input_capture/.test(x.unversionedInputKind??x.inputKind))
      .map((x:any)=>({uuid:x.inputUuid,name:x.inputName,kind:x.unversionedInputKind??x.inputKind}));
  }
  async inspect(selected:Mic):Promise<Observation> {
    if(!this.ready) throw new Error('OBS is disconnected.');
    const generation=this.generation;
    const sources=await this.sources(),mic=sources.find(x=>x.uuid===selected.uuid);
    if(!mic||mic.name!==selected.name) throw new Error('The microphone was renamed or removed. Select it again in Connections.');
    const target={inputUuid:mic.uuid};
    const [mute,monitor,tracks]=await Promise.all([
      this.call('GetInputMute',target),
      this.requests.has('GetInputAudioMonitorType')?this.call('GetInputAudioMonitorType',target):Promise.resolve({monitorType:null}),
      this.requests.has('GetInputAudioTracks')?this.call('GetInputAudioTracks',target):Promise.resolve({inputAudioTracks:{}}),
    ]);
    if(generation!==this.generation||!this.ready) throw new Error('OBS changed during inspection. Inspect again.');
    const major=Number(this.version.split('.')[0]);
    return {mic,muted:mute.inputMuted,monitor:monitor.monitorType as Monitor|null,
      tracks:Object.entries(tracks.inputAudioTracks).filter(([,v])=>v).map(([k])=>Number(k)),at:Date.now(),generation,
      legacyMonitor:major>=28&&major<33&&this.requests.has('SetInputAudioMonitorType'),obsVersion:this.version};
  }
  async apply(proposal:Proposal) {
    const observed=await this.inspect(proposal.observation.mic);
    if(Date.now()>proposal.expiresAt || observed.generation!==proposal.observation.generation || observed[proposal.field]!==proposal.before)
      throw new Error('The microphone changed or the review expired. Inspect and review again.');
    if(proposal.field==='muted') {
      if(proposal.before!==true||proposal.after!==false) throw new Error('Only an explicit unmute is permitted.');
      await this.call('SetInputMute',{inputUuid:observed.mic.uuid,inputMuted:false});
    } else {
      if(!observed.legacyMonitor || !['OBS_MONITORING_TYPE_NONE','OBS_MONITORING_TYPE_MONITOR_AND_OUTPUT'].includes(String(proposal.after)))
        throw new Error('This monitoring correction is not supported by the installed OBS version.');
      await this.call('SetInputAudioMonitorType',{inputUuid:observed.mic.uuid,monitorType:proposal.after});
    }
    try{return await this.inspect(proposal.observation.mic);}
    catch(e){
      // OBS can deliver its own mute-change event during the immediate readback.
      // Retry only the read after that generation change, never the setter.
      if(e instanceof Error&&e.message==='OBS changed during inspection. Inspect again.')return this.inspect(proposal.observation.mic);
      throw e;
    }
  }
}
