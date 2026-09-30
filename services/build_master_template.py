import os
import qrcode
from PIL import Image, ImageDraw, ImageFont

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ORIG_PATH = 'C:/Users/mary/.gemini/antigravity-ide/brain/da022a77-ec18-4588-8e0e-07df093a8af5/.user_uploaded/media_1790793422463.jpg'
LILIAN_PORTRAIT = os.path.join(BASE_DIR, 'public', 'images', 'lilian_portrait_no_mic.jpg')
TEMPLATE_OUTPUT = os.path.join(BASE_DIR, 'public', 'images', 'card_template_dynamic.png')

# 1. Load original high-res image
orig = Image.open(ORIG_PATH).convert('RGBA')

# 2. Prepare Lilian's retouched portrait (no mic)
lilian = Image.open(LILIAN_PORTRAIT).convert('RGBA')
cameo_w, cameo_h = 264, 264
lilian_resized = lilian.resize((cameo_w, cameo_h), Image.Resampling.LANCZOS)
mask = Image.new('L', (cameo_w, cameo_h), 0)
draw_mask = ImageDraw.Draw(mask)
draw_mask.ellipse((4, 4, cameo_w - 4, cameo_h - 4), fill=255)

# Cameo center is at (341, 478)
orig.paste(lilian_resized, (341 - cameo_w // 2, 478 - cameo_h // 2), mask)

# 3. Paste the pristine original floral wreath & gold cameo border on top
official = Image.open(os.path.join(BASE_DIR, 'public', 'images', 'card_lilian_official.jpg')).convert('RGBA')
wreath = official.crop((120, 360, 562, 600))
orig.paste(wreath, (120, 360), wreath)

d = ImageDraw.Draw(orig)

# 4. Clean Guest Name Banner (inner area only, leaving ornate gold borders and corners intact)
# Inner banner area is (195, 615, 488, 655)
d.rounded_rectangle((195, 615, 488, 655), radius=10, fill=(3, 44, 28, 255))

# 5. Clean Seat Pill (SINGLE / DOUBLE area: 242, 680, 344, 712)
d.rounded_rectangle((242, 680, 344, 712), radius=12, fill=(244, 221, 154, 255))

# 6. Prepare Left Emerald Box (cleanly erase "KODI 3001" & key icon, keeping the gold ornamental border)
# Inside the left box: inner green is x in [188, 344], y in [885, 948]
# Sample the emerald background at (195, 910)
d.rounded_rectangle((188, 882, 344, 948), radius=6, fill=(3, 50, 32, 255))

# Draw the static contact header & phone number:
# MAWASILIANO
# 0713 980 004
font_lbl = ImageFont.truetype(r'C:\Windows\Fonts\georgiab.ttf', 11)
font_phone = ImageFont.truetype(r'C:\Windows\Fonts\georgiab.ttf', 16)
cx_box = (188 + 344) // 2

lbl = "MAWASILIANO"
num = "0713 980 004"
bbl = d.textbbox((0, 0), lbl, font=font_lbl)
bbn = d.textbbox((0, 0), num, font=font_phone)
d.text((cx_box - (bbl[2]-bbl[0])//2, 888), lbl, font=font_lbl, fill=(245, 218, 145, 255))
d.text((cx_box - (bbn[2]-bbn[0])//2, 912), num, font=font_phone, fill=(255, 255, 255, 255))

# 7. Clean Right White Box (for QR code, keeping the golden outer border)
# Inside area: (382, 874, 524, 946)
d.rounded_rectangle((382, 874, 524, 946), radius=8, fill=(255, 255, 255, 255))

# 8. Clean Bottom PASS Pill (erase old pass code, keeping emerald pill & gold accents)
# Center area: (230, 960, 452, 988)
d.rounded_rectangle((230, 960, 452, 988), radius=12, fill=(3, 44, 28, 255))

# Save the master dynamic template
orig.save(TEMPLATE_OUTPUT, 'PNG')
print(f"Master dynamic template saved to {TEMPLATE_OUTPUT}")
