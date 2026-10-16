// Robot lines: types, global defaults, session memory (no repeats, cap), and line selection.
export type Kind = 'research' | 'project' | 'achievement' | 'oss';
export interface TileLines { kind: Kind; locked: boolean; dwell: string; click: string }
export type LineMap = Record<string, TileLines>;
export interface Globals {
  firstVisit: string; off: string; on: string; orb: string; konami: string; hint: string; panelHint: string;
}
export const KIND_COLOUR: Record<Kind, string> = {
  research: '#2F5BD8', achievement: '#C0266D', project: '#0E7A5C', oss: '#5B3FD0',
};
export const REPEAT_MS = 60000; // a tile may be explained again after this long

export interface KV { getItem(k: string): string | null; setItem(k: string, v: string): void }

/** Remembers when each tile was last explained (no cap; a tile may repeat after REPEAT_MS). Falls back to memory when storage throws. */
export class Session {
  private seen = new Map<string, number>();
  constructor(private kv?: KV, private key = 'probe-session-v2') {
    try {
      const raw = kv?.getItem(key);
      if (raw) for (const [k, v] of Object.entries(JSON.parse(raw) as Record<string, number>)) this.seen.set(k, v);
    } catch { /* memory only */ }
  }
  has(id: string, now = Date.now()) { const t = this.seen.get(id); return t !== undefined && now - t < REPEAT_MS; }
  recordAuto(id: string, now = Date.now()) {
    this.seen.set(id, now);
    try { this.kv?.setItem(this.key, JSON.stringify(Object.fromEntries(this.seen))); } catch { /* ignore */ }
  }
}

/** Alternates dwell and click lines for manual taps on the same tile. */
export class Taps {
  private n = new Map<string, number>();
  next(l: TileLines, id: string): string {
    const i = this.n.get(id) ?? 0;
    this.n.set(id, i + 1);
    return i % 2 === 0 ? l.dwell : l.click;
  }
}

export function mix(a: string, b: string, t: number): string {
  const p = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const [x, y] = [p(a), p(b)];
  const c = x.map((v, i) => Math.round(v + (y[i] - v) * t));
  return '#' + c.map((v) => v.toString(16).padStart(2, '0')).join('');
}
