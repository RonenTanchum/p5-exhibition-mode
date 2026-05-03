# p5 Exhibition Mode

Gallery-ready runtime controls for p5.js artworks.

`p5-exhibition-mode` is a lightweight utility for running p5.js sketches as stable fullscreen artworks in galleries, museums, fairs, and public installations.

It handles the practical details artists usually rebuild for every show: fullscreen state, touch gesture suppression, context-menu blocking, cursor hiding, idle reset, pixel ratio control, screenshot capture, and a discreet diagnostics panel.

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
- Screenshot capture
- Hidden runtime panel
- Runtime toggles for touch locks, context menu locks, cursor hiding, playlist mode, and random hash URLs
- 0 / 90 CW / 90 CCW / 180 rotation for vertical displays and rotated projectors
- Rotation-triggered artwork refresh for sketches and playlist iframes
- Playlist editor inside the runtime panel for local HTML paths and web URLs
- Optional playlist mode for rotating local sketches and live generative URLs
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

Without the helper server, use **Drop HTML** for temporary preview. A single HTML file works only when it is self-contained or uses absolute asset URLs.

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
  freeText: "",
  showFreeText: false,
  freeTextPosition: "bottom-left",
  freeTextSize: 10,
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
    fallbackFilePreview: true
  },
  watchdog: {
    enabled: true,
    minFps: 12,
    seconds: 30,
    reload: true
  },
  playlist: {
    enabled: false,
    intervalValue: 2,
    intervalUnit: "minutes",
    intervalSeconds: 120,
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
  freeText: "Live generative study",
  showFreeText: true,
  freeTextPosition: "bottom-left",
  freeTextSize: 11,
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
exhibition.saveConfig();
```

Useful methods:

- `setFullscreen(value)`, `enterFullscreen()`, `exitFullscreen()`
- `setKiosk(value)`
- `setInputLocks({ contextMenu, touchGestures, scroll })`
- `setCursor({ hide, mode, idleMs })`
- `setRotation(degrees)`
- `setAccessibility({ reducedMotion, highContrast })`
- `setArtworkMetadata({ title, artist, year, showTitleOverlay, titleOverlayFont, titleOverlayColor, titleOverlayPosition, titleOverlaySize, titleOverlayBold, freeText, showFreeText, freeTextPosition, freeTextSize, overlayLayout, cardQrPlacement, overlaySafeArea })`
- `setQrOptions({ qrLink, showQr, qrPosition, qrSize, cardQrPlacement, overlaySafeArea })`
- `setOverlayLayout("separate" | "card")`
- `setOverlaySafeArea(pixels)`
- `startHashRecording()`, `stopHashRecording()`, `clearHashRecording()`, `exportHashRecording()`
- `setWatchdog(options)` and `setHealthCheck(options)`
- `setPlaylistOptions(options)`, `setPlaylistItems(items)`, `togglePlaylist(value)`
- `setPlaylistIntervalParts(value, unit)` and `setPlaylistHashIntervalParts(value, unit)`
- `nextPlaylistItem()`, `previousPlaylistItem()`, `previewPlaylistUrl(url)`
- `getConfig()`, `loadConfig(config)`, `saveConfig()`, `exportConfig()`
- `localFiles.endpoint` can point at a helper endpoint such as `/__p5em/files`

QR codes are generated as image URLs through `qrProvider` by default. Override `qrProvider` if you want to route QR generation through your own local/offline service.

## Playlist Mode

Playlist mode can rotate local sketch pages or live artwork URLs inside a managed fullscreen iframe.

```js
const exhibition = createExhibitionMode({
  playlist: {
    enabled: true,
    intervalValue: 3,
    intervalUnit: "minutes",
    intervalSeconds: 180,
    hashIntervalValue: 30,
    hashIntervalUnit: "seconds",
    hashIntervalSeconds: 30,
    randomHash: true,
    hashParam: "hash",
    items: [
      "./works/apex-rotation/index.html",
      "https://art.phenomenalabs.com/ClassicalRevival/index.html"
    ]
  }
});
```

When `randomHash` is enabled, each playlist load receives a new 256-bit `?hash=` value prefixed with `0x`. `hashIntervalValue` and `hashIntervalUnit` can also refresh the current playlist URL with a new hash before the URL itself changes.

You can also edit the playlist directly inside the runtime panel:

1. Press `Shift + G`.
2. Open the **Playlist** tab.
3. Use `+` to add a row or `-` to remove one.
4. Choose **URL** or **Local path** for each row.
5. Type a served local HTML path or full web URL.
6. Click **Apply URLs** to persist the playlist and runtime settings in browser storage.
7. Enable **Playlist Mode**.
8. Set **Playlist Interval** using seconds, minutes, or hours.
9. Set **Hash Interval** separately when Random `?hash=` should reseed the current URL faster or slower than the URL rotation.
10. Use **Preview** on any row to load that entry into the iframe immediately.
11. Use **Drop HTML** for temporary preview of a local HTML file.

Valid playlist entries:

```txt
./local-sketch/index.html
../another-work/index.html
https://art.phenomenalabs.com/ClassicalRevival/index.html
https://art.phenomenalabs.com/Rococo/index.html
https://example.com/live-generative-work
```

Browser security note: **Drop HTML** is temporary preview only. Browsers do not expose real filesystem paths to webpages, so dropping or choosing a file cannot fill the saved textbox with `/Users/.../index.html`. For production kiosks, type served local paths such as `./works/work-a/index.html` and run the helper server so those paths resolve.

Panel settings are persisted to `localStorage` by default using `storageKey: "p5-exhibition-mode-config"`, so a browser refresh keeps the playlist, intervals, rotation, locks, accessibility settings, and cursor mode. Use **Save JSON** in the panel to download the same runtime configuration as a local `.json` file. A webpage cannot silently write files to disk, so the JSON save uses the browser's normal download behavior.

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
- **Overlay tab:** title overlay, QR code, shared safe border, font selection, and optional title + QR card layout.
- **Playlist tab:** add/remove URL rows, choose URL or local path, preview a row, set playlist and hash intervals, enable random `?hash=`, and move between playlist items.
- **Log tab:** recent runtime, browser, WebGL, watchdog, and artwork errors from the in-page log buffer.
- **Actions:** fullscreen, reset, screenshot, apply playlist URLs, save/load JSON, previous URL, and next URL.

The panel is designed to fit within the screen height. Runtime, Overlay, and Playlist controls are separated into tabs so title, QR, hash recording, and playlist setup do not crowd the kiosk diagnostics.

The Overlay tab can display title, free text, and QR independently as floating overlays or together as a single exhibition-label card. In Card mode, Title Position places the card on screen, free text always sits below the title, and QR in Card places the QR above, below, left, or right of the title block. Title fonts are dependency-free system stacks: `mono`, `sans`, `system`, `serif`, `editorial`, `classic`, `book`, `humanist`, `neo`, `geometric`, `architectural`, `condensed`, and `typewriter`.

**Save JSON** exports the full runtime configuration, including overlay/card layout, safe border, title/QR settings, playlist URLs, intervals, kiosk locks, accessibility, watchdog, logging, and health check settings. **Load JSON** imports that file back into the runtime and refreshes the panel.

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
  freeText: "",
  showFreeText: false,
  freeTextPosition: "bottom-left",
  freeTextSize: 10,
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
  playlist: {
    enabled: false,
    items: [],
    intervalValue: 2,
    intervalUnit: "minutes",
    intervalSeconds: 120,
    hashIntervalValue: 2,
    hashIntervalUnit: "minutes",
    hashIntervalSeconds: 120,
    randomHash: false,
    hashParam: "hash",
    startIndex: 0
  },
  monitor: true,
  panel: true,
  panelKey: "g",
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
