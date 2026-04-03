"""
Generate welcome banner for reDonate bot /start command.
Output: bot/assets/welcome.jpg (800x400px)
"""

import math
import os
import random
from PIL import Image, ImageDraw, ImageFont

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
OUTPUT_PATH = os.path.join(SCRIPT_DIR, "welcome.jpg")

WIDTH, HEIGHT = 800, 400

# Color palette
COLOR_BG_LEFT = (13, 17, 23)       # #0D1117 — dark navy
COLOR_BG_RIGHT = (26, 5, 51)       # #1A0533 — deep violet
COLOR_ACCENT = (139, 92, 246)      # #8B5CF6 — violet accent
COLOR_ACCENT_BLUE = (59, 130, 246) # #3B82F6 — blue accent
COLOR_WHITE = (255, 255, 255)
COLOR_SUBTITLE = (180, 160, 220)   # light lavender
COLOR_GLOW = (120, 60, 200)        # glow purple


def lerp_color(c1, c2, t):
    """Linear interpolation between two RGB colors."""
    return tuple(int(c1[i] + (c2[i] - c1[i]) * t) for i in range(3))


def create_gradient_background(draw):
    """Paint horizontal gradient from dark navy to deep violet."""
    for x in range(WIDTH):
        t = x / (WIDTH - 1)
        color = lerp_color(COLOR_BG_LEFT, COLOR_BG_RIGHT, t)
        draw.line([(x, 0), (x, HEIGHT)], fill=color)


def draw_grid_lines(draw):
    """Subtle perspective grid lines for cyberpunk / gaming feel."""
    grid_color = (255, 255, 255, 12)

    # Horizontal lines with fade
    step = 40
    for y in range(0, HEIGHT + step, step):
        alpha = max(4, int(18 * (1 - y / HEIGHT)))
        draw.line([(0, y), (WIDTH, y)], fill=(*COLOR_ACCENT_BLUE[:3], alpha), width=1)

    # Vertical lines
    for x in range(0, WIDTH + step, step):
        draw.line([(x, 0), (x, HEIGHT)], fill=(*COLOR_ACCENT[:3], 8), width=1)


def draw_diamond(draw, cx, cy, size, color):
    """Draw a filled diamond (rotated square)."""
    points = [
        (cx, cy - size),
        (cx + size, cy),
        (cx, cy + size),
        (cx - size, cy),
    ]
    draw.polygon(points, fill=color)


def draw_decorative_elements(draw):
    """Scatter gaming-themed geometric shapes across the banner."""
    rng = random.Random(42)  # fixed seed for reproducibility

    # Large soft glow circles (background blobs)
    for cx, cy, r, alpha in [
        (120, 80, 90, 18),
        (680, 320, 110, 14),
        (400, 200, 140, 10),
    ]:
        for i in range(r, 0, -4):
            fade = int(alpha * (i / r) ** 1.5)
            draw.ellipse(
                [cx - i, cy - i, cx + i, cy + i],
                fill=(*COLOR_GLOW, fade),
            )

    # Accent diamonds — small
    small_diamonds = [
        (60, 340, 5, (*COLOR_ACCENT, 180)),
        (140, 60, 4, (*COLOR_ACCENT_BLUE, 160)),
        (720, 50, 6, (*COLOR_ACCENT, 200)),
        (760, 320, 4, (*COLOR_ACCENT_BLUE, 150)),
        (330, 30, 5, (*COLOR_WHITE, 120)),
        (500, 370, 5, (*COLOR_ACCENT, 170)),
    ]
    for cx, cy, size, color in small_diamonds:
        draw_diamond(draw, cx, cy, size, color)

    # Medium accent diamonds
    medium_diamonds = [
        (50, 200, 10, (*COLOR_ACCENT, 100)),
        (750, 190, 10, (*COLOR_ACCENT_BLUE, 90)),
        (400, 15, 8, (*COLOR_ACCENT, 80)),
        (400, 385, 8, (*COLOR_ACCENT_BLUE, 80)),
    ]
    for cx, cy, size, color in medium_diamonds:
        draw_diamond(draw, cx, cy, size, color)

    # Random tiny star dots
    for _ in range(40):
        x = rng.randint(10, WIDTH - 10)
        y = rng.randint(10, HEIGHT - 10)
        r = rng.choice([1, 1, 1, 2])
        alpha = rng.randint(60, 180)
        color_choice = rng.choice([COLOR_WHITE, COLOR_ACCENT, COLOR_ACCENT_BLUE])
        draw.ellipse([x - r, y - r, x + r, y + r], fill=(*color_choice, alpha))

    # Corner bracket decorations — top-left
    bracket_color = (*COLOR_ACCENT, 140)
    bw = 24  # bracket arm length
    bt = 2   # thickness
    margin = 18
    # top-left
    draw.rectangle([margin, margin, margin + bw, margin + bt], fill=bracket_color)
    draw.rectangle([margin, margin, margin + bt, margin + bw], fill=bracket_color)
    # top-right
    draw.rectangle([WIDTH - margin - bw, margin, WIDTH - margin, margin + bt], fill=bracket_color)
    draw.rectangle([WIDTH - margin - bt, margin, WIDTH - margin, margin + bw], fill=bracket_color)
    # bottom-left
    draw.rectangle([margin, HEIGHT - margin - bt, margin + bw, HEIGHT - margin], fill=bracket_color)
    draw.rectangle([margin, HEIGHT - margin - bw, margin + bt, HEIGHT - margin], fill=bracket_color)
    # bottom-right
    draw.rectangle([WIDTH - margin - bw, HEIGHT - margin - bt, WIDTH - margin, HEIGHT - margin], fill=bracket_color)
    draw.rectangle([WIDTH - margin - bt, HEIGHT - margin - bw, WIDTH - margin, HEIGHT - margin], fill=bracket_color)

    # Horizontal accent line under the title area
    line_y = 260
    for x in range(200, 600):
        t = (x - 200) / 400
        # bell curve alpha: peaks in center
        alpha = int(160 * math.sin(t * math.pi) ** 2)
        color = lerp_color(COLOR_ACCENT_BLUE, COLOR_ACCENT, t)
        draw.point((x, line_y), fill=(*color, alpha))

    # Thin full-width top and bottom border lines
    for x in range(WIDTH):
        t = x / (WIDTH - 1)
        c = lerp_color(COLOR_ACCENT_BLUE, COLOR_ACCENT, t)
        draw.point((x, 0), fill=(*c, 180))
        draw.point((x, 1), fill=(*c, 80))
        draw.point((x, HEIGHT - 1), fill=(*c, 180))
        draw.point((x, HEIGHT - 2), fill=(*c, 80))


