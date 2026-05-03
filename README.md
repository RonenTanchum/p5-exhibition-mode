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
- Hidden Phenomena-style runtime panel
- Runtime toggles for touch locks, context menu locks, cursor hiding, playlist mode, and random hash URLs
- 0 / 90 CW / 90 CCW / 180 rotation for vertical displays and rotated projectors
- Optional playlist mode for rotating local sketches and live generative URLs
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

## Basic Usage

```js
import { createExhibitionMode } from "p5-exhibition-mode";

const exhibition = createExhibitionMode({
  title: "Bloom Study",
  artist: "Phenomena Labs",
  seed: 1842,
  fullscreen: true,
  disableContextMenu: true,
  disableTouchGestures: true,
  hideCursor: true,
  maxPixelRatio: 2,
  rotation: 0,
  watchdog: {
    enabled: true,
    minFps: 12,
    seconds: 30,
    reload: true
  },
  playlist: {
    enabled: false,
    intervalSeconds: 120,
    randomHash: true,
    hashParam: "hash",
    items: [
      "./sketch-a/index.html",
      "https://art.phenomenalabs.com/classical-revival/?ui=false"
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

## Playlist Mode

Playlist mode can rotate local sketch pages or live artwork URLs inside a managed fullscreen iframe.

```js
const exhibition = createExhibitionMode({
  playlist: {
    enabled: true,
    intervalSeconds: 180,
    randomHash: true,
    hashParam: "hash",
    items: [
      "./works/apex-rotation/index.html",
      "https://art.phenomenalabs.com/classical-revival/?ui=false"
    ]
  }
});
```

When `randomHash` is enabled, each playlist load receives a new `?hash=` value. This is useful for generative systems that use URL parameters as seeds.

## Rotation

Use rotation for portrait screens, rotated projectors, or unconventional display mounts.

```js
createExhibitionMode({
  rotation: 90 // 0, 90, 180, or 270
});
```

Rotation can also be changed from the runtime panel.

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

- Artwork title, artist, seed
- Resolution, DPR, FPS, fullscreen status
- Context menu and touch gesture locks
- Uptime, memory, reload count
- Fullscreen, reset, screenshot, and diagnostics actions

## Options

```js
createExhibitionMode({
  title: "Untitled Artwork",
  artist: "",
  seed: null,
  fullscreen: true,
  disableContextMenu: true,
  disableTouchGestures: true,
  preventScroll: true,
  hideCursor: true,
  cursorIdleMs: 2400,
  idleReset: false,
  maxPixelRatio: 2,
  rotation: 0,
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
    intervalSeconds: 120,
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
