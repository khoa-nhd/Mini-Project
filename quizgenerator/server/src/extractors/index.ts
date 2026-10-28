import { extractDocxToMarkdown } from './docx.js';
import { extractPdf } from './pdf.js';
import { extractXlsxToMarkdown } from './xlsx.js';

export interface ExtractedFileContent {
  filename: string;
  mimeType: string;
  text?: string;
  imageBuffer?: Buffer;
}

export async function extractFileContent(
  filename: string,
  mimeType: string,
  buffer: Buffer
): Promise<ExtractedFileContent> {
  const ext = filename.split('.').pop()?.toLowerCase() || '';

  // DOCX
  if (
    ext === 'docx' ||
    mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ) {
    const text = await extractDocxToMarkdown(buffer);
    return { filename, mimeType, text };
  }

  // PDF
  if (ext === 'pdf' || mimeType === 'application/pdf') {
    const pdfRes = await extractPdf(buffer);
    if (pdfRes.isScanned && pdfRes.buffer) {
      return {
        filename,
        mimeType: 'application/pdf',
        imageBuffer: pdfRes.buffer,
      };
    }
    return { filename, mimeType, text: pdfRes.text };
  }

  // XLSX / XLS
  if (
    ext === 'xlsx' ||
    ext === 'xls' ||
    mimeType.includes('spreadsheet') ||
    mimeType.includes('excel')
  ) {
    const text = extractXlsxToMarkdown(buffer);
    return { filename, mimeType, text };
  }

  // Images (PNG, JPEG, WebP)
  if (
    mimeType.startsWith('image/') ||
    ['png', 'jpg', 'jpeg', 'webp'].includes(ext)
  ) {
    return {
      filename,
      mimeType: mimeType.startsWith('image/') ? mimeType : `image/${ext === 'jpg' ? 'jpeg' : ext}`,
      imageBuffer: buffer,
    };
  }

  // Plain text fallback (TXT, CSV, Markdown, etc.)
  const text = buffer.toString('utf-8');
  return { filename, mimeType: 'text/plain', text };
}
