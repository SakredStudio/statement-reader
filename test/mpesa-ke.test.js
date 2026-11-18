import test from 'node:test';
import assert from 'node:assert/strict';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import { parsePdf, parseItems, toCsv, UnknownStatementError } from '../src/index.js';
import { classify, counterparty } from '../src/parsers/mpesa-ke.js';
import { buildFixture, ROWS } from './fixtures/make-mpesa-fixture.mjs';

const num = (s) => (s ? Math.abs(Number(s.replace(/,/g, ''))) : 0);

test('reads every row of the made-up M-Pesa statement PDF', async () => {
  const result = await parsePdf(pdfjs, await buildFixture());
  assert.equal(result.parser, 'mpesa-ke');
  assert.equal(result.transactions.length, ROWS.length);
  assert.equal(result.meta.customerName, 'SAMPLE CUSTOMER');

  result.transactions.forEach((tx, i) => {
    const [receipt, time, details, status, paidIn, withdrawn, balance] = ROWS[i];
    assert.equal(tx.receipt, receipt);
    assert.equal(`${tx.date} ${tx.time}`, time);
    assert.equal(tx.details, details.join(' '));
    assert.equal(tx.status, status);
    assert.equal(tx.paidIn, num(paidIn));
    assert.equal(tx.withdrawn, num(withdrawn));
    assert.equal(tx.balance, num(balance));
  });
});

test('running balance adds up and footer text is not glued onto details', async () => {
  const result = await parsePdf(pdfjs, await buildFixture());
  assert.deepEqual(result.balanceCheck, { checked: ROWS.length - 1, mismatches: 0, order: 'newest-first' });
  assert.deepEqual(result.warnings, []);
  assert.ok(result.transactions.every((t) => !/disclaimer|page \d/i.test(t.details)));
});

test('a misread amount is reported by the balance check', async () => {
  const result = await parsePdf(pdfjs, await buildFixture());
  const txs = result.transactions.map((t) => ({ ...t }));
  txs[4].amount += 10;
  const { checkBalances } = await import('../src/parsers/mpesa-ke.js');
  assert.ok(checkBalances(txs).mismatches > 0);
});

test('types and counterparties', () => {
  assert.equal(classify('Customer Transfer to 0700000002 - JOHN SAMPLE'), 'send_money');
  assert.equal(classify('Customer Transfer of Funds Charge'), 'charge');
  assert.equal(classify('Pay Bill to 000333 - SAMPLE POWER Acc. 12345678'), 'paybill');
  assert.equal(classify('Merchant Payment to 000111 - SAMPLE GROCERS LTD'), 'buy_goods');
  assert.equal(classify('Customer Withdrawal At Agent Till 000222 - Sample Agent Shop'), 'agent_withdrawal');
  assert.equal(classify('Funds received from 0700000001 - JANE EXAMPLE'), 'received_money');
  assert.equal(counterparty('Pay Bill to 000333 - SAMPLE POWER Acc. 12345678'), '000333 - SAMPLE POWER');
  assert.equal(counterparty('Funds received from 0700000001 - JANE EXAMPLE'), '0700000001 - JANE EXAMPLE');
});

test('a positive single amount is placed by column position', () => {
  const header = [
    ['Receipt No.', 30], ['Completion Time', 100], ['Details', 205], ['Transaction Status', 365],
    ['Paid In', 430], ['Withdrawn', 480], ['Balance', 535],
  ].map(([str, x]) => ({ str, x, y: 100, page: 1 }));
  const title = [{ str: 'MPESA FULL STATEMENT', x: 30, y: 50, page: 1 }];
  const row = [
    ['TEST00001Q', 30], ['2026-01-01 08:00:00', 100], ['Airtime Purchase', 205], ['Completed', 365],
    ['100.00', 480], ['400.00', 535],
  ].map(([str, x]) => ({ str, x, y: 120, page: 1 }));
  const { transactions } = parseItems([...title, ...header, ...row]);
  assert.equal(transactions[0].withdrawn, 100);
  assert.equal(transactions[0].paidIn, 0);
});

test('unknown files are refused, not guessed', () => {
  assert.throws(() => parseItems([{ str: 'Some other bank', x: 10, y: 10, page: 1 }]), UnknownStatementError);
});

test('CSV escapes commas, quotes and formula-looking text', () => {
  const csv = toCsv([
    { date: '2026-01-01', time: '08:00:00', receipt: 'A', type: 'other', counterparty: '=cmd()', details: 'a, "b"', status: 'Completed', paidIn: 1, withdrawn: 0, balance: 1, isCharge: false },
  ]);
  const line = csv.split('\r\n')[1];
  assert.ok(line.includes(`'=cmd()`));
  assert.ok(line.includes('"a, ""b"""'));
  assert.ok(line.endsWith('1.00,0.00,1.00,no'));
});

