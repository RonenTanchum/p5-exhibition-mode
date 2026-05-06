export type ExhibitionModeOptions = {
  title?: string;
  artist?: string;
  year?: string | number;
  showTitleOverlay?: boolean;
  titleOverlayFont?: ExhibitionTitleOverlayFont;
  titleOverlayColor?: "white" | "gray" | "black";
  titleOverlayPosition?: ExhibitionOverlayPosition;
  titleOverlaySize?: number;
  titleOverlayBold?: boolean;
  titleOverlayItalic?: boolean;
  freeText?: string;
  showFreeText?: boolean;
  freeTextPosition?: ExhibitionOverlayPosition;
  freeTextSize?: number;
  showHashOverlay?: boolean;
  hashOverlayPosition?: ExhibitionHashOverlayPosition;
  hashOverlaySafeArea?: number;
  hashOverlaySize?: number;
  hashOverlayColor?: ExhibitionHashOverlayColor;
  overlayLayout?: ExhibitionOverlayLayout;
  cardQrPlacement?: ExhibitionCardQrPlacement;
  overlaySafeArea?: number;
  qrLink?: string;
  showQr?: boolean;
  qrPosition?: ExhibitionOverlayPosition;
  qrSize?: number;
  qrProvider?: string;
  seed?: string | number | null;
  fullscreen?: boolean;
  kiosk?: boolean;
  disableContextMenu?: boolean;
  disableTouchGestures?: boolean;
  preventScroll?: boolean;
  hideCursor?: boolean;
  hideCursorMode?: "always" | "idle";
  cursorIdleMs?: number;
  idleReset?: number | false;
  maxPixelRatio?: number | false;
  monitor?: boolean;
  panel?: boolean;
  panelKey?: string;
  rotation?: 0 | 90 | 180 | 270;
  refreshOnRotation?: boolean;
  accessibility?: ExhibitionAccessibilityOptions;
  watchdog?: ExhibitionWatchdogOptions;
  logging?: ExhibitionLoggingOptions;
  healthCheck?: ExhibitionHealthCheckOptions;
  capture?: ExhibitionCaptureOptions;
  localFiles?: ExhibitionLocalFilesOptions;
  ui?: ExhibitionUiOptions;
  customUrlParams?: ExhibitionCustomUrlParam[];
  urlParams?: boolean;
  playlist?: ExhibitionPlaylistOptions | Array<string | ExhibitionPlaylistItem>;
  persist?: boolean;
  storageKey?: string;
  target?: HTMLElement | Document;
  onReset?: () => void;
  onScreenshot?: (dataUrl: string) => void;
  onDiagnostics?: (diagnostics: ExhibitionDiagnostics) => void;
};

export type ExhibitionInputLockOptions = {
  contextMenu?: boolean;
  touchGestures?: boolean;
  scroll?: boolean;
};

export type ExhibitionCursorOptions = {
  hide?: boolean;
  mode?: "always" | "idle";
  idleMs?: number;
};

export type ExhibitionArtworkMetadataOptions = {
  title?: string;
  artist?: string;
  year?: string | number;
  showTitleOverlay?: boolean;
  titleOverlayFont?: ExhibitionTitleOverlayFont;
  titleOverlayColor?: "white" | "gray" | "black";
  titleOverlayPosition?: ExhibitionOverlayPosition;
  titleOverlaySize?: number;
  titleOverlayBold?: boolean;
  titleOverlayItalic?: boolean;
  freeText?: string;
  showFreeText?: boolean;
  freeTextPosition?: ExhibitionOverlayPosition;
  freeTextSize?: number;
  showHashOverlay?: boolean;
  hashOverlayPosition?: ExhibitionHashOverlayPosition;
  hashOverlaySafeArea?: number;
  hashOverlaySize?: number;
  hashOverlayColor?: ExhibitionHashOverlayColor;
  overlayLayout?: ExhibitionOverlayLayout;
  cardQrPlacement?: ExhibitionCardQrPlacement;
  overlaySafeArea?: number;
};

export type ExhibitionOverlayLayout = "separate" | "card";
export type ExhibitionCardQrPlacement = "below" | "above" | "right" | "left";
export type ExhibitionHashOverlayPosition = "bottom-left" | "bottom-right";
export type ExhibitionHashOverlayColor = "white" | "black";

export type ExhibitionTitleOverlayFont =
  | "mono"
  | "sans"
  | "system"
  | "serif"
  | "editorial"
  | "classic"
  | "book"
  | "humanist"
  | "neo"
  | "geometric"
  | "architectural"
  | "condensed"
  | "typewriter";

export type ExhibitionOverlayPosition =
  | "top-left"
  | "top-center"
  | "top-right"
  | "bottom-left"
  | "bottom-center"
  | "bottom-right";

export type ExhibitionQrOptions = {
  qrLink?: string;
  showQr?: boolean;
  qrPosition?: ExhibitionOverlayPosition;
  qrSize?: number;
  qrProvider?: string;
  overlayLayout?: ExhibitionOverlayLayout;
  cardQrPlacement?: ExhibitionCardQrPlacement;
  overlaySafeArea?: number;
};

