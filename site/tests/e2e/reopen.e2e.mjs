// Regression: a panel must show its content every time it is opened (hotfix for the blank reopen).
import { chromium } from 'playwright-core';
import { spawn, spawnSync } from 'node:child_process';
const PORT = 4388, BASE = `http://localhost:${PORT}`;
spawnSync('node', ['node_modules/astro/bin/astro.mjs', 'preview', 'stop'], { stdio: 'ignore' });
const srv = spawn('node', ['node_modules/astro/bin/astro.mjs', 'preview', '--port', String(PORT)], { stdio: 'ignore' });
for (let i = 0; i < 120; i++) { try { if ((await fetch(BASE)).ok) break; } catch {} await new Promise((r) => setTimeout(r, 250)); }
const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
let fails = 0; const ok = (c, m) => { console.log(`${c ? 'PASS' : 'FAIL'} ${m}`); if (!c) fails++; };
const IDS = ['cuhk-x', 'reo2-floor', 'bidbrain', 'lam', 'flashlob', 'flow-game', 'neural-debris', 'bdh-narrative'];
const wait = (p, ms = 520) => p.waitForTimeout(Math.min(ms, 480));
/** Title and first section text are really visible: non-zero box and effective opacity 1 (ancestors included). */
const visibleContent = (p, id) => p.evaluate((id) => {
  const eff = (el) => { let o = 1; for (let e = el; e; e = e.parentElement) o *= parseFloat(getComputedStyle(e).opacity); return o; };
  const root = document.getElementById(`panel-${id}`);
  const parts = { title: root.querySelector('.p-title'), head: root.querySelector('.p-head'), index: root.querySelector('.p-idx'), first: root.querySelector('.p-body section p, .p-body section li') };
  const out = {};
  for (const [k, el] of Object.entries(parts)) { const r = el?.getBoundingClientRect(); out[k] = !!el && r.width > 0 && r.height > 0 && eff(el) > 0.99 && getComputedStyle(el).visibility !== 'hidden'; }
  out.shown = !root.hidden && root.hasAttribute('data-open');
  return out;
}, id);
const open = async (p, id) => { await p.locator(`[data-tile="${id}"] a.card`).scrollIntoViewIfNeeded(); await p.click(`[data-tile="${id}"] a.card`); await wait(p, 650); };
const good = async (p, id, label) => { const v = await visibleContent(p, id); ok(Object.values(v).every(Boolean), `${label}: panel shows title, header, index and first text ${JSON.stringify(v)}`); };
const closers = { Escape: (p) => p.keyboard.press('Escape'), 'x button': (p) => p.click('.p-root:not([hidden]) .p-x'), backdrop: (p) => p.mouse.click(20, 450), 'browser Back': (p) => p.goBack() };
try {
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', (e) => errs.push(String(e)));
  await p.goto(BASE); await wait(p, 1200);
  for (const id of IDS) {
    for (const [name, close] of Object.entries(closers)) {
      for (let n = 1; n <= (name === 'Escape' ? 3 : 2); n++) {
        await open(p, id); await good(p, id, `${id} open #${n} (after ${n === 1 ? 'fresh load' : name})`);
        await close(p); await wait(p, 600);
        if (await p.evaluate(() => !!document.querySelector('.p-root:not([hidden])'))) ok(false, `${id}: ${name} did not close`);
      }
    }
  }
  // A -> B -> A
  for (const [a, c] of [['cuhk-x', 'reo2-floor'], ['bidbrain', 'bdh-narrative'], ['lam', 'flashlob']]) {
    await open(p, a); await good(p, a, `${a} first`); await p.keyboard.press('Escape'); await wait(p, 600);
    await open(p, c); await good(p, c, `${c} second`); await p.keyboard.press('Escape'); await wait(p, 600);
    await open(p, a); await good(p, a, `${a} again`); await p.keyboard.press('Escape'); await wait(p, 600);
  }
  ok(errs.length === 0, 'no page errors ' + errs.join('|'));
  await ctx.close();
  // deep link: close then reopen
  for (const id of IDS) {
    const c2 = await b.newContext({ viewport: { width: 1440, height: 900 } }); const q = await c2.newPage();
    await q.goto(`${BASE}/p/${id}/`); await wait(q, 1000);
    await good(q, id, `deep link /p/${id}/ initial`);
    await q.keyboard.press('Escape'); await wait(q, 650);
    await open(q, id); await good(q, id, `deep link /p/${id}/ reopened`);
    await q.click('.p-root:not([hidden]) .p-x'); await wait(q, 600);
    await open(q, id); await good(q, id, `deep link /p/${id}/ reopened twice`);
    await c2.close();
  }
  // reduced motion and phone sheet too
  for (const o of [{ reducedMotion: 'reduce' }, { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true }]) {
    const c3 = await b.newContext({ viewport: { width: 1440, height: 900 }, ...o }); const q = await c3.newPage(); await q.goto(BASE); await wait(q, 1000);
    for (let n = 1; n <= 3; n++) {
      await q.locator('[data-tile="lam"] a.card').scrollIntoViewIfNeeded();
      if (o.hasTouch) await q.tap('[data-tile="lam"] a.card'); else await q.click('[data-tile="lam"] a.card');
      await wait(q, 650); await good(q, 'lam', `${o.reducedMotion ? 'reduced motion' : 'phone'} open #${n}`);
      if (o.hasTouch) await q.tap('.p-root:not([hidden]) .p-x'); else await q.keyboard.press('Escape');
      await wait(q, 600);
    }
    await c3.close();
  }
} finally { await b.close(); srv.kill(); }
console.log(fails ? `${fails} FAILED` : 'ALL PASSED'); process.exit(fails ? 1 : 0);
