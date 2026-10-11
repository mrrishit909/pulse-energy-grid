"""Design sketches for P04 "The Day Rose" (Creative Director, P04-CD-001).

Writes two SVGs from three OBSERVED EIA-930 days (observed_days_sketch.json, extracted once from
data/interim/hourly.parquet by local hour; public domain, Source: U.S. Energy Information Administration):
  rose-s00-d.svg   S00 end state at G0 (1440x900)
  city-s03a-d.svg  S03a composition: rose at G2 plus the window city (1440x900)
These are sketches of geometry and colour, not the build. Run: python3 design/sketches/render_rose_sketch.py
"""
import json
import math
from pathlib import Path

HERE = Path(__file__).parent
DAYS = json.loads((HERE / "observed_days_sketch.json").read_text())

# Observed display order (centre outward, merit order: zero-cost variable renewables first) with each band's
# (inner, outer) gradient stops from the shared orb families (VISUAL_DESIGN section 0, P04 amendment CD-002).
BANDS = [("gen_sun", "#FFC23D", "#FFF3A6"),   # Solar family
         ("gen_wnd", "#58B8E1", "#8FD9FF"),   # Electric
         ("gen_nuc", "#8FD9FF", "#F2FBFF"),   # Electric, luminous centre
         ("gen_wat", "#192CE4", "#58B8E1"),   # Electric
         ("imports", "#192CE4", "#5B6BFF"),   # Electric, deep
         ("gen_oth", "#2E2E2E", "#9A9A9A"),   # neutral
         ("gen_ng", "#3A0F06", "#B8361A"),    # Solar deep end, dimmed: ember
         ("gen_col", "#1E1E1E", "#5A5A5A"),   # dim grey
         ("gen_oil", "#1E1E1E", "#5A5A5A")]
WINDOW_CITY = json.loads((HERE.parent / "window-city.json").read_text())


def pt(cx, cy, r, a):
    return cx + r * math.sin(a), cy - r * math.cos(a)


def gap_at(r, gap, rref):
    """Half-width of the inter-petal gap at radius r: 0 inside the core, rising to `gap` toward the tips (smoothstep
    0.45..0.80 of rref). Where it is 0, petals overlap by 0.2px so no anti-aliasing seam (no spoke) appears."""
    t = min(1.0, max(0.0, (r / rref - 0.45) / 0.35))
    g = gap * t * t * (3 - 2 * t)
    return g if g > 0.05 else -0.2


def sector(cx, cy, r0, r1, a0, a1, gap=0.5, rref=None):
    """Annular sector between radii r0<r1 and angles a0<a1 (clockwise from top), with a tapered hairline gap."""
    rref = rref or r1
    r0 = max(r0, 0.5)
    d1, d0 = (max(gap_at(r, gap, rref) / r, -0.003) for r in (r1, r0))  # overlap capped near the centre
    p = [pt(cx, cy, r1, a0 + d1), pt(cx, cy, r1, a1 - d1), pt(cx, cy, r0, a1 - d0), pt(cx, cy, r0, a0 + d0)]
    return (f"M{p[0][0]:.1f},{p[0][1]:.1f} A{r1:.1f},{r1:.1f} 0 0 1 {p[1][0]:.1f},{p[1][1]:.1f} "
            f"L{p[2][0]:.1f},{p[2][1]:.1f} A{r0:.1f},{r0:.1f} 0 0 0 {p[3][0]:.1f},{p[3][1]:.1f} Z")


def hour_angles(h):
    # Sky orientation: noon at the top, dawn left, dusk right, midnight at the bottom; clockwise.
    a0 = math.radians((h - 12) * 15)
    return a0, a0 + math.radians(15)


def stack(day, h):
    """Positive bands (centre outward) and the sink total for one hour."""
    v = {b[0]: (day[b[0]][h] or 0) for b in BANDS if b[0] in day}
    v["imports"] = max(0, -(day["interchange"][h] or 0))
    pos = [(k, c0, c1, max(0.0, v.get(k, 0))) for k, c0, c1 in BANDS]
    return pos


GID = [0]


def grad(defs, cx, cy, r0, r1, c0, c1, o0=1.0, o1=1.0):
    GID[0] += 1
    g = f"g{GID[0]}"
    defs.append(f'<radialGradient id="{g}" gradientUnits="userSpaceOnUse" cx="{cx:.1f}" cy="{cy:.1f}" r="{r1:.1f}">'
                f'<stop offset="{r0 / r1:.4f}" stop-color="{c0}" stop-opacity="{o0}"/>'
                f'<stop offset="1" stop-color="{c1}" stop-opacity="{o1}"/></radialGradient>')
    return g


