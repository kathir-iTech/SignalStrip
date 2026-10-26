# Dependency and asset inventory

All application source is under the included MIT license. The S/arrow mark, SVG, application icon, CSS layout, and inline UI icons were authored in this build. No stock imagery, remote fonts, model-generated pictures, or copied competitor assets are included. Typography uses the user's installed Windows fonts.

Direct pinned runtime dependencies: React 19.3.0, react-dom 19.3.0 (MIT), obs-websocket-js 5.0.8 (MIT). Desktop runtime: Electron 45.0.0 (MIT, including Chromium/Node and their notices). The portable distribution includes Electron's license files and Chromium third-party notices.

Development/build dependencies include TypeScript 7.0.2 (Apache-2.0), Vite 8.3.4 (MIT), Vitest 5.0.4 (MIT), Playwright 1.64.0 (Apache-2.0), esbuild 0.28.2 (MIT), electron-builder 26.18.0 (MIT), and TypeScript declaration packages. Exact transitive versions and registry integrity hashes are in package-lock.json. An installed-dependency license inventory is generated alongside release artifacts.

OBS is an external separately installed application, not bundled into SignalStrip. Twitch is an external service; its name identifies the integration, not endorsement. No OBS executable, private account data, or proprietary research archive is included in the source package.
