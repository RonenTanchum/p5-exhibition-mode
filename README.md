# p5 Exhibition Mode

Gallery-ready runtime controls for p5.js artworks.

`p5-exhibition-mode` is a lightweight utility for running p5.js sketches as stable fullscreen artworks in galleries, museums, fairs, and public installations.

It handles the practical details artists usually rebuild for every show: fullscreen state, touch gesture suppression, context-menu blocking, cursor hiding, idle reset, pixel ratio control, direct canvas capture, playlisted artwork URLs, hash rotation, artwork URL parameters, overlays, and a discreet diagnostics panel.

## Why

Generative artworks often behave well in the studio and fail under exhibition conditions: accidental right-clicks, browser gestures, scroll bounce, oversized device pixel ratios, lost fullscreen state, and no quick way to inspect runtime health.

This library adds a small production layer around the sketch without changing the artwork.

## Features

- Fullscreen artwork mode
- Disable right-click / context menu
- Disable touch gestures, pinch zoom, scroll bounce, and browser callouts
- Hide cursor after idle
- Lock maximum device pixel ratio
- Optional idle reset
- FPS, resolution, fullscreen, uptime, reload, and memory diagnostics
- Still capture and direct canvas recording
- Hidden runtime panel
- Runtime toggles for touch locks, context menu locks, cursor hiding, playlist mode, artwork URL params, and random hash URLs
- Floating title, free text, hash, and QR overlays with automatic stacking when they share a position
- Optional small hash overlay with black/white color, bottom-left/bottom-right placement, size, and safe-area controls
- 0 / 90 CW / 90 CCW / 180 rotation for vertical displays and rotated projectors
- Rotation-triggered artwork refresh for sketches and playlist iframes
- Playlist editor inside the runtime panel for local HTML paths and web URLs
- Separate artwork and hash playlists, each with loop/random order
- Custom artwork URL params, for example `ui=false`, applied before the generated hash
- Browser H.264 MP4 where supported, with WebM fallback and local FFmpeg conversion helpers
- Code-only API for driving every runtime control without the panel
- Basic watchdog, dropped-frame logging, and optional remote health checks
- Sensor bridge for manual values, JSON polling, and WebSocket inputs
- Technical rider template and artwork manifest schema
- Small ES module with no runtime dependencies

## Install

```bash
npm install p5-exhibition-mode
```

For local development before publishing:

```js
import { createExhibitionMode } from "./src/index.js";
```

## Local Helper Server

For browser security reasons, a webpage cannot read the real path returned by the operating-system file picker. For production kiosk setups, run the included helper server from the folder that contains your sketches and type served paths into the playlist:

```bash
npx p5-exhibition-helper --root /Users/you/Artworks --port 4177
```

Then open:

```txt
http://127.0.0.1:4177/
```

The helper serves that folder, so playlist entries can use stable paths such as:

```txt
./ClassicalRevival/index.html
```

Without the helper server, use **Temp HTML** for temporary preview. A single HTML file works only when it is self-contained or uses absolute asset URLs.

## Basic Usage

