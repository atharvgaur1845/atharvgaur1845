// Follow-the-cursor movement on free graph-paper space only. Pure functions, unit tested.
//
// Rule: Probe's sprite box and its bubble never overlap content (nav is handled by the viewport inset). Content rects are
// inflated by CLEAR px; a standing spot is a point on a ground (shelf line or tile top) whose full sprite box is free.
import { hit, type Rect, type Pt } from './placement';

export const CLEAR = 8;
export const SPOT_STEP = 12;
export const FOLLOW_OFFSET = 56;
export const DEAD_ZONE = 24;
export const HOP_REACH = 340;
export const HOP_RUN = 300;
export const MAX_HOPS = 3;

export interface Content { key: string; rect: Rect }
export interface Ground { id: string; y: number; x0: number; x1: number; exempt?: string }
export interface Spot { gid: string; x: number; y: number }
export interface Sprite { w: number; h: number }
export type Step = { type: 'run'; x: number } | { type: 'hop'; x: number; y: number; gid: string };

export const inflate = (r: Rect, n = CLEAR): Rect => ({ x: r.x - n, y: r.y - n, w: r.w + 2 * n, h: r.h + 2 * n });
/** Sprite box (feet at x,y) including its one-row shadow. */
export const boxAt = (x: number, y: number, s: Sprite): Rect => ({ x: x - s.w / 2, y: y - s.h, w: s.w, h: s.h + 3 });
export const within = (b: Rect, v: Rect) => b.x >= v.x && b.y >= v.y && b.x + b.w <= v.x + v.w && b.y + b.h <= v.y + v.h;

/** Grounds from a layout: shelf lines (tiles stand on them), tile tops, and the lab board's top edge. */
export function groundsOf(rows: { surface: string; ground: number; x0: number; x1: number }[], tiles: { id: string; rect: Rect }[], board?: Rect): Ground[] {
  const g: Ground[] = rows.map((r) => ({ id: r.surface, y: r.ground, x0: r.x0, x1: r.x1 }));
  for (const t of tiles) g.push({ id: `top:${t.id}`, y: t.rect.y - 3, x0: t.rect.x, x1: t.rect.x + t.rect.w, exempt: `tile:${t.id}` });
  if (board) g.push({ id: 'board', y: board.y - 3, x0: board.x, x1: board.x + board.w, exempt: 'board' });
  return g;
}

export function freeBox(b: Rect, content: Content[], exempt?: string): boolean {
  for (const c of content) if (c.key !== exempt && hit(b, inflate(c.rect))) return false;
  return true;
}

export class SpotIndex {
  spots: Spot[] = [];
  private by = new Map<string, Set<number>>();
  constructor(public grounds: Ground[], public content: Content[], public sprite: Sprite) {
    const infl = content.map((c) => ({ key: c.key, rect: inflate(c.rect) }));
    for (const g of grounds) {
      const set = new Set<number>();
      const lo = Math.ceil((g.x0 + sprite.w / 2) / SPOT_STEP), hi = Math.floor((g.x1 - sprite.w / 2) / SPOT_STEP);
      for (let i = lo; i <= hi; i++) {
        const b = boxAt(i * SPOT_STEP, g.y, sprite);
        let free = true;
        for (const c of infl) if (c.key !== g.exempt && hit(b, c.rect)) { free = false; break; }
        if (free) { set.add(i); this.spots.push({ gid: g.id, x: i * SPOT_STEP, y: g.y }); }
      }
      this.by.set(g.id, set);
    }
  }
  ground(id: string) { return this.grounds.find((g) => g.id === id); }
  has(gid: string, x: number) { return this.by.get(gid)?.has(Math.round(x / SPOT_STEP)) ?? false; }
  /** Is the whole stretch between two x on one ground free (Probe can run it)? */
  runnable(gid: string, x1: number, x2: number): boolean {
    const set = this.by.get(gid); if (!set) return false;
    const a = Math.round(Math.min(x1, x2) / SPOT_STEP), b = Math.round(Math.max(x1, x2) / SPOT_STEP);
    for (let i = a; i <= b; i++) if (!set.has(i)) return false;
    return true;
  }
  /** Free stretch around x: [left, right] x of the contiguous run on this ground. */
  segment(gid: string, x: number): [number, number] | null {
    const set = this.by.get(gid); const i0 = Math.round(x / SPOT_STEP);
    if (!set?.has(i0)) return null;
    let l = i0, r = i0;
    while (set.has(l - 1)) l--; while (set.has(r + 1)) r++;
    return [l * SPOT_STEP, r * SPOT_STEP];
  }
}

