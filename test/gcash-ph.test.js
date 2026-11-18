import test from 'node:test';
import assert from 'node:assert/strict';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import { parsePdf, parseItems } from '../src/index.js';
import { classify, counterparty } from '../src/parsers/gcash-ph.js';
import { buildFixture, ROWS } from './fixtures/make-gcash-fixture.mjs';
import { buildFixture as buildMpesa } from './fixtures/make-mpesa-fixture.mjs';

const num = (s) => (s ? Number(s.replace(/,/g, '')) : 0);
const HOUR24 = { '08:12 AM': '08:12:00', '12:40 PM': '12:40:00', '07:55 PM': '19:55:00', '12:05 AM': '00:05:00' };

test('reads every row of the made-up GCash statement PDF', async () => {
  const result = await parsePdf(pdfjs, await buildFixture());
  assert.equal(result.parser, 'gcash-ph');
  assert.equal(result.transactions.length, ROWS.length);
  result.transactions.forEach((tx, i) => {
    const [when, description, reference, debit, credit, balance] = ROWS[i];
    assert.equal(tx.date, when.slice(0, 10));
    const clock = when.slice(11);
    if (HOUR24[clock]) assert.equal(tx.time, HOUR24[clock]);
    assert.equal(tx.details, description.join(' '));
    assert.equal(tx.receipt, reference);
    assert.equal(tx.withdrawn, num(debit));
    assert.equal(tx.paidIn, num(credit));
    assert.equal(tx.balance, num(balance));
  });
});

test('balances, printed totals and ending balance all agree', async () => {
  const result = await parsePdf(pdfjs, await buildFixture());
  assert.deepEqual(result.balanceCheck, { checked: ROWS.length - 1, mismatches: 0, order: 'oldest-first' });
  assert.deepEqual(result.totalsCheck, { checked: 2, mismatches: 0 });
  assert.deepEqual(result.warnings, []);
  assert.equal(result.meta.openingBalance, 1250);
  assert.equal(result.meta.closingBalance, 5016.75);
  assert.ok(result.transactions.every((t) => !/page \d|balance|total/i.test(t.details)));
});

test('each wallet is recognised as itself', async () => {
  assert.equal((await parsePdf(pdfjs, await buildMpesa())).parser, 'mpesa-ke');
  assert.equal((await parsePdf(pdfjs, await buildFixture())).parser, 'gcash-ph');
});

const HEADER = [['Date and Time', 30], ['Description', 135], ['Reference No.', 345], ['Debit', 440], ['Credit', 495], ['Balance', 545]];
const at = (cells, y) => cells.map(([str, x]) => ({ str, x, y, page: 1 }));
const sheet = (rows, tail = []) => [
  { str: 'GCash Transaction History', x: 30, y: 50, page: 1 },
  ...at(HEADER, 100),
  ...rows.flatMap((cells, i) => at(cells, 120 + i * 14)),
  ...tail.flatMap((cells, i) => at(cells, 400 + i * 14)),
];

test('a missing row is caught by the printed totals', () => {
  const { warnings, totalsCheck } = parseItems(sheet(
    [
      [['2026-03-01 08:00 AM', 30], ['Payment to Demo Rides', 135], ['9000000000001', 345], ['100.00', 440], ['900.00', 545]],
    ],
    [[['Total Debit', 345], ['350.00', 545]], [['Total Credit', 345], ['0.00', 545]]],
  ));
  assert.equal(totalsCheck.mismatches, 1);
  assert.ok(warnings.some((w) => /Total Debit/.test(w)));
});

test('split date and time items, wrapped time, and right-shifted amounts still read', () => {
  const { transactions } = parseItems(sheet([
    [['2026-03-01', 30], ['08:00 AM', 80], ['Refund from Demo Rides', 135], ['9000000000001', 345], ['75.00', 505], ['1,075.00', 540]],
    [['2026-03-02', 30], ['Transfer from 09000000001 to', 135], ['9000000000002', 345], ['500.00', 452], ['575.00', 548]],
    [['11:30 PM', 30], ['09000000002', 135]],
  ]));
  assert.deepEqual(transactions.map((t) => [t.time, t.paidIn, t.withdrawn, t.balance]), [
    ['08:00:00', 75, 0, 1075], ['23:30:00', 0, 500, 575],
  ]);
  assert.equal(transactions[1].details, 'Transfer from 09000000001 to 09000000002');
  assert.equal(transactions[1].type, 'send_money');
  assert.equal(transactions[1].counterparty, '09000000002');
});

test('types and counterparties', () => {
  assert.equal(classify('Payment to Demo Rides', true), 'payment');
  assert.equal(classify('Refund from Demo Rides', false), 'refund');
  assert.equal(classify('Received GCash from Sample Bank with account ending in 0000', false), 'received_money');
  assert.equal(classify('Transfer from 09000000003 to 09000000001', false), 'received_money');
  assert.equal(classify('Buy Load for 09000000001', true), 'airtime');
  assert.equal(classify('Bills Payment to Sample Electric Company', true), 'paybill');
  assert.equal(counterparty('Transfer from 09000000003 to 09000000001', false), '09000000003');
  assert.equal(counterparty('Payment to Demo Rides', true), 'Demo Rides');
});
