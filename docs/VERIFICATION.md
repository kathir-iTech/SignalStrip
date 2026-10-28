# Verification record — 26 October 2026

Submission review, 28 October: all 34 tests, TypeScript checking and production build passed again. The README was rendered with GitHub's Markdown API and checked locally at desktop and phone widths; both images loaded and neither viewport overflowed. A real screen capture of the app's labelled local rehearsal was produced for production planning. No new real Twitch interaction, audience playback, or final standalone launch is claimed by that capture.

Story: a real Twitch audio report opens a private incident, the creator reviews a selected-microphone correction, OBS returns its current value, and a separate fresh-word chat reply can support an audience-side outcome.

## Completed engineering checks

- **34 automated tests passed** across the reducer, IPC/storage/auth boundaries, OBS adapter, EventSub lifecycle, and full chat-text matching service. Network/OBS behaviors in these tests use labelled fixtures.
- TypeScript checking and Vite/Electron production compilation passed.
- **Earlier packaged Windows build passed** startup, renderer isolation check, fixture report/review/readback, active-code protection, public card endpoint, matching fixture response, closure, and History. See package-smoke-result.json (12:57:20.501 UTC). That run preceded the final OBS reconnect fix.
- **Final standalone launch blocked on the development PC:** Windows returned “An Application Control policy has blocked this file.” The final ZIP is built, but its launch cannot be claimed verified. No security policy was disabled. The documented source launch remains the local alternative; the owner launcher points to that path.
- **Final source launch connected to real Twitch and OBS at 13:22:22.131 UTC:** both adapters ready, expected broadcaster identity, selected mic observed muted, no active check, and no app error. Protected credentials were reused. The isolated OBS Browser Source was also configured and its URL/dimensions read back (1280 × 240); no stream or recording was active.
- Source desktop rehearsal passed: isolated renderer, reviewed correction, private challenge, rejection of old replies, protected public projection, explicit closure, history, and compact mode. No renderer errors were observed. Software rendering was used for screenshot capture after the hardware capture path returned `UnknownVizError`.
- Runtime dependency audit reported zero vulnerabilities at the recorded check. This is a dependency database result, not a security certification.

Machine-readable UI/package results are stored beside this document when their checks complete. Screenshots show labelled local rehearsal, not audience validation.

## Actual connected system observations

| Boundary | Observed result |
|---|---|
| Twitch authorization | Owner approved Public-client device flow with only `user:read:chat`. Broadcaster identity validated. |
| Chat transport | Real owner messages reached EventSub on the offline channel. Phase 3 `!signal audio` opened an incident at 10:13:52.072 UTC. |
| Local correction | Review and explicit unmute ran against the isolated test microphone; actual OBS readback was unmuted/verified at 10:13:55.891 UTC. |
| OBS capabilities | Installed OBS 33.0.0 / WebSocket 5.7.6 authenticated successfully. Legacy monitoring repair is disabled on OBS 33. |
| Containment | Exact program/port remote-block firewall rule was read back; all firewall profiles enabled. OBS listened on 0.0.0.0, so this is firewall containment, not loopback binding. |
| Real current-word response | **Not verified.** The initial check expired; later manual attempts became confusing as codes changed. No matching real response was observed. |
| Delivered broadcast audio | **Not tested.** No stream or recording was started. |

The real report/correction evidence is positive. The complete real report→correction→listener confirmation loop remains incomplete. Earlier negative results were retained in private build records, not overwritten with fixture successes.

## Issues found and addressed

1. OBS 33 changed monitoring semantics: disable the legacy output-mode repair on this version.
2. A late OBS event could invalidate immediate readback: retry that read once, never repeat the setter automatically. Unknown results remain explicit and require reconciliation.
3. Restarting a check replaced the code too easily: keep the active primary button disabled and require explicit confirmation to replace it. Explain stale-code, expired, and mismatched replies without saving arbitrary chat text or the answer.
4. Disconnect during refresh validation could restore forgotten credentials: guard async completion against authorization changes; regression test passed.
5. This machine's AppData atomic rename returned EXDEV: the portable release now keeps encrypted state in a separate writable folder beside its executable. No non-atomic credential-write fallback was introduced.
6. The self-extracting packager failed while staging its elevation helper: distribute a portable ZIP containing the executable and runtime files instead.
7. A failed OBS capability read could leave a handshaken socket permanently unusable: close that connection and schedule a bounded-backoff reconnect. A regression test confirms reconnection without sending a setter.

## Not established

No outside-creator trial, independent listener demonstration, measured baseline advantage, large shared-client load, real-account revocation exercise, older-installed-OBS monitoring repair, or second-host network reachability test. See LIMITATIONS.md and BASELINE_PROTOCOL.md. Do not describe fixture counters as real listeners or local readback as delivered audio.
