// Copies pdf.js into web/vendor so the page never loads code from another site.
import { copyFile, mkdir } from 'node:fs/promises';

const from = new URL('../node_modules/pdfjs-dist/build/', import.meta.url);
const to = new URL('../web/vendor/', import.meta.url);
await mkdir(to, { recursive: true });
for (const name of ['pdf.min.mjs', 'pdf.worker.min.mjs']) {
  await copyFile(new URL(name, from), new URL(name, to));
  console.log('copied', name);
}
