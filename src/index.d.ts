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
  target?: HTMLElement | Document;
  onReset?: () => void;
  onScreenshot?: (dataUrl: string) => void;
  onDiagnostics?: (diagnostics: ExhibitionDiagnostics) => void;
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
  contextMenuLocked: boolean;
  touchGesturesLocked: boolean;
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
};

export function createExhibitionMode(options?: ExhibitionModeOptions): ExhibitionMode;
