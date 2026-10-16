import { getCollection } from 'astro:content';

export const SHELF_LABEL = {
  research: 'RESEARCH SHELF',
  achievements: 'ACHIEVEMENTS SHELF',
  projects: 'PROJECTS SHELF',
  oss: 'OPEN SOURCE SHELF',
} as const;
export type ShelfId = keyof typeof SHELF_LABEL;

export async function getSite() {
  const s = (await getCollection('site')).find((e) => e.id === 'site');
  if (!s) throw new Error('site.yaml needs an item with id: site');
  return s.data;
}
export async function getEntries() {
  return (await getCollection('entries')).sort((a, b) => a.data.order - b.data.order);
}
export const kindVar = (k: string) => `var(--kind-${k})`;

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse as parseYaml } from 'yaml';
import type { Globals, LineMap } from '../companion/lines';

/** Probe data embedded as JSON for the island: per-tile lines plus global lines from robot.yaml. */
export async function getProbeData(): Promise<{ lines: LineMap; globals: Globals }> {
  const globals = parseYaml(readFileSync(join(process.cwd(), 'src/content/robot.yaml'), 'utf8')) as Globals;
  const lines: LineMap = {};
  for (const e of await getEntries()) {
    if (!e.data.robot) continue;
    lines[e.data.id] = { kind: e.data.kind, locked: e.data.status === 'confidential', ...e.data.robot };
  }
  return { lines, globals };
}

/** Drafts show in dev and when SHOW_DRAFTS=1; production builds exclude them (spec 11.4). */
export const SHOW_DRAFTS = import.meta.env.DEV || process.env.SHOW_DRAFTS === '1' || import.meta.env.SHOW_DRAFTS === '1';
export async function getNotes() {
  return (await getCollection('notes')).filter((n) => SHOW_DRAFTS || !n.data.draft);
}
