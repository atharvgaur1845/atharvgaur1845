// Placement (spec 10.3). Geometry is pure and testable; measure() reads the DOM into a Layout.
export interface Rect { x: number; y: number; w: number; h: number }
export interface Pt { x: number; y: number }
export interface TileInfo { id: string; rect: Rect; row: number; avoid: Rect[] }
export interface RowInfo { index: number; surface: string; ground: number; x0: number; x1: number }
export interface Layout {
  rows: RowInfo[];
  tiles: TileInfo[];
  /** extra stand-on surface: the lab board's top edge */
  board?: Rect;
  /** elements marked data-avoid: never covered by sprite or bubble */
  avoid: Rect[];
  /** Probe may not cross these while moving (hero text column) */
  pathBlocks: Rect[];
}
export interface Anchor { key: string; surface: string; x: number; y: number; kind: 'park' | 'right' | 'left' | 'top' | 'board' }
export interface Ctx {
  pointer?: Pt;
  viewport: Rect;
  sprite?: { w: number; h: number };
  bubble?: { w: number; h: number };
  from?: Pt;
}
export const SPRITE: { w: number; h: number } = { w: 48, h: 60 };
export const BUBBLE: { w: number; h: number } = { w: 260, h: 72 };
export const POINTER_PAD = 24;
const GAP = 8; // bubble to sprite

export const hit = (a: Rect, b: Rect) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
export const spriteRect = (a: Pt, s = SPRITE): Rect => ({ x: a.x - s.w / 2, y: a.y - s.h, w: s.w, h: s.h + 3 });
const inside = (r: Rect, v: Rect) => r.x >= v.x && r.y >= v.y && r.x + r.w <= v.x + v.w && r.y + r.h <= v.y + v.h;
const shrink = (r: Rect, n: number): Rect => ({ x: r.x + n, y: r.y + n, w: Math.max(0, r.w - 2 * n), h: Math.max(0, r.h - 2 * n) });

/** Does the straight path from a to b cross any block (checked on a thin horizontal/vertical sweep)? */
export function pathBlocked(a: Pt, b: Pt, blocks: Rect[], s = SPRITE): boolean {
  const n = 12;
  for (let i = 0; i <= n; i++) {
    const p = { x: a.x + ((b.x - a.x) * i) / n, y: a.y + ((b.y - a.y) * i) / n };
    const r = spriteRect(p, s);
    if (blocks.some((k) => hit(r, k))) return true;
  }
  return false;
}

/**
 * Where to put the bubble for a sprite at `a`. Tries above, then below; centred, then pushed right, then left.
 * Returns null if every option hits the pointer, the hovered tile's text, a data-avoid rect or leaves the viewport.
 */
export function placeBubble(a: Pt, ctx: Ctx, bad: Rect[]): Rect | null {
  const b = ctx.bubble ?? BUBBLE;
  const s = ctx.sprite ?? SPRITE;
  const xs = [a.x - b.w / 2, a.x - 24, a.x - b.w + 24];
  const ys = [a.y - s.h - GAP - b.h, a.y + 3 + GAP + 6];
  const tries: Rect[] = [];
  for (const y of ys) for (const x of xs) tries.push({ x, y, w: b.w, h: b.h });
  // beside Probe (left first), bottom aligned with its feet
  tries.push({ x: a.x - s.w / 2 - GAP - b.w, y: a.y - b.h, w: b.w, h: b.h });
  tries.push({ x: a.x + s.w / 2 + GAP, y: a.y - b.h, w: b.w, h: b.h });
  for (const r of tries) if (inside(r, ctx.viewport) && !bad.some((k) => hit(r, k))) return r;
  return null;
}

export interface Pick { anchor: Anchor; bubble: Rect | null }

