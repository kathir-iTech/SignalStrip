# Review SignalStrip

Start with the README and run its two-minute rehearsal. No paid service, hosted backend, Twitch permission, or OBS installation is needed for that path. The rehearsal visibly labels its simulated inputs.

Expected sequence: viewer report opens an incident → review shows exact selected source and before/after values → explicit approval produces local readback → fresh check appears → current fixture reply increments the counter → explicit closure appears in History.

For one useful failure case, start another check, press **Send old reply**, and observe that it does not count. A code remains stable while active unless its replacement is explicitly confirmed. These controls are below the recovery panels; scroll to the rehearsal section.

For actual integrations, use SETUP.md. Authorize your own broadcaster account with read-chat permission, connect authenticated local OBS, select a microphone, and send `!signal audio` from channel chat. Keep the private creator window outside broadcast capture. A local mute correction is not proof of delivered audio.

The final standalone Windows executable was blocked on the development PC; the README source launch is the primary review path. See VERIFICATION.md for the full evidence scope. No independent listener trial has passed yet.

Source map: src/core/engine.ts (pure transitions), electron/service.ts (review and effects), electron/obs.ts (selected-source inspection), electron/twitch.ts (OAuth/EventSub), electron/overlay.ts (public projection), tests/ (behavior and boundary cases).
