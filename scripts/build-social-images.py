"""Create self-hosted 1200×630 social preview cards from curated market copy."""
from pathlib import Path
import json
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
OUTPUT = ROOT / "docs" / "social"
OUTPUT.mkdir(parents=True, exist_ok=True)
PATTERNS = json.loads((ROOT / "content" / "patterns.json").read_text())
FONT_REG = "/System/Library/Fonts/Supplemental/Arial.ttf"
FONT_BOLD = "/System/Library/Fonts/Supplemental/Arial Bold.ttf"


def font(size, bold=False):
    return ImageFont.truetype(FONT_BOLD if bold else FONT_REG, size)


def wrap(draw, message, face, width):
    words = message.split()
    lines, line = [], ""
    for word in words:
        candidate = f"{line} {word}".strip()
        if draw.textbbox((0, 0), candidate, font=face)[2] > width and line:
            lines.append(line)
            line = word
        else:
            line = candidate
    if line:
        lines.append(line)
    return lines


def make(slug, category, title, hook):
    img = Image.new("RGB", (1200, 630), "#071514")
    draw = ImageDraw.Draw(img)
    draw.ellipse((835, -260, 1500, 405), outline="#31574b", width=2)
    draw.ellipse((900, -195, 1435, 340), outline="#31574b", width=2)
    draw.ellipse((965, -130, 1370, 275), outline="#31574b", width=2)
    draw.text((70, 48), "j", font=font(60, True), fill="#fffef9")
    draw.text((98, 48), "e", font=font(60, True), fill="#c9f457")
    draw.text((134, 48), "v", font=font(60, True), fill="#fffef9")
    draw.text((205, 70), "/  RULES LAB", font=font(24, True), fill="#a4bcb1")
    draw.line((70, 143, 1130, 143), fill="#31574b", width=2)
    draw.text((70, 184), f"WOULD IT COUNT?  /  {category.upper()}", font=font(25, True), fill="#c9f457")
    title_face = font(65 if len(title) < 60 else 57, True)
    lines = wrap(draw, title, title_face, 1000)
    if len(lines) > 3:
        title_face = font(48, True)
        lines = wrap(draw, title, title_face, 1010)
    top = 232
    for line in lines[:4]:
        draw.text((70, top), line, font=title_face, fill="#fffef9")
        top += title_face.size * 1.14
    hook_top = max(450, int(top + 17))
    if hook_top < 545:
        draw.text((70, hook_top), hook[:100], font=font(30), fill="#a5c8b0")
    draw.rectangle((70, 567, 1130, 570), fill="#3d6454")
    draw.text((70, 584), "CAPTURED RULES  ·  TESTABLE SCENARIOS  ·  SOURCE RECEIPTS", font=font(19, True), fill="#a6bfb1")
    draw.text((997, 584), "JEV", font=font(19, True), fill="#c9f457")
    img.save(OUTPUT / f"{slug}.png", optimize=True)


make("default", "Prediction markets", "Would it count?", "A rule check for every headline.")
for pattern in PATTERNS:
    make(pattern["slug"], pattern["category"], pattern["title"], pattern["hook"])
print(f"Built {len(PATTERNS) + 1} social images.")
