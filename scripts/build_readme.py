#!/usr/bin/env python3
"""Build README.md from a template, the data files, and the GitHub API.

    README.md  <-  templates/<concept>.md
                   + research/current.md      -> section: current
                   + research/notebook.md     -> sections: notebook, notebook_log, failures
                   + research/ideas.md        -> section: ideas
                   + papers/reading.md        -> section: reading
                   + projects.yml             -> sections: projects, projects_compact
                   + GitHub API               -> section: activity + assets/generated/trace-*.svg

Sections live between `<!-- ros:name -->` / `<!-- /ros:name -->` markers.
If a renderer fails (e.g. the API is down), the section's previous content
from the existing README is kept, so a transient error never blanks the page.

Run locally:  python scripts/build_readme.py
In CI:        .github/workflows/build.yml (push to data files + daily cron)
"""

from __future__ import annotations

import datetime as dt
import html
import json
import os
import re
import sys
import urllib.error
import urllib.request
from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parents[1]
CONFIG = yaml.safe_load((ROOT / "config.yml").read_text(encoding="utf-8"))

USER = CONFIG["github_user"]
TOKEN = os.environ.get("GITHUB_TOKEN", "")

STATE_GLYPH = {"implementing": "◆", "annotated": "●", "reading": "▸", "queued": "○"}
STAGE_ORDER = {"ready": 0, "growing": 1, "seed": 2}

# trace palette — keep in sync with scripts/make_dark.py
TRACE_THEMES = {
    "light": {"ink": "#1F2328", "muted": "#59636E", "faint": "#D8DEE4", "accent": "#C15F3C"},
    "dark": {"ink": "#E6EDF3", "muted": "#9198A1", "faint": "#30363D", "accent": "#E2794F"},
}


def esc(s: str) -> str:
    return html.escape(str(s), quote=False)


def clip(s: str, n: int) -> str:
    s = " ".join(str(s).split())
    return s if len(s) <= n else s[: n - 1].rstrip() + "…"


# ---------------------------------------------------------------- GitHub API

def _api(url: str):
    req = urllib.request.Request(url, headers={
        "Accept": "application/vnd.github+json",
        "User-Agent": f"{USER}-profile-builder",
        **({"Authorization": f"Bearer {TOKEN}"} if TOKEN else {}),
    })
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.load(r)


def _graphql(query: str, variables: dict):
    body = json.dumps({"query": query, "variables": variables}).encode()
    req = urllib.request.Request(
        "https://api.github.com/graphql", data=body, method="POST",
        headers={"Authorization": f"Bearer {TOKEN}",
                 "User-Agent": f"{USER}-profile-builder"})
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.load(r)


def fetch_repos() -> list[dict]:
    repos = _api(f"https://api.github.com/users/{USER}/repos?sort=pushed&per_page=100")
    return [r for r in repos if not r["fork"] and r["name"] != USER]


def contribution_days(days: int) -> dict[str, int]:
    """date -> commit/contribution count for the trailing window."""
    until = dt.datetime.now(dt.timezone.utc)
    since = until - dt.timedelta(days=days)
    counts: dict[str, int] = {}
    if TOKEN:
        q = """query($login:String!,$from:DateTime!,$to:DateTime!){
                 user(login:$login){ contributionsCollection(from:$from,to:$to){
                   contributionCalendar{ weeks{ contributionDays{ date contributionCount }}}}}}"""
        data = _graphql(q, {"login": USER, "from": since.isoformat(), "to": until.isoformat()})
        cal = data["data"]["user"]["contributionsCollection"]["contributionCalendar"]
        for week in cal["weeks"]:
            for day in week["contributionDays"]:
                counts[day["date"]] = day["contributionCount"]
    else:
        # unauthenticated fallback: public events only (sparser, ~90 day window)
        events = _api(f"https://api.github.com/users/{USER}/events/public?per_page=100")
        for e in events:
            if e["type"] == "PushEvent":
                d = e["created_at"][:10]
                counts[d] = counts.get(d, 0) + max(e["payload"].get("size") or 1, 1)
    return counts


