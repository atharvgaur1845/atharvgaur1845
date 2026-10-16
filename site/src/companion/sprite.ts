// Probe sprite: the approved 16x20 map plus programmatically derived poses (spec 10.1).
export const MAP = [
  '.....oooooo.....',
  '...oowwwwwwoo...',
  '..owwwwwwwwwwo..',
  '.owwwwwwwwwwwwo.',
  '.owwwwwwwwwwwwo.',
  'owwwkwwwwwwkwwwo',
  'owwwkwwwwwwkwwwo',
  'owppwwmwwmwwppwo',
  'owwwwwwmmwwwwwwo',
  'owwwwwwwwwwwwwwo',
  'owwwwwBBBBwwwwwo',
  'owwssBBHBBBsswwo',
  'owsssBBBBBBssswo',
  'owwssBBBBBBsswwo',
  'owwwwwBBBBwwwwwo',
  'owwwwwwwwwwwwwwo',
  'oswwwwwwwwwwwwso',
  '.osswwwwwwwwsso.',
  '..ossoooooosso..',
  '..oooo....oooo..',
] as const;

export const SW = 16, SH = 20;
// canvas cell grid: sprite sits at (OX, OY); headroom for z and sparkle, one shadow row below feet
export const OX = 3, OY = 4, W = 22, H = 26;

export const COLOURS: Record<string, string> = {
  o: '#3E3532', w: '#FAF5EF', s: '#E5D6CA', k: '#1A1414', m: '#3E3532', H: '#FFFFFF', z: '#9B8CFF', x: '#FFFFFF',
};
export const ORB = ['#7BD8F5', '#9B8CFF', '#F59BD6', '#8CF2C4'] as const;
export const ORB_MS = 170;

export type Eyes = 'open' | 'blink' | 'left' | 'right' | 'line' | 'cover';
export interface Pose {
  eyes?: Eyes;
  feet?: 0 | 1 | 2;      // 1: left foot lifted, 2: right foot lifted
  tilt?: -1 | 0 | 1;     // upper body shifts 1 px
  dy?: number;           // whole sprite drop in px (bob)
  stretch?: -1 | 0 | 1;  // -1 squash, +1 stretch (2 rows)
  orbUp?: boolean;
  wave?: 0 | 1 | 2;
  z?: number;            // 0..3 rising z phase, undefined = none
  sparkle?: boolean;
}

export const FRAMES = {
  idleA: {} as Pose,
  idleB: { dy: 1 } as Pose,
  blink: { eyes: 'blink' } as Pose,
  walk1: { feet: 1, tilt: 1 } as Pose,
  walk2: { feet: 2, tilt: -1 } as Pose,
  lookLeft: { eyes: 'left' } as Pose,
  lookRight: { eyes: 'right' } as Pose,
  hopSquash: { stretch: -1 } as Pose,
  hopStretch: { stretch: 1 } as Pose,
  inspect: { orbUp: true } as Pose,
  doze: { eyes: 'line', dy: 1 } as Pose,
  cover: { eyes: 'cover' } as Pose,
  dance0: { tilt: -1, dy: 0, stretch: 1 } as Pose,
  dance1: { tilt: 0, dy: 1, stretch: -1 } as Pose,
  dance2: { tilt: 1, dy: 0, stretch: 1 } as Pose,
  dance3: { tilt: 0, dy: 1, stretch: -1 } as Pose,
  wave0: { wave: 1 } as Pose,
  wave1: { wave: 2 } as Pose,
  overcharge: { sparkle: true, orbUp: true } as Pose,
} satisfies Record<string, Pose>;
export type FrameName = keyof typeof FRAMES;

type Grid = string[][];
const base = (): Grid => MAP.map((r) => r.split(''));
const set = (g: Grid, r: number, c: number, v: string) => { if (g[r] && c >= 0 && c < g[r].length) g[r][c] = v; };