```js
import { createExhibitionMode } from "p5-exhibition-mode";

const exhibition = createExhibitionMode({
  title: "Bloom Study",
  artist: "Phenomena Labs",
  year: "2026",
  showTitleOverlay: false,
  titleOverlayFont: "mono",
  titleOverlayColor: "white",
  titleOverlayPosition: "top-left",
  titleOverlaySize: 11,
  titleOverlayBold: false,
  titleOverlayItalic: false,
  freeText: "",
  showFreeText: false,
  freeTextPosition: "bottom-left",
  freeTextSize: 10,
  showHashOverlay: false,
  hashOverlayPosition: "bottom-left",
  hashOverlaySafeArea: 18,
  hashOverlaySize: 9,
  hashOverlayColor: "white",
  overlayLayout: "separate",
  cardQrPlacement: "below",
  overlaySafeArea: 18,
  qrLink: "",
  showQr: false,
  qrPosition: "bottom-right",
  qrSize: 96,
  seed: 1842,
  fullscreen: true,
  kiosk: true,
  disableContextMenu: true,
  disableTouchGestures: true,
  hideCursor: false,
  hideCursorMode: "always",
  maxPixelRatio: 2,
  rotation: 0,
  refreshOnRotation: true,
  localFiles: {
    endpoint: "/__p5em/files",
    absolutePrefix: "/__p5em/abs/",
    urlMirrorRoot: "",
    fallbackFilePreview: true
  },
  customUrlParams: [
    { name: "ui", value: "false" }
  ],
  watchdog: {
    enabled: true,
    minFps: 12,
    seconds: 30,
    reload: true
  },
  playlist: {
    enabled: false,
    itemOrder: "loop",
    intervalValue: 2,
    intervalUnit: "minutes",
    intervalSeconds: 120,
    hashes: [],
    hashOrder: "loop",
    hashIntervalValue: 2,
    hashIntervalUnit: "minutes",
    hashIntervalSeconds: 120,
    randomHash: true,
    hashParam: "hash",
    items: [
      "https://art.phenomenalabs.com/ClassicalRevival/index.html",
      "https://art.phenomenalabs.com/Rococo/index.html"
    ]
  },
  monitor: true
});

function setup() {
  exhibition.setup();
  exhibition.applyPixelRatio();
  createCanvas(windowWidth, windowHeight);
}

function draw() {
  exhibition.tick();
  background(0);
}
```

Press `Shift + G` to open the diagnostics panel.

## Code-Only Runtime Control

Every panel control is also available through the API, so high-end installation builds can run with `panel: false` and drive the runtime from their own control surface, OSC bridge, venue config loader, or remote admin tool.

```js
const exhibition = createExhibitionMode({
  panel: false,
  fullscreen: true,
  kiosk: true,
  rotation: 90,
  persist: true,
  storageKey: "gallery-a-main-wall",
  playlist: {
    enabled: true,
    intervalValue: 12,
    intervalUnit: "minutes",
    hashIntervalValue: 45,
    hashIntervalUnit: "seconds",
    randomHash: true,
    items: [
      "./works/classical-revival/index.html",
      "https://art.phenomenalabs.com/Rococo/index.html"
    ]
  }
});

exhibition
  .setup()
  .setInputLocks({ contextMenu: true, touchGestures: true, scroll: true })
  .setCursor({ hide: true, mode: "idle", idleMs: 3000 })
  .setWatchdog({ enabled: true, minFps: 12, seconds: 30, reload: true })
  .setHealthCheck({ enabled: true, url: "/runtime-health", intervalSeconds: 60 });

// Later, from your own UI / socket / venue scheduler:
exhibition.setRotation(270);
exhibition.setArtworkMetadata({
  title: "Classical Revival",
  artist: "Ronen Tanchum",
  year: "2026",
  showTitleOverlay: true,
  titleOverlayFont: "editorial",
  titleOverlayColor: "gray",
  titleOverlayPosition: "top-left",
  titleOverlaySize: 16,
  titleOverlayBold: true,
  titleOverlayItalic: false,
  freeText: "Live generative study\nCustom edition for the south wall.",
  showFreeText: true,
  freeTextPosition: "top-left",
  freeTextSize: 11,
  showHashOverlay: true,
  hashOverlayPosition: "bottom-left",
  hashOverlayColor: "white",
  overlayLayout: "card",
  cardQrPlacement: "below",
  overlaySafeArea: 32
});
exhibition.setQrOptions({
  qrLink: "https://example.com/project",
  showQr: true,
  qrPosition: "bottom-right",
  qrSize: 112
});
exhibition.startHashRecording();
exhibition.setPlaylistIntervalParts(20, "minutes");
exhibition.setPlaylistHashIntervalParts(30, "seconds");
exhibition.setPlaylistOptions({ randomHash: true });
exhibition.setCustomUrlParams([{ name: "ui", value: "false" }]);
exhibition.saveConfig();
```

Useful methods:

