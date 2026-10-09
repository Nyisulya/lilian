import sys
import os
import json
import qrcode
from PIL import Image, ImageDraw, ImageFont

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TEMPLATE_PATH = os.path.join(BASE_DIR, 'public', 'images', 'card_template_emerald.png')
CARDS_DIR = os.path.join(BASE_DIR, 'public', 'images', 'cards')
FONTS_DIR = os.path.join(BASE_DIR, 'public', 'fonts')

os.makedirs(CARDS_DIR, exist_ok=True)
os.makedirs(FONTS_DIR, exist_ok=True)

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

def get_guest_data(guest_id_or_code):
    live_db = os.path.join(BASE_DIR, 'data', 'live_db.json')
    legacy_db = os.path.join(BASE_DIR, 'data', 'db.json')
    db_file = live_db if os.path.exists(live_db) else legacy_db

    with open(db_file, 'r', encoding='utf-8') as f:
        data = json.load(f)

    guests = data.get('guests', [])
    search_term = str(guest_id_or_code).strip().lower()

    guest = None
    for g in guests:
        gid = str(g.get('id', '')).lower()
        gcode = str(g.get('code', '')).lower()
        gname = str(g.get('name', '')).lower()
        if gid == search_term or gcode == search_term or search_term in gname:
            guest = g
            break

    if not guest:
        guest = {
            'id': str(guest_id_or_code),
            'name': str(guest_id_or_code).title() if not str(guest_id_or_code).isdigit() else 'Mualikwa Maalumu',
            'seats': 1,
            'code': str(guest_id_or_code) if str(guest_id_or_code).isdigit() else '3088'
        }

    return guest

def render_guest_card(guest_id_or_code, output_path=None):
    guest = get_guest_data(guest_id_or_code)

    name = guest.get('name', 'Mualikwa Maalumu').strip()
    seats = int(guest.get('seats', 1) or 1)
    code = str(guest.get('code') or guest.get('id') or '3001')
    gid = str(guest.get('id') or '1')

    if not os.path.exists(TEMPLATE_PATH):
        builder_script = os.path.join(BASE_DIR, 'scratch', 'build_emerald_template.py')
        if os.path.exists(builder_script):
            import subprocess
            subprocess.run([sys.executable, builder_script], check=True)

    card = Image.open(TEMPLATE_PATH).convert('RGB')
    cx = card.width // 2
    d = ImageDraw.Draw(card)

    gold = (212, 175, 55)
    gold_bright = (250, 225, 156)
    white = (255, 255, 255)

    # 1. Guest Name (BIGGER & BOLDER: 26-30pt)
    name_clean = name.strip()
    fs = 29 if len(name_clean) <= 18 else (24 if len(name_clean) <= 26 else 20)
    font_name = get_font('georgiab.ttf', fs)
    bb_n = d.textbbox((0, 0), name_clean, font=font_name)
    nw = bb_n[2] - bb_n[0]
    d.text((cx - nw // 2, 808), name_clean, font=font_name, fill=white)

    # 2. Seat Badge: SINGLE / DOUBLE VIP (CLEAN TYPOGRAPHY - NO MISTARI/BOXES)
    seat_label = 'MWALIKO WA WATU WAWILI (DOUBLE)' if seats >= 2 else 'MWALIKO WA MTU MMOJA (SINGLE)'
    pill_txt = f"{seat_label}   •   VIP"
    font_pill = get_font('arialbd.ttf', 13)
    bb_p = d.textbbox((0, 0), pill_txt, font=font_pill)
    d.text((cx - (bb_p[2] - bb_p[0]) // 2, 846), pill_txt, font=font_pill, fill=(167, 243, 208))

    # 3. THE ORIGINAL PROVEN SCANNABLE QR CODE FRAME (CENTERED & HIGH CONTRAST)
    qr_box_y = 1012
    qr_outer_sz = 236
    qr_inner_sz = 220
    qr_code_sz = 200

    # Luxury Gold Outer Frame
    d.rounded_rectangle(
        (cx - qr_outer_sz // 2, qr_box_y, cx + qr_outer_sz // 2, qr_box_y + qr_outer_sz),
        radius=14,
        fill=(195, 165, 80),
        outline=(155, 130, 55),
        width=2
    )
    # Pure White Inner Square (Guarantees 100% Optical Quiet Zone for Hardware Scanners)
    d.rounded_rectangle(
        (cx - qr_inner_sz // 2, qr_box_y + (qr_outer_sz - qr_inner_sz) // 2,
         cx + qr_inner_sz // 2, qr_box_y + (qr_outer_sz + qr_inner_sz) // 2),
        radius=8,
        fill=(255, 255, 255)
    )

    # Pixel-Perfect QR Code (25 modules * 8px = exactly 200px, 0% distortion, High Error Correction)
    qr = qrcode.QRCode(
        version=1,
        error_correction=qrcode.constants.ERROR_CORRECT_H,
        box_size=8,
        border=2,
    )
    qr.add_data(str(code))
    qr.make(fit=True)
    qr_img = qr.make_image(fill_color='#000000', back_color='#ffffff').convert('RGB')
    card.paste(qr_img, (cx - qr_code_sz // 2, qr_box_y + (qr_outer_sz - qr_code_sz) // 2))

    # 4. BOTTOM PASS PILL & GUEST NUMBER
    pass_y = qr_box_y + qr_outer_sz + 14
    font_pass = get_font('arialbd.ttf', 14)
    pass_txt = f"──  PASS : {code}  ──"
    bb_pass = d.textbbox((0, 0), pass_txt, font=font_pass)
    pw = bb_pass[2] - bb_pass[0]
    d.rounded_rectangle((cx - pw // 2 - 20, pass_y, cx + pw // 2 + 20, pass_y + 36), radius=16, fill=(4, 30, 20), outline=gold_bright, width=1)
    d.text((cx - pw // 2, pass_y + 9), pass_txt, font=font_pass, fill=gold_bright)

    # Save output
    if not output_path:
        output_path = os.path.join(CARDS_DIR, f'card_{guest.get("id")}.jpg')

    card.save(output_path, quality=98)
    return output_path

def render_all_guests():
    live_db = os.path.join(BASE_DIR, 'data', 'live_db.json')
    legacy_db = os.path.join(BASE_DIR, 'data', 'db.json')
    db_file = live_db if os.path.exists(live_db) else legacy_db

    with open(db_file, 'r', encoding='utf-8') as f:
        data = json.load(f)

    guests = data.get('guests', [])
    print(f"Rendering all {len(guests)} guest cards...")
    count = 0
    for g in guests:
        gid = g.get('id')
        if gid:
            render_guest_card(gid)
            count += 1
    print(f"Successfully generated {count} cards in {CARDS_DIR}")

if __name__ == '__main__':
    arg = sys.argv[1] if len(sys.argv) > 1 else '1'
    if arg.lower() == 'all':
        render_all_guests()
    else:
        out = sys.argv[2] if len(sys.argv) > 2 else None
        p = render_guest_card(arg, out)
        print(f"Generated scannable card at {p}")
