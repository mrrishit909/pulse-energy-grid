"""Composes distinctness-sheet.png: P01 real frame, P02 S00 sketch, P04 S00 and S03a sketches (2x2, 720x450 each)."""
from pathlib import Path
from PIL import Image, ImageDraw

HERE = Path(__file__).parent
P01 = HERE / "../../../01-atlas-human-mobility/artifacts/evidence/stage-b3/1440x900/06-futures-a-busier.png"
tiles = [(P01, "P01 ATLAS: RING OF NODES, STROKED (REAL FRAME, STAGE B3)"),
         (HERE / "_p02-orb-s00-d.png", "P02 VALLEY: ELECTRIC PRICE ORB, S00 (SKETCH; BINANCE VISION DATA, CC BY-NC-SA 4.0, DERIVED SKETCH SAME LICENCE)"),
         (HERE / "rose-s00-d.png", "P04 PULSE: THE DAY ROSE AT G0, S00 (SKETCH, OBSERVED DAY)"),
         (HERE / "city-s03a-d.png", "P04 PULSE: ROSE AT G2 + WINDOW CITY, S03A (SKETCH)")]
W, H, LAB = 720, 450, 28
sheet = Image.new("RGB", (2 * W, 2 * (H + LAB)), "#111")
d = ImageDraw.Draw(sheet)
for i, (p, label) in enumerate(tiles):
    x, y = (i % 2) * W, (i // 2) * (H + LAB)
    sheet.paste(Image.open(p).convert("RGB").resize((W, H)), (x, y + LAB))
    d.text((x + 10, y + 8), label, fill="#fff")
sheet.save(HERE / "distinctness-sheet.png")