- `setFullscreen(value)`, `enterFullscreen()`, `exitFullscreen()`
- `setKiosk(value)`
- `setInputLocks({ contextMenu, touchGestures, scroll })`
- `setCursor({ hide, mode, idleMs })`
- `setRotation(degrees)`
- `setAccessibility({ reducedMotion, highContrast })`
- `setArtworkMetadata({ title, artist, year, showTitleOverlay, titleOverlayFont, titleOverlayColor, titleOverlayPosition, titleOverlaySize, titleOverlayBold, titleOverlayItalic, freeText, showFreeText, freeTextPosition, freeTextSize, showHashOverlay, hashOverlayPosition, hashOverlaySafeArea, hashOverlaySize, hashOverlayColor, overlayLayout, cardQrPlacement, overlaySafeArea })`
- `setQrOptions({ qrLink, showQr, qrPosition, qrSize, cardQrPlacement, overlaySafeArea })`
- `setOverlayLayout("separate" | "card")`
- `setOverlaySafeArea(pixels)`
- `startHashRecording()`, `stopHashRecording()`, `clearHashRecording()`, `exportHashRecording()`
- `setWatchdog(options)` and `setHealthCheck(options)`
- `setPlaylistOptions(options)`, `setPlaylistItems(items)`, `setPlaylistHashes(hashes)`, `setCustomUrlParams(params)`, `togglePlaylist(value)`
- `setPlaylistIntervalParts(value, unit)` and `setPlaylistHashIntervalParts(value, unit)`
- `nextPlaylistItem()`, `previousPlaylistItem()`, `previewPlaylistUrl(url)`, `loadLocalFolderPlaylist()`
- `getConfig()`, `loadConfig(config)`, `saveConfig()`, `exportConfig()`
- `localFiles.endpoint` can point at a helper endpoint such as `/__p5em/files`
- `localFiles.absolutePrefix` maps absolute local paths through the helper, for example `/Users/me/art/index.html` becomes `/__p5em/abs/Users/me/art/index.html`

QR codes are generated as image URLs through `qrProvider` by default. Override `qrProvider` if you want to route QR generation through your own local/offline service.

## Playlist Mode

Playlist mode can rotate local sketch pages or live artwork URLs inside a managed fullscreen iframe.

```js
const exhibition = createExhibitionMode({
  playlist: {
    enabled: true,
    itemOrder: "loop",
    intervalValue: 3,
    intervalUnit: "minutes",
    intervalSeconds: 180,
    hashes: [
      "0x1111111111111111111111111111111111111111111111111111111111111111",
      "0x2222222222222222222222222222222222222222222222222222222222222222"
    ],
    hashOrder: "loop",
    hashIntervalValue: 30,
    hashIntervalUnit: "seconds",
    hashIntervalSeconds: 30,
    randomHash: false,
    hashParam: "hash",
    items: [
      "./works/apex-rotation/index.html",
      "https://art.phenomenalabs.com/ClassicalRevival/index.html"
    ]
  }
});
```

Artwork URLs/local paths and hashes are separate lists. `itemOrder` controls the artwork list order, and `hashOrder` controls the specific hash list order; both support `loop` and `random`. When `randomHash` is enabled, it always generates a fresh 256-bit `0x...` value and ignores saved specific hashes until random mode is turned off. When `randomHash` is off and `hashes` contains values, the specific hash list is used instead. `hashIntervalValue` and `hashIntervalUnit` can refresh the current artwork with the next specific or generated hash before the artwork URL itself changes.

For continuous random exploration:

```js
createExhibitionMode({
  playlist: {
    enabled: true,
    randomHash: true,
    hashIntervalValue: 20,
    hashIntervalUnit: "seconds",
    items: ["https://art.example.com/field-system/index.html"]
  }
});
```

You can also edit the playlist directly inside the runtime panel:

1. Press `Shift + G`.
2. Open the **Playlist** tab.
3. Use `+` to add a row or `-` to remove one.
4. Choose **URL** or **Local path** for each row.
5. Type a served local HTML path, an absolute local HTML path, or a full web URL.
6. Add optional **Specific Hashes** rows when you want to present selected hashes. Use the row **Generate** button to make a valid `0x...` hash quickly.
7. Click **Apply Playlist** to persist the artwork list, hash list, and runtime settings in browser storage.
8. Enable **Playlist Mode**.
9. Set artwork and hash intervals using seconds, minutes, or hours.
10. Choose **Loop** or **Random** order separately for artwork rows and hash rows.
11. Use **Preview** on any artwork row to load that entry into the iframe immediately.
12. Use **Temp HTML** for temporary preview of a local HTML file.

