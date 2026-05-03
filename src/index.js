const DEFAULTS = {
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
  target: null
};

const PANEL_ID = "p5-exhibition-mode-panel";
const STYLE_ID = "p5-exhibition-mode-style";

export function createExhibitionMode(options = {}) {
  const config = { ...DEFAULTS, ...options };
  const state = {
    startedAt: performance.now(),
    lastFrameAt: performance.now(),
    lastActivityAt: performance.now(),
    fps: 0,
    frameSamples: [],
    panelOpen: false,
    reloadCount: readReloadCount(),
    listeners: [],
    panel: null,
    raf: null,
    cursorHidden: false
  };

  function setup() {
    injectStyles();
    installInputLocks();
    installKeyboard();
    installActivityTracking();
    applyPixelRatio();

    if (config.panel) {
      state.panel = createPanel(config, api);
      document.body.appendChild(state.panel);
      updatePanel();
    }

    if (config.fullscreen) {
      add(document, "pointerdown", maybeEnterFullscreen, { once: true });
      add(document, "keydown", maybeEnterFullscreen, { once: true });
    }

    document.documentElement.classList.add("p5em-active");
    return api;
  }

  function tick() {
    const now = performance.now();
    const delta = Math.max(1, now - state.lastFrameAt);
    state.lastFrameAt = now;
    state.frameSamples.push(1000 / delta);
    if (state.frameSamples.length > 45) state.frameSamples.shift();
    state.fps = average(state.frameSamples);

    if (config.hideCursor) updateCursor(now);
    if (config.idleReset && (now - state.lastActivityAt) / 1000 > config.idleReset) reset();
    if (state.panelOpen) updatePanel();
    return api;
  }

  function destroy() {
    state.listeners.forEach(({ target, type, handler, opts }) => {
      target.removeEventListener(type, handler, opts);
    });
    state.listeners = [];
    document.documentElement.classList.remove("p5em-active", "p5em-hide-cursor");
    state.panel?.remove();
  }

  function reset() {
    state.lastActivityAt = performance.now();
    if (typeof config.onReset === "function") {
      config.onReset();
      return;
    }
    writeReloadCount(state.reloadCount + 1);
    window.location.reload();
  }

  function togglePanel(force) {
    if (!state.panel) return;
    state.panelOpen = typeof force === "boolean" ? force : !state.panelOpen;
    state.panel.hidden = !state.panelOpen;
    updatePanel();
  }

  async function enterFullscreen() {
    const el = document.documentElement;
    if (!document.fullscreenElement && el.requestFullscreen) {
      await el.requestFullscreen({ navigationUI: "hide" }).catch(() => {});
    }
  }

  async function exitFullscreen() {
    if (document.fullscreenElement && document.exitFullscreen) {
      await document.exitFullscreen().catch(() => {});
    }
  }

  function screenshot() {
    const canvas = document.querySelector("canvas");
    if (!canvas || typeof canvas.toDataURL !== "function") return null;
    const dataUrl = canvas.toDataURL("image/png");
    if (typeof config.onScreenshot === "function") config.onScreenshot(dataUrl);
    else downloadDataUrl(dataUrl, safeName(config.title) + "-screenshot.png");
    return dataUrl;
  }

  function diagnostics() {
    const memory = performance.memory?.usedJSHeapSize
      ? Math.round(performance.memory.usedJSHeapSize / 1048576)
      : null;
    const data = {
      title: config.title,
      artist: config.artist,
      seed: config.seed,
      uptimeSeconds: Math.round((performance.now() - state.startedAt) / 1000),
      fps: Math.round(state.fps * 10) / 10,
      width: window.innerWidth,
      height: window.innerHeight,
      devicePixelRatio: window.devicePixelRatio,
      fullscreen: Boolean(document.fullscreenElement),
      contextMenuLocked: Boolean(config.disableContextMenu),
      touchGesturesLocked: Boolean(config.disableTouchGestures),
      reloadCount: state.reloadCount,
      memoryMB: memory
    };
    if (typeof config.onDiagnostics === "function") config.onDiagnostics(data);
    return data;
  }

  function applyPixelRatio(p5Instance) {
    if (!config.maxPixelRatio) return window.devicePixelRatio;
    const ratio = Math.min(window.devicePixelRatio || 1, config.maxPixelRatio);
    if (p5Instance?.pixelDensity) p5Instance.pixelDensity(ratio);
    else if (window.pixelDensity) window.pixelDensity(ratio);
    return ratio;
  }

  function installInputLocks() {
    if (config.disableContextMenu) {
      add(document, "contextmenu", (event) => event.preventDefault());
    }

    if (config.disableTouchGestures) {
      document.documentElement.classList.add("p5em-lock-touch");
      const blockGesture = (event) => event.preventDefault();
      add(document, "gesturestart", blockGesture, { passive: false });
      add(document, "gesturechange", blockGesture, { passive: false });
      add(document, "gestureend", blockGesture, { passive: false });
      add(document, "touchmove", (event) => {
        if (!state.panel?.contains(event.target)) event.preventDefault();
      }, { passive: false });
    }

    if (config.preventScroll) {
      const blockScrollKeys = new Set(["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "PageUp", "PageDown", "Home", "End", " "]);
      add(window, "wheel", (event) => event.preventDefault(), { passive: false });
      add(window, "keydown", (event) => {
        if (blockScrollKeys.has(event.key) && !state.panel?.contains(event.target)) event.preventDefault();
      });
    }
  }

  function installKeyboard() {
    add(document, "keydown", (event) => {
      if (event.key.toLowerCase() === config.panelKey.toLowerCase() && event.shiftKey) {
        event.preventDefault();
        togglePanel();
      }
      if (state.panelOpen && event.key === "Escape") togglePanel(false);
    });
  }

  function installActivityTracking() {
    const mark = () => {
      state.lastActivityAt = performance.now();
      if (state.cursorHidden) {
        state.cursorHidden = false;
        document.documentElement.classList.remove("p5em-hide-cursor");
      }
    };
    ["pointermove", "pointerdown", "keydown", "touchstart"].forEach((type) => add(document, type, mark, { passive: true }));
  }

  function updateCursor(now) {
    const shouldHide = now - state.lastActivityAt > config.cursorIdleMs && !state.panelOpen;
    if (shouldHide !== state.cursorHidden) {
      state.cursorHidden = shouldHide;
      document.documentElement.classList.toggle("p5em-hide-cursor", shouldHide);
    }
  }

  function maybeEnterFullscreen() {
    if (config.fullscreen) enterFullscreen();
  }

  function updatePanel() {
    if (!state.panel) return;
    const d = diagnostics();
    setText("p5em-title", d.title);
    setText("p5em-artist", d.artist || "Unspecified artist");
    setText("p5em-seed", d.seed ?? "Unlocked");
    setText("p5em-resolution", `${d.width} x ${d.height}`);
    setText("p5em-dpr", d.devicePixelRatio.toFixed(2));
    setText("p5em-fps", d.fps.toFixed(1));
    setText("p5em-fullscreen", d.fullscreen ? "Active" : "Inactive");
    setText("p5em-context", d.contextMenuLocked ? "Disabled" : "Allowed");
    setText("p5em-touch", d.touchGesturesLocked ? "Disabled" : "Allowed");
    setText("p5em-uptime", formatDuration(d.uptimeSeconds));
    setText("p5em-memory", d.memoryMB === null ? "Unavailable" : `${d.memoryMB} MB`);
    setText("p5em-reloads", String(d.reloadCount));
  }

  function setText(key, value) {
    const el = state.panel?.querySelector(`[data-p5em="${key}"]`);
    if (el) el.textContent = value;
  }

  function add(target, type, handler, opts) {
    target.addEventListener(type, handler, opts);
    state.listeners.push({ target, type, handler, opts });
  }

  const api = {
    setup,
    tick,
    destroy,
    reset,
    togglePanel,
    enterFullscreen,
    exitFullscreen,
    screenshot,
    diagnostics,
    applyPixelRatio
  };

  return api;
}

function createPanel(config, api) {
  const panel = document.createElement("aside");
  panel.id = PANEL_ID;
  panel.hidden = true;
  panel.setAttribute("aria-label", "p5 Exhibition Mode diagnostics");
  panel.innerHTML = `
    <div class="p5em-panel-header">
      <span>Phenomena Exhibition Mode</span>
      <button type="button" data-action="close" aria-label="Close panel">×</button>
    </div>
    <div class="p5em-panel-grid">
      ${section("Artwork", [["Title", "p5em-title"], ["Artist", "p5em-artist"], ["Seed", "p5em-seed"]])}
      ${section("Display", [["Resolution", "p5em-resolution"], ["DPR", "p5em-dpr"], ["FPS", "p5em-fps"], ["Fullscreen", "p5em-fullscreen"]])}
      ${section("Input Locks", [["Context Menu", "p5em-context"], ["Touch Gestures", "p5em-touch"]])}
      ${section("System", [["Uptime", "p5em-uptime"], ["Memory", "p5em-memory"], ["Reloads", "p5em-reloads"]])}
    </div>
    <div class="p5em-panel-actions">
      <button type="button" data-action="fullscreen">Fullscreen</button>
      <button type="button" data-action="reset">Reset</button>
      <button type="button" data-action="screenshot">Screenshot</button>
      <button type="button" data-action="diagnostics">Diagnostics</button>
    </div>
    <p class="p5em-panel-hint">Shift + ${config.panelKey.toUpperCase()} toggles this panel.</p>
  `;
  panel.addEventListener("pointerdown", (event) => event.stopPropagation());
  panel.addEventListener("click", (event) => {
    const action = event.target?.dataset?.action;
    if (action === "close") api.togglePanel(false);
    if (action === "fullscreen") api.enterFullscreen();
    if (action === "reset") api.reset();
    if (action === "screenshot") api.screenshot();
    if (action === "diagnostics") copyDiagnostics(api.diagnostics());
  });
  return panel;
}

function section(title, rows) {
  return `
    <section>
      <h2>${title}</h2>
      ${rows.map(([label, key]) => `<div><span>${label}</span><strong data-p5em="${key}"></strong></div>`).join("")}
    </section>
  `;
}

function injectStyles() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
    .p5em-active {
      background: #050505;
      overscroll-behavior: none;
    }
    .p5em-lock-touch,
    .p5em-lock-touch body,
    .p5em-lock-touch canvas {
      touch-action: none;
      -webkit-user-select: none;
      user-select: none;
      -webkit-touch-callout: none;
    }
    .p5em-hide-cursor,
    .p5em-hide-cursor * {
      cursor: none !important;
    }
    #${PANEL_ID} {
      position: fixed;
      right: 18px;
      bottom: 18px;
      z-index: 2147483647;
      width: min(420px, calc(100vw - 36px));
      max-height: calc(100vh - 36px);
      overflow: auto;
      padding: 18px;
      color: rgba(255,255,255,0.9);
      background: rgba(7,7,7,0.86);
      border: 1px solid rgba(255,255,255,0.16);
      backdrop-filter: blur(18px);
      box-shadow: 0 24px 80px rgba(0,0,0,0.42);
      font: 400 12px/1.45 Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      letter-spacing: 0.01em;
    }
    #${PANEL_ID}[hidden] {
      display: none;
    }
    .p5em-panel-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 18px;
      padding-bottom: 14px;
      border-bottom: 1px solid rgba(255,255,255,0.14);
      font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      font-size: 10px;
      letter-spacing: 0.16em;
      text-transform: uppercase;
    }
    .p5em-panel-header button,
    .p5em-panel-actions button {
      color: inherit;
      background: transparent;
      border: 1px solid rgba(255,255,255,0.18);
      border-radius: 0;
      font: inherit;
      cursor: pointer;
    }
    .p5em-panel-header button {
      width: 28px;
      height: 28px;
      font-size: 18px;
      line-height: 1;
    }
    .p5em-panel-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 16px;
      margin-top: 18px;
    }
    .p5em-panel-grid section {
      border-top: 1px solid rgba(255,255,255,0.14);
      padding-top: 12px;
    }
    .p5em-panel-grid h2 {
      margin: 0 0 10px;
      color: rgba(255,255,255,0.58);
      font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      font-size: 9px;
      letter-spacing: 0.14em;
      text-transform: uppercase;
    }
    .p5em-panel-grid div {
      display: flex;
      justify-content: space-between;
      gap: 14px;
      padding: 4px 0;
    }
    .p5em-panel-grid span {
      color: rgba(255,255,255,0.48);
    }
    .p5em-panel-grid strong {
      max-width: 52%;
      color: rgba(255,255,255,0.92);
      font-weight: 400;
      text-align: right;
    }
    .p5em-panel-actions {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      margin-top: 18px;
    }
    .p5em-panel-actions button {
      padding: 9px 11px;
      font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      font-size: 9px;
      letter-spacing: 0.13em;
      text-transform: uppercase;
    }
    .p5em-panel-hint {
      margin: 14px 0 0;
      color: rgba(255,255,255,0.42);
      font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      font-size: 9px;
      letter-spacing: 0.08em;
      text-transform: uppercase;
    }
    @media (max-width: 560px) {
      #${PANEL_ID} {
        left: 12px;
        right: 12px;
        bottom: 12px;
        width: auto;
      }
      .p5em-panel-grid {
        grid-template-columns: 1fr;
      }
    }
  `;
  document.head.appendChild(style);
}

function average(values) {
  return values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length);
}

function formatDuration(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return [h, m, s].map((value) => String(value).padStart(2, "0")).join(":");
}

function readReloadCount() {
  return Number(sessionStorage.getItem("p5em-reload-count") || 0);
}

function writeReloadCount(count) {
  sessionStorage.setItem("p5em-reload-count", String(count));
}

function safeName(name) {
  return String(name || "artwork").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function downloadDataUrl(dataUrl, filename) {
  const a = document.createElement("a");
  a.href = dataUrl;
  a.download = filename;
  a.click();
}

async function copyDiagnostics(data) {
  const text = JSON.stringify(data, null, 2);
  if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(text).catch(() => {});
  else console.info("p5 Exhibition Mode diagnostics", data);
}
