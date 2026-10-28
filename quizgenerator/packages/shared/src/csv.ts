import type { Question } from './types.js';
import {
  BLOOKET_CSV_HEADER_ROW_1,
  BLOOKET_CSV_HEADER_ROW_2,
  TOTAL_CSV_COLUMNS,
} from './constants.js';

/**
 * Escapes a single CSV cell according to RFC 4180.
 * If the value contains commas, double quotes, or newlines,
 * wrap it in double quotes and replace internal quotes with double-quotes.
 */
export function escapeCsvCell(val: string | number | undefined | null): string {
  if (val === undefined || val === null) {
    return '';
  }
  const str = String(val);
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/**
 * Builds a valid RFC 4180 CSV string with UTF-8 BOM,
 * matching Blooket's official template (26 columns per row).
 */
export function buildBlooketCsv(questions: Question[]): string {
  const rows: string[][] = [];

  // Row 1: Logo/Template Banner
  const row1 = Array(TOTAL_CSV_COLUMNS).fill('');
  row1[0] = BLOOKET_CSV_HEADER_ROW_1;
  rows.push(row1);

  // Row 2: Headers
  const row2 = Array(TOTAL_CSV_COLUMNS).fill('');
  for (let i = 0; i < BLOOKET_CSV_HEADER_ROW_2.length; i++) {
    row2[i] = BLOOKET_CSV_HEADER_ROW_2[i];
  }
  rows.push(row2);

  // Row 3+: Questions
  questions.forEach((q, idx) => {
    const row = Array(TOTAL_CSV_COLUMNS).fill('');
    // Col A: Question #
    row[0] = String(idx + 1);

    // Col B: Question Text
    row[1] = q.text;

    // Col C-F: Answers 1-4
    row[2] = q.answers[0] || '';
    row[3] = q.answers[1] || '';
    row[4] = q.answers[2] || '';
    row[5] = q.answers[3] || '';

    // Col G: Time limit (sec)
    row[6] = String(q.timeLimit || 20);

    // Col H: Correct Answer(s) 1-based, comma-separated e.g. "1,4"
    if (q.type === 'typing') {
      // PLAN: every listed answer of a typing question is an accepted variant.
      // The model often returns correct:[0] even with several answers, so taking
      // `correct` at face value silently dropped the other variants from the CSV.
      row[7] = q.answers.map((_, i) => i + 1).join(',');
    } else {
      const correct1Based = q.correct.map((i) => i + 1).sort((a, b) => a - b);
      row[7] = correct1Based.join(',');
    }

    // Col I: empty

    // Col J: "typing" for typing question, blank for MC
    if (q.type === 'typing') {
      row[9] = 'typing';
    }

    rows.push(row);
  });

  // Convert each row into CSV formatted string
  const csvContent = rows
    .map((row) => row.map(escapeCsvCell).join(','))
    .join('\r\n');

  // Prepend UTF-8 BOM
  return '\uFEFF' + csvContent;
}

/**
 * Minimal robust RFC 4180 CSV parser for Blooket CSVs
 */
export function parseCsvRows(csvText: string): string[][] {
  // Strip BOM if present
  const text = csvText.startsWith('\uFEFF') ? csvText.slice(1) : csvText;
  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentField = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const nextChar = text[i + 1];

    if (inQuotes) {
      if (char === '"') {
        if (nextChar === '"') {
          // Escaped quote
          currentField += '"';
          i++;
        } else {
          // Closing quote
          inQuotes = false;
        }
      } else {
        currentField += char;
      }
    } else {
      if (char === '"') {
        inQuotes = true;
      } else if (char === ',') {
        currentRow.push(currentField);
        currentField = '';
      } else if (char === '\r') {
        if (nextChar === '\n') {
          i++;
        }
        currentRow.push(currentField);
        rows.push(currentRow);
        currentRow = [];
        currentField = '';
      } else if (char === '\n') {
        currentRow.push(currentField);
        rows.push(currentRow);
        currentRow = [];
        currentField = '';
      } else {
        currentField += char;
      }
    }
  }

  // Push last field/row if not empty
  if (currentField.length > 0 || currentRow.length > 0) {
    currentRow.push(currentField);
    rows.push(currentRow);
  }

  return rows;
}

/**
 * Parses a Blooket CSV string into Question objects
 */
export function parseBlooketCsv(csvContent: string): Question[] {
  const rows = parseCsvRows(csvContent);
  if (rows.length < 3) {
    return [];
  }

  const questions: Question[] = [];

  // Skip row 0 (title) and row 1 (header)
  for (let i = 2; i < rows.length; i++) {
    const row = rows[i];
    const qText = (row[1] || '').trim();
    if (!qText) {
      continue;
    }

    const ans1 = (row[2] || '').trim();
    const ans2 = (row[3] || '').trim();
    const ans3 = (row[4] || '').trim();
    const ans4 = (row[5] || '').trim();

    const answers = [ans1, ans2, ans3, ans4].filter(Boolean);
    if (answers.length === 0) {
      continue;
    }

    const timeLimit = Math.max(1, Math.min(300, parseInt(row[6] || '20', 10) || 20));
    const isTyping = (row[9] || '').trim().toLowerCase() === 'typing';

    // Parse correct answers (e.g. "1,4" -> [0, 3])
    const rawCorrect = (row[7] || '').trim();
    let correct: number[] = [];
    if (rawCorrect) {
      correct = rawCorrect
        .split(',')
        .map((s) => parseInt(s.trim(), 10) - 1)
        .filter((n) => !isNaN(n) && n >= 0 && n < answers.length);
    }
    if (correct.length === 0) {
      correct = [0];
    }

    // Simple deterministic ID generation or random uuid
    const id = `q_${i - 1}_${Date.now()}`;

    questions.push({
      id,
      type: isTyping ? 'typing' : 'mc',
      text: qText,
      answers,
      correct,
      timeLimit,
      aiGuessed: false,
    });
  }

  return questions;
}
