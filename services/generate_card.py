import sys
import os
import json
import qrcode
from PIL import Image, ImageDraw, ImageFont

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TEMPLATE_PATH = os.path.join(BASE_DIR, 'public', 'images', 'card_template_dynamic.png')
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
        raise FileNotFoundError(f"Template not found at {TEMPLATE_PATH}")

    card = Image.open(TEMPLATE_PATH).convert('RGBA')
    cx = 341
    d = ImageDraw.Draw(card)

    # 1. Guest Name (Centered in emerald ribbon)
    name_clean = name.upper()
    if len(name_clean) <= 16:
        fs = 22
    elif len(name_clean) <= 22:
        fs = 19
    elif len(name_clean) <= 28:
        fs = 16
    else:
        fs = 13.5

    font_name = get_font('georgiab.ttf', fs)
    bb_n = d.textbbox((0, 0), name_clean, font=font_name)
    nw = bb_n[2] - bb_n[0]
    nh = bb_n[3] - bb_n[1]
    d.text((cx - nw // 2, 635 - nh // 2), name_clean, font=font_name, fill=(255, 255, 255, 255))

    # 2. Seat Badge: SINGLE / DOUBLE
    seat_txt = 'DOUBLE' if seats >= 2 else 'SINGLE'
    font_seat = get_font('georgiab.ttf', 13)
    bb_s = d.textbbox((0, 0), seat_txt, font=font_seat)
    sw = bb_s[2] - bb_s[0]
    sh = bb_s[3] - bb_s[1]
    d.text((295 - sw // 2, 695 - sh // 2), seat_txt, font=font_seat, fill=(5, 55, 35, 255))

    # 3. Left Box: MAWASILIANO & 0713 980 004
    cx_left = (195 + 348) // 2
    font_contact_lbl = get_font('georgiab.ttf', 12)
    font_contact_num = get_font('georgiab.ttf', 16)

    lbl_contact = "MAWASILIANO"
    num_contact = "0713 980 004"

    bb_cl = d.textbbox((0, 0), lbl_contact, font=font_contact_lbl)
    d.text((cx_left - (bb_cl[2]-bb_cl[0]) // 2, 896), lbl_contact, font=font_contact_lbl, fill=(245, 218, 145, 255))

    bb_cn = d.textbbox((0, 0), num_contact, font=font_contact_num)
    d.text((cx_left - (bb_cn[2]-bb_cn[0]) // 2, 919), num_contact, font=font_contact_num, fill=(255, 255, 255, 255))

    # 4. Right Box: High-Resolution, Instant-Scan QR Code
    # Standard URL payload that opens link on phones & verifies on security scanner
    qr_payload = f"https://lilian.nyisu.com/invite/{gid}?code={code}"

    qr = qrcode.QRCode(
        version=None,
        error_correction=qrcode.constants.ERROR_CORRECT_M,
        box_size=4,
        border=2, # Essential Quiet Zone for optical scanner detection
    )
    qr.add_data(qr_payload)
    qr.make(fit=True)
    qr_img = qr.make_image(fill_color='black', back_color='white').convert('RGBA')

    # Resize cleanly to 60x60
    qr_resized = qr_img.resize((60, 60), Image.Resampling.BOX)

    cx_right = (380 + 526) // 2
    cy_right = (888 + 952) // 2
    card.paste(qr_resized, (cx_right - 30, cy_right - 30))

    # 5. Bottom PASS Pill: ── PASS : {code} ──
    pass_txt = f'──  PASS : {code}  ──'
    font_pass = get_font('arialbd.ttf', 12.5)
    bb_p = d.textbbox((0, 0), pass_txt, font=font_pass)
    pw = bb_p[2] - bb_p[0]
    ph = bb_p[3] - bb_p[1]
    d.text((cx - pw // 2, 979 - ph // 2), pass_txt, font=font_pass, fill=(250, 225, 156, 255))

    # Save output
    if not output_path:
        output_path = os.path.join(CARDS_DIR, f'card_{guest.get("id")}.jpg')

    card.convert('RGB').save(output_path, quality=98)
    print(f"Generated scannable card at {output_path}")
    return output_path

if __name__ == '__main__':
    gid = sys.argv[1] if len(sys.argv) > 1 else '1'
    out = sys.argv[2] if len(sys.argv) > 2 else None
    render_guest_card(gid, out)