def rose(day, cx, cy, r100, lift=None, gap=0.5):
    """gap = half-width of the black hairline between petals (0.5 -> 1px). No drawn spokes, no seams."""
    defs, out = [], []
    rref = r100 * math.sqrt(max(day["demand"]) / 1e5)
    for h in range(24):
        a0, a1 = hour_angles(h)
        ox = oy = 0.0
        if lift == h:
            mid = (a0 + a1) / 2
            ox, oy = 10 * math.sin(mid), -10 * math.cos(mid)
        px, py = cx + ox, cy + oy
        cum, last = 0.0, None
        for _, c0, c1, mw in stack(day, h):
            if mw <= 0:
                continue
            r0 = r100 * math.sqrt(cum / 1e5)
            cum += mw
            r1 = r100 * math.sqrt(cum / 1e5)
            g = grad(defs, px, py, r0, r1, c0, c1)
            out.append(f'<path d="{sector(px, py, r0, r1, a0, a1, gap, rref)}" fill="url(#{g})"/>')
            last = (r0, r1, c1)
        # Soft glow inside the rim of every petal: the outer band brightens toward its edge.
        if last:
            r0, r1, c1 = last
            rg = max(r0, r1 - 22)
            g = grad(defs, px, py, rg, r1, "#ffffff", "#ffffff", 0.0, 0.32)
            out.append(f'<path d="{sector(px, py, rg, r1, a0, a1, gap, rref)}" fill="url(#{g})"/>')
        d = day["demand"][h]
        rd, rs = r100 * math.sqrt(d / 1e5), r100 * math.sqrt(cum / 1e5)
        if cum > d:  # sink cap beyond the demand line, hatched, with the demand hairline
            out.append(f'<path d="{sector(px, py, rd, rs, a0, a1, gap, rref)}" fill="url(#hatch)" opacity=".8"/>')
        elif d > cum:  # observed balance residual: dotted outline only
            out.append(f'<path d="{sector(px, py, rs, rd, a0, a1, gap, rref)}" fill="none" stroke="#fff" '
                       'stroke-opacity=".5" stroke-width="1" stroke-dasharray="1 3"/>')
        if lift == h:
            out.append(f'<path d="{sector(px, py, 0, max(rd, rs), a0, a1, gap)}" stroke="#fff" stroke-opacity=".7" '
                       'stroke-width="1" fill="none"/>')
    return "<defs>" + "".join(defs) + "</defs>\n" + "\n".join(out)


HEAD = ('<svg xmlns="http://www.w3.org/2000/svg" width="1440" height="900" viewBox="0 0 1440 900">\n'
        '<defs><pattern id="hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">'
        '<rect width="6" height="6" fill="#000"/><line x1="0" y1="0" x2="0" y2="6" stroke="#9B5CFF" stroke-width="1.5"/>'
        '</pattern><filter id="bloom" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="36"/></filter></defs>\n'
        '<rect width="1440" height="900" fill="#000"/>\n')
MONO = 'font-family="JetBrains Mono, ui-monospace, monospace"'
SERIF = 'font-family="Newsreader, Georgia, serif"'
NAV = ["PULSE", "SOURCE", "DEMAND", "NET LOAD", "FORECAST", "DISPATCH", "STRESS", "EVIDENCE", "CONTROL ROOM"]


def nav(active):
    x, parts = 720 - 330, []
    for i, lab in enumerate(NAV):
        w = 8 * len(lab) + 16
        on = i == active
        parts.append(f'<rect x="{x}" y="852" width="{w}" height="28" fill="{"#fff" if on else "rgba(242,242,242,.1)"}"/>'
                     f'<text x="{x + 8}" y="871" fill="{"#000" if on else "#fff"}" {MONO} font-size="11">{lab}</text>')
        x += w
    return "\n".join(parts)


