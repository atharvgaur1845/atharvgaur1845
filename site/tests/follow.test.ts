import { describe, expect, it } from 'vitest';
import { DeadZone, SpotIndex, arcClear, boxAt, chooseSpot, groundsOf, inflate, placeFreeBubble, planPath, smoothDamp, type Content, type Ground } from '../src/companion/follow';
import { hit, type Rect } from '../src/companion/placement';

const SPRITE = { w: 48, h: 60 };
const R = (x: number, y: number, w: number, h: number): Rect => ({ x, y, w, h });

describe('spring', () => {
  it('approaches the target without overshoot or jitter', () => {
    let x = 0, v = 0, prev = -1;
    for (let i = 0; i < 240; i++) {
      [x, v] = smoothDamp(x, 500, v, 0.14, 560, 1 / 60);
      expect(x).toBeLessThanOrEqual(500);
      expect(x).toBeGreaterThanOrEqual(prev);        // monotone: never reverses
      prev = x;
    }
    expect(x).toBeCloseTo(500, 0);
  });
  it('is smooth when the target moves (no velocity reversal beyond the cap)', () => {
    let x = 0, v = 0, tgt = 300; let maxV = 0;
    for (let i = 0; i < 180; i++) { if (i === 40) tgt = 360; [x, v] = smoothDamp(x, tgt, v, 0.14, 560, 1 / 60); maxV = Math.max(maxV, Math.abs(v)); expect(v).toBeGreaterThanOrEqual(0); }
    expect(maxV).toBeLessThanOrEqual(560 + 1);
  });
  it('works backwards too', () => {
    let x = 400, v = 0;
    for (let i = 0; i < 200; i++) { [x, v] = smoothDamp(x, 100, v, 0.14, 560, 1 / 60); expect(x).toBeGreaterThanOrEqual(100); }
    expect(x).toBeCloseTo(100, 0);
  });
});

describe('dead zone', () => {
  it('ignores moves under 24 px and retargets beyond it', () => {
    const d = new DeadZone();
    expect(d.update({ x: 100, y: 100 })).toBe(true);
    expect(d.update({ x: 110, y: 112 })).toBe(false);
    expect(d.update({ x: 123, y: 100 })).toBe(false);
    expect(d.update({ x: 130, y: 100 })).toBe(true);
    expect(d.update({ x: 131, y: 101 })).toBe(false);
  });
});

// ---- a synthetic home page: hero text, lab board, labelled shelves of tiles standing on shelf lines
function page(vw: number) {
  const wrap = Math.min(1200, vw - 64), x0 = (vw - wrap) / 2, col = (wrap - 11 * 24) / 12;
  const content: Content[] = [];
  const rows: { surface: string; ground: number; x0: number; x1: number }[] = [];
  const tiles: { id: string; rect: Rect }[] = [];
  content.push({ key: 'hero1', rect: R(x0, 120, wrap * 0.55, 60) }, { key: 'hero2', rect: R(x0, 190, wrap * 0.55, 150) });
  const board = R(x0 + wrap * 0.62, 120, wrap * 0.38, 340);
  content.push({ key: 'board', rect: board });
  let y = 560;
  const shelves: number[][] = [[6, 3, 3], [6, 4], [6, 4], [4, 4, 4], [6, 3, 3]];
  let n = 0;
  for (const spans of shelves) {
    content.push({ key: `h${n}`, rect: R(x0, y, 150, 18) });
    const top = y + 40, h = 250;
    let cx = x0;
    spans.forEach((sp, i) => {
      const w = sp * col + (sp - 1) * 24, id = `t${n}-${i}`;
      const rect = R(cx, top, w, h);
      tiles.push({ id, rect }); content.push({ key: `tile:${id}`, rect });
      cx += w + 24;
    });
    rows.push({ surface: `row:${rows.length}`, ground: top + h + 20, x0, x1: x0 + wrap });
    y = top + h + 20 + 3 + 28 + 40;
    n++;
  }
  content.push({ key: 'foot', rect: R(0, y + 100, vw, 90) });
  return { content, grounds: groundsOf(rows, tiles, board), height: y + 200 };
}

// small deterministic PRNG
const rng = (seed: number) => () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32;

