// Probe follow-the-cursor: records short frame sequences and asserts the sprite and bubble never overlap content.
// Usage: node tests/e2e/probe2.e2e.mjs [shotDir]
import { chromium } from 'playwright-core';
import { spawn, spawnSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
const shots = process.argv[2]; if (shots) mkdirSync(shots, { recursive: true });
const PORT = 4389, BASE = `http://localhost:${PORT}`;
spawnSync('node', ['node_modules/astro/bin/astro.mjs', 'preview', 'stop'], { stdio: 'ignore' });
const srv = spawn('node', ['node_modules/astro/bin/astro.mjs', 'preview', '--port', String(PORT)], { stdio: 'ignore' });
for (let i = 0; i < 120; i++) { try { if ((await fetch(BASE)).ok) break; } catch {} await new Promise((r) => setTimeout(r, 250)); }
const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
let fails = 0; const ok = (c, m) => { console.log(`${c ? 'PASS' : 'FAIL'} ${m}`); if (!c) fails++; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// sprite box, bubble box and content rects in client coordinates
const probeState = () => {
  const c = document.querySelector('.probe-c'), bub = document.querySelector('.probe-bubble');
  const cr = c.getBoundingClientRect(), s = cr.width / 22;
  const sprite = { l: cr.left + 3 * s, t: cr.top + 4 * s, r: cr.left + 19 * s, b: cr.top + 24 * s - 3 };
  const br = bub && !bub.hidden && getComputedStyle(bub).visibility !== 'hidden' ? bub.getBoundingClientRect() : null;
  const rects = [];
  document.querySelectorAll('.hero .intro > *, #skills .intro, #skills .group, #contact .grid > *, footer.foot .in > *, [data-content], [data-probe-board], [data-tile]').forEach((e) => { const r = e.getBoundingClientRect(); if (r.width && r.height) rects.push({ k: e.dataset?.tile ? 'tile:' + e.dataset.tile : e.tagName, l: r.left, t: r.top, r: r.right, b: r.bottom }); });
  document.querySelectorAll('main h2').forEach((e) => { const g = document.createRange(); g.selectNodeContents(e); const r = g.getBoundingClientRect(); if (r.width) rects.push({ k: 'h2', l: r.left, t: r.top, r: r.right, b: r.bottom }); });
  const nav = document.querySelector('.nav')?.getBoundingClientRect();
  return { sprite, bubble: br && { l: br.left, t: br.top, r: br.right, b: br.bottom }, rects, navB: nav?.bottom ?? 0, op: getComputedStyle(c).visibility === 'hidden' ? '0' : getComputedStyle(c).opacity, tf: c.style.transform, state: document.querySelector('.probe-layer')?.dataset.state, text: bub && !bub.hidden ? bub.textContent : null, side: bub?.dataset.side, dbg: window.__probe?.dbg() };
};
const overlaps = (s, rects, tol = 1) => rects.filter((r) => s.l < r.r - tol && s.r > r.l + tol && s.t < r.b - tol && s.b > r.t + tol);

async function record(p, name, n, driver) {
  const frames = []; let bad = 0; const detail = [];
  for (let i = 0; i < n; i++) {
    const t0 = Date.now();
    if (driver) await driver(i);
    const st = await p.evaluate(probeState);
    frames.push(st);
    // the sprite stands on its own tile top / shelf line: ignore a 3 px sliver on that surface, and frames mid-fade
    const own = overlaps(st.sprite, st.rects, 2);
    const hitSprite = Number(st.op) < 0.99 ? [] : own;
    const hitBubble = st.bubble ? overlaps(st.bubble, st.rects, 2) : [];
    if (hitSprite.length || hitBubble.length) { bad++; detail.push(`#${i} sprite:${hitSprite.map((r) => r.k)} bubble:${hitBubble.map((r) => r.k)} ${hitBubble.length ? JSON.stringify({ b: st.bubble && [st.bubble.l, st.bubble.t, st.bubble.r, st.bubble.b].map(Math.round), r: hitBubble.map((r) => [r.l, r.t, r.r, r.b].map(Math.round)), sp: [st.sprite.l, st.sprite.t].map(Math.round), op: st.op, side: st.side, dbg: st.dbg }) : ''}`); }
    if (shots) await p.screenshot({ path: `${shots}/${name}-${String(i).padStart(2, '0')}.png` });
    await sleep(Math.max(0, 100 - (Date.now() - t0)));
  }
  ok(bad === 0, `${name}: ${n} frames, sprite and bubble never overlap content ${detail.join(' | ')}`);
  return frames;
}

try {
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', (e) => errs.push(String(e)));
  await p.goto(BASE); await p.waitForTimeout(1500);
  await p.evaluate(() => window.scrollTo({ top: document.querySelector('#achievements').offsetTop - 120, behavior: 'instant' })); await p.waitForTimeout(600);
  // (a) cursor sweeping across a shelf: smooth, no jitter
  await p.mouse.move(160, 700); await p.waitForTimeout(900);
  const A = await record(p, 'a-sweep', 10, async (i) => { await p.mouse.move(160 + i * 125, 640 + (i % 3) * 8, { steps: 6 }); });
  const xs = A.map((f) => parseInt(/translate\((-?\d+)px/.exec(f.tf)[1], 10));
  let reversals = 0; for (let i = 2; i < xs.length; i++) if ((xs[i] - xs[i - 1]) * (xs[i - 1] - xs[i - 2]) < -400) reversals++;
  ok(reversals === 0, `a-sweep: no back-and-forth jitter (x per frame ${xs.join(',')})`);
  ok(xs.every((x) => Number.isInteger(x)), 'a-sweep: rendered position is whole CSS pixels');
  // (b) hover a tile ~450 ms: the bubble appears without a click
  await p.mouse.move(700, 120); await p.waitForTimeout(3500);
  const tile = await p.locator('[data-tile="lam"]').boundingBox();
  const B = await record(p, 'b-hover', 10, async (i) => { if (i === 0) await p.mouse.move(tile.x + tile.width * 0.5, tile.y + tile.height * 0.4, { steps: 4 }); });
  ok(B.slice(5).some((f) => f.text && /Four of us/.test(f.text)), `b-hover: lam's line appears within ~1 s of hovering, no click (${B.map((f) => f.text ? 'bubble' : '-').join(' ')})`);
  // (c) scroll down two shelves, Probe climbs down; (d) scroll up, Probe climbs up
  await p.mouse.move(900, 500); await p.waitForTimeout(1200);
  const C = await record(p, 'c-scroll-down', 10, async (i) => { if (i === 1) await p.mouse.wheel(0, 1300); });
  await p.waitForTimeout(700);
  const afterDown = await p.evaluate(probeState);
  ok(afterDown.sprite.b > 0 && afterDown.sprite.t > afterDown.navB - 2 && afterDown.sprite.b < 900 + 4, `c: Probe is back on screen within ~1.7 s of scrolling (sprite y ${Math.round(afterDown.sprite.t)}..${Math.round(afterDown.sprite.b)})`);
  const D = await record(p, 'd-scroll-up', 10, async (i) => { if (i === 1) await p.mouse.wheel(0, -1300); });
  await p.waitForTimeout(700);
  const afterUp = await p.evaluate(probeState);
  ok(afterUp.sprite.t > afterUp.navB - 2 && afterUp.sprite.b < 900 + 4, `d: Probe is visible after scrolling back up (sprite y ${Math.round(afterUp.sprite.t)}..${Math.round(afterUp.sprite.b)})`);
  // never off screen for more than ~600 ms after scrolling stops
  await p.mouse.wheel(0, 1600); await p.waitForTimeout(250);
  const t0 = Date.now(); let gone = 0; let last = Date.now();
  while (Date.now() - t0 < 1800) { const st = await p.evaluate(probeState); const vis = st.sprite.b > st.navB && st.sprite.t < 900; const now = Date.now(); if (!vis) gone += now - last; last = now; await sleep(40); }
  ok(gone <= 700, `after a fast scroll, Probe was off screen for ${gone} ms in the next 1.8 s`);
  ok(errs.length === 0, 'no page errors ' + errs.join('|'));
  await ctx.close();
} finally { await b.close(); srv.kill(); }
console.log(fails ? `${fails} FAILED` : 'ALL PASSED'); process.exit(fails ? 1 : 0);