When **Generate random hashes** is enabled, the **Specific Hashes** area collapses and becomes inactive. The saved list is kept, but it does not affect loaded URLs until random hashes are turned off again.

Absolute local paths only work when the page is running through the Exhibition helper. The helper serves the project root and its parent folder by default, so sibling artwork folders under the same `Projects` directory can be entered directly:

```txt
/Users/phenomenalabs/Projects/art.phenomenalabs.com/Longing/index.html
```

For artwork folders outside that allowed area, start the helper with an explicit allow-list:

```bash
npx p5-exhibition-helper --allow /Volumes/ArtworkDrive
```

If a local playlist path is not under the helper root, its parent folder, or an explicit `--allow` folder, it will not load. This is intentional: the helper only serves included local roots so a webpage cannot browse arbitrary files on the machine.

If a live site is mirrored locally, configure `localFiles.urlMirrorRoot` and keep the live URLs in the playlist. Exhibition Mode will rewrite matching remote URLs to same-origin helper URLs for preview and capture:

```js
createExhibitionMode({
  localFiles: {
    urlMirrorRoot: "/Users/phenomenalabs/Projects/art.phenomenalabs.com"
  },
  playlist: {
    enabled: true,
    items: [
      "https://art.phenomenalabs.com/ClassicalRevival/index.html",
      "https://art.phenomenalabs.com/Rococo/index.html"
    ]
  }
});
```

With that setup, `https://art.phenomenalabs.com/ClassicalRevival/index.html` is served locally as a same-origin helper URL, so direct canvas capture can read the iframe canvas without screen-capture permissions.

Valid playlist entries:

```txt
./local-sketch/index.html
../another-work/index.html
/Users/phenomenalabs/Projects/art.phenomenalabs.com/ClassicalRevival/index.html
/Users/phenomenalabs/Projects/art.phenomenalabs.com/Rococo/index.html
https://art.phenomenalabs.com/ClassicalRevival/index.html
https://art.phenomenalabs.com/Rococo/index.html
https://example.com/live-generative-work
```

Browser security note: **Temp HTML** is temporary preview only. Browsers do not expose real filesystem paths to webpages, so dropping or choosing a file cannot fill the saved textbox with `/Users/.../index.html`. Selecting a single `index.html` also does not give the browser access to neighboring JS, image, shader, or data files, so folder-based artworks may show a black screen. For production kiosks, type served local paths such as `/Users/phenomenalabs/Projects/art.phenomenalabs.com/Apex/index.html` or `./works/work-a/index.html` and run the helper server so those paths resolve.

Panel settings are persisted to `localStorage` by default using `storageKey: "p5-exhibition-mode-config"`, so a browser refresh keeps the playlist, intervals, rotation, locks, accessibility settings, cursor mode, overlay/card settings, capture settings, and panel UI state. Use **Save JSON** in the panel to download the same runtime configuration as a local `.json` file. Before export, the panel syncs current unsaved field values into the JSON. A webpage cannot silently write files to disk, so the JSON save uses the browser's normal download behavior.

Use **Load Local Folder** in the Playlist tab to ask the helper for `index.html` files under `localFiles.urlMirrorRoot` and replace the playlist with real served local paths. Use **Save Defaults** to store the current playlist as the browser's restore point. Use **Restore Defaults** to replace stale saved playlist rows with those saved defaults, or with the playlist originally passed to `createExhibitionMode` when no saved defaults exist.

## Artwork URL Params

Some artworks need display flags that are not the seed hash. For example, an artwork may expose its own UI by default and need `ui=false` for exhibition.

Use `customUrlParams` or the Runtime tab's **Artwork URL Params** rows:

```js
createExhibitionMode({
  customUrlParams: [
    { name: "ui", value: "false" },
    { name: "quality", value: "gallery" }
  ],
  playlist: {
    enabled: true,
    randomHash: true,
    items: ["https://art.example.com/eternal-tides/index.html"]
  }
});
```

Generated URL:

```txt
https://art.example.com/eternal-tides/index.html?ui=false&quality=gallery&hash=0x1fa5259da261374fd4c92eb2df1fd6b4b1c01f5b196fa12f275dff183e4858ad
```

Custom params are applied before the hash param. If the artwork URL already contains the same param name, the runtime value replaces it.

