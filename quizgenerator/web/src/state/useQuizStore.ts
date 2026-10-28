import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type {
  Question,
  QuestionType,
  QuizHistoryItem,
  RefinePatch,
} from '@quizgenerator/shared';

export interface ChatMessage {
  id: string;
  sender: 'user' | 'assistant';
  text: string;
  timestamp: number;
  stats?: {
    total: number;
    aiGuessed: number;
    errors: number;
  };
}

export type ViewMode = 'cards' | 'table';
export type FilterMode = 'all' | 'aiGuessed' | 'errors';
export type MobileTab = 'chat' | 'editor';

interface QuizState {
  // Quiz data
  title: string;
  description: string;
  defaultTime: number;
  questions: Question[];
  history: QuizHistoryItem[];

  // Undo history for refine/patch operations
  undoStack: Question[][];

  // UI state
  viewMode: ViewMode;
  filterMode: FilterMode;
  mobileTab: MobileTab;

  // Chat state
  messages: ChatMessage[];
  isStreaming: boolean;
  streamingStatus: string;

  // Actions
  setTitle: (title: string) => void;
  setDescription: (description: string) => void;
  setDefaultTime: (time: number, applyToAll?: boolean) => void;
  setQuestions: (questions: Question[], recordHistory?: boolean) => void;
  addQuestion: (type?: QuestionType) => void;
  updateQuestion: (id: string, updates: Partial<Question>) => void;
  deleteQuestion: (id: string) => void;
  duplicateQuestion: (id: string) => void;
  reorderQuestions: (activeId: string, overId: string) => void;
  applyPatches: (patches: RefinePatch[]) => void;
  undo: () => void;
  setViewMode: (mode: ViewMode) => void;
  setFilterMode: (mode: FilterMode) => void;
  setMobileTab: (tab: MobileTab) => void;
  addChatMessage: (msg: Omit<ChatMessage, 'id' | 'timestamp'>) => void;
  setIsStreaming: (val: boolean, status?: string) => void;
  addHistoryItem: (item: { title: string; url: string; questionCount: number }) => void;
  loadSampleQuestions: () => void;
  clearAll: () => void;
}

const SAMPLE_QUESTIONS: Question[] = [
  {
    id: 'sample-1',
    type: 'mc',
    text: 'What is the capital of Vietnam?',
    answers: ['Hanoi', 'Ho Chi Minh City', 'Da Nang', 'Hue'],
    correct: [0],
    timeLimit: 20,
    aiGuessed: false,
    sourceRef: 'Sample Deck #1',
  },
  {
    id: 'sample-2',
    type: 'mc',
    text: 'Which planet is known as the Red Planet?',
    answers: ['Venus', 'Mars', 'Jupiter', 'Saturn'],
    correct: [1],
    timeLimit: 20,
    aiGuessed: true,
    sourceRef: 'Sample Deck #2',
  },
  {
    id: 'sample-3',
    type: 'typing',
    text: 'What is the process by which plants make their food?',
    answers: ['Photosynthesis', 'photosynthesis'],
    correct: [0, 1],
    timeLimit: 30,
    aiGuessed: false,
    sourceRef: 'Sample Deck #3',
  },
];