export const spotBox = (s: Spot, sprite: Sprite) => boxAt(s.x, s.y, sprite);

/** Nearest valid spot to the cursor-offset target (left of the pointer first, then right). Null when none is in view. */
export function chooseSpot(ix: SpotIndex, pointer: Pt, view: Rect, current?: Spot, bubble?: { w: number; h: number }): Spot | null {
  const ptr: Rect = { x: pointer.x - 24, y: pointer.y - 24, w: 48, h: 48 };
  const T = [{ x: pointer.x - FOLLOW_OFFSET, y: pointer.y }, { x: pointer.x + FOLLOW_OFFSET, y: pointer.y }];
  const score = (s: Spot) => {
    const cy = s.y - ix.sprite.h / 2;
    return Math.min(...T.map((t) => Math.hypot(s.x - t.x, cy - t.y))) + (s.y < pointer.y - 10 ? 80 : 0);
  };
  const ranked: { s: Spot; sc: number }[] = [];
  for (const s of ix.spots) {
    const b = spotBox(s, ix.sprite);
    if (!within(b, view) || hit(b, ptr)) continue;
    ranked.push({ s, sc: score(s) });
  }
  if (!ranked.length) return null;
  ranked.sort((a, b) => a.sc - b.sc);
  // while a bubble is showing, prefer a nearby spot where the bubble also fits in free space
  const fits = (s: Spot) => !bubble || !!placeFreeBubble(s, ix.sprite, bubble, ix.content, pointer, view);
  let best = ranked[0];
  if (bubble) best = ranked.slice(0, 60).find((r) => fits(r.s)) ?? ranked[0];
  if (current && current.gid === best.s.gid && ix.has(current.gid, current.x)) {
    const cb = spotBox(current, ix.sprite);
    if (within(cb, view) && !hit(cb, ptr) && score(current) <= best.sc + 30 && fits(current)) return current;
  }
  return best.s;
}

/** Does a hop arc keep the sprite in free space (ends exempt: those are valid spots themselves)? */
export function arcClear(from: Pt, to: Pt, lift: number, ix: SpotIndex): boolean {
  const infl = ix.content.map((c) => inflate(c.rect));
  for (let t = 0.05; t <= 0.96; t += 0.05) { // whole arc incl. the climb onto a tile top just before landing
    const p = { x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t - Math.sin(Math.PI * t) * lift };
    const b = boxAt(p.x, p.y, ix.sprite);
    for (const c of infl) if (hit(b, c)) return false;
  }
  return true;
}
export const liftFor = (a: Pt, b: Pt) => Math.max(36, Math.min(110, 30 + Math.hypot(b.x - a.x, b.y - a.y) * 0.12));

export interface Plan { steps: Step[]; teleport: boolean }

/**
 * Path from the current spot to the target spot: a run along the same ground when its whole stretch is free, otherwise up to
 * MAX_HOPS hops between free spots whose arcs stay in free space (run to the edge of the free stretch first). When no such
 * path exists the caller fades Probe out and in at the target (a "leap"): it is never seen crossing content.
 */
