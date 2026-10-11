#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Export WhatsApp Outbox to a Clean, Deduplicated Excel File (.xlsx)
6 Columns, Large Spacious Cells, Clear Delivery Status (IMEFIKA / HAIJAFIKA)
Send-off ya Lilian Marcus Nyahende
"""

import os
import json
import re
from datetime import datetime
import openpyxl
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from openpyxl.utils import get_column_letter

BASE_DIR = os.path.dirname(os.path.abspath(__file__))

def normalize_phone(phone_str):
    if not phone_str:
        return ""
    digits = re.sub(r'[^0-9]', '', str(phone_str))
    if digits.startswith('0') and len(digits) == 10:
        digits = '255' + digits[1:]
    elif len(digits) == 9:
        digits = '255' + digits
    return digits

def load_database():
    live_path = os.path.join(BASE_DIR, 'data', 'live_db.json')
    db_path = os.path.join(BASE_DIR, 'data', 'db.json')
    
    file_to_use = live_path if os.path.exists(live_path) else db_path
    if not os.path.exists(file_to_use):
        raise FileNotFoundError(f"Database file not found at {live_path} or {db_path}")
    
    print(f"[*] Inasoma database kutoka: {file_to_use}")
    with open(file_to_use, 'r', encoding='utf-8') as f:
        return json.load(f)

def clean_and_deduplicate(db):
    logs = db.get('whatsappLogs', [])
    guests = db.get('guests', [])

    print(f"[*] Jumla ya logs kwenye database: {len(logs)}")
    print(f"[*] Jumla ya wageni kwenye database: {len(guests)}")

    # Index guests by normalized phone and by clean lowercase name
    guest_by_phone = {}
    guest_by_name = {}
    for g in guests:
        p = normalize_phone(g.get('phone', ''))
        if p:
            guest_by_phone[p] = g
        n = (g.get('name') or '').strip().lower()
        if n:
            guest_by_name[n] = g

    # Deduplicate logs by unique phone (or clean name if phone missing)
    recipients = {}

    for log in logs:
        p = normalize_phone(log.get('recipientPhone') or log.get('phone') or '')
        name = (log.get('recipientName') or log.get('name') or '').strip()
        key = p if p else name.lower()

        if not key:
            continue

        status = str(log.get('status', '')).lower()
        is_delivered = (status == 'delivered')
        timestamp = log.get('timestamp') or log.get('time') or ''

        # Match extra details from guest registry
        matched_g = guest_by_phone.get(p) or (guest_by_name.get(name.lower()) if name else None)
        final_name = name or (matched_g.get('name') if matched_g else 'Mualikwa')
        seats_val = matched_g.get('seats', 1) if matched_g else 1
        is_double = (str(seats_val).lower() in ['2', 'double', 'double vip'] or matched_g.get('isDouble') is True) if matched_g else False

        if key not in recipients:
            recipients[key] = {
                'name': final_name,
                'phone': p,
                'seats': 'Double (2)' if is_double else 'Single (1)',
                'status': 'IMEFIKA' if is_delivered else 'HAIJAFIKA',
                'success_count': 1 if is_delivered else 0,
                'failed_count': 0 if is_delivered else 1,
                'attempts': 1,
                'last_timestamp': timestamp
            }
        else:
            item = recipients[key]
            item['attempts'] += 1
            if is_delivered:
                item['status'] = 'IMEFIKA'  # Prioritize delivered!
                item['success_count'] += 1
            else:
                item['failed_count'] += 1

            if timestamp and (not item['last_timestamp'] or timestamp > item['last_timestamp']):
                item['last_timestamp'] = timestamp

    all_list = list(recipients.values())
    
    # Sort: put HAIJAFIKA at top (or keep clear order) - let's sort by name
    all_list.sort(key=lambda x: x['name'].lower())

    delivered_count = sum(1 for r in all_list if r['status'] == 'IMEFIKA')
    failed_count = sum(1 for r in all_list if r['status'] == 'HAIJAFIKA')

    print(f"[OK] Wageni waliopokea (IMEFIKA): {delivered_count}")
    print(f"[FAIL] Wageni ambao ujumbe haukufika (HAIJAFIKA): {failed_count}")
    print(f"[TOTAL] Jumla ya wageni wote: {len(all_list)}")

    return all_list

def create_excel_report(all_list, output_filename):
    wb = openpyxl.Workbook()
    # Sheet 1: Master Sheet (Orodha Kamili - 6 Columns)
    ws1 = wb.active
    ws1.title = "Orodha Kamili ya Wageni"
    ws1.views.sheetView[0].showGridLines = True

    # Colors & Styles
    navy_header_fill = PatternFill(start_color="102A45", end_color="102A45", fill_type="solid")
    green_badge_fill = PatternFill(start_color="E6F4EA", end_color="E6F4EA", fill_type="solid")
    red_badge_fill = PatternFill(start_color="FCE8E6", end_color="FCE8E6", fill_type="solid")
    zebra_fill = PatternFill(start_color="F9FAFB", end_color="F9FAFB", fill_type="solid")

    font_banner = Font(name="Calibri", size=15, bold=True, color="102A45")
    font_header = Font(name="Calibri", size=12, bold=True, color="FFFFFF")
    font_cell_bold = Font(name="Calibri", size=12, bold=True, color="1B2A3D")
    font_cell_regular = Font(name="Calibri", size=12, color="222222")
    font_green = Font(name="Calibri", size=12, bold=True, color="0D652D")
    font_red = Font(name="Calibri", size=12, bold=True, color="B31412")

    align_center = Alignment(horizontal="center", vertical="center")
    align_left = Alignment(horizontal="left", vertical="center")

    thin_border = Border(
        left=Side(style='thin', color='CCCCCC'),
        right=Side(style='thin', color='CCCCCC'),
        top=Side(style='thin', color='CCCCCC'),
        bottom=Side(style='thin', color='CCCCCC')
    )

    # Title Banner (Large & Clear)
    ws1.merge_cells("A1:F1")
    title_cell = ws1["A1"]
    title_cell.value = "ORODHA YA WAGENI WALIOTUMIWA UJUMBE WA WHATSAPP (SEND-OFF YA LILIAN MARCUS)"
    title_cell.font = font_banner
    title_cell.alignment = align_left
    ws1.row_dimensions[1].height = 36

    # Subtitle / Summary info
    delivered_count = sum(1 for r in all_list if r['status'] == 'IMEFIKA')
    failed_count = sum(1 for r in all_list if r['status'] == 'HAIJAFIKA')
    ws1.merge_cells("A2:F2")
    sub_cell = ws1["A2"]
    sub_cell.value = f"Jumla ya Wageni: {len(all_list)}  |  ✅ Zilizofika (IMEFIKA): {delivered_count}  |  ❌ Zilizokwama (HAIJAFIKA): {failed_count}  |  Tarehe: {datetime.now().strftime('%d/%m/%Y %H:%M')}"
    sub_cell.font = Font(name="Calibri", size=11, bold=True, color="555555")
    sub_cell.alignment = align_left
    ws1.row_dimensions[2].height = 24

    # EXACTLY 6 HEADERS (Spacious, Large, No Provider, No Notes)
    headers = [
        "Na.",
        "Jina la Mgeni",
        "Namba ya Simu",
        "Aina ya Mwaliko",
        "Hali ya Ujumbe",
        "Muda Uliotumwa"
    ]

    for col_idx, header in enumerate(headers, 1):
        cell = ws1.cell(row=4, column=col_idx, value=header)
        cell.fill = navy_header_fill
        cell.font = font_header
        cell.alignment = align_center
        cell.border = thin_border
    ws1.row_dimensions[4].height = 32

    # Data Rows (Cell kubwa kubwa, size 12, height 30px)
    for row_idx, r in enumerate(all_list, start=5):
        phone_display = f"+{r['phone']}" if r['phone'] else "-"
        time_display = r['last_timestamp'][:16].replace('T', ' ') if r['last_timestamp'] else "-"
        
        row_values = [
            row_idx - 4,
            r['name'],
            phone_display,
            r['seats'],
            r['status'],  # "IMEFIKA" au "HAIJAFIKA"
            time_display
        ]

        for col_idx, val in enumerate(row_values, 1):
            cell = ws1.cell(row=row_idx, column=col_idx, value=val)
            cell.border = thin_border

            # Alternating subtle row shading
            if (row_idx % 2 == 0):
                cell.fill = zebra_fill

            # Column specific styling
            if col_idx == 1:  # Na.
                cell.font = font_cell_bold
                cell.alignment = align_center
            elif col_idx == 2:  # Jina la Mgeni
                cell.font = font_cell_bold
                cell.alignment = align_left
            elif col_idx in [3, 4, 6]:  # Namba, Viti, Muda
                cell.font = font_cell_regular
                cell.alignment = align_center
            elif col_idx == 5:  # Hali ya Ujumbe
                if r['status'] == 'IMEFIKA':
                    cell.font = font_green
                    cell.fill = green_badge_fill
                else:
                    cell.font = font_red
                    cell.fill = red_badge_fill
                cell.alignment = align_center

        ws1.row_dimensions[row_idx].height = 28

    # Set Generous Column Widths so everything is large and never truncated
    column_widths = {
        "A": 8,    # Na.
        "B": 38,   # Jina la Mgeni
        "C": 22,   # Namba ya Simu
        "D": 18,   # Aina ya Mwaliko
        "E": 20,   # Hali ya Ujumbe
        "F": 22    # Muda Uliotumwa
    }
    for col_letter, width in column_widths.items():
        ws1.column_dimensions[col_letter].width = width

    # ========================================================
    # SHEET 2: WALIOPATA PEKEE (IMEFIKA)
    # ========================================================
    delivered_list = [r for r in all_list if r['status'] == 'IMEFIKA']
    ws2 = wb.create_sheet(title="Zilizofika (IMEFIKA)")
    ws2.views.sheetView[0].showGridLines = True
    
    ws2.merge_cells("A1:F1")
    t2 = ws2["A1"]
    t2.value = f"WAGENI WALIOFIKIWA KWA MAFANIKIO (Jumla: {len(delivered_list)})"
    t2.font = font_banner
    t2.alignment = align_left
    ws2.row_dimensions[1].height = 36

    for col_idx, header in enumerate(headers, 1):
        cell = ws2.cell(row=3, column=col_idx, value=header)
        cell.fill = PatternFill(start_color="0D652D", end_color="0D652D", fill_type="solid")
        cell.font = font_header
        cell.alignment = align_center
        cell.border = thin_border
    ws2.row_dimensions[3].height = 32

    for row_idx, r in enumerate(delivered_list, start=4):
        phone_display = f"+{r['phone']}" if r['phone'] else "-"
        time_display = r['last_timestamp'][:16].replace('T', ' ') if r['last_timestamp'] else "-"
        row_values = [row_idx - 3, r['name'], phone_display, r['seats'], "IMEFIKA", time_display]

        for col_idx, val in enumerate(row_values, 1):
            cell = ws2.cell(row=row_idx, column=col_idx, value=val)
            cell.border = thin_border
            if col_idx in [1, 3, 4, 6]: cell.alignment = align_center
            elif col_idx == 2: cell.alignment = align_left
            elif col_idx == 5:
                cell.font = font_green
                cell.fill = green_badge_fill
                cell.alignment = align_center
        ws2.row_dimensions[row_idx].height = 28

    for col_letter, width in column_widths.items():
        ws2.column_dimensions[col_letter].width = width

    # ========================================================
    # SHEET 3: WALIOKWAMA PEKEE (HAIJAFIKA)
    # ========================================================
    failed_list = [r for r in all_list if r['status'] == 'HAIJAFIKA']
    ws3 = wb.create_sheet(title="Zilizokwama (HAIJAFIKA)")
    ws3.views.sheetView[0].showGridLines = True

    ws3.merge_cells("A1:F1")
    t3 = ws3["A1"]
    t3.value = f"WAGENI WAMBAO UJUMBE HAUJAFIKA (Jumla: {len(failed_list)})"
    t3.font = Font(name="Calibri", size=15, bold=True, color="B31412")
    t3.alignment = align_left
    ws3.row_dimensions[1].height = 36

    for col_idx, header in enumerate(headers, 1):
        cell = ws3.cell(row=3, column=col_idx, value=header)
        cell.fill = PatternFill(start_color="8A1B14", end_color="8A1B14", fill_type="solid")
        cell.font = font_header
        cell.alignment = align_center
        cell.border = thin_border
    ws3.row_dimensions[3].height = 32

    for row_idx, r in enumerate(failed_list, start=4):
        phone_display = f"+{r['phone']}" if r['phone'] else "-"
        time_display = r['last_timestamp'][:16].replace('T', ' ') if r['last_timestamp'] else "-"
        row_values = [row_idx - 3, r['name'], phone_display, r['seats'], "HAIJAFIKA", time_display]

        for col_idx, val in enumerate(row_values, 1):
            cell = ws3.cell(row=row_idx, column=col_idx, value=val)
            cell.border = thin_border
            if col_idx in [1, 3, 4, 6]: cell.alignment = align_center
            elif col_idx == 2: cell.alignment = align_left
            elif col_idx == 5:
                cell.font = font_red
                cell.fill = red_badge_fill
                cell.alignment = align_center
        ws3.row_dimensions[row_idx].height = 28

    for col_letter, width in column_widths.items():
        ws3.column_dimensions[col_letter].width = width

    wb.save(output_filename)
    print(f"[SUCCESS] Faili la Excel limehifadhiwa kwa mafanikio: {output_filename}")

if __name__ == "__main__":
    db = load_database()
    all_recipients = clean_and_deduplicate(db)
    
    date_str = datetime.now().strftime("%Y_%m_%d")
    out_file = os.path.join(BASE_DIR, f"Wageni_Waliotumiwa_WhatsApp_Safi_{date_str}.xlsx")
    create_excel_report(all_recipients, out_file)
