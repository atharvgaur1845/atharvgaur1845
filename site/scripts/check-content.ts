// Spec 13.6 content checks. Items 1, 3, 5, 6 implemented; evidence check warnings listed above.
// Usage: tsx scripts/check-content.ts [--dist]   (--dist also scans the built site/dist)
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, relative, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse as parseYaml } from 'yaml';

const root = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const EM = '—';
const EN = '–';
const errors: string[] = [];
const warns: string[] = [];

function walk(dir: string, out: string[] = []): string[] {
  if (!existsSync(dir)) return out;
  for (const n of readdirSync(dir)) {
    const p = join(dir, n);
    statSync(p).isDirectory() ? walk(p, out) : out.push(p);
  }
  return out;
}
const rel = (p: string) => relative(root, p);
const TEXT = new Set(['.astro', '.ts', '.tsx', '.mdx', '.md', '.yaml', '.yml', '.json', '.css', '.html', '.mjs', '.txt', '.xml', '.svg', '.js']);

const srcFiles = [...walk(join(root, 'src')), ...walk(join(root, 'public'))].filter((f) => TEXT.has(extname(f)));
const distFiles = process.argv.includes('--dist') ? walk(join(root, 'dist')).filter((f) => TEXT.has(extname(f))) : [];
const all = [...srcFiles, ...distFiles];

// Item 1: em dash ban (en dash = warning)
for (const f of all) {
  const t = readFileSync(f, 'utf8');
  if (t.includes(EM)) errors.push(`[1 em dash] ${rel(f)}`);
  if (t.includes(EN)) warns.push(`[1 en dash] ${rel(f)}`);
}

const entriesDir = join(root, 'src/content/entries');
// Item 2: every number in tile copy, robot lines and panel copy must match a claim in the entry's evidence list or
// the fact ledger (.plans/memory.md). Unmatched numbers are warnings, listed at the end.
const NUM = /\d[\d,]*(?:\.\d+)?/g;
const norm = (n: string) => n.replace(/,/g, '').replace(/\.$/, '').replace(/^0+(?=\d)/, '');
const numsOf = (t: string) => [...t.matchAll(NUM)].map((m) => norm(m[0]));
const ledgerPath = join(root, '..', '.plans', 'memory.md');
const ledger = existsSync(ledgerPath) ? new Set(numsOf(readFileSync(ledgerPath, 'utf8'))) : null;
const unmatched: string[] = [];
const trivial = (n: string) => /^\d$/.test(n) || n === '10' || /^20(2[3-7])$/.test(n);
function checkNumbers(label: string, text: string, own: Set<string>) {
  for (const raw of text.split('\n')) for (const n of new Set(numsOf(raw))) {
    if (trivial(n) || own.has(n) || ledger?.has(n)) continue;
    unmatched.push(`${label}: "${n}" in "${raw.trim().slice(0, 90)}"`);
  }
}
if (!ledger) warns.push('[2 evidence] .plans/memory.md not found, ledger matching skipped');
for (const f of walk(entriesDir).filter((x) => x.endsWith('.mdx'))) {
  const m = readFileSync(f, 'utf8').match(/^---\n([\s\S]*?)\n---/);
  if (!m) continue;
  const fm = parseYaml(m[1]) as Record<string, any>;
  const own = new Set<string>((fm.evidence ?? []).flatMap((e: { claim: string }) => numsOf(e.claim)));
  own.add(norm(String(fm.year)));
  const copy = [fm.finding, fm.outcome, fm.lab, fm.robot?.dwell, fm.robot?.click].filter(Boolean).join('\n');
  checkNumbers(`${fm.id} (tile/robot)`, copy, own);
  const pf = join(root, 'src/content/panels', `${fm.id}.md`);
  if (existsSync(pf)) checkNumbers(`${fm.id} (panel)`, readFileSync(pf, 'utf8'), own);
}

