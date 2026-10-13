/**
 * High-Resolution Table Tent Cards PDF Generator Service (pdfTableCardsService.js)
 * Supports Single Standalone Mini Cards (A6 / 10x15cm - Moja Moja) and Classic Multi-Card Sheets.
 */

const PDFDocument = require('pdfkit');
const QRCode = require('qrcode');

async function generateTableCardsPDF(options = {}) {
  const tablesCount = Math.max(1, Math.min(50, parseInt(options.tablesCount || options.tables || 35, 10)));
  const copies = Math.max(1, Math.min(10, parseInt(options.copies || 1, 10)));
  const density = parseInt(options.density ?? 1, 10); // Default to 1 (Single Standalone Card Moja Moja)
  const isSingle = density === 1 || options.format === 'single' || options.size === 'a6';
  const theme = (options.theme === 'theme-ivory' || options.theme === 'ivory') ? 'ivory' : 'emerald';
  const range = options.range || 'all';
  const specificTable = parseInt(options.table || 0, 10);
  const baseUrl = options.baseUrl || 'https://lilian.nyisu.com';

  const doc = new PDFDocument({
    size: isSingle ? 'A6' : 'A4',
    margin: 0,
    info: {
      Title: 'Kadi za Meza za Kidijitali - Send-off ya Lilian Marcus',
      Author: 'Felician Joseph (Nyisulya)',
      Subject: 'Mini Table Cards - Oda ya Vinywaji Mezani (Moja Moja)',
      Keywords: 'Table Cards, QR Code, Send-off, Lilian, Drinks Menu'
    }
  });

  // Pre-generate & cache Table QR buffers (Drink Order only)
  const tableQrBuffers = {};
  for (let t = 1; t <= tablesCount; t++) {
    const tableUrl = `${baseUrl}/order/meza-${t}`;
    tableQrBuffers[t] = await QRCode.toBuffer(tableUrl, {
      errorCorrectionLevel: 'M',
      margin: 1,
      scale: 6,
      color: { dark: '#000000', light: '#ffffff' }
    });
  }

  // Calculate cards to generate
  let cardsList = [];
  if (specificTable >= 1 && specificTable <= tablesCount) {
    for (let c = 1; c <= copies; c++) {
      cardsList.push(specificTable);
    }
  } else {
    for (let t = 1; t <= tablesCount; t++) {
      for (let c = 1; c <= copies; c++) {
        cardsList.push(t);
      }
    }
  }

  let finalCards = cardsList;
  if (range === 'sample-1') {
    finalCards = cardsList.slice(0, isSingle ? 1 : density);
  } else if (range === 'first-5') {
    finalCards = cardsList.slice(0, (isSingle ? 1 : density) * 5);
  } else if (range === 'first-10') {
    finalCards = cardsList.slice(0, (isSingle ? 1 : density) * 10);
  }

  if (isSingle) {
    // ==========================================
    // SINGLE STANDALONE MINI CARDS (A6 - MOJA MOJA)
    // Points: 297.64 x 420.94 (105mm x 148mm)
    // ==========================================
    const pW = 297.64;
    const pH = 420.94;
    const m = 12;
    const cW = pW - (m * 2);
    const cH = pH - (m * 2);

    for (let i = 0; i < finalCards.length; i++) {
      if (i > 0) {
        doc.addPage({ size: 'A6', margin: 0 });
      }
      const tableNum = finalCards[i];
      drawSingleCard(doc, m, m, cW, cH, tableNum, theme, 1, tableQrBuffers[tableNum]);
    }
  } else {
    // ==========================================
    // CLASSIC A4 SHEET (4 AU 6 CARDS PER PAGE)
    // ==========================================
    const pageWidth = 595.28;
    const pageHeight = 841.89;
    const marginX = 22;
    const marginY = 22;
    const usableWidth = pageWidth - (marginX * 2);
    const usableHeight = pageHeight - (marginY * 2);

    const cols = 2;
    const rows = density === 6 ? 3 : 2;
    const gapX = 14;
    const gapY = density === 6 ? 10 : 16;
    const cardWidth = (usableWidth - (gapX * (cols - 1))) / cols;
    const cardHeight = (usableHeight - (gapY * (rows - 1))) / rows;

    const totalPages = Math.ceil(finalCards.length / density);
    let cardIdx = 0;

    for (let page = 0; page < totalPages; page++) {
      if (page > 0) {
        doc.addPage({ size: 'A4', margin: 0 });
      }

      doc.fontSize(7).fillColor('#64748b').text(
        `Send-off ya Lilian Marcus - Karatasi ${page + 1} ya ${totalPages} - Kata kwenye mistari`,
        marginX,
        pageHeight - 16,
        { width: usableWidth, align: 'center' }
      );

      for (let slot = 0; slot < density; slot++) {
        if (cardIdx >= finalCards.length) break;
        const tableNum = finalCards[cardIdx];
        const col = slot % cols;
        const row = Math.floor(slot / cols);

        const x = marginX + (col * (cardWidth + gapX));
        const y = marginY + (row * (cardHeight + gapY));

        drawSingleCard(doc, x, y, cardWidth, cardHeight, tableNum, theme, density, tableQrBuffers[tableNum]);
        cardIdx++;
      }
    }
  }

  doc.end();
  return doc;
}

