// Builds the hosted copy of the page into dist/ (or the folder given with --out).
// Every script sits under b/<build>/ so each deploy gets fresh URLs and phones never mix old
// scripts with a new page. Nothing is bundled or minified; the files are copied as they are.
//   BUILD=abc1234 node dev/build.mjs
import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { join, resolve } from 'node:path';

const root = fileURLToPath(new URL('..', import.meta.url));

function buildId() {
  if (process.env.BUILD) return process.env.BUILD.replace(/[^A-Za-z0-9._-]/g, '').slice(0, 20);
  try {
    return execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: root, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
  } catch {
    return `t${Date.now().toString(36)}`;
  }
}

export async function build(outDir = join(root, 'dist'), id = buildId()) {
  const out = resolve(outDir);
  await rm(out, { recursive: true, force: true });
  const base = join(out, 'b', id);
  await mkdir(join(base, 'web', 'vendor'), { recursive: true });
  await mkdir(join(out, 'samples'), { recursive: true });

  await cp(join(root, 'src'), join(base, 'src'), { recursive: true });
  await cp(join(root, 'web', 'app.js'), join(base, 'web', 'app.js'));
  for (const name of ['pdf.min.mjs', 'pdf.worker.min.mjs']) {
    await cp(join(root, 'node_modules', 'pdfjs-dist', 'build', name), join(base, 'web', 'vendor', name));
  }

  // Made-up sample statements for the "try a sample" buttons, generated fresh.
  const fixtures = pathToFileURL(join(root, 'test', 'fixtures') + '/');
  const mpesa = await import(new URL('make-mpesa-fixture.mjs', fixtures));
  const gcash = await import(new URL('make-gcash-fixture.mjs', fixtures));
  await writeFile(join(out, 'samples', 'mpesa-ke-sample.pdf'), await mpesa.buildFixture());
  await writeFile(join(out, 'samples', 'gcash-ph-sample.pdf'), await gcash.buildFixture());

  let html = await readFile(join(root, 'web', 'index.html'), 'utf8');
  const before = html;
  html = html
    .replace('src="./app.js"', `src="./b/${id}/web/app.js"`)
    .replace('<html lang="en">', '<html lang="en" data-samples="./samples/">');
  if (html === before || !html.includes(`./b/${id}/web/app.js`) || !html.includes('data-samples=')) {
    throw new Error('build: web/index.html no longer has the markers the build rewrites');
  }
  await writeFile(join(out, 'index.html'), html);
  await writeFile(join(out, '.nojekyll'), '');
  return { out, id };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const i = process.argv.indexOf('--out');
  const { out, id } = await build(i > -1 ? process.argv[i + 1] : undefined);
  console.log(`built ${out} (build ${id})`);
}