describe('free space: the sprite never overlaps content', () => {
  for (const vw of [1440, 1024]) {
    it(`200 random cursor positions at ${vw}px`, () => {
      const { content, grounds, height } = page(vw);
      const ix = new SpotIndex(grounds, content, SPRITE);
      expect(ix.spots.length).toBeGreaterThan(20);
      const rand = rng(vw);
      let found = 0;
      for (let i = 0; i < 200; i++) {
        const scrollY = rand() * (height - 900);
        const view = R(0, scrollY + 48, vw, 900 - 48);
        const ptr = { x: rand() * vw, y: scrollY + 48 + rand() * 850 };
        const s = chooseSpot(ix, ptr, view);
        if (!s) continue;
        found++;
        const box = boxAt(s.x, s.y, SPRITE);
        const own = grounds.find((g) => g.id === s.gid)?.exempt;
        for (const c of content) {
          if (c.key === own) continue;
          expect(hit(box, inflate(c.rect))).toBe(false); // content inflated by 8 px
        }
        expect(hit(box, R(ptr.x - 24, ptr.y - 24, 48, 48))).toBe(false); // never covers the cursor
        expect(box.x).toBeGreaterThanOrEqual(view.x); expect(box.x + box.w).toBeLessThanOrEqual(view.x + view.w);
        expect(box.y).toBeGreaterThanOrEqual(view.y); expect(box.y + box.h).toBeLessThanOrEqual(view.y + view.h);
      }
      expect(found).toBeGreaterThan(100);
    });
  }
  it('with a bubble showing, Probe prefers a spot where the bubble fits', () => {
    const { content, grounds, height } = page(1440);
    const ix = new SpotIndex(grounds, content, SPRITE);
    const rand = rng(11); let better = 0, total = 0;
    for (let i = 0; i < 200; i++) {
      const scrollY = rand() * (height - 900), view = R(0, scrollY + 48, 1440, 852);
      const ptr = { x: rand() * 1440, y: scrollY + 48 + rand() * 850 };
      const plain = chooseSpot(ix, ptr, view); const withB = chooseSpot(ix, ptr, view, undefined, { w: 260, h: 56 });
      if (!plain || !withB) continue; total++;
      const fits = (sp: typeof plain) => !!placeFreeBubble(sp, SPRITE, { w: 260, h: 56 }, content, ptr, view);
      if (fits(withB) || !fits(plain)) better++;
    }
    expect(better).toBe(total);
  });
  it('the bubble is placed in free space or not at all', () => {
    const { content, grounds, height } = page(1440);
    const ix = new SpotIndex(grounds, content, SPRITE);
    const rand = rng(7);
    let shown = 0, hidden = 0;
    for (let i = 0; i < 200; i++) {
      const scrollY = rand() * (height - 900), view = R(0, scrollY + 48, 1440, 852);
      const ptr = { x: rand() * 1440, y: scrollY + 48 + rand() * 850 };
      const s = chooseSpot(ix, ptr, view); if (!s) continue;
      const b = placeFreeBubble(s, SPRITE, { w: 260, h: 56 }, content, ptr, view);
      if (!b) { hidden++; continue; }
      shown++;
      for (const c of content) expect(hit(b.rect, inflate(c.rect, 4))).toBe(false);
      expect(hit(b.rect, boxAt(s.x, s.y, SPRITE))).toBe(false);
      expect(hit(b.rect, R(ptr.x - 24, ptr.y - 24, 48, 48))).toBe(false);
    }
    expect(shown + hidden).toBeGreaterThan(100);
  });
});

describe('climb planner', () => {
  // three free shelves, 300 px apart, all open (no content): hops of at most 340 px, at most 3 hops
  const g = (id: string, y: number): Ground => ({ id, y, x0: 100, x1: 900 });
  const open = new SpotIndex([g('a', 300), g('b', 600), g('c', 900), g('d', 1200)], [], SPRITE);
  const view = R(0, 0, 1000, 2000);

  it('runs along the same ground', () => {
    const p = planPath(open, { gid: 'a', x: 200, y: 300 }, { gid: 'a', x: 500, y: 300 }, view);
    expect(p.teleport).toBe(false);
    expect(p.steps).toEqual([{ type: 'run', x: 500 }]);
  });
  it('hops down a shelf at a time, each hop within reach', () => {
    const p = planPath(open, { gid: 'a', x: 200, y: 300 }, { gid: 'c', x: 240, y: 900 }, view);
    expect(p.teleport).toBe(false);
    const hops = p.steps.filter((s) => s.type === 'hop') as { y: number; gid: string }[];
    expect(hops.map((h) => h.gid)).toEqual(['b', 'c']);
    let y = 300;
    for (const h of hops) { expect(Math.abs(h.y - y)).toBeLessThanOrEqual(340); y = h.y; }
  });
  it('climbs up with the same chain in reverse', () => {
    const p = planPath(open, { gid: 'd', x: 400, y: 1200 }, { gid: 'b', x: 380, y: 600 }, view);
    expect(p.teleport).toBe(false);
    expect((p.steps.filter((s) => s.type === 'hop') as { gid: string }[]).map((h) => h.gid)).toEqual(['c', 'b']);
  });
  it('leaps (fades in at the target) when more than three hops would be needed', () => {
    const tall = new SpotIndex([g('a', 100), g('b', 400), g('c', 700), g('d', 1000), g('e', 1300)], [], SPRITE);
    const p = planPath(tall, { gid: 'a', x: 200, y: 100 }, { gid: 'e', x: 200, y: 1300 }, R(0, 0, 1000, 2000));
    expect(p.teleport).toBe(true);
  });
  it('never hops through content: a blocked arc means a leap', () => {
    const wall: Content[] = [{ key: 'wall', rect: R(0, 380, 1000, 60) }];
    const blocked = new SpotIndex([g('a', 300), g('b', 600)], wall, SPRITE);
    expect(arcClear({ x: 200, y: 300 }, { x: 200, y: 600 }, 60, blocked)).toBe(false);
    const p = planPath(blocked, { gid: 'a', x: 200, y: 300 }, { gid: 'b', x: 200, y: 600 }, view);
    expect(p.teleport).toBe(true);
  });
});