export type ExhibitionAccessibilityOptions = {
  reducedMotion?: boolean;
  highContrast?: boolean;
};

export type ExhibitionWatchdogOptions = {
  enabled?: boolean;
  minFps?: number;
  seconds?: number;
  reload?: boolean;
};

export type ExhibitionLoggingOptions = {
  enabled?: boolean;
  maxEntries?: number;
};

export type ExhibitionHealthCheckOptions = {
  enabled?: boolean;
  url?: string;
  intervalSeconds?: number;
};

export type ExhibitionCaptureOptions = {
  filename?: string;
  source?: "auto" | "canvas";
  codec?: "auto" | "h264" | "vp9" | "vp8" | "webm" | "default" | string;
  videoBitsPerSecond?: number;
  frameRate?: number;
  includeAudio?: boolean;
  hidePanelDuringCapture?: boolean;
};

export type ExhibitionLocalFilesOptions = {
  endpoint?: string;
  absolutePrefix?: string;
  urlMirrorRoot?: string;
  fallbackFilePreview?: boolean;
};

export type ExhibitionUiOptions = {
  activeTab?: "runtime" | "overlay" | "playlist" | "capture" | "log";
  panelBounds?: {
    left?: number;
    top?: number;
    width?: number;
    height?: number;
  } | null;
};

export type ExhibitionPlaylistItem = {
  url: string;
  title?: string;
  artist?: string;
  year?: string | number;
  freeText?: string;
  randomHash?: boolean;
  hashParam?: string;
};

export type ExhibitionPlaylistOptions = {
  enabled?: boolean;
  items?: Array<string | ExhibitionPlaylistItem>;
  itemOrder?: ExhibitionPlaylistOrder;
  intervalValue?: number;
  intervalSeconds?: number;
  intervalUnit?: "seconds" | "minutes" | "hours";
  hashes?: string[];
  hashOrder?: ExhibitionPlaylistOrder;
  hashIntervalValue?: number;
  hashIntervalSeconds?: number;
  hashIntervalUnit?: "seconds" | "minutes" | "hours";
  randomHash?: boolean;
  hashParam?: string;
  startIndex?: number;
  startHashIndex?: number;
};

export type ExhibitionPlaylistOrder = "loop" | "random";

export type ExhibitionCustomUrlParam = {
  name: string;
  value?: string | number | boolean;
};

export type ExhibitionLogEntry = {
  time: string;
  level: "info" | "warn" | "error" | string;
  message: string;
  detail?: unknown;
};

export type ExhibitionDiagnostics = {
  title: string;
  artist: string;
  year: string | number;
  titleOverlayVisible: boolean;
  titleOverlayFont: ExhibitionTitleOverlayFont;
  titleOverlayColor: "white" | "gray" | "black";
  titleOverlayPosition: ExhibitionOverlayPosition;
  titleOverlaySize: number;
  titleOverlayBold: boolean;
  titleOverlayItalic: boolean;
  freeText: string;
  freeTextVisible: boolean;
  freeTextPosition: ExhibitionOverlayPosition;
  freeTextSize: number;
  hashOverlayVisible: boolean;
  hashOverlayPosition: ExhibitionHashOverlayPosition;
  hashOverlaySafeArea: number;
  hashOverlaySize: number;
  hashOverlayColor: ExhibitionHashOverlayColor;
  overlayLayout: ExhibitionOverlayLayout;
  cardQrPlacement: ExhibitionCardQrPlacement;
  overlaySafeArea: number;
  qrLink: string;
  qrVisible: boolean;
  qrPosition: ExhibitionOverlayPosition;
  qrSize: number;
  currentHash: string;
  currentSource: string;
  hashRecording: boolean;
  hashRecordCount: number;
  customUrlParams: ExhibitionCustomUrlParam[];
  seed: string | number | null;
  uptimeSeconds: number;
  fps: number;
  width: number;
  height: number;
  devicePixelRatio: number;
  fullscreen: boolean;
  rotation: 0 | 90 | 180 | 270;
  contextMenuLocked: boolean;
  touchGesturesLocked: boolean;
  cursorHiddenEnabled: boolean;
  reducedMotion: boolean;
  highContrast: boolean;
  watchdogEnabled: boolean;
  droppedFrames: number;
  logs: ExhibitionLogEntry[];
  logCount: number;
  captureRecording: boolean;
  captureStatus: string;
  captureDurationSeconds: number;
  captureMimeType: string;
  playlistEnabled: boolean;
  playlistIndex: number;
  playlistCount: number;
  playlistHashIndex: number;
  playlistHashCount: number;
  playlistIntervalSeconds: number;
  playlistIntervalUnit: "seconds" | "minutes" | "hours";
  playlistHashIntervalSeconds: number;
  playlistHashIntervalUnit: "seconds" | "minutes" | "hours";
  playlistRandomHash: boolean;
  reloadCount: number;
  memoryMB: number | null;
};

