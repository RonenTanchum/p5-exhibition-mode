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
    intervalSeconds: 120,
    randomHash: false,
    hashParam: "hash",
    startIndex: 0
  },
  target: null
};

export { createSensorBridge } from "./sensors.js";

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
    playlistFrame: null,
    playlistEnabled: false,
    playlistIndex: 0,
    playlistLastChangeAt: performance.now(),
    lowFpsSince: null,
    droppedFrames: 0,
    logs: [],
    lastHealthAt: 0,
    raf: null,
    cursorHidden: false
  };

  function setup() {
    injectStyles();
    installInputLocks();
    installKeyboard();
    installActivityTracking();
    installRuntimeLogging();
    applyPixelRatio();
    applyRotation();
    applyAccessibility();
    setupPlaylist();

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
    else if (state.cursorHidden) showCursor();
    if (delta > 250) {
      state.droppedFrames += 1;
      log("warn", `Dropped frame ${Math.round(delta)}ms`);
    }
    tickPlaylist(now);
    tickWatchdog(now);
    tickHealthCheck(now);
    if (config.idleReset && (now - state.lastActivityAt) / 1000 > config.idleReset) reset();
    if (state.panelOpen) updatePanel();
    return api;
  }

  function destroy() {
    state.listeners.forEach(({ target, type, handler, opts }) => {
      target.removeEventListener(type, handler, opts);
    });
    state.listeners = [];
    document.documentElement.classList.remove("p5em-active", "p5em-hide-cursor", "p5em-lock-touch");
    document.documentElement.style.removeProperty("--p5em-rotation");
    state.panel?.remove();
    state.playlistFrame?.remove();
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
      rotation: normalizeRotation(config.rotation),
      contextMenuLocked: Boolean(config.disableContextMenu),
      touchGesturesLocked: Boolean(config.disableTouchGestures),
      cursorHiddenEnabled: Boolean(config.hideCursor),
      reducedMotion: Boolean(accessibilityConfig().reducedMotion),
      highContrast: Boolean(accessibilityConfig().highContrast),
      watchdogEnabled: Boolean(watchdogConfig().enabled),
      droppedFrames: state.droppedFrames,
      logCount: state.logs.length,
      playlistEnabled: Boolean(state.playlistEnabled),
      playlistIndex: state.playlistIndex,
      playlistCount: playlistItems().length,
      playlistIntervalSeconds: playlistConfig().intervalSeconds,
      playlistRandomHash: Boolean(playlistConfig().randomHash),
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
    updateInputLockClasses();
    add(document, "contextmenu", (event) => {
      if (config.disableContextMenu) event.preventDefault();
    });

    const blockGesture = (event) => {
      if (config.disableTouchGestures) event.preventDefault();
    };
    add(document, "gesturestart", blockGesture, { passive: false });
    add(document, "gesturechange", blockGesture, { passive: false });
    add(document, "gestureend", blockGesture, { passive: false });
    add(document, "touchmove", (event) => {
      if (config.disableTouchGestures && !state.panel?.contains(event.target)) event.preventDefault();
    }, { passive: false });

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

  function showCursor() {
    state.cursorHidden = false;
    document.documentElement.classList.remove("p5em-hide-cursor");
  }

  function updateInputLockClasses() {
    document.documentElement.classList.toggle("p5em-lock-touch", Boolean(config.disableTouchGestures));
  }

  function setOption(key, value) {
    config[key] = value;
    if (key === "disableTouchGestures") updateInputLockClasses();
    if (key === "hideCursor" && !value) showCursor();
    if (key === "rotation") {
      applyRotation();
      if (config.refreshOnRotation) refreshArtwork("rotation");
    }
    updatePanel();
    return api;
  }

  function setRotation(degrees) {
    const previous = normalizeRotation(config.rotation);
    config.rotation = normalizeRotation(degrees);
    applyRotation();
    if (config.refreshOnRotation && previous !== config.rotation) refreshArtwork("rotation");
    updatePanel();
    return api;
  }

  function setAccessibility(next = {}) {
    config.accessibility = { ...accessibilityConfig(), ...next };
    applyAccessibility();
    updatePanel();
    return api;
  }

  function applyRotation() {
    document.documentElement.style.setProperty("--p5em-rotation", `${normalizeRotation(config.rotation)}deg`);
  }

  function refreshArtwork(reason = "manual") {
    log("info", `Refreshing artwork after ${reason}`);
    if (state.playlistEnabled && state.playlistFrame?.src) {
      state.playlistFrame.src = state.playlistFrame.src;
      return api;
    }
    window.dispatchEvent(new CustomEvent("p5em:refresh", { detail: { reason, rotation: normalizeRotation(config.rotation) } }));
    if (typeof window.windowResized === "function") window.windowResized();
    if (typeof window.resizeCanvas === "function") window.resizeCanvas(window.innerWidth, window.innerHeight);
    return api;
  }

  function applyAccessibility() {
    const a = accessibilityConfig();
    document.documentElement.classList.toggle("p5em-reduced-motion", Boolean(a.reducedMotion));
    document.documentElement.classList.toggle("p5em-high-contrast", Boolean(a.highContrast));
  }

  function setupPlaylist() {
    const playlist = playlistConfig();
    state.playlistEnabled = Boolean(playlist.enabled && playlistItems().length);
    state.playlistIndex = Math.max(0, playlist.startIndex || 0) % Math.max(1, playlistItems().length);
    if (!playlistItems().length) return;

    state.playlistFrame = document.createElement("iframe");
    state.playlistFrame.className = "p5em-playlist-frame";
    state.playlistFrame.title = "Exhibition playlist artwork";
    state.playlistFrame.setAttribute("allow", "autoplay; fullscreen");
    state.playlistFrame.setAttribute("referrerpolicy", "no-referrer-when-downgrade");
    state.playlistFrame.hidden = !state.playlistEnabled;
    document.body.prepend(state.playlistFrame);

    if (state.playlistEnabled) loadPlaylistItem(state.playlistIndex);
  }

  function tickPlaylist(now) {
    if (!state.playlistEnabled || !state.playlistFrame) return;
    const interval = Math.max(5, Number(playlistConfig().intervalSeconds) || 120) * 1000;
    if (now - state.playlistLastChangeAt >= interval) nextPlaylistItem();
  }

  function playlistConfig() {
    if (Array.isArray(config.playlist)) return { ...DEFAULTS.playlist, enabled: true, items: config.playlist };
    return { ...DEFAULTS.playlist, ...(config.playlist || {}) };
  }

  function accessibilityConfig() {
    return { ...DEFAULTS.accessibility, ...(config.accessibility || {}) };
  }

  function watchdogConfig() {
    return { ...DEFAULTS.watchdog, ...(config.watchdog || {}) };
  }

  function loggingConfig() {
    return { ...DEFAULTS.logging, ...(config.logging || {}) };
  }

  function healthCheckConfig() {
    return { ...DEFAULTS.healthCheck, ...(config.healthCheck || {}) };
  }

  function playlistItems() {
    return playlistConfig().items.filter(Boolean);
  }

  function loadPlaylistItem(index = state.playlistIndex) {
    const items = playlistItems();
    if (!items.length || !state.playlistFrame) return null;
    state.playlistIndex = ((index % items.length) + items.length) % items.length;
    state.playlistLastChangeAt = performance.now();
    const url = buildPlaylistUrl(items[state.playlistIndex], playlistConfig());
    state.playlistFrame.src = url;
    state.playlistFrame.hidden = false;
    updatePanel();
    return url;
  }

  function nextPlaylistItem() {
    return loadPlaylistItem(state.playlistIndex + 1);
  }

  function previousPlaylistItem() {
    return loadPlaylistItem(state.playlistIndex - 1);
  }

  function togglePlaylist(force) {
    state.playlistEnabled = typeof force === "boolean" ? force : !state.playlistEnabled;
    if (state.playlistFrame) state.playlistFrame.hidden = !state.playlistEnabled;
    if (state.playlistEnabled) loadPlaylistItem(state.playlistIndex);
    updatePanel();
    return api;
  }

  function setPlaylistInterval(seconds) {
    config.playlist = { ...playlistConfig(), intervalSeconds: Math.max(5, Number(seconds) || 120) };
    state.playlistLastChangeAt = performance.now();
    updatePanel();
    return api;
  }

  function setPlaylistRandomHash(value) {
    config.playlist = { ...playlistConfig(), randomHash: Boolean(value) };
    if (state.playlistEnabled) loadPlaylistItem(state.playlistIndex);
    updatePanel();
    return api;
  }

  function setPlaylistItems(items) {
    const normalized = normalizePlaylistItems(items);
    config.playlist = { ...playlistConfig(), items: normalized };
    state.playlistIndex = 0;

    if (normalized.length && !state.playlistFrame) setupPlaylist();
    if (!normalized.length) {
      state.playlistEnabled = false;
      if (state.playlistFrame) state.playlistFrame.hidden = true;
    } else if (state.playlistEnabled) {
      loadPlaylistItem(0);
    }

    updatePanel();
    return api;
  }

  function tickWatchdog(now) {
    const watchdog = watchdogConfig();
    if (!watchdog.enabled || state.fps <= 0) return;
    if (state.fps >= watchdog.minFps) {
      state.lowFpsSince = null;
      return;
    }
    state.lowFpsSince ??= now;
    if ((now - state.lowFpsSince) / 1000 >= watchdog.seconds) {
      log("error", `Watchdog triggered below ${watchdog.minFps} FPS`);
      if (watchdog.reload) reset();
    }
  }

  function tickHealthCheck(now) {
    const health = healthCheckConfig();
    if (!health.enabled || !health.url) return;
    const interval = Math.max(10, Number(health.intervalSeconds) || 60) * 1000;
    if (now - state.lastHealthAt < interval) return;
    state.lastHealthAt = now;
    const payload = JSON.stringify(diagnostics());
    if (navigator.sendBeacon) {
      navigator.sendBeacon(health.url, new Blob([payload], { type: "application/json" }));
    } else {
      fetch(health.url, { method: "POST", body: payload, keepalive: true, mode: "no-cors" }).catch(() => {});
    }
  }

  function installRuntimeLogging() {
    add(window, "error", (event) => log("error", event.message || "Runtime error"));
    add(window, "unhandledrejection", (event) => log("error", event.reason?.message || "Unhandled promise rejection"));
    add(document, "webglcontextlost", (event) => {
      log("error", "WebGL context lost");
      event.preventDefault();
    }, { capture: true });
  }

  function log(level, message, detail = null) {
    if (!loggingConfig().enabled) return;
    state.logs.push({
      time: new Date().toISOString(),
      level,
      message,
      detail
    });
    const max = Math.max(20, Number(loggingConfig().maxEntries) || 300);
    if (state.logs.length > max) state.logs.splice(0, state.logs.length - max);
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
    setText("p5em-rotation", `${d.rotation}deg`);
    setText("p5em-context", d.contextMenuLocked ? "Disabled" : "Allowed");
    setText("p5em-touch", d.touchGesturesLocked ? "Disabled" : "Allowed");
    setText("p5em-cursor", d.cursorHiddenEnabled ? "Enabled" : "Disabled");
    setText("p5em-motion", d.reducedMotion ? "Reduced" : "Normal");
    setText("p5em-contrast", d.highContrast ? "High" : "Normal");
    setText("p5em-watchdog", d.watchdogEnabled ? "Enabled" : "Disabled");
    setText("p5em-dropped", String(d.droppedFrames));
    setText("p5em-logs", String(d.logCount));
    setText("p5em-playlist", d.playlistEnabled ? `${d.playlistIndex + 1} / ${d.playlistCount}` : "Inactive");
    setText("p5em-playlist-interval", `${d.playlistIntervalSeconds}s`);
    setText("p5em-playlist-hash", d.playlistRandomHash ? "Enabled" : "Disabled");
    setText("p5em-uptime", formatDuration(d.uptimeSeconds));
    setText("p5em-memory", d.memoryMB === null ? "Unavailable" : `${d.memoryMB} MB`);
    setText("p5em-reloads", String(d.reloadCount));
    setChecked("context", d.contextMenuLocked);
    setChecked("touch", d.touchGesturesLocked);
    setChecked("cursor", d.cursorHiddenEnabled);
    setChecked("playlist", d.playlistEnabled);
    setChecked("playlist-hash", d.playlistRandomHash);
    setChecked("reduced-motion", d.reducedMotion);
    setChecked("high-contrast", d.highContrast);
    const interval = state.panel.querySelector("[data-input='playlist-interval']");
    if (interval && document.activeElement !== interval) interval.value = d.playlistIntervalSeconds;
    const rotation = state.panel.querySelector("[data-input='rotation']");
    if (rotation && document.activeElement !== rotation) rotation.value = d.rotation;
    const playlistEditor = state.panel.querySelector("[data-input='playlist-items']");
    if (playlistEditor && document.activeElement !== playlistEditor) {
      playlistEditor.value = playlistItems().map((item) => typeof item === "string" ? item : item.url).join("\n");
    }
  }

  function setText(key, value) {
    const el = state.panel?.querySelector(`[data-p5em="${key}"]`);
    if (el) el.textContent = value;
  }

  function setChecked(key, value) {
    const el = state.panel?.querySelector(`[data-toggle="${key}"]`);
    if (el) el.checked = Boolean(value);
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
    applyPixelRatio,
    setOption,
    setRotation,
    setAccessibility,
    refreshArtwork,
    togglePlaylist,
    nextPlaylistItem,
    previousPlaylistItem,
    setPlaylistInterval,
    setPlaylistRandomHash,
    setPlaylistItems
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
      ${section("Display", [["Resolution", "p5em-resolution"], ["DPR", "p5em-dpr"], ["FPS", "p5em-fps"], ["Fullscreen", "p5em-fullscreen"], ["Rotation", "p5em-rotation"]])}
      ${section("Input Locks", [["Context Menu", "p5em-context"], ["Touch Gestures", "p5em-touch"], ["Cursor Hide", "p5em-cursor"], ["Motion", "p5em-motion"], ["Contrast", "p5em-contrast"]])}
      ${section("Playlist", [["Status", "p5em-playlist"], ["Interval", "p5em-playlist-interval"], ["Random Hash", "p5em-playlist-hash"]])}
      ${section("System", [["Uptime", "p5em-uptime"], ["Memory", "p5em-memory"], ["Reloads", "p5em-reloads"], ["Watchdog", "p5em-watchdog"], ["Dropped", "p5em-dropped"], ["Logs", "p5em-logs"]])}
    </div>
    <div class="p5em-panel-controls">
      ${toggle("context", "Context menu lock")}
      ${toggle("touch", "Touch gestures lock")}
      ${toggle("cursor", "Hide cursor")}
      ${toggle("reduced-motion", "Reduced motion")}
      ${toggle("high-contrast", "High contrast")}
      ${toggle("playlist", "Playlist mode")}
      ${toggle("playlist-hash", "Random ?hash=")}
      <label class="p5em-number-control">
        <span>Interval</span>
        <input data-input="playlist-interval" type="number" min="5" step="5" value="${playlistConfigFrom(config).intervalSeconds}">
      </label>
      <label class="p5em-number-control">
        <span>Rotate</span>
        <select data-input="rotation">
          <option value="0">0</option>
          <option value="90">90 CW</option>
          <option value="270">90 CCW</option>
          <option value="180">180</option>
        </select>
      </label>
    </div>
    <section class="p5em-playlist-editor">
      <h2>Playlist URLs</h2>
      <textarea data-input="playlist-items" spellcheck="false" placeholder="./local-sketch/index.html&#10;https://example.com/live-artwork"></textarea>
      <p>One local HTML path or web URL per line.</p>
    </section>
    <div class="p5em-panel-actions">
      <button type="button" data-action="fullscreen">Fullscreen</button>
      <button type="button" data-action="reset">Reset</button>
      <button type="button" data-action="screenshot">Screenshot</button>
      <button type="button" data-action="diagnostics">Diagnostics</button>
      <button type="button" data-action="playlist-apply">Apply URLs</button>
      <button type="button" data-action="playlist-clear">Clear URLs</button>
      <button type="button" data-action="playlist-prev">Prev URL</button>
      <button type="button" data-action="playlist-next">Next URL</button>
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
    if (action === "playlist-apply") {
      const value = panel.querySelector("[data-input='playlist-items']")?.value || "";
      api.setPlaylistItems(parsePlaylistText(value));
    }
    if (action === "playlist-clear") api.setPlaylistItems([]);
    if (action === "playlist-prev") api.previousPlaylistItem();
    if (action === "playlist-next") api.nextPlaylistItem();
  });
  panel.addEventListener("change", (event) => {
    const toggle = event.target?.dataset?.toggle;
    if (toggle === "context") api.setOption("disableContextMenu", event.target.checked);
    if (toggle === "touch") api.setOption("disableTouchGestures", event.target.checked);
    if (toggle === "cursor") api.setOption("hideCursor", event.target.checked);
    if (toggle === "reduced-motion") api.setAccessibility({ reducedMotion: event.target.checked });
    if (toggle === "high-contrast") api.setAccessibility({ highContrast: event.target.checked });
    if (toggle === "playlist") api.togglePlaylist(event.target.checked);
    if (toggle === "playlist-hash") api.setPlaylistRandomHash(event.target.checked);

    if (event.target?.dataset?.input === "playlist-interval") {
      api.setPlaylistInterval(event.target.value);
    }
    if (event.target?.dataset?.input === "rotation") {
      api.setRotation(event.target.value);
    }
  });
  return panel;
}