# ---------------------------------------------------------------- data files

def parse_current() -> dict:
    text = (ROOT / "research" / "current.md").read_text(encoding="utf-8")
    head, fields = text.split("##", 1)[0], {}
    for line in head.splitlines():
        if ":" in line:
            k, v = line.split(":", 1)
            fields[k.strip().lower()] = v.strip()
    for m in re.finditer(r"^## +(.+?)\n(.*?)(?=^## |\Z)", text, re.S | re.M):
        fields[m.group(1).strip().lower()] = m.group(2).strip()
    return fields


def parse_notebook() -> list[dict]:
    text = (ROOT / "research" / "notebook.md").read_text(encoding="utf-8")
    entries = []
    for m in re.finditer(r"^## +(.+?)\n(.*?)(?=^## |\Z)", text, re.S | re.M):
        heading, body = m.group(1).strip(), m.group(2).strip()
        tags = re.findall(r"#([\w-]+)", heading)
        heading = re.sub(r"#[\w-]+", "", heading).strip().rstrip("·").strip()
        date, _, title = heading.partition("·")
        first_para = next((p.strip() for p in body.split("\n\n") if p.strip()), "")
        entries.append({"date": date.strip(), "title": title.strip(),
                        "tags": tags, "body": " ".join(first_para.split())})
    return entries


def parse_reading() -> list[dict]:
    rows = []
    for line in (ROOT / "papers" / "reading.md").read_text(encoding="utf-8").splitlines():
        if line.startswith("|") and not re.match(r"^\|[\s\-|]+\|$", line):
            cells = [c.strip() for c in line.strip("|").split("|")]
            if len(cells) >= 4 and cells[0].lower() != "paper":
                rows.append(dict(zip(["paper", "authors", "state", "note"], cells)))
    return rows


def parse_ideas() -> list[dict]:
    ideas = []
    for line in (ROOT / "research" / "ideas.md").read_text(encoding="utf-8").splitlines():
        m = re.match(r"^- +\[(\w+)\] +(.+)$", line)
        if m:
            ideas.append({"stage": m.group(1), "text": m.group(2).strip()})
    return sorted(ideas, key=lambda i: STAGE_ORDER.get(i["stage"], 9))


def load_projects() -> list[dict]:
    return yaml.safe_load((ROOT / "projects.yml").read_text(encoding="utf-8"))


# ----------------------------------------------------------------- renderers

def render_current() -> str:
    c = parse_current()
    repo = c.get("repo", "")
    repo_html = (f'<a href="https://github.com/{esc(repo)}">{esc(repo.split("/")[-1])}</a>'
                 if repo else "—")
    rows = [
        ("FOCUS", esc(c.get("focus", "—"))),
        ("STATUS", esc(c.get("status", "—"))),
        ("SINCE", esc(c.get("since", "—"))),
        ("REPO", repo_html),
        ("HYPOTHESIS", esc(c.get("hypothesis", "—"))),
        ("LATEST", esc(c.get("latest result", "—"))),
    ]
    body = "\n".join(
        f'<tr><td valign="top" width="130"><sub><samp>{k}</samp></sub></td><td>{v}</td></tr>'
        for k, v in rows)
    src = "<sub><samp>auto · research/current.md · rebuilt on push + daily</samp></sub>"
    return f"<table>\n{body}\n</table>\n\n{src}"


def render_notebook() -> str:
    entries = parse_notebook()[: CONFIG["notebook_entries"]]
    rows = []
    for e in entries:
        tags = " ".join(f"#{t}" for t in e["tags"])
        rows.append(
            f'<tr><td valign="top" width="110"><samp>{esc(e["date"])}</samp></td>'
            f'<td><b>{esc(e["title"])}</b> <sub><samp>{esc(tags)}</samp></sub><br>'
            f'{esc(e["body"])}</td></tr>')
    src = ('<sub><samp>auto · last {n} of research/notebook.md · '
           '<a href="research/notebook.md">full notebook →</a></samp></sub>'
           ).format(n=len(rows))
    return "<table>\n" + "\n".join(rows) + f"\n</table>\n\n{src}"


