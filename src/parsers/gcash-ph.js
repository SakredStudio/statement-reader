// GCash (Philippines) "Transaction History" PDF.
// Table columns: Date and Time | Description | Reference No. | Debit | Credit | Balance
// Rows run oldest first. The table is framed by STARTING BALANCE / ENDING BALANCE lines and
// closed by Total Debit / Total Credit lines.

import { checkBalances, round2 } from '../balance.js';

export const id = 'gcash-ph';
export const label = 'GCash (Philippines)';
export const currency = 'PHP';

const MONEY = /^-?(?:\d{1,3}(?:,\d{3})+|\d+)\.\d{2}$/;
// The time can wrap under the date, so it is optional on the row's first line.
const ROW_START = /^(\d{4}-\d{2}-\d{2})(?:\s+(\d{1,2}:\d{2})\s*([AP]M))?\b/i;
const TIME_ONLY = /^(\d{1,2}:\d{2})\s*([AP]M)\b\s*(.*)$/i;
const NOISE = [/^page\s+\d+/i, /date and time/i, /^gcash transaction history/i, /^this is a system[- ]generated/i];

export function detect(lines) {
  const head = lines.slice(0, 60).map((l) => l.text).join('\n');
  return /gcash/i.test(head) && /date and time/i.test(head) && /reference\s*no/i.test(head);
}

const toNumber = (s) => Number(s.replace(/,/g, ''));

