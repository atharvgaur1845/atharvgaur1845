// Playwright (playwright-core + system Chrome) checks for the CUHK-X panel. Usage: node tests/e2e/panel.e2e.mjs [shotDir]
import { chromium } from 'playwright-core';
import { spawn, spawnSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';

const shots = process.argv[2];
if (shots) mkdirSync(shots, { recursive: true });
const PORT = 4398, BASE = `http://localhost:${PORT}`;
spawnSync('node', ['node_modules/astro/bin/astro.mjs', 'preview', 'stop'], { stdio: 'ignore' });
const srv = spawn('node', ['node_modules/astro/bin/astro.mjs', 'preview', '--port', String(PORT)], { stdio: 'ignore' });
for (let i = 0; i < 120; i++) { try { if ((await fetch(BASE)).ok) break; } catch {} await new Promise((r) => setTimeout(r, 250)); }
const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
let fails = 0;
const ok = (c, m) => { console.log(`${c ? 'PASS' : 'FAIL'} ${m}`); if (!c) fails++; };
const snap = (p, n, o = {}) => shots && p.screenshot({ path: `${shots}/${n}.png`, ...o });
const mk = async (o = {}) => { const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, ...o }); const p = await ctx.newPage(); const errs = []; p.on('pageerror', (e) => errs.push(String(e))); p.errs = errs; return { ctx, p }; };
const openPanel = async (p) => { await p.locator('[data-tile="cuhk-x"] a.card').scrollIntoViewIfNeeded(); await p.click('[data-tile="cuhk-x"] a.card'); await p.waitForTimeout(600); };
const visible = (p) => p.evaluate(() => !!document.querySelector('.p-root:not([hidden])'));
const activeId = (p) => p.evaluate(() => document.activeElement?.id || document.activeElement?.className || document.activeElement?.tagName);