/** Ordered candidate anchors for a tile (spec 10.3 step 2). */
export function candidates(layout: Layout, id: string, ctx: Ctx): Anchor[] {
  const t = layout.tiles.find((x) => x.id === id);
  if (!t) return [];
  const row = layout.rows[t.row];
  const sw = (ctx.sprite ?? SPRITE).w;
  const out: Anchor[] = [];
  const mates = layout.tiles.filter((x) => x.row === t.row).sort((a, b) => a.rect.x - b.rect.x);
  // free segments on this shelf line
  const segs: [number, number][] = [];
  let cur = row.x0;
  for (const m of mates) { if (m.rect.x - cur >= sw + 8) segs.push([cur, m.rect.x]); cur = Math.max(cur, m.rect.x + m.rect.w); }
  if (row.x1 - cur >= sw + 8) segs.push([cur, row.x1]);
  const cx = t.rect.x + t.rect.w / 2;
  segs
    .map(([a, b]) => ({ x: (a + b) / 2, d: Math.abs((a + b) / 2 - cx) }))
    .sort((p, q) => p.d - q.d)
    .forEach((p, i) => out.push({ key: `park:${t.row}:${i}`, surface: row.surface, x: p.x, y: row.ground, kind: 'park' }));
  out.push({ key: `right:${id}`, surface: row.surface, x: t.rect.x + t.rect.w + sw / 2 + 4, y: row.ground, kind: 'right' });
  out.push({ key: `left:${id}`, surface: row.surface, x: t.rect.x - sw / 2 - 4, y: row.ground, kind: 'left' });
  const px = ctx.pointer?.x ?? cx;
  const lx = t.rect.x + sw / 2 + 8;
  const rx = t.rect.x + t.rect.w - sw / 2 - 8;
  [lx, rx].sort((a, b) => Math.abs(b - px) - Math.abs(a - px)).forEach((x, i) =>
    out.push({ key: `top:${id}:${i}`, surface: `top:${id}`, x, y: t.rect.y, kind: 'top' }));
  return out;
}

/** First candidate that survives every rejection rule, with its bubble rect. Null means: stay put. */
export function chooseAnchor(layout: Layout, id: string, ctx: Ctx): Pick | null {
  const t = layout.tiles.find((x) => x.id === id);
  if (!t) return null;
  const ptr: Rect | null = ctx.pointer
    ? { x: ctx.pointer.x - POINTER_PAD, y: ctx.pointer.y - POINTER_PAD, w: POINTER_PAD * 2, h: POINTER_PAD * 2 } : null;
  const bad = [...(ptr ? [ptr] : []), ...t.avoid, ...layout.avoid];
  for (const a of candidates(layout, id, ctx)) {
    const sp = spriteRect(a, ctx.sprite);
    if (!inside(sp, ctx.viewport)) continue;
    // shelf-line anchors must stand on the drawn line
    if (a.kind !== 'top' && (sp.x < layout.rows[t.row].x0 || sp.x + sp.w > layout.rows[t.row].x1)) continue;
    if (bad.some((k) => hit(sp, k))) continue;
    if (layout.tiles.some((o) => hit(sp, shrink(o.rect, 1)) && !(a.kind === 'top' && o.id === id))) continue;
    if (ctx.from && layout.pathBlocks.length && pathBlocked(ctx.from, a, layout.pathBlocks, ctx.sprite)) continue;
    const others = layout.tiles.filter((o) => o.id !== id).flatMap((o) => o.avoid);
    const bubble = placeBubble(a, ctx, [...bad, ...others]) ?? placeBubble(a, ctx, bad);
    if (!bubble) continue;
    return { anchor: a, bubble };
  }
  return null;
}

