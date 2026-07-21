# Design system

Every visual decision in this repository, and why it was made.

## The one-sentence brief

A visitor should think *"this person has built an entire research operating
system"* — so the profile is designed as a laboratory you walk into, not a
resume you scroll past.

## Principles

1. **Information design over decoration.** Every element must help a visitor
   understand the work faster. If it only "looks cool", it's out — that is why
   there are no badges, counters, typing animations or streak cards anywhere.
2. **The figure is the aesthetic.** Scientific figures (Tufte-style plots,
   architecture diagrams, captioned plates) carry the visual identity. The
   banner is not a hero image; it is *fig. 0* of an ongoing paper.
3. **One accent color.** Restraint reads as craftsmanship. Everything is ink
   and grey except the single sienna accent, used only for *the thing that
   matters in each figure* (the predicted trajectory, the world-models box,
   the fault cluster).
4. **Blend into GitHub, don't fight it.** All SVGs have transparent
   backgrounds and use GitHub's own canvas greys, so figures look native in
   both themes instead of floating like pasted screenshots.
5. **The plumbing is part of the exhibit.** Each dynamic section carries a
   one-line `auto · source · cadence` annotation, and the colophon states that
   the README is generated. A research OS that hides its own mechanism would
   be missing the point.

## Color

Single source of truth: the palette table in [`scripts/make_dark.py`](../scripts/make_dark.py).
Light SVGs are hand-drawn; dark variants are derived mechanically, so the two
themes can never drift apart.

| role   | light     | dark      | used for |
|--------|-----------|-----------|----------|
| ink    | `#1F2328` | `#E6EDF3` | primary text, observed data, structure |
| muted  | `#59636E` | `#9198A1` | secondary text, captions, labels |
| faint  | `#D8DEE4` | `#30363D` | hairlines, grids, ticks, dashed boundaries |
| panel  | `#F6F8FA` | `#161B22` | box fills in diagrams |
| accent · lab/atlas | `#C15F3C` | `#E2794F` | the one important thing per figure |
| accent · dashboard | `#5E6AD2` | `#828FFF` | product-flavored concept only |
| status | `#3FB950` | `#3FB950` | the single "operational" dot (dashboard) |

Ink/muted/faint/panel are GitHub's own UI greys — that is what makes the
figures feel native. Accent washes are done with `fill-opacity` (0.06–0.15)
on the accent hex, never with extra pastel hexes.

## Typography

- **SVG text**: `ui-monospace, SFMono-Regular, Menlo, Consolas, monospace` —
  the system-monospace stack. No webfonts (GitHub proxies SVGs through camo;
  external font fetches would be blocked anyway) and no `<text>` outlines, so
  text stays crisp, selectable by renderers, and tiny in bytes.
- **Markdown headers**: `### <samp>01 · section name</samp>` — `<samp>` is the
  only GitHub-sanctioned way to get monospace headers, and the numbered
  sections read like a lab manual's table of contents.
- **Labels/annotations**: `<sub><samp>…</samp></sub>` for the small-print
  layer (sources, states, captions). Two sizes only: body and small-print.
  More sizes would mean managing a type scale GitHub doesn't give us.
- **Case**: SVG display text is lowercase (captions, labels) with
  letter-spaced caps reserved for section titles — the contrast does the work
  a font-weight scale normally would.

## Layout vocabulary (GitHub-safe)

GitHub strips all CSS, so layout uses the surviving HTML vocabulary:

| element | used as |
|---|---|
| `<table>` + `width`/`valign` | panels, two-column front matter, definition lists |
| `<picture>` + `prefers-color-scheme` | theme-aware SVG swapping |
| `<sub>`/`<samp>` | the small-print annotation layer |
| `<details>` | none currently — collapsibles hide information; used only if sections grow long |
| `---` | one horizontal rule, before the colophon |

Deliberately absent: `align="center"` everywhere (centered content reads as
template-generated), emoji (the glyph set below replaces them), and images
hosted outside the repo (everything must survive offline forks).

## Glyph set

A tiny monochrome symbol language instead of emoji — same meaning, no noise:

- reading states: `◆` implementing · `●` annotated · `▸` reading · `○` queued
- project status: `●` active · `◐` incubating · `◯` paused · `·` archived
- idea stages: `[seed]` `[growing]` `[ready]`
- link affordance: `→`

## The figures

| asset | what it argues |
|---|---|
| `lab/banner` (fig. 0) | The identity *is* the research question: an observed latent trajectory and a predicted rollout diverging with horizon. The caption — "the interesting part is why" — is the thesis statement of the whole profile. |
| `lab/program` (fig. 1) | Foundations → core program → dashed horizon. Dashing the future instead of listing "interests" makes ambition legible without hype. |
| `lab/plate-*` (figs. 2–3) | One architecture diagram per project. Each encodes the project's actual claim (no decoder in JEPA; fault clusters without labels). |
| `atlas/map` | The same knowledge, drawn as territory: charted regions, uncharted dashed circles, expedition routes. |
| `generated/trace` | Commit activity as a seismograph strip — real data drawn in the house style, replacing third-party stat cards. |

Figure numbering (fig. 0–3) is continuous across the README to reinforce the
"ongoing paper" frame.

## Voice

Lowercase section titles, first-person only in front matter, no adjectives
about the author ("passionate", "driven" are banned), claims always paired
with mechanism ("evaluate at the horizon you care about, never at the horizon
that is cheap"). The failure log is deliberately public: negative results are
the most credible signal on the page.
