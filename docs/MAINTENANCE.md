# Maintenance guide

The rule that makes this sustainable: **you write research notes; the README
writes itself.** Nothing in your weekly routine touches README.md.

## Your actual workflow

| when | do this | the profile then |
|---|---|---|
| after an experiment / reading session | add an entry to the **top** of `research/notebook.md` (`## YYYY-MM-DD · title #tags`) | shows it in *lab notebook*; `#failure` entries also land in the *failure log* |
| focus shifts | edit `research/current.md` | *current investigation* panel updates |
| start/finish a paper | edit the table in `papers/reading.md` | *reading pipeline* updates |
| an idea appears / matures | edit `research/ideas.md`, promote `[seed] → [growing] → [ready]` | *idea incubator* re-sorts |
| project milestone | update that entry in `projects.yml` (`result`, `next`, `status`) | its plate card updates |
| nothing at all | — | *activity trace* + *deploys* still refresh daily from the GitHub API |

Push any of those edits and the action rebuilds within a minute or two. The
daily 05:17 UTC cron keeps API-fed sections fresh even in silent weeks.

## One-time setup (publishing this repo)

1. Repo **must** be `atharvgaur1845/atharvgaur1845` and public — that's what
   GitHub renders on your profile page.
2. Settings → Actions → General → Workflow permissions →
   **Read and write permissions** (the build commits README.md).
3. Push. Run the *build readme* workflow once from the Actions tab
   (`workflow_dispatch`) and check the run log — every section prints
   `ok` or a reason.

## Occasional tasks

- **Add a project:** append a block to `projects.yml`. If it deserves a
  diagram, draw `assets/lab/plate-<name>-light.svg` in the house style
  (copy an existing plate; palette + fonts are in `docs/DESIGN.md`), run
  `python scripts/make_dark.py`, and set `plate: plate-<name>`.
- **Edit any figure:** change only the `-light.svg`; CI regenerates the dark
  variant. Locally: `make_dark.py` then `build_readme.py` to preview.
- **Switch concept:** one line in `config.yml` (`lab | dashboard | atlas`).
- **Archive papers:** move finished rows from `papers/reading.md` to a
  `papers/archive.md` so the pipeline stays a pipeline, not a graveyard.

## Troubleshooting

| symptom | cause | fix |
|---|---|---|
| build log says `section: X FAILED … previous content kept` | malformed edit or API hiccup | read the printed exception; the README kept the old content, so nothing is broken publicly |
| activity/trace stale | cron skipped (GitHub pauses crons on 60-day-inactive repos) | any push, or run the workflow manually |
| workflow didn't trigger on your edit | file outside the `paths` filter | add the path to `build.yml`, or dispatch manually |
| dark figure looks wrong | edited a `-dark.svg` directly | edit the `-light.svg`; darks are generated |
| README edited by hand got overwritten | working as intended | make the change in `templates/<concept>.md` instead |

## Future improvements (ordered by value)

1. **arXiv/RSS ingestion** — a `feeds.yml` + small fetcher so *reading
   pipeline* can pull candidate papers automatically into `queued`.
2. **Latest-experiment metrics** — have training runs in
   `multi_temporal_jepa` write a `metrics.json` artifact; the builder could
   render divergence numbers into *current investigation* (real numbers, from
   real runs — never hand-typed stats).
3. **Generated knowledge-graph SVG** — derive the atlas map's nodes from a
   `graph.yml` so new topics place themselves; keep hand layout as override.
4. **Notebook permalinks** — anchor links per entry
   (`research/notebook.md#2026-07-21`) once the notebook grows.
5. **Plate thumbnails in repos** — reuse each plate SVG as the social-preview
   image of its project repo, so the design system extends beyond the profile.
6. **A `papers/archive.md`** with a yearly reading-count line in the
   colophon — quiet evidence of consistency, no streak mechanics.