def render_notebook_log() -> str:
    entries = parse_notebook()[: CONFIG["notebook_entries"]]
    lines = [f'<samp>{esc(e["date"])}</samp> — <b>{esc(e["title"])}</b><br>'
             f'<sub>{esc(clip(e["body"], 160))}</sub>' for e in entries]
    src = '<sub><samp>auto · research/notebook.md · <a href="research/notebook.md">full notebook →</a></samp></sub>'
    return "<br><br>".join(lines) + f"\n\n{src}"


def render_failures() -> str:
    entries = [e for e in parse_notebook() if "failure" in e["tags"]]
    entries = entries[: CONFIG["failure_entries"]]
    if not entries:
        return "<sub><samp>no failures recorded yet — which usually means not enough experiments.</samp></sub>"
    rows = [
        f'<tr><td valign="top" width="110"><samp>{esc(e["date"])}</samp></td>'
        f'<td><b>{esc(e["title"])}</b><br>{esc(e["body"])}</td></tr>'
        for e in entries]
    src = "<sub><samp>auto · entries tagged #failure in research/notebook.md</samp></sub>"
    return "<table>\n" + "\n".join(rows) + f"\n</table>\n\n{src}"


def render_reading() -> str:
    rows = parse_reading()[: CONFIG["reading_rows"]]
    body = "\n".join(
        f'<tr><td valign="top"><samp>{STATE_GLYPH.get(r["state"], "·")} {esc(r["state"])}</samp></td>'
        f'<td valign="top"><b>{esc(clip(r["paper"], 80))}</b><br><sub>{esc(r["authors"])}</sub></td>'
        f'<td valign="top"><sub>{esc(r["note"])}</sub></td></tr>'
        for r in rows)
    src = ('<sub><samp>auto · papers/reading.md · ◆ implementing · ● annotated · '
           '▸ reading · ○ queued</samp></sub>')
    return f"<table>\n{body}\n</table>\n\n{src}"


def render_ideas() -> str:
    ideas = parse_ideas()[: CONFIG["ideas_rows"]]
    body = "\n".join(
        f'<tr><td valign="top"><sub><samp>[{esc(i["stage"])}]</samp></sub></td>'
        f'<td>{esc(i["text"])}</td></tr>' for i in ideas)
    src = ("<sub><samp>auto · research/ideas.md · seed → growing → ready; "
           "ready ideas graduate into experiments</samp></sub>")
    return f"<table>\n{body}\n</table>\n\n{src}"


def _plate_html(plate: str, name: str) -> str:
    return (f'<picture><source media="(prefers-color-scheme: dark)" '
            f'srcset="assets/lab/{plate}-dark.svg">'
            f'<img alt="architecture diagram — {esc(name)}" '
            f'src="assets/lab/{plate}-light.svg" width="100%"></picture>')


def render_projects() -> str:
    blocks = []
    for p in load_projects():
        head = (f'<samp><b>{esc(p["name"])}</b> · {esc(p["kind"])} · {esc(p["status"])}</samp>'
                + (f' &nbsp;<sub><a href="https://github.com/{esc(p["repo"])}">repository →</a></sub>'
                   if p.get("repo") else " &nbsp;<sub>not public yet</sub>"))
        rows = [f'<tr><td colspan="2">{head}</td></tr>']
        if p.get("plate"):
            rows.append(f'<tr><td colspan="2">{_plate_html(p["plate"], p["name"])}</td></tr>')
        for label, key in (("WHY", "why"), ("RESULT", "result"),
                           ("HARD PARTS", "hard"), ("NEXT", "next")):
            if p.get(key):
                rows.append(f'<tr><td valign="top" width="110"><sub><samp>{label}</samp></sub></td>'
                            f'<td>{esc(p[key].strip())}</td></tr>')
        blocks.append("<table>\n" + "\n".join(rows) + "\n</table>")
    src = "<sub><samp>auto · projects.yml · plates drawn by hand in assets/lab/</samp></sub>"
    return "\n\n".join(blocks) + f"\n\n{src}"


