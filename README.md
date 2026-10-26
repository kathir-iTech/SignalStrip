# SignalStrip

Preparation repository for a proposed Windows OBS/Twitch microphone recovery companion.

Planned workflow: viewer audio report → inspect the creator-selected microphone → review a supported correction → run a fresh audience soundcheck → record an explicit outcome.

## Current state

Phase 2 preparation only. The application is not implemented and there are no application install/run commands yet. Production implementation, dependency selection, tests, and packaging belong to the next build phase.

The development environment has Node.js 24.18.1, npm, and Git available. Runtime dependencies will be selected and pinned when implementation starts.

## Intended boundaries

- Reports never automatically change OBS.
- A local setting change is separate from an audience acknowledgment.
- No paid runtime inference or cloud service is required by the proposed design.
- No claim of broad demand, delivery verification for all viewers, or measured performance is made.

## Local preparation

The machine-specific SETUP_STATUS.md is deliberately ignored by Git. Keep credentials, account access, private research, and OBS configuration outside tracked source files.

OBS 33.0 changed audio-monitoring APIs. The implementation must inspect the installed server's capabilities and verify behavior before offering monitoring corrections.
