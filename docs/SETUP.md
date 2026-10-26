# Setup, troubleshooting, removal

Tested environment: Windows 11 x64, OBS 33.0.0 / bundled WebSocket 5.7.6. Select an actual microphone capture source; a browser-generated tone tests a different audio path. Twitch chat transport can be tested while the channel is offline.

## Twitch

The build includes the owner's public application Client ID. A Client ID is not a secret. Other creators can register their own application; shared-client distribution at large scale has not been load-tested.

At https://dev.twitch.tv/console/apps, create a unique name, **Client Type Public**, category **Application Integration**. If registration requires a redirect placeholder, use **https://localhost:3000** as the sole nonempty entry. The device flow does not use that redirect; no certificate/listener is needed. Remove accidental empty URL rows. Do not create or paste a client secret.

In **Connections**, enter the Client ID, click **Connect Twitch**, then **Open Twitch activation**. Sign in as the broadcaster and approve read-chat permission. SignalStrip validates the account and subscribes to message/delete/room-clear/user-clear events using that broadcaster/reader ID. If the device code expires, reconnect.

**Disconnect & forget** removes local credentials and requests Twitch revocation. If remote revocation is unconfirmed, remove the app from Twitch Connections. Saved grants are revalidated; active sessions are periodically validated. Refresh is serialized and replacement tokens are saved before reuse.

References: [device authorization](https://dev.twitch.tv/docs/authentication/getting-tokens-oauth/#device-code-grant-flow), [EventSub types](https://dev.twitch.tv/docs/eventsub/eventsub-subscription-types/).

## OBS and network access

Open OBS **Tools → WebSocket Server Settings**. Enable the server, retain authentication, and use its generated password. SignalStrip only connects to `127.0.0.1` and rejects unauthenticated listeners.

OBS may listen across interfaces. Keep Windows Firewall enabled and restrict incoming remote access to the specific OBS executable/control port. The supplied script blocks non-loopback incoming traffic for that program and port on all profiles. It does not open ports or change outbound streaming/default policies. Review and run it from Administrator PowerShell if needed:

```powershell
& .\scripts\Protect-ObsLocal.ps1 -ObsExecutable 'C:\Path\To\OBS\bin\64bit\obs64.exe' -Port 4455
```

The leading `&` runs a quoted PowerShell path. “Rule already exists” means inspect that rule rather than repeat the script. Do not substitute a broad allow-on-all-networks exception. On the development PC the exact rule was read back, while the actual OBS listener was `0.0.0.0:4455`. This is firewall containment, not loopback binding. A second-host reachability test has not been performed.

Enter port/password in SignalStrip, click **Connect OBS**, and select the capture microphone. UUID and name are checked before writes. Renamed/deleted sources require reselection; scene/source changes invalidate stale observations.

## Public card

Copy the URL under **Public soundcheck card**. Add an OBS **Browser Source**, paste the URL, set **1280 × 240**, and position it on the scene. It stays transparent outside active checks. The URL is stable for this installation; port 17643 listens only on this PC. The card contains instructions and a check code, never the answer word or control capability.

Keep the private SignalStrip window out of desktop captures. Say the word through the actual microphone; the card emits no substitute test audio.

## Troubleshooting

| Symptom | Action |
|---|---|
| `!signal` does nothing | Use the full command `!signal audio`. |
| OBS connection fails | Check server enabled, authentication enabled, matching port/password, and OBS running. |
| Source renamed/removed | Reselect it in Connections. |
| Review expired | Inspect and review again; approval lasts 15 seconds. |
| Unknown request result | Inspect to reconcile current state. No automatic retry occurs. |
| Chat gap | Wait for reconnect, then start a fresh check. Lost Twitch messages are not replayed. |
| No matching replies | Keep audience unconfirmed; allow longer delays or close unresolved. |
| Monitor repair absent on OBS 33 | Expected: old Monitor Only semantics were removed. |
| Card blank | Expected when no check is active. Otherwise check URL, app running, and port availability. |
| History not saving | Check disk space and permissions. A correction is not sent if its intent cannot be saved. |

## Storage and removal

Extract the ZIP into a writable folder outside the source project's `release` build directory. The packaged app keeps private files in `SignalStripData` beside `SignalStrip.exe`. This folder is created on first launch and is absent from the release ZIP. Do not share it. The source build uses Electron's per-user `signalstrip` AppData directory, or the absolute `SIGNALSTRIP_DATA_DIR` developer override. Verification uses isolated work/temp directories. Do not copy private verification data into a public release.

Disconnect and forget Twitch/OBS, clear history, close the app, then remove its extracted folder, including `SignalStripData`. Remove the OBS Browser Source separately. Protected storage is tied to the Windows account; moving the app to a different account requires reconnecting. It does not protect against malware already running as that user.

Inspect/remove only the optional firewall rule named `SignalStrip-OBS-LocalOnly-4455` if no longer needed. Removing the app does not disable OBS's server; disable that separately if no other tool needs it.
