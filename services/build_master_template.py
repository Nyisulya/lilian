import os
import cv2
import numpy as np
from PIL import Image, ImageDraw, ImageFont

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ORIG_PATH = 'C:/Users/mary/.gemini/antigravity-ide/brain/da022a77-ec18-4588-8e0e-07df093a8af5/.user_uploaded/media_1790793422463.jpg'
LILIAN_PORTRAIT = os.path.join(BASE_DIR, 'public', 'images', 'lilian_portrait_no_mic.jpg')
TEMPLATE_OUTPUT = os.path.join(BASE_DIR, 'public', 'images', 'card_template_dynamic.png')
FONTS_DIR = os.path.join(BASE_DIR, 'public', 'fonts')

def get_font(font_filename, size):
    local_path = os.path.join(FONTS_DIR, font_filename)
    if os.path.exists(local_path):
        try:
            return ImageFont.truetype(local_path, int(size))
        except Exception:
            pass

    win_path = os.path.join(r'C:\Windows\Fonts', font_filename)
    if os.path.exists(win_path):
        try:
            return ImageFont.truetype(win_path, int(size))
        except Exception:
            pass

    return ImageFont.load_default()

def build_master_template():
    if not os.path.exists(ORIG_PATH):
        raise FileNotFoundError(f"Original source not found at {ORIG_PATH}")

    # 1. Load original image
    orig_cv = cv2.imread(ORIG_PATH)
    h_orig, w, _ = orig_cv.shape  # 1024, 682
    new_h = 1134  # +110px for spacious QR zone

    # 2. Inpaint event text zone in orig_cv (y=714..830)
    # This preserves 100% of the natural background texture, delicate watermarks, and straight side borders
    text_zone = orig_cv[714:830, 0:w].copy()
    mask = np.zeros(text_zone.shape[:2], dtype=np.uint8)
    gray = cv2.cvtColor(text_zone, cv2.COLOR_BGR2GRAY)
    mask_inner = (gray < 225)
    mask[:, 115:570] = mask_inner[:, 115:570].astype(np.uint8) * 255
    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (3, 3))
    mask_dilated = cv2.dilate(mask, kernel, iterations=2)
    inpainted_text_zone = cv2.inpaint(text_zone, mask_dilated, 5, cv2.INPAINT_TELEA)
    orig_cv[714:830, 0:w] = inpainted_text_zone

    # Convert to PIL
    orig = Image.fromarray(cv2.cvtColor(orig_cv, cv2.COLOR_BGR2RGBA))

    bg_color = (248, 245, 239, 255)
    template = Image.new('RGBA', (w, new_h), bg_color)

    # 3. Paste top section (y=0 to 830) containing Crown, Cameo, Name Ribbon, VIP Badge, and clean text area
    top_section = orig.crop((0, 0, w, 830)).copy()

    # Portrait Cameo: Lilian's photo
    if os.path.exists(LILIAN_PORTRAIT):
        lilian = Image.open(LILIAN_PORTRAIT).convert('RGBA')
        cameo_w, cameo_h = 264, 264
        lilian_resized = lilian.resize((cameo_w, cameo_h), Image.Resampling.LANCZOS)
        mask_c = Image.new('L', (cameo_w, cameo_h), 0)
        draw_mask = ImageDraw.Draw(mask_c)
        draw_mask.ellipse((4, 4, cameo_w - 4, cameo_h - 4), fill=255)
        top_section.paste(lilian_resized, (341 - cameo_w // 2, 478 - cameo_h // 2), mask_c)

    d_top = ImageDraw.Draw(top_section)
    # Clean Name Ribbon: (195, 615, 488, 655)
    d_top.rounded_rectangle((195, 615, 488, 655), radius=8, fill=(3, 40, 26, 255))
    # Clean Seat Pill: (246, 678, 342, 712)
    d_top.rounded_rectangle((246, 678, 342, 712), radius=10, fill=(244, 221, 154, 255))

    template.paste(top_section, (0, 0))

    # 4. Bridge vertical side borders from y=714 down to y=850 seamlessly so borders are 100% straight and full
    border_left = orig.crop((0, 640, 45, 750))
    border_right = orig.crop((637, 640, 682, 750))
    template.paste(border_left, (0, 740))
    template.paste(border_right, (637, 740))

    # 5. Full flower clusters from orig (y=670 to 1024, height 354)
    # Pasted at y = 1134 - 354 = 780 to give complete, unbroken floral borders at the bottom
    left_flowers = orig.crop((0, 670, 190, 1024)).copy()
    d_lf = ImageDraw.Draw(left_flowers)
    d_lf.rectangle((98, 0, 190, 105), fill=bg_color)

    right_flowers = orig.crop((492, 670, 682, 1024)).copy()
    d_rf = ImageDraw.Draw(right_flowers)
    d_rf.rectangle((0, 0, 92, 105), fill=bg_color)

    template.paste(left_flowers, (0, 780))
    template.paste(right_flowers, (492, 780))

    # 6. Clean center QR zone (between flowers, x=185 to 497, y=824 to 1073)
    d = ImageDraw.Draw(template)
    d.rectangle((185, 824, 497, 1073), fill=bg_color)

    # 7. Render Event details text directly on natural textured background (NO BOX, NO WHITE FILL!)
    font_date = get_font('georgiab.ttf', 13.5)
    font_venue = get_font('georgiab.ttf', 15)
    font_city = get_font('georgia.ttf', 13)
    font_phone = get_font('georgiab.ttf', 12.5)
    font_quote = get_font('georgiai.ttf', 12)

    v_date = "18 Oktoba 2026   |   Saa 12:00 Jioni"
    v_venue = "Bragging Social Hall"
    v_city = "Goba, Dar es Salaam"
    v_phone = "Mawasiliano: 0713 980 004"
    v_quote = "“Uwepo wako ni heshima na furaha kubwa kwetu.”"

    d.text((341 - d.textlength(v_date, font=font_date) // 2, 723), v_date, font=font_date, fill=(4, 50, 32, 255))
    d.text((341 - d.textlength(v_venue, font=font_venue) // 2, 744), v_venue, font=font_venue, fill=(4, 50, 32, 255))
    d.text((341 - d.textlength(v_city, font=font_city) // 2, 764), v_city, font=font_city, fill=(4, 50, 32, 255))
    d.text((341 - d.textlength(v_phone, font=font_phone) // 2, 784), v_phone, font=font_phone, fill=(180, 130, 8, 255))
    d.text((341 - d.textlength(v_quote, font=font_quote) // 2, 804), v_quote, font=font_quote, fill=(60, 80, 70, 255))

    # 8. Centered Luxury Gold-Bordered White Frame for QR Code
    cx = 341
    cy = 944
    outer_size = 240
    inner_size = 220
    gold = (195, 165, 80, 255)
    gold_dark = (155, 130, 55, 255)

    d.rounded_rectangle(
        [(cx - outer_size // 2, cy - outer_size // 2),
         (cx + outer_size // 2, cy + outer_size // 2)],
        radius=10,
        fill=gold,
        outline=gold_dark,
        width=3
    )
    d.rounded_rectangle(
        [(cx - inner_size // 2, cy - inner_size // 2),
         (cx + inner_size // 2, cy + inner_size // 2)],
        radius=6,
        fill=(255, 255, 255, 255)
    )

    # 9. PASS pill at the bottom: (226, 1075, 456, 1105)
    d.rounded_rectangle((226, 1075, 456, 1105), radius=15, fill=(3, 40, 26, 255))

    template.save(TEMPLATE_OUTPUT, 'PNG')
    print(f"Master dynamic template saved to {TEMPLATE_OUTPUT}")

if __name__ == '__main__':
    build_master_template()