## Preparing Artworks for `?hash=`

Playlist mode can append a new `?hash=` seed each time a work appears. To support this, your artwork should read the URL parameter at startup and use it to seed its random system.

Minimal p5.js example:

```js
function hashToSeed(value) {
  let seed = 0;
  for (let i = 0; i < value.length; i += 1) {
    seed = (seed * 31 + value.charCodeAt(i)) >>> 0;
  }
  return seed;
}

function setup() {
  const params = new URLSearchParams(window.location.search);
  const hash = params.get("hash") || "default";
  const seed = hashToSeed(hash);

  randomSeed(seed);
  noiseSeed(seed);
  createCanvas(windowWidth, windowHeight);
}
```

Recommended artwork behavior:

- Read `?hash=` once during startup.
- Convert the hash string into a deterministic numeric seed.
- Use that seed for `randomSeed`, `noiseSeed`, and any custom PRNG.
- Keep `?ui=false` or similar display flags separate from `?hash=`.
- Avoid changing the seed during runtime unless the page reloads.
- Make the same hash reproduce the same composition.

Example URL generated by the playlist:

```txt
https://art.phenomenalabs.com/ClassicalRevival/index.html?hash=0x1fa5259da261374fd4c92eb2df1fd6b4b1c01f5b196fa12f275dff183e4858ad
```

If your artwork expects another parameter name, change `hashParam`:

```js
playlist: {
  randomHash: true,
  hashParam: "seed",
  items: ["https://example.com/work/?ui=false"]
}
```

## Rotation

Use rotation for portrait screens, rotated projectors, or unconventional display mounts.

```js
createExhibitionMode({
  rotation: 90 // 0, 90, 180, or 270
});
```

Rotation can also be changed from the runtime panel.

By default, changing rotation refreshes the active artwork. Playlist iframes reload immediately; p5 sketches receive a `p5em:refresh` event and common resize hooks are called.

```js
window.addEventListener("p5em:refresh", (event) => {
  console.log("Artwork refresh:", event.detail.reason, event.detail.rotation);
  resizeCanvas(windowWidth, windowHeight);
});
```

## Sensor Bridge

The sensor bridge exposes real-world values as simple numeric uniforms for p5.js, Three.js, GLSL, or your own renderer.

```js
import { createSensorBridge } from "p5-exhibition-mode";

const sensors = createSensorBridge({
  type: "websocket",
  url: "ws://localhost:8080",
  map: (data) => ({
    presence: data.people ?? 0,
    temperature: data.temp ?? 0
  })
}).start();

function draw() {
  const presence = sensors.get("presence");
}
```

Supported first-pass inputs:

- Manual values
- JSON polling
- WebSocket streams

The API is intentionally small so OSC, MIDI, serial, weather, TouchDesigner, and CSV adapters can be added cleanly.

## p5 Instance Mode

```js
import p5 from "p5";
import { createExhibitionMode } from "p5-exhibition-mode";

const exhibition = createExhibitionMode({ title: "Field Study" });

new p5((sketch) => {
  sketch.setup = () => {
    exhibition.setup();
    exhibition.applyPixelRatio(sketch);
    sketch.createCanvas(sketch.windowWidth, sketch.windowHeight);
  };

  sketch.draw = () => {
    exhibition.tick();
    sketch.background(0);
  };
});
```

## Runtime Panel

The panel is intentionally quiet and exhibition-facing. It shows:

- **Runtime tab:** display status, input locks, accessibility controls, rotation, hash recording, watchdog, and system diagnostics.
- **Overlay tab:** title, free text, QR, hash overlay, shared safe border, font selection, automatic same-position stacking, and optional title + QR card layout.
- **Playlist tab:** add/remove URL rows, choose URL or local path, preview a row, separate specific hash rows, random hash mode, independent artwork/hash order, and interval controls.
- **Capture tab:** direct canvas recording for artwork plus overlays, with filename, codec, bitrate, FPS, and audio controls.
- **Log tab:** recent runtime, browser, WebGL, watchdog, playlist hash changes, and artwork errors from the in-page log buffer.
- **Actions:** fullscreen, reset, screenshot, apply playlist URLs, save/load JSON, previous URL, and next URL.

