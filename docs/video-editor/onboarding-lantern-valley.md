# Lantern Valley onboarding example

The editor tour replays the completed Lantern Valley project without creating a runtime project or running a model. Its timeline starts empty and adds the live world, four Qwen reference frames, then the H3 result. The public homepage Light Study is a separate example.


A fresh **Try Astrid** visit opens the existing “Welcome to Astrid” tour before any Runtime connection or workspace discovery. The browser-only host uses the shared editor provider, in-memory timeline operations, public service hooks and the bundled Three.js renderer. Live workspace services, persistence and export are disabled. Both displayed source frames, the four stills and H3 video get browser-managed warmup hints (with best-effort image decoding); this does not guarantee a full download or decoded video before it is displayed.

Done, Skip and Escape all persist the same `connection` phase before unmounting the tour. The existing connection panel then explains that Runtime runs on your machine and offers the existing connection/install controls. Only after connection does the starter handoff discover the workspace, reuse an existing project, or create a real “My first project” with its canonical timeline. It opens that saved selection without another automatic tour. Failed setup offers Retry and Open editor; no temporary browser ID is presented as a saved project. Settings keeps explicit tour replay and appearance preferences.

Browser progress lives in `astrid:welcome-v1` (`tour`, `connection`, `complete`). Reload during the tour restarts the demo; reload after Skip/Done resumes connection. Starting the demo does not mark it completed or write a Runtime tour record. Existing connected/setup/tour/last-project flags bypass new welcome, and project/timeline deep links always keep their destination. Installer `?connect=1` resumes connection. Starter creation uses the durable pending intent in `astrid:onboarding:pending-project-v1`, stable Runtime idempotency keys and discovery on retry, so an unknown response or partial timeline creation can recover without another project. The obsolete brightness/text-case setup wizard and editor auto-start trigger are retired.

The portable release is `public/astrid/onboarding/lantern-valley-14s-v1/`. It contains eleven immutable files named by SHA-256: the self-contained prepared world, four source captures, four Qwen PNGs, the motion-guide MP4, and the native H3 MP4. `manifest.json` records sizes, digests and media dimensions. The source manifest at `src/tools/video-editor/tour/asset-manifest.json` must match it. The ordinary app build copies these public files into `dist`; deployment uses the app's existing same-origin static hosting. No external bucket, workspace media endpoint, signed URL, provider credential or local filesystem path is required.

The live world covers source time 2.5–16.5 seconds. The guide is exactly 14 seconds at 1280×720, 30 fps. The Qwen frames are 1376×768 and were generated through WaveSpeed. Their capture times are 0, 6.5, 10 and 419/30 (13.9667) seconds; their one-second timeline placements start at 0, 6.5, 10 and 13. The fourth image is the corrected natural-town version, with digest `e2f106ce2e53434487e24da748ddac7eb28aee43afe2b6f768efbd901622d31f`. H3's native 1344×768, 24 fps output lasts 14.375 seconds; the tour trims it to 14 seconds and mutes it. Card previews stop at 14 seconds and hold their final frame. After the stills land, the timeline pauses and visits all four anchors for 1.2 seconds each, holding the town frame afterward. Leaving or skipping that presentation cancels further seeks.

The loader checks the world package's complete size and digest before the existing prepared-world importer checks its HTML entry. Each browser session imports it into fresh in-memory object identities; no original runtime object, project, actor or generation identity is copied. A failed download or integrity check exposes a Retry demo button. Stage 1 stays paused until the actual preview iframe acknowledges the opening source time (2.5 seconds) for the current world revision. Hidden warm-ups and thumbnails cannot release playback, and a slow first frame shows preparation/restart controls instead of advancing the camera after a timeout. Skipping the animation can advance the card but never autoplays an unready world. Tour changes remain in memory and are discarded when the tour ends.

Verify the source assets and production output:

```sh
node scripts/onboarding/verify-assets.mjs public
npm run build:hosted
node scripts/onboarding/verify-assets.mjs dist
npx vitest run --config config/testing/vitest.config.ts src/tools/video-editor/tour src/app src/tools/video-editor/pages
```

After publishing the app, verify anonymous downloads against the deployment:

```sh
node scripts/onboarding/verify-assets.mjs https://astrid.haus/
```

Keep these hashed files immutable. Publish a new version directory and update both manifests when replacing the example. The verifier confirms every distributed byte, source/distributed manifest agreement, and the absence of machine-specific paths or remote script dependencies in the portable world. Tests also cover staged timeline construction, real prepared-world import into empty storage, per-session identity, corruption rejection, and visible retry recovery.
