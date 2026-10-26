# Recording package — owner records and edits

Target edit: **2 minutes 45 seconds**, below the event's three-minute limit. Record complete real actions before shortening the edit. Do not imply that Twitch transport/video latency vanished.

## Before recording

- Use the released build. Confirm Twitch/OBS connected and the intended capture microphone selected.
- Choose an isolated OBS scene, with no personal desktop/email/password windows in the capture. Add the SignalStrip browser card at 1280 × 240.
- Keep the private creator window/answer word outside the Twitch output. It can appear in a separate explanatory recording after the challenge is over.
- Arrange a real viewer if demonstrating delivered audio. A broadcaster typing the visible word while offline is a **transport check**, not audience-playback proof.
- The owner chooses when to start/stop a stream or recording. SignalStrip has no start-stream/recording control.
- Deliberately mute the isolated test mic in OBS. Label this as an injected test fault; do not present it as an accidental live failure.
- Open the Codex build chat and relevant actual change/test output. Never fabricate prompts or a failure-to-fix montage.

## Capture list

| Clip | Actual controls and expected evidence |
|---|---|
| `01_real_report` | Viewer types **!signal audio** in Twitch. Recovery opens with a reporting account. |
| `02_review_and_readback` | **Inspect microphone → Review unmute → Unmute selected mic**. Show selected source and before/after values; then **Local value read back**. |
| `03_current_soundcheck` | **Ask for a soundcheck**. Creator says the private word through the mic. Public card shows code/instructions only. Viewer types **!heard CODE word**. Show the matching-account count and close **Current word returned**. |
| `04_limits` | Show local-only/unresolved outcomes. An old reply cannot count for a new check. Any fixture demonstration must display the Local rehearsal banner. |
| `05_codex_work` | Actual OBS 33 compatibility finding, implementation diff, and relevant verification output. Or the real readback-generation fix and its test. |
| `06_normal_use` | Compact mode above OBS; Connections and redacted History. |

If nobody can act as a listener, show the real offline-channel integration and explicitly label it **“Owner-account transport check; no audience playback claim.”** Do not change that caption to “verified audio.”

## Narration/caption draft

**00:00–00:15** — “A chat message says your audio is gone. OBS settings and audience replies are two different pieces of evidence. SignalStrip puts them in one recovery workflow.”

**00:15–00:35** — “Here, we deliberately muted the test microphone. A real Twitch `!signal audio` report opens this incident. SignalStrip inspects only the microphone I selected.”

**00:35–01:00** — “I review the exact source and change. The app re-reads before sending an explicit unmute, then reads the value back. A viewer message never changes OBS by itself.”

**01:00–01:25** — “Now I start a fresh soundcheck. The word stays on my private creator screen. The public card carries only a new code. A listener returns the word with that code.” Add the offline-test qualification if appropriate.

**01:25–01:45** — “Old replies and duplicates cannot confirm a new check. A chat gap invalidates it. Disagreeing reports stay visible. I can close with a local correction only, or leave the incident unresolved.”

**01:45–02:10** — “Codex built the desktop app, adapters, state machine, and tests. During implementation, we found OBS 33 had changed monitoring semantics, so the app disables the older output-mode repair on that version.” Show the real code/test evidence.

**02:10–02:30** — “It runs on this Windows PC, with protected credentials and no paid inference or viewer install. Compact mode keeps the current incident close to OBS.”

**02:30–02:45** — “This is evidence from local OBS and responding accounts—not a promise that every viewer hears perfectly. SignalStrip keeps the creator in control of each correction.” Show repo/build identifiers after publication.

## Final edit checks

English narration or captions; actual Twitch interaction and actual Codex work visible; under three minutes; no credentials, tokens, personal browser content, or live answer accidentally broadcast. Retain meaningful waiting/latency context when cutting. The event rules say publicly visible video, so plan public visibility when publishing. The owner uploads and submits.
