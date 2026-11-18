// Builds a MADE-UP statement PDF that copies the column layout of an M-Pesa full statement.
// Every name, number and amount is invented. It is not a real statement.
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

export const COLS = { receipt: 30, time: 100, details: 205, status: 365, paidIn: 430, withdrawn: 480, balance: 535 };

// Newest first, as on the real statement. [receipt, time, details (lines), status, paidIn, withdrawn, balance]
export const ROWS = [
  ['TEST00010Z', '2026-01-05 18:40:12', ['Airtime Purchase'], 'Completed', '', '-100.00', '3,827.00'],
  ['TEST00009Y', '2026-01-05 09:15:44', ['Merchant Payment to 000111 - SAMPLE', 'GROCERS LTD'], 'Completed', '', '-1,250.00', '3,927.00'],
  ['TEST00008X', '2026-01-04 16:02:31', ['Withdrawal Charge'], 'Completed', '', '-29.00', '5,177.00'],
  ['TEST00008X', '2026-01-04 16:02:31', ['Customer Withdrawal At Agent Till 000222 -', 'Sample Agent Shop'], 'Completed', '', '-2,000.00', '5,206.00'],
  ['TEST00007W', '2026-01-04 08:30:00', ['Funds received from 0700000001 - JANE', 'EXAMPLE'], 'Completed', '5,000.00', '', '7,206.00'],
  ['TEST00006V', '2026-01-03 20:11:09', ['Pay Bill Charge'], 'Completed', '', '-23.00', '2,206.00'],
  ['TEST00006V', '2026-01-03 20:11:09', ['Pay Bill to 000333 - SAMPLE POWER Acc.', '12345678'], 'Completed', '', '-1,500.00', '2,229.00'],
  ['TEST00005U', '2026-01-03 12:45:50', ['Customer Transfer of Funds Charge'], 'Completed', '', '-13.00', '3,729.00'],
  ['TEST00005U', '2026-01-03 12:45:50', ['Customer Transfer to 0700000002 - JOHN', 'SAMPLE'], 'Completed', '', '-800.00', '3,742.00'],
  ['TEST00004T', '2026-01-02 14:20:05', ['Deposit of Funds at Agent Till 000444 - Demo', 'Agent'], 'Completed', '3,000.00', '', '4,542.00'],
  ['TEST00003S', '2026-01-02 10:05:33', ['Business Payment from 000555 - SAMPLE', 'EMPLOYER LTD'], 'Completed', '1,500.00', '', '1,542.00'],
  ['TEST00002R', '2026-01-01 19:00:00', ['Merchant Payment to 000666 - DEMO CAFE'], 'Completed', '', '-458.00', '42.00'],
  ['TEST00001Q', '2026-01-01 08:00:00', ['Funds received from 0700000003 - MARY', 'TESTER'], 'Completed', '500.00', '', '500.00'],
];

export async function buildFixture() {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const pages = [];
  const newPage = () => {
    const page = pdf.addPage([612, 792]);
    pages.push(page);
    return page;
  };
  const text = (page, s, x, y, f = font, size = 8) => page.drawText(s, { x, y, font: f, size });
  const header = (page, y) => {
    text(page, 'Receipt No.', COLS.receipt, y, bold);
    text(page, 'Completion Time', COLS.time, y, bold);
    text(page, 'Details', COLS.details, y, bold);
    text(page, 'Transaction Status', COLS.status, y, bold, 7);
    text(page, 'Paid In', COLS.paidIn, y, bold);
    text(page, 'Withdrawn', COLS.withdrawn, y, bold);
    text(page, 'Balance', COLS.balance, y, bold);
  };

  let page = newPage();
  let y = 750;
  text(page, 'MPESA FULL STATEMENT (SAMPLE - NOT A REAL STATEMENT)', 30, y, bold, 12);
  y -= 22;
  text(page, 'Customer Name: SAMPLE CUSTOMER', 30, y);
  y -= 12;
  text(page, 'Mobile Number: 0700000000', 30, y);
  y -= 12;
  text(page, 'Statement Period: 01 Jan 2026 - 05 Jan 2026', 30, y);
  y -= 24;
  text(page, 'SUMMARY', 30, y, bold);
  y -= 14;
  text(page, 'TRANSACTION TYPE', 30, y, bold);
  text(page, 'PAID IN', 250, y, bold);
  text(page, 'PAID OUT', 350, y, bold);
  for (const [name, a, b] of [
    ['SEND MONEY', '0.00', '813.00'],
    ['RECEIVED MONEY', '7,000.00', '0.00'],
    ['TOTAL:', '10,000.00', '6,173.00'],
  ]) {
    y -= 12;
    text(page, name, 30, y);
    text(page, a, 250, y);
    text(page, b, 350, y);
  }
  y -= 26;
  text(page, 'DETAILED STATEMENT', 30, y, bold);
  y -= 16;
  header(page, y);
  y -= 16;

  ROWS.forEach((row, i) => {
    if (i === 7) {
      text(page, 'Disclaimer: This record is produced for your personal use and is not transferable.', 30, 40, font, 6);
      text(page, 'Page 1 of 2', 280, 26, font, 7);
      page = newPage();
      y = 750;
      header(page, y);
      y -= 16;
    }
    const [receipt, time, details, status, paidIn, withdrawn, balance] = row;
    text(page, receipt, COLS.receipt, y);
    text(page, time, COLS.time, y);
    details.forEach((d, k) => text(page, d, COLS.details, y - k * 10));
    text(page, status, COLS.status, y);
    if (paidIn) text(page, paidIn, COLS.paidIn, y);
    if (withdrawn) text(page, withdrawn, COLS.withdrawn, y);
    text(page, balance, COLS.balance, y);
    y -= 10 * details.length + 8;
  });
  text(page, 'Disclaimer: This record is produced for your personal use and is not transferable.', 30, 40, font, 6);
  text(page, 'Page 2 of 2', 280, 26, font, 7);
  return pdf.save();
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const out = new URL('./mpesa-ke-sample.pdf', import.meta.url);
  await writeFile(out, await buildFixture());
  console.log('wrote', fileURLToPath(out));
}
