// Build step: render share images (1200x630 PNG) from the /og/<id>/ template pages with system Chrome, then remove the templates.
import { chromium } from 'playwright-core';
import { createServer } from 'node:http';
import { readFileSync, existsSync, readdirSync, rmSync, mkdirSync, statSync } from 'node:fs';
import { join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const dist = join(root, 'dist');
const og = join(dist, 'og');
if (!existsSync(og)) { console.log('og: no template pages, skipped'); process.exit(0); }
const CHROME = [process.env.CHROME_PATH, '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser'].find((p) => p && existsSync(p));
const ids = readdirSync(og).filter((n) => statSync(join(og, n)).isDirectory());
if (!CHROME) {
  console.warn('og: WARNING no Chrome found (set CHROME_PATH); share images were NOT generated');
  for (const id of ids) rmSync(join(og, id), { recursive: true, force: true });
  process.exit(0);
}
const MIME = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.woff': 'font/woff', '.woff2': 'font/woff2', '.png': 'image/png', '.svg': 'image/svg+xml' };
const srv = createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (p.endsWith('/')) p += 'index.html';
  const f = join(dist, p);
  if (!f.startsWith(dist) || !existsSync(f) || statSync(f).isDirectory()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'content-type': MIME[extname(f)] ?? 'application/octet-stream' }); res.end(readFileSync(f));
}).listen(0);
const port = srv.address().port;
const b = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox'] });
const ctx = await b.newContext({ viewport: { width: 1200, height: 630 }, reducedMotion: 'reduce', deviceScaleFactor: 1 });
const page = await ctx.newPage();
mkdirSync(og, { recursive: true });
for (const id of ids) {
  await page.goto(`http://localhost:${port}/og/${id}/`);
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(150);
  await page.screenshot({ path: join(og, `${id}.png`), clip: { x: 0, y: 0, width: 1200, height: 630 } });
}
await b.close(); srv.close();
for (const id of ids) rmSync(join(og, id), { recursive: true, force: true });
console.log(`og: ${ids.length} share images written to dist/og/`);
