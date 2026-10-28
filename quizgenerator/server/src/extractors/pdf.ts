import pdfParse from 'pdf-parse';

export interface PdfExtractResult {
  text: string;
  pageCount: number;
  isScanned: boolean;
  buffer?: Buffer;
}

export async function extractPdf(buffer: Buffer): Promise<PdfExtractResult> {
  try {
    const data = await pdfParse(buffer);
    const text = data.text || '';
    const pageCount = data.numpages || 1;

    // Detect if scanned / image-only PDF
    const avgCharsPerPage = text.trim().length / Math.max(pageCount, 1);
    const isScanned = avgCharsPerPage < 40;

    return {
      text: text.trim(),
      pageCount,
      isScanned,
      buffer: isScanned ? buffer : undefined,
    };
  } catch (err: any) {
    // If parsing fails (e.g. encrypted or purely image), treat as scanned image
    return {
      text: '',
      pageCount: 1,
      isScanned: true,
      buffer,
    };
  }
}
