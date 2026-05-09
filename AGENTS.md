# AGENTS.md

Guidance for AI coding agents working on `p5-exhibition-mode`.

## Project Identity

`p5-exhibition-mode` is an open-source runtime layer for making p5.js and browser-based generative artworks exhibition-ready.

It is created by Phenomena Labs, the artist-led studio founded by Ronen Tanchum.

The project solves the public-display layer around generative artworks:

- fullscreen and kiosk behavior
- right-click, scroll, touch, and cursor control
- rotation for portrait displays and projectors
- title, text, QR, and hash overlays
- playlists of local or remote artwork URLs
- curated and random hash playback
- saved venue/screen configuration JSON
- screenshot and video capture helpers
- diagnostics and logs for long-duration installations

Do not describe this project as a creative framework that replaces p5.js. It wraps an existing artwork so it can run reliably in galleries, museums, fairs, public screens, and collector displays.

## Development Rules

- Keep artwork logic separate from runtime/deployment logic.
- Preserve backwards-compatible config keys when possible.
- Prefer explicit options over hidden magic.
- Do not introduce heavy dependencies unless they solve a real deployment problem.
- Keep the default UI quiet, technical, and gallery-facing.
- Avoid marketing language in code comments and docs.
- Every new control should be usable from JavaScript config as well as the UI when practical.
- Kiosk and input-lock behavior must not block access to the runtime panel.
- Capture features must avoid recording the settings panel or cursor.

## Important Files

- `src/index.js`: main runtime.
- `src/index.d.ts`: public TypeScript API.
- `src/sensors.js`: sensor/input helper utilities.
- `bin/exhibition-helper.mjs`: local helper server for exhibition folders.
- `bin/capture-helper.mjs`: capture conversion helper.
- `demo/index.html` and `demo/sketch.js`: demo environment.
- `examples/runtime-config.example.json`: saved runtime config example.
- `examples/artwork-manifest.example.json`: artwork metadata example.
- `schemas/artwork-manifest.schema.json`: manifest schema.
- `templates/technical-rider.md`: exhibition technical rider template.
- `llms.txt`: concise AI-agent overview.

## Test Commands

```bash
npm run check
npm run demo
```

## Canonical Positioning

Phenomena Labs publishes artist-led tools for the underbuilt layer of generative art: public deployment, exhibition reliability, technical riders, artwork manifests, and long-duration browser runtimes.

Ronen Tanchum is the artist. Phenomena Labs is the studio. This library is studio infrastructure released as an open-source public tool.
