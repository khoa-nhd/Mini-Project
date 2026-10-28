import { describe, it, expect } from 'vitest';
import { validateQuestion, validateQuizDraft } from '../validate.js';
import type { Question, QuizDraft } from '../types.js';

describe('Validation Logic', () => {
  it('validates a correct question without errors', () => {
    const q: Question = {
      id: 'q1',
      type: 'mc',
      text: 'What is 1 + 1?',
      answers: ['2', '3', '4'],
      correct: [0],
      timeLimit: 20,
      aiGuessed: false,
    };

    const errors = validateQuestion(q);
    expect(errors).toHaveLength(0);
  });

  it('catches empty text and answer length violations', () => {
    const q: Question = {
      id: 'q2',
      type: 'mc',
      text: '',
      answers: ['a'.repeat(150), 'b'],
      correct: [0],
      timeLimit: 20,
      aiGuessed: false,
    };

    const errors = validateQuestion(q);
    expect(errors.some((e) => e.field === 'text')).toBe(true);
    expect(errors.some((e) => e.field === 'answers')).toBe(true);
  });

  it('enforces multiple choice questions to have at least 2 answers', () => {
    const q: Question = {
      id: 'q3',
      type: 'mc',
      text: 'Single answer question',
      answers: ['Only answer'],
      correct: [0],
      timeLimit: 20,
      aiGuessed: false,
    };

    const errors = validateQuestion(q);
    expect(errors.some((e) => e.message.includes('at least 2 answers'))).toBe(true);
  });

  it('validates time limits strictly between 1 and 300', () => {
    const q: Question = {
      id: 'q4',
      type: 'mc',
      text: 'Time question',
      answers: ['A', 'B'],
      correct: [0],
      timeLimit: 500,
      aiGuessed: false,
    };

    const errors = validateQuestion(q);
    expect(errors.some((e) => e.field === 'timeLimit')).toBe(true);
  });

  it('validates entire draft', () => {
    const draft: QuizDraft = {
      title: '',
      description: '',
      defaultTime: 20,
      questions: [],
      history: [],
    };

    const result = validateQuizDraft(draft);
    expect(result.isValid).toBe(false);
    expect(result.generalErrors).toContain('Set title is required');
    expect(result.generalErrors).toContain('Question set must have at least 1 question');
  });
});
