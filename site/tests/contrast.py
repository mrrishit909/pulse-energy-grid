"""Headline contrast at S00 (fix 1): p95 luminance of the background inside the h1 box (frame captured with the
headline hidden), and the WCAG contrast of the ghost text (white at opacity 0.55 over that background).
Usage: python3 tests/contrast.py ../artifacts/evidence/stage-b"""
import json, os, sys
from PIL import Image
root = os.path.join(sys.argv[1], "contrast")
lin = lambda c: (c / 255) / 12.92 if c / 255 <= 0.04045 else ((c / 255 + 0.055) / 1.055) ** 2.4
L = lambda p: 0.2126 * lin(p[0]) + 0.7152 * lin(p[1]) + 0.0722 * lin(p[2])
out = []
for vp in sorted(os.listdir(root)):
    for f in sorted(os.listdir(os.path.join(root, vp))):
        if not f.endswith("-noh1.png"): continue
        box = json.load(open(os.path.join(root, vp, f.replace("-noh1.png", "-box.json"))))
        im = Image.open(os.path.join(root, vp, f)).convert("RGB")
        px = [im.getpixel((x, y)) for y in range(int(box["y"]), int(box["y"] + box["h"]), 2) for x in range(int(box["x"]), int(box["x"] + box["w"]), 2)
              if 0 <= x < im.width and 0 <= y < im.height]
        px.sort(key=L)
        bg = px[int(len(px) * 0.95)]
        text = tuple(0.55 * 255 + 0.45 * c for c in bg)
        lb, lt = L(bg), L(text)
        ratio = (max(lb, lt) + 0.05) / (min(lb, lt) + 0.05)
        out.append(f"{vp} {f.replace('-noh1.png', '')}: background p95 rgb{bg} -> ghost text contrast {ratio:.2f}:1")
print("\n".join(out))
open(os.path.join(root, "contrast.txt"), "w").write("\n".join(out) + "\n")
