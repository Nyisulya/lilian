import sys
import os
import json
import qrcode
from PIL import Image, ImageDraw, ImageFont

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TEMPLATE_PATH = os.path.join(BASE_DIR, 'public', 'images', 'card_template_dynamic.png')
CARDS_DIR = os.path.join(BASE_DIR, 'public', 'images', 'cards')

os.makedirs(CARDS_DIR, exist_ok=True)

def get_guest_data(guest_id_or_code):
    live_db = os.path.join(BASE_DIR, 'data', 'live_db.json')
    legacy_db = os.path.join(BASE_DIR, 'data', 'db.json')
    db_file = live_db if os.path.exists(live_db) else legacy_db

    with open(db_file, 'r', encoding='utf-8') as f:
        data = json.load(f)

    guests = data.get('guests', [])
    search_term = str(guest_id_or_code).strip().lower()

    # Match by ID, Code, or Name
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

    if not os.path.exists(TEMPLATE_PATH):
        raise FileNotFoundError(f"Template not found at {TEMPLATE_PATH}")

    card = Image.open(TEMPLATE_PATH).convert('RGBA')
    cx = 341
    d = ImageDraw.Draw(card)

    # 1. Guest Name (Clean, perfectly centered in emerald ribbon)
    name_clean = name.upper()
    if len(name_clean) <= 15:
        fs = 23
    elif len(name_clean) <= 22:
        fs = 19
    elif len(name_clean) <= 28:
        fs = 16
    else:
        fs = 13.5

    font_name = ImageFont.truetype(r'C:\Windows\Fonts\georgiab.ttf', int(fs))
    bb_n = d.textbbox((0, 0), name_clean, font=font_name)
    nw = bb_n[2] - bb_n[0]
    nh = bb_n[3] - bb_n[1]
    d.text((cx - nw // 2, 636 - nh // 2), name_clean, font=font_name, fill=(255, 255, 255, 255))

    # 2. Seat Badge: SINGLE / DOUBLE
    seat_txt = 'DOUBLE' if seats >= 2 else 'SINGLE'
    font_seat = ImageFont.truetype(r'C:\Windows\Fonts\georgiab.ttf', 13)
    bb_s = d.textbbox((0, 0), seat_txt, font=font_seat)
    sw = bb_s[2] - bb_s[0]
    sh = bb_s[3] - bb_s[1]
    d.text((295 - sw // 2, 696 - sh // 2), seat_txt, font=font_seat, fill=(5, 55, 35, 255))

    # 3. Left Contact Box (MAWASILIANO / 0713 980 004)
    font_lbl = ImageFont.truetype(r'C:\Windows\Fonts\georgiab.ttf', 11)
    font_phone = ImageFont.truetype(r'C:\Windows\Fonts\georgiab.ttf', 16)
    cx_box = (178 + 338) // 2

    lbl = "MAWASILIANO"
    num = "0713 980 004"
    bbl = d.textbbox((0, 0), lbl, font=font_lbl)
    bbn = d.textbbox((0, 0), num, font=font_phone)
    d.text((cx_box - (bbl[2]-bbl[0])//2, 887), lbl, font=font_lbl, fill=(245, 218, 145, 255))
    d.text((cx_box - (bbn[2]-bbn[0])//2, 911), num, font=font_phone, fill=(255, 255, 255, 255))

    # 4. Right QR Code (High-Contrast, Crisp for Gate Scanner)
    qr = qrcode.QRCode(
        version=1,
        error_correction=qrcode.constants.ERROR_CORRECT_H,
        box_size=8,
        border=1,
    )
    qr.add_data(code)
    qr.make(fit=True)
    qr_img = qr.make_image(fill_color='#021910', back_color='white').convert('RGBA')
    qr_resized = qr_img.resize((70, 70), Image.Resampling.NEAREST)

    # Paste in right box (center = 451, 910)
    card.paste(qr_resized, (451 - 35, 910 - 35), qr_resized)

    # 5. Bottom PASS Pill: ── PASS : {code} ──
    pass_txt = f'──  PASS : {code}  ──'
    font_pass = ImageFont.truetype(r'C:\Windows\Fonts\arialbd.ttf', 12.5)
    bb_p = d.textbbox((0, 0), pass_txt, font=font_pass)
    pw = bb_p[2] - bb_p[0]
    ph = bb_p[3] - bb_p[1]
    d.text((cx - pw // 2, 974 - ph // 2), pass_txt, font=font_pass, fill=(250, 225, 156, 255))

    # Save output
    if not output_path:
        output_path = os.path.join(CARDS_DIR, f'card_{guest.get("id")}.jpg')

    card.convert('RGB').save(output_path, quality=98)
    return output_path

if __name__ == '__main__':
    gid = sys.argv[1] if len(sys.argv) > 1 else '1'
    out = sys.argv[2] if len(sys.argv) > 2 else None
    render_guest_card(gid, out)
