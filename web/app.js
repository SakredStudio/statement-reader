import * as pdfjs from './vendor/pdf.min.mjs';
import { parsePdf, toCsv, UnknownStatementError } from '../src/index.js';

pdfjs.GlobalWorkerOptions.workerSrc = new URL('./vendor/pdf.worker.min.mjs', import.meta.url).href;

const $ = (id) => document.getElementById(id);

// Statement Reader Pro, the paid plan for accountants. The "For accountants" card stays hidden while this is empty;
// set it to the Pro page's https address to show it.
const PRO_URL = 'https://statements.sakredstudio.ca/';
if (/^https:\/\/[^\s"'<>]+$/.test(PRO_URL)) {
  $('pro-link').href = PRO_URL;
  $('pro').hidden = false;
}
const money = new Intl.NumberFormat('en', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const TYPE_LABELS = {
  send_money: 'Send money', received_money: 'Received', paybill: 'Pay bill', buy_goods: 'Buy goods',
  agent_withdrawal: 'Agent withdrawal', agent_deposit: 'Agent deposit', airtime: 'Airtime',
  overdraft: 'Overdraft', savings_loan: 'Savings / loan', reversal: 'Reversal', charge: 'Charge', other: 'Other',
  payment: 'Payment', refund: 'Refund', cash_in: 'Cash in',
};

let pending = null; // { bytes, name } waiting for a password
let lastCsv = null;
let lastName = 'statement';

function note(kind, text) {
  const p = document.createElement('p');
  p.className = `note ${kind}`;
  p.textContent = text;
  $('notes').append(p);
}

function reset() {
  $('notes').replaceChildren();
  $('result').hidden = true;
  $('pw').hidden = true;
  lastCsv = null;
}

async function open(bytes, name, password) {
  reset();
  try {
    // pdf.js takes ownership of the buffer, so hand it a copy and keep ours for a password retry.
    // A damaged file can leave the PDF reader waiting forever; say so instead of showing nothing.
    const result = await Promise.race([
      parsePdf(pdfjs, bytes.slice(), { password }),
      new Promise((_, reject) => setTimeout(() => reject(Object.assign(new Error('timeout'), { name: 'ReadTimeout' })), 30000)),
    ]);
    pending = null;
    show(result, name);
  } catch (err) {
    if (err?.name === 'PasswordException') {
      pending = { bytes, name };
      $('pw').hidden = false;
      $('password').value = '';
      $('password').focus();
      if (password !== undefined) note('warn', 'That password did not open the file. Try again.');
    } else if (err instanceof UnknownStatementError) {
      note('warn', 'This does not look like an M-Pesa or GCash statement. Other wallets are not supported yet.');
    } else if (err?.name === 'ReadTimeout') {
      note('warn', 'Reading this file took too long and was stopped. Reload the page and try again; the file may be damaged.');
    } else {
      note('warn', 'This file could not be read as a PDF.');
      console.error(err);
    }
  }
}

function tile(label, value) {
  const div = document.createElement('div');
  div.className = 'tile';
  const small = document.createElement('small');
  small.textContent = label;
  const b = document.createElement('b');
  b.textContent = value;
  div.append(small, b);
  return div;
}

function show(result, name) {
  const txs = result.transactions;
  if (txs.length === 0) {
    if (result.warnings.length) for (const w of result.warnings) note('warn', w);
    else note('warn', 'The statement opened, but no transaction rows were found.');
    return;
  }
  const done = txs.filter((t) => !t.status || /completed/i.test(t.status));
  const sum = (key, filter = () => true) => done.filter(filter).reduce((n, t) => n + t[key], 0);

  $('summary').replaceChildren(
    tile('Rows', String(txs.length)),
    tile('Paid in', money.format(sum('paidIn'))),
    tile('Withdrawn', money.format(sum('withdrawn'))),
    tile('Charges', money.format(sum('withdrawn', (t) => t.isCharge))),
    tile('Period', `${txs.reduce((a, t) => (t.date < a ? t.date : a), txs[0].date)} to ${txs.reduce((a, t) => (t.date > a ? t.date : a), txs[0].date)}`),
  );

  const check = result.balanceCheck;
  if (check.checked > 0 && check.mismatches === 0) {
    note('ok', `Balance check passed: all ${check.checked} row-to-row balances add up.`);
  }
  const totals = result.totalsCheck;
  if (totals && totals.checked > 0 && totals.mismatches === 0) {
    note('ok', "Totals check passed: the rows add up to the statement's own Total Debit and Total Credit.");
  }
  for (const w of result.warnings) note('warn', w);

  const rows = txs.map((t) => {
    const tr = document.createElement('tr');
    const cells = [
      [t.date], [t.time], [t.receipt], [TYPE_LABELS[t.type] || t.type], [t.details, 'details'], [t.status],
      [t.paidIn ? money.format(t.paidIn) : '', 'num'], [t.withdrawn ? money.format(t.withdrawn) : '', 'num'],
      [money.format(t.balance), 'num'],
    ];
    for (const [text, cls] of cells) {
      const td = document.createElement('td');
      td.textContent = text;
      if (cls) td.className = cls;
      tr.append(td);
    }
    return tr;
  });
  $('rows').replaceChildren(...rows);
  $('count').textContent = `${txs.length} rows from ${result.label}, amounts in ${result.currency}`;
  lastCsv = toCsv(txs);
  lastName = name.replace(/\.pdf$/i, '') || 'statement';
  $('result').hidden = false;
}

async function take(file) {
  if (!file) return;
  open(new Uint8Array(await file.arrayBuffer()), file.name);
}

$('file').addEventListener('change', (e) => take(e.target.files[0]));
const drop = $('drop');
for (const ev of ['dragenter', 'dragover']) {
  drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add('over'); });
}
for (const ev of ['dragleave', 'drop']) {
  drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.remove('over'); });
}
drop.addEventListener('drop', (e) => take(e.dataTransfer.files[0]));

$('pw').addEventListener('submit', (e) => {
  e.preventDefault();
  if (pending) open(pending.bytes, pending.name, $('password').value);
});

$('download').addEventListener('click', () => {
  if (!lastCsv) return;
  const url = URL.createObjectURL(new Blob(['﻿', lastCsv], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = `${lastName}.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});

// Made-up sample statements. Locally they come from the test fixtures; the hosted build sets data-samples.
const SAMPLE_BASE = document.documentElement.dataset.samples || '../test/fixtures/';
async function loadSample(file) {
  reset();
  try {
    const res = await fetch(SAMPLE_BASE + file);
    if (!res.ok) throw new Error(String(res.status));
    open(new Uint8Array(await res.arrayBuffer()), file);
  } catch {
    note('warn', 'The sample could not be loaded.');
  }
}
for (const btn of document.querySelectorAll('[data-sample]')) {
  btn.addEventListener('click', () => loadSample(btn.dataset.sample));
}

// Local preview only: ?sample=1 loads the M-Pesa sample, ?sample=gcash the GCash one,
// ?sample=locked the password-locked copy (password 000000).
if (['localhost', '127.0.0.1'].includes(location.hostname) && new URLSearchParams(location.search).has('sample')) {
  const which = new URLSearchParams(location.search).get('sample');
  loadSample({ locked: 'mpesa-ke-sample-locked.pdf', gcash: 'gcash-ph-sample.pdf' }[which] || 'mpesa-ke-sample.pdf');
}