try {
  // desktop open, URL, focus, inert, dialog attrs
  { const { ctx, p } = await mk(); await p.goto(BASE); await p.waitForTimeout(1200);
    ok(!(await visible(p)), 'panel hidden on home');
    await openPanel(p);
    ok(await visible(p), 'click opens panel');
    ok(new URL(p.url()).pathname === '/p/cuhk-x/', 'URL pushed to /p/cuhk-x/');
    ok((await activeId(p)) === 'cuhk-x-title', 'focus on title');
    ok(await p.evaluate(() => document.querySelector('#main').inert && document.querySelector('.nav').inert), 'page behind is inert');
    const d = await p.evaluate(() => { const w = document.querySelector('.p-root:not([hidden]) .p-win'); const r = w.getBoundingClientRect(); return { role: w.getAttribute('role'), modal: w.getAttribute('aria-modal'), lb: w.getAttribute('aria-labelledby'), w: r.width, h: r.height, top: r.top }; });
    ok(d.role === 'dialog' && d.modal === 'true' && d.lb === 'cuhk-x-title', 'dialog aria');
    ok(d.w <= 1080 && d.h <= 900 * 0.88 + 1, `size ${Math.round(d.w)}x${Math.round(d.h)} within 1080 / 88vh`);
    ok(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth) , 'no horizontal page overflow');
    await snap(p, 'panel-1440-top');
    // Probe perched
    ok(await p.evaluate(() => document.querySelector('.probe-layer')?.dataset.state === 'perched'), 'Probe perched on panel');
    // focus trap
    for (let i = 0; i < 60; i++) await p.keyboard.press('Tab');
    ok(await p.evaluate(() => document.querySelector('.p-root:not([hidden]) .p-win').contains(document.activeElement)), 'focus trapped after 60 tabs');
    // scroll-spy + index
    await p.click('.p-root:not([hidden]) .p-idx a[data-spy="cuhk-x-decisions"]'); await p.waitForTimeout(900);
    ok(await p.evaluate(() => document.querySelector('.p-root:not([hidden]) .p-idx a[aria-current="true"]')?.dataset.spy) === 'cuhk-x-decisions', 'scroll-spy follows index click');
    await snap(p, 'panel-1440-decisions');
    await p.click('.p-root:not([hidden]) .p-idx a[data-spy="cuhk-x-map"]'); await p.waitForTimeout(900);
    await snap(p, 'panel-1440-map');
    // tooltip
    const g = p.locator('.p-root:not([hidden]) .cx-fig [data-tip]').first(); await g.hover(); await p.waitForTimeout(300);
    ok(await p.evaluate(() => document.querySelector('.p-root:not([hidden]) .p-tip').classList.contains('on')), 'map tooltip shows on hover');
    await snap(p, 'panel-1440-map-tooltip');
    // Escape
    await p.keyboard.press('Escape'); await p.waitForTimeout(700);
    ok(!(await visible(p)), 'Escape closes'); ok(new URL(p.url()).pathname === '/', 'URL back to /');
    ok(await p.evaluate(() => document.activeElement?.closest('[data-tile]')?.dataset.tile) === 'cuhk-x', 'focus returns to the tile');
    ok(await p.evaluate(() => !document.querySelector('#main').inert), 'inert removed');
    // x button, backdrop, back button
    await openPanel(p); await p.click('.p-root:not([hidden]) .p-x'); await p.waitForTimeout(700); ok(!(await visible(p)), 'x closes');
    await openPanel(p); await p.mouse.click(30, 450); await p.waitForTimeout(700); ok(!(await visible(p)), 'backdrop click closes');
    await openPanel(p); await p.goBack(); await p.waitForTimeout(700); ok(!(await visible(p)), 'browser Back closes');
    await p.goForward(); await p.waitForTimeout(700); ok(await visible(p), 'Forward reopens');
    await p.click('.p-root:not([hidden]) .p-back'); await p.waitForTimeout(700); ok(!(await visible(p)), 'back link closes');
    ok(p.errs.length === 0, 'no page errors ' + p.errs.join('|'));
    await ctx.close(); }
  // first-visit greeting must not cover the lab board
  { const { ctx, p } = await mk(); await p.goto(BASE); await p.waitForTimeout(1300);
    const r = await p.evaluate(() => { const b = document.querySelector('.probe-bubble'); const d = document.querySelector('[data-probe-board]').getBoundingClientRect(); const x = b.getBoundingClientRect(); return { shown: !b.hidden, txt: b.textContent, hit: Math.min(x.right, d.right) - Math.max(x.left, d.left) > 1 && Math.min(x.bottom, d.bottom) - Math.max(x.top, d.top) > 1, side: b.dataset.side }; });
    ok(r.shown && /Hi, I'm Probe/.test(r.txt) && !r.hit, `greeting bubble clear of the lab board (side: ${r.side})`);
    await snap(p, 'greeting-1440'); await ctx.close(); }
  // tile mini figure
  { const { ctx, p } = await mk(); await p.goto(BASE); await p.waitForTimeout(800);
    ok(await p.evaluate(() => !!document.querySelector('[data-tile="cuhk-x"] svg.tz[aria-hidden="true"]') && !document.querySelector('[data-tile="cuhk-x"] [data-tip]')), 'tile shows the simple visual, aria-hidden, no tooltips');
    await ctx.close(); }
  // deep link without JS
  { const { ctx, p } = await mk({ javaScriptEnabled: false }); await p.goto(`${BASE}/p/cuhk-x/`); await p.waitForTimeout(500);
    ok(await visible(p), 'deep link renders panel open without JS'); await snap(p, 'deep-link-nojs');
    ok(await p.evaluate(() => document.querySelectorAll('.p-root:not([hidden]) .p-win table').length === 2), 'decisions and evidence are tables');
    await ctx.close(); }
  // deep link with JS, close
  { const { ctx, p } = await mk(); await p.goto(`${BASE}/p/cuhk-x/`); await p.waitForTimeout(1500);
    ok(await visible(p), 'deep link open with JS'); ok((await activeId(p)) === 'cuhk-x-title', 'deep link focuses title');
    ok(await p.evaluate(() => document.querySelector('.probe-layer')?.dataset.state === 'perched'), 'Probe perched on deep link');
    await snap(p, 'deep-link-1440');
    await p.keyboard.press('Escape'); await p.waitForTimeout(700);
    ok(!(await visible(p)) && new URL(p.url()).pathname === '/', 'deep link closes to /');
    await ctx.close(); }
  // reduced motion
  { const { ctx, p } = await mk({ reducedMotion: 'reduce' }); await p.goto(BASE); await p.waitForTimeout(800);
    await p.evaluate(() => { window.__anims = []; const o = Element.prototype.animate; Element.prototype.animate = function (k, opt) { window.__anims.push({ kf: JSON.stringify(k), d: opt.duration }); return o.call(this, k, opt); }; });
    await openPanel(p);
    const a = await p.evaluate(() => window.__anims);
    ok(a.length > 0 && a.every((x) => !x.kf.includes('scale') && !x.kf.includes('translate') && x.d === 150), 'reduced motion: 150 ms fade only, no FLIP ' + JSON.stringify(a.map((x) => x.d)));
    const ov = await p.evaluate(() => {
      const out = [], svg = document.querySelector('.p-root:not([hidden]) .p-win .cx-svg');
      const T = [...svg.querySelectorAll('text')].filter((t) => getComputedStyle(t).opacity !== '0').map((t) => ({ t, b: t.getBoundingClientRect() }));
      const hit = (a, b) => Math.min(a.right, b.right) - Math.max(a.left, b.left) > 1 && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 1;
      for (let i = 0; i < T.length; i++) for (let j = i + 1; j < T.length; j++) if (hit(T[i].b, T[j].b)) out.push(T[i].t.textContent + ' x ' + T[j].t.textContent);
      return out;
    });
    ok(ov.length === 0, 'map: no overlapping text in the figure ' + ov.join(' | '));
    await p.keyboard.press('Escape'); await p.waitForTimeout(500); ok(!(await visible(p)), 'reduced motion closes');
    await ctx.close(); }
  // phone sheet
  { const { ctx, p } = await mk({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 }); await p.goto(BASE); await p.waitForTimeout(1000);
    await p.evaluate(() => document.querySelector('[data-tile="cuhk-x"]').scrollIntoView({ behavior: 'instant', block: 'center' }));
    await p.tap('[data-tile="cuhk-x"] a.card'); await p.waitForTimeout(600);
    ok(await visible(p), 'phone: tap opens sheet');
    const r = await p.evaluate(() => { const w = document.querySelector('.p-root:not([hidden]) .p-win').getBoundingClientRect(); return { w: w.width, h: w.height, top: w.top, sw: document.documentElement.scrollWidth }; });
    ok(r.w === 390 && Math.abs(r.h - 844) < 2 && r.top === 0, `phone: full-height sheet ${r.w}x${r.h}`);
    ok(r.sw === 390, 'phone: no horizontal page scroll'); await snap(p, 'phone-390-sheet');
    await p.evaluate(() => document.querySelector('.p-root:not([hidden]) .p-body').scrollTo(0, 99999)); await snap(p, 'phone-390-sheet-end');
    await p.tap('.p-root:not([hidden]) .p-x'); await p.waitForTimeout(600); ok(!(await visible(p)), 'phone: x closes');
    await ctx.close(); }

  // ---- Stage 4: every panel, every figure, locked dialogs, deep links
  const IDS = ['cuhk-x', 'reo2-floor', 'bidbrain', 'lam', 'flashlob', 'flow-game', 'neural-debris', 'bdh-narrative'];
  const OSS = ['bossconsole', 'erc-nav', 'cognee'];
  const overlapJs = () => {
    const out = [];
    const svg = document.querySelector('.p-root:not([hidden]) .p-win figure svg');
    const T = [...svg.querySelectorAll('text')].filter((t) => getComputedStyle(t).opacity !== '0' && getComputedStyle(t.parentNode).opacity !== '0').map((t) => ({ t, b: t.getBoundingClientRect() }));
    const S = [...svg.querySelectorAll('rect,circle')].filter((x) => !x.getAttribute('class')?.includes('-panel')).map((x) => ({ x, b: x.getBoundingClientRect() }));
    const ov = (a, b) => Math.min(a.right, b.right) - Math.max(a.left, b.left) > 1 && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 1;
    const inside = (a, b) => a.left >= b.left - 1 && a.right <= b.right + 1 && a.top >= b.top - 1 && a.bottom <= b.bottom + 1;
    for (let i = 0; i < T.length; i++) for (let j = i + 1; j < T.length; j++) if (ov(T[i].b, T[j].b)) out.push(`TEXT/TEXT "${T[i].t.textContent}" x "${T[j].t.textContent}"`);
    T.forEach((x) => S.forEach((y) => { if (ov(x.b, y.b) && !inside(x.b, y.b) && y.b.width > 14) out.push(`TEXT/SHAPE "${x.t.textContent}" crosses ${y.x.tagName}@${Math.round(y.b.left)},${Math.round(y.b.top)}`); }));
    const pr = [...svg.querySelectorAll('rect')].filter((x) => x.getAttribute('class')?.includes('-panel')).map((x) => x.getBoundingClientRect());
    T.forEach((x) => { if (pr.some((q) => ov(x.b, q)) && !pr.some((q) => inside(x.b, q))) out.push(`CROSSES PANEL EDGE "${x.t.textContent}"`); });
    return out;
  };
  { const { ctx, p } = await mk({ reducedMotion: 'reduce' }); await p.goto(BASE); await p.waitForTimeout(1200);
    await p.evaluate(() => document.fonts.ready);
    for (const id of IDS) {
      await p.locator(`[data-tile="${id}"] a.card`).scrollIntoViewIfNeeded();
      ok(await p.evaluate((id) => !!document.querySelector(`[data-tile="${id}"] svg:not([role])`) && !document.querySelector(`[data-tile="${id}"] [data-tip]`), id), `${id}: compact figure on tile, no tooltips`);
      await p.click(`[data-tile="${id}"] a.card`); await p.waitForTimeout(500);
      ok(await visible(p) && new URL(p.url()).pathname === `/p/${id}/`, `${id}: opens, URL /p/${id}/`);
      ok((await activeId(p)) === `${id}-title`, `${id}: focus on title`);
      const info = await p.evaluate(() => { const r = document.querySelector('.p-root:not([hidden])'); return { idx: [...r.querySelectorAll('.p-idx a')].map((a) => a.textContent), secs: [...r.querySelectorAll('.p-body > section')].length, tables: r.querySelectorAll('.p-tbl table').length, fig: !!r.querySelector('figure svg[role="img"]'), details: !!r.querySelector('figure details') }; });
      ok(info.idx.length === info.secs && info.secs >= 6, `${id}: index built from sections [${info.idx.join(' · ')}]`);
      ok(info.fig && info.details, `${id}: full figure with text equivalent`);
      await p.evaluate((id) => document.getElementById(`${id}-map`).scrollIntoView({ block: 'start' }), id); await p.waitForTimeout(500);
      const ov = await p.evaluate(overlapJs);
      ok(ov.length === 0, `${id}: figure overlap check ${ov.slice(0, 4).join(' | ')}`);
      await snap(p, `map-${id}`);
      await p.keyboard.press('Escape'); await p.waitForTimeout(450);
      ok(!(await visible(p)), `${id}: Escape closes`);
    }
    await ctx.close(); }
  // deep links without JS for every panel
  { const { ctx, p } = await mk({ javaScriptEnabled: false });
    for (const id of IDS) { const r = await p.goto(`${BASE}/p/${id}/`); ok(r.status() === 200 && await p.evaluate((id) => !document.getElementById(`panel-${id}`).hidden, id), `deep link /p/${id}/ renders panel open (no JS)`); }
    for (const id of ['deca', 'physmon']) { await p.goto(`${BASE}/p/${id}/`); ok(await p.evaluate(() => document.getElementById('lk-dialog').open && /confidential/.test(document.getElementById('lk-title').textContent)), `deep link /p/${id}/ shows locked dialog`); }
    for (const id of OSS) { const r = await p.goto(`${BASE}/p/${id}/`); ok(r.status() === 404, `/p/${id}/ is not a panel route`); }
    await ctx.close(); }
  // locked cards
  { const { ctx, p } = await mk(); await p.goto(BASE); await p.waitForTimeout(1000);
    ok(await p.evaluate(() => document.querySelectorAll('.lk-art').length === 2), 'two locked cards with sketch and padlock');
    await p.locator('[data-tile="deca"]').scrollIntoViewIfNeeded(); await p.hover('[data-tile="deca"] .lk-card'); await p.waitForTimeout(300); await snap(p, 'locked-hover');
    await p.click('[data-tile="deca"] a.lk-btn'); await p.waitForTimeout(500);
    const dlg = await p.evaluate(() => { const d = document.getElementById('lk-dialog'); return { open: d.open, w: Math.round(d.getBoundingClientRect().width), q: d.querySelector('#lk-q').textContent, h: d.querySelector('h3').textContent, url: location.pathname }; });
    ok(dlg.open && dlg.w <= 480 && dlg.h === "Oops!! It's confidential." && /identical LLM agents/.test(dlg.q) && dlg.url === '/p/deca/', 'More info opens the 480 px locked dialog with the approved copy');
    await snap(p, 'locked-dialog');
    await p.keyboard.press('Escape'); await p.waitForTimeout(400);
    ok(!(await p.evaluate(() => document.getElementById('lk-dialog').open)) && new URL(p.url()).pathname === '/', 'locked dialog closes, URL back to /');
    ok(await p.evaluate(() => document.activeElement?.dataset.lk) === 'deca', 'focus returns to More info');
    ok(await p.evaluate(() => document.querySelectorAll('[data-tile="bossconsole"] a[href^="/p/"], [data-tile="erc-nav"] a[href^="/p/"], [data-tile="cognee"] a[href^="/p/"]').length === 0), 'OSS cards link out, no panels');
    await ctx.close(); }
  // home screenshots
  for (const [w, h] of [[1440, 900], [390, 844]]) { const { ctx, p } = await mk({ viewport: { width: w, height: h } }); await p.goto(BASE); await p.waitForTimeout(1200);
    ok(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `home ${w}: no horizontal scroll`);
    await snap(p, `home-${w}`, { fullPage: true }); await ctx.close(); }
} finally { await b.close(); srv.kill(); }
console.log(fails ? `${fails} FAILED` : 'ALL PASSED');
process.exit(fails ? 1 : 0);
