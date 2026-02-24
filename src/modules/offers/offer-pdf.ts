import PDFDocument from 'pdfkit';
import fs from 'node:fs';
import path from 'node:path';
import type { Offer } from '../../db/schema/index.js';

const DATA_DIR = path.resolve('./data/offers');

function ensureDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function formatDollars(cents: number): string {
  return '$' + (cents / 100).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

function formatDate(d: Date | null): string {
  if (!d) return '—';
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
}

export async function generateOfferPdf(offer: Offer): Promise<string> {
  ensureDir();

  const filePath = path.join(DATA_DIR, `${offer.id}.pdf`);

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'LETTER', margin: 72 });
    const stream = fs.createWriteStream(filePath);

    doc.pipe(stream);

    // Header
    doc
      .fontSize(14)
      .font('Helvetica-Bold')
      .text('DOMINION HOMES LLC', { align: 'center' });
    doc
      .fontSize(10)
      .font('Helvetica')
      .text('Adam DesJardin', { align: 'center' })
      .text('Spokane Valley, Washington', { align: 'center' })
      .text('(509) 309-0434', { align: 'center' });

    doc.moveDown(0.5);
    doc
      .strokeColor('#333333')
      .lineWidth(1)
      .moveTo(72, doc.y)
      .lineTo(540, doc.y)
      .stroke();
    doc.moveDown(1);

    // Title
    doc.fontSize(16).font('Helvetica-Bold').text('PURCHASE OFFER', { align: 'center' });
    doc.moveDown(1);

    // Date and expiry
    doc.fontSize(10).font('Helvetica');
    doc.text(`Date: ${formatDate(offer.createdAt)}`);
    doc.text(`Offer Expires: ${formatDate(offer.expiresAt)}`);
    doc.moveDown(1);

    // Recipient
    doc.text(`To: ${offer.ownerName ?? 'Property Owner'}`);
    const fullAddress = [
      offer.propertyAddress,
      offer.propertyCity,
      offer.propertyState,
      offer.propertyZip,
    ]
      .filter(Boolean)
      .join(', ');
    doc.text(`Property: ${fullAddress}`);
    doc.moveDown(1);

    // Salutation
    doc.text(`Dear ${offer.ownerName ?? 'Property Owner'},`);
    doc.moveDown(0.5);
    doc.text(
      'Dominion Homes LLC ("Buyer") hereby submits the following offer to purchase the above-referenced property:',
    );
    doc.moveDown(1);

    // Terms table
    const terms = [
      ['PURCHASE PRICE:', formatDollars(offer.offerAmountCents)],
      ['EARNEST MONEY DEPOSIT:', formatDollars(offer.earnestMoneyCents)],
      ['CLOSING TIMELINE:', `${offer.closingDays} days from acceptance`],
      ['INSPECTION PERIOD:', `${offer.inspectionDays} days from acceptance`],
    ];

    doc.font('Helvetica-Bold');
    for (const [label, value] of terms) {
      doc.text(label, 72, doc.y, { continued: true, width: 250 });
      doc.font('Helvetica').text(`  ${value}`);
      doc.font('Helvetica-Bold');
    }
    doc.font('Helvetica');
    doc.moveDown(1);

    // Contingencies
    const contingencies = offer.contingencies ?? [];
    if (contingencies.length > 0) {
      doc.font('Helvetica-Bold').text('CONTINGENCIES:');
      doc.font('Helvetica');
      for (const c of contingencies) {
        doc.text(`  •  ${c.charAt(0).toUpperCase() + c.slice(1)}`);
      }
      doc.moveDown(1);
    }

    // Additional terms
    if (offer.additionalTerms) {
      doc.font('Helvetica-Bold').text('ADDITIONAL TERMS:');
      doc.font('Helvetica').text(offer.additionalTerms);
      doc.moveDown(1);
    }

    // Expiry notice
    doc.text(
      `This offer is valid until ${formatDate(offer.expiresAt)}. If not accepted by that date, this offer shall be considered withdrawn.`,
    );
    doc.moveDown(2);

    // Signature block
    doc.font('Helvetica-Bold').text('Buyer:');
    doc.font('Helvetica').text('Dominion Homes LLC');
    doc.text('By: Adam DesJardin');
    doc.moveDown(2);

    doc.text('_______________________________');
    doc.text('Signature                                    Date');

    doc.end();

    stream.on('finish', () => resolve(filePath));
    stream.on('error', reject);
  });
}
