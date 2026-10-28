import { GoogleGenAI } from '@google/genai';
import { SYSTEM_PROMPT_EXTRACT, SYSTEM_PROMPT_REFINE } from './prompt.js';
import type { Question, RefineResponse } from '@quizgenerator/shared';
import crypto from 'crypto';

export function getGeminiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not set in environment variables.');
  }
  // Default SDK retry is 5 attempts with up to 60s backoff — one overloaded
  // 503 chain measured ~222s before failing. Cap it: 3 attempts, short backoff,
  // and a hard 60s per-request timeout so a hung call cannot stall the SSE stream.
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      timeout: Number(process.env.GEMINI_TIMEOUT_MS || 60000),
      retryOptions: {
        attempts: Number(process.env.GEMINI_RETRY_ATTEMPTS || 3),
        initialDelay: 2,
        maxDelay: 10,
        expBase: 2,
        jitter: 0.5,
      },
    },
  });
}

export const EXTRACT_RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    title: { type: 'string', description: 'Suggested quiz title' },
    questions: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          type: { type: 'string', enum: ['mc', 'typing'] },
          text: { type: 'string' },
          answers: {
            type: 'array',
            items: { type: 'string' },
          },
          correct: {
            type: 'array',
            items: { type: 'integer' },
          },
          timeLimit: { type: 'integer' },
          aiGuessed: { type: 'boolean' },
          sourceRef: { type: 'string' },
        },
        required: ['type', 'text', 'answers', 'correct', 'timeLimit', 'aiGuessed'],
      },
    },
  },
  required: ['questions'],
};

export const REFINE_RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    reply: { type: 'string' },
    patches: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          op: { type: 'string', enum: ['update', 'delete', 'add'] },
          id: { type: 'string' },
          fields: {
            type: 'object',
            properties: {
              type: { type: 'string', enum: ['mc', 'typing'] },
              text: { type: 'string' },
              answers: { type: 'array', items: { type: 'string' } },
              correct: { type: 'array', items: { type: 'integer' } },
              timeLimit: { type: 'integer' },
              aiGuessed: { type: 'boolean' },
            },
          },
          question: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              type: { type: 'string', enum: ['mc', 'typing'] },
              text: { type: 'string' },
              answers: { type: 'array', items: { type: 'string' } },
              correct: { type: 'array', items: { type: 'integer' } },
              timeLimit: { type: 'integer' },
              aiGuessed: { type: 'boolean' },
            },
            required: ['id', 'type', 'text', 'answers', 'correct', 'timeLimit', 'aiGuessed'],
          },
        },
        required: ['op'],
      },
    },
  },
  required: ['reply', 'patches'],
};

export interface ExtractResult {
  title?: string;
  questions: Question[];
}

export async function extractFromChunk(
  chunkText: string,
  userPrompt?: string,
  answerKey?: string,
  imageBuffer?: Buffer,
  mimeType?: string
): Promise<ExtractResult> {
  const ai = getGeminiClient();
  const model = process.env.GEMINI_MODEL || 'gemini-3.6-flash';

  const contents: any[] = [];

  let textPrompt = `Extract questions from the following content:\n\n${chunkText}`;
  if (answerKey) {
    textPrompt += `\n\n--- ANSWER KEY ---\n${answerKey}`;
  }
  if (userPrompt) {
    textPrompt += `\n\n--- USER INSTRUCTIONS ---\n${userPrompt}`;
  }

  contents.push({ text: textPrompt });

  // If scanned image/PDF
  if (imageBuffer && mimeType) {
    contents.push({
      inlineData: {
        data: imageBuffer.toString('base64'),
        mimeType,
      },
    });
  }

  const response = await ai.models.generateContent({
    model,
    contents,
    config: {
      systemInstruction: SYSTEM_PROMPT_EXTRACT,
      responseMimeType: 'application/json',
      responseSchema: EXTRACT_RESPONSE_SCHEMA as any,
      temperature: 0.2,
    },
  });

  const responseText = response.text || '{}';
  const parsed = JSON.parse(responseText);

  const rawQuestions = Array.isArray(parsed.questions) ? parsed.questions : [];
  const questions: Question[] = rawQuestions.map((q: any) => ({
    id: `q_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`,
    type: q.type === 'typing' ? 'typing' : 'mc',
    text: String(q.text || '').trim(),
    answers: Array.isArray(q.answers) ? q.answers.map((a: any) => String(a).trim()).filter(Boolean) : [],
    correct: Array.isArray(q.correct) ? q.correct : [0],
    timeLimit: typeof q.timeLimit === 'number' ? Math.max(1, Math.min(300, q.timeLimit)) : 20,
    aiGuessed: Boolean(q.aiGuessed),
    sourceRef: q.sourceRef ? String(q.sourceRef) : undefined,
  }));

  return {
    title: parsed.title,
    questions,
  };
}

export async function refineQuestionsWithPrompt(
  questions: Question[],
  userMessage: string
): Promise<RefineResponse> {
  const ai = getGeminiClient();
  const model = process.env.GEMINI_MODEL || 'gemini-3.6-flash';

  const prompt = `Current questions list (${questions.length} questions):\n${JSON.stringify(
    questions,
    null,
    2
  )}\n\nUser command:\n"${userMessage}"`;

  const response = await ai.models.generateContent({
    model,
    contents: [{ text: prompt }],
    config: {
      systemInstruction: SYSTEM_PROMPT_REFINE,
      responseMimeType: 'application/json',
      responseSchema: REFINE_RESPONSE_SCHEMA as any,
      temperature: 0.1,
    },
  });

  const responseText = response.text || '{}';
  const parsed = JSON.parse(responseText);

  return {
    reply: parsed.reply || 'Modifications applied.',
    patches: Array.isArray(parsed.patches) ? parsed.patches : [],
  };
}
