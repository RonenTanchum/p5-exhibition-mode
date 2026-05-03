export function createSensorBridge(source = { type: "manual", values: {} }) {
  const state = {
    source,
    values: { ...(source.values || {}) },
    timer: null,
    socket: null
  };

  function start() {
    stop();
    if (state.source.type === "websocket") startWebSocket();
    if (state.source.type === "json") startJsonPolling();
    return api;
  }

  function stop() {
    if (state.timer) clearInterval(state.timer);
    if (state.socket) state.socket.close();
    state.timer = null;
    state.socket = null;
  }

  function set(key, value) {
    state.values[key] = Number(value) || 0;
    return api;
  }

  function get(key, fallback = 0) {
    return state.values[key] ?? fallback;
  }

  function values() {
    return { ...state.values };
  }

  function uniforms() {
    return values();
  }

  function apply(data) {
    const mapped = typeof state.source.map === "function" ? state.source.map(data) : data;
    if (!mapped || typeof mapped !== "object") return;
    for (const [key, value] of Object.entries(mapped)) set(key, value);
  }

  function startWebSocket() {
    state.socket = new WebSocket(state.source.url);
    state.socket.addEventListener("message", (event) => {
      try {
        apply(JSON.parse(event.data));
      } catch {
        apply({ value: Number(event.data) || 0 });
      }
    });
  }

  function startJsonPolling() {
    const interval = Math.max(1, Number(state.source.intervalSeconds) || 10) * 1000;
    const poll = async () => {
      const response = await fetch(state.source.url, { cache: "no-store" }).catch(() => null);
      if (!response?.ok) return;
      apply(await response.json());
    };
    poll();
    state.timer = setInterval(poll, interval);
  }

  const api = {
    start,
    stop,
    set,
    get,
    values,
    uniforms
  };

  return api;
}
