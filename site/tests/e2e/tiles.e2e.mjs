// Tile visuals: no overlapping text, text never crosses shapes, rendered text >= 12 px, static under reduced motion.
import { chromium } from 'playwright-core';
import { spawn, spawnSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
const shots = process.argv[2]; if (shots) mkdirSync(shots, { recursive: true });
const PORT = 4395, BASE = `http://localhost:${PORT}`;
spawnSync('node', ['node_modules/astro/bin/astro.mjs', 'preview', 'stop'], { stdio: 'ignore' });
const srv = spawn('node', ['node_modules/astro/bin/astro.mjs', 'preview', '--port', String(PORT)], { stdio: 'ignore' });
for (let i = 0; i < 120; i++) { try { if ((await fetch(BASE)).ok) break; } catch {} await new Promise((r) => setTimeout(r, 250)); }
const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
let fails = 0; const ok = (c, m) => { console.log(`${c ? 'PASS' : 'FAIL'} ${m}`); if (!c) fails++; };
const IDS = ['reo2-floor', 'cuhk-x', 'lam', 'bidbrain', 'flashlob', 'flow-game', 'neural-debris', 'bdh-narrative'];
const check = () => {
  const res = {};
  const ov = (a, c) => Math.min(a.right, c.right) - Math.max(a.left, c.left) > 1 && Math.min(a.bottom, c.bottom) - Math.max(a.top, c.top) > 1;
  const inside = (a, c) => a.left >= c.left - 1 && a.right <= c.right + 1 && a.top >= c.top - 1 && a.bottom <= c.bottom + 1;
  document.querySelectorAll('[data-tile] svg.tz').forEach((svg) => {
    const id = svg.closest('[data-tile]').dataset.tile, out = [];
    const sc = svg.getBoundingClientRect().width / 240;
    const T = [...svg.querySelectorAll('text')].map((t) => ({ t, b: t.getBoundingClientRect(), fs: parseFloat(getComputedStyle(t).fontSize) * sc }));
    const S = [...svg.querySelectorAll('rect,circle')].map((x) => ({ x, b: x.getBoundingClientRect() }));
    T.forEach((x) => { if (x.fs < 11.95) out.push(`FONT ${x.fs.toFixed(1)}px "${x.t.textContent}"`); });
    for (let i = 0; i < T.length; i++) for (let j = i + 1; j < T.length; j++) if (ov(T[i].b, T[j].b)) out.push(`TEXT/TEXT "${T[i].t.textContent}" x "${T[j].t.textContent}"`);
    T.forEach((x) => S.forEach((y) => { if (ov(x.b, y.b) && !inside(x.b, y.b) && y.b.width > 8 && y.b.height > 8) out.push(`TEXT/SHAPE "${x.t.textContent}" crosses ${y.x.getAttribute('class')}`); }));
    const vb = svg.getBoundingClientRect();
    T.forEach((x) => { if (x.b.left < vb.left - 1 || x.b.right > vb.right + 1 || x.b.top < vb.top - 1 || x.b.bottom > vb.bottom + 1) out.push(`CLIPPED "${x.t.textContent}"`); });
    res[id] = { out, h: Math.round(vb.height), w: Math.round(vb.width) };
  });
  return res;
};
try {
  for (const [w, h] of [[1440, 900], [1024, 900], [390, 844]]) {
    const ctx = await b.newContext({ viewport: { width: w, height: h }, reducedMotion: 'reduce' }); const p = await ctx.newPage();
    await p.goto(BASE); await p.waitForTimeout(800); await p.evaluate(() => document.fonts.ready);
    const r = await p.evaluate(check);
    for (const id of IDS) ok(r[id] && r[id].out.length === 0, `${w}px ${id} tile visual (${r[id]?.w}x${r[id]?.h}) ${r[id]?.out.slice(0, 3).join(' | ')}`);
    if (w === 1440 && shots) for (const id of IDS) { await p.locator(`[data-tile="${id}"] .dwrap`).scrollIntoViewIfNeeded(); await p.locator(`[data-tile="${id}"] .dwrap`).screenshot({ path: `${shots}/tile-${id}.png` }); }
    await ctx.close();
  }
  for (const [w, h] of [[1440, 900], [390, 844]]) {
    const ctx = await b.newContext({ viewport: { width: w, height: h } }); const p = await ctx.newPage(); const errs = []; p.on('pageerror', (e) => errs.push(String(e)));
    await p.goto(BASE); await p.waitForTimeout(1500);
    ok(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `home ${w}: no horizontal scroll`);
    ok(errs.length === 0, `home ${w}: no page errors`);
    if (shots) await p.screenshot({ path: `${shots}/home-${w}.png`, fullPage: true });
    await ctx.close();
  }
} finally { await b.close(); srv.kill(); }
console.log(fails ? `${fails} FAILED` : 'ALL PASSED'); process.exit(fails ? 1 : 0);
