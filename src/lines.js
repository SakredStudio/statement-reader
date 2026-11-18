// Groups positioned text items into visual lines.
// An item is { str, x, y, page } with y measured from the TOP of the page.

const Y_TOLERANCE = 3;

export function groupLines(items) {
  const clean = items
    .filter((it) => it && typeof it.str === 'string' && it.str.trim() !== '')
    .map((it) => ({ str: it.str.trim(), x: it.x, y: it.y, page: it.page || 1 }))
    .sort((a, b) => a.page - b.page || a.y - b.y || a.x - b.x);

  const lines = [];
  let current = null;
  for (const it of clean) {
    if (!current || current.page !== it.page || Math.abs(it.y - current.y) > Y_TOLERANCE) {
      current = { page: it.page, y: it.y, items: [] };
      lines.push(current);
    }
    current.items.push(it);
  }
  for (const line of lines) {
    line.items.sort((a, b) => a.x - b.x);
    line.text = line.items.map((it) => it.str).join(' ').replace(/\s+/g, ' ').trim();
  }
  return lines;
}