function drawSingleCard(doc, x, y, w, h, tableNum, theme, density, tableQrBuf) {
  doc.save();

  const isSingle = density === 1;
  const isCompact = density === 6;

  // 1. Border
  if (!isSingle) {
    doc.dash(3, { space: 3 })
       .lineWidth(0.8)
       .strokeColor('#94a3b8')
       .rect(x, y, w, h)
       .stroke();
    doc.undash();
  }

  // 2. Luxury card container
  const pad = isSingle ? 0 : 4;
  const cx = x + pad;
  const cy = y + pad;
  const cw = w - (pad * 2);
  const ch = h - (pad * 2);
  const radius = isSingle ? 10 : 8;

  const isIvory = theme === 'ivory';
  const bgColor = isIvory ? '#fffef7' : '#041c12';
  const borderColor = '#d4af37';
  const lightGoldColor = isIvory ? '#996515' : '#fef08a';

  // Fill card background
  doc.roundedRect(cx, cy, cw, ch, radius)
     .lineWidth(isSingle ? 2 : 1.5)
     .fillAndStroke(bgColor, borderColor);

  // Decorative inner line for Single cards
  if (isSingle) {
    doc.roundedRect(cx + 4, cy + 4, cw - 8, ch - 8, radius - 2)
       .lineWidth(0.7)
       .strokeColor(isIvory ? '#c59b27' : '#0e5239')
       .stroke();
  }

  // 3. Top Header: Brand Tag & Table Number
  const topY = cy + (isSingle ? 14 : (isCompact ? 8 : 12));
  doc.fontSize(isSingle ? 8.5 : (isCompact ? 6.5 : 7.5))
     .font('Helvetica-Bold')
     .fillColor(lightGoldColor)
     .text('SEND-OFF YA LILIAN MARCUS', cx, topY, { width: cw, align: 'center' });

  const tableTitleY = topY + (isSingle ? 15 : (isCompact ? 11 : 14));
  doc.fontSize(isSingle ? 26 : (isCompact ? 18 : 23))
     .font('Helvetica-Bold')
     .fillColor(isIvory ? '#062318' : '#ffffff')
     .text(`MEZA ${tableNum}`, cx, tableTitleY, { width: cw, align: 'center' });

  const subtitleY = tableTitleY + (isSingle ? 28 : (isCompact ? 19 : 25));
  doc.fontSize(isSingle ? 7.2 : (isCompact ? 5.5 : 6.8))
     .font('Helvetica-Bold')
     .fillColor('#10b981')
     .text('VIP TABLE SERVICE | BRAGGING SOCIAL HALL, GOBA', cx, subtitleY, { width: cw, align: 'center' });

  // 4. Single QR Code Section: Oda ya Vinywaji Mezani
  const qrSectionY = subtitleY + (isSingle ? 14 : (isCompact ? 10 : 16));
  const qrBoxW = isSingle ? 240 : (isCompact ? 180 : 200);
  const qrBoxH = isSingle ? 210 : (isCompact ? 126 : 172);
  const qrSize = isSingle ? 140 : (isCompact ? 82 : 110);
  const qrBoxX = cx + ((cw - qrBoxW) / 2);

  drawQrBox(
    doc,
    qrBoxX,
    qrSectionY,
    qrBoxW,
    qrBoxH,
    qrSize,
    'ODA YA VINYWAJI MEZANI',
    'Scan kwa kamera ya simu kuagiza vinywaji vyako',
    `lilian.nyisu.com/order/meza-${tableNum}`,
    tableQrBuf,
    isIvory,
    isSingle
  );

  // 5. Card Footer
  const footerY = qrSectionY + qrBoxH + (isSingle ? 14 : (isCompact ? 6 : 14));
  doc.strokeColor(isIvory ? '#e2e8f0' : '#1e3a2b')
     .lineWidth(0.5)
     .moveTo(cx + 12, footerY)
     .lineTo(cx + cw - 12, footerY)
     .stroke();

  doc.fontSize(isSingle ? 7.2 : (isCompact ? 5.5 : 6.5))
     .font('Helvetica')
     .fillColor(isIvory ? '#4b5563' : '#94a3b8')
     .text('Jumanne, 13 Oktoba 2026 | Karibuni Tufurahi Pamoja!', cx, footerY + 5, { width: cw, align: 'center' });

  doc.fontSize(isSingle ? 7.2 : (isCompact ? 5.5 : 6.5))
     .font('Helvetica-Bold')
     .fillColor(lightGoldColor)
     .text('Mfumo wa Kidijitali: 0787 661 560 (Nyisulya)', cx, footerY + (isSingle ? 16 : (isCompact ? 12 : 14)), { width: cw, align: 'center' });

  doc.restore();
}

