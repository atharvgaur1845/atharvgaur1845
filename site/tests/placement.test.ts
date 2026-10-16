import { describe, expect, it } from 'vitest';
import { chooseAnchor, coarseAnchor, candidates, pathBlocked, placeBubble, type Layout, type Rect } from '../src/companion/placement';
import { KonamiDetector } from '../src/companion/input';
import { Session, Taps, mix, REPEAT_MS } from '../src/companion/lines';
import { MAP, buildGrid, FRAMES, W, H } from '../src/companion/sprite';

const R = (x: number, y: number, w: number, h: number): Rect => ({ x, y, w, h });
// row 0: A (0..600) and B (624..1024), free 2 columns at the right (1024..1200); shelf line at y=400
const layout = (): Layout => ({
  rows: [{ index: 0, surface: 'row:0', ground: 400, x0: 0, x1: 1200 }],
  tiles: [
    { id: 'A', row: 0, rect: R(0, 150, 600, 250), avoid: [R(16, 170, 300, 60), R(500, 340, 40, 40)] },
    { id: 'B', row: 0, rect: R(624, 150, 400, 250), avoid: [R(640, 170, 300, 60)] },
  ],
  avoid: [], pathBlocks: [],
});
const ctx = { viewport: R(0, 52, 1280, 700) };

describe('placement', () => {
  it('prefers the parking spot on the same row', () => {
    const p = chooseAnchor(layout(), 'B', ctx)!;
    expect(p.anchor.kind).toBe('park');
    expect(p.anchor.x).toBeGreaterThan(1024);
    expect(p.anchor.y).toBe(400);
  });
  it('rejects an anchor under the pointer', () => {
    const p = chooseAnchor(layout(), 'B', { ...ctx, pointer: { x: 1112, y: 380 } })!;
    expect(p.anchor.kind).not.toBe('park');
  });
  it('rejects anchors that cover the hovered tile text or data-avoid elements', () => {
    const l = layout();
    l.avoid.push(R(1024, 300, 176, 100));
    const p = chooseAnchor(l, 'B', ctx)!;
    expect(p.anchor.kind).toBe('top');
  });
  it('rejects anchors beyond the viewport edge', () => {
    const p = chooseAnchor(layout(), 'B', { viewport: R(0, 52, 1100, 700) });
    expect(p === null || p.anchor.x + 24 <= 1100).toBe(true);
  });
  it('never places Probe over another tile (no room beside a packed tile)', () => {
    const c = chooseAnchor(layout(), 'A', ctx)!;
    expect(c.anchor.kind === 'park' || c.anchor.kind === 'top').toBe(true);
  });
  it('stays put when nothing survives', () => {
    const l = layout();
    l.avoid.push(R(0, 0, 1280, 800));
    expect(chooseAnchor(l, 'A', ctx)).toBeNull();
    expect(chooseAnchor(l, 'missing', ctx)).toBeNull();
  });
  it('top-edge candidates are ordered away from the pointer', () => {
    const tops = candidates(layout(), 'A', { ...ctx, pointer: { x: 20, y: 200 } }).filter((a) => a.kind === 'top');
    expect(tops[0].x).toBeGreaterThan(tops[1].x);
  });
  it('never crosses the hero text column', () => {
    expect(pathBlocked({ x: 900, y: 100 }, { x: 100, y: 100 }, [R(0, 40, 600, 200)])).toBe(true);
    expect(pathBlocked({ x: 900, y: 100 }, { x: 700, y: 100 }, [R(0, 40, 600, 200)])).toBe(false);
    const l = layout(); l.pathBlocks.push(R(1000, 300, 200, 100));
    const p = chooseAnchor(l, 'B', { ...ctx, from: { x: 50, y: 400 } });
    expect(p === null || p.anchor.kind !== 'park').toBe(true);
  });
  it('bubble flips below near the top and shifts sideways near an edge', () => {
    const b = placeBubble({ x: 40, y: 140 }, { viewport: R(0, 52, 1280, 700) }, [])!;
    expect(b.y).toBeGreaterThan(140); // above would leave the viewport top
    expect(b.x).toBeGreaterThanOrEqual(0);
  });
  it('touch mode picks the left parking spot or a tile top', () => {
    const l = layout();
    l.tiles = l.tiles.slice(0, 1); l.tiles[0].rect = R(300, 150, 600, 250);
    expect(coarseAnchor(l, [0], ctx)!.kind).toBe('park');
    const full = layout(); full.tiles[0].rect = R(0, 150, 600, 250); full.tiles[1].rect = R(600, 150, 600, 250);
    expect(coarseAnchor(full, [0], ctx)!.kind).toBe('top');
  });
});

describe('support', () => {
  it('session remembers explained tiles for 60 s, with a storage that throws', () => {
    const s = new Session({ getItem() { throw new Error('x'); }, setItem() { throw new Error('x'); } });
    s.recordAuto('t1', 1000);
    expect(s.has('t1', 1000 + REPEAT_MS - 1)).toBe(true);
    expect(s.has('t1', 1000 + REPEAT_MS)).toBe(false);
    expect(s.has('t2', 1000)).toBe(false);
  });
  it('taps alternate', () => {
    const t = new Taps(); const l = { kind: 'oss', locked: false, dwell: 'a', click: 'b' } as const;
    expect([t.next(l, 'x'), t.next(l, 'x'), t.next(l, 'x')]).toEqual(['a', 'b', 'a']);
  });
  it('konami sequence', () => {
    const k = new KonamiDetector();
    const keys = ['ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight', 'b', 'a'];
    expect(keys.map((x) => k.feed(x)).filter(Boolean)).toHaveLength(1);
    expect(['ArrowUp', 'x', 'a'].some((x) => k.feed(x))).toBe(false);
  });
  it('mix 50% toward a tint', () => { expect(mix('#000000', '#ffffff', 0.5)).toBe('#808080'); });
  it('sprite map is exactly 16x20 and poses keep the canvas size', () => {
    expect(MAP).toHaveLength(20);
    MAP.forEach((r) => expect(r).toHaveLength(16));
    for (const f of Object.values(FRAMES)) { const g = buildGrid(f); expect(g).toHaveLength(H); g.forEach((r) => expect(r).toHaveLength(W)); }
  });
});

describe('shelf line extent', () => {
  it('does not stand beyond the drawn shelf line', () => {
    const l = layout();
    l.tiles = [{ id: 'A', row: 0, rect: R(0, 150, 1200, 250), avoid: [] }];
    const p = chooseAnchor(l, 'A', ctx)!;
    expect(p.anchor.kind).toBe('top');
  });
});
