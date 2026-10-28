import { describe, it, expect } from 'vitest';
import { chunkDocumentText } from '../llm/chunker.js';

describe('Document Text Chunker', () => {
  it('correctly separates trailing answer key', () => {
    const documentText = `
Câu 1: Thủ đô của Việt Nam là gì?
A. Hà Nội
B. Huế

Câu 2: 1 + 1 bằng mấy?
A. 2
B. 3

=== ĐÁP ÁN ===
1. A
2. A
`;

    const chunks = chunkDocumentText(documentText, 10);
    expect(chunks.length).toBeGreaterThan(0);
    expect(chunks[0].answerKey).toBeDefined();
    expect(chunks[0].answerKey).toContain('1. A');
    expect(chunks[0].text).not.toContain('=== ĐÁP ÁN ===');
  });

  it('chunks questions into groups based on target count', () => {
    let longDoc = '';
    for (let i = 1; i <= 35; i++) {
      longDoc += `\n\nCâu ${i}. Đây là nội dung câu hỏi số ${i}?\nA. Lựa chọn 1\nB. Lựa chọn 2\n`;
    }

    const chunks = chunkDocumentText(longDoc, 15);
    expect(chunks.length).toBe(3); // 15 + 15 + 5
    expect(chunks[0].chunkIndex).toBe(1);
    expect(chunks[0].totalChunks).toBe(3);
    expect(chunks[0].text).toContain('Câu 1.');
    expect(chunks[1].text).toContain('Câu 16.');
  });
});