function playlistConfigFrom(config) {
  if (Array.isArray(config.playlist)) return { ...DEFAULTS.playlist, enabled: true, items: config.playlist };
  return { ...DEFAULTS.playlist, ...(config.playlist || {}) };
}

function section(title, rows) {
  return `
    <section>
      <h2>${title}</h2>
      ${rows.map(([label, key]) => `<div><span>${label}</span><strong data-p5em="${key}"></strong></div>`).join("")}
    </section>
  `;
}

function toggle(key, label) {
  return `
    <label class="p5em-toggle">
      <input type="checkbox" data-toggle="${key}">
      <span>${label}</span>
    </label>
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
    .p5em-lock-touch canvas,
    .p5em-lock-touch iframe {
      touch-action: none;
      -webkit-user-select: none;
      user-select: none;
      -webkit-touch-callout: none;
    }
    .p5em-hide-cursor,
    .p5em-hide-cursor * {
      cursor: none !important;
    }
    .p5em-reduced-motion *,
    .p5em-reduced-motion *::before,
    .p5em-reduced-motion *::after {
      animation-duration: 0.001ms !important;
      animation-iteration-count: 1 !important;
      scroll-behavior: auto !important;
      transition-duration: 0.001ms !important;
    }
    .p5em-high-contrast canvas,
    .p5em-high-contrast iframe {
      filter: contrast(1.2) saturate(0.9);
    }
    .p5em-playlist-frame {
      position: fixed;
      inset: 0;
      z-index: 2;
      width: 100vw;
      height: 100vh;
      border: 0;
      background: #050505;
      transform: rotate(var(--p5em-rotation, 0deg));
      transform-origin: center center;
    }
    .p5em-playlist-frame[hidden] {
      display: none;
    }
    body > canvas {
      position: relative;
      z-index: 1;
      transform: rotate(var(--p5em-rotation, 0deg));
      transform-origin: center center;
    }
    #${PANEL_ID} {
      position: fixed;
      right: 12px;
      top: 12px;
      bottom: 12px;
      z-index: 2147483647;
      box-sizing: border-box;
      width: min(760px, calc(100vw - 24px));
      overflow: hidden;
      display: flex;
      flex-direction: column;
      padding: 14px;
      color: rgba(255,255,255,0.9);
      background: rgba(7,7,7,0.86);
      border: 1px solid rgba(255,255,255,0.16);
      backdrop-filter: blur(18px);
      box-shadow: 0 24px 80px rgba(0,0,0,0.42);
      font: 400 11px/1.35 Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
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
      padding-bottom: 10px;
      flex: 0 0 auto;
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
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 10px 14px;
      margin-top: 12px;
      flex: 0 0 auto;
    }
    .p5em-panel-grid section {
      border-top: 1px solid rgba(255,255,255,0.14);
      padding-top: 8px;
    }
    .p5em-panel-grid h2 {
      margin: 0 0 6px;
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
      padding: 2px 0;
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
      gap: 7px;
      margin-top: 10px;
      flex: 0 0 auto;
    }
    .p5em-panel-controls {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 7px 12px;
      margin-top: 10px;
      padding-top: 10px;
      flex: 0 0 auto;
      border-top: 1px solid rgba(255,255,255,0.14);
    }
    .p5em-playlist-editor {
      margin-top: 10px;
      padding-top: 10px;
      flex: 1 1 auto;
      min-height: 0;
      display: flex;
      flex-direction: column;
      border-top: 1px solid rgba(255,255,255,0.14);
    }
    .p5em-playlist-editor h2 {
      margin: 0 0 6px;
      color: rgba(255,255,255,0.58);
      font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      font-size: 9px;
      letter-spacing: 0.14em;
      text-transform: uppercase;
    }
    .p5em-playlist-editor textarea {
      box-sizing: border-box;
      width: 100%;
      flex: 1 1 auto;
      min-height: 54px;
      max-height: 110px;
      resize: vertical;
      padding: 8px;
      color: rgba(255,255,255,0.9);
      background: rgba(255,255,255,0.04);
      border: 1px solid rgba(255,255,255,0.18);
      border-radius: 0;
      font: 10px/1.5 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    }
    .p5em-playlist-editor p {
      margin: 6px 0 0;
      color: rgba(255,255,255,0.42);
      font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      font-size: 9px;
      letter-spacing: 0.08em;
      text-transform: uppercase;
    }
    .p5em-toggle,
    .p5em-number-control {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
      color: rgba(255,255,255,0.7);
      font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      font-size: 9px;
      letter-spacing: 0.1em;
      text-transform: uppercase;
    }
    .p5em-toggle input {
      width: 15px;
      height: 15px;
      accent-color: #ffffff;
    }
    .p5em-number-control input,
    .p5em-number-control select {
      width: 64px;
      padding: 6px 7px;
      color: rgba(255,255,255,0.9);
      background: rgba(255,255,255,0.04);
      border: 1px solid rgba(255,255,255,0.18);
      border-radius: 0;
      font: inherit;
      text-align: right;
    }
    .p5em-panel-actions button {
      padding: 7px 9px;
      font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      font-size: 9px;
      letter-spacing: 0.13em;
      text-transform: uppercase;
    }
    .p5em-panel-hint {
      margin: 8px 0 0;
      flex: 0 0 auto;
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
        top: 12px;
        bottom: 12px;
        width: auto;
      }
      .p5em-panel-grid {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }
      .p5em-panel-controls {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }
    }
    @media (max-width: 420px) {
      .p5em-panel-grid,
      .p5em-panel-controls {
        grid-template-columns: 1fr;
      }
      .p5em-playlist-editor textarea {
        max-height: 72px;
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

function buildPlaylistUrl(input, playlist) {
  const item = typeof input === "string" ? { url: input } : input;
  let url = item.url || "";
  const randomHash = item.randomHash ?? playlist.randomHash;
  const hashParam = item.hashParam || playlist.hashParam || "hash";
  if (!randomHash) return url;

  const value = randomHashValue();
  const [base, fragment] = url.split("#");
  const separator = base.includes("?") ? "&" : "?";
  const nextBase = `${base}${separator}${encodeURIComponent(hashParam)}=${encodeURIComponent(value)}`;
  return fragment === undefined ? nextBase : `${nextBase}#${fragment}`;
}

function parsePlaylistText(value) {
  return String(value || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"));
}

function normalizePlaylistItems(items) {
  if (typeof items === "string") return parsePlaylistText(items);
  if (!Array.isArray(items)) return [];
  return items
    .map((item) => {
      if (typeof item === "string") return item.trim();
      if (item && typeof item === "object" && item.url) return item;
      return null;
    })
    .filter(Boolean);
}

function randomHashValue() {
  const bytes = new Uint32Array(2);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (value) => value.toString(16).padStart(8, "0")).join("");
}

function normalizeRotation(value) {
  const degrees = Number(value) || 0;
  const normalized = ((degrees % 360) + 360) % 360;
  if (normalized === 90 || normalized === 180 || normalized === 270) return normalized;
  return 0;
}
