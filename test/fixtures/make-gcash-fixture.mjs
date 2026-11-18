// Builds a MADE-UP statement PDF that copies the column layout of a GCash Transaction History.
// Every name, number and amount is invented. It is not a real statement.
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

export const COLS = { date: 30, description: 135, reference: 345, debit: 440, credit: 495, balance: 545 };
export const OPENING = '1,250.00';

// Oldest first, as on the real statement. [date and time, description (lines), reference, debit, credit, balance]
export const ROWS = [
  ['2026-03-01 08:12 AM', ['Received GCash from Sample Bank with account', 'ending in 0000'], '9000000000001', '', '5,000.00', '6,250.00'],
  ['2026-03-01 12:40 PM', ['Payment to Demo Rides'], '9000000000002', '186.00', '', '6,064.00'],
  ['2026-03-02 07:55 PM', ['Transfer from 09000000001 to 09000000002'], '9000000000003', '1,500.00', '', '4,564.00'],
  ['2026-03-04 09:10 AM', ['Refund from Demo Rides'], '9000000000004', '', '75.00', '4,639.00'],
  ['2026-03-05 12:05 AM', ['Payment to Sample Convenience Store'], '9000000000005', '132.50', '', '4,506.50'],
  ['2026-03-08 03:30 PM', ['Transfer from 09000000003 to 09000000001'], '9000000000006', '', '2,500.00', '7,006.50'],
  ['2026-03-10 08:45 PM', ['Payment to Example Streaming Subscription', 'Monthly Plan'], '9000000000007', '549.00', '', '6,457.50'],
  ['2026-03-12 01:15 PM', ['Buy Load for 09000000001'], '9000000000008', '100.00', '', '6,357.50'],
  ['2026-03-14 10:00 AM', ['Bills Payment to Sample Electric Company'], '9000000000009', '2,340.75', '', '4,016.75'],
  ['2026-03-15 12:30 PM', ['Cash-in from Demo Outlet'], '9000000000010', '', '1,000.00', '5,016.75'],
];
export const TOTAL_DEBIT = '4,808.25';
export const TOTAL_CREDIT = '8,575.00';
export const CLOSING = '5,016.75';

export async function buildFixture() {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const text = (page, s, x, y, f = font, size = 8) => page.drawText(s, { x, y, font: f, size });
  const header = (page, y) => {
    text(page, 'Date and Time', COLS.date, y, bold);
    text(page, 'Description', COLS.description, y, bold);
    text(page, 'Reference No.', COLS.reference, y, bold);
    text(page, 'Debit', COLS.debit, y, bold);
    text(page, 'Credit', COLS.credit, y, bold);
    text(page, 'Balance', COLS.balance, y, bold);
  };

  let page = pdf.addPage([612, 792]);
  let y = 750;
  text(page, 'GCash Transaction History (SAMPLE - NOT A REAL STATEMENT)', 30, y, bold, 12);
  y -= 18;
  text(page, '2026-03-01 to 2026-03-15', 30, y);
  y -= 24;
  text(page, 'STARTING BALANCE', COLS.reference, y, bold);
  text(page, OPENING, COLS.balance, y);
  y -= 16;
  header(page, y);
  y -= 16;

  ROWS.forEach((row, i) => {
    if (i === 6) {
      text(page, 'Page 1 of 2', 280, 26, font, 7);
      page = pdf.addPage([612, 792]);
      y = 750;
      header(page, y);
      y -= 16;
    }
    const [when, description, reference, debit, credit, balance] = row;
    text(page, when, COLS.date, y);
    description.forEach((d, k) => text(page, d, COLS.description, y - k * 10));
    text(page, reference, COLS.reference, y);
    if (debit) text(page, debit, COLS.debit, y);
    if (credit) text(page, credit, COLS.credit, y);
    text(page, balance, COLS.balance, y);
    y -= 10 * description.length + 8;
  });
  y -= 6;
  text(page, 'ENDING BALANCE', COLS.reference, y, bold);
  text(page, CLOSING, COLS.balance, y);
  y -= 14;
  text(page, 'Total Debit', COLS.reference, y, bold);
  text(page, TOTAL_DEBIT, COLS.balance, y);
  y -= 12;
  text(page, 'Total Credit', COLS.reference, y, bold);
  text(page, TOTAL_CREDIT, COLS.balance, y);
  text(page, 'Page 2 of 2', 280, 26, font, 7);
  return pdf.save();
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const out = new URL('./gcash-ph-sample.pdf', import.meta.url);
  await writeFile(out, await buildFixture());
  console.log('wrote gcash-ph-sample.pdf');
}
