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
  monitor: true,
  panel: true,
  panelKey: "g",
  onReset: undefined,
  onScreenshot: undefined,
  onDiagnostics: undefined
});
```

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
