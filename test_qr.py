import qrcode
from PIL import Image
import json

# Read actual guest data
with open('data/db.json', 'r', encoding='utf-8') as f:
    data = json.load(f)
guests = data.get('guests', [])
g = guests[0] if guests else {'id': '1', 'code': '3141'}
gid_val = g.get('id', '1')
code_val = g.get('code', '3141')
name_val = g.get('name', '???')
print(f"Guest 1: id={gid_val}, code={code_val}, name={name_val}")

# Generate QR exactly like generate_card.py does
gid = str(gid_val)
code = str(code_val)
qr_payload = f"https://lilian.nyisu.com/invite/{gid}?code={code}"
print(f"QR payload: {qr_payload}")
print(f"Payload length: {len(qr_payload)} chars")

qr = qrcode.QRCode(
    version=None,
    error_correction=qrcode.constants.ERROR_CORRECT_M,
    box_size=4,
    border=2,
)
qr.add_data(qr_payload)
qr.make(fit=True)
print(f"QR version: {qr.version}")
print(f"QR matrix size: {qr.modules_count}x{qr.modules_count}")

qr_img = qr.make_image(fill_color='black', back_color='white')
native_size = qr_img.size
print(f"Native QR image size: {native_size[0]}x{native_size[1]} px")

# Calculate module size when resized to 108x108
modules = qr.modules_count
module_px = 108 / modules
print(f"Module pixel size at 108x108: {module_px:.2f} px per module")
print(f"Module pixel size at 150x150: {150/modules:.2f} px per module")
print(f"Module pixel size at 200x200: {200/modules:.2f} px per module")

# Now test with shorter payload
short_payload = code
qr2 = qrcode.QRCode(version=None, error_correction=qrcode.constants.ERROR_CORRECT_M, box_size=4, border=2)
qr2.add_data(short_payload)
qr2.make(fit=True)
print(f"\nShort payload (just code '{code}'):")
print(f"  QR version: {qr2.version}")
print(f"  Matrix: {qr2.modules_count}x{qr2.modules_count}")
print(f"  Module px at 108: {108/qr2.modules_count:.2f}")

# Test with just guest ID
id_payload = gid
qr3 = qrcode.QRCode(version=None, error_correction=qrcode.constants.ERROR_CORRECT_M, box_size=4, border=2)
qr3.add_data(id_payload)
qr3.make(fit=True)
print(f"\nID payload (just id '{gid}'):")
print(f"  QR version: {qr3.version}")
print(f"  Matrix: {qr3.modules_count}x{qr3.modules_count}")
print(f"  Module px at 108: {108/qr3.modules_count:.2f}")
