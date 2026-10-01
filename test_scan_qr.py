"""Test all cards scan correctly from FULL IMAGE (no zoom)."""
import cv2
import json
import os

BASE = os.path.dirname(os.path.abspath(__file__))
CARDS = os.path.join(BASE, 'public', 'images', 'cards')

with open(os.path.join(BASE, 'data', 'db.json'), 'r', encoding='utf-8') as f:
    data = json.load(f)

det = cv2.QRCodeDetector()
passed = 0
failed = 0
total = 0

for g in data.get('guests', []):
    gid = g.get('id')
    code = str(g.get('code', gid))
    card_path = os.path.join(CARDS, f'card_{gid}.jpg')
    
    if not os.path.exists(card_path):
        continue
    
    total += 1
    img = cv2.imread(card_path)
    result, _, _ = det.detectAndDecode(img)
    
    if result == code:
        passed += 1
    else:
        failed += 1
        print(f"  FAIL card_{gid}.jpg: expected '{code}', got '{repr(result)}'")

print(f"\nResults: {passed}/{total} passed, {failed} failed")
