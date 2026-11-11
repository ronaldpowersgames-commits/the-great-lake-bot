import { getDocument, GlobalWorkerOptions } from '/pdf-reader/pdf.mjs';

GlobalWorkerOptions.workerSrc = '/pdf-reader/pdf.worker.mjs';

export async function meetingPdfText(dataUrl) {
  const bytes = Uint8Array.from(atob(dataUrl.split(',')[1]), character => character.charCodeAt(0));
  const task = getDocument({
    data: bytes,
    isEvalSupported: false,
    useSystemFonts: false,
    cMapUrl: '/pdf-reader/cmaps/',
    cMapPacked: true,
    standardFontDataUrl: '/pdf-reader/standard_fonts/'
  });
  try {
    const pdf = await task.promise;
    const pages = [];
    for (let number = 1; number <= pdf.numPages; number++) {
      const page = await pdf.getPage(number);
      const { items } = await page.getTextContent();
      pages.push(items.filter(item => 'str' in item)
        .map(item => item.str + (item.hasEOL ? '\n' : '')).join(''));
      page.cleanup();
    }
    const text = pages.join('\n\n');
    return text.trim() ? text : null;
  } finally {
    await task.destroy();
  }
}
