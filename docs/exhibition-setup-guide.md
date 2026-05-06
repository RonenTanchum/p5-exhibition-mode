# Exhibition Setup Guide

This guide explains how to use `p5-exhibition-mode` when preparing browser-based generative artworks for a screen, projector, lobby wall, gallery monitor, collector display, or institutional installation.

The goal is simple: keep the artwork focused on making the work, and let the runtime handle the exhibition conditions around it.

## The Basic Workflow

1. Add `p5-exhibition-mode` to the artwork page.
2. Decide whether the show is a single artwork, a playlist of artworks, a curated hash sequence, or a random-hash exploration.
3. Set the display conditions: fullscreen, kiosk locks, cursor behavior, pixel ratio, and rotation.
4. Add exhibition context: title, artist, year, short wall text, QR link, and optional hash display.
5. Add artwork URL parameters such as `ui=false`, `quality=gallery`, or any project-specific display flags.
6. Save the runtime setup as JSON.
7. Test the setup at the actual display size and orientation.
8. Capture stills or video only after the screen format is correct.

## Single Artwork Setup

Use this when one generative artwork runs continuously on one screen.

```js
const exhibition = createExhibitionMode({
  title: "Spring",
  artist: "Phenomena Labs",
  year: "2026",
  fullscreen: true,
  kiosk: true,
  maxPixelRatio: 2,
  showTitleOverlay: true,
  showQr: true,
  qrLink: "https://phenomenalabs.art/spring"
});
```

Recommended checks:

- Click once to allow fullscreen.
- Press `Shift + G` to open the panel.
- Confirm FPS is stable.
- Confirm the overlay is not covering important visual areas.
- Confirm the QR code scans from normal viewing distance.
- Save JSON after the setup is correct.

## Playlist Setup

Use playlist mode when one machine rotates through multiple artworks or multiple local HTML folders.

Playlist items can be plain URL strings:

```js
playlist: {
  enabled: true,
  items: [
    "./Apex/index.html",
    "./Rococo/index.html"
  ]
}
```

They can also be objects with per-artwork label text:

```js
playlist: {
  enabled: true,
  itemOrder: "loop",
  intervalValue: 8,
  intervalUnit: "minutes",
  items: [
    {
      url: "./Apex/index.html",
      title: "Apex",
      artist: "Phenomena Labs",
      year: "2026",
      freeText: "A generative terrain system prepared for a lobby-scale display."
    },
    {
      url: "./Rococo/index.html",
      title: "Rococo",
      artist: "Ronen Tanchum",
      year: "2026",
      freeText: "An algorithmic floral system built from accumulation, density, and ornament."
    }
  ]
}
```

Per-item text is useful when a playlist contains several artworks and each needs a different wall label, caption, QR context, or institutional note. Empty item fields fall back to the global Overlay tab text.

In the UI:

- Open **Overlay**.
- Choose **Per Playlist Item**.
- Select a playlist row.
- Add the title, artist, year, and free text for that row.
- Return to **Global Text** when editing fallback text shared by every item.

## Hash Setup

Use hashes when a work supports deterministic seeding through URL parameters.

Recommended artwork behavior:

- Read `?hash=` at startup.
- Convert the hash into a numeric seed.
- Use that seed for `randomSeed`, `noiseSeed`, or your own PRNG.
- Restart the composition when a new hash is loaded.

Curated hash sequence:

```js
playlist: {
  randomHash: false,
  hashOrder: "loop",
  hashIntervalValue: 45,
  hashIntervalUnit: "seconds",
  hashes: [
    "0x1111111111111111111111111111111111111111111111111111111111111111",
    "0x2222222222222222222222222222222222222222222222222222222222222222"
  ]
}
```

Random hash exploration:

```js
playlist: {
  randomHash: true,
  hashIntervalValue: 20,
  hashIntervalUnit: "seconds"
}
```

Random hash mode keeps the curated hash list but temporarily disables it. Turn random hash mode off to return to the saved sequence.

## Local Exhibition Helper

Use the helper server when the show uses local artwork folders.

```bash
npx p5-exhibition-helper --root /Users/you/Artworks --port 4177
```

Then open:

```txt
http://127.0.0.1:4177/
```

This matters because browsers cannot safely load an arbitrary local folder and its neighboring assets from a normal file picker. The helper makes local artwork paths stable and same-origin, which is also important for direct canvas capture.

## Overlay Strategy

For public exhibitions, overlays should be useful but restrained.

Use overlays for:

- artwork title
- artist or studio name
- year
- one short contextual note
- QR link to the artwork page, project page, catalogue, or collector information
- hash display when the seed or edition state matters

Avoid:

- long curatorial essays inside the artwork frame
- labels covering important generative motion
- QR codes too small for the viewing distance
- changing the overlay style from artwork to artwork unless there is a reason

Card mode is best when you want a compact wall-label block. Separate mode is best when title, QR, text, and hash should live in different parts of the display.

## Capture Setup

Capture records the artwork canvas and overlay layout at the current browser window size.

Before recording:

- Set the browser to the desired aspect ratio.
- Confirm the artwork is framed correctly.
- Hide the panel or enable **Hide panel while recording**.
- Choose a filename that identifies the artwork and run.
- Test a short recording before the final pass.

Browser capture formats:

- H.264 MP4 is used when the browser supports it.
- WebM is the most reliable browser fallback.
- ProRes requires the FFmpeg helper after recording.

## Suggested Exhibition Checklist

- [ ] Artwork loads from the intended local path or remote URL.
- [ ] Fullscreen behavior is confirmed.
- [ ] Context menu, touch gestures, scroll, and cursor behavior are correct.
- [ ] Display rotation is correct.
- [ ] Pixel ratio is stable for the machine.
- [ ] Overlay text is correct for the global setup or every playlist item.
- [ ] QR links scan and resolve.
- [ ] Artwork URL params are correct.
- [ ] Hash behavior is correct.
- [ ] Playlist intervals are correct.
- [ ] Still capture works.
- [ ] Short video capture works.
- [ ] Runtime JSON has been saved.
- [ ] Restart procedure has been tested.

