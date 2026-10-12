/**
 * High-Resolution Table Tent Cards PDF Generator Service (pdfTableCardsService.js)
 * Generates stationery-ready, perfectly aligned multi-page A4 PDF documents.
 */

const PDFDocument = require('pdfkit');
const QRCode = require('qrcode');

async function generateTableCardsPDF(options = {}) {
  const tablesCount = Math.max(1, Math.min(50, parseInt(options.tablesCount || options.tables || 35, 10)));
  const copies = Math.max(1, Math.min(10, parseInt(options.copies || 3, 10)));
  const density = parseInt(options.density || 4, 10) === 6 ? 6 : 4;
  const theme = (options.theme === 'theme-ivory' || options.theme === 'ivory') ? 'ivory' : 'emerald';
  const range = options.range || 'all';
  const baseUrl = options.baseUrl || 'https://lilian.nyisu.com';

  const doc = new PDFDocument({
    size: 'A4',
    margin: 0,
    info: {
      Title: 'Vipeperushi vya Meza - Send-off ya Lilian Marcus',
      Author: 'Felician Joseph (Nyisulya)',
      Subject: 'Dual QR Table Tent Cards',
      Keywords: 'Table Cards, QR Code, Send-off, Lilian, Drinks Menu'
    }
  });

  // Pre-generate & cache QR buffers
  const websiteUrl = `${baseUrl}/celebration.html`;
  const websiteQrBuffer = await QRCode.toBuffer(websiteUrl, {
    errorCorrectionLevel: 'M',
    margin: 1,
    scale: 6,
    color: { dark: '#000000', light: '#ffffff' }
  });

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

  // Calculate cards to generate based on range
  const cardsList = [];
  for (let t = 1; t <= tablesCount; t++) {
    for (let c = 1; c <= copies; c++) {
      cardsList.push(t);
    }
  }

  let finalCards = cardsList;
  if (range === 'sample-1') {
    finalCards = cardsList.slice(0, density); // 1 page
  } else if (range === 'first-5') {
    finalCards = cardsList.slice(0, density * 5); // 5 pages
  } else if (range === 'first-10') {
    finalCards = cardsList.slice(0, density * 10); // 10 pages
  }

  // Page dimensions (A4 in points: 595.28 x 841.89)
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

    // Optional page number / trim guide at the very bottom
    doc.fontSize(7).fillColor('#64748b').text(
      `Send-off ya Lilian Marcus - Karatasi ${page + 1} ya ${totalPages} - Kata kwenye mistari ya doti`,
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

      drawSingleCard(doc, x, y, cardWidth, cardHeight, tableNum, theme, density, tableQrBuffers[tableNum], websiteQrBuffer);
      cardIdx++;
    }
  }

  doc.end();
  return doc;
}

