# Automation architecture

The README is a build artifact. It is never edited by hand.

```
                        ┌────────────────────────────┐
                        │         README.md          │   ← generated artifact
                        └────────────▲───────────────┘
                                     │ writes
                        ┌────────────┴───────────────┐
                        │  scripts/build_readme.py   │
                        └─▲────────▲────────▲──────▲─┘
                 reads    │        │        │      │
        ┌─────────────────┘        │        │      └──────────────┐
┌───────┴────────┐   ┌─────────────┴──┐  ┌──┴──────────┐  ┌───────┴───────┐
│ templates/*.md │   │ research/*.md  │  │ projects.yml│  │  GitHub API   │
│ (layout, one   │   │ papers/*.md    │  │ config.yml  │  │ REST + GraphQL│
│  per concept)  │   │ (the data)     │  │             │  │               │
└────────────────┘   └────────────────┘  └─────────────┘  └───────────────┘
                                     ▲
                                     │ triggers
                        ┌────────────┴───────────────┐
                        │ .github/workflows/build.yml│
                        │  on push · daily · manual  │
                        └────────────────────────────┘
```

## Section markers

Templates contain paired markers:

```html
<!-- ros:current -->
<!-- /ros:current -->
```

`build_readme.py` replaces everything between each pair with the output of
the matching renderer. Template text outside markers passes through verbatim,
so static layout and generated content coexist in one file.

## Every dynamic section, documented

| section | data source | renderer | updates when |
|---|---|---|---|
| `current` | `research/current.md` | `render_current` | you edit the file (push) + daily |
| `notebook` | `research/notebook.md` (first N entries) | `render_notebook` | push + daily |
| `notebook_log` | same, compact form (dashboard concept) | `render_notebook_log` | push + daily |
| `failures` | notebook entries tagged `#failure` | `render_failures` | push + daily |
| `reading` | `papers/reading.md` table rows | `render_reading` | push + daily |
| `ideas` | `research/ideas.md` staged bullets | `render_ideas` | push + daily |
| `projects` | `projects.yml` | `render_projects` | push + daily |
| `projects_compact` | same, card form (dashboard concept) | `render_projects_compact` | push + daily |
| `activity` | GitHub REST: repos + latest commit each | `render_activity` | daily cron (and any push) |
| `colophon` | build clock + `config.yml` | `render_colophon` | every build |
| trace SVGs | GraphQL contribution calendar (CI) / public events (local) | `build_trace` | daily cron |

All of it runs through one workflow — [`build.yml`](../.github/workflows/build.yml):
push to any data/template/script path, a daily cron at 05:17 UTC, or a manual
`workflow_dispatch` from the Actions tab.

## Why it can't loop or go blank

- **No self-trigger:** the workflow's `paths` filter excludes `README.md` and
  `assets/generated/`, which are the only things the build commit touches.
- **No blank sections:** if a renderer throws (API outage, malformed edit),
  the builder keeps that section's previous content from the existing
  README and prints a warning — a transient failure can never publish a
  half-empty profile.
- **No stale themes:** dark SVGs are derived from light ones in CI on every
  build (`make_dark.py`), so an asset edit can't ship mismatched themes.
- **Auth degrades gracefully:** with `GITHUB_TOKEN` (always present in
  Actions) the trace uses the exact GraphQL contribution calendar; run
  locally without a token it falls back to the public events API and
  simply shows a sparser trace.

## Data contracts

The parsers are intentionally forgiving, but these are the shapes they expect:

- **`research/current.md`** — `key: value` lines (`focus`, `status`, `since`,
  `repo`), then `## hypothesis`, `## latest result`, `## next` sections.
- **`research/notebook.md`** — entries headed
  `## YYYY-MM-DD · title #tag1 #tag2`, newest first. Only the first
  paragraph of each entry is surfaced; the file itself is the full notebook.
- **`papers/reading.md`** — a markdown table
  `| paper | authors · venue | state | note |` with states
  `implementing · annotated · reading · queued`.
- **`research/ideas.md`** — bullets `- [seed|growing|ready] text`, rendered
  sorted by maturity.
- **`projects.yml`** — see the field comments at the top of the file.
- **`config.yml`** — active concept + per-section row limits.

## Switching concepts

```yaml
# config.yml
concept: lab        # or: dashboard | atlas
```

Commit that one line; the next build renders the same data through a
different template. Nothing else changes — the concepts share every renderer
and every data file.