def find_font(size):
    """Try to load a system font; fall back to PIL default."""
    candidates = [
        # Windows
        "C:/Windows/Fonts/arialbd.ttf",
        "C:/Windows/Fonts/arial.ttf",
        "C:/Windows/Fonts/verdanab.ttf",
        "C:/Windows/Fonts/calibrib.ttf",
        "C:/Windows/Fonts/segoeui.ttf",
        # Linux / macOS fallbacks (CI / Docker)
        "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
        "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf",
        "/System/Library/Fonts/Helvetica.ttc",
    ]
    for path in candidates:
        if os.path.exists(path):
            try:
                return ImageFont.truetype(path, size)
            except Exception:
                continue
    # Last resort: built-in bitmap font (small but always available)
    return ImageFont.load_default()


def draw_glow_text(draw, text, font, cx, cy, main_color, glow_color, glow_radius=8):
    """Draw text with a soft glow halo."""
    # Glow layers
    for offset in range(glow_radius, 0, -1):
        alpha = int(140 * (1 - offset / glow_radius) ** 2)
        glow = (*glow_color, alpha)
        bbox = font.getbbox(text)
        tw = bbox[2] - bbox[0]
        th = bbox[3] - bbox[1]
        x = cx - tw // 2
        y = cy - th // 2
        for dx in range(-offset, offset + 1, max(1, offset // 2)):
            for dy in range(-offset, offset + 1, max(1, offset // 2)):
                draw.text((x + dx, y + dy), text, font=font, fill=glow)

    # Main text
    bbox = font.getbbox(text)
    tw = bbox[2] - bbox[0]
    th = bbox[3] - bbox[1]
    draw.text((cx - tw // 2, cy - th // 2), text, font=font, fill=main_color)


def main():
    # RGBA so we can paint with alpha during construction
    img = Image.new("RGBA", (WIDTH, HEIGHT), (0, 0, 0, 255))
    draw = ImageDraw.Draw(img, "RGBA")

    create_gradient_background(draw)
    draw_grid_lines(draw)
    draw_decorative_elements(draw)

    # --- Typography ---
    font_title = find_font(96)
    font_subtitle = find_font(34)
    font_label = find_font(20)

    center_x = WIDTH // 2

    # "reDonate" — main title with glow
    draw_glow_text(
        draw,
        text="reDonate",
        font=font_title,
        cx=center_x,
        cy=165,
        main_color=COLOR_WHITE,
        glow_color=COLOR_ACCENT,
        glow_radius=10,
    )

    # Subtitle
    draw_glow_text(
        draw,
        text="Digital Store",
        font=font_subtitle,
        cx=center_x,
        cy=285,
        main_color=COLOR_SUBTITLE,
        glow_color=COLOR_ACCENT_BLUE,
        glow_radius=5,
    )

    # Small tagline
    draw_glow_text(
        draw,
        text="Игровые товары • Быстро • Безопасно",
        font=font_label,
        cx=center_x,
        cy=340,
        main_color=(140, 120, 180),
        glow_color=COLOR_GLOW,
        glow_radius=3,
    )

    # Convert to RGB and save as JPEG
    final = img.convert("RGB")
    final.save(OUTPUT_PATH, "JPEG", quality=95, optimize=True)
    print(f"Saved: {OUTPUT_PATH}")
    print(f"Size: {os.path.getsize(OUTPUT_PATH):,} bytes")


if __name__ == "__main__":
    main()
