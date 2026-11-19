import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { build } from '../dev/build.mjs';

const read = (p) => readFile(new URL(`../${p}`, import.meta.url), 'utf8');

test('the "For accountants" Pro card is hidden until PRO_URL is set, and then only for an https address', async () => {
  const html = await read('web/index.html');
  const app = await read('web/app.js');
  const card = html.match(/<aside[^>]*\sid="pro"[^>]*>/);
  assert.ok(card, 'web/index.html has the Pro card');
  assert.match(card[0], /\shidden[\s>]/, 'the card starts hidden');
  assert.match(html, /<a id="pro-link" href="#"/);
  const url = app.match(/^const PRO_URL = '([^']*)';\r?$/m);
  assert.ok(url, 'web/app.js defines PRO_URL');
  assert.ok(url[1] === '' || /^https:\/\/[^\s"'<>]+$/.test(url[1]), 'PRO_URL is empty or an https address');
  // The card is shown only behind the https check.
  const gate = app.match(/if \((\/.+\/)\.test\(PRO_URL\)\) \{\s*\$\('pro-link'\)\.href = PRO_URL;\s*\$\('pro'\)\.hidden = false;\s*\}/);
  assert.ok(gate, 'the card is revealed only after the address check');
  const re = new RegExp(gate[1].slice(1, -1)); // the regular expression literal from app.js
  for (const bad of ['', 'http://example.com', 'javascript:alert(1)', 'https://a b']) assert.equal(re.test(bad), false, bad);
  assert.equal(re.test('https://pro.example.com/'), true);
});

test('the hosted build keeps the card hidden', async () => {
  const out = await mkdtemp(join(tmpdir(), 'statement-reader-'));
  try {
    await build(out, 'testbuild');
    const html = await readFile(join(out, 'index.html'), 'utf8');
    assert.match(html.match(/<aside[^>]*\sid="pro"[^>]*>/)[0], /\shidden[\s>]/);
  } finally {
    await rm(out, { recursive: true, force: true });
  }
});
