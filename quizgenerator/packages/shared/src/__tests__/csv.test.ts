import { describe, it, expect } from 'vitest';
import { buildBlooketCsv, parseBlooketCsv, escapeCsvCell } from '../csv.js';
import type { Question } from '../types.js';

describe('CSV Builder & Parser', () => {
  it('correctly escapes RFC 4180 special characters in cells', () => {
    expect(escapeCsvCell('simple')).toBe('simple');
    expect(escapeCsvCell('has, comma')).toBe('"has, comma"');
    expect(escapeCsvCell('has "quotes" inside')).toBe('"has ""quotes"" inside"');
    expect(escapeCsvCell('line 1\nline 2')).toBe('"line 1\nline 2"');
  });

  it('builds CSV with UTF-8 BOM and correct Blooket header rows', () => {
    const questions: Question[] = [
      {
        id: '1',
        type: 'mc',
        text: 'What is 2 + 2?',
        answers: ['4', '3', '1', 'Four'],
        correct: [0, 3], // 1,4 in 1-based
        timeLimit: 20,
        aiGuessed: false,
      },
    ];

    const csv = buildBlooketCsv(questions);

    // Has BOM
    expect(csv.charCodeAt(0)).toBe(0xfeff);

    const raw = csv.slice(1);
    const lines = raw.split('\r\n');

    // Row 1: Logo / Import Template
    expect(lines[0].startsWith('"Blooket\nImport Template"')).toBe(true);
    // 26 columns in row 1
    expect(lines[0].split(',').length).toBe(26);

    // Row 2: Headers
    expect(lines[1].startsWith('Question #,Question Text,Answer 1,Answer 2')).toBe(true);

    // Row 3: First question
    expect(lines[2]).toContain('What is 2 + 2?');
    expect(lines[2]).toContain('20');
    expect(lines[2]).toContain('"1,4"');
  });

  it('handles typing questions by putting typing in column J', () => {
    const questions: Question[] = [
      {
        id: '2',
        type: 'typing',
        text: 'Capital of France?',
        answers: ['Paris', 'paris'],
        correct: [0, 1],
        timeLimit: 15,
        aiGuessed: false,
      },
    ];

    const csv = buildBlooketCsv(questions);
    const parsed = parseBlooketCsv(csv);

    expect(parsed.length).toBe(1);
    expect(parsed[0].type).toBe('typing');
    expect(parsed[0].text).toBe('Capital of France?');
    expect(parsed[0].answers).toEqual(['Paris', 'paris']);
  });

  it('writes ALL typing answer variants as accepted, even when correct is partial', () => {
    // Regression: the model often returns correct:[0] with several answers;
    // only variant 1 used to land in column H, dropping the accepted variants.
    const questions: Question[] = [
      {
        id: '4',
        type: 'typing',
        text: 'Điền: Thủ đô của Việt Nam là ______',
        answers: ['học', 'Học'],
        correct: [0],
        timeLimit: 20,
        aiGuessed: false,
      },
    ];

    const csv = buildBlooketCsv(questions);
    const rows = csv.slice(1).split('\r\n');

    // Col H (index 7) must accept every variant: "1,2"
    expect(rows[2]).toContain('"1,2"');
    // Col J (index 9) must mark it as typing
    expect(rows[2]).toContain('typing');

    const parsed = parseBlooketCsv(csv);
    expect(parsed[0].answers).toEqual(['học', 'Học']);
    expect(parsed[0].correct).toEqual([0, 1]);
  });

  it('preserves Vietnamese accents and punctuation', () => {
    const questions: Question[] = [
      {
        id: '3',
        type: 'mc',
        text: 'Thủ đô của Việt Nam là gì?',
        answers: ['Hà Nội', 'TP. Hồ Chí Minh', 'Đà Nẵng', 'Huế'],
        correct: [0],
        timeLimit: 25,
        aiGuessed: true,
      },
    ];

    const csv = buildBlooketCsv(questions);
    const parsed = parseBlooketCsv(csv);

    expect(parsed.length).toBe(1);
    expect(parsed[0].text).toBe('Thủ đô của Việt Nam là gì?');
    expect(parsed[0].answers[0]).toBe('Hà Nội');
    expect(parsed[0].answers[1]).toBe('TP. Hồ Chí Minh');
    expect(parsed[0].correct).toEqual([0]);
    expect(parsed[0].timeLimit).toBe(25);
  });
});