/** Programmatic pose: returns a H x W cell grid (' ' empty) including the shadow row. */
export function buildGrid(p: Pose = {}): string[][] {
  let g = base();
  const hands = (r: number, c: number) => g[r][c] === 's' && r >= 10 && r <= 14 && ((c >= 2 && c <= 4) || (c >= 11 && c <= 13));

  // eyes
  const eyeCells = [[5, 4], [6, 4], [5, 11], [6, 11]];
  if (p.eyes && p.eyes !== 'open') {
    eyeCells.forEach(([r, c]) => set(g, r, c, 'w'));
    if (p.eyes === 'blink') { set(g, 6, 4, 'k'); set(g, 6, 11, 'k'); }
    else if (p.eyes === 'left') { [5, 6].forEach((r) => { set(g, r, 3, 'k'); set(g, r, 10, 'k'); }); }
    else if (p.eyes === 'right') { [5, 6].forEach((r) => { set(g, r, 5, 'k'); set(g, r, 12, 'k'); }); }
    else if (p.eyes === 'line') { [3, 4, 11, 12].forEach((c) => set(g, 6, c, 'k')); }
    else if (p.eyes === 'cover') {
      for (let r = 11; r <= 13; r++) for (const c of [2, 3, 4, 11, 12, 13]) if (hands(r, c)) set(g, r, c, 'w');
      for (const r of [5, 6]) for (const c of [3, 4, 5, 10, 11, 12]) set(g, r, c, 's');
      for (const c of [4, 5, 10, 11]) if (g[7][c] === 'w') set(g, 7, c, 'o');
    }
  }

  // orb raised 2 px (cells that would land on face details are skipped)
  if (p.orbUp) {
    const moved: [number, number, string][] = [];
    for (let r = 10; r <= 14; r++) for (let c = 2; c <= 13; c++) {
      const v = g[r][c];
      if (v === 'B' || v === 'H' || hands(r, c)) { moved.push([r, c, v]); g[r][c] = 'w'; }
    }
    for (const [r, c, v] of moved) if (g[r - 2][c] === 'w') g[r - 2][c] = v;
  }

  // wave: right hand lifted outside the body
  if (p.wave) {
    for (let r = 11; r <= 13; r++) for (const c of [11, 12, 13]) if (g[r][c] === 's') g[r][c] = 'w';
    g = g.map((row) => [...row, ' ', ' ', ' ', ' ']);
    const top = p.wave === 1 ? 6 : 7;
    for (let r = top - 1; r <= top + 2; r++) for (const c of [16, 17, 18]) set(g, r, c, 'o');
    for (let r = top; r <= top + 1; r++) for (const c of [16, 17]) set(g, r, c, 's');
  }

  // feet and tilt
  if (p.feet) {
    const cols = p.feet === 1 ? [2, 3, 4, 5] : [10, 11, 12, 13];
    cols.forEach((c) => set(g, 19, c, '.'));
    [cols[1], cols[2]].forEach((c) => set(g, 18, c, 'o'));
  }
  if (p.tilt) {
    for (let r = 0; r <= 14; r++) {
      const row = g[r];
      if (p.tilt > 0) { row.unshift('.'); row.pop(); } else { row.shift(); row.push('.'); }
    }
  }

  // squash / stretch two rows (rows 9 and 15 are plain body)
  if (p.stretch) {
    if (p.stretch > 0) { g.splice(15, 0, [...g[15]]); g.splice(9, 0, [...g[9]]); }
    else { g.splice(15, 1); g.splice(9, 1); }
  }

  // place on canvas: feet stay on the ground row
  const out: string[][] = Array.from({ length: H }, () => Array<string>(W).fill(' '));
  const rows = g.length;
  const bottom = OY + SH; // first row below the sprite = shadow row
  const dy = p.dy ?? 0;
  for (let r = 0; r < rows; r++) {
    const y = bottom - rows + r + dy;
    if (y < 0 || y >= H) continue;
    g[r].forEach((v, c) => { if (v !== '.' && OX + c < W && OX + c >= 0) out[y][OX + c] = v; });
  }
  // shadow: 1 row under feet, never moves with the bob
  for (let c = 3; c <= 12; c++) out[bottom][OX + c] = 'd';
  // z particle rising to the upper right of the head
  if (p.z !== undefined) {
    const zy = 3 - Math.min(3, p.z);
    const zx = OX + 14 + (p.z % 2);
    [[0, 0], [0, 1], [1, 1], [2, 0], [2, 1]].forEach(([r, c]) => {
      const y = zy + r - 2, x = zx + c;
      if (y >= 0 && y < H && x < W) out[Math.max(0, y)][x] = 'z';
    });
  }
  if (p.sparkle) {
    const spots: [number, number][] = [[1, 1], [2, 17], [8, 0], [9, 18], [16, 1], [15, 18]];
    spots.forEach(([r, c]) => {
      out[r][c] = 'x';
      if (r > 0) out[r - 1][c] = 'x'; if (r + 1 < H) out[r + 1][c] = 'x';
      if (c > 0) out[r][c - 1] = 'x'; if (c + 1 < W) out[r][c + 1] = 'x';
    });
  }
  return out;
}

export function mixHex(a: string, b: string, t: number): string {
  const p = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const x = p(a), y = p(b);
  return '#' + x.map((v, i) => Math.round(v + (y[i] - v) * t).toString(16).padStart(2, '0')).join('');
}

export interface DrawOpts { t?: number; tint?: string; bright?: boolean; cheek?: string; shadow?: string; staticOrb?: boolean }

/** Draw a pose into a W x H cell canvas context (already scaled, 1 unit = 1 cell). */
export function draw(ctx: CanvasRenderingContext2D, pose: Pose, o: DrawOpts = {}) {
  const grid = buildGrid(pose);
  let orb: string = o.staticOrb ? ORB[0] : ORB[Math.floor((o.t ?? 0) / ORB_MS) % ORB.length];
  if (o.tint) orb = mixHex(orb, o.tint, 0.5);
  if (o.bright || pose.sparkle) orb = mixHex(orb, '#FFFFFF', 0.45);
  ctx.clearRect(0, 0, W, H);
  for (let r = 0; r < H; r++) for (let c = 0; c < W; c++) {
    const v = grid[r][c];
    if (v === ' ') continue;
    ctx.fillStyle = v === 'B' ? orb : v === 'p' ? (o.cheek ?? '#F2A0B2') : v === 'd' ? (o.shadow ?? 'rgba(20,14,12,.22)') : COLOURS[v] ?? '#000';
    ctx.fillRect(c, r, 1, 1);
  }
}

/** Is cell (col,row) of the canvas part of the orb (for the 5-click secret)? */
export const isOrbCell = (c: number, r: number, orbUp = false) => {
  const rr = r - OY + (orbUp ? 2 : 0), cc = c - OX;
  return rr >= 10 && rr <= 14 && cc >= 5 && cc <= 10;
};
