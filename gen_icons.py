#!/usr/bin/env python3
"""Genera los iconos PWA (icons/) con un motivo de nodos conectados.
Ejecuta: python3 gen_icons.py"""
from PIL import Image, ImageDraw

BG = (28, 26, 23)
DOT = (247, 245, 242)
LINE = (140, 134, 124)


def icon(size, mode="RGBA"):
    img = Image.new("RGBA", (size, size), BG + (255,))
    d = ImageDraw.Draw(img)
    c = size / 2
    r = size * 0.34
    pts = [
        (c, c - r),
        (c + r * 0.87, c + r * 0.5),
        (c - r * 0.87, c + r * 0.5),
    ]
    for p in pts:
        d.line([c, c, p[0], p[1]], fill=LINE, width=max(2, size // 60))
    dot_r = size * 0.045
    d.ellipse([c - dot_r, c - dot_r, c + dot_r, c + dot_r], fill=DOT)
    for p in pts:
        d.ellipse([p[0] - dot_r, p[1] - dot_r, p[0] + dot_r, p[1] + dot_r], fill=DOT)
    return img.convert(mode)


icon(192).convert("RGB").save("icons/icon-192.png")
icon(512).convert("RGB").save("icons/icon-512.png")
icon(512).save("icons/icon-maskable-512.png")
icon(180).convert("RGB").save("icons/apple-touch-icon.png")

print("iconos generados en icons/.")