def render_projects_compact() -> str:
    rows = []
    for p in load_projects():
        link = (f'<a href="https://github.com/{esc(p["repo"])}">{esc(p["name"])}</a>'
                if p.get("repo") else esc(p["name"]))
        dot = {"active": "●", "incubating": "◐", "paused": "◯", "archived": "·"}.get(p["status"], "·")
        rows.append(f'<tr><td valign="top"><samp>{dot} {esc(p["status"])}</samp></td>'
                    f'<td valign="top"><b>{link}</b> <sub><samp>{esc(p["kind"])}</samp></sub><br>'
                    f'<sub>{esc(clip(p["why"].strip(), 140))}</sub></td></tr>')
    src = "<sub><samp>auto · projects.yml</samp></sub>"
    return "<table>\n" + "\n".join(rows) + f"\n</table>\n\n{src}"


def render_activity() -> str:
    repos = fetch_repos()
    newest = max(repos, key=lambda r: r["created_at"])
    rows = []
    for r in repos[: CONFIG["activity_repos"]]:
        try:
            commit = _api(f'https://api.github.com/repos/{r["full_name"]}/commits?per_page=1')[0]
            msg = clip(commit["commit"]["message"].splitlines()[0], 72)
            when = commit["commit"]["committer"]["date"][:10]
        except Exception:
            msg, when = "—", r["pushed_at"][:10]
        rows.append(f'<tr><td valign="top"><samp>{when}</samp></td>'
                    f'<td valign="top"><a href="{r["html_url"]}"><b>{esc(r["name"])}</b></a></td>'
                    f'<td valign="top"><sub>{esc(msg)}</sub></td></tr>')
    table = "<table>\n" + "\n".join(rows) + "\n</table>"
    src = (f'<sub><samp>auto · github api · newest repository: '
           f'<a href="{newest["html_url"]}">{esc(newest["name"])}</a> '
           f'(created {newest["created_at"][:10]})</samp></sub>')
    return f"{table}\n\n{src}"


def render_colophon() -> str:
    now = dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%d %H:%M utc")
    concept = CONFIG["concept"]
    return (
        '<div align="center">\n'
        f'<sub><samp>this profile is a generated artifact — the readme is never edited by hand.</samp></sub><br>\n'
        f'<sub><samp>layout templates/{concept}.md · data research/ papers/ projects.yml + github api · '
        f'builder <a href="scripts/build_readme.py">build_readme.py</a> via '
        f'<a href=".github/workflows/build.yml">build.yml</a> (on push + daily) · '
        f'last build {now}</samp></sub><br>\n'
        f'<sub><samp>how it works: <a href="docs/ARCHITECTURE.md">architecture</a> · '
        f'<a href="docs/DESIGN.md">design system</a> · '
        f'<a href="docs/CONCEPTS.md">the three concepts</a></samp></sub>\n'
        '</div>')


# --------------------------------------------------------------- trace asset

