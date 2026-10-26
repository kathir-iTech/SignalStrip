# Devpost draft — publication pending

## Project name

SignalStrip

## Tagline

Turn a Twitch audio report into a reviewed OBS correction and a fresh audience soundcheck.

## Inspiration

“We can’t hear you” is useful, but it does not identify the microphone setting or tell a creator whether a later “sounds good” refers to the current stream state. We wanted a short recovery interaction that keeps local observations and audience responses distinct.

## What it does

A Twitch viewer sends `!signal audio`. SignalStrip opens an incident and inspects one creator-selected OBS microphone. If the supported local state suggests a bounded correction, the creator reviews the exact source and value. The app rechecks, sends an explicit Set request, and reads back.

Then the creator starts a fresh soundcheck. A private word is spoken through the actual microphone, while an optional OBS card displays only a new public check code. Viewers return the code and word in Twitch chat. SignalStrip counts matching accounts for that check, preserves contrary reports, and keeps current responses, local-only correction, dismissal, and unresolved outcomes separate.

## How we built it with Codex

Codex assisted the implementation of the Electron/TypeScript desktop app, React creator surface, deterministic incident reducer, Twitch Public-client OAuth and EventSub adapter, OBS WebSocket adapter, protected local storage, loopback browser source, automated checks, and Windows packaging.

The build began with actual local capability checks. OBS 33's monitoring compatibility layer no longer represented the older Monitor Only output behavior, so the app disables that legacy correction on OBS 33+ and demonstrates the mute/readback path instead. A real readback timing issue exposed a generation change during inspection; the implementation retries only that read, never the setter.

Principal build chat ID from this Codex environment: **01a1761d-0799-7a62-b548-8411a217cf1d**. Confirm it through the event-instructed `/status` route before submitting. This is a session identifier, not a requirement to publish a private chat share link.

## Technologies

Electron 45, TypeScript 7, React 19, Vite 8, Twitch EventSub/OAuth, OBS WebSocket 5, Node 24, Vitest, Playwright, Windows safeStorage. No runtime AI, paid hosting, or viewer app is needed.

## What makes it different

The bounded contribution is the integrated report → selected-source inspection → creator-reviewed correction → fresh-word acknowledgment workflow. Audio monitoring, alerts, manual soundchecks, and chat-command tools already exist; we do not claim to have invented them or to verify every listener.

## What we learned and current limits

Local state is not delivered audio. Public chat replies can be copied. API compatibility needs actual installed-version checks. Unknown setter outcomes must be reconciled rather than retried. Rehearsal fixtures and real integrations must be labelled separately.

Use the final VERIFICATION.md for performed checks. No independent creator study or measured advantage over manual/simple-alert workflows has been completed. Do not add adoption, latency improvement, or broad audience-confirmation claims without new evidence.

## Required owner publication fields

- Repository URL: **pending owner publication**.
- Windows release/checksum URL: **pending owner publication**.
- YouTube video URL: **pending owner recording, editing, and publication**; under three minutes.
- Confirm build chat ID through `/status`.
- Keep repository/setup/package access usable through judging. No secrets or private setup/research files in the repository.
- Review name availability before public publication; SignalStrip remains the working product name.
- Submit on Devpost after the above are complete. No submission has been made by this build.

Official sources: [rules](https://twitchcon-codex.devpost.com/rules), [resources/FAQ](https://twitchcon-codex.devpost.com/resources). The recorded formal deadline is **2 November 2026, 14:00 Pacific / 3 November 2026, 03:30 IST**. Recheck the event page before final submission. Follow the formal Pacific time where the FAQ conversion differs.