The panel is designed to fit within the screen height. Runtime, Overlay, and Playlist controls are separated into tabs so title, QR, hash recording, and playlist setup do not crowd the kiosk diagnostics.

The screenshots below use made-up content and a synthetic artwork background. They show the panel layout, not a bundled artwork.

![Runtime tab with artwork URL params](docs/assets/panel-runtime-url-params.png)

![Overlay tab with title, free text, QR, and hash controls](docs/assets/panel-overlay.png)

![Playlist tab with artwork rows and specific hashes](docs/assets/panel-playlist.png)

The Overlay tab can display title, free text, QR, and hash independently as floating overlays or together as a single exhibition-label card. Floating title, free text, and QR overlays automatically stack when they share the same position, so `top-left` title, text, and QR do not collide. Free text preserves line breaks from the textarea. In Card mode, Title Position places the card on screen, free text always sits below the title, and QR in Card places the QR above, below, left, or right of the title block. Title fonts are dependency-free system stacks: `mono`, `sans`, `system`, `serif`, `editorial`, `classic`, `book`, `humanist`, `neo`, `geometric`, `architectural`, `condensed`, and `typewriter`.

The Capture tab defaults to **Auto** with **H.264 MP4** as the user-facing recording target. Auto records the artwork canvas and overlay layout directly at the current browser window size, so there is no screen-share prompt, no browser chrome, and no forced fullscreen. Resize the browser to choose the capture format, then start recording. Auto can also capture a playlist iframe when that iframe is same-origin, such as an artwork served by the included local helper. Remote URLs and cross-origin iframes cannot be direct-captured by the parent page because browsers block pixel access across domains; run Exhibition Mode inside the artwork page itself, or serve the artwork through the local helper. Browser MP4 depends on `MediaRecorder` support; when a browser rejects H.264, the runtime retries with the browser default codec and reports the actual output type. WebM remains the safest long-recording fallback, especially for long captures. ProRes is greyed out in the browser because `MediaRecorder` cannot encode it; record first and convert with the FFmpeg helper. A **Recording - Stop** button appears while recording, and `Shift + C` also stops recording. **Browse Folder** uses the File System Access API when available, with browser downloads as the fallback on unsupported browsers.

For ProRes delivery, record in the browser first, then convert with the included FFmpeg helper:

```bash
p5-exhibition-capture --input exhibition-capture.webm --preset prores
p5-exhibition-capture --input exhibition-capture.webm --preset h264 --output exhibition-capture.mp4
```

ProRes is not available from browser-only `MediaRecorder`; the helper creates a `.mov` ProRes 422 HQ-style file using FFmpeg on macOS or Windows. Install FFmpeg locally before using the helper. On macOS, `brew install ffmpeg` is the simplest route. Official FFmpeg downloads and source repositories are listed at <https://www.ffmpeg.org/download.html>; the GitHub mirror is <https://github.com/FFmpeg/FFmpeg>.

`ffmpeg.wasm` can run FFmpeg-style conversions inside a browser tab, but it is intentionally not bundled here. It adds a large WebAssembly payload, needs browser isolation headers for performant threaded builds, and is less suitable for exhibition-grade ProRes export than the local FFmpeg helper. Reference: <https://github.com/ffmpegwasm/ffmpeg.wasm>.

**Save JSON** exports the full runtime configuration, including overlay/card layout, safe border, title/QR/free text/hash settings, custom artwork URL params, playlist URLs, specific hashes, intervals, capture source/codec/bitrate/FPS, kiosk locks, accessibility, watchdog, logging, health check settings, active tab, and panel placement. **Load JSON** imports that file back into the runtime and refreshes the panel. Browser-selected folder handles are not included because browsers do not allow them to be restored from JSON without a new user selection.

## URL Commands

Runtime settings can be controlled from the page URL. URL commands override saved panel settings for that launch. Every command can be written either directly, such as `?ui=false`, or with a namespaced prefix, such as `?p5em.ui=false`.

Example kiosk launch:

```txt
http://127.0.0.1:4177/demo/?ui=false&fullscreen=true&kiosk=true&rotation=90&showTitle=true&title=Spring&artist=Phenomena%20Labs&year=2026&layout=card&text=Live%20generative%20study&showQr=true&qr=https%3A%2F%2Fronentanchum.art
```

