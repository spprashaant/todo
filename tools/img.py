#!/usr/bin/env python3
"""Image helpers for the gauntlet.
  img.py normalize SRC DST            re-encode to a metadata-free RGB PNG
  img.py equalize SRC DST DSF         identical lossy pipeline for ours and the bar (downscale to ~1.25x
                                      effective scale, JPEG q75, upscale back) so rendering crispness and
                                      compression artefacts cannot decide a blind comparison
  img.py compare OURS REF DST [BAR]   labelled side-by-side for the builder's own (non-blind) inspection
  img.py crop SRC DST x y w h         crop a region (bar prep)
  img.py size SRC                     print WxH
"""
import sys
from PIL import Image, ImageDraw, ImageFont

def flat(path):
    im = Image.open(path)
    if im.mode in ("RGBA", "LA", "P"):
        im = im.convert("RGBA")
        bg = Image.new("RGBA", im.size, (255, 255, 255, 255))
        bg.alpha_composite(im)
        im = bg
    return im.convert("RGB")

def main():
    cmd, *a = sys.argv[1:]
    if cmd == "normalize":
        flat(a[0]).save(a[1], "PNG", optimize=True)
    elif cmd == "equalize":
        import io
        im = flat(a[0]); dsf = float(a[2])
        k = min(1.0, 1.25 / dsf)
        small = im.resize((max(1, round(im.width * k)), max(1, round(im.height * k))), Image.LANCZOS) if k < 1 else im
        buf = io.BytesIO(); small.save(buf, "JPEG", quality=75); buf.seek(0)
        out = Image.open(buf).convert("RGB")
        if out.size != im.size:
            out = out.resize(im.size, Image.BICUBIC)
        out.save(a[1], "PNG", optimize=True)
    elif cmd == "crop":
        x, y, w, h = map(int, a[2:6])
        flat(a[0]).crop((x, y, x + w, y + h)).save(a[1], "PNG", optimize=True)
    elif cmd == "size":
        print("%dx%d" % Image.open(a[0]).size)
    elif cmd == "compare":
        ours, ref = flat(a[0]), flat(a[1])
        pad, top = 24, 44
        W = ours.width + ref.width + pad * 3
        H = max(ours.height, ref.height) + top + pad
        out = Image.new("RGB", (W, H), (236, 238, 242))
        out.paste(ours, (pad, top)); out.paste(ref, (pad * 2 + ours.width, top))
        d = ImageDraw.Draw(out)
        try:
            f = ImageFont.truetype("/System/Library/Fonts/Helvetica.ttc", 22)
        except Exception:
            f = ImageFont.load_default()
        d.text((pad, 12), "OURS", fill=(200, 30, 60), font=f)
        d.text((pad * 2 + ours.width, 12), (a[3] if len(a) > 3 else "Things").upper() + " (bar)", fill=(30, 90, 200), font=f)
        out.save(a[2], "PNG", optimize=True)
    else:
        sys.exit("unknown command " + cmd)

main()
