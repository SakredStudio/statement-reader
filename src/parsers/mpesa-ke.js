// M-Pesa (Safaricom, Kenya) personal "full statement" PDF.
// Table columns: Receipt No. | Completion Time | Details | Transaction Status | Paid In | Withdrawn | Balance

export const id = 'mpesa-ke';
export const label = 'M-Pesa (Kenya)';
export const currency = 'KES';

import { checkBalances, round2 } from '../balance.js';
export { checkBalances };

const AMOUNT = /-?\d{1,3}(?:,\d{3})*\.\d{2}|-?\d+\.\d{2}/g;
// The time can wrap under the date in a narrow column, so it is optional on the row's first line.
const ROW_START = /^([A-Z0-9]{10})\s+(\d{4}-\d{2}-\d{2})(?:\s+(\d{2}:\d{2}:\d{2}))?\s+(.*)$/;
const TIME_ONLY = /^(\d{2}:\d{2}:\d{2})\b\s*(.*)$/;
// Business (till / pay bill) statements add these columns; the personal parser must not guess at them.
const BUSINESS_HEADER = /other\s*party|transaction\s*type|linked\s*transaction/i;
const STATUS = /\b(Completed|Failed|Cancelled|Declined|Expired|Pending|Reversed)\s*$/i;
const NOISE = [
  /^page\s+\d+/i,
  /disclaimer/i,
  /receipt\s*no/i,
  /^transaction\s+status$/i,
  /^status$/i,
  /safaricom\.co\.ke|twitter|facebook/i,
  /^for self[- ]help/i,
  /statement verification code/i,
];

export function detect(lines) {
  const head = lines.slice(0, 80).map((l) => l.text).join('\n');
  return /m-?pesa/i.test(head) && /receipt\s*no/i.test(head) && /completion\s*time/i.test(head);
}

const toNumber = (s) => Number(s.replace(/,/g, ''));

function findColumns(headerLine) {
  const cols = {};
  for (const it of headerLine.items) {
    const t = it.str.toLowerCase();
    if (t.startsWith('details')) cols.details = it.x;
    else if (t.startsWith('transaction') || t === 'status') cols.status = cols.status ?? it.x;
    else if (t.startsWith('paid')) cols.paidIn = it.x;
    else if (t.startsWith('withdraw')) cols.withdrawn = it.x;
    else if (t.startsWith('balance')) cols.balance = it.x;
  }
  return cols;
}

const RULES = [
  [/charge/i, 'charge'],
  [/^customer transfer(?: fuliza m-?pesa)? to\b/i, 'send_money'],
  [/^funds received from\b/i, 'received_money'],
  [/^(?:business|salary|promotion) payment from\b/i, 'received_money'],
  [/^pay bill(?: online| fuliza m-?pesa)?(?: to)?\b/i, 'paybill'],
  [/^merchant payment(?: online| fuliza m-?pesa)?(?: to)?\b/i, 'buy_goods'],
  [/^customer withdrawal/i, 'agent_withdrawal'],
  [/^deposit of funds/i, 'agent_deposit'],
  [/airtime|bundle/i, 'airtime'],
  [/overdraft|fuliza|od loan/i, 'overdraft'],
  [/m-?shwari|kcb m-?pesa/i, 'savings_loan'],
  [/reversal/i, 'reversal'],
];

export function classify(details) {
  for (const [re, type] of RULES) if (re.test(details)) return type;
  return 'other';
}

export function counterparty(details) {
  const m = details.match(/\b(?:to|from|at agent till)\s+(?:-\s*)?(.+?)(?:\s+acc\.\s*.*)?$/i);
  return m ? m[1].replace(/^-\s*/, '').trim() : '';
}

