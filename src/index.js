// p5 Exhibition Mode
// Developed @ Phenomena Labs. Open source with credit; contributions: info@phenomenalabs.com or phenomenalabs.eth.

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
  capture: {
    filename: "exhibition-capture",
    source: "auto",
    codec: "h264",
    videoBitsPerSecond: 30000000,
    frameRate: 60,
    includeAudio: false,
    hidePanelDuringCapture: false
  },
  playlist: {
    enabled: false,
    items: [],
    itemOrder: "loop",
    intervalSeconds: 120,
    intervalUnit: "seconds",
    hashes: [],
    hashOrder: "loop",
    hashIntervalSeconds: 120,
    hashIntervalUnit: "seconds",
    randomHash: false,
    hashParam: "hash",
    startIndex: 0
  },
  localFiles: {
    endpoint: "/__p5em/files",
    absolutePrefix: "/__p5em/abs/",
    urlMirrorRoot: "",
    fallbackFilePreview: true
  },
  ui: {
    activeTab: "runtime",
    panelBounds: null
  },
  customUrlParams: [],
  urlParams: true,
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
  const persistedConfig = savedConfig ? mergeRuntimeConfig(baseConfig, savedConfig) : baseConfig;
  const urlConfig = baseConfig.urlParams === false ? null : readUrlRuntimeConfig(window.location);
  const config = urlConfig ? mergeRuntimeConfig(persistedConfig, urlConfig) : persistedConfig;
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
    playlistHashIndex: 0,
    playlistLastChangeAt: performance.now(),
    playlistLastHashAt: performance.now(),
    lowFpsSince: null,
    droppedFrames: 0,
    logs: [],
    lastHealthAt: 0,
    raf: null,
    cursorHidden: false,
    consolePatched: false,
    originalConsole: {},
    currentHash: readUrlHash(new URL(window.location.href), DEFAULTS.playlist.hashParam),
    currentSource: window.location.href,
    lastLoggedHash: "",
    hashRecording: false,
    hashRecords: [],
    captureRecorder: null,
    captureStream: null,
    captureChunks: [],
    captureStartedAt: 0,
    captureStatus: "Idle",
    captureMimeType: "",
    captureMode: "",
    captureCanvas: null,
    captureSourceStream: null,
    captureSourceVideo: null,
    captureTrack: null,
    captureAnimationFrame: null,
    captureDirectoryHandle: null,
    captureDirectoryName: "",
    captureWasPanelOpen: false,
    captureLastGoodFrame: null,
    captureDrawErrorLogged: false,
    overlayStackFrame: null
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
    applyFreeTextOverlay();
    applyHashOverlay();
    applyQrOverlay();
    applyOverlayCard();
    setupPlaylist();

    if (config.panel) {
      state.panel = createPanel(config, api);
      state.panel.__p5emApiConfig = config;
      document.body.appendChild(state.panel);
      applyPanelUiState();
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
    if (state.overlayStackFrame) cancelAnimationFrame(state.overlayStackFrame);
    state.overlayStackFrame = null;
    document.documentElement.classList.remove("p5em-active", "p5em-hide-cursor", "p5em-lock-touch", "p5em-kiosk");
    document.documentElement.classList.remove("p5em-playlist-active");
    document.documentElement.style.removeProperty("--p5em-rotation");
    state.panel?.remove();
    state.playlistFrame?.remove();
    document.getElementById("p5em-recording-indicator")?.remove();
    document.getElementById("p5em-title-overlay")?.remove();
    document.getElementById("p5em-free-text-overlay")?.remove();
    document.getElementById("p5em-hash-overlay")?.remove();
    document.getElementById("p5em-qr-overlay")?.remove();
    document.getElementById("p5em-card-overlay")?.remove();
    document.getElementById("p5em-overlay-layer")?.remove();
    document.documentElement.style.removeProperty("--p5em-overlay-safe-area");
    restoreConsoleLogging();
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
    if (state.panelOpen) syncPlaylistHashRows(state.panel, playlistHashes(), { force: true });
    if (state.panelOpen) syncPlaylistMetadataEditor(state.panel);
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
    else saveCaptureDataUrl(dataUrl, safeName(config.title) + "-screenshot.png");
    return dataUrl;
  }

  function diagnostics() {
    const memory = performance.memory?.usedJSHeapSize
      ? Math.round(performance.memory.usedJSHeapSize / 1048576)
      : null;
    const data = {
      title: currentOverlayMetadata().title,
      artist: currentOverlayMetadata().artist,
      year: currentOverlayMetadata().year,
      titleOverlayVisible: Boolean(config.showTitleOverlay),
      titleOverlayFont: config.titleOverlayFont,
      titleOverlayColor: config.titleOverlayColor,
      titleOverlayPosition: config.titleOverlayPosition,
      titleOverlaySize: config.titleOverlaySize,
      titleOverlayBold: Boolean(config.titleOverlayBold),
      titleOverlayItalic: Boolean(config.titleOverlayItalic),
      freeText: currentOverlayMetadata().freeText,
      freeTextVisible: Boolean(config.showFreeText),
      freeTextPosition: config.freeTextPosition,
      freeTextSize: config.freeTextSize,
      hashOverlayVisible: Boolean(config.showHashOverlay),
      hashOverlayPosition: normalizeHashOverlayPosition(config.hashOverlayPosition),
      hashOverlaySafeArea: normalizeHashOverlaySafeArea(config.hashOverlaySafeArea),
      hashOverlaySize: normalizeHashOverlaySize(config.hashOverlaySize),
      hashOverlayColor: normalizeHashOverlayColor(config.hashOverlayColor),
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
      captureRecording: Boolean(state.captureRecorder && state.captureRecorder.state === "recording"),
      captureStatus: state.captureStatus,
      captureDurationSeconds: state.captureStartedAt ? Math.round((performance.now() - state.captureStartedAt) / 1000) : 0,
      captureMimeType: state.captureMimeType || "Browser default",
      captureMode: state.captureMode || normalizeCaptureSource(captureConfig().source),
      captureOutput: state.captureDirectoryName || "Browser downloads",
      playlistEnabled: Boolean(state.playlistEnabled),
      playlistIndex: state.playlistIndex,
      playlistCount: playlistItems().length,
      playlistHashIndex: state.playlistHashIndex,
      playlistHashCount: playlistHashes().length,
      playlistIntervalSeconds: playlistIntervalSeconds(),
      playlistIntervalUnit: playlistConfig().intervalUnit,
      playlistHashIntervalSeconds: playlistHashIntervalSeconds(),
      playlistHashIntervalUnit: playlistConfig().hashIntervalUnit,
      playlistRandomHash: Boolean(playlistConfig().randomHash),
      customUrlParams: normalizeCustomUrlParams(config.customUrlParams),
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
    const handleKeydown = (event) => {
      if (event.key.toLowerCase() === "c" && event.shiftKey && state.captureRecorder?.state === "recording") {
        event.preventDefault();
        event.stopPropagation();
        stopCapture();
        return;
      }
      if (event.key.toLowerCase() === config.panelKey.toLowerCase() && event.shiftKey) {
        event.preventDefault();
        event.stopPropagation();
        togglePanel();
      }
      if (state.panelOpen && event.key === "Escape") togglePanel(false);
    };
    add(document, "keydown", handleKeydown, { capture: true });
    add(window, "keydown", handleKeydown, { capture: true });
    add(window, "blur", () => {
      if (document.activeElement === state.playlistFrame) setTimeout(reclaimKeyboardFocus, 80);
    });
    add(window, "resize", scheduleOverlayStacking);
  }

  function reclaimKeyboardFocus() {
    if (state.panelOpen || document.activeElement !== state.playlistFrame) return;
    state.playlistFrame.blur();
    document.body.setAttribute("tabindex", "-1");
    document.body.focus({ preventScroll: true });
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
      syncPlaylistFrameRuntime();
    }
  }

  function showCursor() {
    state.cursorHidden = false;
    document.documentElement.classList.remove("p5em-hide-cursor");
    syncPlaylistFrameRuntime();
  }

  function updateInputLockClasses() {
    document.documentElement.classList.toggle("p5em-lock-touch", Boolean(config.disableTouchGestures));
    syncPlaylistFrameRuntime();
  }

  function applyKioskMode() {
    document.documentElement.classList.toggle("p5em-kiosk", Boolean(config.kiosk));
  }

  function applyCursorMode() {
    document.documentElement.classList.toggle("p5em-hide-cursor", Boolean(config.hideCursor && config.hideCursorMode === "always"));
    state.cursorHidden = Boolean(config.hideCursor && config.hideCursorMode === "always");
    syncPlaylistFrameRuntime();
  }

  function setOption(key, value) {
    config[key] = value;
    if (key === "disableTouchGestures") updateInputLockClasses();
    if (key === "disableContextMenu") syncPlaylistFrameRuntime();
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
    if ("titleOverlaySize" in next) config.titleOverlaySize = normalizeTitleOverlaySize(next.titleOverlaySize);
    if ("titleOverlayBold" in next) config.titleOverlayBold = Boolean(next.titleOverlayBold);
    if ("titleOverlayItalic" in next) config.titleOverlayItalic = Boolean(next.titleOverlayItalic);
    if ("freeText" in next) config.freeText = String(next.freeText || "");
    if ("showFreeText" in next) config.showFreeText = Boolean(next.showFreeText);
    if ("freeTextPosition" in next) config.freeTextPosition = normalizeOverlayPosition(next.freeTextPosition);
    if ("freeTextSize" in next) config.freeTextSize = clamp(Number(next.freeTextSize) || DEFAULTS.freeTextSize, 8, 48);
    if ("showHashOverlay" in next) config.showHashOverlay = Boolean(next.showHashOverlay);
    if ("hashOverlayPosition" in next) config.hashOverlayPosition = normalizeHashOverlayPosition(next.hashOverlayPosition);
    if ("hashOverlaySafeArea" in next) config.hashOverlaySafeArea = normalizeHashOverlaySafeArea(next.hashOverlaySafeArea);
    if ("hashOverlaySize" in next) config.hashOverlaySize = normalizeHashOverlaySize(next.hashOverlaySize);
    if ("hashOverlayColor" in next) config.hashOverlayColor = normalizeHashOverlayColor(next.hashOverlayColor);
    if ("overlayLayout" in next) config.overlayLayout = normalizeOverlayLayout(next.overlayLayout);
    if ("cardQrPlacement" in next) config.cardQrPlacement = normalizeCardQrPlacement(next.cardQrPlacement);
    if ("overlaySafeArea" in next) config.overlaySafeArea = normalizeOverlaySafeArea(next.overlaySafeArea);
    applyTitleOverlay();
    applyFreeTextOverlay();
    applyHashOverlay();
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
    applyFreeTextOverlay();
    applyHashOverlay();
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
      scheduleOverlayStacking();
      return;
    }
    if (!overlay) {
      overlay = document.createElement("div");
      overlay.id = "p5em-title-overlay";
      ensureOverlayLayer().appendChild(overlay);
    }
    const metadata = currentOverlayMetadata();
    const parts = formatTitleOverlayParts(metadata);
    overlay.innerHTML = `<span class="p5em-title-name"></span><span class="p5em-title-meta"></span>`;
    overlay.querySelector(".p5em-title-name").textContent = parts.title;
    overlay.querySelector(".p5em-title-meta").textContent = parts.meta ? ` by ${parts.meta}` : "";
    overlay.dataset.position = normalizeOverlayPosition(config.titleOverlayPosition);
    overlay.dataset.color = normalizeTitleColor(config.titleOverlayColor);
    overlay.dataset.font = normalizeTitleFont(config.titleOverlayFont);
    overlay.dataset.bold = config.titleOverlayBold ? "true" : "false";
    overlay.dataset.italic = config.titleOverlayItalic ? "true" : "false";
    overlay.style.fontSize = `${normalizeTitleOverlaySize(config.titleOverlaySize)}px`;
    scheduleOverlayStacking();
  }

  function applyFreeTextOverlay() {
    let overlay = document.getElementById("p5em-free-text-overlay");
    const metadata = currentOverlayMetadata();
    if (!config.showFreeText || !metadata.freeText || normalizeOverlayLayout(config.overlayLayout) === "card") {
      overlay?.remove();
      scheduleOverlayStacking();
      return;
    }
    if (!overlay) {
      overlay = document.createElement("div");
      overlay.id = "p5em-free-text-overlay";
      ensureOverlayLayer().appendChild(overlay);
    }
    overlay.textContent = metadata.freeText;
    overlay.dataset.position = normalizeOverlayPosition(config.freeTextPosition);
    overlay.dataset.color = normalizeTitleColor(config.titleOverlayColor);
    overlay.dataset.font = normalizeTitleFont(config.titleOverlayFont);
    overlay.dataset.bold = config.titleOverlayBold ? "true" : "false";
    overlay.style.fontSize = `${clamp(Number(config.freeTextSize) || DEFAULTS.freeTextSize, 8, 48)}px`;
    scheduleOverlayStacking();
  }

  function applyHashOverlay() {
    let overlay = document.getElementById("p5em-hash-overlay");
    const hash = currentDisplayHash();
    if (!config.showHashOverlay || !hash) {
      overlay?.remove();
      return;
    }
    if (!overlay) {
      overlay = document.createElement("div");
      overlay.id = "p5em-hash-overlay";
      ensureOverlayLayer().appendChild(overlay);
    }
    overlay.textContent = hash;
    overlay.dataset.position = normalizeHashOverlayPosition(config.hashOverlayPosition);
    overlay.dataset.color = normalizeHashOverlayColor(config.hashOverlayColor);
    overlay.style.fontSize = `${normalizeHashOverlaySize(config.hashOverlaySize)}px`;
    overlay.style.setProperty("--p5em-hash-safe-area", `${normalizeHashOverlaySafeArea(config.hashOverlaySafeArea)}px`);
  }

  function applyQrOverlay() {
    let overlay = document.getElementById("p5em-qr-overlay");
    if (!config.showQr || !config.qrLink || normalizeOverlayLayout(config.overlayLayout) === "card") {
      overlay?.remove();
      scheduleOverlayStacking();
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
    overlay.style.width = `${size}px`;
    overlay.style.height = `${size}px`;
    overlay.querySelector("img").src = buildQrUrl(config.qrLink, size, config.qrProvider);
    scheduleOverlayStacking();
  }

  function scheduleOverlayStacking() {
    if (state.overlayStackFrame) cancelAnimationFrame(state.overlayStackFrame);
    state.overlayStackFrame = requestAnimationFrame(() => {
      state.overlayStackFrame = null;
      applyOverlayStacking();
    });
  }

  function applyOverlayStacking() {
    const entries = [
      { key: "title", el: document.getElementById("p5em-title-overlay") },
      { key: "free", el: document.getElementById("p5em-free-text-overlay") },
      { key: "qr", el: document.getElementById("p5em-qr-overlay") }
    ].filter(({ el }) => el && el.isConnected);

    entries.forEach(({ el }) => {
      el.style.setProperty("--p5em-stack-offset", "0px");
    });

    const groups = new Map();
    entries.forEach((entry) => {
      const position = normalizeOverlayPosition(entry.el.dataset.position);
      if (!groups.has(position)) groups.set(position, []);
      groups.get(position).push(entry);
    });

    groups.forEach((group, position) => {
      const order = position.startsWith("bottom")
        ? ["qr", "free", "title"]
        : ["title", "free", "qr"];
      let offset = 0;
      order.forEach((key) => {
        const entry = group.find((item) => item.key === key);
        if (!entry) return;
        entry.el.style.setProperty("--p5em-stack-offset", `${offset}px`);
        const rect = entry.el.getBoundingClientRect();
        offset += Math.max(0, position.startsWith("bottom") ? rect.height : rect.height) + 14;
      });
    });
  }

  function applyOverlayCard() {
    let overlay = document.getElementById("p5em-card-overlay");
    const metadata = currentOverlayMetadata();
    const showTitle = Boolean(config.showTitleOverlay);
    const showFreeText = Boolean(config.showFreeText && metadata.freeText);
    const showQr = Boolean(config.showQr && config.qrLink);
    if (normalizeOverlayLayout(config.overlayLayout) !== "card" || (!showTitle && !showFreeText && !showQr)) {
      overlay?.remove();
      return;
    }
    if (!overlay) {
      overlay = document.createElement(showQr ? "a" : "div");
      overlay.id = "p5em-card-overlay";
      overlay.innerHTML = `
        <div class="p5em-card-copy">
          <strong></strong>
          <p></p>
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
    overlay.dataset.italic = config.titleOverlayItalic ? "true" : "false";
    overlay.dataset.qrPlacement = normalizeCardQrPlacement(config.cardQrPlacement);
    overlay.style.fontSize = `${normalizeTitleOverlaySize(config.titleOverlaySize)}px`;
    const copy = overlay.querySelector(".p5em-card-copy");
    copy.hidden = !showTitle && !showFreeText;
    const title = overlay.querySelector("strong");
    title.hidden = !showTitle;
    title.textContent = metadata.title || "Artwork Title";
    const free = overlay.querySelector("p");
    free.hidden = !showFreeText;
    free.textContent = metadata.freeText || "";
    free.style.fontSize = `${clamp(Number(config.freeTextSize) || DEFAULTS.freeTextSize, 8, 48)}px`;
    overlay.querySelector("span").textContent = [metadata.artist || "Artist Name", metadata.year].filter(Boolean).join(" · ");
    const image = overlay.querySelector("img");
    image.hidden = !showQr;
    if (showQr) {
      const cardQrSize = clamp(size, 48, 180);
      image.style.width = `${cardQrSize}px`;
      image.style.height = `${cardQrSize}px`;
      image.src = buildQrUrl(config.qrLink, cardQrSize, config.qrProvider);
    } else {
      image.removeAttribute("src");
    }
  }

  function currentOverlayMetadata() {
    const item = activePlaylistItem();
    return {
      title: metadataValue(item?.title, config.title),
      artist: metadataValue(item?.artist, config.artist),
      year: metadataValue(item?.year, config.year),
      freeText: metadataValue(item?.freeText, config.freeText)
    };
  }

  function activePlaylistItem() {
    const items = playlistItems();
    if (!state.playlistEnabled || !items.length) return null;
    return items[((state.playlistIndex % items.length) + items.length) % items.length] || null;
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
    state.playlistFrame.tabIndex = -1;
    state.playlistFrame.setAttribute("allow", "autoplay; fullscreen");
    state.playlistFrame.setAttribute("referrerpolicy", "no-referrer-when-downgrade");
    state.playlistFrame.hidden = true;
    add(state.playlistFrame, "load", syncPlaylistFrameRuntime);
    add(state.playlistFrame, "focus", () => setTimeout(reclaimKeyboardFocus, 80));
    add(state.playlistFrame, "pointerdown", () => setTimeout(reclaimKeyboardFocus, 120), { passive: true });
    document.body.prepend(state.playlistFrame);
    syncPlaylistFrameRuntime();
    return state.playlistFrame;
  }

  function syncPlaylistFrameRuntime() {
    if (!state.playlistFrame) return;
    state.playlistFrame.style.cursor = config.hideCursor && state.cursorHidden ? "none" : "";
    try {
      const doc = state.playlistFrame.contentDocument;
      if (!doc?.documentElement) return;
      injectChildRuntimeStyle(doc);
      doc.documentElement.classList.toggle("p5em-child-hide-cursor", Boolean(config.hideCursor && state.cursorHidden));
      doc.documentElement.classList.toggle("p5em-child-lock-touch", Boolean(config.disableTouchGestures));
      if (!doc.__p5emRuntimeLocksInstalled) {
        doc.addEventListener("contextmenu", (event) => {
          if (config.disableContextMenu) event.preventDefault();
        }, { capture: true });
        doc.addEventListener("auxclick", (event) => {
          if (config.disableContextMenu && event.button === 2) event.preventDefault();
        }, { capture: true });
        doc.addEventListener("mousedown", (event) => {
          if (config.disableContextMenu && event.button === 2) event.preventDefault();
        }, { capture: true });
        ["gesturestart", "gesturechange", "gestureend"].forEach((type) => {
          doc.addEventListener(type, (event) => {
            if (config.disableTouchGestures) event.preventDefault();
          }, { passive: false });
        });
        doc.addEventListener("touchmove", (event) => {
          if (config.disableTouchGestures) event.preventDefault();
        }, { passive: false });
        doc.addEventListener("keydown", (event) => {
          if (event.key.toLowerCase() === "c" && event.shiftKey && state.captureRecorder?.state === "recording") {
            event.preventDefault();
            event.stopPropagation();
            stopCapture();
          }
          if (event.key.toLowerCase() === config.panelKey.toLowerCase() && event.shiftKey) {
            event.preventDefault();
            event.stopPropagation();
            togglePanel();
          }
        }, { capture: true });
        doc.__p5emRuntimeLocksInstalled = true;
      }
    } catch {
      // Cross-origin playlist URLs cannot be modified from the parent page.
    }
  }

  function tickPlaylist(now) {
    if (!state.playlistEnabled || !state.playlistFrame) return;
    const interval = playlistIntervalSeconds() * 1000;
    if (now - state.playlistLastChangeAt >= interval) nextPlaylistItem();
    const playlist = playlistConfig();
    if ((playlistHashes().length || playlist.randomHash) && now - state.playlistLastHashAt >= playlistHashIntervalSeconds() * 1000) {
      nextPlaylistHash();
    }
  }

  function playlistConfig() {
    if (Array.isArray(config.playlist)) return { ...DEFAULTS.playlist, enabled: true, items: normalizePlaylistItems(config.playlist), hashes: [] };
    const playlist = { ...DEFAULTS.playlist, ...(config.playlist || {}) };
    playlist.items = normalizePlaylistItems(playlist.items);
    playlist.hashes = normalizePlaylistHashes(playlist.hashes);
    playlist.itemOrder = normalizePlaylistOrder(playlist.itemOrder);
    playlist.hashOrder = normalizePlaylistOrder(playlist.hashOrder);
    playlist.customUrlParams = normalizeCustomUrlParams(config.customUrlParams);
    return playlist;
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

  function captureConfig() {
    return { ...DEFAULTS.capture, ...(config.capture || {}) };
  }

  function uiConfig() {
    return { ...DEFAULTS.ui, ...(config.ui || {}) };
  }

  function playlistItems() {
    return playlistConfig().items.filter(Boolean);
  }

  function playlistHashes() {
    return playlistConfig().hashes.filter(Boolean);
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
    const playlist = playlistConfig();
    const hash = options.hash ?? currentPlaylistHash(playlist);
    const url = buildPlaylistUrl(resolvePlaylistItem(items[state.playlistIndex]), playlist, hash);
    updateCurrentSource(url, playlist.hashParam || "hash", options.keepUrlTimer ? "hash interval" : "playlist");
    applyTitleOverlay();
    applyFreeTextOverlay();
    applyOverlayCard();
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
    const playlist = playlistConfig();
    const builtUrl = buildPlaylistUrl(resolvePlaylistItem(cleanUrl), playlist, currentPlaylistHash(playlist));
    updateCurrentSource(builtUrl, playlist.hashParam || "hash", "preview");
    applyTitleOverlay();
    applyFreeTextOverlay();
    applyOverlayCard();
    state.playlistFrame.src = builtUrl;
    state.playlistFrame.hidden = false;
    state.playlistLastHashAt = performance.now();
    document.documentElement.classList.add("p5em-playlist-active");
    updatePanel();
    return state.playlistFrame.src;
  }

  function resolvePlaylistItem(input) {
    if (typeof input === "string") return resolveLocalPathUrl(input);
    if (input && typeof input === "object" && input.url) return { ...input, url: resolveLocalPathUrl(input.url) };
    return input;
  }

  function resolveLocalPathUrl(value) {
    const url = String(value || "").trim();
    const localConfig = { ...DEFAULTS.localFiles, ...(config.localFiles || {}) };
    if (isLikelyRemoteUrl(url) && localConfig.urlMirrorRoot) {
      const mirrored = remoteUrlToLocalMirrorPath(url, localConfig.urlMirrorRoot);
      if (mirrored) return absolutePathToHelperUrl(mirrored, localConfig.absolutePrefix);
    }
    if (!isAbsoluteLocalPath(url)) return url;
    return absolutePathToHelperUrl(url, localConfig.absolutePrefix);
  }

  function nextPlaylistItem() {
    const count = playlistItems().length;
    if (!count) return null;
    return loadPlaylistItem(nextOrderedIndex(state.playlistIndex, count, playlistConfig().itemOrder));
  }

  function previousPlaylistItem() {
    return loadPlaylistItem(state.playlistIndex - 1);
  }

  function nextPlaylistHash() {
    const hashes = playlistHashes();
    if (hashes.length) {
      state.playlistHashIndex = nextOrderedIndex(state.playlistHashIndex, hashes.length, playlistConfig().hashOrder);
    }
    return loadPlaylistItem(state.playlistIndex, { keepUrlTimer: true });
  }

  function currentPlaylistHash(playlist = playlistConfig()) {
    if (playlist.randomHash) return randomHashValue();
    const hashes = normalizePlaylistHashes(playlist.hashes);
    if (hashes.length) {
      state.playlistHashIndex = ((state.playlistHashIndex % hashes.length) + hashes.length) % hashes.length;
      return hashes[state.playlistHashIndex];
    }
    return "";
  }

  function updateCurrentSource(url, hashParam = "hash", reason = "source") {
    state.currentSource = url || "";
    state.currentHash = readUrlHash(safeUrl(url), hashParam);
    logHashChange(reason);
    recordHashSample(reason);
    applyHashOverlay();
  }

  function currentDisplayHash() {
    return String(state.currentHash || window.__p5emCurrentHash || document.documentElement.dataset.p5emHash || "").trim()
      || String(window.tokenData?.hash || window.fxhash || "").trim();
  }

  function logHashChange(reason = "source") {
    if (!state.currentHash || state.currentHash === state.lastLoggedHash) return;
    state.lastLoggedHash = state.currentHash;
    log("info", `Hash ${reason}: ${state.currentHash}`, {
      hash: state.currentHash,
      source: state.currentSource,
      playlistIndex: state.playlistIndex,
      reason
    });
    applyHashOverlay();
  }

  function togglePlaylist(force) {
    state.playlistEnabled = typeof force === "boolean" ? force : !state.playlistEnabled;
    config.playlist = { ...playlistConfig(), enabled: state.playlistEnabled };
    if (state.playlistFrame) state.playlistFrame.hidden = !state.playlistEnabled;
    document.documentElement.classList.toggle("p5em-playlist-active", Boolean(state.playlistEnabled));
    if (state.playlistEnabled) loadPlaylistItem(state.playlistIndex);
    else {
      applyTitleOverlay();
      applyFreeTextOverlay();
      applyOverlayCard();
    }
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
    updateSpecificHashSectionState(state.panel, Boolean(value));
    return api;
  }

  function setCustomUrlParams(params) {
    config.customUrlParams = normalizeCustomUrlParams(params);
    if (state.playlistEnabled) loadPlaylistItem(state.playlistIndex, { keepUrlTimer: true });
    persistConfig();
    updatePanel();
    syncCustomUrlParamRows(state.panel, config.customUrlParams, { force: true });
    return api;
  }

  function setPlaylistOptions(next = {}) {
    const playlist = { ...playlistConfig(), ...next };
    if ("items" in next) playlist.items = normalizePlaylistItems(next.items);
    if ("hashes" in next) playlist.hashes = normalizePlaylistHashes(next.hashes);
    if ("itemOrder" in next) playlist.itemOrder = normalizePlaylistOrder(next.itemOrder);
    if ("hashOrder" in next) playlist.hashOrder = normalizePlaylistOrder(next.hashOrder);
    config.playlist = playlist;
    if (state.playlistFrame) state.playlistFrame.hidden = !Boolean(playlist.enabled);
    state.playlistEnabled = Boolean(playlist.enabled && playlistItems().length);
    if (state.playlistEnabled) loadPlaylistItem(playlist.startIndex ?? state.playlistIndex);
    persistConfig();
    updatePanel();
    syncPlaylistRows(state.panel, playlist.items, { force: true });
    syncPlaylistHashRows(state.panel, playlist.hashes, { force: true });
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

  function setPlaylistItemMetadata(index, metadata = {}) {
    const playlist = playlistConfig();
    const items = normalizePlaylistItems(playlist.items);
    if (!items.length) return api;
    const safeIndex = clamp(Number(index) || 0, 0, items.length - 1);
    const current = typeof items[safeIndex] === "string" ? { url: items[safeIndex] } : { ...items[safeIndex] };
    const next = {
      ...current,
      title: String(metadata.title || "").trim(),
      artist: String(metadata.artist || "").trim(),
      year: String(metadata.year || "").trim(),
      freeText: String(metadata.freeText || "")
    };
    Object.keys(next).forEach((key) => {
      if (key !== "url" && (next[key] === "" || next[key] === undefined || next[key] === null)) delete next[key];
    });
    const hasSpecialFields = Object.keys(next).some((key) => !["url", "title", "artist", "year", "freeText"].includes(key));
    items[safeIndex] = hasPlaylistItemMetadata(next) || hasSpecialFields ? next : next.url;
    config.playlist = { ...playlist, items };
    if (safeIndex === state.playlistIndex) {
      applyTitleOverlay();
      applyFreeTextOverlay();
      applyOverlayCard();
    }
    persistConfig();
    updatePanel();
    return api;
  }

  function setPlaylistHashes(hashes) {
    const normalized = normalizePlaylistHashes(hashes);
    config.playlist = { ...playlistConfig(), hashes: normalized };
    state.playlistHashIndex = 0;
    if (state.playlistEnabled) loadPlaylistItem(state.playlistIndex, { keepUrlTimer: true });
    updatePanel();
    syncPlaylistHashRows(state.panel, normalized, { force: true });
    persistConfig();
    return api;
  }

  function restoreDefaultPlaylist() {
    const savedDefaults = readDefaultPlaylist(config.storageKey);
    const codeDefaults = Array.isArray(baseConfig.playlist)
      ? { ...DEFAULTS.playlist, enabled: true, items: baseConfig.playlist }
      : { ...DEFAULTS.playlist, ...(baseConfig.playlist || {}) };
    const defaults = savedDefaults || codeDefaults;
    config.playlist = { ...defaults, items: normalizePlaylistItems(defaults.items || []), hashes: normalizePlaylistHashes(defaults.hashes || []) };
    state.playlistIndex = Math.max(0, Number(config.playlist.startIndex) || 0);
    state.playlistHashIndex = Math.max(0, Number(config.playlist.startHashIndex) || 0);
    state.playlistEnabled = Boolean(config.playlist.enabled && config.playlist.items.length);
    if (config.playlist.items.length && !state.playlistFrame) ensurePlaylistFrame();
    if (state.playlistFrame) state.playlistFrame.hidden = !state.playlistEnabled;
    if (state.playlistEnabled) loadPlaylistItem(state.playlistIndex);
    syncPlaylistRows(state.panel, config.playlist.items, { force: true });
    syncPlaylistHashRows(state.panel, config.playlist.hashes, { force: true });
    persistConfig();
    log("info", savedDefaults ? "Restored saved playlist defaults" : "Restored code playlist defaults");
    updatePanel();
    return api;
  }

  function saveDefaultPlaylist() {
    syncConfigFromPanel();
    const playlist = playlistConfig();
    writeDefaultPlaylist(config.storageKey, playlist);
    persistConfig();
    log("info", `Saved ${playlist.items.length} playlist entries as defaults`);
    updatePanel();
    return api;
  }

  async function loadLocalFolderPlaylist(rootPath = "") {
    const localConfig = { ...DEFAULTS.localFiles, ...(config.localFiles || {}) };
    const endpoint = new URL(localConfig.endpoint || DEFAULTS.localFiles.endpoint, window.location.href);
    const listRoot = String(rootPath || localConfig.urlMirrorRoot || "").trim();
    if (listRoot) endpoint.searchParams.set("root", listRoot);

    let data;
    try {
      const response = await fetch(endpoint);
      if (!response.ok) throw new Error(`${response.status} ${response.statusText}`.trim());
      data = await response.json();
    } catch (error) {
      log("warn", `Served playlist unavailable: ${error?.message || error}`);
      updatePanel();
      return api;
    }

    const items = Array.from(data.files || [])
      .filter((file) => String(file.name || "").toLowerCase() === "index.html")
      .map((file) => file.absolutePath || file.path)
      .filter(Boolean);
    if (!items.length) {
      log("warn", `No index.html files found in served root ${data.root || listRoot || "."}`);
      updatePanel();
      return api;
    }

    config.playlist = { ...playlistConfig(), enabled: true, items };
    state.playlistEnabled = true;
    state.playlistIndex = 0;
    if (!state.playlistFrame) ensurePlaylistFrame();
    loadPlaylistItem(0);
    syncPlaylistRows(state.panel, items, { force: true });
    syncPlaylistHashRows(state.panel, playlistHashes(), { force: true });
    persistConfig();
    log("info", `Loaded ${items.length} served playlist entries from ${data.root || listRoot || "."}`);
    updatePanel();
    return api;
  }

  async function loadServedPlaylist(rootPath = "") {
    return loadLocalFolderPlaylist(rootPath);
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
    applyFreeTextOverlay();
    applyHashOverlay();
    applyQrOverlay();
    applyOverlayCard();
    updateInputLockClasses();
    state.playlistEnabled = Boolean(playlistConfig().enabled && playlistItems().length);
    if (playlistItems().length && !state.playlistFrame) ensurePlaylistFrame();
    if (state.playlistFrame) state.playlistFrame.hidden = !state.playlistEnabled;
    if (state.playlistEnabled) loadPlaylistItem(playlistConfig().startIndex ?? state.playlistIndex);
    applyPanelUiState();
    persistConfig();
    syncPlaylistRows(state.panel, playlistItems(), { force: true });
    syncPlaylistHashRows(state.panel, playlistHashes(), { force: true });
    updatePanel();
    return api;
  }

  function exportConfig() {
    syncConfigFromPanel();
    const snapshot = getConfig();
    persistConfig();
    downloadJson(snapshot, `${safeName(config.title || "p5-exhibition-mode")}-runtime-config.json`);
    return snapshot;
  }

  function syncConfigFromPanel() {
    if (!state.panel) return;
    const activeTab = state.panel.querySelector("[data-tab].is-active")?.dataset?.tab;
    const panelBounds = getPanelBounds(state.panel);
    config.title = state.panel.querySelector("[data-input='artwork-title']")?.value ?? config.title;
    config.artist = state.panel.querySelector("[data-input='artwork-artist']")?.value ?? config.artist;
    config.year = state.panel.querySelector("[data-input='artwork-year']")?.value ?? config.year;
    config.freeText = state.panel.querySelector("[data-input='free-text']")?.value ?? config.freeText;
    config.qrLink = state.panel.querySelector("[data-input='qr-link']")?.value ?? config.qrLink;
    config.showTitleOverlay = Boolean(state.panel.querySelector("[data-toggle='title-overlay']")?.checked);
    config.showFreeText = Boolean(state.panel.querySelector("[data-toggle='free-text-overlay']")?.checked);
    config.showHashOverlay = Boolean(state.panel.querySelector("[data-toggle='hash-overlay']")?.checked);
    config.showQr = Boolean(state.panel.querySelector("[data-toggle='qr-overlay']")?.checked);
    config.titleOverlayBold = Boolean(state.panel.querySelector("[data-toggle='title-bold']")?.checked);
    config.titleOverlayItalic = Boolean(state.panel.querySelector("[data-toggle='title-italic']")?.checked);
    config.titleOverlaySize = normalizeTitleOverlaySize(state.panel.querySelector("[data-input='title-size']")?.value ?? config.titleOverlaySize);
    config.freeTextSize = clamp(Number(state.panel.querySelector("[data-input='free-text-size']")?.value ?? config.freeTextSize) || DEFAULTS.freeTextSize, 8, 48);
    config.hashOverlaySize = normalizeHashOverlaySize(state.panel.querySelector("[data-input='hash-overlay-size']")?.value ?? config.hashOverlaySize);
    config.hashOverlaySafeArea = normalizeHashOverlaySafeArea(state.panel.querySelector("[data-input='hash-overlay-safe-area']")?.value ?? config.hashOverlaySafeArea);
    config.hashOverlayColor = normalizeHashOverlayColor(state.panel.querySelector("[data-input='hash-overlay-color']")?.value ?? config.hashOverlayColor);
    config.qrSize = clamp(Number(state.panel.querySelector("[data-input='qr-size']")?.value ?? config.qrSize) || DEFAULTS.qrSize, 48, 320);
    config.overlaySafeArea = normalizeOverlaySafeArea(state.panel.querySelector("[data-input='overlay-safe-area']")?.value ?? config.overlaySafeArea);
    config.overlayLayout = normalizeOverlayLayout(state.panel.querySelector("[data-input='overlay-layout']")?.value ?? config.overlayLayout);
    config.cardQrPlacement = normalizeCardQrPlacement(state.panel.querySelector("[data-input='card-qr-placement']")?.value ?? config.cardQrPlacement);
    config.titleOverlayFont = normalizeTitleFont(state.panel.querySelector("[data-input='title-font']")?.value ?? config.titleOverlayFont);
    config.titleOverlayColor = normalizeTitleColor(state.panel.querySelector("[data-input='title-color']")?.value ?? config.titleOverlayColor);
    config.titleOverlayPosition = normalizeOverlayPosition(state.panel.querySelector("[data-input='title-position']")?.value ?? config.titleOverlayPosition);
    config.freeTextPosition = normalizeOverlayPosition(state.panel.querySelector("[data-input='free-text-position']")?.value ?? config.freeTextPosition);
    config.hashOverlayPosition = normalizeHashOverlayPosition(state.panel.querySelector("[data-input='hash-overlay-position']")?.value ?? config.hashOverlayPosition);
    config.qrPosition = normalizeOverlayPosition(state.panel.querySelector("[data-input='qr-position']")?.value ?? config.qrPosition);
    config.rotation = normalizeRotation(state.panel.querySelector("[data-input='rotation']")?.value ?? config.rotation);
    config.disableContextMenu = Boolean(state.panel.querySelector("[data-toggle='context']")?.checked);
    config.disableTouchGestures = Boolean(state.panel.querySelector("[data-toggle='touch']")?.checked);
    config.hideCursor = Boolean(state.panel.querySelector("[data-toggle='cursor']")?.checked);
    config.accessibility = {
      ...accessibilityConfig(),
      reducedMotion: Boolean(state.panel.querySelector("[data-toggle='reduced-motion']")?.checked),
      highContrast: Boolean(state.panel.querySelector("[data-toggle='high-contrast']")?.checked)
    };
    config.ui = {
      ...uiConfig(),
      ...(activeTab ? { activeTab } : {}),
      ...(panelBounds ? { panelBounds } : {})
    };
    config.customUrlParams = collectCustomUrlParamRows(state.panel);
    config.playlist = {
      ...playlistConfig(),
      enabled: Boolean(state.panel.querySelector("[data-toggle='playlist']")?.checked),
      randomHash: Boolean(state.panel.querySelector("[data-toggle='playlist-hash']")?.checked),
      itemOrder: normalizePlaylistOrder(state.panel.querySelector("[data-input='playlist-item-order']")?.value),
      hashOrder: normalizePlaylistOrder(state.panel.querySelector("[data-input='playlist-hash-order']")?.value),
      intervalValue: Number(state.panel.querySelector("[data-input='playlist-interval']")?.value) || playlistConfig().intervalValue,
      intervalUnit: normalizeIntervalUnit(state.panel.querySelector("[data-input='playlist-interval-unit']")?.value || playlistConfig().intervalUnit),
      hashIntervalValue: Number(state.panel.querySelector("[data-input='playlist-hash-interval']")?.value) || playlistConfig().hashIntervalValue,
      hashIntervalUnit: normalizeIntervalUnit(state.panel.querySelector("[data-input='playlist-hash-interval-unit']")?.value || playlistConfig().hashIntervalUnit),
      items: collectPlaylistRows(state.panel),
      hashes: collectPlaylistHashRows(state.panel)
    };
    config.playlist.intervalSeconds = intervalToSeconds(config.playlist.intervalValue, config.playlist.intervalUnit);
    config.playlist.hashIntervalSeconds = intervalToSeconds(config.playlist.hashIntervalValue, config.playlist.hashIntervalUnit);
    config.capture = {
      ...captureConfig(),
      ...collectCaptureOptions(state.panel)
    };
  }

  function applyPanelUiState() {
    if (!state.panel) return;
    const ui = uiConfig();
    if (ui.activeTab) activatePanelTab(state.panel, ui.activeTab);
    applyPanelBounds(state.panel, ui.panelBounds);
  }

  function setCaptureOptions(next = {}) {
    config.capture = {
      ...captureConfig(),
      ...next,
      source: normalizeCaptureSource(next.source ?? captureConfig().source),
      videoBitsPerSecond: Number(next.videoBitsPerSecond ?? captureConfig().videoBitsPerSecond) || DEFAULTS.capture.videoBitsPerSecond,
      frameRate: Number(next.frameRate ?? captureConfig().frameRate) || DEFAULTS.capture.frameRate
    };
    persistConfig();
    updatePanel();
    return api;
  }

  async function startCapture(next = {}) {
    if (state.captureRecorder?.state === "recording") return api;
    setCaptureOptions(next);
    const capture = captureConfig();
    if (typeof MediaRecorder === "undefined") {
      state.captureStatus = "Video recording is not supported in this browser";
      log("error", state.captureStatus);
      updatePanel();
      return api;
    }
    const mimeType = resolveCaptureMimeType(capture.codec);
    if (!mimeType && capture.codec && !["auto", "default"].includes(capture.codec)) {
      log("warn", `Requested capture codec is not supported by this browser: ${capture.codec}`);
    }
    try {
      state.captureWasPanelOpen = state.panelOpen;
      if (capture.hidePanelDuringCapture) togglePanel(false);
      document.documentElement.classList.add("p5em-capturing", "p5em-hide-cursor");
      state.cursorHidden = true;
      updatePanel();
      const stream = await createCaptureStream(capture);
      const options = {
        videoBitsPerSecond: Number(capture.videoBitsPerSecond) || DEFAULTS.capture.videoBitsPerSecond
      };
      if (mimeType) options.mimeType = mimeType;
      const recorder = createMediaRecorder(stream, options);
      state.captureRecorder = recorder;
      state.captureStream = stream;
      state.captureChunks = [];
      state.captureStartedAt = performance.now();
      state.captureMimeType = recorder.mimeType || mimeType || "";
      state.captureStatus = "Recording";
      updateRecordingIndicator(true);
      recorder.addEventListener("dataavailable", (event) => {
        if (event.data?.size) state.captureChunks.push(event.data);
      });
      recorder.addEventListener("stop", finishCapture);
      stream.getTracks().forEach((track) => {
        track.addEventListener("ended", () => {
          if (state.captureRecorder?.state === "recording") stopCapture();
        }, { once: true });
      });
      recorder.start(1000);
      log("info", `Capture started: ${state.captureMode || "unknown"} / ${state.captureMimeType || "browser default"}`);
    } catch (error) {
      const message = error?.message || String(error);
      state.captureStatus = `Capture unavailable: ${shortenMiddle(message, 96)}`;
      state.captureRecorder = null;
      state.captureStream = null;
      stopCanvasCompositor();
      state.captureStartedAt = 0;
      state.captureMode = "";
      updateRecordingIndicator(false);
      document.documentElement.classList.remove("p5em-capturing", "p5em-hide-cursor");
      if (!config.hideCursor) showCursor();
      log("warn", state.captureStatus, { message });
    }
    updatePanel();
    return api;
  }

  function stopCapture() {
    if (!state.captureRecorder || state.captureRecorder.state === "inactive") return api;
    state.captureStatus = "Stopping";
    updateRecordingIndicator(true, "Stopping");
    if (state.captureRecorder.state === "recording") state.captureRecorder.requestData?.();
    state.captureRecorder.stop();
    updatePanel();
    return api;
  }

  function updateRecordingIndicator(visible, label = "Recording") {
    let indicator = document.getElementById("p5em-recording-indicator");
    if (!visible) {
      indicator?.remove();
      return;
    }
    if (!indicator) {
      indicator = document.createElement("button");
      indicator.type = "button";
      indicator.id = "p5em-recording-indicator";
      indicator.addEventListener("click", () => stopCapture());
      document.body.appendChild(indicator);
    }
    indicator.textContent = label === "Stopping" ? "Stopping..." : "Recording - Stop";
  }

  async function finishCapture() {
    const mimeType = state.captureMimeType || state.captureChunks[0]?.type || "video/webm";
    const blob = new Blob(state.captureChunks, { type: mimeType });
    const filename = captureFilename(captureConfig().filename, mimeType);
    if (blob.size > 0) {
      await saveCaptureBlob(blob, filename);
      log("info", `Capture saved: ${filename}`, { mimeType, bytes: blob.size });
      state.captureStatus = `Saved ${filename}`;
    } else {
      log("error", "Capture stopped without video data", { mimeType });
      state.captureStatus = "No video data captured";
    }
    state.captureStream?.getTracks().forEach((track) => track.stop());
    state.captureRecorder = null;
    state.captureStream = null;
    stopCanvasCompositor();
    state.captureChunks = [];
    state.captureStartedAt = 0;
    state.captureMode = "";
    state.captureLastGoodFrame = null;
    state.captureDrawErrorLogged = false;
    updateRecordingIndicator(false);
    document.documentElement.classList.remove("p5em-capturing", "p5em-hide-cursor");
    if (!config.hideCursor) showCursor();
    updatePanel();
  }

  async function createCaptureStream(capture) {
    const canvas = findArtworkCanvas();
    if (canvas) {
      state.captureStatus = "Recording artwork canvas";
      state.captureMode = "canvas";
      log("info", "Using direct canvas capture");
      try {
        return await createCanvasCompositorStream(canvas, capture);
      } catch (error) {
        log("warn", "Canvas compositor failed; retrying direct artwork canvas stream", { message: error?.message || String(error) });
        return createDirectCanvasStream(canvas, capture);
      }
    }
    throw new Error(captureCanvasUnavailableMessage());
  }

  function captureCanvasUnavailableMessage() {
    if (!state.playlistEnabled) return "No capturable artwork canvas was found.";
    if (isCurrentSourceSameOrigin()) {
      return "Playlist page is same-origin, but no visible canvas was found inside it. Wait for the artwork to finish loading, then try again.";
    }
    return "Remote playlist artworks cannot be direct-captured from the parent page. Browser security blocks reading cross-origin iframe pixels. Open the artwork as the top-level page with Exhibition Mode installed, or serve the artwork locally through the helper.";
  }

  function isCurrentSourceSameOrigin() {
    const url = safeUrl(state.playlistFrame?.src || state.currentSource);
    return Boolean(url && url.origin === window.location.origin);
  }

  function openCurrentSource() {
    const url = state.currentSource || state.playlistFrame?.src;
    if (!url) return api;
    window.open(url, "_blank", "noopener,noreferrer");
    return api;
  }

  async function createCanvasCompositorStream(sourceCanvas, capture) {
    const dpr = Math.min(window.devicePixelRatio || 1, config.maxPixelRatio || 2);
    const width = Math.max(2, Math.round(window.innerWidth * dpr));
    const height = Math.max(2, Math.round(window.innerHeight * dpr));
    const canvas = document.createElement("canvas");
    canvas.id = "p5em-capture-canvas";
    canvas.width = width;
    canvas.height = height;
    state.captureCanvas = canvas;
    state.captureLastGoodFrame = document.createElement("canvas");
    state.captureLastGoodFrame.width = width;
    state.captureLastGoodFrame.height = height;
    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) throw new Error("Could not create a 2D capture compositor.");
    const frameRate = Number(capture.frameRate) || DEFAULTS.capture.frameRate;
    if (typeof canvas.captureStream !== "function") throw new Error("Canvas captureStream() is not supported in this browser.");
    let stream = canvas.captureStream(0);
    let track = stream.getVideoTracks()[0] || null;
    if (typeof track?.requestFrame !== "function") {
      stream.getTracks().forEach((item) => item.stop());
      stream = canvas.captureStream(frameRate);
      track = stream.getVideoTracks()[0] || null;
    }
    state.captureTrack = track;
    let activeSourceCanvas = sourceCanvas;
    const draw = () => {
      const nextSourceCanvas = findArtworkCanvas();
      if (nextSourceCanvas && nextSourceCanvas !== activeSourceCanvas) {
        activeSourceCanvas = nextSourceCanvas;
        state.captureDrawErrorLogged = false;
        log("info", "Capture source canvas refreshed");
      }
      if (isCapturableCanvas(activeSourceCanvas)) {
        drawCaptureFrame(ctx, activeSourceCanvas, width, height, dpr);
      }
      state.captureTrack?.requestFrame?.();
      state.captureAnimationFrame = requestAnimationFrame(draw);
    };
    draw();
    log("info", `Canvas compositor running at ${frameRate} FPS target`);
    return stream;
  }

  function createDirectCanvasStream(sourceCanvas, capture) {
    const frameRate = Number(capture.frameRate) || DEFAULTS.capture.frameRate;
    if (typeof sourceCanvas.captureStream !== "function") {
      throw new Error("Artwork canvas captureStream() is not supported in this browser.");
    }
    state.captureMode = "canvas-direct";
    state.captureStatus = "Recording artwork canvas directly";
    return sourceCanvas.captureStream(frameRate);
  }

  function createMediaRecorder(stream, options) {
    try {
      return new MediaRecorder(stream, options);
    } catch (error) {
      if (options.mimeType) {
        log("warn", `MediaRecorder rejected ${options.mimeType}; retrying browser default`, { message: error?.message || String(error) });
        return new MediaRecorder(stream, { videoBitsPerSecond: options.videoBitsPerSecond });
      }
      throw error;
    }
  }

  function drawCaptureFrame(ctx, source, width, height, dpr) {
    const cssWidth = width / dpr;
    const cssHeight = height / dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, cssWidth, cssHeight);
    let sourceDrawn = false;
    withRotatedCaptureFrame(ctx, cssWidth, cssHeight, (frameWidth, frameHeight) => {
      sourceDrawn = drawCaptureSourceCanvas(ctx, source, frameWidth, frameHeight);
      if (sourceDrawn && isBlankCaptureFrame(ctx, width, height)) {
        sourceDrawn = false;
        restoreLastGoodCaptureFrame(ctx, width, height);
      }
      if (sourceDrawn) saveLastGoodCaptureFrame(ctx, width, height);
      drawCaptureOverlays(ctx, frameWidth, frameHeight);
    });
  }

  function drawCaptureSourceCanvas(ctx, sourceCanvas, frameWidth, frameHeight) {
    const layout = captureCanvasLayout(sourceCanvas, frameWidth, frameHeight);
    try {
      ctx.drawImage(sourceCanvas, layout.x, layout.y, layout.width, layout.height);
      return true;
    } catch (error) {
      if (!state.captureDrawErrorLogged) {
        state.captureDrawErrorLogged = true;
        log("warn", "Canvas frame could not be drawn into capture compositor", { message: error?.message || String(error) });
      }
      return false;
    }
  }

  function saveLastGoodCaptureFrame(ctx, width, height) {
    const frame = state.captureLastGoodFrame;
    const frameCtx = frame?.getContext("2d");
    if (!frame || !frameCtx) return;
    frame.width = width;
    frame.height = height;
    frameCtx.setTransform(1, 0, 0, 1, 0, 0);
    frameCtx.drawImage(ctx.canvas, 0, 0);
  }

  function restoreLastGoodCaptureFrame(ctx, cssWidth, cssHeight) {
    const frame = state.captureLastGoodFrame;
    if (!frame) return;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(frame, 0, 0, cssWidth, cssHeight);
    ctx.restore();
  }

  function isBlankCaptureFrame(ctx, cssWidth, cssHeight) {
    const points = [
      [0.12, 0.12], [0.25, 0.5], [0.5, 0.5], [0.75, 0.5], [0.88, 0.88]
    ];
    try {
      return points.every(([x, y]) => {
        const data = ctx.getImageData(Math.max(0, Math.floor(cssWidth * x)), Math.max(0, Math.floor(cssHeight * y)), 1, 1).data;
        return Math.max(data[0], data[1], data[2]) < 6;
      });
    } catch {
      return false;
    }
  }

  function captureCanvasLayout(sourceCanvas, frameWidth, frameHeight) {
    const sourceRect = sourceCanvas.getBoundingClientRect();
    const frame = sourceCanvas.ownerDocument?.defaultView?.frameElement;
    const frameRect = frame?.getBoundingClientRect?.();
    const x = (frameRect?.left || 0) + sourceRect.left;
    const y = (frameRect?.top || 0) + sourceRect.top;
    const width = sourceRect.width || frameWidth;
    const height = sourceRect.height || frameHeight;
    return {
      x: clamp(x, -frameWidth, frameWidth),
      y: clamp(y, -frameHeight, frameHeight),
      width: Math.max(1, width),
      height: Math.max(1, height)
    };
  }

  function withRotatedCaptureFrame(ctx, width, height, draw) {
    const rotation = normalizeRotation(config.rotation);
    const sideways = rotation === 90 || rotation === 270;
    const frameWidth = sideways ? height : width;
    const frameHeight = sideways ? width : height;
    ctx.save();
    ctx.translate(width / 2, height / 2);
    ctx.rotate((rotation * Math.PI) / 180);
    ctx.translate(-frameWidth / 2, -frameHeight / 2);
    draw(frameWidth, frameHeight);
    ctx.restore();
  }

  function drawCaptureOverlays(ctx, frameWidth, frameHeight) {
    const layout = normalizeOverlayLayout(config.overlayLayout);
    if (layout === "card") {
      drawCaptureCard(ctx, frameWidth, frameHeight);
      return;
    }
    drawCaptureStackedOverlays(ctx, frameWidth, frameHeight);
    if (config.showHashOverlay && currentDisplayHash()) drawCaptureHash(ctx, frameWidth, frameHeight);
  }

  function drawCaptureStackedOverlays(ctx, frameWidth, frameHeight) {
    const entries = [];
    if (config.showTitleOverlay) entries.push(measureCaptureTitle(ctx, frameWidth, frameHeight));
    if (config.showFreeText && config.freeText) {
      entries.push(measureCaptureText(ctx, config.freeText, {
        position: config.freeTextPosition,
        size: config.freeTextSize,
        bold: config.titleOverlayBold,
        maxWidth: Math.min(520, frameWidth * 0.42)
      }, frameWidth, frameHeight));
    }
    if (config.showQr) entries.push(measureCaptureQr(ctx, frameWidth, frameHeight, config.qrPosition));

    const groups = new Map();
    entries.filter(Boolean).forEach((entry) => {
      if (!groups.has(entry.position)) groups.set(entry.position, []);
      groups.get(entry.position).push(entry);
    });

    groups.forEach((group, position) => {
      const top = position.startsWith("top");
      const order = top ? ["title", "free", "qr"] : ["qr", "free", "title"];
      let offset = 0;
      order.forEach((key) => {
        const entry = group.find((item) => item.key === key);
        if (!entry) return;
        const [x, baseY] = capturePosition(position, entry.width, entry.height, frameWidth, frameHeight);
        const y = top ? baseY + offset : baseY - offset;
        entry.draw(x, y);
        offset += entry.height + 14;
      });
    });
  }

  function drawCaptureCard(ctx, frameWidth, frameHeight) {
    const showTitle = Boolean(config.showTitleOverlay);
    const showFreeText = Boolean(config.showFreeText && config.freeText);
    const showQr = Boolean(config.showQr);
    if (!showTitle && !showFreeText && !showQr) return;
    const titleSize = normalizeTitleOverlaySize(config.titleOverlaySize);
    const freeSize = clamp(Number(config.freeTextSize) || DEFAULTS.freeTextSize, 8, 48);
    const qrSize = showQr ? clamp(Number(config.qrSize) || DEFAULTS.qrSize, 40, 320) : 0;
    ctx.save();
    ctx.font = `${config.titleOverlayItalic ? "italic " : ""}${config.titleOverlayBold ? "700 " : ""}${titleSize}px ${captureFontFamily(config.titleOverlayFont)}`;
    const title = config.title || "Artwork Title";
    const meta = [config.artist || "Artist Name", config.year].filter(Boolean).join(" · ");
    const textWidth = Math.max(ctx.measureText(title).width, ctx.measureText(meta).width, showFreeText ? Math.min(420, frameWidth * 0.36) : 0);
    const placement = normalizeCardQrPlacement(config.cardQrPlacement);
    const horizontalQr = showQr && (placement === "left" || placement === "right");
    const cardWidth = Math.min(frameWidth - 36, Math.max(260, textWidth + 44 + (horizontalQr ? qrSize + 20 : 0)));
    const textHeight = (showTitle ? titleSize * 2.2 : 0) + (showFreeText ? freeSize * 3.2 : 0);
    const cardHeight = Math.min(frameHeight - 36, Math.max(120, textHeight + 44 + (!horizontalQr && showQr ? qrSize + 20 : 0)));
    const [x, y] = capturePosition(normalizeOverlayPosition(config.titleOverlayPosition), cardWidth, cardHeight, frameWidth, frameHeight);
    ctx.fillStyle = "rgba(0, 0, 0, 0.62)";
    ctx.strokeStyle = "rgba(255, 255, 255, 0.18)";
    ctx.lineWidth = 1;
    ctx.fillRect(x, y, cardWidth, cardHeight);
    ctx.strokeRect(x, y, cardWidth, cardHeight);
    const color = captureTextColor(config.titleOverlayColor);
    ctx.fillStyle = color;
    let textX = x + 22;
    let textY = y + 24;
    if (showQr && placement === "left") textX += qrSize + 20;
    if (showQr && placement === "above") textY += qrSize + 20;
    if (showTitle) {
      ctx.font = `${config.titleOverlayItalic ? "italic " : ""}${config.titleOverlayBold ? "700 " : ""}${titleSize}px ${captureFontFamily(config.titleOverlayFont)}`;
      ctx.fillText(title, textX, textY + titleSize);
      ctx.font = `${config.titleOverlayBold ? "700 " : ""}${Math.max(9, titleSize * 0.55)}px ${captureFontFamily(config.titleOverlayFont)}`;
      ctx.fillText(meta, textX, textY + titleSize * 2);
      textY += titleSize * 2.2;
    }
    if (showFreeText) {
      ctx.font = `${config.titleOverlayBold ? "700 " : ""}${freeSize}px ${captureFontFamily(config.titleOverlayFont)}`;
      drawWrappedCaptureText(ctx, config.freeText, textX, textY + freeSize, Math.min(cardWidth - 44, 420), freeSize * 1.35);
    }
    if (showQr) {
      let qrX = x + cardWidth - qrSize - 22;
      let qrY = y + cardHeight - qrSize - 22;
      if (placement === "left") qrX = x + 22;
      if (placement === "above") qrY = y + 22;
      if (placement === "below") {
        qrX = x + 22;
        qrY = y + cardHeight - qrSize - 22;
      }
      drawCaptureQr(ctx, frameWidth, frameHeight, config.titleOverlayPosition, qrX, qrY, qrSize);
    }
    ctx.restore();
  }

  function drawCaptureText(ctx, text, options, frameWidth, frameHeight) {
    const measured = measureCaptureText(ctx, text, options, frameWidth, frameHeight);
    if (!measured) return;
    const [x, y] = capturePosition(measured.position, measured.width, measured.height, frameWidth, frameHeight);
    measured.draw(x, y);
  }

  function measureCaptureText(ctx, text, options, frameWidth) {
    if (!text) return null;
    const size = clamp(Number(options.size) || DEFAULTS.titleOverlaySize, 8, 48);
    const position = normalizeOverlayPosition(options.position);
    const maxWidth = options.maxWidth || Math.min(frameWidth - 36, 720);
    ctx.save();
    ctx.font = `${options.bold ? "700 " : ""}${size}px ${captureFontFamily(config.titleOverlayFont)}`;
    ctx.fillStyle = captureTextColor(config.titleOverlayColor);
    const lines = wrapCaptureText(ctx, text, maxWidth);
    const width = Math.min(maxWidth, Math.max(...lines.map((line) => ctx.measureText(line).width), 1));
    const height = lines.length * size * 1.25;
    ctx.restore();
    return {
      key: "free",
      position,
      width,
      height,
      draw: (x, y) => {
        ctx.save();
        ctx.font = `${options.bold ? "700 " : ""}${size}px ${captureFontFamily(config.titleOverlayFont)}`;
        ctx.fillStyle = captureTextColor(config.titleOverlayColor);
        lines.forEach((line, index) => ctx.fillText(line, x, y + size + index * size * 1.25));
        ctx.restore();
      }
    };
  }

  function drawCaptureTitle(ctx, frameWidth, frameHeight) {
    const measured = measureCaptureTitle(ctx, frameWidth, frameHeight);
    if (!measured) return;
    const [x, y] = capturePosition(measured.position, measured.width, measured.height, frameWidth, frameHeight);
    measured.draw(x, y);
  }

  function measureCaptureTitle(ctx, frameWidth) {
    const titleSize = normalizeTitleOverlaySize(config.titleOverlaySize);
    const parts = formatTitleOverlayParts(config);
    ctx.save();
    const titleFont = `${config.titleOverlayItalic ? "italic " : ""}${config.titleOverlayBold ? "700 " : ""}${titleSize}px ${captureFontFamily(config.titleOverlayFont)}`;
    const metaFont = `${config.titleOverlayBold ? "700 " : ""}${titleSize}px ${captureFontFamily(config.titleOverlayFont)}`;
    ctx.font = titleFont;
    const titleWidth = ctx.measureText(parts.title).width;
    ctx.font = metaFont;
    const meta = parts.meta ? ` by ${parts.meta}` : "";
    const metaWidth = ctx.measureText(meta).width;
    const width = Math.min(frameWidth - 36, titleWidth + metaWidth);
    const height = titleSize * 1.35;
    ctx.restore();
    return {
      key: "title",
      position: normalizeOverlayPosition(config.titleOverlayPosition),
      width,
      height,
      draw: (x, y) => {
        ctx.save();
        ctx.fillStyle = captureTextColor(config.titleOverlayColor);
        ctx.font = titleFont;
        ctx.fillText(parts.title, x, y + titleSize);
        ctx.font = metaFont;
        ctx.fillText(meta, x + titleWidth, y + titleSize);
        ctx.restore();
      }
    };
  }

  function drawCaptureHash(ctx, frameWidth, frameHeight) {
    const hash = currentDisplayHash();
    if (!hash) return;
    const size = normalizeHashOverlaySize(config.hashOverlaySize);
    const safe = normalizeHashOverlaySafeArea(config.hashOverlaySafeArea);
    ctx.save();
    ctx.font = `500 ${size}px ${captureFontFamily("mono")}`;
    ctx.fillStyle = captureHashColor(config.hashOverlayColor);
    const width = Math.min(frameWidth - safe * 2, Math.max(1, ctx.measureText(hash).width));
    const height = size * 1.25;
    const [x, y] = captureHashPosition(normalizeHashOverlayPosition(config.hashOverlayPosition), width, height, frameWidth, frameHeight, safe);
    ctx.fillText(hash, x, y + size);
    ctx.restore();
  }

  function drawCaptureQr(ctx, frameWidth, frameHeight, position, fixedX, fixedY, fixedSize) {
    const measured = measureCaptureQr(ctx, frameWidth, frameHeight, position, fixedSize);
    if (!measured) return;
    const [x, y] = fixedX === undefined
      ? capturePosition(measured.position, measured.width, measured.height, frameWidth, frameHeight)
      : [fixedX, fixedY];
    measured.draw(x, y);
  }

  function measureCaptureQr(ctx, frameWidth, frameHeight, position, fixedSize) {
    const image = document.querySelector("#p5em-qr-overlay img, #p5em-card-overlay img");
    if (!image || image.hidden || !image.complete || !image.naturalWidth) return null;
    const size = fixedSize || clamp(Number(config.qrSize) || DEFAULTS.qrSize, 40, 320);
    return {
      key: "qr",
      position: normalizeOverlayPosition(position),
      width: Math.min(size, frameWidth),
      height: Math.min(size, frameHeight),
      draw: (x, y) => {
        try {
          ctx.drawImage(image, x, y, size, size);
        } catch {
          // Cross-origin QR providers can refuse canvas drawing. The on-screen QR remains visible.
        }
      }
    };
  }

  function stopCanvasCompositor() {
    if (state.captureAnimationFrame) cancelAnimationFrame(state.captureAnimationFrame);
    state.captureAnimationFrame = null;
    state.captureSourceStream?.getTracks().forEach((track) => track.stop());
    if (state.captureSourceVideo) {
      state.captureSourceVideo.srcObject = null;
      state.captureSourceVideo.remove();
    }
    state.captureSourceStream = null;
    state.captureSourceVideo = null;
    state.captureTrack = null;
    state.captureCanvas = null;
    state.captureLastGoodFrame = null;
  }

  async function chooseCaptureFolder() {
    if (!window.showDirectoryPicker) {
      state.captureStatus = "Folder picker unavailable; using browser downloads";
      log("warn", state.captureStatus);
      updatePanel();
      return api;
    }
    try {
      state.captureDirectoryHandle = await window.showDirectoryPicker({ mode: "readwrite" });
      state.captureDirectoryName = state.captureDirectoryHandle.name || "Selected folder";
      if (isUnsafeCaptureDirectoryName(state.captureDirectoryName)) {
        state.captureDirectoryHandle = null;
        state.captureDirectoryName = "";
        state.captureStatus = "Desktop folder rejected; using browser downloads";
        log("warn", "Desktop folder rejected for capture output. Choose a dedicated capture folder instead.");
        updatePanel();
        return api;
      }
      state.captureStatus = `Output folder: ${state.captureDirectoryName}`;
    } catch {
      state.captureStatus = "Folder selection cancelled";
    }
    updatePanel();
    return api;
  }

  async function saveCaptureBlob(blob, filename) {
    if (state.captureDirectoryHandle) {
      try {
        const fileHandle = await state.captureDirectoryHandle.getFileHandle(filename, { create: true });
        const writable = await fileHandle.createWritable();
        await writable.write(blob);
        await writable.close();
        return;
      } catch (error) {
        log("warn", "Folder save failed; falling back to browser download", { message: error?.message || String(error) });
      }
    }
    downloadBlob(blob, filename);
  }

  async function saveCaptureDataUrl(dataUrl, filename) {
    if (state.captureDirectoryHandle) {
      try {
        const response = await fetch(dataUrl);
        const blob = await response.blob();
        await saveCaptureBlob(blob, filename);
        return;
      } catch (error) {
        log("warn", "Still save failed; falling back to browser download", { message: error?.message || String(error) });
      }
    }
    downloadDataUrl(dataUrl, filename);
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
    patchConsoleLogging();
    add(window, "error", (event) => {
      const target = event.target;
      const source = target && target !== window
        ? target.currentSrc || target.src || target.href || target.tagName
        : event.filename;
      log("error", event.message || "Runtime error", { source, line: event.lineno, column: event.colno });
    }, { capture: true });
    add(window, "unhandledrejection", (event) => log("error", event.reason?.message || "Unhandled promise rejection"));
    add(document, "webglcontextlost", (event) => {
      log("error", "WebGL context lost");
      event.preventDefault();
    }, { capture: true });
  }

  function patchConsoleLogging() {
    if (state.consolePatched) return;
    ["log", "info", "warn", "error", "debug"].forEach((method) => {
      state.originalConsole[method] = console[method];
      console[method] = (...args) => {
        state.originalConsole[method]?.apply(console, args);
        const level = method === "error" ? "error" : method === "warn" ? "warn" : "info";
        log(level, `console.${method}: ${args.map(formatLogArg).join(" ")}`, { args });
      };
    });
    state.consolePatched = true;
  }

  function restoreConsoleLogging() {
    if (!state.consolePatched) return;
    Object.entries(state.originalConsole).forEach(([method, fn]) => {
      console[method] = fn;
    });
    state.consolePatched = false;
    state.originalConsole = {};
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

  function clearLogs() {
    state.logs = [];
    updatePanel();
    return api;
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
    setText("p5em-playlist-hash", d.playlistHashCount ? `${d.playlistHashIndex + 1} / ${d.playlistHashCount}` : d.playlistRandomHash ? "Random" : "Disabled");
    setText("p5em-current-hash", d.currentHash ? shortenMiddle(d.currentHash, 16) : "None");
    setText("p5em-current-hash-full", d.currentHash ? shortenMiddle(d.currentHash, 24) : "None");
    setText("p5em-current-source", shortenMiddle(d.currentSource || "None", 22), d.currentSource || "");
    setText("p5em-hash-recording", d.hashRecording ? "Active" : "Stopped");
    setText("p5em-hash-record-count", String(d.hashRecordCount));
    setText("p5em-uptime", formatDuration(d.uptimeSeconds));
    setText("p5em-memory", d.memoryMB === null ? "Unavailable" : `${d.memoryMB} MB`);
    setText("p5em-reloads", String(d.reloadCount));
    setText("p5em-capture-status", d.captureStatus || "Idle");
    setText("p5em-capture-duration", formatDuration(d.captureDurationSeconds || 0));
    setText("p5em-capture-codec", d.captureMimeType || "Browser default");
    setText("p5em-capture-source", d.captureMode || "auto");
    setText("p5em-capture-output", d.captureOutput || "Browser downloads");
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
    setInputValue("artwork-title", config.title);
    setInputValue("artwork-artist", config.artist);
    setInputValue("artwork-year", config.year);
    setInputValue("free-text", config.freeText);
    setInputValue("current-hash", d.currentHash);
    setInputValue("qr-link", d.qrLink);
    setInputValue("overlay-layout", d.overlayLayout);
    setInputValue("card-qr-placement", d.cardQrPlacement);
    setInputValue("title-size", d.titleOverlaySize);
    setInputValue("free-text-size", d.freeTextSize);
    setInputValue("hash-overlay-size", d.hashOverlaySize);
    setInputValue("hash-overlay-color", d.hashOverlayColor);
    setInputValue("overlay-safe-area", d.overlaySafeArea);
    setInputValue("hash-overlay-safe-area", d.hashOverlaySafeArea);
    setInputValue("qr-size", d.qrSize);
    setInputValue("title-font", d.titleOverlayFont);
    setInputValue("title-color", d.titleOverlayColor);
    setInputValue("title-position", d.titleOverlayPosition);
    setInputValue("free-text-position", d.freeTextPosition);
    setInputValue("hash-overlay-position", d.hashOverlayPosition);
    setInputValue("qr-position", d.qrPosition);
    syncCustomUrlParamRows(state.panel, d.customUrlParams);
    setChecked("title-bold", d.titleOverlayBold);
    setChecked("title-italic", d.titleOverlayItalic);
    setChecked("free-text-overlay", d.freeTextVisible);
    setChecked("hash-overlay", d.hashOverlayVisible);
    const interval = state.panel.querySelector("[data-input='playlist-interval']");
    if (interval && document.activeElement !== interval) interval.value = playlistConfig().intervalValue ?? intervalDisplayValue(d.playlistIntervalSeconds, playlistConfig().intervalUnit);
    const intervalUnit = state.panel.querySelector("[data-input='playlist-interval-unit']");
    if (intervalUnit && document.activeElement !== intervalUnit) intervalUnit.value = normalizeIntervalUnit(playlistConfig().intervalUnit);
    setInputValue("playlist-item-order", playlistConfig().itemOrder);
    const hashInterval = state.panel.querySelector("[data-input='playlist-hash-interval']");
    if (hashInterval && document.activeElement !== hashInterval) hashInterval.value = playlistConfig().hashIntervalValue ?? intervalDisplayValue(d.playlistHashIntervalSeconds, playlistConfig().hashIntervalUnit);
    const hashIntervalUnit = state.panel.querySelector("[data-input='playlist-hash-interval-unit']");
    if (hashIntervalUnit && document.activeElement !== hashIntervalUnit) hashIntervalUnit.value = normalizeIntervalUnit(playlistConfig().hashIntervalUnit);
    setInputValue("playlist-hash-order", playlistConfig().hashOrder);
    updateSpecificHashSectionState(state.panel, Boolean(playlistConfig().randomHash));
    const rotation = state.panel.querySelector("[data-input='rotation']");
    if (rotation && document.activeElement !== rotation) rotation.value = d.rotation;
    setInputValue("capture-filename", captureConfig().filename);
    setInputValue("capture-source", captureConfig().source);
    setInputValue("capture-codec", captureConfig().codec);
    setInputValue("capture-bitrate", Math.round((Number(captureConfig().videoBitsPerSecond) || DEFAULTS.capture.videoBitsPerSecond) / 1000000));
    setInputValue("capture-fps", captureConfig().frameRate);
    setChecked("capture-audio", captureConfig().includeAudio);
    setChecked("capture-hide-panel", captureConfig().hidePanelDuringCapture);
  }

  function setText(key, value, title = "") {
    const el = state.panel?.querySelector(`[data-p5em="${key}"]`);
    if (el) {
      el.textContent = value;
      if (title) el.title = title;
    }
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
    setPlaylistItemMetadata,
    setPlaylistHashes,
    setCustomUrlParams,
    restoreDefaultPlaylist,
    saveDefaultPlaylist,
    loadLocalFolderPlaylist,
    loadServedPlaylist,
    previewPlaylistUrl,
    openCurrentSource,
    clearLogs,
    startCapture,
    stopCapture,
    chooseCaptureFolder,
    setCaptureOptions,
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
      <button type="button" data-tab="capture" role="tab" aria-selected="false">Capture</button>
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
          <div class="p5em-url-param-head">
            <h2>Artwork URL Params</h2>
            <button type="button" data-action="custom-url-param-add">+</button>
          </div>
          <div class="p5em-custom-url-param-rows" data-custom-url-param-rows></div>
          <p>Added to every loaded artwork URL before the hash. Example: name ui, value false.</p>
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
          <label class="p5em-text-control p5em-wide-control">
            <span>Free Text</span>
            <textarea data-input="free-text" rows="3" placeholder="Description, caption, venue note...">${escapeHtml(config.freeText)}</textarea>
          </label>
          <div class="p5em-overlay-subtabs p5em-wide-control">
            <button type="button" class="is-active" data-action="overlay-global-mode">Global Text</button>
            <button type="button" data-action="overlay-playlist-mode">Per Playlist Item</button>
          </div>
          <div class="p5em-playlist-metadata-editor p5em-wide-control" data-playlist-metadata-editor hidden>
            <div class="p5em-playlist-metadata-toolbar">
              <label class="p5em-text-control">
                <span>Playlist Item</span>
                <select data-input="playlist-metadata-index"></select>
              </label>
              <div class="p5em-button-row">
                <button type="button" data-action="playlist-metadata-prev">Prev</button>
                <button type="button" data-action="playlist-metadata-next">Next</button>
                <button type="button" data-action="playlist-metadata-add">Add Item</button>
              </div>
            </div>
            <div class="p5em-playlist-metadata-summary" data-p5em="playlist-metadata-summary">No playlist item selected.</div>
            <div class="p5em-button-row">
              <button type="button" data-action="playlist-metadata-toggle-details" data-expanded="false">Edit Item Text</button>
              <button type="button" data-action="playlist-metadata-copy-global">Use Global Text</button>
              <button type="button" data-action="playlist-metadata-clear">Clear Item Text</button>
            </div>
            <div class="p5em-playlist-metadata-details" data-playlist-metadata-details hidden>
              <label class="p5em-text-control">
                <span>Item Title</span>
                <input data-input="playlist-metadata-title" type="text" placeholder="Falls back to global title">
              </label>
              <label class="p5em-text-control">
                <span>Item Artist</span>
                <input data-input="playlist-metadata-artist" type="text" placeholder="Falls back to global artist">
              </label>
              <label class="p5em-text-control">
                <span>Item Year</span>
                <input data-input="playlist-metadata-year" type="text" placeholder="Falls back to global year">
              </label>
              <label class="p5em-text-control p5em-wide-control">
                <span>Item Free Text</span>
                <textarea data-input="playlist-metadata-free-text" rows="3" placeholder="Falls back to global free text"></textarea>
              </label>
            </div>
            <p>Item text overrides the global overlay only while that playlist URL or local path is playing. Use Add Item for a new playlist row, then paste its URL in the Playlist tab.</p>
          </div>
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
            <span>QR in Card</span>
            <select data-input="card-qr-placement">
              ${cardQrPlacementOptions(config.cardQrPlacement)}
            </select>
          </label>
          ${toggle("title-overlay", "Show title")}
          ${toggle("qr-overlay", "Show QR")}
          ${toggle("free-text-overlay", "Show text")}
          ${toggle("hash-overlay", "Show hash")}
          ${toggle("title-bold", "Bold title")}
          ${toggle("title-italic", "Italic title")}
          <label class="p5em-number-control">
            <span>Title Size</span>
            <input data-input="title-size" type="range" min="8" max="96" step="1" value="${config.titleOverlaySize}">
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
            <span>Text Size</span>
            <input data-input="free-text-size" type="range" min="8" max="48" step="1" value="${config.freeTextSize}">
          </label>
          <label class="p5em-number-control">
            <span>Hash Size</span>
            <input data-input="hash-overlay-size" type="range" min="7" max="24" step="1" value="${config.hashOverlaySize}">
          </label>
          <label class="p5em-number-control">
            <span>Hash Color</span>
            <select data-input="hash-overlay-color">
              ${hashColorOptions(config.hashOverlayColor)}
            </select>
          </label>
          <label class="p5em-number-control">
            <span>Safe Border</span>
            <input data-input="overlay-safe-area" type="range" min="0" max="160" step="2" value="${config.overlaySafeArea}">
          </label>
          <label class="p5em-number-control">
            <span>Hash Safe Border</span>
            <input data-input="hash-overlay-safe-area" type="range" min="0" max="240" step="2" value="${config.hashOverlaySafeArea}">
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
            <span>Text Position</span>
            <select data-input="free-text-position">
              ${positionOptions(config.freeTextPosition)}
            </select>
          </label>
          <label class="p5em-number-control">
            <span>QR Position</span>
            <select data-input="qr-position">
              ${positionOptions(config.qrPosition)}
            </select>
          </label>
          <label class="p5em-number-control">
            <span>Hash Position</span>
            <select data-input="hash-overlay-position">
              ${hashPositionOptions(config.hashOverlayPosition)}
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
          <div>
            <button type="button" data-action="playlist-restore-defaults">Restore Defaults</button>
            <button type="button" data-action="playlist-save-defaults">Save Defaults</button>
            <button type="button" data-action="playlist-load-local-folder">Load Local Folder</button>
            <button type="button" data-action="playlist-add">+</button>
          </div>
        </div>
        <div class="p5em-playlist-options">
          ${toggle("playlist", "Playlist mode")}
          <label class="p5em-number-control">
            <span>Artwork Order</span>
            <select data-input="playlist-item-order">
              ${playlistOrderOptions(playlistConfigFrom(config).itemOrder)}
            </select>
          </label>
          <label class="p5em-number-control">
            <span>Artwork Interval</span>
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
        </div>
        <div class="p5em-playlist-rows" data-playlist-rows></div>
      </section>
      <section class="p5em-playlist-editor p5em-playlist-section">
        <div class="p5em-playlist-head">
          <h2>Hash Playlist</h2>
        </div>
        <div class="p5em-playlist-options">
          ${toggle("playlist-hash", "Generate random hashes")}
          <label class="p5em-number-control">
            <span>Hash Order</span>
            <select data-input="playlist-hash-order">
              ${playlistOrderOptions(playlistConfigFrom(config).hashOrder)}
            </select>
          </label>
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
        <div class="p5em-specific-hash-section" data-specific-hash-section>
          <div class="p5em-playlist-head p5em-playlist-subhead">
            <h2>Specific Hashes</h2>
            <button type="button" data-action="playlist-hash-add">+</button>
          </div>
          <div class="p5em-playlist-hash-rows" data-playlist-hash-rows></div>
        </div>
        <p>Artwork rows choose the URL or local path. Random hashes generates new ?hash= values. Specific hashes play exact values when random hashes is off. Each list has its own loop or random order.</p>
      </section>
    </div>
    <div class="p5em-tab-panel" data-panel="capture" role="tabpanel" hidden>
      <section class="p5em-capture-editor">
        <div class="p5em-panel-grid p5em-capture-status-grid">
          ${section("Capture", [["Status", "p5em-capture-status"], ["Duration", "p5em-capture-duration"], ["Source", "p5em-capture-source"], ["Codec", "p5em-capture-codec"], ["Output", "p5em-capture-output"]])}
        </div>
        <div class="p5em-control-group p5em-control-group-wide">
          <h2>Recording</h2>
          <label class="p5em-text-control p5em-wide-control">
            <span>Save file name</span>
            <input data-input="capture-filename" type="text" value="${escapeAttr(captureConfigFrom(config).filename)}" placeholder="exhibition-capture">
          </label>
          <label class="p5em-number-control">
            <span>Capture source</span>
            <select data-input="capture-source">
              ${captureSourceOptions(captureConfigFrom(config).source)}
            </select>
          </label>
          <label class="p5em-number-control">
            <span>Codec</span>
            <select data-input="capture-codec">
              ${captureCodecOptions(captureConfigFrom(config).codec)}
            </select>
          </label>
          <label class="p5em-number-control">
            <span>Bitrate Mbps</span>
            <input data-input="capture-bitrate" type="number" min="4" max="120" step="1" value="${Math.round((Number(captureConfigFrom(config).videoBitsPerSecond) || DEFAULTS.capture.videoBitsPerSecond) / 1000000)}">
          </label>
          <label class="p5em-number-control">
            <span>FPS</span>
            <input data-input="capture-fps" type="number" min="15" max="120" step="1" value="${captureConfigFrom(config).frameRate}">
          </label>
          ${toggle("capture-audio", "Include audio")}
          ${toggle("capture-hide-panel", "Hide panel while recording")}
          <div class="p5em-button-row">
            <button type="button" data-action="capture-folder">Browse Folder</button>
            <button type="button" data-action="open-current-source">Open Artwork</button>
            <button type="button" data-action="screenshot">Save Still</button>
            <button type="button" data-action="capture-start">Start Recording</button>
            <button type="button" data-action="capture-stop">Stop Recording</button>
          </div>
        </div>
        <p>Auto records the artwork canvas and overlay layout directly at the current browser window size. It does not request screen capture, include browser chrome, or force fullscreen. WebM is the reliable browser format; H.264 MP4 depends on browser support. ProRes requires the FFmpeg helper after recording. Use Recording - Stop or Shift + C to stop.</p>
      </section>
    </div>
    <div class="p5em-tab-panel" data-panel="log" role="tabpanel" hidden>
      <section class="p5em-log-viewer">
        <div class="p5em-log-head">
          <h2>Runtime Log</h2>
          <button type="button" data-action="log-copy">Copy</button>
          <button type="button" data-action="log-clear">Clear</button>
        </div>
        <div class="p5em-log-rows" data-log-rows></div>
      </section>
    </div>
    <div class="p5em-panel-actions">
      <button type="button" data-action="fullscreen">Fullscreen</button>
      <button type="button" data-action="reset">Reset</button>
      <button type="button" data-action="playlist-apply">Apply Playlist</button>
      <button type="button" data-action="playlist-save-json">Save JSON</button>
      <button type="button" data-action="runtime-load-json">Load JSON</button>
      <button type="button" data-action="playlist-prev">Prev URL</button>
      <button type="button" data-action="playlist-next">Next URL</button>
      <input data-input="runtime-config-file" type="file" accept="application/json,.json" hidden>
    </div>
    <p class="p5em-panel-hint">Shift + ${config.panelKey.toUpperCase()} toggles this panel. Developed @ Phenomena Labs. Open source with credit; contributions: info@phenomenalabs.com or phenomenalabs.eth.</p>
  `;
  installPanelDrag(panel);
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
    if (action === "log-clear") api.clearLogs();
    if (action === "copy-hash") copyText(api.diagnostics().currentHash || "");
    if (action === "hash-record-start") api.startHashRecording();
    if (action === "hash-record-stop") api.stopHashRecording();
    if (action === "hash-record-export") api.exportHashRecording();
    if (action === "hash-record-clear") api.clearHashRecording();
    if (action === "overlay-global-mode") setOverlayMetadataMode(panel, "global");
    if (action === "overlay-playlist-mode") {
      setOverlayMetadataMode(panel, "playlist");
      syncPlaylistMetadataEditor(panel);
    }
    if (action === "playlist-metadata-copy-global") {
      const selected = selectedPlaylistMetadataRow(panel);
      if (selected) {
        const index = selectedPlaylistMetadataIndex(panel);
        setPlaylistRowMetadata(selected, {
          title: panel.querySelector("[data-input='artwork-title']")?.value || "",
          artist: panel.querySelector("[data-input='artwork-artist']")?.value || "",
          year: panel.querySelector("[data-input='artwork-year']")?.value || "",
          freeText: panel.querySelector("[data-input='free-text']")?.value || ""
        });
        syncPlaylistMetadataEditor(panel);
        api.setPlaylistItemMetadata(index, collectPlaylistRowMetadata(selected));
      }
    }
    if (action === "playlist-metadata-clear") {
      const selected = selectedPlaylistMetadataRow(panel);
      if (selected) {
        const index = selectedPlaylistMetadataIndex(panel);
        setPlaylistRowMetadata(selected, {});
        syncPlaylistMetadataEditor(panel);
        api.setPlaylistItemMetadata(index, {});
      }
    }
    if (action === "playlist-metadata-toggle-details") {
      const details = panel.querySelector("[data-playlist-metadata-details]");
      if (details) {
        const expanded = details.hidden;
        details.hidden = !expanded;
        event.target.dataset.expanded = expanded ? "true" : "false";
        event.target.textContent = expanded ? "Hide Item Text" : "Edit Item Text";
      }
    }
    if (action === "playlist-metadata-prev" || action === "playlist-metadata-next") {
      const select = panel.querySelector("[data-input='playlist-metadata-index']");
      const rows = Array.from(panel.querySelectorAll(".p5em-playlist-row"));
      if (select && rows.length) {
        const direction = action === "playlist-metadata-prev" ? -1 : 1;
        const nextIndex = (selectedPlaylistMetadataIndex(panel) + direction + rows.length) % rows.length;
        select.value = String(nextIndex);
        syncPlaylistMetadataEditor(panel);
      }
    }
    if (action === "playlist-metadata-add") {
      addPlaylistRow(panel, { url: "" });
      const rows = Array.from(panel.querySelectorAll(".p5em-playlist-row"));
      const select = panel.querySelector("[data-input='playlist-metadata-index']");
      if (select && rows.length) select.value = String(rows.length - 1);
      const container = panel.querySelector("[data-playlist-rows]");
      if (container) container.dataset.dirty = "true";
      syncPlaylistMetadataEditor(panel);
      api.setPlaylistItems(collectPlaylistRows(panel));
    }
    if (action === "playlist-apply") {
      api.setPlaylistItems(collectPlaylistRows(panel));
      api.setPlaylistHashes(collectPlaylistHashRows(panel));
    }
    if (action === "playlist-restore-defaults") api.restoreDefaultPlaylist();
    if (action === "playlist-save-defaults") api.saveDefaultPlaylist();
    if (action === "playlist-load-local-folder") api.loadLocalFolderPlaylist();
    if (action === "playlist-save-json") api.exportConfig();
    if (action === "runtime-load-json") panel.querySelector("[data-input='runtime-config-file']")?.click();
    if (action === "custom-url-param-add") {
      addCustomUrlParamRow(panel, {});
      const container = panel.querySelector("[data-custom-url-param-rows]");
      if (container) container.dataset.dirty = "true";
    }
    if (action === "custom-url-param-remove") {
      event.target.closest(".p5em-custom-url-param-row")?.remove();
      const container = panel.querySelector("[data-custom-url-param-rows]");
      if (container) container.dataset.dirty = "true";
      api.setCustomUrlParams(collectCustomUrlParamRows(panel));
    }
    if (action === "capture-folder") api.chooseCaptureFolder();
    if (action === "open-current-source") api.openCurrentSource();
    if (action === "capture-start") api.startCapture(collectCaptureOptions(panel));
    if (action === "capture-stop") api.stopCapture();
    if (action === "playlist-add") {
      addPlaylistRow(panel, "");
      const container = panel.querySelector("[data-playlist-rows]");
      if (container) container.dataset.dirty = "true";
      syncPlaylistMetadataEditor(panel);
    }
    if (action === "playlist-remove") {
      event.target.closest(".p5em-playlist-row")?.remove();
      const container = panel.querySelector("[data-playlist-rows]");
      if (container) container.dataset.dirty = "true";
      syncPlaylistMetadataEditor(panel);
    }
    if (action === "playlist-hash-add") {
      if (playlistConfigFrom(api.getConfig()).randomHash) return;
      addPlaylistHashRow(panel, "");
      const container = panel.querySelector("[data-playlist-hash-rows]");
      if (container) container.dataset.dirty = "true";
    }
    if (action === "playlist-hash-remove") {
      if (playlistConfigFrom(api.getConfig()).randomHash) return;
      event.target.closest(".p5em-playlist-hash-row")?.remove();
      const container = panel.querySelector("[data-playlist-hash-rows]");
      if (container) container.dataset.dirty = "true";
      api.setPlaylistHashes(collectPlaylistHashRows(panel));
    }
    if (action === "playlist-hash-generate") {
      if (playlistConfigFrom(api.getConfig()).randomHash) return;
      const row = event.target.closest(".p5em-playlist-hash-row");
      const input = row?.querySelector("[data-input='playlist-hash']");
      if (input) input.value = randomHashValue();
      const container = panel.querySelector("[data-playlist-hash-rows]");
      if (container) container.dataset.dirty = "true";
      api.setPlaylistHashes(collectPlaylistHashRows(panel));
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
    if (toggle === "free-text-overlay") api.setArtworkMetadata({ showFreeText: event.target.checked });
    if (toggle === "hash-overlay") api.setArtworkMetadata({ showHashOverlay: event.target.checked });
    if (toggle === "title-bold") api.setArtworkMetadata({ titleOverlayBold: event.target.checked });
    if (toggle === "title-italic") api.setArtworkMetadata({ titleOverlayItalic: event.target.checked });
    if (toggle === "reduced-motion") api.setAccessibility({ reducedMotion: event.target.checked });
    if (toggle === "high-contrast") api.setAccessibility({ highContrast: event.target.checked });
    if (toggle === "playlist") api.togglePlaylist(event.target.checked);
    if (toggle === "playlist-hash") api.setPlaylistRandomHash(event.target.checked);
    if (toggle === "capture-audio") api.setCaptureOptions({ includeAudio: event.target.checked });

    if (event.target?.dataset?.input === "playlist-interval") {
      const unit = panel.querySelector("[data-input='playlist-interval-unit']")?.value || "seconds";
      api.setPlaylistIntervalParts(event.target.value, unit);
    }
    if (event.target?.dataset?.input === "playlist-interval-unit") {
      const value = panel.querySelector("[data-input='playlist-interval']")?.value || 1;
      api.setPlaylistIntervalParts(value, event.target.value);
    }
    if (event.target?.dataset?.input === "playlist-item-order") {
      api.setPlaylistOptions({ itemOrder: event.target.value });
    }
    if (event.target?.dataset?.input === "playlist-hash-interval") {
      const unit = panel.querySelector("[data-input='playlist-hash-interval-unit']")?.value || "seconds";
      api.setPlaylistHashIntervalParts(event.target.value, unit);
    }
    if (event.target?.dataset?.input === "playlist-hash-interval-unit") {
      const value = panel.querySelector("[data-input='playlist-hash-interval']")?.value || 1;
      api.setPlaylistHashIntervalParts(value, event.target.value);
    }
    if (event.target?.dataset?.input === "playlist-hash-order") {
      api.setPlaylistOptions({ hashOrder: event.target.value });
    }
    if (event.target?.dataset?.input === "playlist-metadata-index") {
      syncPlaylistMetadataEditor(panel);
    }
    if (event.target?.dataset?.input === "rotation") {
      api.setRotation(event.target.value);
    }
    if (event.target?.dataset?.input?.startsWith("capture-")) {
      api.setCaptureOptions(collectCaptureOptions(panel));
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
    if (event.target?.dataset?.input === "free-text") {
      api.setArtworkMetadata({ freeText: event.target.value });
    }
    if (event.target?.dataset?.input === "title-size") {
      api.setArtworkMetadata({ titleOverlaySize: event.target.value });
    }
    if (event.target?.dataset?.input === "free-text-size") {
      api.setArtworkMetadata({ freeTextSize: event.target.value });
    }
    if (event.target?.dataset?.input === "hash-overlay-size") {
      api.setArtworkMetadata({ hashOverlaySize: event.target.value });
    }
    if (event.target?.dataset?.input === "hash-overlay-safe-area") {
      api.setArtworkMetadata({ hashOverlaySafeArea: event.target.value });
    }
    if (event.target?.dataset?.input === "hash-overlay-color") {
      api.setArtworkMetadata({ hashOverlayColor: event.target.value });
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
    if (event.target?.dataset?.input === "free-text-position") {
      api.setArtworkMetadata({ freeTextPosition: event.target.value });
    }
    if (event.target?.dataset?.input === "hash-overlay-position") {
      api.setArtworkMetadata({ hashOverlayPosition: event.target.value });
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
      syncPlaylistMetadataEditor(panel);
    }
    if (event.target?.dataset?.input === "playlist-file") {
      previewDroppedArtwork(event.target, api, event.target.closest(".p5em-playlist-row"));
      event.target.value = "";
    }
    if (event.target?.dataset?.input === "playlist-hash") {
      if (playlistConfigFrom(api.getConfig()).randomHash) return;
      const container = panel.querySelector("[data-playlist-hash-rows]");
      if (container) container.dataset.dirty = "true";
      api.setPlaylistHashes(collectPlaylistHashRows(panel));
    }
    if (event.target?.dataset?.input?.startsWith("playlist-metadata-") && event.target?.dataset?.input !== "playlist-metadata-index") {
      const row = selectedPlaylistMetadataRow(panel);
      if (row) {
        const index = selectedPlaylistMetadataIndex(panel);
        setPlaylistRowMetadata(row, collectPlaylistMetadataEditor(panel));
        const container = panel.querySelector("[data-playlist-rows]");
        if (container) container.dataset.dirty = "true";
        api.setPlaylistItemMetadata(index, collectPlaylistRowMetadata(row));
      }
    }
    if (event.target?.dataset?.input === "custom-url-param-name" || event.target?.dataset?.input === "custom-url-param-value") {
      const container = panel.querySelector("[data-custom-url-param-rows]");
      if (container) container.dataset.dirty = "true";
      api.setCustomUrlParams(collectCustomUrlParamRows(panel));
    }
    if (event.target?.dataset?.input === "runtime-config-file") {
      loadConfigFile(event.target.files?.[0], api, panel);
      event.target.value = "";
    }
  });
  syncPlaylistRows(panel, playlistConfigFrom(config).items);
  syncPlaylistHashRows(panel, playlistConfigFrom(config).hashes);
  syncPlaylistMetadataEditor(panel);
  syncCustomUrlParamRows(panel, normalizeCustomUrlParams(config.customUrlParams));
  return panel;
}

function playlistConfigFrom(config) {
  const playlist = Array.isArray(config.playlist)
    ? { ...DEFAULTS.playlist, enabled: true, items: config.playlist }
    : { ...DEFAULTS.playlist, ...(config.playlist || {}) };
  playlist.items = normalizePlaylistItems(playlist.items);
  playlist.hashes = normalizePlaylistHashes(playlist.hashes);
  playlist.itemOrder = normalizePlaylistOrder(playlist.itemOrder);
  playlist.hashOrder = normalizePlaylistOrder(playlist.hashOrder);
  return playlist;
}

function captureConfigFrom(config) {
  return { ...DEFAULTS.capture, ...(config.capture || {}) };
}

function captureSourceOptions(selected = "auto") {
  const normalized = normalizeCaptureSource(selected);
  return [
    ["auto", "Auto"],
    ["canvas", "Artwork Canvas"]
  ].map(([value, label]) => `<option value="${value}"${value === normalized ? " selected" : ""}>${label}</option>`).join("");
}

function captureCodecOptions(selected = "auto") {
  const options = [
    ["webm", "WebM"],
    ["vp9", "WebM VP9"],
    ["vp8", "WebM VP8"],
    ["h264", "H.264 MP4 (experimental)"],
    ["auto", "Auto"],
    ["default", "Browser default"]
  ];
  return `${options.map(([value, label]) => `<option value="${value}"${value === selected ? " selected" : ""}>${label}</option>`).join("")}<option value="prores" disabled>ProRes requires helper</option>`;
}

function playlistOrderOptions(selected = "loop") {
  return [
    ["loop", "Loop"],
    ["random", "Random"]
  ].map(([value, label]) => `<option value="${value}"${normalizePlaylistOrder(selected) === value ? " selected" : ""}>${label}</option>`).join("");
}

function normalizeCaptureSource(value) {
  if (value === "canvas") return value;
  return "auto";
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
  if (panel.__p5emApiConfig) {
    panel.__p5emApiConfig.ui = { ...(panel.__p5emApiConfig.ui || {}), activeTab: tab };
  }
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

function installPanelDrag(panel) {
  const header = panel.querySelector(".p5em-panel-header");
  if (!header) return;
  let drag = null;
  header.addEventListener("pointerdown", (event) => {
    if (event.target.closest("button")) return;
    const rect = panel.getBoundingClientRect();
    drag = {
      pointerId: event.pointerId,
      offsetX: event.clientX - rect.left,
      offsetY: event.clientY - rect.top,
      width: rect.width,
      height: rect.height
    };
    panel.classList.add("is-dragging");
    panel.style.width = `${rect.width}px`;
    panel.style.height = `${rect.height}px`;
    panel.style.right = "auto";
    panel.style.bottom = "auto";
    header.setPointerCapture?.(event.pointerId);
    event.preventDefault();
  });
  header.addEventListener("pointermove", (event) => {
    if (!drag || event.pointerId !== drag.pointerId) return;
    const margin = 8;
    const left = clamp(event.clientX - drag.offsetX, margin, Math.max(margin, window.innerWidth - drag.width - margin));
    const top = clamp(event.clientY - drag.offsetY, margin, Math.max(margin, window.innerHeight - drag.height - margin));
    panel.style.left = `${left}px`;
    panel.style.top = `${top}px`;
  });
  const endDrag = (event) => {
    if (!drag || event.pointerId !== drag.pointerId) return;
    header.releasePointerCapture?.(event.pointerId);
    panel.classList.remove("is-dragging");
    if (panel.__p5emApiConfig) {
      panel.__p5emApiConfig.ui = {
        ...(panel.__p5emApiConfig.ui || {}),
        panelBounds: getPanelBounds(panel)
      };
    }
    drag = null;
  };
  header.addEventListener("pointerup", endDrag);
  header.addEventListener("pointercancel", endDrag);
}

function getPanelBounds(panel) {
  if (!panel) return null;
  const rect = panel.getBoundingClientRect();
  const hasCustomPosition = panel.style.left || panel.style.top || panel.style.width || panel.style.height;
  if (!hasCustomPosition) return null;
  return {
    left: Math.round(rect.left),
    top: Math.round(rect.top),
    width: Math.round(rect.width),
    height: Math.round(rect.height)
  };
}

function applyPanelBounds(panel, bounds) {
  if (!panel || !bounds) return;
  const width = clamp(Number(bounds.width) || 0, 260, Math.max(260, window.innerWidth - 16));
  const height = clamp(Number(bounds.height) || 0, 220, Math.max(220, window.innerHeight - 16));
  const left = clamp(Number(bounds.left) || 8, 8, Math.max(8, window.innerWidth - width - 8));
  const top = clamp(Number(bounds.top) || 8, 8, Math.max(8, window.innerHeight - height - 8));
  panel.style.left = `${left}px`;
  panel.style.top = `${top}px`;
  panel.style.width = `${width}px`;
  panel.style.height = `${height}px`;
  panel.style.right = "auto";
  panel.style.bottom = "auto";
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
  const rows = normalizePlaylistItems(items);
  container.innerHTML = "";
  container.dataset.dirty = "false";
  container.dataset.editing = "false";
  (rows.length ? rows : [""]).forEach((item) => addPlaylistRow(panel, item));
  syncPlaylistMetadataEditor(panel);
}

function syncPlaylistHashRows(panel, hashes, options = {}) {
  const container = panel?.querySelector("[data-playlist-hash-rows]");
  if (!container || (!options.force && container.dataset.editing === "true")) return;
  if (!options.force && container.dataset.dirty === "true") return;
  const values = normalizePlaylistHashes(hashes);
  container.innerHTML = "";
  container.dataset.dirty = "false";
  container.dataset.editing = "false";
  (values.length ? values : [""]).forEach((hash) => addPlaylistHashRow(panel, hash));
  updateSpecificHashSectionState(panel, Boolean(playlistConfigFrom(panel.__p5emApi?.getConfig?.() || {}).randomHash));
}

function syncCustomUrlParamRows(panel, params, options = {}) {
  const container = panel?.querySelector("[data-custom-url-param-rows]");
  if (!container || (!options.force && container.dataset.editing === "true")) return;
  if (!options.force && container.dataset.dirty === "true") return;
  const values = normalizeCustomUrlParams(params);
  container.innerHTML = "";
  container.dataset.dirty = "false";
  container.dataset.editing = "false";
  (values.length ? values : [{}]).forEach((param) => addCustomUrlParamRow(panel, param));
}

function addCustomUrlParamRow(panel, param = {}) {
  const container = panel.querySelector("[data-custom-url-param-rows]");
  if (!container) return;
  const row = document.createElement("div");
  row.className = "p5em-custom-url-param-row";
  row.innerHTML = `
    <input data-input="custom-url-param-name" type="text" value="${escapeAttr(param.name || "")}" placeholder="name">
    <input data-input="custom-url-param-value" type="text" value="${escapeAttr(param.value || "")}" placeholder="value">
    <button type="button" data-action="custom-url-param-remove" aria-label="Remove URL parameter">-</button>
  `;
  row.querySelectorAll("input").forEach((input) => {
    input.addEventListener("focus", () => {
      container.dataset.editing = "true";
    });
    input.addEventListener("input", () => {
      container.dataset.dirty = "true";
    });
    input.addEventListener("blur", () => {
      container.dataset.editing = "false";
    });
  });
  container.appendChild(row);
}

function updateSpecificHashSectionState(panel, disabled) {
  const section = panel?.querySelector("[data-specific-hash-section]");
  if (!section) return;
  section.classList.toggle("is-disabled", disabled);
  section.setAttribute("aria-disabled", disabled ? "true" : "false");
  section.querySelectorAll("input, button").forEach((control) => {
    control.disabled = disabled;
  });
}

function addPlaylistRow(panel, item = "") {
  const container = panel.querySelector("[data-playlist-rows]");
  if (!container) return;
  const normalizedItem = typeof item === "string" ? { url: item } : { ...(item || {}) };
  const value = normalizedItem.url || "";
  const row = document.createElement("div");
  row.className = "p5em-playlist-row";
  row.__p5emItem = normalizedItem;
  setPlaylistRowMetadata(row, normalizedItem);
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
      <span>Temp HTML</span>
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
    row.__p5emItem = { ...(row.__p5emItem || {}), url: row.querySelector("[data-input='playlist-url']").value.trim() };
    container.dataset.dirty = "true";
    syncPlaylistMetadataEditor(panel);
  });
  row.querySelector("[data-input='playlist-url']").addEventListener("blur", () => {
    container.dataset.editing = "false";
  });
  container.appendChild(row);
  syncPlaylistMetadataEditor(panel);
}

function addPlaylistHashRow(panel, value = "") {
  const container = panel.querySelector("[data-playlist-hash-rows]");
  if (!container) return;
  const row = document.createElement("div");
  row.className = "p5em-playlist-hash-row";
  row.innerHTML = `
    <input data-input="playlist-hash" type="text" value="${escapeAttr(value)}" placeholder="0x...">
    <button type="button" data-action="playlist-hash-generate">Generate</button>
    <button type="button" data-action="playlist-hash-remove" aria-label="Remove playlist hash">-</button>
  `;
  row.querySelector("[data-input='playlist-hash']").addEventListener("focus", () => {
    container.dataset.editing = "true";
  });
  row.querySelector("[data-input='playlist-hash']").addEventListener("input", () => {
    container.dataset.dirty = "true";
  });
  row.querySelector("[data-input='playlist-hash']").addEventListener("blur", () => {
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

function setOverlayMetadataMode(panel, mode) {
  const usePlaylist = mode === "playlist";
  panel.querySelector("[data-action='overlay-global-mode']")?.classList.toggle("is-active", !usePlaylist);
  panel.querySelector("[data-action='overlay-playlist-mode']")?.classList.toggle("is-active", usePlaylist);
  const editor = panel.querySelector("[data-playlist-metadata-editor]");
  if (editor) editor.hidden = !usePlaylist;
}

function syncPlaylistMetadataEditor(panel) {
  if (!panel) return;
  const editor = panel.querySelector("[data-playlist-metadata-editor]");
  const select = panel.querySelector("[data-input='playlist-metadata-index']");
  const summary = panel.querySelector("[data-p5em='playlist-metadata-summary']");
  if (!editor || !select) return;
  const rows = Array.from(panel.querySelectorAll(".p5em-playlist-row"));
  const previous = Number(select.value);
  select.innerHTML = rows.map((row, index) => {
    const url = row.querySelector("[data-input='playlist-url']")?.value || "";
    const label = shortenMiddle(url || `Playlist item ${index + 1}`, 56);
    return `<option value="${index}">${index + 1}. ${escapeHtml(label)}</option>`;
  }).join("");
  const nextIndex = clamp(Number.isFinite(previous) ? previous : 0, 0, Math.max(0, rows.length - 1));
  select.value = String(nextIndex);
  editor.querySelectorAll("input, textarea, select, button").forEach((control) => {
    const canAddWithoutRows = control.dataset.action === "playlist-metadata-add";
    control.disabled = !rows.length && !canAddWithoutRows;
  });
  const row = rows[nextIndex];
  const metadata = row ? collectPlaylistRowMetadata(row) : {};
  setFieldValue(editor, "playlist-metadata-title", metadata.title || "");
  setFieldValue(editor, "playlist-metadata-artist", metadata.artist || "");
  setFieldValue(editor, "playlist-metadata-year", metadata.year || "");
  setFieldValue(editor, "playlist-metadata-free-text", metadata.freeText || "");
  if (summary) {
    if (!row) {
      summary.textContent = "No playlist item selected. Add an item or create rows in the Playlist tab.";
    } else if (hasPlaylistItemMetadata(metadata)) {
      const title = metadata.title || "Global title";
      const artistYear = [metadata.artist, metadata.year].filter(Boolean).join(", ");
      const freeText = metadata.freeText ? ` - ${metadata.freeText}` : "";
      summary.textContent = `${title}${artistYear ? ` by ${artistYear}` : ""}${freeText}`;
    } else {
      summary.textContent = "Using global overlay text for this playlist item.";
    }
  }
}

function selectedPlaylistMetadataRow(panel) {
  const index = selectedPlaylistMetadataIndex(panel);
  return Array.from(panel.querySelectorAll(".p5em-playlist-row"))[index] || null;
}

function selectedPlaylistMetadataIndex(panel) {
  return Number(panel.querySelector("[data-input='playlist-metadata-index']")?.value) || 0;
}

function collectPlaylistMetadataEditor(panel) {
  return {
    title: panel.querySelector("[data-input='playlist-metadata-title']")?.value || "",
    artist: panel.querySelector("[data-input='playlist-metadata-artist']")?.value || "",
    year: panel.querySelector("[data-input='playlist-metadata-year']")?.value || "",
    freeText: panel.querySelector("[data-input='playlist-metadata-free-text']")?.value || ""
  };
}

function setPlaylistRowMetadata(row, metadata = {}) {
  row.dataset.metaTitle = String(metadata.title || "");
  row.dataset.metaArtist = String(metadata.artist || "");
  row.dataset.metaYear = String(metadata.year || "");
  row.dataset.metaFreeText = String(metadata.freeText || "");
  row.__p5emItem = {
    ...(row.__p5emItem || {}),
    title: row.dataset.metaTitle,
    artist: row.dataset.metaArtist,
    year: row.dataset.metaYear,
    freeText: row.dataset.metaFreeText
  };
}

function collectPlaylistRowMetadata(row) {
  return {
    title: row.dataset.metaTitle || "",
    artist: row.dataset.metaArtist || "",
    year: row.dataset.metaYear || "",
    freeText: row.dataset.metaFreeText || ""
  };
}

function hasPlaylistItemMetadata(item = {}) {
  return ["title", "artist", "year", "freeText"].some((key) => String(item[key] || "").trim());
}

function setFieldValue(root, inputName, value) {
  const field = root.querySelector(`[data-input='${inputName}']`);
  if (field) field.value = value;
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
  return Array.from(panel.querySelectorAll(".p5em-playlist-row"))
    .map((row) => {
      const input = row.querySelector("[data-input='playlist-url']");
      if (!input || input.dataset.temporaryPreview === "true") return null;
      const url = input.value.trim();
      if (!url) return null;
      const base = { ...(row.__p5emItem || {}), url };
      const metadata = collectPlaylistRowMetadata(row);
      const item = { ...base, ...metadata };
      Object.keys(item).forEach((key) => {
        if (key !== "url" && (item[key] === "" || item[key] === undefined || item[key] === null)) delete item[key];
      });
      const hasObjectFields = typeof row.__p5emItem === "object"
        && Object.keys(row.__p5emItem || {}).some((key) => !["url", "title", "artist", "year", "freeText"].includes(key));
      return hasPlaylistItemMetadata(item) || hasObjectFields
        ? item
        : url;
    })
    .filter(Boolean);
}

function collectPlaylistHashRows(panel) {
  return normalizePlaylistHashes(Array.from(panel.querySelectorAll("[data-input='playlist-hash']"))
    .map((input) => input.value.trim())
    .filter(Boolean));
}

function collectCustomUrlParamRows(panel) {
  return normalizeCustomUrlParams(Array.from(panel.querySelectorAll(".p5em-custom-url-param-row")).map((row) => ({
    name: row.querySelector("[data-input='custom-url-param-name']")?.value,
    value: row.querySelector("[data-input='custom-url-param-value']")?.value
  })));
}

function collectCaptureOptions(panel) {
  const bitrateMbps = Number(panel.querySelector("[data-input='capture-bitrate']")?.value) || 30;
  return {
    filename: panel.querySelector("[data-input='capture-filename']")?.value || DEFAULTS.capture.filename,
    source: panel.querySelector("[data-input='capture-source']")?.value || DEFAULTS.capture.source,
    codec: panel.querySelector("[data-input='capture-codec']")?.value || DEFAULTS.capture.codec,
    videoBitsPerSecond: Math.max(1, bitrateMbps) * 1000000,
    frameRate: Number(panel.querySelector("[data-input='capture-fps']")?.value) || DEFAULTS.capture.frameRate,
    includeAudio: Boolean(panel.querySelector("[data-toggle='capture-audio']")?.checked),
    hidePanelDuringCapture: panel.querySelector("[data-toggle='capture-hide-panel']")
      ? Boolean(panel.querySelector("[data-toggle='capture-hide-panel']")?.checked)
      : DEFAULTS.capture.hidePanelDuringCapture
  };
}

function isLikelyRemoteUrl(value) {
  return /^(https?:|blob:|about:)/i.test(String(value || "").trim());
}

function isAbsoluteLocalPath(value) {
  const text = String(value || "").trim();
  return /^\/[^/]/.test(text) && !isLikelyRemoteUrl(text);
}

function absolutePathToHelperUrl(value, prefix = "/__p5em/abs/") {
  const text = String(value || "").trim();
  const match = text.match(/^([^?#]*)([?#].*)?$/);
  const pathPart = match?.[1] || text;
  const suffix = match?.[2] || "";
  const base = String(prefix || "/__p5em/abs/").endsWith("/") ? String(prefix || "/__p5em/abs/") : `${prefix}/`;
  const encodedPath = pathPart
    .replace(/^\/+/, "")
    .split("/")
    .map((part) => encodeURIComponent(part))
    .join("/");
  return `${base}${encodedPath}${suffix}`;
}

function remoteUrlToLocalMirrorPath(value, mirrorRoot) {
  const url = safeUrl(value);
  if (!url || !/^https?:$/.test(url.protocol)) return "";
  const root = String(mirrorRoot || "").trim().replace(/\/+$/, "");
  if (!root) return "";
  const host = url.hostname.replace(/^www\./, "");
  const rootBase = pathJoinForUrlMirror(root, host);
  const pathname = decodeURIComponent(url.pathname || "/");
  const filePath = pathname.endsWith("/")
    ? `${pathname}index.html`
    : pathname.split("/").pop()?.includes(".")
      ? pathname
      : `${pathname}/index.html`;
  return `${rootBase}${filePath.startsWith("/") ? "" : "/"}${filePath}${url.search || ""}${url.hash || ""}`;
}

function pathJoinForUrlMirror(root, host) {
  const normalizedRoot = root.replace(/\/+$/, "");
  if (normalizedRoot.split("/").pop() === host) return normalizedRoot;
  return `${normalizedRoot}/${host}`;
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
    #p5em-title-overlay,
    #p5em-free-text-overlay,
    #p5em-hash-overlay {
      position: absolute;
      max-width: min(520px, calc(100% - 36px));
      font: 500 11px/1.35 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      pointer-events: none;
    }
    #p5em-hash-overlay {
      max-width: min(320px, calc(100% - 36px));
      color: rgba(255,255,255,0.72);
      font-weight: 500;
      letter-spacing: 0.1em;
      line-height: 1.2;
      text-transform: none;
    }
    #p5em-hash-overlay[data-color="black"] {
      color: rgba(0,0,0,0.78);
    }
    #p5em-recording-indicator {
      position: fixed;
      right: 18px;
      top: 18px;
      z-index: 2147483647;
      display: inline-flex;
      align-items: center;
      gap: 8px;
      height: 34px;
      padding: 0 13px;
      color: rgba(255,255,255,0.94);
      background: rgba(150,25,25,0.92);
      border: 1px solid rgba(255,255,255,0.32);
      border-radius: 0;
      font: 700 11px/1 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      letter-spacing: 0.12em;
      text-transform: uppercase;
      cursor: pointer;
      pointer-events: auto;
    }
    #p5em-recording-indicator::before {
      content: "";
      width: 8px;
      height: 8px;
      background: currentColor;
      border-radius: 999px;
    }
    #p5em-free-text-overlay {
      max-width: min(620px, calc(100% - 36px));
      line-height: 1.45;
      letter-spacing: 0.03em;
      text-transform: none;
      white-space: pre-line;
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
      pointer-events: none;
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
    #p5em-title-overlay .p5em-title-name,
    #p5em-title-overlay .p5em-title-meta {
      display: inline;
    }
    #p5em-title-overlay[data-bold="true"],
    #p5em-free-text-overlay[data-bold="true"],
    #p5em-card-overlay[data-bold="true"] strong,
    #p5em-card-overlay[data-bold="true"] p {
      font-weight: 700;
    }
    #p5em-title-overlay[data-italic="true"] .p5em-title-name,
    #p5em-card-overlay[data-italic="true"] strong {
      font-style: italic;
    }
    #p5em-card-overlay p {
      margin: 0;
      color: currentColor;
      font: inherit;
      font-weight: 400;
      line-height: 1.45;
      letter-spacing: 0.03em;
      text-transform: none;
      opacity: 0.86;
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
    #p5em-card-overlay img[hidden] {
      display: none;
    }
    #p5em-card-overlay[data-qr-placement="below"] {
      grid-template-columns: minmax(0, 1fr);
      justify-items: start;
      max-width: min(360px, calc(100% - 36px));
    }
    #p5em-card-overlay[data-qr-placement="below"] img {
      margin-top: 2px;
    }
    #p5em-card-overlay[data-qr-placement="above"] {
      grid-template-columns: minmax(0, 1fr);
      justify-items: start;
      max-width: min(360px, calc(100% - 36px));
    }
    #p5em-card-overlay[data-qr-placement="above"] .p5em-card-copy {
      order: 2;
    }
    #p5em-card-overlay[data-qr-placement="above"] img {
      order: 1;
      margin-bottom: 2px;
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
    #p5em-free-text-overlay[data-font="sans"],
    #p5em-card-overlay[data-font="sans"] {
      font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }
    #p5em-title-overlay[data-font="serif"],
    #p5em-free-text-overlay[data-font="serif"],
    #p5em-card-overlay[data-font="serif"] {
      font-family: Georgia, "Times New Roman", serif;
      letter-spacing: 0.02em;
      text-transform: none;
    }
    #p5em-title-overlay[data-font="system"],
    #p5em-free-text-overlay[data-font="system"],
    #p5em-card-overlay[data-font="system"] {
      font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      letter-spacing: 0.03em;
    }
    #p5em-title-overlay[data-font="condensed"],
    #p5em-free-text-overlay[data-font="condensed"],
    #p5em-card-overlay[data-font="condensed"] {
      font-family: "Arial Narrow", "Helvetica Neue Condensed", Impact, sans-serif;
      letter-spacing: 0.08em;
    }
    #p5em-title-overlay[data-font="humanist"],
    #p5em-free-text-overlay[data-font="humanist"],
    #p5em-card-overlay[data-font="humanist"] {
      font-family: Avenir, "Avenir Next", Optima, Candara, sans-serif;
      letter-spacing: 0.04em;
      text-transform: none;
    }
    #p5em-title-overlay[data-font="editorial"],
    #p5em-free-text-overlay[data-font="editorial"],
    #p5em-card-overlay[data-font="editorial"] {
      font-family: "Didot", "Bodoni 72", "Bodoni 72 Oldstyle", Georgia, serif;
      letter-spacing: 0.02em;
      text-transform: none;
    }
    #p5em-title-overlay[data-font="classic"],
    #p5em-free-text-overlay[data-font="classic"],
    #p5em-card-overlay[data-font="classic"] {
      font-family: Garamond, "Iowan Old Style", "Times New Roman", serif;
      letter-spacing: 0.015em;
      text-transform: none;
    }
    #p5em-title-overlay[data-font="book"],
    #p5em-free-text-overlay[data-font="book"],
    #p5em-card-overlay[data-font="book"] {
      font-family: "Hoefler Text", "Palatino Linotype", Palatino, Georgia, serif;
      letter-spacing: 0.01em;
      text-transform: none;
    }
    #p5em-title-overlay[data-font="neo"],
    #p5em-free-text-overlay[data-font="neo"],
    #p5em-card-overlay[data-font="neo"] {
      font-family: Futura, "Avenir Next", Avenir, "Trebuchet MS", sans-serif;
      letter-spacing: 0.1em;
    }
    #p5em-title-overlay[data-font="geometric"],
    #p5em-free-text-overlay[data-font="geometric"],
    #p5em-card-overlay[data-font="geometric"] {
      font-family: "Gill Sans", Futura, "Century Gothic", sans-serif;
      letter-spacing: 0.08em;
    }
    #p5em-title-overlay[data-font="architectural"],
    #p5em-free-text-overlay[data-font="architectural"],
    #p5em-card-overlay[data-font="architectural"] {
      font-family: "Helvetica Neue", Helvetica, Arial, sans-serif;
      font-weight: 600;
      letter-spacing: 0.16em;
    }
    #p5em-title-overlay[data-font="typewriter"],
    #p5em-free-text-overlay[data-font="typewriter"],
    #p5em-card-overlay[data-font="typewriter"] {
      font-family: "Courier Prime", "Courier New", Courier, monospace;
      letter-spacing: 0.04em;
      text-transform: none;
    }
    #p5em-title-overlay[data-color="white"],
    #p5em-free-text-overlay[data-color="white"],
    #p5em-card-overlay[data-color="white"] {
      color: rgba(255,255,255,0.88);
    }
    #p5em-title-overlay[data-color="black"],
    #p5em-free-text-overlay[data-color="black"],
    #p5em-card-overlay[data-color="black"] {
      color: rgba(0,0,0,0.88);
      border-color: rgba(0,0,0,0.16);
    }
    #p5em-title-overlay[data-color="gray"],
    #p5em-free-text-overlay[data-color="gray"],
    #p5em-card-overlay[data-color="gray"] {
      color: rgba(150,150,150,0.9);
    }
    #p5em-title-overlay[data-position^="top"],
    #p5em-free-text-overlay[data-position^="top"],
    #p5em-qr-overlay[data-position^="top"],
    #p5em-card-overlay[data-position^="top"] {
      top: calc(var(--p5em-overlay-safe-area, 18px) + var(--p5em-stack-offset, 0px));
      bottom: auto;
    }
    #p5em-title-overlay[data-position^="bottom"],
    #p5em-free-text-overlay[data-position^="bottom"],
    #p5em-qr-overlay[data-position^="bottom"],
    #p5em-card-overlay[data-position^="bottom"] {
      top: auto;
      bottom: calc(var(--p5em-overlay-safe-area, 18px) + var(--p5em-stack-offset, 0px));
    }
    #p5em-hash-overlay[data-position^="bottom"] {
      top: auto;
      bottom: var(--p5em-hash-safe-area, 18px);
    }
    #p5em-title-overlay[data-position$="left"],
    #p5em-free-text-overlay[data-position$="left"],
    #p5em-qr-overlay[data-position$="left"],
    #p5em-card-overlay[data-position$="left"] {
      left: var(--p5em-overlay-safe-area, 18px);
      right: auto;
      transform: none;
      text-align: left;
    }
    #p5em-hash-overlay[data-position$="left"] {
      left: var(--p5em-hash-safe-area, 18px);
      right: auto;
      transform: none;
      text-align: left;
    }
    #p5em-title-overlay[data-position$="center"],
    #p5em-free-text-overlay[data-position$="center"],
    #p5em-qr-overlay[data-position$="center"],
    #p5em-card-overlay[data-position$="center"] {
      left: 50%;
      right: auto;
      transform: translateX(-50%);
      text-align: center;
    }
    #p5em-title-overlay[data-position$="right"],
    #p5em-free-text-overlay[data-position$="right"],
    #p5em-qr-overlay[data-position$="right"],
    #p5em-card-overlay[data-position$="right"] {
      left: auto;
      right: var(--p5em-overlay-safe-area, 18px);
      transform: none;
      text-align: right;
    }
    #p5em-hash-overlay[data-position$="right"] {
      left: auto;
      right: var(--p5em-hash-safe-area, 18px);
      transform: none;
      text-align: right;
    }
    #p5em-qr-overlay {
      position: absolute;
      display: block;
      padding: 6px;
      background: rgba(255,255,255,0.9);
      box-shadow: 0 8px 30px rgba(0,0,0,0.28);
      pointer-events: none;
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
      padding: 12px;
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
    .p5em-capturing #${PANEL_ID} {
      display: none !important;
    }
    .p5em-capturing,
    .p5em-capturing *,
    .p5em-capturing iframe,
    .p5em-capturing canvas {
      cursor: none !important;
    }
    .p5em-panel-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 18px;
      padding-bottom: 8px;
      flex: 0 0 auto;
      border-bottom: 1px solid rgba(255,255,255,0.14);
      font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      font-size: 10px;
      letter-spacing: 0.16em;
      text-transform: uppercase;
      cursor: move;
      user-select: none;
    }
    .p5em-panel-header button {
      cursor: pointer;
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
      width: 26px;
      height: 26px;
      font-size: 18px;
      line-height: 1;
    }
    .p5em-tabs {
      display: flex;
      gap: 6px;
      flex: 0 0 auto;
      margin-top: 8px;
    }
    .p5em-tabs button {
      padding: 6px 9px;
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
      overflow: hidden;
      padding-right: 2px;
    }
    .p5em-tab-panel.is-active {
      display: flex;
    }
    .p5em-panel-grid {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 7px 12px;
      margin-top: 8px;
      flex: 0 0 auto;
    }
    .p5em-panel-grid section {
      border-top: 1px solid rgba(255,255,255,0.14);
      padding-top: 6px;
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
      gap: 10px;
      padding: 1px 0;
    }
    .p5em-panel-grid span {
      color: rgba(255,255,255,0.48);
    }
    .p5em-panel-grid strong {
      max-width: 52%;
      min-width: 0;
      overflow: hidden;
      color: rgba(255,255,255,0.92);
      font-weight: 400;
      text-align: right;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .p5em-panel-actions {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      margin-top: 8px;
      flex: 0 0 auto;
      min-height: 0;
    }
    .p5em-panel-controls {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 7px 12px;
      margin-top: 8px;
      padding-top: 8px;
      flex: 0 0 auto;
      border-top: 1px solid rgba(255,255,255,0.14);
    }
    .p5em-overlay-controls {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 6px 10px;
      margin-top: 8px;
      padding-top: 8px;
      overflow: hidden;
      flex: 1 1 auto;
      min-height: 0;
      border-top: 1px solid rgba(255,255,255,0.14);
    }
    .p5em-control-group {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 6px 10px;
      padding: 6px 0;
      border-top: 1px solid rgba(255,255,255,0.12);
    }
    .p5em-control-group-wide {
      grid-column: 1 / -1;
    }
    .p5em-overlay-controls .p5em-control-group-wide {
      grid-column: auto;
    }
    .p5em-overlay-controls .p5em-control-group {
      grid-template-columns: repeat(2, minmax(0, 1fr));
      align-content: start;
      gap: 5px 9px;
      padding: 4px 0;
    }
    .p5em-panel-controls .p5em-control-group-wide {
      grid-column: auto;
    }
    .p5em-panel-controls .p5em-control-group {
      grid-template-columns: minmax(0, 1fr);
      align-content: start;
      gap: 6px;
    }
    .p5em-panel-controls .p5em-control-group p {
      display: none;
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
      gap: 6px;
    }
    .p5em-copy-field {
      grid-column: span 2;
      display: grid;
      grid-template-columns: auto minmax(0, 1fr) auto;
      align-items: center;
      gap: 6px;
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
    .p5em-panel-controls .p5em-copy-field {
      grid-column: 1 / -1;
      grid-template-columns: minmax(0, 1fr) auto;
    }
    .p5em-panel-controls .p5em-copy-field span {
      display: none;
    }
    .p5em-copy-field button,
    .p5em-button-row button,
    .p5em-url-param-head button {
      padding: 6px 7px;
      color: rgba(255,255,255,0.78);
      background: rgba(255,255,255,0.04);
      border: 1px solid rgba(255,255,255,0.18);
      font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      font-size: 9px;
      letter-spacing: 0.12em;
      text-transform: uppercase;
      cursor: pointer;
    }
    .p5em-url-param-head {
      grid-column: 1 / -1;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
    }
    .p5em-url-param-head h2 {
      margin: 0;
    }
    .p5em-custom-url-param-rows {
      grid-column: 1 / -1;
      display: flex;
      flex-direction: column;
      gap: 5px;
    }
    .p5em-custom-url-param-row {
      display: grid;
      grid-template-columns: minmax(54px, 0.45fr) minmax(0, 1fr) 24px;
      gap: 5px;
      align-items: center;
    }
    .p5em-custom-url-param-row input {
      min-width: 0;
      padding: 5px 7px;
      color: rgba(255,255,255,0.9);
      background: rgba(255,255,255,0.04);
      border: 1px solid rgba(255,255,255,0.18);
      border-radius: 0;
      font: 10px/1.35 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    }
    .p5em-custom-url-param-row button {
      padding: 5px 7px;
      color: rgba(255,255,255,0.7);
      background: rgba(255,255,255,0.04);
      border: 1px solid rgba(255,255,255,0.18);
      font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      font-size: 9px;
      cursor: pointer;
    }
    .p5em-control-group p {
      grid-column: 1 / -1;
      margin: 0;
      color: rgba(255,255,255,0.38);
      font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      font-size: 7px;
      letter-spacing: 0.06em;
      line-height: 1.25;
      text-transform: uppercase;
    }
    .p5em-text-control {
      display: grid;
      gap: 4px;
      color: rgba(255,255,255,0.58);
      font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      font-size: 9px;
      letter-spacing: 0.12em;
      text-transform: uppercase;
    }
    .p5em-text-control input,
    .p5em-text-control select,
    .p5em-text-control textarea {
      min-width: 0;
      padding: 5px 7px;
      color: rgba(255,255,255,0.9);
      background: rgba(255,255,255,0.04);
      border: 1px solid rgba(255,255,255,0.18);
      border-radius: 0;
      font: 10px/1.35 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    }
    .p5em-text-control textarea {
      min-height: 42px;
      max-height: 58px;
      resize: vertical;
      text-transform: none;
      letter-spacing: 0.02em;
    }
    .p5em-overlay-subtabs {
      display: flex;
      gap: 6px;
      margin-top: 2px;
    }
    .p5em-overlay-subtabs button {
      padding: 6px 8px;
      color: rgba(255,255,255,0.56);
      background: rgba(255,255,255,0.025);
      border: 1px solid rgba(255,255,255,0.16);
      font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      font-size: 9px;
      letter-spacing: 0.12em;
      text-transform: uppercase;
      cursor: pointer;
    }
    .p5em-overlay-subtabs button.is-active {
      color: rgba(255,255,255,0.92);
      border-color: rgba(255,255,255,0.44);
      background: rgba(255,255,255,0.07);
    }
    .p5em-playlist-metadata-editor {
      display: grid;
      grid-template-columns: 1fr;
      gap: 6px;
      padding: 8px;
      border: 1px solid rgba(255,255,255,0.12);
      background: rgba(255,255,255,0.025);
    }
    .p5em-playlist-metadata-editor[hidden] {
      display: none;
    }
    .p5em-playlist-metadata-toolbar {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      gap: 8px;
      align-items: end;
    }
    .p5em-playlist-metadata-toolbar .p5em-button-row {
      align-self: end;
      margin: 0;
      flex-wrap: nowrap;
    }
    .p5em-playlist-metadata-summary {
      min-height: 30px;
      padding: 7px 8px;
      overflow: hidden;
      text-overflow: ellipsis;
      border: 1px solid rgba(255,255,255,0.12);
      color: rgba(255,255,255,0.62);
      font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      font-size: 9px;
      letter-spacing: 0.06em;
      line-height: 1.25;
      text-transform: uppercase;
    }
    .p5em-playlist-metadata-details {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 6px 10px;
      padding-top: 4px;
    }
    .p5em-playlist-metadata-details[hidden] {
      display: none;
    }
    .p5em-playlist-metadata-editor p {
      grid-column: 1 / -1;
      margin: 0;
      color: rgba(255,255,255,0.38);
      font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      font-size: 9px;
      letter-spacing: 0.08em;
      line-height: 1.25;
      text-transform: uppercase;
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
    .p5em-playlist-section {
      flex: 0 0 auto;
      margin-top: 12px;
      padding-top: 12px;
      border-top-color: rgba(255,255,255,0.12);
    }
    .p5em-capture-editor {
      margin-top: 10px;
      padding-top: 10px;
      flex: 1 1 auto;
      min-height: 0;
      overflow: auto;
      border-top: 1px solid rgba(255,255,255,0.14);
    }
    .p5em-capture-status-grid {
      margin: 0 0 10px;
      grid-template-columns: 1fr;
    }
    .p5em-capture-editor p {
      margin: 8px 0 0;
      color: rgba(255,255,255,0.42);
      font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      font-size: 9px;
      letter-spacing: 0.08em;
      line-height: 1.35;
      text-transform: uppercase;
    }
    .p5em-playlist-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
      flex: 0 0 auto;
    }
    .p5em-playlist-head > div {
      display: flex;
      gap: 8px;
      align-items: center;
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
      width: auto;
      min-width: 26px;
      height: 24px;
      padding: 0 10px;
      line-height: 1;
      font-size: 10px;
    }
    .p5em-playlist-options {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 7px 12px;
      flex: 0 0 auto;
      margin: 4px 0 8px;
    }
    .p5em-playlist-rows {
      flex: 0 0 auto;
      max-height: 220px;
      overflow: hidden;
      display: flex;
      flex-direction: column;
      gap: 7px;
    }
    .p5em-playlist-hash-rows {
      display: flex;
      flex-direction: column;
      gap: 7px;
      flex: 0 0 auto;
      max-height: 160px;
      overflow: auto;
    }
    .p5em-playlist-subhead {
      margin-top: 12px;
      padding-top: 10px;
      border-top: 1px solid rgba(255,255,255,0.12);
    }
    .p5em-playlist-row {
      display: grid;
      grid-template-columns: 104px minmax(0, 1fr) auto auto 26px;
      gap: 7px;
      align-items: center;
    }
    .p5em-playlist-hash-row {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto 26px;
      gap: 7px;
      align-items: center;
    }
    .p5em-specific-hash-section.is-disabled {
      opacity: 0.38;
      filter: grayscale(1);
    }
    .p5em-specific-hash-section.is-disabled .p5em-playlist-subhead {
      margin-top: 8px;
      padding-top: 8px;
    }
    .p5em-specific-hash-section.is-disabled .p5em-playlist-hash-rows {
      max-height: 0;
      overflow: hidden;
      pointer-events: none;
    }
    .p5em-specific-hash-section.is-disabled .p5em-playlist-head h2::after {
      content: " - collapsed while random hashes are on";
      color: rgba(255,255,255,0.42);
      font-weight: 400;
    }
    .p5em-playlist-row[data-kind="url"] .p5em-drop-zone {
      display: none;
    }
    .p5em-playlist-row input[type="text"],
    .p5em-playlist-hash-row input[type="text"],
    .p5em-playlist-row select {
      min-width: 0;
      padding: 7px 8px;
      color: rgba(255,255,255,0.9);
      background: rgba(255,255,255,0.04);
      border: 1px solid rgba(255,255,255,0.18);
      border-radius: 0;
      font: 10px/1.35 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    }
    .p5em-playlist-row button,
    .p5em-playlist-hash-row button {
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
    .p5em-playlist-row button:disabled,
    .p5em-playlist-hash-row button:disabled,
    .p5em-playlist-hash-row input:disabled {
      cursor: not-allowed;
      color: rgba(255,255,255,0.34);
      border-color: rgba(255,255,255,0.1);
      background: rgba(255,255,255,0.025);
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
      gap: 6px;
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
      width: 22px;
      height: 12px;
      border: 1px solid rgba(255,255,255,0.24);
      background: rgba(255,255,255,0.035);
      flex: 0 0 auto;
    }
    .p5em-toggle i::after {
      content: "";
      position: absolute;
      top: 2px;
      left: 2px;
      width: 6px;
      height: 6px;
      background: rgba(255,255,255,0.36);
      transition: transform 0.18s ease, background 0.18s ease;
    }
    .p5em-toggle input:checked + i {
      border-color: rgba(255,255,255,0.62);
      background: rgba(255,255,255,0.1);
    }
    .p5em-toggle input:checked + i::after {
      transform: translateX(10px);
      background: rgba(255,255,255,0.92);
    }
    .p5em-number-control input,
    .p5em-number-control select {
      width: 58px;
      padding: 5px 6px;
      color: rgba(255,255,255,0.9);
      background: rgba(255,255,255,0.04);
      border: 1px solid rgba(255,255,255,0.18);
      border-radius: 0;
      font: inherit;
      text-align: right;
    }
    .p5em-panel-actions button {
      padding: 6px 8px;
      font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      font-size: 9px;
      letter-spacing: 0.13em;
      text-transform: uppercase;
    }
    .p5em-panel-hint {
      margin: 6px 0 0;
      flex: 0 0 auto;
      color: rgba(255,255,255,0.42);
      font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      font-size: 9px;
      letter-spacing: 0.08em;
      text-transform: uppercase;
    }
    @media (max-width: 560px) {
      #${PANEL_ID} {
        left: 8px;
        right: 8px;
        top: 8px;
        bottom: 8px;
        width: auto;
        padding: 10px;
      }
      #${PANEL_ID}.is-dragging,
      #${PANEL_ID}[style*="left"] {
        right: auto;
        bottom: auto;
      }
      .p5em-tabs {
        gap: 5px;
        overflow-x: auto;
        padding-bottom: 2px;
      }
      .p5em-tabs button {
        flex: 0 0 auto;
        padding: 6px 8px;
        font-size: 8px;
        letter-spacing: 0.11em;
      }
      .p5em-panel-grid {
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 8px 10px;
      }
      .p5em-panel-controls {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }
      .p5em-control-group {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }
      .p5em-copy-field {
        grid-column: 1 / -1;
      }
      .p5em-panel-actions {
        overflow-x: auto;
        flex-wrap: nowrap;
        padding-bottom: 2px;
      }
      .p5em-panel-actions button {
        flex: 0 0 auto;
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

function injectChildRuntimeStyle(doc) {
  if (doc.getElementById("p5em-child-runtime-style")) return;
  const style = doc.createElement("style");
  style.id = "p5em-child-runtime-style";
  style.textContent = `
    .p5em-child-hide-cursor,
    .p5em-child-hide-cursor *,
    .p5em-child-hide-cursor canvas {
      cursor: none !important;
    }
    .p5em-child-lock-touch,
    .p5em-child-lock-touch body,
    .p5em-child-lock-touch canvas {
      touch-action: none !important;
      -webkit-touch-callout: none !important;
      -webkit-user-select: none !important;
      user-select: none !important;
    }
  `;
  doc.head?.appendChild(style);
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

function defaultPlaylistStorageKey(storageKey) {
  return `${storageKey || DEFAULTS.storageKey}-playlist-defaults`;
}

function readDefaultPlaylist(storageKey) {
  try {
    const raw = localStorage.getItem(defaultPlaylistStorageKey(storageKey));
    if (!raw) return null;
    const playlist = JSON.parse(raw);
    return playlist && typeof playlist === "object"
      ? {
        ...DEFAULTS.playlist,
        ...playlist,
        items: normalizePlaylistItems(playlist.items || []),
        hashes: normalizePlaylistHashes(playlist.hashes || []),
        itemOrder: normalizePlaylistOrder(playlist.itemOrder),
        hashOrder: normalizePlaylistOrder(playlist.hashOrder)
      }
      : null;
  } catch {
    return null;
  }
}

function writeDefaultPlaylist(storageKey, playlist) {
  try {
    localStorage.setItem(defaultPlaylistStorageKey(storageKey), JSON.stringify({
      ...DEFAULTS.playlist,
      ...(playlist || {}),
      items: normalizePlaylistItems(playlist?.items || []),
      hashes: normalizePlaylistHashes(playlist?.hashes || []),
      itemOrder: normalizePlaylistOrder(playlist?.itemOrder),
      hashOrder: normalizePlaylistOrder(playlist?.hashOrder)
    }));
  } catch {
    // Storage can be unavailable in private browsing or locked-down kiosk shells.
  }
}

function readUrlRuntimeConfig(locationLike = window.location) {
  const params = new URLSearchParams(locationLike.search || "");
  if (!Array.from(params.keys()).some((key) => key.startsWith("p5em.") || URL_PARAM_ALIASES.has(key))) return null;
  const next = {};
  const playlist = {};
  const accessibility = {};
  const watchdog = {};

  assignStringParam(params, next, "title", "title");
  assignStringParam(params, next, "artist", "artist");
  assignStringParam(params, next, "year", "year");
  assignBooleanParam(params, next, "ui", "panel");
  assignBooleanParam(params, next, "panel", "panel");
  assignBooleanParam(params, next, "fullscreen", "fullscreen");
  assignBooleanParam(params, next, "kiosk", "kiosk");
  assignBooleanParam(params, next, "context", "disableContextMenu");
  assignBooleanParam(params, next, "touch", "disableTouchGestures");
  assignBooleanParam(params, next, "scroll", "preventScroll");
  assignBooleanParam(params, next, "cursor", "hideCursor");
  assignStringParam(params, next, "cursorMode", "hideCursorMode");
  assignNumberParam(params, next, "cursorIdle", "cursorIdleMs");
  assignNumberParam(params, next, "dpr", "maxPixelRatio");
  assignNumberParam(params, next, "rotation", "rotation");
  assignBooleanParam(params, next, "refreshOnRotation", "refreshOnRotation");
  assignBooleanParam(params, next, "showTitle", "showTitleOverlay");
  assignStringParam(params, next, "titleFont", "titleOverlayFont");
  assignStringParam(params, next, "titleColor", "titleOverlayColor");
  assignStringParam(params, next, "titlePosition", "titleOverlayPosition");
  assignNumberParam(params, next, "titleSize", "titleOverlaySize");
  assignBooleanParam(params, next, "titleBold", "titleOverlayBold");
  assignBooleanParam(params, next, "titleItalic", "titleOverlayItalic");
  assignStringParam(params, next, "text", "freeText");
  assignStringParam(params, next, "freeText", "freeText");
  assignBooleanParam(params, next, "showText", "showFreeText");
  assignStringParam(params, next, "textPosition", "freeTextPosition");
  assignNumberParam(params, next, "textSize", "freeTextSize");
  assignBooleanParam(params, next, "showHash", "showHashOverlay");
  assignBooleanParam(params, next, "showHashOverlay", "showHashOverlay");
  assignStringParam(params, next, "hashPosition", "hashOverlayPosition");
  assignNumberParam(params, next, "hashSafeArea", "hashOverlaySafeArea");
  assignNumberParam(params, next, "hashSize", "hashOverlaySize");
  assignStringParam(params, next, "hashColor", "hashOverlayColor");
  assignStringParam(params, next, "layout", "overlayLayout");
  assignStringParam(params, next, "cardQr", "cardQrPlacement");
  assignNumberParam(params, next, "safeArea", "overlaySafeArea");
  assignStringParam(params, next, "qr", "qrLink");
  assignBooleanParam(params, next, "showQr", "showQr");
  assignStringParam(params, next, "qrPosition", "qrPosition");
  assignNumberParam(params, next, "qrSize", "qrSize");
  assignCustomUrlParamsParam(params, next, "artworkParams", "customUrlParams");
  assignCustomUrlParamsParam(params, next, "customParams", "customUrlParams");
  assignStringParam(params, next, "seed", "seed");
  assignBooleanParam(params, next, "monitor", "monitor");
  assignBooleanParam(params, accessibility, "reducedMotion", "reducedMotion");
  assignBooleanParam(params, accessibility, "highContrast", "highContrast");
  assignBooleanParam(params, watchdog, "watchdog", "enabled");
  assignNumberParam(params, watchdog, "watchdogFps", "minFps");
  assignNumberParam(params, watchdog, "watchdogSeconds", "seconds");
  assignBooleanParam(params, watchdog, "watchdogReload", "reload");

  assignBooleanParam(params, playlist, "playlistEnabled", "enabled");
  assignStringListParam(params, playlist, "urls", "items");
  assignStringListParam(params, playlist, "playlist", "items");
  assignStringParam(params, playlist, "playlistOrder", "itemOrder");
  assignNumberParam(params, playlist, "playlistInterval", "intervalValue");
  assignStringParam(params, playlist, "playlistUnit", "intervalUnit");
  assignStringListParam(params, playlist, "hashes", "hashes");
  assignStringParam(params, playlist, "hashOrder", "hashOrder");
  assignBooleanParam(params, playlist, "randomHash", "randomHash");
  assignNumberParam(params, playlist, "hashInterval", "hashIntervalValue");
  assignStringParam(params, playlist, "hashUnit", "hashIntervalUnit");
  assignStringParam(params, playlist, "hashParam", "hashParam");
  assignNumberParam(params, playlist, "startIndex", "startIndex");
  assignNumberParam(params, playlist, "startHashIndex", "startHashIndex");

  if (Object.keys(accessibility).length) next.accessibility = accessibility;
  if (Object.keys(watchdog).length) next.watchdog = watchdog;
  if (Object.keys(playlist).length) {
    if (playlist.intervalValue !== undefined && playlist.intervalUnit) playlist.intervalSeconds = intervalToSeconds(playlist.intervalValue, playlist.intervalUnit);
    if (playlist.hashIntervalValue !== undefined && playlist.hashIntervalUnit) playlist.hashIntervalSeconds = intervalToSeconds(playlist.hashIntervalValue, playlist.hashIntervalUnit);
    next.playlist = playlist;
  }
  return Object.keys(next).length ? next : null;
}

const URL_PARAM_ALIASES = new Set([
  "artist", "artworkParams", "cardQr", "context", "cursor", "cursorIdle", "cursorMode", "customParams", "dpr", "freeText", "fullscreen",
  "hashColor", "hashes", "hashInterval", "hashOrder", "hashParam", "hashPosition", "hashSafeArea", "hashSize", "hashUnit", "highContrast", "kiosk", "layout", "monitor", "panel",
  "playlist", "playlistEnabled", "playlistInterval", "playlistOrder", "playlistUnit", "qr", "qrPosition", "qrSize",
  "randomHash", "reducedMotion", "refreshOnRotation", "rotation", "safeArea", "scroll", "seed",
  "showHash", "showHashOverlay", "showQr", "showText", "showTitle", "startHashIndex", "startIndex", "text", "textPosition", "textSize", "title",
  "titleBold", "titleColor", "titleFont", "titleItalic", "titlePosition", "titleSize", "touch", "ui", "urls",
  "watchdog", "watchdogFps", "watchdogReload", "watchdogSeconds", "year"
]);

function paramValue(params, name) {
  return params.get(name) ?? params.get(`p5em.${name}`);
}

function assignStringParam(params, target, name, key) {
  const value = paramValue(params, name);
  if (value !== null) target[key] = value;
}

function assignNumberParam(params, target, name, key) {
  const value = paramValue(params, name);
  if (value === null) return;
  const number = Number(value);
  if (Number.isFinite(number)) target[key] = number;
}

function assignBooleanParam(params, target, name, key) {
  const value = paramValue(params, name);
  if (value === null) return;
  target[key] = parseBooleanParam(value);
}

function assignStringListParam(params, target, name, key) {
  const value = paramValue(params, name);
  if (value === null) return;
  target[key] = value.split(/[|\n,]/).map((item) => item.trim()).filter(Boolean);
}

function assignCustomUrlParamsParam(params, target, name, key) {
  const value = paramValue(params, name);
  if (value === null) return;
  target[key] = normalizeCustomUrlParams(value);
}

function parseBooleanParam(value) {
  const text = String(value || "").trim().toLowerCase();
  if (["0", "false", "off", "no", "disabled"].includes(text)) return false;
  return true;
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
    capture: { ...(base.capture || {}), ...(next.capture || {}) },
    localFiles: { ...(base.localFiles || {}), ...(next.localFiles || {}) },
    ui: { ...(base.ui || {}), ...(next.ui || {}) },
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
    titleOverlayItalic: Boolean(config.titleOverlayItalic),
    freeText: config.freeText,
    showFreeText: config.showFreeText,
    freeTextPosition: config.freeTextPosition,
    freeTextSize: config.freeTextSize,
    showHashOverlay: config.showHashOverlay,
    hashOverlayPosition: config.hashOverlayPosition,
    hashOverlaySafeArea: config.hashOverlaySafeArea,
    hashOverlaySize: config.hashOverlaySize,
    hashOverlayColor: config.hashOverlayColor,
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
    capture: { ...config.capture },
    localFiles: { ...config.localFiles },
    ui: { ...config.ui },
    customUrlParams: normalizeCustomUrlParams(config.customUrlParams),
    urlParams: config.urlParams,
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
  const parts = formatTitleOverlayParts(config);
  return parts.meta ? `${parts.title} by ${parts.meta}` : parts.title;
}

function formatTitleOverlayParts(config) {
  const title = config.title || "Artwork Title";
  const artist = config.artist || "Artist Name";
  const year = config.year ? `, ${config.year}` : "";
  return { title, meta: `${artist}${year}` };
}

function metadataValue(value, fallback = "") {
  const text = String(value ?? "").trim();
  return text || fallback || "";
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

function hashPositionOptions(selected = "bottom-left") {
  return [
    ["bottom-left", "Bottom Left"],
    ["bottom-right", "Bottom Right"]
  ].map(([value, label]) => `<option value="${value}"${normalizeHashOverlayPosition(selected) === value ? " selected" : ""}>${label}</option>`).join("");
}

function hashColorOptions(selected = "white") {
  return [
    ["white", "White"],
    ["black", "Black"]
  ].map(([value, label]) => `<option value="${value}"${normalizeHashOverlayColor(selected) === value ? " selected" : ""}>${label}</option>`).join("");
}

function overlayLayoutOptions(selected = "separate") {
  return [
    ["separate", "Floating"],
    ["card", "Card"]
  ].map(([value, label]) => `<option value="${value}"${normalizeOverlayLayout(selected) === value ? " selected" : ""}>${label}</option>`).join("");
}

function cardQrPlacementOptions(selected = "below") {
  return [
    ["below", "Below Title"],
    ["above", "Above Title"],
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
  if (value === "left" || value === "right" || value === "above") return value;
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

function normalizeHashOverlayPosition(value) {
  return value === "bottom-right" ? "bottom-right" : "bottom-left";
}

function normalizeHashOverlaySafeArea(value) {
  return clamp(Number(value) || 0, 0, 240);
}

function normalizeHashOverlaySize(value) {
  return clamp(Number(value) || DEFAULTS.hashOverlaySize, 7, 24);
}

function normalizeHashOverlayColor(value) {
  return value === "black" ? "black" : "white";
}

function captureHashColor(value) {
  return normalizeHashOverlayColor(value) === "black" ? "rgba(0, 0, 0, 0.78)" : "rgba(255, 255, 255, 0.72)";
}

function normalizeTitleOverlaySize(value) {
  return clamp(Number(value) || DEFAULTS.titleOverlaySize, 8, 96);
}

function buildQrUrl(link, size, provider = DEFAULTS.qrProvider) {
  const url = new URL(provider);
  url.searchParams.set("size", `${size}x${size}`);
  url.searchParams.set("data", link);
  return url.toString();
}

function findArtworkCanvas() {
  const localCanvas = findCanvasInDocument(document);
  if (localCanvas) return localCanvas;
  const frame = document.querySelector(".p5em-playlist-frame");
  if (!frame || frame.hidden) return null;
  try {
    return findCanvasInDocument(frame.contentDocument || frame.contentWindow?.document);
  } catch {
    return null;
  }
}

function findCanvasInDocument(doc) {
  if (!doc) return null;
  const canvases = Array.from(doc.querySelectorAll("canvas"));
  return canvases.find((canvas) => isCapturableCanvas(canvas, doc)) || null;
}

function isCapturableCanvas(canvas, doc = canvas?.ownerDocument) {
  if (!canvas || canvas.id === "p5em-capture-canvas") return false;
  if (!canvas.isConnected) return false;
  if (canvas.closest(`#${PANEL_ID}`)) return false;
  const rect = canvas.getBoundingClientRect();
  const style = doc?.defaultView?.getComputedStyle(canvas) || window.getComputedStyle(canvas);
  return rect.width > 2 && rect.height > 2 && style.display !== "none" && style.visibility !== "hidden" && style.opacity !== "0";
}

function capturePosition(position, width, height, frameWidth, frameHeight) {
  const safe = normalizeOverlaySafeArea(DEFAULTS.overlaySafeArea);
  const configuredSafe = Number(document.documentElement.style.getPropertyValue("--p5em-overlay-safe-area").replace("px", ""));
  const inset = Number.isFinite(configuredSafe) ? configuredSafe : safe;
  let x = inset;
  let y = inset;
  if (position.endsWith("center")) x = (frameWidth - width) / 2;
  if (position.endsWith("right")) x = frameWidth - width - inset;
  if (position.startsWith("bottom")) y = frameHeight - height - inset;
  return [Math.max(inset, x), Math.max(inset, y)];
}

function captureHashPosition(position, width, height, frameWidth, frameHeight, inset) {
  const safe = normalizeHashOverlaySafeArea(inset);
  const x = position.endsWith("right") ? frameWidth - width - safe : safe;
  const y = frameHeight - height - safe;
  return [Math.max(safe, x), Math.max(safe, y)];
}

function captureTextColor(value) {
  if (value === "black") return "#050505";
  if (value === "gray") return "#9c9c9c";
  return "#f4f4f0";
}

function captureFontFamily(value) {
  const font = normalizeTitleFont(value);
  if (font === "serif") return 'Georgia, "Times New Roman", serif';
  if (font === "editorial") return 'Didot, "Bodoni 72", "Bodoni MT", Georgia, serif';
  if (font === "classic") return 'Garamond, "Times New Roman", serif';
  if (font === "book") return 'Palatino, "Palatino Linotype", "Book Antiqua", serif';
  if (font === "humanist") return '"Gill Sans", "Avenir Next", Avenir, sans-serif';
  if (font === "neo") return 'Helvetica, Arial, sans-serif';
  if (font === "geometric") return 'Futura, "Avenir Next", Avenir, sans-serif';
  if (font === "architectural") return '"Arial Narrow", "Helvetica Neue", Arial, sans-serif';
  if (font === "condensed") return '"Arial Narrow", "Roboto Condensed", sans-serif';
  if (font === "typewriter") return '"Courier Prime", "Courier New", monospace';
  if (font === "sans" || font === "system") return 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
  return '"SFMono-Regular", Consolas, "Liberation Mono", monospace';
}

function wrapCaptureText(ctx, text, maxWidth) {
  const lines = [];
  String(text || "").split(/\r?\n/).forEach((rawLine) => {
    const words = rawLine.split(/[ \t]+/).filter(Boolean);
    if (!words.length) {
      lines.push("");
      return;
    }
    let line = "";
    words.forEach((word) => {
      const next = line ? `${line} ${word}` : word;
      if (line && ctx.measureText(next).width > maxWidth) {
        lines.push(line);
        line = word;
      } else {
        line = next;
      }
    });
    if (line) lines.push(line);
  });
  return lines.length ? lines : [""];
}

function drawWrappedCaptureText(ctx, text, x, y, maxWidth, lineHeight) {
  wrapCaptureText(ctx, text, maxWidth).forEach((line, index) => {
    ctx.fillText(line, x, y + index * lineHeight);
  });
}

function waitForVideoFrame(video, timeoutMs = 1000) {
  if (!video) return Promise.resolve();
  if (typeof video.requestVideoFrameCallback === "function") {
    return new Promise((resolve) => {
      const timer = setTimeout(resolve, timeoutMs);
      video.requestVideoFrameCallback(() => {
        clearTimeout(timer);
        resolve();
      });
    });
  }
  if (video.readyState >= 2) return Promise.resolve();
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, timeoutMs);
    video.addEventListener("loadeddata", () => {
      clearTimeout(timer);
      resolve();
    }, { once: true });
  });
}

function readUrlHash(url, hashParam = "hash") {
  if (!url) return "";
  return url.searchParams.get(hashParam) || "";
}

function currentDisplayHash() {
  return String(window.__p5emCurrentHash || document.documentElement.dataset.p5emHash || "").trim()
    || String(window.tokenData?.hash || window.fxhash || "").trim();
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

function formatLogArg(value) {
  if (typeof value === "string") return value;
  if (value instanceof Error) return value.stack || value.message;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function safeName(name) {
  return String(name || "artwork").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function resolveCaptureMimeType(codec = "auto") {
  if (typeof MediaRecorder === "undefined" || typeof MediaRecorder.isTypeSupported !== "function") return "";
  const candidates = captureMimeCandidates(codec);
  return candidates.find((candidate) => MediaRecorder.isTypeSupported(candidate)) || "";
}

function captureMimeCandidates(codec = "auto") {
  const h264 = [
    "video/mp4;codecs=avc1.42E01E",
    "video/mp4;codecs=h264",
    "video/mp4"
  ];
  const vp9 = [
    "video/webm;codecs=vp9",
    "video/webm;codecs=vp9,opus"
  ];
  const vp8 = [
    "video/webm;codecs=vp8",
    "video/webm;codecs=vp8,opus"
  ];
  const webm = ["video/webm"];
  if (codec === "h264" || codec === "mp4") return h264;
  if (codec === "vp9") return vp9;
  if (codec === "vp8") return vp8;
  if (codec === "webm") return webm;
  if (codec === "default") return [];
  return [...webm, ...vp9, ...vp8, ...h264];
}

function captureFilename(name, mimeType = "video/webm") {
  const base = safeName(name || DEFAULTS.capture.filename) || DEFAULTS.capture.filename;
  const extension = /mp4/i.test(mimeType) ? "mp4" : "webm";
  return base.endsWith(`.${extension}`) ? base : `${base}.${extension}`;
}

function isUnsafeCaptureDirectoryName(name) {
  return String(name || "").trim().toLowerCase() === "desktop";
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
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

function buildPlaylistUrl(input, playlist, explicitHash = "") {
  const item = typeof input === "string" ? { url: input } : input;
  let url = applyCustomUrlParams(item.url || "", playlist.customUrlParams);
  const randomHash = item.randomHash ?? playlist.randomHash;
  const hashParam = item.hashParam || playlist.hashParam || "hash";
  const value = normalizePlaylistHash(explicitHash) || (randomHash ? randomHashValue() : "");
  if (!value) return url;

  return applyCustomUrlParams(url, [{ name: hashParam, value }]);
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
      if (item && typeof item === "object" && item.url && !isTemporaryBlobUrl(item.url)) {
        const normalized = {
          ...item,
          url: String(item.url || "").trim(),
          title: String(item.title || "").trim(),
          artist: String(item.artist || "").trim(),
          year: String(item.year || "").trim(),
          freeText: String(item.freeText || "")
        };
        Object.keys(normalized).forEach((key) => {
          if (key !== "url" && (normalized[key] === "" || normalized[key] === undefined || normalized[key] === null)) delete normalized[key];
        });
        return normalized;
      }
      return null;
    })
    .filter(Boolean);
}

function normalizeCustomUrlParams(params) {
  if (typeof params === "string") {
    return params.split(/[|\n,]/).map((line) => line.trim()).filter(Boolean).map((line) => {
      const [name, ...rest] = line.split("=");
      return { name, value: rest.join("=") };
    }).filter((param) => normalizeUrlParamName(param.name));
  }
  if (!Array.isArray(params)) return [];
  return params
    .map((param) => {
      if (Array.isArray(param)) return { name: normalizeUrlParamName(param[0]), value: normalizeUrlParamValue(param[1]) };
      if (param && typeof param === "object") return { name: normalizeUrlParamName(param.name), value: normalizeUrlParamValue(param.value) };
      return null;
    })
    .filter((param) => param?.name);
}

function normalizeUrlParamName(value) {
  return String(value || "").trim().replace(/^[?&]+/, "");
}

function normalizeUrlParamValue(value) {
  return String(value ?? "").trim();
}

function applyCustomUrlParams(url, params) {
  const entries = normalizeCustomUrlParams(params);
  if (!entries.length) return url;
  const [baseWithQuery, fragment] = String(url || "").split("#");
  const [base, query = ""] = baseWithQuery.split("?");
  const search = new URLSearchParams(query);
  entries.forEach(({ name, value }) => {
    if (name) search.set(name, value);
  });
  const nextBase = search.toString() ? `${base}?${search.toString()}` : base;
  return fragment === undefined ? nextBase : `${nextBase}#${fragment}`;
}

function normalizePlaylistHashes(hashes) {
  const list = typeof hashes === "string" ? parsePlaylistText(hashes) : hashes;
  if (!Array.isArray(list)) return [];
  return list
    .map((hash) => normalizePlaylistHash(hash))
    .filter(Boolean);
}

function normalizePlaylistHash(value) {
  const hash = String(value || "").trim();
  if (!hash) return "";
  if (/^[0-9a-fA-F]{64}$/.test(hash)) return `0x${hash.toLowerCase()}`;
  if (/^0x[0-9a-fA-F]{40,64}$/.test(hash)) return hash.toLowerCase().padEnd(66, "0");
  return hash;
}

function normalizePlaylistOrder(value) {
  return value === "random" ? "random" : "loop";
}

function nextOrderedIndex(current, count, order = "loop") {
  if (count <= 1) return 0;
  if (normalizePlaylistOrder(order) === "random") {
    const next = Math.floor(Math.random() * count);
    return next === current ? (next + 1) % count : next;
  }
  return (current + 1) % count;
}

function isTemporaryBlobUrl(value) {
  const text = String(value || "").trim();
  return /^blob:/i.test(text) || /^\[temporary preview\]/i.test(text);
}

function randomHashValue() {
  const bytes = new Uint32Array(8);
  crypto.getRandomValues(bytes);
  return `0x${Array.from(bytes, (value) => value.toString(16).padStart(8, "0")).join("")}`;
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
