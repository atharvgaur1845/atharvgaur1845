#!/usr/bin/env python3
"""Derive *-dark.svg from every *-light.svg under assets/.

The light files are the single source of truth for geometry; dark variants
are a pure palette substitution. Run after editing any light SVG:

    python scripts/make_dark.py
"""
from pathlib import Path

# light -> dark. Tuned to sit on GitHub's canvas (#ffffff / #0d1117).
PALETTE = {
    "#1F2328": "#E6EDF3",  # ink
    "#59636E": "#9198A1",  # muted
    "#D8DEE4": "#30363D",  # faint / hairlines / grid
    "#F6F8FA": "#161B22",  # panel fill
    "#C15F3C": "#E2794F",  # accent · lab + atlas (sienna)
    "#5E6AD2": "#828FFF",  # accent · dashboard (indigo)
    "#3FB950": "#3FB950",  # status green (identical in both themes)
}

ROOT = Path(__file__).resolve().parents[1] / "assets"


def main() -> None:
    count = 0
    for light in sorted(ROOT.rglob("*-light.svg")):
        svg = light.read_text(encoding="utf-8")
        for a, b in PALETTE.items():
            svg = svg.replace(a, b).replace(a.lower(), b)
        dark = light.with_name(light.name.replace("-light.svg", "-dark.svg"))
        dark.write_text(svg, encoding="utf-8")
        count += 1
        print(f"  {light.relative_to(ROOT.parent)} -> {dark.name}")
    print(f"{count} dark variant(s) written.")


if __name__ == "__main__":
    main()