/** Touch mode: left-most parking spot on the shelf's first row, else the right end of its first tile's top edge. */
export function coarseAnchor(layout: Layout, shelfRows: number[], ctx: Ctx): Anchor | null {
  const sw = (ctx.sprite ?? SPRITE).w;
  for (const ri of shelfRows) {
    const row = layout.rows[ri];
    const mates = layout.tiles.filter((x) => x.row === ri).sort((a, b) => a.rect.x - b.rect.x);
    let cur = row.x0;
    for (const m of mates) {
      if (m.rect.x - cur >= sw + 8) return { key: `cpark:${ri}`, surface: row.surface, x: cur + sw / 2 + 4, y: row.ground, kind: 'park' };
      cur = Math.max(cur, m.rect.x + m.rect.w);
    }
    if (row.x1 - cur >= sw + 8) return { key: `cpark:${ri}`, surface: row.surface, x: cur + sw / 2 + 4, y: row.ground, kind: 'park' };
  }
  const first = layout.tiles.filter((x) => shelfRows.includes(x.row)).sort((a, b) => a.rect.y - b.rect.y || a.rect.x - b.rect.x)[0];
  if (!first) return null;
  const sp = ctx.sprite ?? SPRITE;
  return { key: `ctop:${first.id}`, surface: `top:${first.id}`, x: first.rect.x + first.rect.w - sp.w / 2 - 12, y: first.rect.y, kind: 'top' };
}

// ---- DOM measurement (document coordinates)
const abs = (r: DOMRect): Rect => ({ x: r.left + scrollX, y: r.top + scrollY, w: r.width, h: r.height });
function textRect(el: Element): Rect {
  const rg = document.createRange();
  rg.selectNodeContents(el);
  return abs(rg.getBoundingClientRect());
}

export interface ShelfMap { rowsOfShelf: Record<string, number[]> }

export function measure(root: ParentNode = document): Layout & ShelfMap {
  const rows: RowInfo[] = [];
  const tiles: TileInfo[] = [];
  const rowsOfShelf: Record<string, number[]> = {};
  root.querySelectorAll<HTMLElement>('[data-shelf-row]').forEach((el) => {
    const r = abs(el.getBoundingClientRect());
    const index = rows.length;
    const lineW = parseFloat(getComputedStyle(el).borderBottomWidth) || 3;
    rows.push({ index, surface: `row:${index}`, ground: r.y + r.h - lineW, x0: r.x, x1: r.x + r.w });
    const shelf = el.closest('[data-shelf]')?.getAttribute('data-shelf') ?? '';
    (rowsOfShelf[shelf] ??= []).push(index);
    el.querySelectorAll<HTMLElement>('[data-tile]').forEach((t) => {
      tiles.push({
        id: t.dataset.tile!, row: index, rect: abs(t.getBoundingClientRect()),
        avoid: [...t.querySelectorAll('[data-text]')].map((n) => abs(n.getBoundingClientRect())),
      });
    });
  });
  const avoid: Rect[] = [];
  root.querySelectorAll('[data-avoid]').forEach((n) => avoid.push(abs(n.getBoundingClientRect())));
  root.querySelectorAll('[data-avoid-text]').forEach((n) => avoid.push(textRect(n)));
  const pathBlocks: Rect[] = [];
  root.querySelectorAll('[data-avoid-path]').forEach((n) => pathBlocks.push(abs(n.getBoundingClientRect())));
  const b = root.querySelector('[data-probe-board]');
  return { rows, tiles, avoid, pathBlocks, board: b ? abs(b.getBoundingClientRect()) : undefined, rowsOfShelf };
}

/** Every piece of content Probe and its bubble must stay off (document coordinates, not inflated). The nav is handled by the viewport inset. */
export function measureContent(root: ParentNode = document): { key: string; rect: Rect }[] {
  const out: { key: string; rect: Rect }[] = [];
  const add = (key: string, el: Element) => { const r = abs(el.getBoundingClientRect()); if (r.w > 0 && r.h > 0) out.push({ key, rect: r }); };
  root.querySelectorAll('.hero .intro > *, #skills .intro, #skills .group, #contact .grid > *, footer.foot .in > *, [data-content], .p-root[data-open] .p-win, #lk-dialog[open]').forEach((el, i) => add(`c${i}`, el));
  root.querySelectorAll('[data-probe-board]').forEach((el) => add('board', el));
  root.querySelectorAll('[data-tile]').forEach((el) => add(`tile:${(el as HTMLElement).dataset.tile}`, el));
  root.querySelectorAll('main h2').forEach((el, i) => { const r = textRect(el); if (r.w > 0) out.push({ key: `h${i}`, rect: r }); });
  return out;
}
