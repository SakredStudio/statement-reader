// Reads positioned text items out of a PDF using a pdf.js build passed in by the caller
// (browser build on the web page, legacy build in Node). No network, no upload.

export async function readPdfItems(pdfjs, data, { password } = {}) {
  const doc = await pdfjs.getDocument({ data, password, useSystemFonts: true }).promise;
  const items = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const height = page.getViewport({ scale: 1 }).height;
    const content = await page.getTextContent();
    for (const it of content.items) {
      if (!it.str) continue;
      items.push({ str: it.str, x: it.transform[4], y: height - it.transform[5], page: p });
    }
  }
  await doc.destroy();
  return items;
}