def build_trace(counts: dict[str, int]) -> None:
    days = CONFIG["activity_days"]
    today = dt.date.today()
    series = [(today - dt.timedelta(days=days - 1 - i)) for i in range(days)]
    values = [counts.get(d.isoformat(), 0) for d in series]
    total, peak = sum(values), max(values) if values else 0

    w, h, x0, x1, base = 1000, 150, 24, 916, 112
    step = (x1 - x0) / max(days - 1, 1)
    scale = (base - 34) / max(peak, 1)

    out = ROOT / "assets" / "generated"
    out.mkdir(parents=True, exist_ok=True)
    for theme, c in TRACE_THEMES.items():
        bars = []
        for i, v in enumerate(values):
            if v <= 0:
                continue
            x = x0 + i * step
            color = c["accent"] if (today - series[i]).days < 7 else c["ink"]
            bars.append(f'<rect x="{x:.1f}" y="{base - v * scale:.1f}" width="3.2" '
                        f'height="{v * scale:.1f}" fill="{color}"/>')
        peak_label = ""
        if peak:
            pi = values.index(peak)
            peak_label = (f'<text x="{x0 + pi * step:.1f}" y="{base - peak * scale - 8:.1f}" '
                          f'font-size="9.5" fill="{c["muted"]}" text-anchor="middle">{peak}</text>')
        months, seen = [], set()
        for i, d in enumerate(series):
            key = (d.year, d.month)
            if key in seen:
                continue
            seen.add(key)
            if i == 0 and d.day > 24:
                continue  # window starts on a sliver of a month — no room for its label
            months.append(f'<text x="{x0 + i * step:.1f}" y="132" font-size="9.5" '
                          f'fill="{c["muted"]}" letter-spacing="1">{d.strftime("%b").upper()}</text>')
        quiet = ('' if total else
                 f'<text x="{(x0 + x1) / 2}" y="90" font-size="10.5" font-style="italic" '
                 f'fill="{c["muted"]}" text-anchor="middle">quiet period — probably reading</text>')
        svg = f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w} {h}" width="{w}" height="{h}" role="img" aria-label="Commit trace: {total} contributions in the last {days} days.">
  <g font-family="ui-monospace,SFMono-Regular,Menlo,Consolas,monospace">
    <text x="{x0}" y="24" font-size="9.5" letter-spacing="2" fill="{c["muted"]}">ACTIVITY TRACE — LAST {days // 7} WEEKS</text>
    <line x1="{x0}" y1="{base}" x2="{x1}" y2="{base}" stroke="{c["faint"]}" stroke-width="1"/>
    {''.join(bars)}
    {peak_label}
    {''.join(months)}
    {quiet}
    <text x="{x1 + 8}" y="{base - 2}" font-size="10.5" fill="{c["ink"]}">{total}</text>
    <text x="{x1 + 8}" y="{base + 12}" font-size="9" fill="{c["muted"]}">commits</text>
    <rect x="{x1 + 8}" y="30" width="7" height="7" fill="{c["accent"]}"/>
    <text x="{x1 + 20}" y="37" font-size="9" fill="{c["muted"]}">this week</text>
  </g>
</svg>
'''
        (out / f"trace-{theme}.svg").write_text(svg, encoding="utf-8")


# -------------------------------------------------------------------- weave

RENDERERS = {
    "current": render_current,
    "notebook": render_notebook,
    "notebook_log": render_notebook_log,
    "failures": render_failures,
    "reading": render_reading,
    "ideas": render_ideas,
    "projects": render_projects,
    "projects_compact": render_projects_compact,
    "activity": render_activity,
    "colophon": render_colophon,
}

MARKER = re.compile(r"<!-- ros:(\w+) -->(.*?)<!-- /ros:\1 -->", re.S)


def main() -> None:
    template = (ROOT / "templates" / f"{CONFIG['concept']}.md").read_text(encoding="utf-8")
    readme_path = ROOT / "README.md"
    previous = readme_path.read_text(encoding="utf-8") if readme_path.exists() else ""
    prior = {m.group(1): m.group(2) for m in MARKER.finditer(previous)}

    try:
        build_trace(contribution_days(CONFIG["activity_days"]))
        print("trace: assets/generated/trace-{light,dark}.svg written")
    except (urllib.error.URLError, OSError, KeyError) as e:
        print(f"trace: SKIPPED ({e}) — previous trace assets kept", file=sys.stderr)

    def weave(m: re.Match) -> str:
        name = m.group(1)
        try:
            content = RENDERERS[name]()
            print(f"section: {name} ok")
        except Exception as e:  # keep the old section rather than blanking it
            content = prior.get(name, "").strip() or f"<sub><samp>{name}: unavailable</samp></sub>"
            print(f"section: {name} FAILED ({e}) — previous content kept", file=sys.stderr)
        return f"<!-- ros:{name} -->\n{content}\n<!-- /ros:{name} -->"

    generated = MARKER.sub(weave, template)
    banner = ("<!-- GENERATED FILE — do not edit. Edit templates/, research/, papers/,\n"
              "     projects.yml instead; scripts/build_readme.py rebuilds this. -->\n")
    readme_path.write_text(banner + generated, encoding="utf-8")
    print(f"README.md written (concept: {CONFIG['concept']})")


if __name__ == "__main__":
    main()
