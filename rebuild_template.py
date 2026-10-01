"""
Expand the card template to add a MUCH bigger QR zone.

Strategy:
- Keep the top portion (0 to 828) as-is (all content before QR)
- Expand the card height to give room for 200px QR + padding
- Keep bottom decoration intact
"""
from PIL import Image, ImageDraw
import os

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
TEMPLATE = os.path.join(BASE_DIR, 'public', 'images', 'card_template_dynamic.png')
OUTPUT = TEMPLATE  # Overwrite in-place

card = Image.open(TEMPLATE).convert('RGBA')
w, h = card.size  # 682x1024
print(f"Original: {w}x{h}")

# We need space for: 200px QR + 16px padding each side + 8px gold border = ~240px
# Current QR zone is ~130px (y=828 to y=958)
# We need ~240px, so add ~110px more height
extra = 110
new_h = h + extra  # 1024 + 110 = 1134

new_card = Image.new('RGBA', (w, new_h), (255, 255, 255, 255))

# Top section: everything from y=0 to y=828 (content above QR zone)
top_y = 828
top = card.crop((0, 0, w, top_y))
new_card.paste(top, (0, 0))

# Bottom section: from y=958 to end (PASS pill, bottom border, decorations)
bottom_start = 950
bottom = card.crop((0, bottom_start, w, h))
# Place it at the end of the expanded card
new_bottom_y = new_h - (h - bottom_start)
new_card.paste(bottom, (0, new_bottom_y))

# Fill the gap (y=828 to new_bottom_y) with the background color
d = ImageDraw.Draw(new_card)
# Background is white/cream at the center
bg = card.getpixel((341, 840))  # Sample background

# Fill gap area with background + edge decorations
for y in range(top_y, new_bottom_y):
    for x in range(w):
        # Left and right edges: sample from template at corresponding position
        if x < 50 or x > w - 50:
            # Take from the side decorations
            src_y = min(max(top_y, 860), h - 1)
            px = card.getpixel((x, src_y))
            new_card.putpixel((x, y), px)
        else:
            new_card.putpixel((x, y), bg)

# Draw the new bigger gold-bordered QR frame
cx = 341
new_qr_cy = top_y + (new_bottom_y - top_y) // 2  # Center QR in the gap

outer_size = 240  # outer gold frame
inner_size = 220  # inner white QR area

# Gold frame
gold = (195, 165, 80, 255)
gold_dark = (155, 130, 55, 255)
d.rounded_rectangle(
    [(cx - outer_size//2, new_qr_cy - outer_size//2),
     (cx + outer_size//2, new_qr_cy + outer_size//2)],
    radius=10,
    fill=gold,
    outline=gold_dark,
    width=3
)

# Inner white area for QR
d.rounded_rectangle(
    [(cx - inner_size//2, new_qr_cy - inner_size//2),
     (cx + inner_size//2, new_qr_cy + inner_size//2)],
    radius=6,
    fill=(255, 255, 255, 255)
)

new_card.save(OUTPUT, 'PNG')
print(f"Expanded template: {w}x{new_h}")
print(f"QR center: ({cx}, {new_qr_cy})")
print(f"QR inner zone: {inner_size}x{inner_size}px")
print(f"PASS pill now at y≈{new_bottom_y + 30}")
print(f"Done!")