export type ExhibitionMode = {
  setup: () => ExhibitionMode;
  tick: () => ExhibitionMode;
  destroy: () => void;
  reset: () => void;
  togglePanel: (force?: boolean) => void;
  enterFullscreen: () => Promise<void>;
  exitFullscreen: () => Promise<void>;
  screenshot: () => string | null;
  diagnostics: () => ExhibitionDiagnostics;
  applyPixelRatio: (p5Instance?: unknown) => number;
  setOption: (key: keyof ExhibitionModeOptions, value: unknown) => ExhibitionMode;
  setRotation: (degrees: 0 | 90 | 180 | 270 | number | string) => ExhibitionMode;
  setAccessibility: (options: ExhibitionAccessibilityOptions) => ExhibitionMode;
  setFullscreen: (value: boolean) => ExhibitionMode;
  setKiosk: (value: boolean) => ExhibitionMode;
  setInputLocks: (options: ExhibitionInputLockOptions) => ExhibitionMode;
  setCursor: (options: boolean | ExhibitionCursorOptions) => ExhibitionMode;
  setWatchdog: (options: ExhibitionWatchdogOptions) => ExhibitionMode;
  setHealthCheck: (options: ExhibitionHealthCheckOptions) => ExhibitionMode;
  setArtworkMetadata: (options: ExhibitionArtworkMetadataOptions) => ExhibitionMode;
  setQrOptions: (options: ExhibitionQrOptions) => ExhibitionMode;
  setOverlaySafeArea: (pixels: number | string) => ExhibitionMode;
  setOverlayLayout: (layout: ExhibitionOverlayLayout | string) => ExhibitionMode;
  startHashRecording: () => ExhibitionMode;
  stopHashRecording: () => ExhibitionMode;
  clearHashRecording: () => ExhibitionMode;
  exportHashRecording: () => { title: string; artist: string; year: string | number; exportedAt: string; records: unknown[] };
  refreshArtwork: (reason?: string) => ExhibitionMode;
  togglePlaylist: (force?: boolean) => ExhibitionMode;
  nextPlaylistItem: () => string | null;
  previousPlaylistItem: () => string | null;
  setPlaylistInterval: (seconds: number | string) => ExhibitionMode;
  setPlaylistIntervalParts: (value: number | string, unit: "seconds" | "minutes" | "hours") => ExhibitionMode;
  setPlaylistHashIntervalParts: (value: number | string, unit: "seconds" | "minutes" | "hours") => ExhibitionMode;
  setPlaylistRandomHash: (value: boolean) => ExhibitionMode;
  setPlaylistOptions: (options: ExhibitionPlaylistOptions) => ExhibitionMode;
  setPlaylistItems: (items: string | Array<string | ExhibitionPlaylistItem>) => ExhibitionMode;
  setPlaylistItemMetadata: (index: number, metadata: Pick<ExhibitionPlaylistItem, "title" | "artist" | "year" | "freeText">) => ExhibitionMode;
  setPlaylistHashes: (hashes: string | string[]) => ExhibitionMode;
  setCustomUrlParams: (params: ExhibitionCustomUrlParam[]) => ExhibitionMode;
  restoreDefaultPlaylist: () => ExhibitionMode;
  saveDefaultPlaylist: () => ExhibitionMode;
  loadLocalFolderPlaylist: (rootPath?: string) => Promise<ExhibitionMode>;
  loadServedPlaylist: (rootPath?: string) => Promise<ExhibitionMode>;
  previewPlaylistUrl: (url: string) => string | null;
  clearLogs: () => ExhibitionMode;
  startCapture: (options?: ExhibitionCaptureOptions) => Promise<ExhibitionMode>;
  stopCapture: () => ExhibitionMode;
  chooseCaptureFolder: () => Promise<ExhibitionMode>;
  setCaptureOptions: (options: ExhibitionCaptureOptions) => ExhibitionMode;
  getConfig: () => Partial<ExhibitionModeOptions>;
  loadConfig: (config: Partial<ExhibitionModeOptions>) => ExhibitionMode;
  saveConfig: () => Partial<ExhibitionModeOptions>;
  exportConfig: () => Partial<ExhibitionModeOptions>;
};

export function createExhibitionMode(options?: ExhibitionModeOptions): ExhibitionMode;

export type SensorBridgeSource =
  | { type: "websocket"; url: string; map?: (data: unknown) => Record<string, number> }
  | { type: "json"; url: string; intervalSeconds?: number; map?: (data: unknown) => Record<string, number> }
  | { type: "manual"; values?: Record<string, number> };

export type SensorBridge = {
  start: () => SensorBridge;
  stop: () => void;
  set: (key: string, value: number) => SensorBridge;
  get: (key: string, fallback?: number) => number;
  values: () => Record<string, number>;
  uniforms: () => Record<string, number>;
};

export function createSensorBridge(source?: SensorBridgeSource): SensorBridge;
