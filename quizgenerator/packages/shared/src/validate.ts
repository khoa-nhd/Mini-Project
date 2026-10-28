import type { Question, QuizDraft } from './types.js';
import { MAX_Q_LEN, MAX_A_LEN, MAX_QUESTIONS, MIN_TIME, MAX_TIME } from './constants.js';

export interface QuestionValidationError {
  questionId: string;
  field: 'text' | 'answers' | 'correct' | 'timeLimit' | 'general';
  message: string;
}

export function validateQuestion(q: Question): QuestionValidationError[] {
  const errors: QuestionValidationError[] = [];

  // Question text
  const trimmedText = (q.text || '').trim();
  if (!trimmedText) {
    errors.push({
      questionId: q.id,
      field: 'text',
      message: 'Question text is required',
    });
  } else if (trimmedText.length > MAX_Q_LEN) {
    errors.push({
      questionId: q.id,
      field: 'text',
      message: `Question text exceeds ${MAX_Q_LEN} characters (${trimmedText.length}/${MAX_Q_LEN})`,
    });
  }

  // Answers
  if (!Array.isArray(q.answers) || q.answers.length === 0) {
    errors.push({
      questionId: q.id,
      field: 'answers',
      message: 'At least one answer is required',
    });
  } else {
    if (q.type === 'mc' && q.answers.length < 2) {
      errors.push({
        questionId: q.id,
        field: 'answers',
        message: 'Multiple choice questions require at least 2 answers',
      });
    }

    if (q.answers.length > 4) {
      errors.push({
        questionId: q.id,
        field: 'answers',
        message: 'Maximum 4 answers allowed',
      });
    }

    q.answers.forEach((ans, idx) => {
      const trimmedAns = (ans || '').trim();
      if (!trimmedAns) {
        errors.push({
          questionId: q.id,
          field: 'answers',
          message: `Answer ${idx + 1} cannot be empty`,
        });
      } else if (trimmedAns.length > MAX_A_LEN) {
        errors.push({
          questionId: q.id,
          field: 'answers',
          message: `Answer ${idx + 1} exceeds ${MAX_A_LEN} characters (${trimmedAns.length}/${MAX_A_LEN})`,
        });
      }
    });
  }

  // Correct answers
  if (!Array.isArray(q.correct) || q.correct.length === 0) {
    errors.push({
      questionId: q.id,
      field: 'correct',
      message: 'At least one correct answer must be selected',
    });
  } else {
    const invalidIndices = q.correct.filter(
      (idx) => idx < 0 || idx >= (q.answers?.length || 0)
    );
    if (invalidIndices.length > 0) {
      errors.push({
        questionId: q.id,
        field: 'correct',
        message: 'Selected correct answer is out of range',
      });
    }
  }

  // Time limit
  if (
    typeof q.timeLimit !== 'number' ||
    q.timeLimit < MIN_TIME ||
    q.timeLimit > MAX_TIME ||
    !Number.isInteger(q.timeLimit)
  ) {
    errors.push({
      questionId: q.id,
      field: 'timeLimit',
      message: `Time limit must be an integer between ${MIN_TIME}s and ${MAX_TIME}s`,
    });
  }

  return errors;
}

export interface QuizDraftValidationResult {
  isValid: boolean;
  generalErrors: string[];
  questionErrors: Record<string, QuestionValidationError[]>;
  totalErrorCount: number;
}

export function validateQuizDraft(draft: QuizDraft): QuizDraftValidationResult {
  const generalErrors: string[] = [];
  const questionErrors: Record<string, QuestionValidationError[]> = {};
  let totalErrorCount = 0;

  if (!draft.title || !draft.title.trim()) {
    generalErrors.push('Set title is required');
    totalErrorCount++;
  }

  if (!Array.isArray(draft.questions) || draft.questions.length === 0) {
    generalErrors.push('Question set must have at least 1 question');
    totalErrorCount++;
  } else if (draft.questions.length > MAX_QUESTIONS) {
    generalErrors.push(`Question set cannot exceed ${MAX_QUESTIONS} questions (${draft.questions.length}/${MAX_QUESTIONS})`);
    totalErrorCount++;
  }

  if (Array.isArray(draft.questions)) {
    for (const q of draft.questions) {
      const qErrors = validateQuestion(q);
      if (qErrors.length > 0) {
        questionErrors[q.id] = qErrors;
        totalErrorCount += qErrors.length;
      }
    }
  }

  return {
    isValid: totalErrorCount === 0,
    generalErrors,
    questionErrors,
    totalErrorCount,
  };
}
