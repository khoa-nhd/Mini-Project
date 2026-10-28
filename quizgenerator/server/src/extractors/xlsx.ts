import * as XLSX from 'xlsx';

export function extractXlsxToMarkdown(buffer: Buffer): string {
  const workbook = XLSX.read(buffer, { type: 'buffer' });
  const sheetTexts: string[] = [];

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    if (!sheet) continue;

    // Convert sheet to array of rows
    const rows = XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1 });
    if (!rows || rows.length === 0) continue;

    const markdownRows = rows
      .filter((r) => r.length > 0 && r.some((c) => c !== undefined && c !== null && String(c).trim() !== ''))
      .map((r) => `| ${r.map((c) => (c === undefined || c === null ? '' : String(c).replace(/\|/g, '\\|'))).join(' | ')} |`);

    if (markdownRows.length > 0) {
      sheetTexts.push(`### Sheet: ${sheetName}\n\n${markdownRows.join('\n')}`);
    }
  }

  return sheetTexts.join('\n\n---\n\n');
}
