import { z } from 'zod';
import { MAX_Q_LEN, MAX_A_LEN, MAX_TIME, MIN_TIME } from './constants.js';

export const QuestionTypeSchema = z.enum(['mc', 'typing']);

export const QuestionSchema = z.object({
  id: z.string().min(1),
  type: QuestionTypeSchema,
  text: z.string().trim().min(1, 'Question text cannot be empty').max(MAX_Q_LEN, `Question text cannot exceed ${MAX_Q_LEN} characters`),
  answers: z.array(z.string().trim().min(1, 'Answer cannot be empty').max(MAX_A_LEN, `Answer cannot exceed ${MAX_A_LEN} characters`))
    .min(1, 'At least 1 answer is required')
    .max(4, 'At most 4 answers allowed'),
  correct: z.array(z.number().int().min(0).max(3)).min(1, 'At least 1 correct answer is required'),
  timeLimit: z.number().int().min(MIN_TIME).max(MAX_TIME),
  aiGuessed: z.boolean(),
  sourceRef: z.string().optional(),
}).refine((data) => {
  if (data.type === 'mc') {
    return data.answers.length >= 2;
  }
  return true;
}, {
  message: 'Multiple choice questions require at least 2 answers',
  path: ['answers'],
}).refine((data) => {
  // Correct indices must be valid within answers array
  return data.correct.every((idx) => idx >= 0 && idx < data.answers.length);
}, {
  message: 'All correct answer indices must point to valid answers',
  path: ['correct'],
});

export const LLMExtractedQuestionSchema = z.object({
  type: QuestionTypeSchema.default('mc'),
  text: z.string().trim().min(1),
  answers: z.array(z.string().trim().min(1)).min(1).max(4),
  correct: z.array(z.number().int().min(0).max(3)).min(1),
  timeLimit: z.number().int().min(MIN_TIME).max(MAX_TIME).default(20),
  aiGuessed: z.boolean().default(false),
  sourceRef: z.string().optional(),
});

export const LLMExtractOutputSchema = z.object({
  title: z.string().optional(),
  questions: z.array(LLMExtractedQuestionSchema),
});

export const QuizDraftSchema = z.object({
  title: z.string().trim().min(1, 'Title is required'),
  description: z.string().default(''),
  defaultTime: z.number().int().min(MIN_TIME).max(MAX_TIME).default(20),
  questions: z.array(QuestionSchema),
  history: z.array(
    z.object({
      id: z.string(),
      title: z.string(),
      url: z.string().url(),
      questionCount: z.number().int(),
      createdAt: z.string(),
    })
  ).default([]),
});

export const PublishRequestSchema = z.object({
  title: z.string().trim().min(1, 'Title is required'),
  description: z.string().default(''),
  questions: z.array(QuestionSchema).min(1, 'At least 1 question is required'),
  turnstileToken: z.string().optional(),
});

export const RefineRequestSchema = z.object({
  questions: z.array(QuestionSchema),
  message: z.string().trim().min(1),
});
