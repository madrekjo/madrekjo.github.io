const timers = new Map<string, number>();

interface Msg {
  cmd: "set" | "clear" | "clearAll";
  id?: string;
  ts?: number;
}

self.onmessage = (e: MessageEvent<Msg>) => {
  const m = e.data;
  if (!m || typeof m !== "object") return;
  if (m.cmd === "clearAll") {
    timers.forEach((t) => self.clearTimeout(t));
    timers.clear();
    return;
  }
  if (m.cmd === "clear" && m.id) {
    const t = timers.get(m.id);
    if (t !== undefined) {
      self.clearTimeout(t);
      timers.delete(m.id);
    }
    return;
  }
  if (m.cmd === "set" && m.id && m.ts !== undefined) {
    const id = m.id;
    const existing = timers.get(id);
    if (existing !== undefined) self.clearTimeout(existing);
    const delay = Math.max(0, m.ts - Date.now());
    const handle = self.setTimeout(() => {
      timers.delete(id);
      self.postMessage({ id });
    }, delay);
    timers.set(id, handle);
  }
};