function drawQrBox(doc, bx, by, bw, bh, qrSize, headerText, captionText, urlText, qrBuffer, isIvory, isSingle) {
  // Box background
  doc.roundedRect(bx, by, bw, bh, 8)
     .fillAndStroke(isIvory ? '#ffffff' : '#03140d', isIvory ? '#d4af37' : '#0e5239');

  // Header
  doc.fontSize(isSingle ? 9.5 : (bh > 140 ? 7.8 : 6.5))
     .font('Helvetica-Bold')
     .fillColor(isIvory ? '#062318' : '#fef08a')
     .text(headerText, bx, by + (isSingle ? 8 : (bh > 140 ? 8 : 5)), { width: bw, align: 'center' });

  // QR Image Centered
  const qrX = bx + ((bw - qrSize) / 2);
  const qrY = by + (isSingle ? 24 : (bh > 140 ? 22 : 16));

  // White border backing for QR
  doc.roundedRect(qrX - 3, qrY - 3, qrSize + 6, qrSize + 6, 5)
     .fillAndStroke('#ffffff', '#d4af37');

  doc.image(qrBuffer, qrX, qrY, { width: qrSize, height: qrSize });

  // Caption
  const capY = qrY + qrSize + (isSingle ? 6 : (bh > 140 ? 6 : 4));
  doc.fontSize(isSingle ? 7.6 : (bh > 140 ? 6.8 : 5.5))
     .font('Helvetica')
     .fillColor(isIvory ? '#374151' : '#cbd5e1')
     .text(captionText, bx, capY, { width: bw, align: 'center' });

  // Direct short URL
  const urlY = capY + (isSingle ? 12 : (bh > 140 ? 11 : 9));
  doc.fontSize(isSingle ? 7.8 : (bh > 140 ? 6.5 : 5.5))
     .font('Courier-Bold')
     .fillColor(isIvory ? '#0f172a' : '#fef08a')
     .text(urlText, bx, urlY, { width: bw, align: 'center' });
}

module.exports = {
  generateTableCardsPDF
};
