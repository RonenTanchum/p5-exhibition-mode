# P5 Exhibition Mode: A Small Runtime Layer for Generative Art in Public Space

Have you ever needed to code on-site during an exhibition install, while the projector was already mounted, the wall label was waiting, and the browser was still behaving like a browser?

Or wanted to capture a clean video pass through ten specific hashes from a generative project, without manually changing URLs, reopening tabs, or trusting a screen-recording dialog in front of an audience?

I built `p5-exhibition-mode` for that exact situation.

It is a small runtime layer for p5.js artworks. Its purpose is not to replace the artwork, the sketch, or the artist's system. It sits around the work and handles the operational conditions that become visible only when generative software leaves the studio: fullscreen behavior, browser gestures, cursor state, display rotation, overlays, QR labels, hash playback, playlisting, capture, and runtime diagnostics.

In other words, it treats a browser sketch less like a webpage and more like an installed artwork.

## The Problem: Generative Art Is Often Stable Until It Is Installed

Most generative projects are developed in conditions that are forgiving. The artist has the console open. The browser can be refreshed. A small UI panel can remain visible. Screen recording can include the whole desktop. If the work fails, the artist is nearby.

Exhibition conditions are different.

A public installation needs to run for hours or days. It may be shown on a rotated display, an unfamiliar GPU, a borrowed machine, or a kiosk where nobody should touch the trackpad. A collector, curator, technician, or gallery assistant may need to restart the work without understanding the code. The artwork may need to rotate between several local HTML folders or several live URLs. The artist may need to show a specific set of hashes, or let the work generate new hashes continuously.

Many of these requirements are not conceptually difficult, but they are operationally fragile. They tend to be rebuilt ad hoc for each show.

`p5-exhibition-mode` tries to make that layer explicit.

## What the Tool Does

The tool wraps a p5.js sketch with exhibition controls:

- Fullscreen and kiosk behavior
- Context-menu, touch gesture, scroll, and cursor locks
- Device pixel ratio limits for performance
- Rotation for portrait screens and rotated projectors
- Runtime diagnostics for FPS, resolution, memory, uptime, watchdogs, and logs
- Floating title, free text, hash, and QR overlays
- Automatic stacking when title, text, and QR share the same screen position
- Per-playlist title, artist, year, and free-text labels
- A playlist system for local paths and remote artwork URLs
- A separate hash playlist for curated hashes
- Random hash generation for exploration
- Custom artwork URL parameters such as `ui=false`
- Direct canvas capture for stills and video
- Browser H.264 MP4 where supported, with WebM fallback
- Local FFmpeg helper commands for H.264 or ProRes delivery conversion
- Save/load JSON configuration for repeatable installation setup

The interface is intentionally practical. It is not a portfolio page and not a CMS. It is a control surface for an artwork while the artwork is running.

## A Runtime Panel for the Exhibition Situation

The runtime panel opens with `Shift + G`. It is divided into tabs:

- Runtime: status, input locks, rotation, custom URL parameters, and hash recording
- Overlay: global labels, per-playlist item labels, QR, hash overlay, typography, safe areas, and card mode
- Playlist: artwork URLs/local paths, specific hashes, random hash mode, and intervals
- Capture: recording source, codec, bitrate, FPS, and file naming
- Log: runtime events and warnings

Suggested screenshots for publication:

- `docs/assets/panel-runtime-url-params.png` — runtime controls and URL parameters
- `docs/assets/panel-overlay.png` — global overlay typography, QR, and layout controls
- `docs/assets/panel-overlay-playlist-metadata.png` — compact per-playlist item label editor
- `docs/assets/panel-playlist.png` — artwork rows and hash playlist
- `docs/assets/panel-capture.png` — direct canvas recording controls

This matters because the person operating the installation should not have to edit code to adjust a QR code, hide an artwork's internal UI, rotate the display, or move through a list of hashes.

It also matters when one screen rotates through several works. A playlist is rarely only a list of URLs. Each work may need its own title, year, artist credit, short description, and project link. The Overlay tab therefore has two modes: a global fallback label for the whole runtime, and per-playlist item labels for the specific artwork currently playing. Empty item fields fall back to the global label, so the operator can keep the setup concise when several works share the same artist or context.

