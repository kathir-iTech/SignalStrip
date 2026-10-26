import { randomBytes, randomUUID, createHmac } from 'node:crypto';
import { initialState, reduce, recover, parseChat, fresh, unknownChange, type Event } from '../src/core/engine';
import type { State, View, Settings, Command, Mic, Observation, Change, Mode } from '../src/core/types';
import { Storage, type Secrets, type TokenRecord } from './storage';
import { ObsAdapter } from './obs';
import { TwitchAuth, TwitchChat } from './twitch';
import { Overlay } from './overlay';

const words=['cedar','orbit','velvet','mango','harbor','tulip','cobalt','meadow','raven','pepper','silver','acorn','lantern','maple','comet','coral','willow','lemon','marble','river','canyon','olive','sunset','panda'];
const id=()=>randomUUID();
const rehearsalMic:Mic={uuid:'fixture-microphone',name:'Rehearsal microphone',kind:'fixture'};
export class Service {
  state:State=initialState();settings!:Settings;secrets!:Secrets;
  view:View={state:this.state,settings:null!,sources:[],proposal:null,privateWord:null,overlayUrl:'',device:null,busy:false,error:null,level:null,compact:false};
  obs=new ObsAdapter();auth:TwitchAuth;chat:TwitchChat;overlay=new Overlay();
  onView:(v:View)=>void=()=>{};
  private timer:ReturnType<typeof setInterval>|null=null;
  private levelAt=0;private pollAt=0;private inspecting=false;private applying=false;private fixtureMuted=true;
  private savedLive:State|null=null;private fixtureCounter=0;
  private retentionAt=0;
  constructor(readonly storage:Storage) {
    this.auth=new TwitchAuth(async token=>{this.secrets.twitch=token;await this.storage.saveSecrets(this.secrets);});
    this.chat=new TwitchChat(this.auth);
    this.auth.onDevice=device=>{this.view.device=device;this.publish();};
    this.auth.onInvalid=()=>{this.chat.stop();this.event({type:'connection',which:'twitch',health:'reauthorize',detail:'Authorization needs attention. Reconnect Twitch.',at:Date.now()});};
    this.chat.onHealth=(health,detail)=>{if(this.state.mode==='live'){this.state.login=this.auth.token?.login??'';this.event({type:'connection',which:'twitch',health,detail,at:Date.now()});}};
    this.chat.onEvent=(type,event,at)=>{if(this.state.mode==='live')this.chatEvent(type,event,at);};
    this.obs.onHealth=(ready,detail)=>{if(this.state.mode==='live')this.event({type:'connection',which:'obs',health:ready?'ready':'offline',detail,at:Date.now()});};
    this.obs.onInvalidate=()=>{if(this.state.mode==='live'){this.view.proposal=null;this.event({type:'observation',value:null});this.event({type:'invalidate',reason:'OBS source or scene changed; start a fresh check'});}};
    this.obs.onLevel=(uuid,level)=>{if(this.settings?.mic?.uuid===uuid&&this.state.mode==='live'){this.view.level=level;this.levelAt=Date.now();}};
  }
  async initialize() {
    this.settings=await this.storage.settings();this.secrets=await this.storage.secrets();
    if(!this.secrets.overlayKey)this.secrets.overlayKey=randomBytes(18).toString('hex');
    await this.storage.saveSecrets(this.secrets);
    try{this.state=recover(await this.storage.load(),Date.now(),this.settings.retentionDays);}catch(e){this.view.error=(e as Error).message;}
    try{this.view.overlayUrl=await this.overlay.start(this.secrets.overlayKey,()=>this.state);}catch{this.view.error='Soundcheck browser source could not start: port 17643 is in use. Close the other SignalStrip instance and restart.';}
    this.timer=setInterval(()=>{
      this.event({type:'tick',at:Date.now()},false);
      if(this.state.mode==='live'&&Date.now()-this.retentionAt>60_000){this.retentionAt=Date.now();void this.pruneHistory().catch(()=>{this.state.journalError='Could not update history retention. Check disk permissions.';});}
      if(this.state.incident?.check?.status!=='active')this.view.privateWord=null;
      if(Date.now()-this.levelAt>3000)this.view.level=null;
      if(this.state.mode==='live'&&this.obs.ready&&this.settings.mic&&!this.inspecting&&!this.applying&&Date.now()-this.pollAt>2500)
        void this.inspect(false).catch(()=>{});
      this.publish();
    },500);
    this.publish();
    if(this.secrets.twitch)void this.auth.resume(this.secrets.twitch).then(t=>{if(this.state.mode==='live'){this.state.login=t.login;this.chat.start();}}).catch(()=>{if(this.state.mode==='live')this.event({type:'connection',which:'twitch',health:'reauthorize',detail:'Reconnect Twitch to resume reading chat.',at:Date.now()});});
    if(this.secrets.obsPassword)void this.connectObs(this.settings.obsPort,this.secrets.obsPassword).catch(()=>{});
  }
  publish(){this.view.state=this.state;this.view.settings=this.settings;this.onView(structuredClone(this.view));}
  private event(e:Event,persist=true) {
    const before=this.state;this.state=reduce(this.state,e);
    if(e.type==='connection'&&e.health!=='ready'){this.view.proposal=null;this.view.privateWord=null;}
    if(e.type==='invalidate')this.view.privateWord=null;
    if(persist&&before!==this.state&&this.state.mode==='live'&&e.type!=='observation')
      void this.storage.record(this.state,e.type).catch(()=>{this.state.journalError='History is not being saved. Check disk space and folder permissions.';this.publish();});
    this.publish();
  }
  private account(raw:string){return createHmac('sha256',this.secrets.installKey).update(raw).digest('hex').slice(0,20);}
  private chatEvent(type:string,e:any,at:number) {
    if(type==='channel.chat.message'){
      const text=String(e.message?.text??'');
      const feedback=(detail:string)=>{this.view.chatFeedback={at:Date.now(),detail};this.publish();};
      const command=parseChat(text);
      if(!command){if(/^!signal\b/i.test(text))feedback('Incomplete report command. Use !signal audio.');else if(/^!heard\b/i.test(text))feedback('Reply format: !heard, current code, then the word heard.');return;}
      const messageId=e.source_message_id??e.message_id;
      const contribution={messageId,account:this.account(e.chatter_user_id),at,trusted:this.settings.trustedAccounts.includes(String(e.chatter_user_login).toLowerCase())};
      if(command.kind==='report')this.event({type:'report',id:id(),dedupe:`chat:${messageId}`,contribution});
      else {
        const check=this.state.incident?.check;
        if(!check||check.status!=='active'||Date.now()>=check.expiresAt){feedback('A reply arrived after the check ended. Start a fresh check.');return;}
        if(command.id!==check.id){feedback(`A reply used a different code. The current code is ${check.id}.`);return;}
        if(command.word!==this.view.privateWord){feedback('A reply used the current code, but its word did not match.');return;}
        this.event({type:'ack',checkId:command.id,dedupe:`chat:${messageId}`,contribution});
        feedback('A reply matched the current code and word.');
      }
    }else if(type==='channel.chat.message_delete')this.event({type:'withdraw',messageId:e.message_id});
    else if(type==='channel.chat.clear_user_messages')this.event({type:'withdraw',account:this.account(e.target_user_id)});
    else if(type==='channel.chat.clear')this.event({type:'withdraw',all:true});
  }
  private fixtureObservation():Observation {return {mic:rehearsalMic,muted:this.fixtureMuted,monitor:'OBS_MONITORING_TYPE_NONE',tracks:[1],at:Date.now(),generation:0,legacyMonitor:false,obsVersion:'33 (fixture)'};}
  async inspect(reconcile=true) {
    if(this.inspecting)return;this.inspecting=true;this.pollAt=Date.now();
    try{
      let observation:Observation;
      if(this.state.mode==='rehearsal')observation=this.fixtureObservation();
      else {if(!this.settings.mic)throw new Error('Choose your microphone in Connections.');observation=await this.obs.inspect(this.settings.mic);}
      this.event({type:'observation',value:observation},false);
      if(reconcile&&this.state.incident)for(const change of this.state.incident.changes){
        if(change.status==='unknown'&&change.mic.uuid===observation.mic.uuid)
          this.event({type:'change',value:{...change,status:observation[change.field]===change.after?'verified':'mismatch',note:'Current state reconciled by inspection; causation of an earlier unknown request is not proven.'}});
      }
    }catch(e){this.event({type:'observation',value:null},false);throw e;}finally{this.inspecting=false;}
  }
  private async connectObs(port:number,password:string){
    this.event({type:'connection',which:'obs',health:'connecting',detail:'Connecting to authenticated local OBS',at:Date.now()});
    await this.obs.connect(port,password);this.view.sources=await this.obs.sources();
    this.settings.obsPort=port;this.secrets.obsPassword=password;
    await this.storage.saveSecrets(this.secrets);await this.storage.saveSettings(this.settings);this.publish();
  }
  async command(c:Command) {
    this.view.error=null;
    try {
      if(this.applying&&c.type!=='compact')throw new Error('Wait for the microphone request to finish.');
      switch(c.type) {
        case 'mode': await this.mode(c.mode);break;
        case 'pause': this.event({type:'pause'});break;
        case 'quiet': this.event({type:'quiet'});break;
        case 'open':this.event({type:'open',id:id(),at:Date.now()});break;
        case 'inspect':this.view.proposal=null;await this.inspect();break;
        case 'propose':{
          if(!this.state.incident||unknownChange(this.state.incident))throw new Error('Open an incident and reconcile any unknown result first.');
          await this.inspect();const o=this.state.observation!;
          if(!fresh(this.state,Date.now()))throw new Error('Inspect a fresh microphone state first.');
          if(c.field==='muted'&&!o.muted)throw new Error('The selected microphone is already unmuted.');
          if(c.field==='monitor'&&(!o.legacyMonitor||o.monitor!=='OBS_MONITORING_TYPE_MONITOR_ONLY'))throw new Error('No supported output-mode correction is available.');
          this.view.proposal={id:id(),incidentId:this.state.incident.id,observation:o,field:c.field,before:o[c.field]!,after:c.field==='muted'?false:this.settings.intendedMonitor,expiresAt:Date.now()+15_000};break;
        }
        case 'cancel-proposal':this.view.proposal=null;break;
        case 'apply':await this.apply(c.id);break;
        case 'start-check':{
          if(!this.state.incident)throw new Error('Open an incident first.');
          if(this.state.twitch!=='ready')throw new Error('Connect chat before starting a soundcheck.');
          if(unknownChange(this.state.incident))throw new Error('Inspect and reconcile the unknown microphone result first.');
          const alphabet='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';const bytes=randomBytes(4);
          const code=[...bytes].map(x=>alphabet[x%alphabet.length]).join('');
          const word=words[randomBytes(1)[0]%words.length];
          this.event({type:'check',value:{id:code,startedAt:Date.now(),expiresAt:Date.now()+this.settings.duration*1000,status:'active',responses:[]}});
          this.view.privateWord=word;break;
        }
        case 'cancel-check':this.event({type:'invalidate',reason:'Creator ended this check'});break;
        case 'close':{
          const previous=this.state.incident;this.event({type:'close',outcome:c.outcome,at:Date.now()});
          if(previous&&this.state.incident)throw new Error('That outcome is not supported by the current evidence. Choose unresolved or inspect the pending result.');
          this.view.privateWord=null;this.view.proposal=null;break;
        }
        case 'reopen':this.event({type:'reopen',id:c.id,at:Date.now()});this.view.privateWord=null;this.view.proposal=null;break;
        case 'settings':{
          const next={...this.settings,...c.settings};
          if(![60,120,180].includes(next.duration)||![1,7,30].includes(next.retentionDays))throw new Error('Unsupported check duration or retention.');
          if(!['OBS_MONITORING_TYPE_NONE','OBS_MONITORING_TYPE_MONITOR_AND_OUTPUT'].includes(next.intendedMonitor))throw new Error('Choose an output-capable intended mode.');
          next.trustedAccounts=next.trustedAccounts.slice(0,20).map(x=>x.toLowerCase().replace(/[^a-z0-9_]/g,'')).filter(Boolean);
          // Connection and source identity only change through dedicated commands.
          next.mic=this.settings.mic;next.obsPort=this.settings.obsPort;
          this.settings=next;await this.storage.saveSettings(next);await this.pruneHistory();break;
        }
        case 'obs-connect':if(this.state.mode!=='live')throw new Error('Switch to Live connections first.');await this.obs.disconnect();await this.connectObs(c.port,c.password);break;
        case 'obs-disconnect':await this.obs.disconnect();delete this.secrets.obsPassword;await this.storage.saveSecrets(this.secrets);break;
        case 'select-mic':{
          if(this.state.mode!=='live')throw new Error('Switch to Live connections first.');
          this.view.sources=await this.obs.sources();const mic=this.view.sources.find(x=>x.uuid===c.uuid);if(!mic)throw new Error('Microphone no longer available.');
          this.settings.mic=mic;this.view.proposal=null;this.event({type:'invalidate',reason:'Selected microphone changed'});
          await this.storage.saveSettings(this.settings);await this.inspect();break;
        }
        case 'twitch-connect':{
          if(this.state.mode!=='live')throw new Error('Switch to Live connections first.');
          this.chat.stop();this.settings.clientId=c.clientId;await this.storage.saveSettings(this.settings);
          this.event({type:'connection',which:'twitch',health:'connecting',detail:'Approve the code in Twitch',at:Date.now()});
          void this.auth.authorize(c.clientId).then(t=>{if(this.state.mode==='live'){this.state.login=t.login;this.chat.start();}}).catch(e=>{if(this.state.mode==='live'){this.view.error=(e as Error).message;this.event({type:'connection',which:'twitch',health:'offline',detail:'Authorization not completed',at:Date.now()});}});break;
        }
        case 'twitch-disconnect':this.chat.stop();this.event({type:'connection',which:'twitch',health:'offline',detail:'Disconnected',at:Date.now()});await this.auth.forget();break;
        case 'clear-session':this.state.incident=null;this.view.privateWord=null;this.view.proposal=null;if(this.state.mode==='live'){await this.storage.clear();await this.storage.record(this.state,'session-cleared');}break;
        case 'clear-history':this.state.history=[];this.state.incident=null;this.view.privateWord=null;this.view.proposal=null;if(this.state.mode==='live')await this.storage.clear();break;
        case 'rehearsal':this.rehearsal(c.scenario);break;
        case 'compact':this.view.compact=!this.view.compact;break;
        default:break; // Shell-only actions are handled by the narrow main-process dispatcher.
      }
    }catch(e){this.view.error=e instanceof Error?e.message:'Operation could not be completed.';}
    this.publish();return structuredClone(this.view);
  }
  private async apply(proposalId:string) {
    const p=this.view.proposal;
    if(!p||p.id!==proposalId||p.incidentId!==this.state.incident?.id||Date.now()>p.expiresAt||unknownChange(this.state.incident))throw new Error('Review expired. Inspect the microphone and review again.');
    const change:Change={id:p.id,mic:p.observation.mic,field:p.field,before:p.before,after:p.after,at:Date.now(),status:'applying',note:'Creator approved this exact setting.'};
    this.applying=true;this.view.busy=true;this.view.proposal=null;
    this.event({type:'change',value:change});
    // Durable intent before actuation; failure means no write is attempted.
    try{
      if(this.state.mode==='live')await this.storage.record(this.state,'approved-intent');
    }catch{this.event({type:'change',value:{...change,status:'cancelled',note:'History unavailable. No OBS write was attempted.'}});this.applying=false;this.view.busy=false;throw new Error('Cannot save the action record. No correction was sent.');}
    try{
      let o:Observation;
      if(this.state.mode==='rehearsal'){this.fixtureMuted=false;o=this.fixtureObservation();}
      else o=await this.obs.apply(p);
      this.event({type:'observation',value:o},false);
      this.event({type:'change',value:{...change,status:o[p.field]===p.after?'verified':'mismatch',note:o[p.field]===p.after?'Requested value read back from OBS. Audience audio remains unconfirmed.':'Readback did not match the requested value.'}});
    }catch(error){
      const reason=error instanceof Error?error.message:'OBS did not confirm the request';
      this.event({type:'change',value:{...change,status:'unknown',note:`Request outcome unknown: ${reason}. Inspect to reconcile; the setter will not be retried automatically.`}});
      this.event({type:'observation',value:null},false);
    }finally{this.applying=false;this.view.busy=false;}
  }
  private async pruneHistory(){
    if(this.state.mode!=='live')return;
    const cutoff=Date.now()-this.settings.retentionDays*86_400_000;
    const kept=this.state.history.filter(x=>x.startedAt>=cutoff);
    if(kept.length!==this.state.history.length){this.state.history=kept;await this.storage.record(this.state,'retention');}
    await this.storage.pruneJournal(this.settings.retentionDays);
  }
  private async mode(mode:Mode) {
    if(mode===this.state.mode)return;
    if(mode==='rehearsal'){
      if(unknownChange(this.state.incident))throw new Error('Reconcile the pending OBS result first.');
      this.event({type:'invalidate',reason:'Entered rehearsal; start a fresh check on return'});
      this.savedLive=structuredClone(this.state);this.chat.stop();await this.obs.disconnect();
      this.state=initialState('rehearsal');this.state.obs='ready';this.state.twitch='ready';this.state.obsDetail='Simulated OBS';this.state.twitchDetail='Simulated chat';
      this.fixtureMuted=true;this.state.observation=this.fixtureObservation();
    }else{
      this.state=this.savedLive??initialState();this.state.obs='offline';this.state.twitch='offline';this.state.observation=null;
      if(this.auth.token)this.chat.start();
      if(this.secrets.obsPassword)void this.connectObs(this.settings.obsPort,this.secrets.obsPassword).catch(()=>{});
    }
    this.view.proposal=null;this.view.privateWord=null;this.view.level=null;this.publish();
  }
  private rehearsal(scenario:Extract<Command,{type:'rehearsal'}>['scenario']) {
    if(this.state.mode!=='rehearsal')throw new Error('Fixtures are available only in clearly labelled rehearsal mode.');
    const at=Date.now();const account='rehearsal-viewer';const messageId=`fixture-${++this.fixtureCounter}`;
    if(scenario==='report'||scenario==='dispute'||scenario==='duplicate'){
      const c={messageId:scenario==='duplicate'?'fixture-repeat':messageId,account:scenario==='dispute'?'another-rehearsal-viewer':account,at};
      this.event({type:'report',id:id(),dedupe:c.messageId,contribution:c});
    }else if(scenario==='reply'||scenario==='stale')this.event({type:'ack',checkId:scenario==='stale'?'ZZZZ':this.state.incident?.check?.id??'',dedupe:messageId,contribution:{messageId,account,at}});
    else if(scenario==='delete')this.event({type:'withdraw',all:true});
    else if(scenario==='gap'){
      this.event({type:'connection',which:'twitch',health:'gap',detail:'Rehearsal chat gap',at});
      this.event({type:'connection',which:'twitch',health:'ready',detail:'Simulated chat reconnected; start a fresh check',at});
    }else {this.fixtureMuted=scenario==='mute';this.event({type:'observation',value:this.fixtureObservation()},false);this.view.proposal=null;this.event({type:'invalidate',reason:'Rehearsal microphone changed'});}
  }
  async stop(){if(this.timer)clearInterval(this.timer);this.chat.stop();this.auth.stop();await this.obs.disconnect();await this.overlay.stop();await this.storage.flush();}
}