// ---- Variants reported by public M-Pesa parsers (app vs e-mail statements, wrapped cells) ----

const HEADER = [
  ['Receipt No.', 30], ['Completion Time', 100], ['Details', 205], ['Transaction Status', 365],
  ['Paid In', 430], ['Withdrawn', 480], ['Balance', 535],
];
const at = (cells, y) => cells.map(([str, x]) => ({ str, x, y, page: 1 }));
const sheet = (rows, header = HEADER) => [
  { str: 'MPESA FULL STATEMENT', x: 30, y: 50, page: 1 },
  ...at(header, 100),
  ...rows.flatMap((cells, i) => at(cells, 120 + i * 14)),
];

test('app-style statement: no minus signs, still balances', () => {
  const { transactions, balanceCheck } = parseItems(sheet([
    [['TEST00003S', 30], ['2026-01-02 10:00:00', 100], ['Pay Bill Online to 000333 - SAMPLE POWER', 205], ['COMPLETED', 365], ['300.00', 480], ['600.00', 535]],
    [['TEST00002R', 30], ['2026-01-01 19:00:00', 100], ['Airtime Purchase', 205], ['COMPLETED', 365], ['100.00', 480], ['900.00', 535]],
    [['TEST00001Q', 30], ['2026-01-01 08:00:00', 100], ['Funds received from 0700000003 - MARY TESTER', 205], ['COMPLETED', 365], ['1,000.00', 430], ['1,000.00', 535]],
  ]));
  assert.deepEqual(transactions.map((t) => [t.paidIn, t.withdrawn]), [[0, 300], [0, 100], [1000, 0]]);
  assert.equal(transactions[0].type, 'paybill');
  assert.deepEqual(balanceCheck, { checked: 2, mismatches: 0, order: 'newest-first' });
});

test('completion time wrapped under the date is picked up', () => {
  const { transactions } = parseItems(sheet([
    [['TEST00001Q', 30], ['2026-01-01', 100], ['Funds received from 0700000003 -', 205], ['Completed', 365], ['500.00', 430], ['500.00', 535]],
    [['08:00:00', 100], ['MARY TESTER', 205]],
  ]));
  assert.equal(transactions.length, 1);
  assert.equal(transactions[0].time, '08:00:00');
  assert.equal(transactions[0].details, 'Funds received from 0700000003 - MARY TESTER');
  assert.equal(transactions[0].paidIn, 500);
});

test('a dash in an empty money cell is treated as blank', () => {
  const { transactions } = parseItems(sheet([
    [['TEST00002R', 30], ['2026-01-01 19:00:00', 100], ['Airtime Purchase', 205], ['Completed', 365], ['-', 430], ['-100.00', 480], ['400.00', 535]],
    [['TEST00001Q', 30], ['2026-01-01 08:00:00', 100], ['Deposit of Funds at Agent Till 000444 - Demo Agent', 205], ['Completed', 365], ['500.00', 430], ['-', 480], ['500.00', 535]],
  ]));
  assert.deepEqual(transactions.map((t) => [t.status, t.paidIn, t.withdrawn, t.balance]), [
    ['Completed', 0, 100, 400], ['Completed', 500, 0, 500],
  ]);
});

test('business statements are named and refused, not misread', () => {
  const header = [...HEADER, ['Transaction Type', 590], ['Other Party Info', 660]];
  const result = parseItems(sheet([
    [['TEST00001Q', 30], ['2026-01-01 08:00:00', 100], ['Pay Bill from 0700000003', 205], ['Completed', 365], ['500.00', 430], ['500.00', 535], ['Pay Bill', 590], ['MARY TESTER', 660]],
  ], header));
  assert.equal(result.transactions.length, 0);
  assert.match(result.warnings[0], /business/i);
});

test('locked PDF: wrong password is rejected, right one opens it', async (t) => {
  const { readFile } = await import('node:fs/promises');
  let bytes;
  try {
    bytes = new Uint8Array(await readFile(new URL('./fixtures/mpesa-ke-sample-locked.pdf', import.meta.url)));
  } catch {
    t.skip('locked fixture not generated (python test/fixtures/lock-fixture.py)');
    return;
  }
  await assert.rejects(parsePdf(pdfjs, bytes.slice()), { name: 'PasswordException' });
  await assert.rejects(parsePdf(pdfjs, bytes.slice(), { password: 'wrong' }), { name: 'PasswordException' });
  const result = await parsePdf(pdfjs, bytes.slice(), { password: '000000' });
  assert.equal(result.transactions.length, ROWS.length);
  assert.equal(result.balanceCheck.mismatches, 0);
});
