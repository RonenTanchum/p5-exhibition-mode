const DEFAULTS = {
  title: "Untitled Artwork",
  artist: "",
  year: "",
  showTitleOverlay: false,
  titleOverlayFont: "mono",
  titleOverlayColor: "white",
  titleOverlayPosition: "top-left",
  titleOverlaySize: 11,
  titleOverlayBold: false,
  overlayLayout: "separate",
  cardQrPlacement: "below",
  overlaySafeArea: 18,
  qrLink: "",
  showQr: false,
  qrPosition: "bottom-right",
  qrSize: 96,
  qrProvider: "https://api.qrserver.com/v1/create-qr-code/",
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
    intervalUnit: "seconds",
    hashIntervalSeconds: 120,
    hashIntervalUnit: "seconds",
    randomHash: false,
    hashParam: "hash",
    startIndex: 0
  },
  localFiles: {
    endpoint: "/__p5em/files",
    fallbackFilePreview: true
  },
  persist: true,
  storageKey: "p5-exhibition-mode-config",
  target: null
};

export { createSensorBridge } from "./sensors.js";

const PANEL_ID = "p5-exhibition-mode-panel";
const STYLE_ID = "p5-exhibition-mode-style";

export function createExhibitionMode(options = {}) {
  const baseConfig = mergeRuntimeConfig(DEFAULTS, options);
  const savedConfig = baseConfig.persist ? readRuntimeConfig(baseConfig.storageKey) : null;
  const config = savedConfig ? mergeRuntimeConfig(baseConfig, savedConfig) : baseConfig;
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
    playlistLastHashAt: performance.now(),
    lowFpsSince: null,
    droppedFrames: 0,
    logs: [],
    lastHealthAt: 0,
    raf: null,
    cursorHidden: false,
    currentHash: readUrlHash(new URL(window.location.href), DEFAULTS.playlist.hashParam),
    currentSource: window.location.href,
    hashRecording: false,
    hashRecords: []
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
    applyKioskMode();
    applyCursorMode();
    applyOverlaySafeArea();
    applyTitleOverlay();
    applyQrOverlay();
    applyOverlayCard();
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
    document.documentElement.classList.remove("p5em-active", "p5em-hide-cursor", "p5em-lock-touch", "p5em-kiosk");
    document.documentElement.classList.remove("p5em-playlist-active");
    document.documentElement.style.removeProperty("--p5em-rotation");
    state.panel?.remove();
    state.playlistFrame?.remove();
    document.getElementById("p5em-title-overlay")?.remove();
    document.getElementById("p5em-qr-overlay")?.remove();
    document.getElementById("p5em-card-overlay")?.remove();
    document.getElementById("p5em-overlay-layer")?.remove();
    document.documentElement.style.removeProperty("--p5em-overlay-safe-area");
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
    if (state.panelOpen) syncPlaylistRows(state.panel, playlistItems(), { force: true });
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
      year: config.year,
      titleOverlayVisible: Boolean(config.showTitleOverlay),
      titleOverlayFont: config.titleOverlayFont,
      titleOverlayColor: config.titleOverlayColor,
      titleOverlayPosition: config.titleOverlayPosition,
      titleOverlaySize: config.titleOverlaySize,
      titleOverlayBold: Boolean(config.titleOverlayBold),
      overlayLayout: config.overlayLayout,
      cardQrPlacement: config.cardQrPlacement,
      overlaySafeArea: config.overlaySafeArea,
      qrLink: config.qrLink,
      qrVisible: Boolean(config.showQr),
      qrPosition: config.qrPosition,
      qrSize: config.qrSize,
      currentHash: state.currentHash || "",
      currentSource: state.currentSource || "",
      hashRecording: Boolean(state.hashRecording),
      hashRecordCount: state.hashRecords.length,
      seed: config.seed,
      uptimeSeconds: Math.round((performance.now() - state.startedAt) / 1000),
      fps: Math.round(state.fps * 10) / 10,
      width: window.innerWidth,
      height: window.innerHeight,
      devicePixelRatio: window.devicePixelRatio,
      fullscreen: Boolean(document.fullscreenElement),
      kiosk: Boolean(config.kiosk),
      rotation: normalizeRotation(config.rotation),
      contextMenuLocked: Boolean(config.disableContextMenu),
      touchGesturesLocked: Boolean(config.disableTouchGestures),
      cursorHiddenEnabled: Boolean(config.hideCursor),
      reducedMotion: Boolean(accessibilityConfig().reducedMotion),
      highContrast: Boolean(accessibilityConfig().highContrast),
      watchdogEnabled: Boolean(watchdogConfig().enabled),
      droppedFrames: state.droppedFrames,
      logs: state.logs.slice(-80),
      logCount: state.logs.length,
      playlistEnabled: Boolean(state.playlistEnabled),
      playlistIndex: state.playlistIndex,
      playlistCount: playlistItems().length,
      playlistIntervalSeconds: playlistIntervalSeconds(),
      playlistIntervalUnit: playlistConfig().intervalUnit,
      playlistHashIntervalSeconds: playlistHashIntervalSeconds(),
      playlistHashIntervalUnit: playlistConfig().hashIntervalUnit,
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
    const blockContextMenu = (event) => {
      if (config.disableContextMenu) event.preventDefault();
    };
    add(window, "contextmenu", blockContextMenu, { capture: true });
    add(document, "contextmenu", blockContextMenu, { capture: true });

    const blockGesture = (event) => {
      if (config.disableTouchGestures) event.preventDefault();
    };
    add(document, "gesturestart", blockGesture, { passive: false });
    add(document, "gesturechange", blockGesture, { passive: false });
    add(document, "gestureend", blockGesture, { passive: false });
    add(document, "touchmove", (event) => {
      if (config.disableTouchGestures && !state.panel?.contains(event.target)) event.preventDefault();
    }, { passive: false });

    const blockScrollKeys = new Set(["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "PageUp", "PageDown", "Home", "End", " "]);
    add(window, "wheel", (event) => {
      if (config.preventScroll && !state.panel?.contains(event.target)) event.preventDefault();
    }, { passive: false });
    add(window, "keydown", (event) => {
      if (config.preventScroll && blockScrollKeys.has(event.key) && !state.panel?.contains(event.target)) event.preventDefault();
    });
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
      if (state.cursorHidden && config.hideCursorMode !== "always") {
        state.cursorHidden = false;
        document.documentElement.classList.remove("p5em-hide-cursor");
      }
    };
    ["pointermove", "pointerdown", "keydown", "touchstart"].forEach((type) => add(document, type, mark, { passive: true }));
  }

  function updateCursor(now) {
    const shouldHide = config.hideCursorMode === "always"
      ? true
      : now - state.lastActivityAt > config.cursorIdleMs && !state.panelOpen;
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

  function applyKioskMode() {
    document.documentElement.classList.toggle("p5em-kiosk", Boolean(config.kiosk));
  }

  function applyCursorMode() {
    document.documentElement.classList.toggle("p5em-hide-cursor", Boolean(config.hideCursor && config.hideCursorMode === "always"));
    state.cursorHidden = Boolean(config.hideCursor && config.hideCursorMode === "always");
  }

  function setOption(key, value) {
    config[key] = value;
    if (key === "disableTouchGestures") updateInputLockClasses();
    if (key === "hideCursor") value ? applyCursorMode() : showCursor();
    if (key === "kiosk") applyKioskMode();
    if (key === "rotation") {
      applyRotation();
      if (config.refreshOnRotation) refreshArtwork("rotation");
    }
    persistConfig();
    updatePanel();
    return api;
  }

  function setRotation(degrees) {
    const previous = normalizeRotation(config.rotation);
    config.rotation = normalizeRotation(degrees);
    applyRotation();
    if (config.refreshOnRotation && previous !== config.rotation) refreshArtwork("rotation");
    persistConfig();
    updatePanel();
    return api;
  }

  function setAccessibility(next = {}) {
    config.accessibility = { ...accessibilityConfig(), ...next };
    applyAccessibility();
    persistConfig();
    updatePanel();
    return api;
  }

  function setFullscreen(value) {
    config.fullscreen = Boolean(value);
    persistConfig();
    updatePanel();
    return api;
  }

  function setKiosk(value) {
    config.kiosk = Boolean(value);
    applyKioskMode();
    persistConfig();
    updatePanel();
    return api;
  }

  function setInputLocks(next = {}) {
    if ("contextMenu" in next) config.disableContextMenu = Boolean(next.contextMenu);
    if ("touchGestures" in next) config.disableTouchGestures = Boolean(next.touchGestures);
    if ("scroll" in next) config.preventScroll = Boolean(next.scroll);
    updateInputLockClasses();
    persistConfig();
    updatePanel();
    return api;
  }

  function setCursor(next = {}) {
    if (typeof next === "boolean") config.hideCursor = next;
    else {
      if ("hide" in next) config.hideCursor = Boolean(next.hide);
      if ("mode" in next) config.hideCursorMode = next.mode === "idle" ? "idle" : "always";
      if ("idleMs" in next) config.cursorIdleMs = Math.max(0, Number(next.idleMs) || 0);
    }
    config.hideCursor ? applyCursorMode() : showCursor();
    persistConfig();
    updatePanel();
    return api;
  }

  function setWatchdog(next = {}) {
    config.watchdog = { ...watchdogConfig(), ...next };
    persistConfig();
    updatePanel();
    return api;
  }

  function setHealthCheck(next = {}) {
    config.healthCheck = { ...healthCheckConfig(), ...next };
    state.lastHealthAt = 0;
    persistConfig();
    updatePanel();
    return api;
  }

  function setArtworkMetadata(next = {}) {
    if ("title" in next) config.title = String(next.title || "");
    if ("artist" in next) config.artist = String(next.artist || "");
    if ("year" in next) config.year = String(next.year || "");
    if ("showTitleOverlay" in next) config.showTitleOverlay = Boolean(next.showTitleOverlay);
    if ("titleOverlayFont" in next) config.titleOverlayFont = normalizeTitleFont(next.titleOverlayFont);
    if ("titleOverlayColor" in next) config.titleOverlayColor = normalizeTitleColor(next.titleOverlayColor);
    if ("titleOverlayPosition" in next) config.titleOverlayPosition = normalizeOverlayPosition(next.titleOverlayPosition);
    if ("titleOverlaySize" in next) config.titleOverlaySize = clamp(Number(next.titleOverlaySize) || DEFAULTS.titleOverlaySize, 8, 48);
    if ("titleOverlayBold" in next) config.titleOverlayBold = Boolean(next.titleOverlayBold);
    if ("overlayLayout" in next) config.overlayLayout = normalizeOverlayLayout(next.overlayLayout);
    if ("cardQrPlacement" in next) config.cardQrPlacement = normalizeCardQrPlacement(next.cardQrPlacement);
    if ("overlaySafeArea" in next) config.overlaySafeArea = normalizeOverlaySafeArea(next.overlaySafeArea);
    applyTitleOverlay();
    applyOverlaySafeArea();
    applyOverlayCard();
    persistConfig();
    updatePanel();
    return api;
  }

  function setQrOptions(next = {}) {
    if ("qrLink" in next) config.qrLink = String(next.qrLink || "");
    if ("showQr" in next) config.showQr = Boolean(next.showQr);
    if ("qrPosition" in next) config.qrPosition = normalizeOverlayPosition(next.qrPosition);
    if ("qrSize" in next) config.qrSize = clamp(Number(next.qrSize) || DEFAULTS.qrSize, 48, 320);
    if ("qrProvider" in next) config.qrProvider = String(next.qrProvider || DEFAULTS.qrProvider);
    if ("overlayLayout" in next) config.overlayLayout = normalizeOverlayLayout(next.overlayLayout);
    if ("cardQrPlacement" in next) config.cardQrPlacement = normalizeCardQrPlacement(next.cardQrPlacement);
    if ("overlaySafeArea" in next) config.overlaySafeArea = normalizeOverlaySafeArea(next.overlaySafeArea);
    applyOverlaySafeArea();
    applyQrOverlay();
    applyOverlayCard();
    persistConfig();
    updatePanel();
    return api;
  }

  function setOverlaySafeArea(value) {
    config.overlaySafeArea = normalizeOverlaySafeArea(value);
    applyOverlaySafeArea();
    applyOverlayCard();
    persistConfig();
    updatePanel();
    return api;
  }

  function setOverlayLayout(value) {
    config.overlayLayout = normalizeOverlayLayout(value);
    applyTitleOverlay();
    applyQrOverlay();
    applyOverlayCard();
    persistConfig();
    updatePanel();
    return api;
  }

  function applyRotation() {
    const rotation = normalizeRotation(config.rotation);
    const sideways = rotation === 90 || rotation === 270;
    document.documentElement.style.setProperty("--p5em-rotation", `${rotation}deg`);
    document.documentElement.style.setProperty("--p5em-frame-width", sideways ? "100vh" : "100vw");
    document.documentElement.style.setProperty("--p5em-frame-height", sideways ? "100vw" : "100vh");
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

  function applyOverlaySafeArea() {
    document.documentElement.style.setProperty("--p5em-overlay-safe-area", `${normalizeOverlaySafeArea(config.overlaySafeArea)}px`);
  }

  function applyTitleOverlay() {
    let overlay = document.getElementById("p5em-title-overlay");
    if (!config.showTitleOverlay || normalizeOverlayLayout(config.overlayLayout) === "card") {
      overlay?.remove();
      return;
    }
    if (!overlay) {
      overlay = document.createElement("div");
      overlay.id = "p5em-title-overlay";
      ensureOverlayLayer().appendChild(overlay);
    }
    overlay.textContent = formatTitleOverlay(config);
    overlay.dataset.position = normalizeOverlayPosition(config.titleOverlayPosition);
    overlay.dataset.stackQr = shouldStackSeparateQr() ? "true" : "false";
    overlay.dataset.color = normalizeTitleColor(config.titleOverlayColor);
    overlay.dataset.font = normalizeTitleFont(config.titleOverlayFont);
    overlay.dataset.bold = config.titleOverlayBold ? "true" : "false";
    overlay.style.fontSize = `${clamp(Number(config.titleOverlaySize) || DEFAULTS.titleOverlaySize, 8, 48)}px`;
  }

  function applyQrOverlay() {
    let overlay = document.getElementById("p5em-qr-overlay");
    if (!config.showQr || !config.qrLink || normalizeOverlayLayout(config.overlayLayout) === "card") {
      overlay?.remove();
      return;
    }
    if (!overlay) {
      overlay = document.createElement("a");
      overlay.id = "p5em-qr-overlay";
      overlay.target = "_blank";
      overlay.rel = "noopener noreferrer";
      overlay.innerHTML = `<img alt="QR code">`;
      ensureOverlayLayer().appendChild(overlay);
    }
    const size = clamp(Number(config.qrSize) || DEFAULTS.qrSize, 48, 320);
    overlay.href = config.qrLink;
    overlay.dataset.position = normalizeOverlayPosition(config.qrPosition);
    overlay.dataset.stackTitle = shouldStackSeparateQr() ? "true" : "false";
    overlay.style.width = `${size}px`;
    overlay.style.height = `${size}px`;
    overlay.style.setProperty("--p5em-qr-stack-offset", `${size + 14}px`);
    overlay.querySelector("img").src = buildQrUrl(config.qrLink, size, config.qrProvider);
  }

  function applyOverlayCard() {
    let overlay = document.getElementById("p5em-card-overlay");
    const showTitle = Boolean(config.showTitleOverlay);
    const showQr = Boolean(config.showQr && config.qrLink);
    if (normalizeOverlayLayout(config.overlayLayout) !== "card" || (!showTitle && !showQr)) {
      overlay?.remove();
      return;
    }
    if (!overlay) {
      overlay = document.createElement(showQr ? "a" : "div");
      overlay.id = "p5em-card-overlay";
      overlay.innerHTML = `
        <div class="p5em-card-copy">
          <strong></strong>
          <span></span>
        </div>
        <img alt="QR code">
      `;
      ensureOverlayLayer().appendChild(overlay);
    }
    if (showQr && overlay.tagName !== "A") {
      const replacement = document.createElement("a");
      replacement.id = "p5em-card-overlay";
      replacement.innerHTML = overlay.innerHTML;
      overlay.replaceWith(replacement);
      overlay = replacement;
    }
    if (!showQr && overlay.tagName === "A") {
      const replacement = document.createElement("div");
      replacement.id = "p5em-card-overlay";
      replacement.innerHTML = overlay.innerHTML;
      overlay.replaceWith(replacement);
      overlay = replacement;
    }
    if (showQr) {
      overlay.href = config.qrLink;
      overlay.target = "_blank";
      overlay.rel = "noopener noreferrer";
    }
    const size = clamp(Number(config.qrSize) || DEFAULTS.qrSize, 48, 320);
    overlay.dataset.position = normalizeOverlayPosition(config.titleOverlayPosition);
    overlay.dataset.color = normalizeTitleColor(config.titleOverlayColor);
    overlay.dataset.font = normalizeTitleFont(config.titleOverlayFont);
    overlay.dataset.bold = config.titleOverlayBold ? "true" : "false";
    overlay.dataset.qrPlacement = normalizeCardQrPlacement(config.cardQrPlacement);
    overlay.style.fontSize = `${clamp(Number(config.titleOverlaySize) || DEFAULTS.titleOverlaySize, 8, 48)}px`;
    const copy = overlay.querySelector(".p5em-card-copy");
    copy.hidden = !showTitle;
    overlay.querySelector("strong").textContent = config.title || "Artwork Title";
    overlay.querySelector("span").textContent = [config.artist || "Artist Name", config.year].filter(Boolean).join(" · ");
    const image = overlay.querySelector("img");
    image.hidden = !showQr;
    if (showQr) {
      const cardQrSize = clamp(size, 48, 180);
      image.style.width = `${cardQrSize}px`;
      image.style.height = `${cardQrSize}px`;
      image.src = buildQrUrl(config.qrLink, cardQrSize, config.qrProvider);
    }
  }

  function ensureOverlayLayer() {
    let layer = document.getElementById("p5em-overlay-layer");
    if (!layer) {
      layer = document.createElement("div");
      layer.id = "p5em-overlay-layer";
      document.body.appendChild(layer);
    }
    return layer;
  }

  function shouldStackSeparateQr() {
    return Boolean(
      config.showTitleOverlay &&
      config.showQr &&
      config.qrLink &&
      normalizeOverlayLayout(config.overlayLayout) === "separate" &&
      normalizeOverlayPosition(config.titleOverlayPosition) === normalizeOverlayPosition(config.qrPosition)
    );
  }

  function setupPlaylist() {
    const playlist = playlistConfig();
    state.playlistEnabled = Boolean(playlist.enabled && playlistItems().length);
    state.playlistIndex = Math.max(0, playlist.startIndex || 0) % Math.max(1, playlistItems().length);
    if (!playlistItems().length) return;

    ensurePlaylistFrame();

    if (state.playlistEnabled) loadPlaylistItem(state.playlistIndex);
  }

  function ensurePlaylistFrame() {
    if (state.playlistFrame) return state.playlistFrame;
    state.playlistFrame = document.createElement("iframe");
    state.playlistFrame.className = "p5em-playlist-frame";
    state.playlistFrame.title = "Exhibition playlist artwork";
    state.playlistFrame.setAttribute("allow", "autoplay; fullscreen");
    state.playlistFrame.setAttribute("referrerpolicy", "no-referrer-when-downgrade");
    state.playlistFrame.hidden = true;
    document.body.prepend(state.playlistFrame);
    return state.playlistFrame;
  }

  function tickPlaylist(now) {
    if (!state.playlistEnabled || !state.playlistFrame) return;
    const interval = playlistIntervalSeconds() * 1000;
    if (now - state.playlistLastChangeAt >= interval) nextPlaylistItem();
    const playlist = playlistConfig();
    if (playlist.randomHash && now - state.playlistLastHashAt >= playlistHashIntervalSeconds() * 1000) {
      loadPlaylistItem(state.playlistIndex, { keepUrlTimer: true });
    }
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

  function playlistIntervalSeconds() {
    const playlist = playlistConfig();
    if (playlist.intervalUnit) return intervalToSeconds(playlist.intervalValue ?? playlist.intervalSeconds, playlist.intervalUnit);
    return Math.max(5, Number(playlist.intervalSeconds) || 120);
  }

  function playlistHashIntervalSeconds() {
    const playlist = playlistConfig();
    if (playlist.hashIntervalUnit) return intervalToSeconds(playlist.hashIntervalValue ?? playlist.hashIntervalSeconds, playlist.hashIntervalUnit);
    return Math.max(5, Number(playlist.hashIntervalSeconds) || playlistIntervalSeconds());
  }

  function loadPlaylistItem(index = state.playlistIndex, options = {}) {
    const items = playlistItems();
    if (!items.length) return null;
    ensurePlaylistFrame();
    state.playlistIndex = ((index % items.length) + items.length) % items.length;
    const now = performance.now();
    if (!options.keepUrlTimer) state.playlistLastChangeAt = now;
    state.playlistLastHashAt = now;
    const url = buildPlaylistUrl(items[state.playlistIndex], playlistConfig());
    updateCurrentSource(url, playlistConfig().hashParam || "hash");
    state.playlistFrame.src = url;
    state.playlistFrame.hidden = false;
    document.documentElement.classList.add("p5em-playlist-active");
    updatePanel();
    return url;
  }

  function previewPlaylistUrl(url) {
    const cleanUrl = String(url || "").trim();
    if (!cleanUrl) return null;
    ensurePlaylistFrame();
    const builtUrl = buildPlaylistUrl(cleanUrl, playlistConfig());
    updateCurrentSource(builtUrl, playlistConfig().hashParam || "hash");
    state.playlistFrame.src = builtUrl;
    state.playlistFrame.hidden = false;
    state.playlistLastHashAt = performance.now();
    document.documentElement.classList.add("p5em-playlist-active");
    updatePanel();
    return state.playlistFrame.src;
  }

  function nextPlaylistItem() {
    return loadPlaylistItem(state.playlistIndex + 1);
  }

  function previousPlaylistItem() {
    return loadPlaylistItem(state.playlistIndex - 1);
  }

  function updateCurrentSource(url, hashParam = "hash") {
    state.currentSource = url || "";
    state.currentHash = readUrlHash(safeUrl(url), hashParam);
    recordHashSample("source");
  }

  function togglePlaylist(force) {
    state.playlistEnabled = typeof force === "boolean" ? force : !state.playlistEnabled;
    config.playlist = { ...playlistConfig(), enabled: state.playlistEnabled };
    if (state.playlistFrame) state.playlistFrame.hidden = !state.playlistEnabled;
    document.documentElement.classList.toggle("p5em-playlist-active", Boolean(state.playlistEnabled));
    if (state.playlistEnabled) loadPlaylistItem(state.playlistIndex);
    persistConfig();
    updatePanel();
    return api;
  }

  function setPlaylistInterval(seconds) {
    config.playlist = { ...playlistConfig(), intervalSeconds: Math.max(5, Number(seconds) || 120), intervalUnit: "seconds" };
    state.playlistLastChangeAt = performance.now();
    persistConfig();
    updatePanel();
    return api;
  }

  function setPlaylistIntervalParts(value, unit) {
    const normalizedUnit = normalizeIntervalUnit(unit);
    const intervalValue = Math.max(1, Number(value) || 1);
    config.playlist = {
      ...playlistConfig(),
      intervalValue,
      intervalUnit: normalizedUnit,
      intervalSeconds: intervalToSeconds(intervalValue, normalizedUnit)
    };
    state.playlistLastChangeAt = performance.now();
    persistConfig();
    updatePanel();
    return api;
  }

  function setPlaylistHashIntervalParts(value, unit) {
    const normalizedUnit = normalizeIntervalUnit(unit);
    const hashIntervalValue = Math.max(1, Number(value) || 1);
    config.playlist = {
      ...playlistConfig(),
      hashIntervalValue,
      hashIntervalUnit: normalizedUnit,
      hashIntervalSeconds: intervalToSeconds(hashIntervalValue, normalizedUnit)
    };
    state.playlistLastHashAt = performance.now();
    persistConfig();
    updatePanel();
    return api;
  }

  function setPlaylistRandomHash(value) {
    config.playlist = { ...playlistConfig(), randomHash: Boolean(value) };
    if (state.playlistEnabled) loadPlaylistItem(state.playlistIndex);
    persistConfig();
    updatePanel();
    return api;
  }

  function setPlaylistOptions(next = {}) {
    const playlist = { ...playlistConfig(), ...next };
    if ("items" in next) playlist.items = normalizePlaylistItems(next.items);
    config.playlist = playlist;
    if (state.playlistFrame) state.playlistFrame.hidden = !Boolean(playlist.enabled);
    state.playlistEnabled = Boolean(playlist.enabled && playlistItems().length);
    if (state.playlistEnabled) loadPlaylistItem(playlist.startIndex ?? state.playlistIndex);
    persistConfig();
    updatePanel();
    syncPlaylistRows(state.panel, playlist.items, { force: true });
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
      document.documentElement.classList.remove("p5em-playlist-active");
    } else if (state.playlistEnabled) {
      loadPlaylistItem(0);
    }

    updatePanel();
    syncPlaylistRows(state.panel, normalized, { force: true });
    persistConfig();
    return api;
  }

  function persistConfig() {
    if (!config.persist) return;
    writeRuntimeConfig(config.storageKey, serializeRuntimeConfig(config));
  }

  function saveConfig() {
    persistConfig();
    return getConfig();
  }

  function getConfig() {
    return serializeRuntimeConfig(config);
  }

  function loadConfig(next = {}) {
    const merged = mergeRuntimeConfig(config, next);
    Object.keys(config).forEach((key) => delete config[key]);
    Object.assign(config, merged);
    applyRotation();
    applyAccessibility();
    applyKioskMode();
    applyCursorMode();
    applyOverlaySafeArea();
    applyTitleOverlay();
    applyQrOverlay();
    applyOverlayCard();
    updateInputLockClasses();
    state.playlistEnabled = Boolean(playlistConfig().enabled && playlistItems().length);
    if (playlistItems().length && !state.playlistFrame) ensurePlaylistFrame();
    if (state.playlistFrame) state.playlistFrame.hidden = !state.playlistEnabled;
    if (state.playlistEnabled) loadPlaylistItem(playlistConfig().startIndex ?? state.playlistIndex);
    persistConfig();
    syncPlaylistRows(state.panel, playlistItems(), { force: true });
    updatePanel();
    return api;
  }

  function exportConfig() {
    const snapshot = getConfig();
    persistConfig();
    downloadJson(snapshot, `${safeName(config.title || "p5-exhibition-mode")}-runtime-config.json`);
    return snapshot;
  }

  function startHashRecording() {
    state.hashRecording = true;
    recordHashSample("start");
    updatePanel();
    return api;
  }

  function stopHashRecording() {
    recordHashSample("stop");
    state.hashRecording = false;
    updatePanel();
    return api;
  }

  function clearHashRecording() {
    state.hashRecords = [];
    updatePanel();
    return api;
  }

  function exportHashRecording() {
    const data = {
      title: config.title,
      artist: config.artist,
      year: config.year,
      exportedAt: new Date().toISOString(),
      records: state.hashRecords
    };
    downloadJson(data, `${safeName(config.title || "hash-recording")}-hashes.json`);
    return data;
  }

  function recordHashSample(reason = "change") {
    if (!state.hashRecording && reason !== "start" && reason !== "manual") return null;
    const entry = {
      timestamp: new Date().toISOString(),
      reason,
      hash: state.currentHash || "",
      source: state.currentSource || "",
      playlistIndex: state.playlistIndex,
      title: config.title,
      artist: config.artist,
      year: config.year
    };
    state.hashRecords.push(entry);
    return entry;
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
    setText("p5em-year", d.year || "Unspecified");
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
    setText("p5em-playlist-interval", formatInterval(d.playlistIntervalSeconds));
    setText("p5em-playlist-hash-interval", formatInterval(d.playlistHashIntervalSeconds));
    setText("p5em-playlist-hash", d.playlistRandomHash ? "Enabled" : "Disabled");
    setText("p5em-current-hash", d.currentHash || "None");
    setText("p5em-current-hash-full", d.currentHash || "None");
    setText("p5em-current-source", shortenMiddle(d.currentSource || "None", 34));
    setText("p5em-hash-recording", d.hashRecording ? "Active" : "Stopped");
    setText("p5em-hash-record-count", String(d.hashRecordCount));
    setText("p5em-uptime", formatDuration(d.uptimeSeconds));
    setText("p5em-memory", d.memoryMB === null ? "Unavailable" : `${d.memoryMB} MB`);
    setText("p5em-reloads", String(d.reloadCount));
    renderLogRows(state.panel, d.logs);
    setChecked("context", d.contextMenuLocked);
    setChecked("touch", d.touchGesturesLocked);
    setChecked("cursor", d.cursorHiddenEnabled);
    setChecked("playlist", d.playlistEnabled);
    setChecked("playlist-hash", d.playlistRandomHash);
    setChecked("reduced-motion", d.reducedMotion);
    setChecked("high-contrast", d.highContrast);
    setChecked("title-overlay", d.titleOverlayVisible);
    setChecked("qr-overlay", d.qrVisible);
    setInputValue("artwork-title", d.title);
    setInputValue("artwork-artist", d.artist);
    setInputValue("artwork-year", d.year);
    setInputValue("current-hash", d.currentHash);
    setInputValue("qr-link", d.qrLink);
    setInputValue("overlay-layout", d.overlayLayout);
    setInputValue("card-qr-placement", d.cardQrPlacement);
    setInputValue("title-size", d.titleOverlaySize);
    setInputValue("overlay-safe-area", d.overlaySafeArea);
    setInputValue("qr-size", d.qrSize);
    setInputValue("title-font", d.titleOverlayFont);
    setInputValue("title-color", d.titleOverlayColor);
    setInputValue("title-position", d.titleOverlayPosition);
    setInputValue("qr-position", d.qrPosition);
    setChecked("title-bold", d.titleOverlayBold);
    const interval = state.panel.querySelector("[data-input='playlist-interval']");
    if (interval && document.activeElement !== interval) interval.value = playlistConfig().intervalValue ?? intervalDisplayValue(d.playlistIntervalSeconds, playlistConfig().intervalUnit);
    const intervalUnit = state.panel.querySelector("[data-input='playlist-interval-unit']");
    if (intervalUnit && document.activeElement !== intervalUnit) intervalUnit.value = normalizeIntervalUnit(playlistConfig().intervalUnit);
    const hashInterval = state.panel.querySelector("[data-input='playlist-hash-interval']");
    if (hashInterval && document.activeElement !== hashInterval) hashInterval.value = playlistConfig().hashIntervalValue ?? intervalDisplayValue(d.playlistHashIntervalSeconds, playlistConfig().hashIntervalUnit);
    const hashIntervalUnit = state.panel.querySelector("[data-input='playlist-hash-interval-unit']");
    if (hashIntervalUnit && document.activeElement !== hashIntervalUnit) hashIntervalUnit.value = normalizeIntervalUnit(playlistConfig().hashIntervalUnit);
    const rotation = state.panel.querySelector("[data-input='rotation']");
    if (rotation && document.activeElement !== rotation) rotation.value = d.rotation;
  }

  function setText(key, value) {
    const el = state.panel?.querySelector(`[data-p5em="${key}"]`);
    if (el) el.textContent = value;
  }

  function setChecked(key, value) {
    const el = state.panel?.querySelector(`[data-toggle="${key}"]`);
    if (el) el.checked = Boolean(value);
  }

  function setInputValue(key, value) {
    const el = state.panel?.querySelector(`[data-input="${key}"]`);
    if (el && document.activeElement !== el) el.value = value || "";
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
    setFullscreen,
    setKiosk,
    setInputLocks,
    setCursor,
    setWatchdog,
    setHealthCheck,
    setArtworkMetadata,
    setQrOptions,
    setOverlaySafeArea,
    setOverlayLayout,
    startHashRecording,
    stopHashRecording,
    clearHashRecording,
    exportHashRecording,
    refreshArtwork,
    togglePlaylist,
    nextPlaylistItem,
    previousPlaylistItem,
    setPlaylistInterval,
    setPlaylistIntervalParts,
    setPlaylistHashIntervalParts,
    setPlaylistRandomHash,
    setPlaylistOptions,
    setPlaylistItems,
    previewPlaylistUrl,
    getConfig,
    loadConfig,
    saveConfig,
    exportConfig
  };

  return api;
}

function createPanel(config, api) {
  const panel = document.createElement("aside");
  panel.id = PANEL_ID;
  panel.hidden = true;
  panel.__p5emApi = api;
  panel.setAttribute("aria-label", "p5 Exhibition Mode diagnostics");
  panel.innerHTML = `
    <div class="p5em-panel-header">
      <span>Exhibition Mode</span>
      <button type="button" data-action="close" aria-label="Close panel">×</button>
    </div>
    <div class="p5em-tabs" role="tablist" aria-label="Runtime panel sections">
      <button type="button" class="is-active" data-tab="runtime" role="tab" aria-selected="true">Runtime</button>
      <button type="button" data-tab="overlay" role="tab" aria-selected="false">Overlay</button>
      <button type="button" data-tab="playlist" role="tab" aria-selected="false">Playlist</button>
      <button type="button" data-tab="log" role="tab" aria-selected="false">Log</button>
    </div>
    <div class="p5em-tab-panel is-active" data-panel="runtime" role="tabpanel">
      <div class="p5em-panel-grid">
        ${section("Artwork", [["Title", "p5em-title"], ["Artist", "p5em-artist"], ["Year", "p5em-year"], ["Seed", "p5em-seed"]])}
        ${section("Display", [["Resolution", "p5em-resolution"], ["DPR", "p5em-dpr"], ["FPS", "p5em-fps"], ["Fullscreen", "p5em-fullscreen"], ["Rotation", "p5em-rotation"]])}
        ${section("Input Locks", [["Context Menu", "p5em-context"], ["Touch Gestures", "p5em-touch"], ["Cursor Hide", "p5em-cursor"], ["Motion", "p5em-motion"], ["Contrast", "p5em-contrast"]])}
        ${section("Playlist", [["Status", "p5em-playlist"], ["URL Interval", "p5em-playlist-interval"], ["Hash Interval", "p5em-playlist-hash-interval"], ["Random Hash", "p5em-playlist-hash"]])}
        ${section("Hash Recorder", [["Hash", "p5em-current-hash"], ["Source", "p5em-current-source"], ["Recording", "p5em-hash-recording"], ["Records", "p5em-hash-record-count"]])}
        ${section("System", [["Uptime", "p5em-uptime"], ["Memory", "p5em-memory"], ["Reloads", "p5em-reloads"], ["Watchdog", "p5em-watchdog"], ["Dropped", "p5em-dropped"], ["Logs", "p5em-logs"]])}
      </div>
      <div class="p5em-panel-controls">
        <div class="p5em-control-group p5em-control-group-wide">
          <h2>Runtime</h2>
          ${toggle("context", "Context menu lock")}
          ${toggle("touch", "Touch gestures lock")}
          ${toggle("cursor", "Hide cursor")}
          ${toggle("reduced-motion", "Reduced motion")}
          ${toggle("high-contrast", "High contrast")}
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
        <div class="p5em-control-group p5em-control-group-wide">
          <h2>Hash Recording</h2>
          <label class="p5em-text-control">
            <span>Hash Number</span>
            <input data-input="current-hash" type="text" value="" readonly>
          </label>
          <div class="p5em-copy-field">
            <span>Current Hash</span>
            <strong data-p5em="p5em-current-hash-full"></strong>
            <button type="button" data-action="copy-hash">Copy</button>
          </div>
          <div class="p5em-button-row">
            <button type="button" data-action="hash-record-start">Start</button>
            <button type="button" data-action="hash-record-stop">Stop</button>
            <button type="button" data-action="hash-record-export">Export JSON</button>
            <button type="button" data-action="hash-record-clear">Clear</button>
          </div>
        </div>
      </div>
    </div>
    <div class="p5em-tab-panel" data-panel="overlay" role="tabpanel" hidden>
      <div class="p5em-overlay-controls">
        <div class="p5em-control-group p5em-control-group-wide">
          <h2>Title Overlay</h2>
          <label class="p5em-text-control">
            <span>Artwork Title</span>
            <input data-input="artwork-title" type="text" value="${escapeAttr(config.title)}">
          </label>
          <label class="p5em-text-control">
            <span>Artist Name</span>
            <input data-input="artwork-artist" type="text" value="${escapeAttr(config.artist)}">
          </label>
          <label class="p5em-text-control">
            <span>Year</span>
            <input data-input="artwork-year" type="text" value="${escapeAttr(config.year)}">
          </label>
        </div>
        <div class="p5em-control-group p5em-control-group-wide p5em-compact-group">
          <h2>Layout</h2>
          <label class="p5em-number-control">
            <span>Overlay Mode</span>
            <select data-input="overlay-layout">
              ${overlayLayoutOptions(config.overlayLayout)}
            </select>
          </label>
          <label class="p5em-number-control">
            <span>Card QR</span>
            <select data-input="card-qr-placement">
              ${cardQrPlacementOptions(config.cardQrPlacement)}
            </select>
          </label>
          ${toggle("title-overlay", "Show title")}
          ${toggle("qr-overlay", "Show QR")}
          ${toggle("title-bold", "Bold title")}
          <label class="p5em-number-control">
            <span>Title Size</span>
            <input data-input="title-size" type="range" min="8" max="48" step="1" value="${config.titleOverlaySize}">
          </label>
          <label class="p5em-number-control">
            <span>Title Font</span>
            <select data-input="title-font">
              ${fontOptions(config.titleOverlayFont)}
            </select>
          </label>
          <label class="p5em-number-control">
            <span>Title Color</span>
            <select data-input="title-color">
              <option value="white">White</option>
              <option value="gray">Gray</option>
              <option value="black">Black</option>
            </select>
          </label>
          <label class="p5em-number-control">
            <span>Safe Border</span>
            <input data-input="overlay-safe-area" type="range" min="0" max="160" step="2" value="${config.overlaySafeArea}">
          </label>
        </div>
        <div class="p5em-control-group p5em-control-group-wide">
          <h2>Position</h2>
          <label class="p5em-number-control">
            <span>Title Position</span>
            <select data-input="title-position">
              ${positionOptions(config.titleOverlayPosition)}
            </select>
          </label>
          <label class="p5em-number-control">
            <span>QR Position</span>
            <select data-input="qr-position">
              ${positionOptions(config.qrPosition)}
            </select>
          </label>
        </div>
        <div class="p5em-control-group p5em-control-group-wide">
          <h2>QR Code</h2>
          <label class="p5em-text-control p5em-wide-control">
            <span>QR Link</span>
            <input data-input="qr-link" type="url" value="${escapeAttr(config.qrLink)}" placeholder="https://...">
          </label>
          <label class="p5em-number-control">
            <span>QR Size</span>
            <input data-input="qr-size" type="range" min="48" max="320" step="4" value="${config.qrSize}">
          </label>
        </div>
      </div>
    </div>
    <div class="p5em-tab-panel" data-panel="playlist" role="tabpanel" hidden>
      <section class="p5em-playlist-editor">
        <div class="p5em-playlist-head">
          <h2>Playlist URLs</h2>
          <button type="button" data-action="playlist-add">+</button>
        </div>
        <div class="p5em-playlist-options">
          ${toggle("playlist", "Playlist mode")}
          <label class="p5em-number-control">
            <span>Playlist Interval</span>
            <input data-input="playlist-interval" type="number" min="5" step="5" value="${playlistConfigFrom(config).intervalSeconds}">
          </label>
          <label class="p5em-number-control">
            <span>Unit</span>
            <select data-input="playlist-interval-unit">
              <option value="seconds">Seconds</option>
              <option value="minutes">Minutes</option>
              <option value="hours">Hours</option>
            </select>
          </label>
          ${toggle("playlist-hash", "Random ?hash=")}
          <label class="p5em-number-control">
            <span>Hash Interval</span>
            <input data-input="playlist-hash-interval" type="number" min="5" step="5" value="${playlistConfigFrom(config).hashIntervalSeconds}">
          </label>
          <label class="p5em-number-control">
            <span>Hash Unit</span>
            <select data-input="playlist-hash-interval-unit">
              <option value="seconds">Seconds</option>
              <option value="minutes">Minutes</option>
              <option value="hours">Hours</option>
            </select>
          </label>
        </div>
        <div class="p5em-playlist-rows" data-playlist-rows></div>
        <p>Type a served local path or web URL. Apply URLs persists settings. Drop HTML is temporary preview only and is available for local rows.</p>
      </section>
    </div>
    <div class="p5em-tab-panel" data-panel="log" role="tabpanel" hidden>
      <section class="p5em-log-viewer">
        <div class="p5em-log-head">
          <h2>Runtime Log</h2>
          <button type="button" data-action="log-copy">Copy</button>
        </div>
        <div class="p5em-log-rows" data-log-rows></div>
      </section>
    </div>
    <div class="p5em-panel-actions">
      <button type="button" data-action="fullscreen">Fullscreen</button>
      <button type="button" data-action="reset">Reset</button>
      <button type="button" data-action="screenshot">Screenshot</button>
      <button type="button" data-action="playlist-apply">Apply URLs</button>
      <button type="button" data-action="playlist-save-json">Save JSON</button>
      <button type="button" data-action="runtime-load-json">Load JSON</button>
      <button type="button" data-action="playlist-prev">Prev URL</button>
      <button type="button" data-action="playlist-next">Next URL</button>
      <input data-input="runtime-config-file" type="file" accept="application/json,.json" hidden>
    </div>
    <p class="p5em-panel-hint">Shift + ${config.panelKey.toUpperCase()} toggles this panel.</p>
  `;
  panel.addEventListener("pointerdown", (event) => event.stopPropagation());
  panel.addEventListener("click", (event) => {
    const action = event.target?.dataset?.action;
    const tab = event.target?.dataset?.tab;
    if (tab) activatePanelTab(panel, tab);
    if (action === "close") api.togglePanel(false);
    if (action === "fullscreen") api.enterFullscreen();
    if (action === "reset") api.reset();
    if (action === "screenshot") api.screenshot();
    if (action === "diagnostics") copyDiagnostics(api.diagnostics());
    if (action === "log-copy") copyText(JSON.stringify(api.diagnostics().logs || [], null, 2));
    if (action === "copy-hash") copyText(api.diagnostics().currentHash || "");
    if (action === "hash-record-start") api.startHashRecording();
    if (action === "hash-record-stop") api.stopHashRecording();
    if (action === "hash-record-export") api.exportHashRecording();
    if (action === "hash-record-clear") api.clearHashRecording();
    if (action === "playlist-apply") {
      api.setPlaylistItems(collectPlaylistRows(panel));
    }
    if (action === "playlist-save-json") api.exportConfig();
    if (action === "runtime-load-json") panel.querySelector("[data-input='runtime-config-file']")?.click();
    if (action === "playlist-add") {
      addPlaylistRow(panel, "");
      const container = panel.querySelector("[data-playlist-rows]");
      if (container) container.dataset.dirty = "true";
    }
    if (action === "playlist-remove") {
      event.target.closest(".p5em-playlist-row")?.remove();
      const container = panel.querySelector("[data-playlist-rows]");
      if (container) container.dataset.dirty = "true";
    }
    if (action === "playlist-preview") {
      const row = event.target.closest(".p5em-playlist-row");
      const input = row?.querySelector("[data-input='playlist-url']");
      if (input?.value) api.previewPlaylistUrl(input.value);
    }
    if (action === "playlist-prev") api.previousPlaylistItem();
    if (action === "playlist-next") api.nextPlaylistItem();
  });
  panel.addEventListener("change", (event) => {
    const toggle = event.target?.dataset?.toggle;
    if (toggle === "context") api.setOption("disableContextMenu", event.target.checked);
    if (toggle === "touch") api.setOption("disableTouchGestures", event.target.checked);
    if (toggle === "cursor") api.setOption("hideCursor", event.target.checked);
    if (toggle === "title-overlay") api.setArtworkMetadata({ showTitleOverlay: event.target.checked });
    if (toggle === "qr-overlay") api.setQrOptions({ showQr: event.target.checked });
    if (toggle === "title-bold") api.setArtworkMetadata({ titleOverlayBold: event.target.checked });
    if (toggle === "reduced-motion") api.setAccessibility({ reducedMotion: event.target.checked });
    if (toggle === "high-contrast") api.setAccessibility({ highContrast: event.target.checked });
    if (toggle === "playlist") api.togglePlaylist(event.target.checked);
    if (toggle === "playlist-hash") api.setPlaylistRandomHash(event.target.checked);

    if (event.target?.dataset?.input === "playlist-interval") {
      const unit = panel.querySelector("[data-input='playlist-interval-unit']")?.value || "seconds";
      api.setPlaylistIntervalParts(event.target.value, unit);
    }
    if (event.target?.dataset?.input === "playlist-interval-unit") {
      const value = panel.querySelector("[data-input='playlist-interval']")?.value || 1;
      api.setPlaylistIntervalParts(value, event.target.value);
    }
    if (event.target?.dataset?.input === "playlist-hash-interval") {
      const unit = panel.querySelector("[data-input='playlist-hash-interval-unit']")?.value || "seconds";
      api.setPlaylistHashIntervalParts(event.target.value, unit);
    }
    if (event.target?.dataset?.input === "playlist-hash-interval-unit") {
      const value = panel.querySelector("[data-input='playlist-hash-interval']")?.value || 1;
      api.setPlaylistHashIntervalParts(value, event.target.value);
    }
    if (event.target?.dataset?.input === "rotation") {
      api.setRotation(event.target.value);
    }
    if (event.target?.dataset?.input === "artwork-title") {
      api.setArtworkMetadata({ title: event.target.value });
    }
    if (event.target?.dataset?.input === "artwork-artist") {
      api.setArtworkMetadata({ artist: event.target.value });
    }
    if (event.target?.dataset?.input === "artwork-year") {
      api.setArtworkMetadata({ year: event.target.value });
    }
    if (event.target?.dataset?.input === "title-size") {
      api.setArtworkMetadata({ titleOverlaySize: event.target.value });
    }
    if (event.target?.dataset?.input === "overlay-layout") {
      api.setOverlayLayout(event.target.value);
    }
    if (event.target?.dataset?.input === "card-qr-placement") {
      api.setQrOptions({ cardQrPlacement: event.target.value });
    }
    if (event.target?.dataset?.input === "overlay-safe-area") {
      api.setOverlaySafeArea(event.target.value);
    }
    if (event.target?.dataset?.input === "title-font") {
      api.setArtworkMetadata({ titleOverlayFont: event.target.value });
    }
    if (event.target?.dataset?.input === "title-color") {
      api.setArtworkMetadata({ titleOverlayColor: event.target.value });
    }
    if (event.target?.dataset?.input === "title-position") {
      api.setArtworkMetadata({ titleOverlayPosition: event.target.value });
    }
    if (event.target?.dataset?.input === "qr-link") {
      api.setQrOptions({ qrLink: event.target.value });
    }
    if (event.target?.dataset?.input === "qr-size") {
      api.setQrOptions({ qrSize: event.target.value });
    }
    if (event.target?.dataset?.input === "qr-position") {
      api.setQrOptions({ qrPosition: event.target.value });
    }
    if (event.target?.dataset?.input === "playlist-kind") {
      const row = event.target.closest(".p5em-playlist-row");
      if (row) updatePlaylistRowKind(row, event.target.value);
    }
    if (event.target?.dataset?.input === "playlist-file") {
      previewDroppedArtwork(event.target, api, event.target.closest(".p5em-playlist-row"));
      event.target.value = "";
    }
    if (event.target?.dataset?.input === "runtime-config-file") {
      loadConfigFile(event.target.files?.[0], api, panel);
      event.target.value = "";
    }
  });
  syncPlaylistRows(panel, playlistConfigFrom(config).items);
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
      <span>${label}</span>
      <input type="checkbox" data-toggle="${key}">
      <i aria-hidden="true"></i>
    </label>
  `;
}

function activatePanelTab(panel, tab) {
  panel.querySelectorAll("[data-tab]").forEach((button) => {
    const active = button.dataset.tab === tab;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-selected", String(active));
  });
  panel.querySelectorAll("[data-panel]").forEach((section) => {
    const active = section.dataset.panel === tab;
    section.classList.toggle("is-active", active);
    section.hidden = !active;
  });
}

function renderLogRows(panel, logs = []) {
  const container = panel?.querySelector("[data-log-rows]");
  if (!container) return;
  if (!logs.length) {
    container.innerHTML = `<p>No runtime events yet.</p>`;
    return;
  }
  container.innerHTML = logs.slice().reverse().map((entry) => `
    <article class="p5em-log-row" data-level="${escapeAttr(entry.level)}">
      <time>${escapeHtml(formatLogTime(entry.time))}</time>
      <strong>${escapeHtml(entry.level || "info")}</strong>
      <span>${escapeHtml(entry.message || "")}</span>
    </article>
  `).join("");
}

function syncPlaylistRows(panel, items, options = {}) {
  const container = panel?.querySelector("[data-playlist-rows]");
  if (!container || (!options.force && container.dataset.editing === "true")) return;
  if (!options.force && container.dataset.dirty === "true") return;
  const urls = normalizePlaylistItems(items).map((item) => typeof item === "string" ? item : item.url);
  container.innerHTML = "";
  container.dataset.dirty = "false";
  container.dataset.editing = "false";
  (urls.length ? urls : [""]).forEach((url) => addPlaylistRow(panel, url));
}

function addPlaylistRow(panel, value = "") {
  const container = panel.querySelector("[data-playlist-rows]");
  if (!container) return;
  const row = document.createElement("div");
  row.className = "p5em-playlist-row";
  const kind = isLikelyRemoteUrl(value) ? "url" : "local";
  row.dataset.kind = kind;
  row.innerHTML = `
    <select data-input="playlist-kind" aria-label="Playlist item type">
      <option value="url"${kind === "url" ? " selected" : ""}>URL</option>
      <option value="local"${kind === "local" ? " selected" : ""}>Local path</option>
    </select>
    <input data-input="playlist-url" type="text" value="${escapeAttr(value)}" placeholder="${kind === "local" ? "./local-sketch/index.html" : "https://example.com/artwork/index.html"}">
    <button type="button" data-action="playlist-preview">Preview</button>
    <label class="p5em-drop-zone">
      <span>Drop HTML</span>
      <input data-input="playlist-file" type="file" accept=".html,text/html">
    </label>
    <button type="button" data-action="playlist-remove" aria-label="Remove playlist URL">-</button>
  `;
  const dropZone = row.querySelector(".p5em-drop-zone");
  dropZone.addEventListener("dragover", (event) => {
    event.preventDefault();
    dropZone.classList.add("is-dragging");
  });
  dropZone.addEventListener("dragleave", () => dropZone.classList.remove("is-dragging"));
  dropZone.addEventListener("drop", (event) => {
    event.preventDefault();
    dropZone.classList.remove("is-dragging");
    previewDroppedArtwork(event.dataTransfer, panel.__p5emApi, row);
  });
  row.querySelector("[data-input='playlist-url']").addEventListener("focus", () => {
    container.dataset.editing = "true";
  });
  row.querySelector("[data-input='playlist-url']").addEventListener("input", () => {
    row.querySelector("[data-input='playlist-url']").dataset.temporaryPreview = "false";
    container.dataset.dirty = "true";
  });
  row.querySelector("[data-input='playlist-url']").addEventListener("blur", () => {
    container.dataset.editing = "false";
  });
  container.appendChild(row);
}

function updatePlaylistRowKind(row, kind) {
  row.dataset.kind = kind;
  const input = row.querySelector("[data-input='playlist-url']");
  if (input) {
    input.placeholder = kind === "local" ? "./local-sketch/index.html" : "https://example.com/artwork/index.html";
  }
}

async function previewDroppedArtwork(source, api, row = null) {
  const files = await collectDroppedFiles(source);
  const html = findPreviewHtml(files);
  if (!html) return;
  const url = await createDroppedArtworkUrl(html, files);
  api.previewPlaylistUrl(url);
  markTemporaryPreview(row, getDroppedFilePath(html));
}

function loadConfigFile(file, api, panel) {
  if (!file) return;
  const reader = new FileReader();
  reader.addEventListener("load", () => {
    try {
      const next = JSON.parse(String(reader.result || "{}"));
      api.loadConfig(next);
      syncPlaylistRows(panel, playlistConfigFrom(api.getConfig()).items, { force: true });
    } catch (error) {
      console.warn("p5 Exhibition Mode could not load runtime JSON", error);
    }
  });
  reader.readAsText(file);
}

function markTemporaryPreview(row, filename) {
  const input = row?.querySelector("[data-input='playlist-url']");
  if (!input) return;
  input.value = `[temporary preview] ${filename}`;
  input.dataset.temporaryPreview = "true";
}

async function collectDroppedFiles(source) {
  const items = Array.from(source?.items || []);
  if (items.length) {
    const files = [];
    await Promise.all(items.map(async (item) => {
      const entry = item.webkitGetAsEntry?.();
      if (entry) await collectEntryFiles(entry, "", files);
      else {
        const file = item.getAsFile?.();
        if (file) files.push(file);
      }
    }));
    return files;
  }
  return Array.from(source?.files || []);
}

function collectEntryFiles(entry, prefix, files) {
  return new Promise((resolve) => {
    if (entry.isFile) {
      entry.file((file) => {
        file.p5emPath = `${prefix}${file.name}`;
        files.push(file);
        resolve();
      }, resolve);
      return;
    }
    if (!entry.isDirectory) {
      resolve();
      return;
    }
    const reader = entry.createReader();
    const readBatch = () => {
      reader.readEntries(async (entries) => {
        if (!entries.length) {
          resolve();
          return;
        }
        await Promise.all(entries.map((child) => collectEntryFiles(child, `${prefix}${entry.name}/`, files)));
        readBatch();
      }, resolve);
    };
    readBatch();
  });
}

function findPreviewHtml(files) {
  const htmlFiles = files.filter((file) => getDroppedFilePath(file).toLowerCase().endsWith(".html"));
  return htmlFiles.find((file) => pathBasename(getDroppedFilePath(file)).toLowerCase() === "index.html") || htmlFiles[0] || null;
}

async function createDroppedArtworkUrl(htmlFile, files) {
  const objectUrls = new Map();
  const cleanup = [];
  const htmlPath = normalizePath(getDroppedFilePath(htmlFile));
  const htmlDir = pathDirname(htmlPath);

  files.forEach((file) => {
    const url = URL.createObjectURL(file);
    cleanup.push(url);
    objectUrls.set(normalizePath(getDroppedFilePath(file)), url);
  });

  const source = await htmlFile.text();
  const rewritten = source.replace(/\b(src|href|poster)=["']([^"']+)["']/gi, (match, attr, value) => {
    const replacement = resolveDroppedAsset(value, htmlDir, objectUrls);
    return replacement ? `${attr}="${replacement}"` : match;
  }).replace(/url\((["']?)([^"')]+)\1\)/gi, (match, quote, value) => {
    const replacement = resolveDroppedAsset(value, htmlDir, objectUrls);
    return replacement ? `url("${replacement}")` : match;
  });
  const htmlUrl = URL.createObjectURL(new Blob([rewritten], { type: "text/html" }));
  cleanup.push(htmlUrl);
  setTimeout(() => cleanup.forEach((url) => URL.revokeObjectURL(url)), 300000);
  return htmlUrl;
}

function resolveDroppedAsset(value, baseDir, objectUrls) {
  if (/^(https?:|data:|blob:|#|mailto:|tel:)/i.test(value)) return null;
  const [pathPart, suffix = ""] = value.split(/(?=[?#])/);
  const normalized = normalizePath(joinPath(baseDir, pathPart));
  return objectUrls.get(normalized) ? `${objectUrls.get(normalized)}${suffix}` : null;
}

function getDroppedFilePath(file) {
  return normalizePath(file.webkitRelativePath || file.p5emPath || file.name);
}

function normalizePath(value) {
  const parts = String(value || "").replace(/\\/g, "/").split("/");
  const out = [];
  for (const part of parts) {
    if (!part || part === ".") continue;
    if (part === "..") out.pop();
    else out.push(part);
  }
  return out.join("/");
}

function joinPath(base, value) {
  return normalizePath(`${base ? `${base}/` : ""}${value}`);
}

function pathDirname(value) {
  const parts = normalizePath(value).split("/");
  parts.pop();
  return parts.join("/");
}

function pathBasename(value) {
  const parts = normalizePath(value).split("/");
  return parts[parts.length - 1] || "";
}

function collectPlaylistRows(panel) {
  return Array.from(panel.querySelectorAll("[data-input='playlist-url']"))
    .filter((input) => input.dataset.temporaryPreview !== "true")
    .map((input) => input.value.trim())
    .filter(Boolean);
}

function isLikelyRemoteUrl(value) {
  return /^(https?:|blob:|about:)/i.test(String(value || "").trim());
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
    .p5em-kiosk,
    .p5em-kiosk body {
      overflow: hidden !important;
      overscroll-behavior: none !important;
      -webkit-user-select: none !important;
      user-select: none !important;
      -webkit-touch-callout: none !important;
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
    .p5em-hide-cursor *,
    .p5em-hide-cursor body,
    .p5em-hide-cursor canvas,
    .p5em-hide-cursor iframe,
    .p5em-hide-cursor body > canvas,
    .p5em-hide-cursor .p5em-playlist-frame {
      cursor: none !important;
    }
    .p5em-hide-cursor #${PANEL_ID},
    .p5em-hide-cursor #${PANEL_ID} * {
      cursor: auto !important;
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
      left: 50%;
      top: 50%;
      z-index: 2;
      width: var(--p5em-frame-width, 100vw);
      height: var(--p5em-frame-height, 100vh);
      border: 0;
      background: #050505;
      transform: translate(-50%, -50%) rotate(var(--p5em-rotation, 0deg));
      transform-origin: center center;
    }
    .p5em-playlist-frame[hidden] {
      display: none;
    }
    .p5em-playlist-active body > canvas,
    .p5em-playlist-active body main canvas,
    .p5em-playlist-active body .p5Canvas {
      opacity: 0 !important;
      visibility: hidden !important;
      pointer-events: none !important;
    }
    .p5em-kiosk .p5em-playlist-frame {
      pointer-events: none;
    }
    #p5em-overlay-layer {
      position: fixed;
      left: 50%;
      top: 50%;
      z-index: 2147483646;
      width: var(--p5em-frame-width, 100vw);
      height: var(--p5em-frame-height, 100vh);
      transform: translate(-50%, -50%) rotate(var(--p5em-rotation, 0deg));
      transform-origin: center center;
      pointer-events: none;
    }
    #p5em-title-overlay {
      position: absolute;
      max-width: min(520px, calc(100% - 36px));
      font: 500 11px/1.35 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      pointer-events: none;
    }
    #p5em-card-overlay {
      position: absolute;
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      align-items: center;
      gap: 14px;
      max-width: min(520px, calc(100% - 36px));
      padding: 14px;
      color: rgba(255,255,255,0.9);
      background: rgba(7,7,7,0.72);
      border: 1px solid rgba(255,255,255,0.18);
      backdrop-filter: blur(14px);
      text-decoration: none;
      pointer-events: auto;
    }
    #p5em-card-overlay .p5em-card-copy {
      display: grid;
      gap: 4px;
      min-width: 0;
    }
    #p5em-card-overlay strong {
      overflow-wrap: anywhere;
      font: inherit;
      font-weight: 500;
    }
    #p5em-title-overlay[data-bold="true"],
    #p5em-card-overlay[data-bold="true"] strong {
      font-weight: 700;
    }
    #p5em-card-overlay span {
      color: rgba(255,255,255,0.58);
      font: 400 max(9px, 0.58em)/1.35 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      letter-spacing: 0.08em;
      text-transform: uppercase;
    }
    #p5em-card-overlay img {
      display: block;
      padding: 5px;
      background: rgba(255,255,255,0.92);
    }
    #p5em-card-overlay[data-qr-placement="below"] {
      grid-template-columns: minmax(0, 1fr);
      justify-items: start;
      max-width: min(360px, calc(100% - 36px));
    }
    #p5em-card-overlay[data-qr-placement="below"] img {
      margin-top: 2px;
    }
    #p5em-card-overlay[data-qr-placement="left"] {
      grid-template-columns: auto minmax(0, 1fr);
    }
    #p5em-card-overlay[data-qr-placement="left"] .p5em-card-copy {
      order: 2;
    }
    #p5em-card-overlay[data-qr-placement="left"] img {
      order: 1;
    }
    #p5em-title-overlay[data-font="sans"],
    #p5em-card-overlay[data-font="sans"] {
      font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }
    #p5em-title-overlay[data-font="serif"],
    #p5em-card-overlay[data-font="serif"] {
      font-family: Georgia, "Times New Roman", serif;
      letter-spacing: 0.02em;
      text-transform: none;
    }
    #p5em-title-overlay[data-font="system"],
    #p5em-card-overlay[data-font="system"] {
      font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      letter-spacing: 0.03em;
    }
    #p5em-title-overlay[data-font="condensed"],
    #p5em-card-overlay[data-font="condensed"] {
      font-family: "Arial Narrow", "Helvetica Neue Condensed", Impact, sans-serif;
      letter-spacing: 0.08em;
    }
    #p5em-title-overlay[data-font="humanist"],
    #p5em-card-overlay[data-font="humanist"] {
      font-family: Avenir, "Avenir Next", Optima, Candara, sans-serif;
      letter-spacing: 0.04em;
      text-transform: none;
    }
    #p5em-title-overlay[data-font="editorial"],
    #p5em-card-overlay[data-font="editorial"] {
      font-family: "Didot", "Bodoni 72", "Bodoni 72 Oldstyle", Georgia, serif;
      letter-spacing: 0.02em;
      text-transform: none;
    }
    #p5em-title-overlay[data-font="classic"],
    #p5em-card-overlay[data-font="classic"] {
      font-family: Garamond, "Iowan Old Style", "Times New Roman", serif;
      letter-spacing: 0.015em;
      text-transform: none;
    }
    #p5em-title-overlay[data-font="book"],
    #p5em-card-overlay[data-font="book"] {
      font-family: "Hoefler Text", "Palatino Linotype", Palatino, Georgia, serif;
      letter-spacing: 0.01em;
      text-transform: none;
    }
    #p5em-title-overlay[data-font="neo"],
    #p5em-card-overlay[data-font="neo"] {
      font-family: Futura, "Avenir Next", Avenir, "Trebuchet MS", sans-serif;
      letter-spacing: 0.1em;
    }
    #p5em-title-overlay[data-font="geometric"],
    #p5em-card-overlay[data-font="geometric"] {
      font-family: "Gill Sans", Futura, "Century Gothic", sans-serif;
      letter-spacing: 0.08em;
    }
    #p5em-title-overlay[data-font="architectural"],
    #p5em-card-overlay[data-font="architectural"] {
      font-family: "Helvetica Neue", Helvetica, Arial, sans-serif;
      font-weight: 600;
      letter-spacing: 0.16em;
    }
    #p5em-title-overlay[data-font="typewriter"],
    #p5em-card-overlay[data-font="typewriter"] {
      font-family: "Courier Prime", "Courier New", Courier, monospace;
      letter-spacing: 0.04em;
      text-transform: none;
    }
    #p5em-title-overlay[data-color="white"],
    #p5em-card-overlay[data-color="white"] {
      color: rgba(255,255,255,0.88);
    }
    #p5em-title-overlay[data-color="black"],
    #p5em-card-overlay[data-color="black"] {
      color: rgba(0,0,0,0.88);
      border-color: rgba(0,0,0,0.16);
    }
    #p5em-title-overlay[data-color="gray"],
    #p5em-card-overlay[data-color="gray"] {
      color: rgba(150,150,150,0.9);
    }
    #p5em-title-overlay[data-position^="top"],
    #p5em-qr-overlay[data-position^="top"],
    #p5em-card-overlay[data-position^="top"] {
      top: var(--p5em-overlay-safe-area, 18px);
      bottom: auto;
    }
    #p5em-title-overlay[data-position^="bottom"],
    #p5em-qr-overlay[data-position^="bottom"],
    #p5em-card-overlay[data-position^="bottom"] {
      top: auto;
      bottom: var(--p5em-overlay-safe-area, 18px);
    }
    #p5em-title-overlay[data-stack-qr="true"][data-position^="bottom"] {
      bottom: calc(var(--p5em-overlay-safe-area, 18px) + var(--p5em-qr-stack-offset, 110px));
    }
    #p5em-qr-overlay[data-stack-title="true"][data-position^="top"] {
      top: calc(var(--p5em-overlay-safe-area, 18px) + 52px);
    }
    #p5em-title-overlay[data-position$="left"],
    #p5em-qr-overlay[data-position$="left"],
    #p5em-card-overlay[data-position$="left"] {
      left: var(--p5em-overlay-safe-area, 18px);
      right: auto;
      transform: none;
      text-align: left;
    }
    #p5em-title-overlay[data-position$="center"],
    #p5em-qr-overlay[data-position$="center"],
    #p5em-card-overlay[data-position$="center"] {
      left: 50%;
      right: auto;
      transform: translateX(-50%);
      text-align: center;
    }
    #p5em-title-overlay[data-position$="right"],
    #p5em-qr-overlay[data-position$="right"],
    #p5em-card-overlay[data-position$="right"] {
      left: auto;
      right: var(--p5em-overlay-safe-area, 18px);
      transform: none;
      text-align: right;
    }
    #p5em-qr-overlay {
      position: absolute;
      display: block;
      padding: 6px;
      background: rgba(255,255,255,0.9);
      box-shadow: 0 8px 30px rgba(0,0,0,0.28);
      pointer-events: auto;
    }
    #p5em-qr-overlay img {
      display: block;
      width: 100%;
      height: 100%;
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
    .p5em-panel-actions button,
    .p5em-tabs button,
    .p5em-playlist-head button,
    .p5em-playlist-row button {
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
    .p5em-tabs {
      display: flex;
      gap: 7px;
      flex: 0 0 auto;
      margin-top: 10px;
    }
    .p5em-tabs button {
      padding: 7px 10px;
      color: rgba(255,255,255,0.48);
      font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      font-size: 9px;
      letter-spacing: 0.14em;
      text-transform: uppercase;
    }
    .p5em-tabs button.is-active {
      color: rgba(255,255,255,0.92);
      border-color: rgba(255,255,255,0.42);
      background: rgba(255,255,255,0.045);
    }
    .p5em-tab-panel {
      flex: 1 1 auto;
      min-height: 0;
      display: none;
      flex-direction: column;
    }
    .p5em-tab-panel.is-active {
      display: flex;
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
    .p5em-overlay-controls {
      display: grid;
      grid-template-columns: 1fr;
      gap: 8px;
      margin-top: 10px;
      padding-top: 10px;
      overflow: auto;
      flex: 1 1 auto;
      min-height: 0;
      border-top: 1px solid rgba(255,255,255,0.14);
    }
    .p5em-control-group {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 7px 12px;
      padding: 8px 0;
      border-top: 1px solid rgba(255,255,255,0.12);
    }
    .p5em-control-group-wide {
      grid-column: 1 / -1;
    }
    .p5em-compact-group {
      align-items: center;
    }
    .p5em-wide-control {
      grid-column: 1 / -1;
    }
    .p5em-control-group h2 {
      grid-column: 1 / -1;
      margin: 0;
      color: rgba(255,255,255,0.58);
      font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      font-size: 9px;
      letter-spacing: 0.14em;
      text-transform: uppercase;
    }
    .p5em-button-row {
      grid-column: 1 / -1;
      display: flex;
      flex-wrap: wrap;
      gap: 7px;
    }
    .p5em-copy-field {
      grid-column: span 2;
      display: grid;
      grid-template-columns: auto minmax(0, 1fr) auto;
      align-items: center;
      gap: 8px;
      min-width: 0;
      color: rgba(255,255,255,0.58);
      font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      font-size: 9px;
      letter-spacing: 0.12em;
      text-transform: uppercase;
    }
    .p5em-copy-field strong {
      min-width: 0;
      overflow: hidden;
      color: rgba(255,255,255,0.9);
      font-weight: 400;
      text-overflow: ellipsis;
      white-space: nowrap;
      text-transform: none;
      letter-spacing: 0.02em;
    }
    .p5em-copy-field button,
    .p5em-button-row button {
      padding: 7px 8px;
      color: rgba(255,255,255,0.78);
      background: rgba(255,255,255,0.04);
      border: 1px solid rgba(255,255,255,0.18);
      font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      font-size: 9px;
      letter-spacing: 0.12em;
      text-transform: uppercase;
      cursor: pointer;
    }
    .p5em-text-control {
      display: grid;
      gap: 5px;
      color: rgba(255,255,255,0.58);
      font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      font-size: 9px;
      letter-spacing: 0.12em;
      text-transform: uppercase;
    }
    .p5em-text-control input {
      min-width: 0;
      padding: 7px 8px;
      color: rgba(255,255,255,0.9);
      background: rgba(255,255,255,0.04);
      border: 1px solid rgba(255,255,255,0.18);
      border-radius: 0;
      font: 10px/1.35 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
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
    .p5em-playlist-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
      flex: 0 0 auto;
    }
    .p5em-playlist-editor h2 {
      margin: 0 0 6px;
      color: rgba(255,255,255,0.58);
      font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      font-size: 9px;
      letter-spacing: 0.14em;
      text-transform: uppercase;
    }
    .p5em-playlist-head button {
      width: 26px;
      height: 24px;
      line-height: 1;
      font-size: 13px;
    }
    .p5em-playlist-options {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 7px 12px;
      flex: 0 0 auto;
      margin: 4px 0 8px;
    }
    .p5em-playlist-rows {
      flex: 1 1 auto;
      min-height: 0;
      overflow: hidden;
      display: flex;
      flex-direction: column;
      gap: 7px;
    }
    .p5em-playlist-row {
      display: grid;
      grid-template-columns: 104px minmax(0, 1fr) auto auto 26px;
      gap: 7px;
      align-items: center;
    }
    .p5em-playlist-row[data-kind="url"] .p5em-drop-zone {
      display: none;
    }
    .p5em-playlist-row input[type="text"],
    .p5em-playlist-row select {
      min-width: 0;
      padding: 7px 8px;
      color: rgba(255,255,255,0.9);
      background: rgba(255,255,255,0.04);
      border: 1px solid rgba(255,255,255,0.18);
      border-radius: 0;
      font: 10px/1.35 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    }
    .p5em-playlist-row button {
      padding: 7px 8px;
      color: rgba(255,255,255,0.7);
      background: rgba(255,255,255,0.04);
      border: 1px solid rgba(255,255,255,0.18);
      font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      font-size: 9px;
      letter-spacing: 0.12em;
      text-transform: uppercase;
      cursor: pointer;
    }
    .p5em-drop-zone {
      position: relative;
      overflow: hidden;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-height: 27px;
      padding: 0 8px;
      color: rgba(255,255,255,0.7);
      background: rgba(255,255,255,0.04);
      border: 1px dashed rgba(255,255,255,0.24);
      font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      font-size: 9px;
      letter-spacing: 0.12em;
      text-transform: uppercase;
      cursor: pointer;
    }
    .p5em-drop-zone.is-dragging {
      color: rgba(255,255,255,0.95);
      border-color: rgba(255,255,255,0.62);
      background: rgba(255,255,255,0.1);
    }
    .p5em-drop-zone input[type="file"] {
      position: absolute;
      inset: 0;
      opacity: 0;
      cursor: pointer;
    }
    .p5em-playlist-row button[aria-label] {
      width: 26px;
      height: 27px;
      line-height: 1;
      padding: 0;
    }
    .p5em-playlist-editor p {
      margin: 6px 0 0;
      color: rgba(255,255,255,0.42);
      font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      font-size: 9px;
      letter-spacing: 0.08em;
      text-transform: uppercase;
    }
    .p5em-log-viewer {
      margin-top: 10px;
      padding-top: 10px;
      flex: 1 1 auto;
      min-height: 0;
      display: flex;
      flex-direction: column;
      border-top: 1px solid rgba(255,255,255,0.14);
    }
    .p5em-log-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
      flex: 0 0 auto;
      margin-bottom: 8px;
    }
    .p5em-log-head h2 {
      margin: 0;
      color: rgba(255,255,255,0.58);
      font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      font-size: 9px;
      letter-spacing: 0.14em;
      text-transform: uppercase;
    }
    .p5em-log-head button {
      padding: 7px 8px;
      color: rgba(255,255,255,0.78);
      background: rgba(255,255,255,0.04);
      border: 1px solid rgba(255,255,255,0.18);
      font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      font-size: 9px;
      letter-spacing: 0.12em;
      text-transform: uppercase;
      cursor: pointer;
    }
    .p5em-log-rows {
      flex: 1 1 auto;
      min-height: 0;
      overflow: auto;
      display: grid;
      align-content: start;
      gap: 6px;
    }
    .p5em-log-rows p {
      margin: 0;
      color: rgba(255,255,255,0.42);
      font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      font-size: 9px;
      letter-spacing: 0.08em;
      text-transform: uppercase;
    }
    .p5em-log-row {
      display: grid;
      grid-template-columns: 72px 56px minmax(0, 1fr);
      gap: 8px;
      align-items: start;
      padding: 7px 8px;
      border: 1px solid rgba(255,255,255,0.1);
      background: rgba(255,255,255,0.025);
      color: rgba(255,255,255,0.7);
      font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      font-size: 9px;
      line-height: 1.35;
    }
    .p5em-log-row time,
    .p5em-log-row strong {
      color: rgba(255,255,255,0.48);
      font-weight: 400;
      text-transform: uppercase;
    }
    .p5em-log-row span {
      min-width: 0;
      overflow-wrap: anywhere;
    }
    .p5em-log-row[data-level="error"] {
      border-color: rgba(255,120,120,0.34);
      color: rgba(255,190,190,0.92);
    }
    .p5em-log-row[data-level="warn"] {
      border-color: rgba(255,210,120,0.28);
      color: rgba(255,230,180,0.86);
    }
    .p5em-toggle,
    .p5em-number-control {
      display: flex;
      align-items: center;
      justify-content: flex-start;
      gap: 7px;
      color: rgba(255,255,255,0.7);
      font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      font-size: 9px;
      letter-spacing: 0.1em;
      text-transform: uppercase;
    }
    .p5em-toggle input {
      position: absolute;
      opacity: 0;
      pointer-events: none;
    }
    .p5em-toggle i {
      position: relative;
      width: 24px;
      height: 13px;
      border: 1px solid rgba(255,255,255,0.24);
      background: rgba(255,255,255,0.035);
      flex: 0 0 auto;
    }
    .p5em-toggle i::after {
      content: "";
      position: absolute;
      top: 2px;
      left: 2px;
      width: 7px;
      height: 7px;
      background: rgba(255,255,255,0.36);
      transition: transform 0.18s ease, background 0.18s ease;
    }
    .p5em-toggle input:checked + i {
      border-color: rgba(255,255,255,0.62);
      background: rgba(255,255,255,0.1);
    }
    .p5em-toggle input:checked + i::after {
      transform: translateX(11px);
      background: rgba(255,255,255,0.92);
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
      .p5em-control-group {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }
    }
    @media (max-width: 420px) {
      .p5em-panel-grid,
      .p5em-panel-controls,
      .p5em-control-group {
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

function readRuntimeConfig(storageKey) {
  try {
    const raw = localStorage.getItem(storageKey);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeRuntimeConfig(storageKey, config) {
  try {
    localStorage.setItem(storageKey, JSON.stringify(config));
  } catch {
    // Storage can be unavailable in private browsing or locked-down kiosk shells.
  }
}

function mergeRuntimeConfig(base, next = {}) {
  const playlist = Array.isArray(next.playlist)
    ? next.playlist
    : { ...(base.playlist || {}), ...(next.playlist || {}) };
  return {
    ...base,
    ...next,
    accessibility: { ...(base.accessibility || {}), ...(next.accessibility || {}) },
    watchdog: { ...(base.watchdog || {}), ...(next.watchdog || {}) },
    logging: { ...(base.logging || {}), ...(next.logging || {}) },
    healthCheck: { ...(base.healthCheck || {}), ...(next.healthCheck || {}) },
    localFiles: { ...(base.localFiles || {}), ...(next.localFiles || {}) },
    playlist
  };
}

function serializeRuntimeConfig(config) {
  return {
    title: config.title,
    artist: config.artist,
    year: config.year,
    showTitleOverlay: config.showTitleOverlay,
    titleOverlayFont: config.titleOverlayFont,
    titleOverlayColor: config.titleOverlayColor,
    titleOverlayPosition: config.titleOverlayPosition,
    titleOverlaySize: config.titleOverlaySize,
    titleOverlayBold: Boolean(config.titleOverlayBold),
    overlayLayout: config.overlayLayout,
    cardQrPlacement: config.cardQrPlacement,
    overlaySafeArea: config.overlaySafeArea,
    qrLink: config.qrLink,
    showQr: config.showQr,
    qrPosition: config.qrPosition,
    qrSize: config.qrSize,
    qrProvider: config.qrProvider,
    seed: config.seed,
    fullscreen: config.fullscreen,
    kiosk: config.kiosk,
    disableContextMenu: config.disableContextMenu,
    disableTouchGestures: config.disableTouchGestures,
    preventScroll: config.preventScroll,
    hideCursor: config.hideCursor,
    hideCursorMode: config.hideCursorMode,
    cursorIdleMs: config.cursorIdleMs,
    idleReset: config.idleReset,
    maxPixelRatio: config.maxPixelRatio,
    monitor: config.monitor,
    panel: config.panel,
    panelKey: config.panelKey,
    rotation: config.rotation,
    refreshOnRotation: config.refreshOnRotation,
    accessibility: accessibilitySnapshot(config.accessibility),
    watchdog: { ...config.watchdog },
    logging: { ...config.logging },
    healthCheck: { ...config.healthCheck },
    localFiles: { ...config.localFiles },
    playlist: Array.isArray(config.playlist) ? { ...DEFAULTS.playlist, enabled: true, items: config.playlist } : { ...config.playlist },
    persist: config.persist,
    storageKey: config.storageKey
  };
}

function accessibilitySnapshot(accessibility = {}) {
  return {
    reducedMotion: Boolean(accessibility.reducedMotion),
    highContrast: Boolean(accessibility.highContrast)
  };
}

function formatTitleOverlay(config) {
  const title = config.title || "Artwork Title";
  const artist = config.artist || "Artist Name";
  const year = config.year ? `, ${config.year}` : "";
  return `${title} by ${artist}${year}`;
}

function positionOptions(selected = "top-left") {
  return [
    ["top-left", "Top Left"],
    ["top-center", "Top Center"],
    ["top-right", "Top Right"],
    ["bottom-left", "Bottom Left"],
    ["bottom-center", "Bottom Center"],
    ["bottom-right", "Bottom Right"]
  ].map(([value, label]) => `<option value="${value}"${normalizeOverlayPosition(selected) === value ? " selected" : ""}>${label}</option>`).join("");
}

function overlayLayoutOptions(selected = "separate") {
  return [
    ["separate", "Separate"],
    ["card", "Title + QR Card"]
  ].map(([value, label]) => `<option value="${value}"${normalizeOverlayLayout(selected) === value ? " selected" : ""}>${label}</option>`).join("");
}

function cardQrPlacementOptions(selected = "below") {
  return [
    ["below", "Below Title"],
    ["right", "Right Side"],
    ["left", "Left Side"]
  ].map(([value, label]) => `<option value="${value}"${normalizeCardQrPlacement(selected) === value ? " selected" : ""}>${label}</option>`).join("");
}

function fontOptions(selected = "mono") {
  return [
    ["mono", "Mono"],
    ["sans", "Sans"],
    ["system", "System"],
    ["serif", "Serif"],
    ["editorial", "Editorial Serif"],
    ["classic", "Classic Serif"],
    ["book", "Book Serif"],
    ["humanist", "Humanist"],
    ["neo", "Neo Grotesk"],
    ["geometric", "Geometric"],
    ["architectural", "Architectural"],
    ["condensed", "Condensed"],
    ["typewriter", "Typewriter"]
  ].map(([value, label]) => `<option value="${value}"${normalizeTitleFont(selected) === value ? " selected" : ""}>${label}</option>`).join("");
}

function normalizeOverlayPosition(value) {
  const allowed = new Set(["top-left", "top-center", "top-right", "bottom-left", "bottom-center", "bottom-right"]);
  return allowed.has(value) ? value : "top-left";
}

function normalizeOverlayLayout(value) {
  return value === "card" ? "card" : "separate";
}

function normalizeCardQrPlacement(value) {
  if (value === "left" || value === "right") return value;
  return "below";
}

function normalizeTitleFont(value) {
  const allowed = new Set(["mono", "sans", "system", "serif", "editorial", "classic", "book", "humanist", "neo", "geometric", "architectural", "condensed", "typewriter"]);
  if (allowed.has(value)) return value;
  return "mono";
}

function normalizeTitleColor(value) {
  if (value === "black" || value === "gray") return value;
  return "white";
}

function normalizeOverlaySafeArea(value) {
  return clamp(Number(value) || 0, 0, 160);
}

function buildQrUrl(link, size, provider = DEFAULTS.qrProvider) {
  const url = new URL(provider);
  url.searchParams.set("size", `${size}x${size}`);
  url.searchParams.set("data", link);
  return url.toString();
}

function readUrlHash(url, hashParam = "hash") {
  if (!url) return "";
  return url.searchParams.get(hashParam) || "";
}

function safeUrl(value) {
  try {
    return new URL(value, window.location.href);
  } catch {
    return null;
  }
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function shortenMiddle(value, max = 40) {
  const text = String(value || "");
  if (text.length <= max) return text;
  const keep = Math.floor((max - 3) / 2);
  return `${text.slice(0, keep)}...${text.slice(-keep)}`;
}

function formatLogTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "--:--:--";
  return date.toLocaleTimeString([], { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" });
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

function downloadJson(data, filename) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function copyDiagnostics(data) {
  const text = JSON.stringify(data, null, 2);
  if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(text).catch(() => {});
  else console.info("p5 Exhibition Mode diagnostics", data);
}

async function copyText(text) {
  if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(text).catch(() => {});
  else console.info("p5 Exhibition Mode", text);
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
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

function escapeAttr(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function normalizePlaylistItems(items) {
  if (typeof items === "string") return parsePlaylistText(items);
  if (!Array.isArray(items)) return [];
  return items
    .map((item) => {
      if (typeof item === "string") return isTemporaryBlobUrl(item) ? null : item.trim();
      if (item && typeof item === "object" && item.url && !isTemporaryBlobUrl(item.url)) return item;
      return null;
    })
    .filter(Boolean);
}

function isTemporaryBlobUrl(value) {
  return /^blob:/i.test(String(value || "").trim());
}

function randomHashValue() {
  const bytes = new Uint32Array(4);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (value) => value.toString(16).padStart(8, "0")).join("");
}

function normalizeRotation(value) {
  const degrees = Number(value) || 0;
  const normalized = ((degrees % 360) + 360) % 360;
  if (normalized === 90 || normalized === 180 || normalized === 270) return normalized;
  return 0;
}

function normalizeIntervalUnit(unit) {
  if (unit === "minutes" || unit === "hours") return unit;
  return "seconds";
}

function intervalToSeconds(value, unit) {
  const amount = Math.max(1, Number(value) || 1);
  const normalized = normalizeIntervalUnit(unit);
  if (normalized === "hours") return Math.max(5, Math.round(amount * 3600));
  if (normalized === "minutes") return Math.max(5, Math.round(amount * 60));
  return Math.max(5, Math.round(amount));
}

function intervalDisplayValue(seconds, unit) {
  const normalized = normalizeIntervalUnit(unit);
  if (normalized === "hours") return Math.max(1, Math.round(seconds / 3600));
  if (normalized === "minutes") return Math.max(1, Math.round(seconds / 60));
  return Math.max(5, Math.round(seconds));
}

function formatInterval(seconds) {
  if (seconds >= 3600 && seconds % 3600 === 0) return `${seconds / 3600}h`;
  if (seconds >= 60 && seconds % 60 === 0) return `${seconds / 60}m`;
  return `${seconds}s`;
}
