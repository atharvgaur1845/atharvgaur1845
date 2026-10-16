// Probe random-cursor stress: sprite and bubble must never overlap content, at 1440 and 1024 wide.
// Usage: node tests/e2e/probe-random.e2e.mjs [seed]
import { chromium } from 'playwright-core';
import { spawn, spawnSync } from 'node:child_process';
const PORT = 4391, BASE = `http://localhost:${PORT}`;
spawnSync('node', ['node_modules/astro/bin/astro.mjs', 'preview', 'stop'], { stdio: 'ignore' });
const srv = spawn('node', ['node_modules/astro/bin/astro.mjs', 'preview', '--port', String(PORT)], { stdio: 'ignore' });
for (let i = 0; i < 120; i++) { try { if ((await fetch(BASE)).ok) break; } catch {} await new Promise((r) => setTimeout(r, 250)); }
const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let seed = Number(process.argv[2]) || (Date.now() % 2147483647);
const rnd = () => (seed = (seed * 48271) % 2147483647) / 2147483647;

// same definitions as probe2.e2e.mjs
const probeState = () => {
  const c = document.querySelector('.probe-c'), bub = document.querySelector('.probe-bubble');
  const cr = c.getBoundingClientRect(), s = cr.width / 22;
  const sprite = { l: cr.left + 3 * s, t: cr.top + 4 * s, r: cr.left + 19 * s, b: cr.top + 24 * s - 3 };
  const br = bub && !bub.hidden && getComputedStyle(bub).visibility !== 'hidden' ? bub.getBoundingClientRect() : null;
  const rects = [];
  document.querySelectorAll('.hero .intro > *, #skills .intro, #skills .group, #contact .grid > *, footer.foot .in > *, [data-content], [data-probe-board], [data-tile]').forEach((e) => { const r = e.getBoundingClientRect(); if (r.width && r.height) rects.push({ k: e.dataset?.tile ? 'tile:' + e.dataset.tile : e.tagName, l: r.left, t: r.top, r: r.right, b: r.bottom }); });
  document.querySelectorAll('main h2').forEach((e) => { const g = document.createRange(); g.selectNodeContents(e); const r = g.getBoundingClientRect(); if (r.width) rects.push({ k: 'h2', l: r.left, t: r.top, r: r.right, b: r.bottom }); });
  return { sprite, bubble: br && { l: br.left, t: br.top, r: br.right, b: br.bottom }, rects, op: getComputedStyle(c).visibility === 'hidden' ? 0 : Number(getComputedStyle(c).opacity), text: br ? bub.textContent : null };
};
const overlaps = (s, rects, tol = 1) => rects.filter((r) => s.l < r.r - tol && s.r > r.l + tol && s.t < r.b - tol && s.b > r.t + tol);

let fails = 0, steps = 0, bubbleSeen = 0;
try {
  for (const width of [1440, 1024]) {
    const ctx = await b.newContext({ viewport: { width, height: 900 } });
    const p = await ctx.newPage(); const errs = [];
    p.on('pageerror', (e) => errs.push(String(e)));
    await p.goto(BASE); await p.waitForTimeout(1500);
    const maxY = await p.evaluate(() => document.documentElement.scrollHeight - innerHeight);
    for (let i = 0; i < 200; i++) {
      if (i > 0 && i % 25 === 0) { await p.evaluate((y) => window.scrollTo({ top: y, behavior: 'instant' }), Math.floor(rnd() * maxY)); await sleep(400); }
      await p.mouse.move(Math.floor(rnd() * width), Math.floor(rnd() * 900), { steps: 4 });
      await sleep(140);
      const st = await p.evaluate(probeState); steps++;
      if (st.op < 0.5) continue;
      if (st.bubble) bubbleSeen++;
      const hs = overlaps(st.sprite, st.rects, 2), hb = st.bubble ? overlaps(st.bubble, st.rects, 2) : [];
      if (hs.length || hb.length) { fails++; console.log(`FAIL w${width} #${i} sp=${JSON.stringify(st.sprite)} hit=${JSON.stringify(hs.concat(hb))} sprite:${hs.map((r) => r.k)} bubble:${hb.map((r) => r.k)} text:${st.text}`); }
    }
    if (errs.length) { fails++; console.log('FAIL page errors ' + errs.join('|')); }
    await ctx.close();
  }
} finally { await b.close(); srv.kill(); }
console.log(`probe-random: ${steps} steps, ${bubbleSeen} with bubble, ${fails} failures${fails ? '' : ' ALL PASSED'}`);
process.exit(fails ? 1 : 0);