export function planPath(ix: SpotIndex, from: Spot, to: Spot, view: Rect): Plan {
  if (from.gid === to.gid && ix.runnable(from.gid, from.x, to.x)) return { steps: [{ type: 'run', x: to.x }], teleport: false };
  const steps: Step[] = [];
  let cur = from;
  for (let hop = 0; hop < MAX_HOPS; hop++) {
    const seg = ix.segment(cur.gid, cur.x);
    const sources: Spot[] = seg ? [cur, { ...cur, x: seg[0] }, { ...cur, x: seg[1] }] : [cur];
    let best: { src: Spot; dst: Spot; d: number } | null = null;
    for (const dst of ix.spots) {
      if (dst.gid === cur.gid) continue;
      if (!within(spotBox(dst, ix.sprite), view)) continue;
      const d0 = Math.hypot(dst.x - to.x, dst.y - to.y);
      if (best && d0 >= best.d) continue;
      for (const src of sources) {
        if (Math.abs(dst.x - src.x) > HOP_RUN || Math.abs(dst.y - src.y) > HOP_REACH) continue;
        if (src.x !== cur.x && !ix.runnable(cur.gid, cur.x, src.x)) continue;
        if (!arcClear(src, dst, liftFor(src, dst), ix)) continue;
        best = { src, dst, d: d0 }; break;
      }
    }
    if (!best) return { steps: [], teleport: true };
    if (best.src.x !== cur.x) steps.push({ type: 'run', x: best.src.x });
    steps.push({ type: 'hop', x: best.dst.x, y: best.dst.y, gid: best.dst.gid });
    cur = best.dst;
    if (cur.gid === to.gid) {
      if (ix.runnable(cur.gid, cur.x, to.x)) { if (cur.x !== to.x) steps.push({ type: 'run', x: to.x }); return { steps, teleport: false }; }
      return { steps, teleport: false };
    }
  }
  return { steps: [], teleport: true };
}

/** Critically damped smoothing (no overshoot). Returns [position, velocity]. */
export function smoothDamp(cur: number, target: number, vel: number, smoothTime: number, maxSpeed: number, dt: number): [number, number] {
  const st = Math.max(0.0001, smoothTime);
  const w = 2 / st, x = w * dt;
  const e = 1 / (1 + x + 0.48 * x * x + 0.235 * x * x * x);
  let change = cur - target;
  const maxChange = maxSpeed * st;
  change = Math.max(-maxChange, Math.min(maxChange, change));
  const t = cur - change;
  const temp = (vel + w * change) * dt;
  let v = (vel - w * temp) * e;
  let out = t + (change + temp) * e;
  if ((target - cur > 0) === (out > target)) { out = target; v = 0; }
  return [out, v];
}

/** Ignores pointer moves smaller than the dead zone; returns true when the target should be recomputed. */
export class DeadZone {
  private a: Pt | null = null;
  constructor(private r = DEAD_ZONE) {}
  update(p: Pt): boolean {
    if (!this.a || Math.hypot(p.x - this.a.x, p.y - this.a.y) > this.r) { this.a = { ...p }; return true; }
    return false;
  }
  reset() { this.a = null; }
}

/** Bubble candidates in preference order: above, left, right (never below). */
export function bubbleSpots(sp: Pt, sprite: Sprite, b: { w: number; h: number }): Rect[] {
  const g = 8;
  return [
    { x: sp.x - b.w / 2, y: sp.y - sprite.h - g - b.h, w: b.w, h: b.h },
    { x: sp.x - 24, y: sp.y - sprite.h - g - b.h, w: b.w, h: b.h },
    { x: sp.x - b.w + 24, y: sp.y - sprite.h - g - b.h, w: b.w, h: b.h },
    { x: sp.x - sprite.w / 2 - g - b.w, y: sp.y - b.h, w: b.w, h: b.h },
    { x: sp.x + sprite.w / 2 + g, y: sp.y - b.h, w: b.w, h: b.h },
  ];
}
/** First free bubble rect (outside content, the cursor box and the sprite), preferring the previous index. Null: do not show. */
export function placeFreeBubble(sp: Pt, sprite: Sprite, b: { w: number; h: number }, content: Content[], pointer: Pt | undefined, view: Rect, prefer = -1): { rect: Rect; idx: number } | null {
  const cands = bubbleSpots(sp, sprite, b);
  const order = cands.map((_, i) => i);
  if (prefer >= 0) order.sort((a, c) => (a === prefer ? -1 : c === prefer ? 1 : a - c));
  const infl = content.map((c) => inflate(c.rect, 4));
  const ptr: Rect | null = pointer ? { x: pointer.x - 24, y: pointer.y - 24, w: 48, h: 48 } : null;
  const sb = boxAt(sp.x, sp.y, sprite);
  for (const i of order) {
    const r = cands[i];
    if (!within(r, view) || (ptr && hit(r, ptr)) || hit(r, sb) || infl.some((c) => hit(r, c))) continue;
    return { rect: r, idx: i };
  }
  return null;
}
