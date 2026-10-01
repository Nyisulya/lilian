import os
import qrcode
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

    for lp in [
        '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',
        '/usr/share/fonts/truetype/liberation/LiberationSerif-Bold.ttf',
        '/usr/share/fonts/truetype/freefont/FreeSerifBold.ttf'
    ]:
        if os.path.exists(lp):
            try:
                return ImageFont.truetype(lp, int(size))
            except Exception:
                pass

    try:
        return ImageFont.load_default(size=int(size))
    except TypeError:
        return ImageFont.load_default()

def build_master_template():
    if not os.path.exists(ORIG_PATH):
        print(f"Original source not found at {ORIG_PATH}")
        return

    orig = Image.open(ORIG_PATH).convert('RGBA')

    # 1. Cameo: Place Lilian's portrait
    if os.path.exists(LILIAN_PORTRAIT):
        lilian = Image.open(LILIAN_PORTRAIT).convert('RGBA')
        cameo_w, cameo_h = 264, 264
        lilian_resized = lilian.resize((cameo_w, cameo_h), Image.Resampling.LANCZOS)
        mask = Image.new('L', (cameo_w, cameo_h), 0)
        draw_mask = ImageDraw.Draw(mask)
        draw_mask.ellipse((4, 4, cameo_w - 4, cameo_h - 4), fill=255)
        orig.paste(lilian_resized, (341 - cameo_w // 2, 478 - cameo_h // 2), mask)

    d = ImageDraw.Draw(orig)

    # 2. Clean Name Ribbon inside: (195, 615, 488, 655)
    d.rounded_rectangle((195, 615, 488, 655), radius=8, fill=(3, 40, 26, 255))

    # 3. Clean Seat Pill inside: (246, 678, 342, 712)
    d.rounded_rectangle((246, 678, 342, 712), radius=10, fill=(244, 221, 154, 255))

    # 4. Clean Event Text Area & Bottom Area with elegant subtle inset card container
    d.rounded_rectangle((116, 714, 566, 958), radius=10, fill=(255, 253, 248, 255), outline=(222, 190, 115, 255), width=1)

    # 5. Render Event Details with balanced, crisp typography
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

    d.text((341 - d.textlength(v_date, font=font_date)//2, 725), v_date, font=font_date, fill=(4, 50, 32, 255))
    d.text((341 - d.textlength(v_venue, font=font_venue)//2, 746), v_venue, font=font_venue, fill=(4, 50, 32, 255))
    d.text((341 - d.textlength(v_city, font=font_city)//2, 766), v_city, font=font_city, fill=(4, 50, 32, 255))
    d.text((341 - d.textlength(v_phone, font=font_phone)//2, 786), v_phone, font=font_phone, fill=(180, 130, 8, 255)) # Warm Gold
    d.text((341 - d.textlength(v_quote, font=font_quote)//2, 806), v_quote, font=font_quote, fill=(60, 80, 70, 255))

    # 6. Draw Centered Luxury Gold-Bordered White Frame for Large QR Code
    # QR box center is at (341, 886), size = 116 x 116
    cx_qr = 341
    cy_qr = 886
    qw = 58
    qh = 58
    # Outer gold shadow / accent
    d.rounded_rectangle((cx_qr - qw - 3, cy_qr - qh - 3, cx_qr + qw + 3, cy_qr + qh + 3), radius=12, fill=(212, 175, 55, 255))
    # Inner gold border
    d.rounded_rectangle((cx_qr - qw - 1, cy_qr - qh - 1, cx_qr + qw + 1, cy_qr + qh + 1), radius=10, fill=(245, 218, 145, 255))
    # Pure white interior
    d.rounded_rectangle((cx_qr - qw, cy_qr - qh, cx_qr + qw, cy_qr + qh), radius=9, fill=(255, 255, 255, 255))

    # 7. Clean Bottom Pill for PASS code: (228, 966, 454, 992)
    d.rounded_rectangle((228, 966, 454, 992), radius=12, fill=(3, 40, 26, 255))

    orig.save(TEMPLATE_OUTPUT, 'PNG')
    print(f"Master dynamic template saved to {TEMPLATE_OUTPUT}")

if __name__ == '__main__':
    build_master_template()