Example playlist launch:

```txt
http://127.0.0.1:4177/demo/?playlistEnabled=true&urls=https%3A%2F%2Fart.phenomenalabs.com%2FClassicalRevival%2Findex.html%7Chttps%3A%2F%2Fart.phenomenalabs.com%2FRococo%2Findex.html&playlistInterval=40&playlistUnit=seconds&randomHash=true&hashInterval=5&hashUnit=seconds
```

Example launch with artwork display params:

```txt
http://127.0.0.1:4177/demo/?playlistEnabled=true&urls=https%3A%2F%2Fart.example.com%2Feternal-tides%2Findex.html&artworkParams=ui%3Dfalse%7Cquality%3Dgallery&randomHash=true
```

Available URL commands:

| URL command | Values | Runtime setting |
| --- | --- | --- |
| `ui` / `panel` | `true`, `false` | Show the runtime panel |
| `fullscreen` | `true`, `false` | Request fullscreen after user gesture |
| `kiosk` | `true`, `false` | Enable kiosk shell behavior |
| `context` | `true`, `false` | Disable context menu |
| `touch` | `true`, `false` | Disable browser touch gestures |
| `scroll` | `true`, `false` | Prevent page scrolling |
| `cursor` | `true`, `false` | Hide cursor over artwork |
| `cursorMode` | `always`, `idle` | Cursor hide behavior |
| `cursorIdle` | milliseconds | Idle delay before cursor hides |
| `dpr` | number | Max device pixel ratio |
| `rotation` | `0`, `90`, `180`, `270` | Rotate artwork and overlays |
| `refreshOnRotation` | `true`, `false` | Refresh artwork when rotation changes |
| `title`, `artist`, `year` | text | Overlay metadata |
| `showTitle` | `true`, `false` | Show title overlay |
| `titleFont` | `mono`, `sans`, `system`, `serif`, `editorial`, `classic`, `book`, `humanist`, `neo`, `geometric`, `architectural`, `condensed`, `typewriter` | Title/font family |
| `titleColor` | `white`, `gray`, `black` | Overlay text color |
| `titlePosition` | `top-left`, `top-center`, `top-right`, `bottom-left`, `bottom-center`, `bottom-right` | Title/card position |
| `titleSize` | pixels | Title size |
| `titleBold` | `true`, `false` | Bold title and card text |
| `titleItalic` | `true`, `false` | Italicize the artwork title only |
| `text` / `freeText` | text | Free text overlay content |
| `showText` | `true`, `false` | Show free text |
| `textPosition` | position value | Free text position |
| `textSize` | pixels | Free text size |
| `showHash` / `showHashOverlay` | `true`, `false` | Show small hash overlay |
| `hashPosition` | `bottom-left`, `bottom-right` | Hash overlay position |
| `hashSafeArea` | pixels | Hash overlay safe border |
| `hashSize` | pixels | Hash overlay text size |
| `hashColor` | `white`, `black` | Hash overlay color |
| `layout` | `separate`, `card` | Floating overlays or card label |
| `cardQr` | `below`, `above`, `left`, `right` | QR placement inside card |
| `safeArea` | pixels | Overlay safe border |
| `qr` | URL | QR link |
| `showQr` | `true`, `false` | Show QR code |
| `qrPosition` | position value | Floating QR position |
| `qrSize` | pixels | QR size |
| `artworkParams` / `customParams` | `name=value|name2=value2` | Params added to artwork URLs before hash |
| `seed` | text or number | Runtime seed metadata |
| `monitor` | `true`, `false` | Enable runtime monitor |
| `reducedMotion` | `true`, `false` | Reduced motion mode |
| `highContrast` | `true`, `false` | High contrast mode |
| `watchdog` | `true`, `false` | Enable watchdog |
| `watchdogFps` | number | Watchdog minimum FPS |
| `watchdogSeconds` | seconds | Watchdog trigger duration |
| `watchdogReload` | `true`, `false` | Reload/reset after watchdog trigger |
| `playlistEnabled` | `true`, `false` | Enable playlist mode |
| `urls` / `playlist` | `url1|url2|url3` | Playlist URL list |
| `playlistOrder` | `loop`, `random` | Artwork URL order |
| `playlistInterval` | number | Playlist interval value |
| `playlistUnit` | `seconds`, `minutes`, `hours` | Playlist interval unit |
| `hashes` | `hash1|hash2` | Specific hash list |
| `hashOrder` | `loop`, `random` | Specific hash order |
| `randomHash` | `true`, `false` | Append random hash to playlist URLs |
| `hashInterval` | number | Hash refresh interval value |
| `hashUnit` | `seconds`, `minutes`, `hours` | Hash refresh interval unit |
| `hashParam` | text | Hash parameter name, default `hash` |
| `startIndex` | number | Initial playlist index |
| `startHashIndex` | number | Initial specific hash index |

