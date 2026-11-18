import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { build } from '../dev/build.mjs';

test('hosted build: every local script sits under the per-deploy folder', async () => {
  const out = await mkdtemp(join(tmpdir(), 'statement-reader-'));
  try {
    await build(out, 'testbuild');
    const html = await readFile(join(out, 'index.html'), 'utf8');
    const scripts = [...html.matchAll(/<script[^>]+src="([^"]+)"/g)].map((m) => m[1]);
    assert.deepEqual(scripts, ['./b/testbuild/web/app.js']);
    assert.ok(!/<link[^>]+rel="stylesheet"/.test(html), 'a stylesheet would need a per-deploy URL too');
    assert.match(html, /data-samples="\.\/samples\/"/);
    for (const file of [
      'b/testbuild/web/app.js', 'b/testbuild/web/vendor/pdf.min.mjs', 'b/testbuild/web/vendor/pdf.worker.min.mjs',
      'b/testbuild/src/index.js', 'b/testbuild/src/parsers/mpesa-ke.js', 'b/testbuild/src/parsers/gcash-ph.js',
      'samples/mpesa-ke-sample.pdf', 'samples/gcash-ph-sample.pdf', '.nojekyll',
    ]) {
      assert.ok((await stat(join(out, file))).isFile(), file);
    }
  } finally {
    await rm(out, { recursive: true, force: true });
  }
});
