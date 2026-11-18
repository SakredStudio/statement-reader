# Statement Reader

Turns mobile-money statement PDFs into clean rows you can open in Excel or import into accounting software. The file is read in your browser; nothing is uploaded.

| Wallet | Statement | Status |
| --- | --- | --- |
| M-Pesa (Kenya) | Personal full statement, e-mailed or from the app | Early: tested on made-up files only |
| GCash (Philippines) | Transaction history | Early: tested on made-up files only |

## Please read: this is early

Both layouts were built from what public open-source parsers expect and are tested against **made-up** PDFs that copy those layouts. Neither has been confirmed against a large set of real statements yet. That is why the tool checks its own work (below) and tells you when something does not add up. Always compare the result with your statement before relying on it.

If a statement reads wrongly or is refused, [open an issue](https://github.com/SakredStudio/statement-reader/issues/new/choose). **Never attach or paste a real statement.** Describe the problem in words.

## What it does

- Reads every transaction row, including details that wrap onto a second line and tables that continue across pages.
- Sorts each row into a type (send money, received, payment, pay bill, agent withdrawal or deposit, airtime, refund, charge, and so on) and pulls out the other party.
- **Checks the running balance.** Each row's balance must equal the neighbouring row's balance plus its own amount. The page says how many checks failed instead of handing over a wrong spreadsheet.
- **Checks printed totals (GCash).** The rows read are compared with the statement's own Total Debit, Total Credit and ending balance.
- Opens password-locked PDFs after asking for the password. The password stays on your device.
- Refuses files it does not recognise, and M-Pesa business (till / pay bill) statements, instead of guessing.
- CSV export guards against spreadsheet formula injection.

## Known limits

- M-Pesa business statements are not supported.
- GCash statements sometimes list a row whose balance does not move. That shows up as a balance warning even when the row was read correctly.
- Locked files are tested with one lock type (AES-256) on a made-up file. Real statements may use another.
- Scanned or photographed statements (images, not text) cannot be read.

## Privacy

- The PDF is opened by [pdf.js](https://mozilla.github.io/pdf.js/) inside your browser. No part of it is sent anywhere.
- The page loads no code from other sites, has no analytics and stores nothing.

## Run it yourself

```
npm install
npm test          # 19 tests
npm run vendor    # copies pdf.js into web/vendor
npm run fixture   # writes the made-up sample PDFs
npm run dev       # http://localhost:8811
npm run build     # hosted copy in dist/
```

As a library:

```js
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import { parsePdf, toCsv } from './src/index.js';

const { parser, transactions, warnings, balanceCheck } = await parsePdf(pdfjs, bytes, { password });
const csv = toCsv(transactions);
```

## Adding a wallet

Add a file in `src/parsers/` that exports `id`, `label`, `currency`, `detect(lines)` and `parse(lines)`, list it in `src/index.js`, and add a made-up fixture plus tests. The repository ignores every `.pdf` on purpose: sample files are generated, and a real statement must never be committed.

## Not affiliated

This project is not affiliated with Safaricom, M-Pesa or GCash. Their names are used only to say which statements the tool reads.

## Licence

MIT. Copyright 17899181 CANADA INC. (Sakred Studio).