function splitRow(line, rest, cols) {
  // Trailing money values: [paid in] [withdrawn] balance.
  const matches = [...rest.matchAll(AMOUNT)];
  const tail = [];
  let cut = rest.length;
  for (let i = matches.length - 1; i >= 0 && tail.length < 3; i--) {
    const m = matches[i];
    // A lone dash is how some statements print an empty money cell.
    if (rest.slice(m.index + m[0].length, cut).replace(/-/g, '').trim() !== '') break;
    tail.unshift(m[0]);
    cut = m.index;
  }
  if (tail.length === 0) return null;

  let body = rest.slice(0, cut).replace(/(?:\s+-)+\s*$/, '').trim();
  let status = '';
  const sm = body.match(STATUS);
  if (sm) {
    status = sm[1];
    body = body.slice(0, sm.index).trim();
  }

  const balance = toNumber(tail[tail.length - 1]);
  let paidIn = 0;
  let withdrawn = 0;
  const others = tail.slice(0, -1);
  if (others.length === 2) {
    paidIn = Math.abs(toNumber(others[0]));
    withdrawn = Math.abs(toNumber(others[1]));
  } else if (others.length === 1) {
    const value = toNumber(others[0]);
    let isWithdrawal = value < 0;
    if (!isWithdrawal && cols.paidIn != null && cols.withdrawn != null) {
      // Positive single amount: decide by which column it sits under.
      // The amount just left of the balance, not the balance itself (they can be equal).
      const money = line.items.filter((it) => /^-?[\d,]+\.\d{2}$/.test(it.str.replace(/\s/g, '')));
      const item = money.length >= 2 ? money[money.length - 2] : null;
      if (item) isWithdrawal = Math.abs(item.x - cols.withdrawn) < Math.abs(item.x - cols.paidIn);
    }
    if (isWithdrawal) withdrawn = Math.abs(value);
    else paidIn = value;
  }
  return { details: body, status, paidIn, withdrawn, balance };
}

function isContinuation(line, cols) {
  if (NOISE.some((re) => re.test(line.text))) return false;
  if (cols.details == null || cols.status == null) return false;
  return line.items.every((it) => it.x >= cols.details - 6 && it.x < cols.status - 2);
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
    if (!inTable) {
      let m;
      if ((m = t.match(/customer name:?\s*(.+)$/i))) meta.customerName = m[1].trim();
      if ((m = t.match(/statement period:?\s*(.+)$/i))) meta.period = m[1].trim();
    }
    if (/receipt\s*no/i.test(t) && /completion\s*time/i.test(t)) {
      if (BUSINESS_HEADER.test(t)) {
        return {
          meta: { ...meta, variant: 'business' },
          transactions: [],
          warnings: ['This is an M-Pesa business (till or pay bill) statement. Only personal statements are supported so far.'],
          balanceCheck: { checked: 0, mismatches: 0, order: 'unknown' },
        };
      }
      cols = { ...cols, ...findColumns(line) };
      inTable = true;
      current = null;
      continue;
    }
    if (!inTable) continue;

    const start = t.match(ROW_START);
    if (start) {
      const row = splitRow(line, start[4], cols);
      if (!row) {
        warnings.push(`Could not read amounts on row ${start[1]} (${start[2]} ${start[3]}).`);
        current = null;
        continue;
      }
      current = {
        receipt: start[1],
        date: start[2],
        time: start[3] || '',
        ...row,
      };
      transactions.push(current);
    } else if (current && !current.time && TIME_ONLY.test(t)) {
      // Wrapped completion time, possibly followed by wrapped details on the same line.
      const m = t.match(TIME_ONLY);
      current.time = m[1];
      if (m[2]) current.details = `${current.details} ${m[2]}`.trim();
    } else if (current && isContinuation(line, cols)) {
      current.details = `${current.details} ${t}`.trim();
    } else if (!NOISE.some((re) => re.test(t))) {
      current = null; // unknown text ends the row; never glue it onto details
    }
  }

  for (const tx of transactions) {
    tx.type = classify(tx.details);
    tx.counterparty = counterparty(tx.details);
    tx.isCharge = tx.type === 'charge';
    tx.amount = round2(tx.paidIn - tx.withdrawn);
  }

  const check = checkBalances(transactions);
  if (check.mismatches > 0) {
    warnings.push(
      `${check.mismatches} of ${check.checked} running-balance checks did not add up. Rows may be missing or misread.`
    );
  }
  return { meta, transactions, warnings, balanceCheck: check };
}
