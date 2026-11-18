const COLUMNS = [
  ['date', 'Date'],
  ['time', 'Time'],
  ['receipt', 'Receipt'],
  ['type', 'Type'],
  ['counterparty', 'Counterparty'],
  ['details', 'Details'],
  ['status', 'Status'],
  ['paidIn', 'Paid in'],
  ['withdrawn', 'Withdrawn'],
  ['balance', 'Balance'],
  ['isCharge', 'Is charge'],
];

function cell(value) {
  if (typeof value === 'number') return value.toFixed(2);
  if (typeof value === 'boolean') return value ? 'yes' : 'no';
  let s = String(value ?? '');
  // Stop spreadsheet apps from running statement text as a formula.
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(transactions) {
  const rows = [COLUMNS.map(([, title]) => title).join(',')];
  for (const tx of transactions) rows.push(COLUMNS.map(([key]) => cell(tx[key])).join(','));
  return rows.join('\r\n') + '\r\n';
}