def s00(key="CISO_2024-04-14", name="rose-s00-d.svg"):
    day = DAYS[key]
    ba, date = key.split("_")
    peak = max(day["demand"])
    r100 = 620 / math.sqrt(peak / 1e5)  # G0 D: the day's peak petal = 620px (138vh across)
    body = f'<g id="rose">{rose(day, 720, 400, r100, gap=0.75)}</g>' 
    svg = [HEAD,
           '<defs><linearGradient id="scrim" x1="0" y1="0" x2="0" y2="1">'
           '<stop offset="0" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".9"/>'
           '</linearGradient></defs>',
           body,
           '<use href="#rose" filter="url(#bloom)" opacity=".35" style="mix-blend-mode:screen"/>',
           '<rect x="0" y="470" width="1440" height="190" fill="url(#scrim)"/><rect x="0" y="660" width="1440" height="240" fill="#000" fill-opacity=".9"/>',
           f'<text x="96" y="726" fill="#fff" {SERIF} font-size="88">The invisible machine</text>',
           f'<text x="96" y="810" fill="#fff" {SERIF} font-size="88">that powers everything.</text>',
           f'<text x="32" y="40" fill="#fff" {MONO} font-size="13">PULSE ENERGY GRID</text>',
           f'<text x="1408" y="40" fill="#fff" {MONO} font-size="13" text-anchor="end">{ba} · {date} · PEAK {peak:,.0f} MW</text>',
           f'<rect x="1000" y="700" width="408" height="26" fill="rgba(255,255,255,.1)"/>',
           f'<text x="1008" y="718" fill="#fff" {MONO} font-size="11">OBSERVED · EIA-930 · 1 PETAL = 1 HOUR</text>',
           f'<text x="1408" y="750" fill="#fff" fill-opacity=".5" {MONO} font-size="11" text-anchor="end">AREA = MW · NOON AT TOP · CLEANEST AT THE CENTRE</text>',
           nav(-1),
           f'<text x="1408" y="884" fill="#fff" fill-opacity=".5" {MONO} font-size="11" text-anchor="end">SKETCH · DATA: U.S. EIA (PUBLIC DOMAIN)</text>',
           "</svg>"]
    (HERE / name).write_text("\n".join(svg))


def city(lit, x0, base, pitch, win, bgap):
    out, x, order = [], x0, WINDOW_CITY["lighting_order"]
    rank = {b: i for i, b in enumerate(order)}
    per = WINDOW_CITY["windows_per_building"]
    for b, w in enumerate(WINDOW_CITY["widths"]):
        h = per // w
        on = max(0, min(per, lit - rank[b] * per))
        for k in range(per):
            row, col = divmod(k, w)
            fill = "#FFF3A6" if k < on else "#1A1A1A"
            out.append(f'<rect x="{x + col * pitch}" y="{base - (row + 1) * pitch}" width="{win}" height="{win}" fill="{fill}"/>')
        x += w * pitch + bgap
    out.append(f'<line x1="{x0}" y1="{base + 2}" x2="{x - bgap}" y2="{base + 2}" stroke="#fff" stroke-opacity=".24"/>')
    return "\n".join(out)


def s03a():
    day, h = DAYS["CISO_2024-09-05"], 18
    d = day["demand"][h]
    lit = round(d / WINDOW_CITY["mw_per_window"])
    svg = [HEAD,
           rose(day, 1040, 300, 300, lift=h),
           city(lit, 96, 812, 12, 9, 24),
           f'<text x="96" y="130" fill="#fff" {SERIF} font-size="64">Every window is</text>',
           f'<text x="96" y="194" fill="#fff" {SERIF} font-size="64">a hundred megawatts.</text>',
           f'<text x="96" y="250" fill="#fff" fill-opacity=".5" {MONO} font-size="13">DEMAND · CISO · ONE REAL DAY, HOUR BY HOUR</text>',
           f'<text x="96" y="330" fill="#fff" {MONO} font-size="56">{h:02d}:00</text>',
           f'<text x="96" y="372" fill="#fff" {MONO} font-size="18">{d:,} MW SERVED</text>',
           f'<text x="96" y="400" fill="#fff" {MONO} font-size="18">{lit} OF 960 WINDOWS LIT</text>',
           f'<text x="96" y="428" fill="#fff" {MONO} font-size="18">{day["temp_c"][h]:.0f} °C · POP.-WEIGHTED</text>',
           f'<rect x="96" y="452" width="420" height="26" fill="rgba(255,255,255,.1)"/>',
           f'<text x="104" y="470" fill="#fff" {MONO} font-size="11">OBSERVED · EIA-930 · DERIVED: 1 WINDOW = 100 MW</text>',
           f'<text x="96" y="540" fill="#fff" fill-opacity=".5" {MONO} font-size="11">BUILDINGS ARE GROUPS OF 80 WINDOWS (8,000 MW), NOT PLACES</text>',
           f'<text x="1040" y="{300 - 300 * math.sqrt(max(day["demand"]) / 1e5) - 20:.0f}" fill="#fff" fill-opacity=".5" {MONO} font-size="11" text-anchor="middle">12</text>',
           nav(2),
           f'<text x="1408" y="884" fill="#fff" fill-opacity=".5" {MONO} font-size="11" text-anchor="end">SKETCH</text>',
           "</svg>"]
    (HERE / "city-s03a-d.svg").write_text("\n".join(svg))


if __name__ == "__main__":
    s00()
    s03a()
