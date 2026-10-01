import os
import qrcode
from PIL import Image, ImageDraw, ImageFont

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ORIG_PATH = 'C:/Users/mary/.gemini/antigravity-ide/brain/da022a77-ec18-4588-8e0e-07df093a8af5/.user_uploaded/media_1790793422463.jpg'
LILIAN_PORTRAIT = os.path.join(BASE_DIR, 'public', 'images', 'lilian_portrait_no_mic.jpg')
TEMPLATE_OUTPUT = os.path.join(BASE_DIR, 'public', 'images', 'card_template_dynamic.png')

def build_master_template():
    if not os.path.exists(ORIG_PATH):
        print(f"Original source image not found at {ORIG_PATH}, skipping template regeneration.")
        return

    orig = Image.open(ORIG_PATH).convert('RGBA')

    # 1. Seamlessly erase top crown
    crown_w = 52
    crown_h = 42
    left_sample = orig.crop((315 - crown_w, 6, 315, 6 + crown_h))
    orig.paste(left_sample, (315, 6))

    # 2. Put Lilian's portrait in cameo
    if os.path.exists(LILIAN_PORTRAIT):
        lilian = Image.open(LILIAN_PORTRAIT).convert('RGBA')
        cameo_w, cameo_h = 264, 264
        lilian_resized = lilian.resize((cameo_w, cameo_h), Image.Resampling.LANCZOS)
        mask = Image.new('L', (cameo_w, cameo_h), 0)
        draw_mask = ImageDraw.Draw(mask)
        draw_mask.ellipse((4, 4, cameo_w - 4, cameo_h - 4), fill=255)
        orig.paste(lilian_resized, (341 - cameo_w // 2, 478 - cameo_h // 2), mask)

    d = ImageDraw.Draw(orig)

    # 3. Clean Name Ribbon inside: (195, 615, 488, 655)
    d.rounded_rectangle((195, 615, 488, 655), radius=8, fill=(3, 40, 26, 255))

    # 4. Clean Seat Pill inside: (246, 678, 342, 712)
    d.rounded_rectangle((246, 678, 342, 712), radius=10, fill=(244, 221, 154, 255))

    # 5. Clean ENTIRE Left Box inner green area: (195, 888, 348, 952)
    d.rounded_rectangle((195, 888, 348, 952), radius=8, fill=(3, 40, 26, 255))

    # 6. Clean ENTIRE Right Box inner white area: (380, 888, 526, 952)
    d.rounded_rectangle((380, 888, 526, 952), radius=8, fill=(255, 255, 255, 255))

    # 7. Clean ENTIRE Bottom Pill inner green area: (228, 966, 454, 992)
    d.rounded_rectangle((228, 966, 454, 992), radius=12, fill=(3, 40, 26, 255))

    orig.save(TEMPLATE_OUTPUT, 'PNG')
    print(f"Master dynamic template saved to {TEMPLATE_OUTPUT}")

if __name__ == '__main__':
    build_master_template()
