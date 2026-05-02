import type { Attachment } from './types';
import { fileToDataUrl, fileToText } from './api';

let pdfjsModule: any = null;

async function getPdfjs() {
  if (pdfjsModule) return pdfjsModule;
  // Lazy-load pdf.js
  const lib = await import('pdfjs-dist');
  // Inline-load worker
  // @ts-ignore
  const worker = await import('pdfjs-dist/build/pdf.worker.mjs?url').catch(() => null);
  if (worker?.default) {
    lib.GlobalWorkerOptions.workerSrc = worker.default;
  } else {
    // Fallback: use a CDN worker (browsers will block this if offline; primary path is the bundled worker)
    lib.GlobalWorkerOptions.workerSrc = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${lib.version}/build/pdf.worker.min.mjs`;
  }
  pdfjsModule = lib;
  return lib;
}

export async function fileToAttachment(file: File): Promise<Attachment> {
  const id = crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2);
  const mime = file.type || guessMime(file.name);
  const isImage = mime.startsWith('image/');
  const isPdf   = mime === 'application/pdf' || /\.pdf$/i.test(file.name);

  const base = { id, name: file.name, mime, size: file.size };

  if (isImage) {
    const dataUrl = await fileToDataUrl(file);
    return { ...base, kind: 'image', dataUrl };
  }
  if (isPdf) {
    const text = await extractPdfText(file);
    return { ...base, kind: 'pdf', text };
  }
  // text-ish: read as text
  const text = await fileToText(file);
  return { ...base, kind: 'text', text };
}

async function extractPdfText(file: File): Promise<string> {
  try {
    const pdfjs = await getPdfjs();
    const buf = await file.arrayBuffer();
    const pdf = await pdfjs.getDocument({ data: buf }).promise;
    const out: string[] = [];
    const max = Math.min(pdf.numPages, 200); // soft cap
    for (let i = 1; i <= max; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      const text = content.items.map((it: any) => it.str).join(' ');
      out.push(`--- page ${i} ---\n${text}`);
    }
    return out.join('\n\n');
  } catch (e) {
    return `[Failed to extract PDF text: ${(e as Error).message}]`;
  }
}

function guessMime(name: string): string {
  const ext = name.split('.').pop()?.toLowerCase() || '';
  const map: Record<string, string> = {
    md: 'text/markdown',
    txt: 'text/plain',
    json: 'application/json',
    js: 'text/javascript',
    ts: 'text/typescript',
    py: 'text/x-python',
    pdf: 'application/pdf',
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    webp: 'image/webp',
    gif: 'image/gif',
  };
  return map[ext] || 'application/octet-stream';
}

export function formatBytes(b: number): string {
  if (b < 1024) return b + ' B';
  if (b < 1024 * 1024) return (b / 1024).toFixed(1) + ' KB';
  return (b / 1024 / 1024).toFixed(1) + ' MB';
}
