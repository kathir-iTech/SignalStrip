export type Mode = 'live' | 'rehearsal';
export type Health = 'offline' | 'connecting' | 'ready' | 'gap' | 'reauthorize';
export type Monitor = 'OBS_MONITORING_TYPE_NONE' | 'OBS_MONITORING_TYPE_MONITOR_ONLY' | 'OBS_MONITORING_TYPE_MONITOR_AND_OUTPUT';
export type Outcome = 'audience-returned' | 'local-only' | 'dismissed' | 'unresolved';
export interface Mic { uuid: string; name: string; kind: string }
export interface Observation {
  mic: Mic; muted: boolean; monitor: Monitor | null; tracks: number[];
  at: number; generation: number; legacyMonitor: boolean; obsVersion: string;
}
export interface Contribution { messageId: string; account: string; at: number; withdrawn?: boolean; trusted?: boolean }
export interface Change {
  id: string; mic: Mic; field: 'muted' | 'monitor'; before: boolean | Monitor; after: boolean | Monitor;
  at: number; status: 'applying' | 'verified' | 'unknown' | 'mismatch' | 'cancelled'; note: string;
}
export interface Check {
  id: string; startedAt: number; expiresAt: number; status: 'active' | 'expired' | 'invalidated';
  responses: Contribution[]; invalidReason?: string;
}
export interface Incident {
  id: string; startedAt: number; mode: Mode; reports: Contribution[]; changes: Change[];
  check: Check | null; endedAt?: number; outcome?: Outcome; interrupted?: boolean;
  suppressed: number; evidenceWithdrawn?: boolean;
}
export interface State {
  mode: Mode; now: number; paused: boolean; quiet: boolean;
  twitch: Health; obs: Health; twitchDetail: string; obsDetail: string;
  login: string; observation: Observation | null; incident: Incident | null;
  history: Incident[]; seen: string[]; journalError: string | null;
}
export interface Proposal {
  id: string; incidentId: string; observation: Observation; field: Change['field'];
  before: Change['before']; after: Change['after']; expiresAt: number;
}
export interface Settings {
  clientId: string; obsPort: number; mic: Mic | null; intendedMonitor: Monitor;
  duration: number; retentionDays: number; trustedAccounts: string[];
}
export interface View {
  state: State; settings: Settings; sources: Mic[]; proposal: Proposal | null;
  privateWord: string | null; overlayUrl: string; device: {code: string; url: string; expiresAt: number} | null;
  busy: boolean; error: string | null; level: number | null; compact: boolean;
  chatFeedback?: {at:number; detail:string};
}
export type Command =
  | { type: 'mode'; mode: Mode } | {type:'pause'} | {type:'quiet'} | {type:'open'}
  | {type:'inspect'} | {type:'propose'; field: Change['field']} | {type:'apply'; id:string}
  | {type:'cancel-proposal'} | {type:'start-check'} | {type:'cancel-check'}
  | {type:'close'; outcome:Outcome} | {type:'reopen'; id:string}
  | {type:'settings'; settings:Partial<Settings>}
  | {type:'obs-connect'; port:number; password:string} | {type:'obs-disconnect'}
  | {type:'select-mic'; uuid:string} | {type:'twitch-connect'; clientId:string}
  | {type:'twitch-disconnect'} | {type:'auth-open'} | {type:'compact'}
  | {type:'copy-overlay'} | {type:'export'} | {type:'clear-history'} | {type:'clear-session'}
  | {type:'rehearsal'; scenario:'report'|'reply'|'dispute'|'stale'|'duplicate'|'delete'|'gap'|'mute'|'normal'};
export interface DesktopAPI { getView():Promise<View>; command(command:Command):Promise<View>; subscribe(cb:(view:View)=>void):()=>void }
