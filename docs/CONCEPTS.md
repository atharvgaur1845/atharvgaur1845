# The three concepts

Three complete designs share one data layer and one build system. The active
one is chosen by `concept:` in [`config.yml`](../config.yml); the other two
remain fully working templates you can switch to with a one-line commit.

---

## Concept A — Research Laboratory  *(active default)*

**Template:** [`templates/lab.md`](../templates/lab.md) · **Assets:** `assets/lab/`

**Frame:** the profile is an ongoing paper about an ongoing lab. Figures are
numbered continuously (fig. 0–4), sections are numbered like a lab manual
(01–09), every figure has an italic caption, and the small-print layer
annotates where each section's data comes from.

**Signature moves**
- *fig. 0* banner: the identity is a plot — observed vs. predicted latent
  trajectory, diverging with horizon. Your research question, drawn.
- Front matter as a two-column paper header (statement + coordinates).
- A public **failure log**, fed automatically by `#failure` notebook tags.
- Project "plates": each experiment ships with a hand-drawn architecture
  diagram, WHY / RESULT / HARD PARTS / NEXT.

**Choose it if** you want maximum research-credibility per pixel. It is the
strongest match for the "walked into a laboratory" goal, which is why it
ships as the default.

---

## Concept B — Modern Product Dashboard

**Template:** [`templates/dashboard.md`](../templates/dashboard.md) · **Assets:** `assets/dashboard/`

**Frame:** the lab as a production system (Linear/Vercel sensibility). The
header is a wordmark with one green "operational" dot; sections are terse
panels named like an ops console — *run, changelog, deploys, ships, library,
backlog, stack*. The notebook renders as a changelog; projects render as
compact status cards with state glyphs (`● ◐ ◯ ·`).

**Choose it if** your audience is engineers first, researchers second — it
signals shipping discipline over scientific framing. Accent switches to
indigo `#5E6AD2`; everything else stays in the shared grey system.

---

## Concept C — Interactive Knowledge Atlas

**Template:** [`templates/atlas.md`](../templates/atlas.md) · **Assets:** `assets/atlas/`

**Frame:** knowledge as territory. The centerpiece is a full-width hand-drawn
map: charted regions (FOUNDATIONS, REPRESENTATION, TIME, STRUCTURE) with
solid nodes, an UNCHARTED region of dashed circles (reasoning, memory,
continual learning), dotted expedition routes showing the learning path, a
compass, a legend, and "here be open questions" where the dragons go.
Sections continue the metaphor: *you are here, expeditions, field notes,
charted, uncharted, logbook*.

**Choose it if** you want the most memorable single image and don't mind the
metaphor carrying more of the load. It is the boldest of the three and the
one visitors will describe to someone else.

---

## What is shared

| layer | shared? |
|---|---|
| data files (`research/`, `papers/`, `projects.yml`) | ✔ identical across concepts |
| build system + workflow | ✔ identical |
| grey palette + typography + glyph set | ✔ identical |
| accent color | lab/atlas sienna · dashboard indigo |
| activity trace SVG | ✔ reused by all three |
| project plates | lab + atlas reuse them; dashboard uses compact cards |

## Switching

```bash
# edit config.yml → concept: atlas   (or dashboard / lab)
git commit -am "switch concept" && git push
# the action rebuilds README.md; nothing else to do
```
