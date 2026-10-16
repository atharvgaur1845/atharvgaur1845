// Accessibility and responsive pass. Run against a SHOW_DRAFTS=1 build so the field notes exist.
// Usage: SHOW_DRAFTS=1 npm run build && node tests/e2e/a11y.e2e.mjs [shotDir]
import { chromium } from 'playwright-core';
import { spawn, spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
const axeSrc = readFileSync(createRequire(import.meta.url).resolve('axe-core/axe.min.js'), 'utf8');
const shots = process.argv[2]; if (shots) mkdirSync(shots, { recursive: true });
const PORT = 4393, BASE = `http://localhost:${PORT}`;
spawnSync('node', ['node_modules/astro/bin/astro.mjs', 'preview', 'stop'], { stdio: 'ignore' });
const srv = spawn('node', ['node_modules/astro/bin/astro.mjs', 'preview', '--port', String(PORT)], { stdio: 'ignore' });
for (let i = 0; i < 120; i++) { try { if ((await fetch(BASE)).ok) break; } catch {} await new Promise((r) => setTimeout(r, 250)); }
const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
let fails = 0; const ok = (c, m) => { console.log(`${c ? 'PASS' : 'FAIL'} ${m}`); if (!c) fails++; };
const IDS = ['cuhk-x', 'reo2-floor', 'bidbrain', 'lam', 'flashlob', 'flow-game', 'neural-debris', 'bdh-narrative'];
const PAGES = ['/', ...IDS.map((i) => `/p/${i}/`), '/p/deca/', '/p/physmon/', '/notes/cuhk-x-breakdown/', '/notes/reo2-floor-walkthrough/', '/404.html'];
const mk = async (o = {}) => { const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, ...o }); return { ctx, p: await ctx.newPage() }; };
try {
  // axe on every route (serious and critical must be zero)
  { const { ctx, p } = await mk();
    for (const path of PAGES) {
      await p.goto(BASE + path); await p.waitForTimeout(700); await p.evaluate(() => document.fonts.ready);
      await p.evaluate(axeSrc);
      const res = await p.evaluate(async () => (await axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'] } })).violations.map((v) => ({ id: v.id, impact: v.impact, n: v.nodes.length, sample: v.nodes[0].target.join(' '), msg: v.nodes[0].failureSummary?.split('\n')[1] })));
      const bad = res.filter((v) => v.impact === 'serious' || v.impact === 'critical');
      ok(bad.length === 0, `axe ${path}: ${bad.length} serious/critical ${bad.map((v) => `${v.id}(${v.n}) ${v.sample} ${v.msg}`).join(' | ')}`);
      const minor = res.filter((v) => v.impact !== 'serious' && v.impact !== 'critical');
      if (minor.length) console.log(`  note ${path}: moderate/minor: ${minor.map((v) => `${v.id}(${v.n})`).join(', ')}`);
    }
    await ctx.close(); }
  // axe again at phone width (scrollable regions must be focusable and named)
  { const { ctx, p } = await mk({ viewport: { width: 390, height: 844 } });
    for (const path of PAGES) {
      await p.goto(BASE + path); await p.waitForTimeout(600); await p.evaluate(() => document.fonts.ready); await p.evaluate(axeSrc);
      const res = await p.evaluate(async () => (await axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'] } })).violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => `${v.id}(${v.nodes.length}) ${v.nodes[0].target.join(' ')}`));
      ok(res.length === 0, `axe 390px ${path}: ${res.length} serious/critical ${res.join(' | ')}`);
    }
    await ctx.close(); }
  // no horizontal scroll at every width, on every kind of page
  for (const w of [360, 390, 768, 1024, 1280, 1440]) {
    const { ctx, p } = await mk({ viewport: { width: w, height: 900 } });
    for (const path of ['/', '/p/cuhk-x/', '/p/bdh-narrative/', '/p/deca/', '/notes/cuhk-x-breakdown/', '/notes/reo2-floor-walkthrough/', '/404.html']) {
      await p.goto(BASE + path); await p.waitForTimeout(500);
      const sw = await p.evaluate(() => [document.documentElement.scrollWidth, innerWidth]);
      ok(sw[0] <= sw[1], `${w}px ${path}: no horizontal scroll (${sw[0]}/${sw[1]})`);
    }
    if ((w === 390 || w === 768) && shots) { await p.goto(BASE + '/'); await p.waitForTimeout(1200); await p.screenshot({ path: `${shots}/home-${w}.png`, fullPage: true }); }
    await ctx.close();
  }
  // notes + 404 screenshots
  for (const w of [1440, 390]) { const { ctx, p } = await mk({ viewport: { width: w, height: 900 } });
    for (const s of ['cuhk-x-breakdown', 'reo2-floor-walkthrough']) { await p.goto(`${BASE}/notes/${s}/`); await p.waitForTimeout(800); if (shots) await p.screenshot({ path: `${shots}/note-${s}-${w}.png`, fullPage: w === 390 ? false : false }); }
    await p.goto(BASE + '/404.html'); await p.waitForTimeout(1500); if (shots) await p.screenshot({ path: `${shots}/404-${w}.png` });
    await ctx.close(); }
  // keyboard-only walkthrough
  { const { ctx, p } = await mk(); await p.goto(BASE + '/'); await p.waitForTimeout(1200);
    const seq = []; let noRing = 0;
    for (let i = 0; i < 45; i++) { await p.keyboard.press('Tab'); const r = await p.evaluate(() => { const e = document.activeElement; const cs = getComputedStyle(e); const vis = cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) > 0 || cs.boxShadow !== 'none'; return { t: (e.getAttribute('aria-label') || e.textContent || e.tagName).trim().slice(0, 24), vis, tag: e.tagName }; }); seq.push(r.t); if (!r.vis && r.tag !== 'BODY') noRing++; }
    ok(noRing === 0, `keyboard: every one of 45 tab stops shows a focus indicator (${noRing} without)`);
    ok(seq[0] === 'Skip to content', `keyboard: first stop is the skip link (${seq[0]})`);
    ok(!(await p.evaluate(() => !!document.querySelector('.probe-layer') && document.activeElement.closest('.probe-layer'))), 'keyboard: Probe is never a tab stop');
    // open a panel with the keyboard, trap, Escape returns focus
    await p.locator('[data-tile="lam"] a.card').focus(); await p.keyboard.press('Enter'); await p.waitForTimeout(600);
    ok(await p.evaluate(() => document.activeElement.id === 'lam-title'), 'keyboard: Enter opens the panel and focuses its title');
    const seen = new Set(); for (let i = 0; i < 40; i++) { await p.keyboard.press('Tab'); seen.add(await p.evaluate(() => document.querySelector('.p-root:not([hidden]) .p-win').contains(document.activeElement))); }
    ok(seen.size === 1 && seen.has(true), 'keyboard: focus stays inside the panel');
    await p.keyboard.press('Escape'); await p.waitForTimeout(500);
    ok(await p.evaluate(() => document.activeElement.closest('[data-tile]')?.dataset.tile === 'lam'), 'keyboard: Escape returns focus to the tile');
    await p.locator('[data-tile="deca"] a.lk-btn').focus(); await p.keyboard.press('Enter'); await p.waitForTimeout(500);
    ok(await p.evaluate(() => document.getElementById('lk-dialog').open && document.getElementById('lk-dialog').contains(document.activeElement)), 'keyboard: locked dialog opens with focus inside');
    await p.keyboard.press('Escape'); await p.waitForTimeout(400);
    ok(await p.evaluate(() => document.activeElement.dataset.lk === 'deca'), 'keyboard: locked dialog Escape returns focus to More info');
    await ctx.close(); }
} finally { await b.close(); srv.kill(); }
console.log(fails ? `${fails} FAILED` : 'ALL PASSED'); process.exit(fails ? 1 : 0);
