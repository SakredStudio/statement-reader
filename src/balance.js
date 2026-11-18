// Shared running-balance check.
// Every row's balance should equal the neighbouring (older) row's balance plus its own amount.

export const round2 = (n) => Math.round(n * 100) / 100;

export function checkBalances(transactions) {
  const done = transactions.filter((t) => !t.status || /completed/i.test(t.status));
  if (done.length < 2) return { checked: 0, mismatches: 0, order: 'unknown' };
  const first = `${done[0].date} ${done[0].time}`;
  const last = `${done[done.length - 1].date} ${done[done.length - 1].time}`;
  const newestFirst = first > last;
  let asListed = 0;
  let reversed = 0;
  for (let i = 0; i < done.length - 1; i++) {
    const a = done[i];
    const b = done[i + 1];
    if (round2(b.balance + a.amount) !== round2(a.balance)) asListed++; // a is newer than b
    if (round2(a.balance + b.amount) !== round2(b.balance)) reversed++; // b is newer than a
  }
  const mismatches = first === last ? Math.min(asListed, reversed) : newestFirst ? asListed : reversed;
  return { checked: done.length - 1, mismatches, order: newestFirst ? 'newest-first' : 'oldest-first' };
}