function to24h(hm, ampm) {
  let [h, m] = hm.split(':').map(Number);
  const pm = /p/i.test(ampm);
  if (h === 12) h = pm ? 12 : 0;
  else if (pm) h += 12;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00`;
}

function findColumns(line) {
  const cols = {};
  for (const it of line.items) {
    const t = it.str.toLowerCase();
    if (t.startsWith('date')) cols.date = it.x;
    else if (t.startsWith('description')) cols.description = it.x;
    else if (t.startsWith('reference')) cols.reference = it.x;
    else if (t.startsWith('debit')) cols.debit = it.x;
    else if (t.startsWith('credit')) cols.credit = it.x;
    else if (t.startsWith('balance')) cols.balance = it.x;
  }
  return cols;
}

const RULES = [
  [/^refund\b/i, 'refund'],
  [/^received gcash from\b/i, 'received_money'],
  [/^cash[- ]?in\b/i, 'cash_in'],
  [/^cash[- ]?out\b/i, 'agent_withdrawal'],
  [/^buy load\b|\bload\b/i, 'airtime'],
  [/^bills? payment\b/i, 'paybill'],
  [/^payment to\b/i, 'payment'],
  [/fee\b|charge/i, 'charge'],
];

// "Transfer from A to B": money out if it was a debit, money in if a credit.
export function classify(details, isDebit) {
  if (/^transfer from\b/i.test(details)) return isDebit ? 'send_money' : 'received_money';
  for (const [re, type] of RULES) if (re.test(details)) return type;
  return 'other';
}

export function counterparty(details, isDebit) {
  let m = details.match(/^transfer from\s+(.+?)\s+to\s+(.+)$/i);
  if (m) return (isDebit ? m[2] : m[1]).trim();
  m = details.match(/\b(?:to|from)\s+(.+)$/i);
  return m ? m[1].trim() : '';
}

function readRow(line, cols) {
  // Money cells sit at or right of the Debit column; everything left of it is text.
  const edge = cols.debit != null ? cols.debit - 25 : Infinity;
  const money = line.items.filter((it) => it.x >= edge && MONEY.test(it.str.replace(/\s/g, '')));
  if (money.length === 0) return null;
  const balance = toNumber(money[money.length - 1].str);
  let debit = 0;
  let credit = 0;
  const others = money.slice(0, -1);
  if (others.length >= 2) {
    debit = Math.abs(toNumber(others[0].str));
    credit = Math.abs(toNumber(others[1].str));
  } else if (others.length === 1) {
    const it = others[0];
    const isCredit =
      cols.credit != null && cols.debit != null && Math.abs(it.x - cols.credit) < Math.abs(it.x - cols.debit);
    if (isCredit) credit = Math.abs(toNumber(it.str));
    else debit = Math.abs(toNumber(it.str));
  }

  const text = line.items.filter((it) => !money.includes(it));
  const refEdge = cols.reference != null ? cols.reference - 6 : Infinity;
  const refItem = text.find((it) => it.x >= refEdge && /^\d{8,}$/.test(it.str)) || text.findLast((it) => /^\d{10,}$/.test(it.str));
  const rest = text.filter((it) => it !== refItem).map((it) => it.str).join(' ');
  const details = rest.replace(ROW_START, '').trim();
  return { reference: refItem ? refItem.str : '', details, debit, credit, balance };
}

function isContinuation(line, cols) {
  if (NOISE.some((re) => re.test(line.text))) return false;
  if (cols.description == null || cols.reference == null) return false;
  return line.items.every((it) => it.x >= cols.description - 6 && it.x < cols.reference - 2);
}

export function parse(lines) {
  const meta = { source: id, currency };
  const transactions = [];
  const warnings = [];
  let cols = {};
  let inTable = false;
  let current = null;

  for (const line of lines) {
    const t = line.text;
    let m;
    if (/date and time/i.test(t) && /reference\s*no/i.test(t)) {
      cols = { ...cols, ...findColumns(line) };
      inTable = true;
      current = null;
      continue;
    }
    if ((m = t.match(/starting balance\D*(-?[\d,]+\.\d{2})/i))) { meta.openingBalance = toNumber(m[1]); current = null; continue; }
    if ((m = t.match(/ending balance\D*(-?[\d,]+\.\d{2})/i))) { meta.closingBalance = toNumber(m[1]); current = null; continue; }
    if ((m = t.match(/total debit\D*(-?[\d,]+\.\d{2})/i))) { meta.totalDebit = toNumber(m[1]); current = null; continue; }
    if ((m = t.match(/total credit\D*(-?[\d,]+\.\d{2})/i))) { meta.totalCredit = toNumber(m[1]); current = null; continue; }
    if (!inTable) continue;

    const start = t.match(ROW_START);
    if (start) {
      const row = readRow(line, cols);
      if (!row) {
        warnings.push(`Could not read amounts on the row dated ${start[1]} ${start[2] || ''}.`.replace(/\s+\./, '.'));
        current = null;
        continue;
      }
      current = {
        receipt: row.reference,
        date: start[1],
        time: start[2] ? to24h(start[2], start[3]) : '',
        details: row.details,
        status: '',
        paidIn: row.credit,
        withdrawn: row.debit,
        balance: row.balance,
      };
      transactions.push(current);
    } else if (current && !current.time && TIME_ONLY.test(t)) {
      m = t.match(TIME_ONLY);
      current.time = to24h(m[1], m[2]);
      if (m[3]) current.details = `${current.details} ${m[3]}`.trim();
    } else if (current && isContinuation(line, cols)) {
      current.details = `${current.details} ${t}`.trim();
    } else if (!NOISE.some((re) => re.test(t))) {
      current = null; // unknown text ends the row; never glue it onto details
    }
  }

  for (const tx of transactions) {
    const isDebit = tx.withdrawn > 0;
    tx.type = classify(tx.details, isDebit);
    tx.counterparty = counterparty(tx.details, isDebit);
    tx.isCharge = tx.type === 'charge';
    tx.amount = round2(tx.paidIn - tx.withdrawn);
  }

  const check = checkBalances(transactions);
  if (check.mismatches > 0) {
    warnings.push(
      `${check.mismatches} of ${check.checked} running-balance checks did not add up. GCash statements sometimes list a row whose balance does not move; check those rows before relying on the totals.`
    );
  }

  // The statement prints its own totals; compare them with what was read.
  const sum = (key) => round2(transactions.reduce((n, t) => n + t[key], 0));
  const totals = [];
  if (meta.totalDebit != null) totals.push(['Total Debit', meta.totalDebit, sum('withdrawn')]);
  if (meta.totalCredit != null) totals.push(['Total Credit', meta.totalCredit, sum('paidIn')]);
  for (const [name, printed, read] of totals) {
    if (round2(printed) !== read) {
      warnings.push(`${name} on the statement is ${printed.toFixed(2)} but the rows read add up to ${read.toFixed(2)}. Rows may be missing or misread.`);
    }
  }
  const totalsCheck = { checked: totals.length, mismatches: totals.filter(([, p, r]) => round2(p) !== r).length };
  if (transactions.length && meta.closingBalance != null) {
    const newest = check.order === 'newest-first' ? transactions[0] : transactions[transactions.length - 1];
    if (round2(newest.balance) !== round2(meta.closingBalance)) {
      warnings.push(`Ending balance on the statement is ${meta.closingBalance.toFixed(2)} but the last row read shows ${newest.balance.toFixed(2)}.`);
    }
  }
  return { meta, transactions, warnings, balanceCheck: check, totalsCheck };
}