For example, a generative project might expose its own interface by default. In a gallery, the work should load as:

```txt
https://art.example.com/eternal-tides/index.html?ui=false&hash=0x...
```

In `p5-exhibition-mode`, `ui=false` becomes a reusable artwork URL parameter. The generated hash is appended after it. The artist can set this in code, from the Runtime tab, from JSON, or from a launch URL.

## Hashes as Exhibition Material

Generative art often treats the hash as both seed and edition index. But practical exhibition workflows around hashes are still awkward.

Sometimes you want random hashes. Sometimes you want a specific list. Sometimes you want to rotate the artwork every ten minutes but change the hash every forty-five seconds. Sometimes you want to record ten selected states for documentation.

The tool separates these concerns:

- Artwork playlist: which page or local path is being shown
- Hash playlist: which exact hash values should be used
- Random hash mode: whether the runtime should generate new hashes instead

When random hash mode is enabled, it overrides the saved specific hash list. The specific list is kept, but collapsed and inactive. When random mode is turned off, the saved curated hashes become active again.

That distinction is important. It prevents a common ambiguity: "I turned random hashes on, but why is the same saved hash still appearing?"

## Capture Without Screen Recording

The browser is not a neutral exhibition environment. Standard screen capture asks for permissions, includes browser chrome if misconfigured, and can behave differently across operating systems.

This tool records directly from the artwork canvas and the overlay layout at the current browser window size. The user can resize the browser to choose the output aspect ratio. There is no need to enter fullscreen just to record. There is no screen-share popup.

The capture system is designed around browser reality:

- H.264 MP4 is the preferred user-facing target when the browser supports it.
- WebM remains the safest browser fallback.
- ProRes is not a browser `MediaRecorder` format, so the included helper converts after recording using local FFmpeg.

This is less romantic than pretending the browser can encode every professional format natively, but it is more useful.

## Why Not Just Build This Into Each Artwork?

You can. Many artists do.

But rebuilding the same exhibition shell for every project creates maintenance debt. It also mixes the artwork's internal system with the conditions of display. A sketch should be able to focus on composition, behavior, and form. The exhibition runtime can handle the operational layer.

That separation also helps with institutional work. A JSON configuration can be saved for a specific venue. A technical rider can specify rotation, playlist paths, capture settings, watchdog behavior, and URL params. The artwork itself remains the artwork.

## A Tool for Artists, Technicians, and Institutions

The intended user is not only the artist in the studio. It is also the person at the venue with a keyboard, a display, and a problem.

The tool is useful when:

- a work needs to run as a kiosk
- a local playlist of HTML folders needs to rotate
- a live project needs its UI hidden by URL parameter
- each artwork in a playlist needs its own wall-label text
- a curated hash list needs to be presented
- random hashes need to be explored or recorded
- a title/QR label needs to sit on top of the artwork
- a portrait display requires rotation
- a clean MP4 or WebM recording is needed
- the installation needs a repeatable saved configuration

It is also useful during development because it makes exhibition assumptions visible early.

There is also an `llms.txt` file for AI agents. The point is not to make the artwork autonomous. It is to make the installation layer legible: what files matter, how to configure a show, what defaults are appropriate, how to use playlist metadata, and what to test before opening. If an assistant is helping prepare a screen-based exhibition, it can read the repository like an installation manual rather than guessing from the source code.

## A Small Layer, Not a Framework

The project is deliberately narrow. It is an ES module with no runtime dependencies. It does not impose a rendering model. It does not replace p5.js. It does not require a backend unless local file serving is needed for browser security reasons.

That constraint is part of the design. Exhibition tools should be understandable under pressure. If something fails on-site, the artist should be able to reason about it.

The included local helper server exists for one reason: browsers cannot safely read arbitrary local folders from a webpage. The helper serves allowed local roots so playlist entries can use stable local paths. This makes local mirrored artwork sites practical for capture and exhibition without relying on remote network availability.

## Closing

`p5-exhibition-mode` came out of a practical need: making generative browser artworks easier to install, inspect, rotate, seed, label, and capture.

It is a modest tool, but the problem it addresses is real. Generative art does not only need code that produces images. It also needs code that survives display conditions.

The exhibition runtime is where those two realities meet.