function drawSingleCard(doc, x, y, w, h, tableNum, theme, density, tableQrBuf, webQrBuf) {
  doc.save();

  // 1. Draw outer dashed cutting guide border
  doc.dash(3, { space: 3 })
     .lineWidth(0.8)
     .strokeColor('#94a3b8')
     .rect(x, y, w, h)
     .stroke();
  doc.undash();

  // 2. Inner luxury card container
  const pad = 4;
  const cx = x + pad;
  const cy = y + pad;
  const cw = w - (pad * 2);
  const ch = h - (pad * 2);
  const radius = 8;

  const isIvory = theme === 'ivory';
  const bgColor = isIvory ? '#fffef7' : '#041c12';
  const borderColor = isIvory ? '#d4af37' : '#d4af37';
  const textColor = isIvory ? '#041c12' : '#ffffff';
  const goldColor = '#b8860b';
  const lightGoldColor = isIvory ? '#996515' : '#fef08a';

  // Fill card background
  doc.roundedRect(cx, cy, cw, ch, radius)
     .fillAndStroke(bgColor, borderColor);

  // 3. Top Header: Tag & Table Name (Pure Clean Typography without Emojis)
  const topY = cy + (density === 6 ? 6 : 10);
  doc.fontSize(density === 6 ? 6.5 : 7.5)
     .font('Helvetica-Bold')
     .fillColor(lightGoldColor)
     .text('SEND-OFF YA LILIAN MARCUS', cx, topY, { width: cw, align: 'center' });

  const tableTitleY = topY + (density === 6 ? 10 : 13);
  doc.fontSize(density === 6 ? 17 : 22)
     .font('Helvetica-Bold')
     .fillColor(isIvory ? '#062318' : '#ffffff')
     .text(`MEZA ${tableNum}`, cx, tableTitleY, { width: cw, align: 'center' });

  const subtitleY = tableTitleY + (density === 6 ? 18 : 23);
  doc.fontSize(density === 6 ? 5.5 : 6.5)
     .font('Helvetica-Bold')
     .fillColor('#10b981')
     .text('VIP TABLE SERVICE | BRAGGING SOCIAL HALL, GOBA', cx, subtitleY, { width: cw, align: 'center' });

  // 4. Dual QR Codes Section (No emoji in headers)
  const qrSectionY = subtitleY + (density === 6 ? 10 : 14);
  const qrBoxW = (cw - 18) / 2;
  const qrBoxH = density === 6 ? 124 : 170;
  const qrSize = density === 6 ? 74 : 98;

  // Left QR: Drink Order
  const leftX = cx + 6;
  drawQrBox(doc, leftX, qrSectionY, qrBoxW, qrBoxH, qrSize, 'ODA YA VINYWAJI', 'Scan kuagiza vinywaji', `lilian.nyisu.com/order/meza-${tableNum}`, tableQrBuf, isIvory);

  // Right QR: Celebration Website
  const rightX = cx + qrBoxW + 12;
  drawQrBox(doc, rightX, qrSectionY, qrBoxW, qrBoxH, qrSize, 'TOVUTI YA SHEREHE', 'Scan picha, sala & ratiba', 'lilian.nyisu.com', webQrBuf, isIvory);

  // 5. Card Footer
  const footerY = qrSectionY + qrBoxH + (density === 6 ? 4 : 8);
  doc.strokeColor(isIvory ? '#e2e8f0' : '#1e3a2b')
     .lineWidth(0.5)
     .moveTo(cx + 8, footerY)
     .lineTo(cx + cw - 8, footerY)
     .stroke();

  doc.fontSize(density === 6 ? 5.5 : 6.5)
     .font('Helvetica')
     .fillColor(isIvory ? '#4b5563' : '#94a3b8')
     .text('Jumanne, 13 Oktoba 2026 | Karibuni Tufurahi Pamoja!', cx, footerY + 3, { width: cw, align: 'center' });

  doc.fontSize(density === 6 ? 5.5 : 6.5)
     .font('Helvetica-Bold')
     .fillColor(lightGoldColor)
     .text('Mfumo wa Kidijitali: 0787 661 560 (Nyisulya)', cx, footerY + (density === 6 ? 11 : 13), { width: cw, align: 'center' });

  doc.restore();
}

function drawQrBox(doc, bx, by, bw, bh, qrSize, headerText, captionText, urlText, qrBuffer, isIvory) {
  // Box background
  doc.roundedRect(bx, by, bw, bh, 6)
     .fillAndStroke(isIvory ? '#ffffff' : '#03140d', isIvory ? '#d4af37' : '#0e5239');

  // Header
  doc.fontSize(bh > 140 ? 7 : 6)
     .font('Helvetica-Bold')
     .fillColor(isIvory ? '#062318' : '#fef08a')
     .text(headerText, bx, by + 4, { width: bw, align: 'center' });

  // QR Image Centered
  const qrX = bx + ((bw - qrSize) / 2);
  const qrY = by + (bh > 140 ? 18 : 15);

  // White border backing for QR
  doc.roundedRect(qrX - 2, qrY - 2, qrSize + 4, qrSize + 4, 4)
     .fillAndStroke('#ffffff', '#d4af37');

  doc.image(qrBuffer, qrX, qrY, { width: qrSize, height: qrSize });

  // Caption
  const capY = qrY + qrSize + 4;
  doc.fontSize(bh > 140 ? 6 : 5)
     .font('Helvetica')
     .fillColor(isIvory ? '#374151' : '#cbd5e1')
     .text(captionText, bx, capY, { width: bw, align: 'center' });

  // Direct short URL
  const urlY = capY + (bh > 140 ? 10 : 8);
  doc.fontSize(bh > 140 ? 6 : 5)
     .font('Courier-Bold')
     .fillColor(isIvory ? '#0f172a' : '#fef08a')
     .text(urlText, bx, urlY, { width: bw, align: 'center' });
}

module.exports = {
  generateTableCardsPDF
};
