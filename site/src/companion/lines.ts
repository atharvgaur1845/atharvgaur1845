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
export const MAX_AUTO = 6;

export interface KV { getItem(k: string): string | null; setItem(k: string, v: string): void }

/** Session memory for explained tiles and auto bubble count. Falls back to memory when storage throws. */
export class Session {
  private explained = new Set<string>();
  private n = 0;
  constructor(private kv?: KV, private key = 'probe-session') {
    try {
      const raw = kv?.getItem(key);
      if (raw) { const o = JSON.parse(raw); this.explained = new Set(o.e ?? []); this.n = Number(o.n) || 0; }
    } catch { /* memory only */ }
  }
  has(id: string) { return this.explained.has(id); }
  get count() { return this.n; }
  get capped() { return this.n >= MAX_AUTO; }
  /** Record one auto bubble about a tile. */
  recordAuto(id: string) { this.explained.add(id); this.n += 1; this.save(); }
  private save() {
    try { this.kv?.setItem(this.key, JSON.stringify({ e: [...this.explained], n: this.n })); } catch { /* ignore */ }
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