// Item 3: confidential rules + no private repo URLs
// Any link to one of the owner's repos must name a PUBLIC repo (scripts/public-repos.txt,
// regenerated with `gh repo list atharvgaur1845 --visibility public`).
const PUBLIC_REPOS = new Set(readFileSync(join(root, 'scripts/public-repos.txt'), 'utf8').split('\n').map((s) => s.trim().toLowerCase()).filter(Boolean));
const REPO_URL = /github\.com\/atharvgaur1845\/([A-Za-z0-9._-]+)/g;
for (const f of all) {
  for (const m of readFileSync(f, 'utf8').matchAll(REPO_URL)) {
    const name = m[1].replace(/\.git$/, '').toLowerCase();
    if (!PUBLIC_REPOS.has(name)) errors.push(`[3 non-public repo url: ${m[1]}] ${rel(f)}`);
  }
}
const ids = new Set<string>();
for (const f of walk(entriesDir).filter((x) => x.endsWith('.mdx'))) {
  const m = readFileSync(f, 'utf8').match(/^---\n([\s\S]*?)\n---/);
  if (!m) { errors.push(`[3] no frontmatter: ${rel(f)}`); continue; }
  const fm = parseYaml(m[1]) as Record<string, unknown>;
  ids.add(String(fm.id));
  if (fm.status === 'confidential') {
    for (const k of ['links', 'diagram', 'note', 'mini'])
      if (fm[k] !== undefined) errors.push(`[3 confidential] ${rel(f)} has forbidden field "${k}"`);
    const body = readFileSync(f, 'utf8').split(/\n---\n/).slice(1).join('\n---\n');
    if (/https?:\/\//.test(body)) errors.push(`[3 confidential] ${rel(f)} body contains a URL`);
  }
}
for (const f of walk(join(root, 'src/content/notes'))) {
  const t = readFileSync(f, 'utf8');
  for (const id of ['deca', 'physmon']) if (new RegExp(`/p/${id}/`).test(t)) errors.push(`[3 confidential] note ${rel(f)} links to ${id}`);
}
// skills/lab references must resolve
for (const f of ['skills.yaml', 'lab.yaml']) {
  const t = readFileSync(join(root, 'src/content', f), 'utf8');
  for (const m of t.matchAll(/(?:tiles: \[([^\]]*)\])|(?:entry: ([\w-]+))/g)) {
    const refs = (m[1] ?? m[2] ?? '').split(',').map((s: string) => s.trim()).filter(Boolean);
    for (const r of refs) if (!ids.has(r)) errors.push(`[refs] ${f} references missing entry "${r}"`);
  }
}

// Item 5: reserved routes (other repos' project pages)
const reserved = new Set(
  ['flow_game', 'ChronoSched', 'Boundary_book', ...readFileSync(join(root, 'scripts/public-repos.txt'), 'utf8').split('\n')]
    .map((s) => s.trim().toLowerCase()).filter((s) => s && s !== 'atharvgaur1845' && s !== 'atharvgaur1845.github.io'),
);
const topLevel = new Set<string>();
const pagesDir = join(root, 'src/pages');
for (const n of existsSync(pagesDir) ? readdirSync(pagesDir) : []) topLevel.add(n.replace(/\.[^.]+$/, '').replace(/^\[.*\]$/, ''));
const distDir = join(root, 'dist');
if (distFiles.length) for (const n of readdirSync(distDir)) topLevel.add(n.replace(/\.[^.]+$/, ''));
for (const n of topLevel) if (n && reserved.has(n.toLowerCase())) errors.push(`[5 reserved route] "/${n}/" collides with a repo project page`);

// Item 6: phone number pattern (>= 10 digits with separators) in text and built HTML
const PHONE = /(?<![\w.])(\+?\d{1,3}[\s.-]?)?(\(?\d{3,5}\)?[\s.-]?)\d{3,4}[\s.-]?\d{3,4}(?![\w.])/;
for (const f of all.filter((x) => /\.(html|mdx|yaml|astro|md)$/.test(x))) {
  let t = readFileSync(f, 'utf8');
  if (f.endsWith('.html')) t = t.replace(/<(script|style)[\s\S]*?<\/\1>/g, ' ').replace(/<[^>]+>/g, ' ');
  if (f.endsWith('.astro')) t = t.replace(/<style[\s\S]*?<\/style>/g, ' ');
  const m = t.match(PHONE);
  if (m && m[0].replace(/\D/g, '').length >= 10 && /[\s.()+-]/.test(m[0])) errors.push(`[6 phone-like] ${rel(f)}: "${m[0].trim()}"`);
}

for (const w of warns) console.warn('warn ' + w);
if (unmatched.length) { console.warn(`warn [2 evidence] ${unmatched.length} number(s) with no evidence claim or ledger match:`); for (const u of unmatched) console.warn('  - ' + u); }
if (errors.length) {
  for (const e of errors) console.error('FAIL ' + e);
  console.error(`\ncheck-content: ${errors.length} error(s)`);
  process.exit(1);
}
console.log(`check-content: OK (${all.length} files scanned${distFiles.length ? ', incl. dist' : ''})`);