export const useQuizStore = create<QuizState>()(
  persist(
    (set, get) => ({
      title: 'My Blooket Quiz',
      description: 'Created with Quiz Generator',
      defaultTime: 20,
      questions: SAMPLE_QUESTIONS,
      history: [],
      undoStack: [],

      viewMode: 'cards',
      filterMode: 'all',
      mobileTab: 'editor',

      messages: [
        {
          id: 'welcome',
          sender: 'assistant',
          text: 'Welcome to Quiz Generator! Upload a document (PDF, DOCX, XLSX, TXT, or Image) or type a prompt to generate interactive questions. You can also edit questions on the right and download CSV or publish directly to Blooket.',
          timestamp: Date.now(),
        },
      ],
      isStreaming: false,
      streamingStatus: '',

      setTitle: (title) => set({ title }),
      setDescription: (description) => set({ description }),

      setDefaultTime: (time, applyToAll = false) => {
        set((state) => ({
          defaultTime: time,
          questions: applyToAll
            ? state.questions.map((q) => ({ ...q, timeLimit: time }))
            : state.questions,
        }));
      },

      setQuestions: (questions, recordHistory = true) => {
        set((state) => ({
          undoStack: recordHistory
            ? [...state.undoStack.slice(-10), state.questions]
            : state.undoStack,
          questions,
        }));
      },

      addQuestion: (type = 'mc') => {
        const newQ: Question = {
          id: `q_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
          type,
          text: '',
          answers: type === 'mc' ? ['', ''] : [''],
          correct: [0],
          timeLimit: get().defaultTime || 20,
          aiGuessed: false,
        };
        set((state) => ({
          questions: [...state.questions, newQ],
        }));
      },

      updateQuestion: (id, updates) => {
        set((state) => ({
          questions: state.questions.map((q) => (q.id === id ? { ...q, ...updates } : q)),
        }));
      },

      deleteQuestion: (id) => {
        set((state) => ({
          undoStack: [...state.undoStack.slice(-10), state.questions],
          questions: state.questions.filter((q) => q.id !== id),
        }));
      },

      duplicateQuestion: (id) => {
        const q = get().questions.find((item) => item.id === id);
        if (!q) return;
        const duplicated: Question = {
          ...q,
          id: `q_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
          text: `${q.text} (Copy)`,
        };
        const index = get().questions.findIndex((item) => item.id === id);
        const newQuestions = [...get().questions];
        newQuestions.splice(index + 1, 0, duplicated);
        set({ questions: newQuestions });
      },

      reorderQuestions: (activeId, overId) => {
        const items = [...get().questions];
        const oldIndex = items.findIndex((item) => item.id === activeId);
        const newIndex = items.findIndex((item) => item.id === overId);
        if (oldIndex === -1 || newIndex === -1 || oldIndex === newIndex) return;

        const [moved] = items.splice(oldIndex, 1);
        items.splice(newIndex, 0, moved);
        set({ questions: items });
      },

      applyPatches: (patches) => {
        const current = [...get().questions];
        const nextStack = [...get().undoStack.slice(-10), current];
        let updated = [...current];

        for (const patch of patches) {
          if (patch.op === 'delete' && patch.id) {
            updated = updated.filter((q) => q.id !== patch.id);
          } else if (patch.op === 'update' && patch.id && patch.fields) {
            updated = updated.map((q) =>
              q.id === patch.id ? { ...q, ...patch.fields } : q
            );
          } else if (patch.op === 'add' && patch.question) {
            updated.push(patch.question);
          }
        }

        set({
          undoStack: nextStack,
          questions: updated,
        });
      },

      undo: () => {
        const { undoStack } = get();
        if (undoStack.length === 0) return;
        const previous = undoStack[undoStack.length - 1];
        set({
          questions: previous,
          undoStack: undoStack.slice(0, -1),
        });
      },

      setViewMode: (viewMode) => set({ viewMode }),
      setFilterMode: (filterMode) => set({ filterMode }),
      setMobileTab: (mobileTab) => set({ mobileTab }),

      addChatMessage: (msg) => {
        const fullMsg: ChatMessage = {
          ...msg,
          id: `msg_${Date.now()}`,
          timestamp: Date.now(),
        };
        set((state) => ({
          messages: [...state.messages, fullMsg],
        }));
      },

      setIsStreaming: (isStreaming, streamingStatus = '') => {
        set({ isStreaming, streamingStatus });
      },

      addHistoryItem: (item) => {
        const historyItem: QuizHistoryItem = {
          id: `hist_${Date.now()}`,
          title: item.title,
          url: item.url,
          questionCount: item.questionCount,
          createdAt: new Date().toISOString(),
        };
        set((state) => ({
          history: [historyItem, ...state.history.slice(0, 49)],
        }));
      },

      loadSampleQuestions: () => {
        set({
          title: 'General Knowledge Trivia',
          description: 'A fun quiz created with Quiz Generator',
          defaultTime: 20,
          questions: SAMPLE_QUESTIONS,
        });
      },

      clearAll: () => {
        set((state) => ({
          undoStack: [...state.undoStack.slice(-10), state.questions],
          questions: [],
        }));
      },
    }),
    {
      name: 'quiz_generator_draft_storage',
      partialize: (state) => ({
        title: state.title,
        description: state.description,
        defaultTime: state.defaultTime,
        questions: state.questions,
        history: state.history,
      }),
    }
  )
);
