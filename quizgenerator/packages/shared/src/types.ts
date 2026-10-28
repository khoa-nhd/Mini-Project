export type QuestionType = 'mc' | 'typing';

export interface Question {
  id: string;              // uuid for drag-and-drop & editing
  type: QuestionType;
  text: string;
  answers: string[];       // 2-4 items for 'mc', 1-4 accepted variations for 'typing'
  correct: number[];       // 0-based indices; typing: all answers are correct variants
  timeLimit: number;       // 1-300 seconds
  aiGuessed: boolean;      // ⚠️ AI guessed answer or generated distractors
  sourceRef?: string;      // "file.pdf p.3 câu 12" for user reference
}

export interface QuizHistoryItem {
  id: string;
  title: string;
  url: string;
  questionCount: number;
  createdAt: string;
}

export interface QuizDraft {
  title: string;
  description: string;
  defaultTime: number;     // default 20s
  questions: Question[];
  history: QuizHistoryItem[];
}

export type PatchOperation = 'update' | 'delete' | 'add';

export interface RefinePatch {
  op: PatchOperation;
  id?: string;
  fields?: Partial<Omit<Question, 'id'>>;
  question?: Question;
}

export interface RefineResponse {
  reply: string;
  patches: RefinePatch[];
}

export type PublishJobStatus =
  | 'queued'
  | 'logging-in'
  | 'creating-set'
  | 'importing'
  | 'saving'
  | 'done'
  | 'failed';

export interface PublishJobProgress {
  jobId: string;
  status: PublishJobStatus;
  queuePosition?: number;
  message?: string;
  url?: string;
  error?: string;
}
