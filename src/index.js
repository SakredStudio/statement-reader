import { groupLines } from './lines.js';
import { toCsv } from './csv.js';
import { readPdfItems } from './pdf-items.js';
import * as mpesaKe from './parsers/mpesa-ke.js';
import * as gcashPh from './parsers/gcash-ph.js';

export const parsers = [mpesaKe, gcashPh];

export class UnknownStatementError extends Error {
  constructor() {
    super('This file does not match any statement layout the reader knows yet.');
    this.name = 'UnknownStatementError';
  }
}

// items: [{ str, x, y, page }] with y measured from the top of the page.
export function parseItems(items) {
  const lines = groupLines(items);
  const parser = parsers.find((p) => p.detect(lines));
  if (!parser) throw new UnknownStatementError();
  return { parser: parser.id, label: parser.label, currency: parser.currency, ...parser.parse(lines) };
}

export async function parsePdf(pdfjs, data, options) {
  return parseItems(await readPdfItems(pdfjs, data, options));
}

export { groupLines, toCsv, readPdfItems };
