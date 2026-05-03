export type ExhibitionModeOptions = {
  title?: string;
  artist?: string;
  seed?: string | number | null;
  fullscreen?: boolean;
  disableContextMenu?: boolean;
  disableTouchGestures?: boolean;
  preventScroll?: boolean;
  hideCursor?: boolean;
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
  playlist?: ExhibitionPlaylistOptions | Array<string | ExhibitionPlaylistItem>;
  target?: HTMLElement | Document;
  onReset?: () => void;
  onScreenshot?: (dataUrl: string) => void;
  onDiagnostics?: (diagnostics: ExhibitionDiagnostics) => void;
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

export type ExhibitionPlaylistItem = {
  url: string;
  randomHash?: boolean;
  hashParam?: string;
};

export type ExhibitionPlaylistOptions = {
  enabled?: boolean;
  items?: Array<string | ExhibitionPlaylistItem>;
  intervalSeconds?: number;
  randomHash?: boolean;
  hashParam?: string;
  startIndex?: number;
};

export type ExhibitionDiagnostics = {
  title: string;
  artist: string;
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
  logCount: number;
  playlistEnabled: boolean;
  playlistIndex: number;
  playlistCount: number;
  playlistIntervalSeconds: number;
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
  refreshArtwork: (reason?: string) => ExhibitionMode;
  togglePlaylist: (force?: boolean) => ExhibitionMode;
  nextPlaylistItem: () => string | null;
  previousPlaylistItem: () => string | null;
  setPlaylistInterval: (seconds: number | string) => ExhibitionMode;
  setPlaylistRandomHash: (value: boolean) => ExhibitionMode;
  setPlaylistItems: (items: string | Array<string | ExhibitionPlaylistItem>) => ExhibitionMode;
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
