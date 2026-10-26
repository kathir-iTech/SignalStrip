# Architecture and contracts

```
Twitch EventSub → scoped chat adapter → pure reducer → private creator renderer
                                          ↑                    │
Selected microphone → OBS observations ← reviewed action service
                                          │
                               local journal + snapshot
                                          │
                              sanitized public check card
```

`src/core/engine.ts` has no network/OBS effects. `electron/service.ts` owns reviewed actions, ephemeral words, and mode isolation. `electron/obs.ts` restricts connections to loopback, requires authentication, and checks source identity/capabilities. `electron/twitch.ts` owns OAuth/EventSub. `electron/storage.ts` serializes history and protected credentials. `electron/overlay.ts` projects an explicit public allowlist.

## Effect boundary

A review contains incident ID, source UUID/name, exact before/after values, observed connection generation, and expiry. The app re-inspects before Set and records durable intent first. This is best-effort freshness, **not atomic OBS compare-and-set**. External controllers can still race. Unknown results require readback; reconciliation establishes current state, not causation of an earlier ambiguous request.

Production corrections are explicit unmute and supported legacy Monitor Only restoration to a configured output-capable mode. OBS 33 maps old monitoring APIs to boolean local monitoring, so the legacy repair is disabled. Renderer IPC exposes no start-stream, recording, generic RPC, shell, or file-access method.

## Intake and recovery

Exact grammar, metadata/canonical-message dedupe, own source-channel filter, one report per account per 30 seconds, maximum 200 report entries, bounded dedupe cache. One active check, 60/120/180-second window, one current response per account. Arbitrary chat and wrong words are discarded before persistence.

Reports during a check remain contradictory evidence. Deletions withdraw matching contributions from open and retained closed records without undoing actual corrections or the historical creator decision. Unexpected disconnect invalidates checks; server-directed reconnect keeps the old socket until replacement welcome. New sockets resubscribe. Restart marks in-flight changes unknown and invalidates challenges; it never replays effects.

## Privacy and storage

Private words are memory-only. No audio recording occurs. The read-only card gets only active status, ID, expiration, rehearsal label, and instructions. It binds loopback, checks Host/Origin, uses an opaque path, and has a restrictive CSP. The private renderer is sandboxed, context-isolated, and lacks Node; validated IPC is narrow.

Electron 45 asynchronous safeStorage protects credentials. Rotations are persisted atomically. Account references use keyed per-install HMACs; exports omit them and source names. Serialized journal writes precede atomic snapshots. A reader tolerates a torn last journal line. Recovered snapshots contain state/history, not an effect queue.

Rehearsal disconnects live adapters and uses the same reducer with fixtures. Its UI/card are labelled; its history does not overwrite live history. Fixture commands are rejected in live mode.

References: [OBS 33 implementation](https://github.com/obsproject/obs-studio/blob/33.0.0/libobs/obs-source.c), [bundled WebSocket revision](https://github.com/obsproject/obs-websocket/tree/e28f84975984340e84fc4879cfc05741cc0afde1), [Twitch lifecycle](https://dev.twitch.tv/docs/eventsub/handling-websocket-events/), [Electron security](https://www.electronjs.org/docs/latest/tutorial/security), [safeStorage](https://www.electronjs.org/docs/latest/api/safe-storage).
