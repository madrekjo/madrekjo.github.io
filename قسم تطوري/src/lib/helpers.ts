export function wait(ms: number): Promise<void> {
  return new Promise((r) => window.setTimeout(r, ms));
}

export function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

export function pctPart(done: number, total: number): number {
  return total > 0 ? Math.round((done / total) * 100) : 0;
}