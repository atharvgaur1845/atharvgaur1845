import { defineCollection } from 'astro:content';
import { glob, file } from 'astro/loaders';
import { z } from 'astro/zod';

const shelfIds = ['research', 'achievements', 'projects', 'oss'] as const;
const link = z.object({ label: z.string(), url: z.url() });
const evidence = z.object({ claim: z.string(), ref: z.string() });

const entries = defineCollection({
  loader: glob({ pattern: '*.mdx', base: './src/content/entries' }),
  schema: z
    .object({
      id: z.string().regex(/^[a-z0-9-]+$/),
      kind: z.enum(['research', 'project', 'achievement', 'oss']),
      status: z.enum(['published', 'in-progress', 'confidential']),
      shelf: z.enum(shelfIds),
      span: z.enum(['S', 'M', 'L']),
      order: z.number().int(),
      oss: z.object({
        eyebrow: z.string(), right: z.string(),
        base: z.string().optional(),
        href: z.url().optional(),
        groups: z.array(z.object({ name: z.string(), prs: z.array(z.number()) })).optional(),
        rows: z.array(z.object({ title: z.string(), url: z.url() })).optional(),
      }).optional(),
      palette: z.object({ bg: z.string(), tint: z.string(), accent: z.string(), accent2: z.string() }).optional(),
      year: z.string().regex(/^\d{4}$/),
      venue: z.string().optional(),
      title: z.string(),
      chips: z.array(z.string()).default([]),
      lab: z.string().optional(),
      domain: z.string().optional(), // approved one-liner (confidential entries)
      finding: z.string().optional(),
      outcome: z.string().optional(),
      mini: z.string().optional(),
      diagram: z.string().optional(),
      note: z.string().optional(),
      links: z.array(link).optional(),
      robot: z.object({ dwell: z.string().max(110), click: z.string().max(110) }).optional(),
      skills: z.array(z.string()).optional(),
      evidence: z.array(evidence).optional(),
    })
    .superRefine((e, ctx) => {
      if (e.status === 'confidential') {
        if (!e.lab) ctx.addIssue({ code: 'custom', message: 'confidential entries need a lab line', path: ['lab'] });
        if (e.kind !== 'research')
          ctx.addIssue({ code: 'custom', message: 'confidential entries must be kind research', path: ['kind'] });
        for (const k of ['links', 'diagram', 'note'] as const) {
          if (e[k] !== undefined)
            ctx.addIssue({ code: 'custom', message: `confidential entries must not have ${k}`, path: [k] });
        }
      } else if (!e.finding || !e.outcome) {
        ctx.addIssue({ code: 'custom', message: 'published entries need finding and outcome', path: ['finding'] });
      }
    }),
});

const notes = defineCollection({
  loader: glob({ pattern: '*.mdx', base: './src/content/notes' }),
  schema: z.object({
    title: z.string(),
    subtitle: z.string().optional(),
    entry: z.string(),
    date: z.coerce.date(),
    readingTime: z.number().int().optional(),
    draft: z.boolean().default(false),
    sources: z.string().optional(),
  }),
});

const site = defineCollection({
  loader: file('src/content/site.yaml'),
  schema: z.object({
    name: z.string(),
    degree: z.string(),
    institution: z.string(),
    wordmark: z.string(),
    contacts: z.array(z.object({ id: z.string(), label: z.string(), url: z.string(), text: z.string().optional() })),
    sections: z.array(
      z.object({ id: z.enum(['hero', ...shelfIds, 'skills', 'contact']), label: z.string(), enabled: z.boolean() }),
    ),
  }),
});

const lab = defineCollection({
  loader: file('src/content/lab.yaml'),
  schema: z.object({
    title: z.string(),
    status: z.string(),
    line: z.string(),
    entry: z.string(),
    order: z.number(),
  }),
});

const experience = defineCollection({
  loader: file('src/content/experience.yaml'),
  schema: z.object({ org: z.string(), role: z.string().optional(), period: z.string(), order: z.number() }),
});

const skills = defineCollection({
  loader: file('src/content/skills.yaml'),
  schema: z.object({
    group: z.string(),
    order: z.number(),
    chips: z.array(z.object({ label: z.string(), tiles: z.array(z.string()).default([]) })),
  }),
});

export const collections = { entries, notes, site, lab, experience, skills };
