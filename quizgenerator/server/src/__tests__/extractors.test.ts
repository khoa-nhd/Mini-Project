import { describe, it, expect } from 'vitest';
import * as XLSX from 'xlsx';
import { extractXlsxToMarkdown } from '../extractors/xlsx.js';

describe('Extractors', () => {
  it('extracts XLSX sheet rows into markdown tables', () => {
    const wb = XLSX.utils.book_new();
    const wsData = [
      ['Question', 'Answer 1', 'Answer 2', 'Correct'],
      ['What is 2+2?', '4', '5', '1'],
    ];
    const ws = XLSX.utils.aoa_to_sheet(wsData);
    XLSX.utils.book_append_sheet(wb, ws, 'MathQuiz');

    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    const markdown = extractXlsxToMarkdown(buffer);

    expect(markdown).toContain('Sheet: MathQuiz');
    expect(markdown).toContain('| What is 2+2? | 4 | 5 | 1 |');
  });
});
