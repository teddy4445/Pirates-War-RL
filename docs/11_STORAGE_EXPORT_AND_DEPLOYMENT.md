# 11. Storage, transfer, static hosting, and offline use

Status: browser-only release design. Browser storage quotas/eviction differ by environment; consult [sources S08-S09](14_SOURCES.md). No file import/export in this app automatically synchronizes another browser.

## Storage repositories

Use IndexedDB behind typed repositories. Store lightweight preferences in localStorage only if needed; do not put models/replays there. Suggested stores: workspaces, agentDrafts, agentVersions, modelBlobs, challengeVersions, trainingRuns, checkpoints, tournamentPlans, matchResults, replayChunks, lessonProgress, and assetCacheMetadata.

Keys include stable IDs and schema versions. Immutable agent/challenge/model versions reference content hashes; mutable drafts have separate identities. Save results and their replay pointers atomically. Chunk large replay payloads and checkpoint progress at match boundaries. Maintain reverse references before deleting shared model blobs. A failed model import must roll back temporary entries.

Add versioned database migrations with fixtures from previous schemas. On a migration failure, preserve the old database and offer export/recovery rather than deleting everything. Avoid silently overwriting a newer version when two tabs are open. Use a single active tournament-owner lease and explicit conflict detection; a second tab should not also count the same matches.

Display `navigator.storage.estimate()` where available and offer persistent-storage requests as best-effort. Storage can still be cleared/evicted; it is not a backup. Quota failure must be handled during writes, not only predicted up front [S09]. Prompt for exports at meaningful checkpoints. The classroom retention policy is in [06](06_TIMING_DETERMINISM_AND_REPLAYS.md).

## Portable file formats

Agent export: source/model/manifest in a ZIP, or a single supported `.agent.json`. Training-run export: parameters, seeds, exact checkpoint metadata, real metrics, and selected model data. Tournament export: frozen roster/config/maps/seeds, result records, retained replays, checksums, and engine build identifier. Include a clear manifest and format version in every archive.

Imported archives are untrusted and use the same safe intake pipeline as individual agents. Do not execute embedded HTML/JS outside the agent runtime. Do not assume a result archive is authentic merely because hashes match its own supplied manifest. A result import is labeled as imported provenance.

The instructor can collect files through the institution's existing LMS/shared channel, download them, and bulk-import locally. The app itself does not connect to that service in version 1. A published static roster of opt-in student agents may be bundled at build time, but this is not a live submission portal. Do not expose private models/contact data publicly without permission.

## Static build/deployment

Students open a normal HTTPS site and need no local installation. Developers use Node/npm to build the app. Ship a production `dist/` with all required JavaScript, worker entrypoints, WASM files, baseline packages, and static assets. Use hash-based routes or document the host's rewrite rule. Do not require opening `index.html` by `file://`; workers/WASM/module loading must be tested on an actual HTTP(S) origin.

Serve runtime/model files from the application's own origin. Avoid mandatory CDN fonts, scripts, models, analytics, or sound. Code-split training/model frameworks so first play does not load every optional backend. Pin runtime dependency versions and include matching WASM files in the build; a JS/WASM mismatch is a release blocker. ONNX deployment has specific runtime-asset requirements if that adapter is later added [S06].

The implemented GitHub Pages route publishes `dist/` through `.github/workflows/deploy-pages.yml`. The Vite build uses relative asset URLs and hash routes so both `https://rl.teddylazebnik.com/` and the temporary `https://<owner>.github.io/<repository>/` project path work without host rewrite rules. `public/CNAME`, `.nojekyll`, and `404.html` are copied into the artifact. For an Actions deployment, the custom domain must also be configured in repository **Settings → Pages**; the DNS `rl` CNAME points directly to the owner's `<owner>.github.io` hostname. `npm run pages:check` validates the produced artifact before upload.

Start with a single-thread CPU compatibility path that does not require SharedArrayBuffer/cross-origin isolation. Accelerated providers/threads are optional capability checks. If a later path needs secure context or isolation headers, document them and retain a working baseline. Do not promise every static hosting provider supports arbitrary headers.

Define and browser-test a Content Security Policy. Allow only resources actually needed; distinguish WASM compilation requirements from dangerous host-JS `unsafe-eval`. Do not blindly paste a universal policy that blocks the selected runtime or enables unnecessary capabilities. Worker policy and host capability exposure require explicit review.

## Offline classroom preparation

Implement an optional service worker after core functionality is stable. Version the application shell/runtime cache. Precache the dependencies and assets required for the planned session; imported student models stay in IndexedDB. An offline badge should reflect an actual readiness check, including the engine and necessary WASM, not only a cached home page [S08].

Do not activate an incompatible service-worker/app update during a tournament. Offer to reload after exporting/finishing. Old replay engine versions need an explicit compatibility policy; a cache cleanup must not strand required classroom archives without warning.

Offline does not mean a browser can run after the operating system suspends it. Keep the class device awake with user-visible guidance; handle tab visibility and interruptions. Never rely on service workers to run an unlimited long tournament while the page is closed.

## Shared-online extension boundary

Out of scope for the first release: accounts, authentication, uploading to a common server, cross-device sync, matchmaking over the network, private cloud model hosting, and trustworthy public grading. These require additional infrastructure and privacy/security design. Keep repository/runner adapters ready for a future service, but do not invent a backend to complete the browser-only build.

Local instructor controls are organizational, not authorization. Anyone who owns their browser can alter local code/data. This is acceptable for practice and an instructor-operated class demonstration, but it must be stated clearly wherever results are exported for assessment.