For multiple playlist URLs, hashes, or artwork params, separate entries with `|` and URL-encode the full value. The generated artwork hash remains a full 256-bit `0x...` value in the playlist URL.

## Options

```js
createExhibitionMode({
  title: "Untitled Artwork",
  artist: "",
  year: "",
  showTitleOverlay: false,
  titleOverlayFont: "mono",
  titleOverlayColor: "white",
  titleOverlayPosition: "top-left",
  titleOverlaySize: 11,
  titleOverlayBold: false,
  titleOverlayItalic: false,
  freeText: "",
  showFreeText: false,
  freeTextPosition: "bottom-left",
  freeTextSize: 10,
  showHashOverlay: false,
  hashOverlayPosition: "bottom-left",
  hashOverlaySafeArea: 18,
  hashOverlaySize: 9,
  hashOverlayColor: "white",
  overlayLayout: "separate",
  cardQrPlacement: "below",
  overlaySafeArea: 18,
  qrLink: "",
  showQr: false,
  qrPosition: "bottom-right",
  qrSize: 96,
  seed: null,
  fullscreen: true,
  kiosk: true,
  disableContextMenu: true,
  disableTouchGestures: true,
  preventScroll: true,
  hideCursor: false,
  hideCursorMode: "always",
  cursorIdleMs: 2400,
  idleReset: false,
  maxPixelRatio: 2,
  rotation: 0,
  refreshOnRotation: true,
  accessibility: {
    reducedMotion: false,
    highContrast: false
  },
  watchdog: {
    enabled: false,
    minFps: 12,
    seconds: 30,
    reload: true
  },
  logging: {
    enabled: true,
    maxEntries: 300
  },
  healthCheck: {
    enabled: false,
    url: "",
    intervalSeconds: 60
  },
  capture: {
    filename: "exhibition-capture",
    source: "auto",
    codec: "h264",
    videoBitsPerSecond: 30000000,
    frameRate: 60,
    includeAudio: false,
    hidePanelDuringCapture: false
  },
  localFiles: {
    endpoint: "/__p5em/files",
    absolutePrefix: "/__p5em/abs/",
    urlMirrorRoot: "",
    fallbackFilePreview: true
  },
  playlist: {
    enabled: false,
    items: [],
    itemOrder: "loop",
    intervalValue: 2,
    intervalUnit: "minutes",
    intervalSeconds: 120,
    hashes: [],
    hashOrder: "loop",
    hashIntervalValue: 2,
    hashIntervalUnit: "minutes",
    hashIntervalSeconds: 120,
    randomHash: false,
    hashParam: "hash",
    startIndex: 0,
    startHashIndex: 0
  },
  customUrlParams: [],
  monitor: true,
  panel: true,
  panelKey: "g",
  ui: {
    activeTab: "runtime",
    panelBounds: null
  },
  urlParams: true,
  onReset: undefined,
  onScreenshot: undefined,
  onDiagnostics: undefined
});
```

## Institutional Files

The repository also includes:

- `templates/technical-rider.md`
- `schemas/artwork-manifest.schema.json`
- `examples/artwork-manifest.example.json`
- `examples/runtime-config.example.json`

## Demo

```bash
npm run demo
```

Open:

```txt
http://127.0.0.1:4177/demo/
```

## Notes

Browsers require a user gesture before entering fullscreen. The library listens for the first pointer or keyboard event and requests fullscreen from that gesture.

Memory reporting depends on browser support and may show as unavailable.

## License

MIT
