import React from 'react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { useQuizStore } from '../../state/useQuizStore.js';
import { QuestionCard } from './QuestionCard.js';
import { Plus, HelpCircle } from 'lucide-react';
import { validateQuestion } from '@quizgenerator/shared';

export const EditorCardList: React.FC = () => {
  const {
    questions,
    filterMode,
    addQuestion,
    updateQuestion,
    duplicateQuestion,
    deleteQuestion,
    reorderQuestions,
  } = useQuizStore();

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 5,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      reorderQuestions(String(active.id), String(over.id));
    }
  };

  // Filter questions
  const displayedQuestions = questions.filter((q) => {
    if (filterMode === 'aiGuessed') return q.aiGuessed;
    if (filterMode === 'errors') return validateQuestion(q).length > 0;
    return true;
  });

  return (
    <div className="p-4 space-y-4 max-w-4xl mx-auto pb-24">
      {displayedQuestions.length === 0 ? (
        <div className="text-center py-16 px-4 bg-slate-800/40 rounded-2xl border border-dashed border-slate-700/80 space-y-3">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-slate-800 text-slate-400">
            <HelpCircle className="w-6 h-6" />
          </div>
          <h3 className="text-base font-semibold text-slate-200">
            {filterMode === 'all'
              ? 'No questions yet'
              : filterMode === 'aiGuessed'
              ? 'No AI-guessed questions found'
              : 'No questions with errors! Everything looks good.'}
          </h3>
          <p className="text-xs text-slate-400 max-w-md mx-auto">
            {filterMode === 'all'
              ? 'Upload a document in the chat panel on the left or click below to start creating questions manually.'
              : 'Switch filter back to "All" to see all questions.'}
          </p>
          {filterMode === 'all' && (
            <button
              onClick={() => addQuestion('mc')}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow-md transition-colors"
            >
              <Plus className="w-4 h-4" />
              <span>Add First Question</span>
            </button>
          )}
        </div>
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={displayedQuestions.map((q) => q.id)}
            strategy={verticalListSortingStrategy}
          >
            <div className="space-y-3.5">
              {displayedQuestions.map((q) => (
                <QuestionCard
                  key={q.id}
                  question={q}
                  index={questions.findIndex((item) => item.id === q.id)}
                  onUpdate={(updates) => updateQuestion(q.id, updates)}
                  onDuplicate={() => duplicateQuestion(q.id)}
                  onDelete={() => deleteQuestion(q.id)}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}

      {/* Add Question Button */}
      {displayedQuestions.length > 0 && (
        <div className="flex items-center justify-center gap-2 pt-2">
          <button
            onClick={() => addQuestion('mc')}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white border border-slate-700/80 font-semibold text-xs shadow-sm transition-all hover:scale-[1.01]"
          >
            <Plus className="w-4 h-4 text-indigo-400" />
            <span>Add Multiple Choice</span>
          </button>
          <button
            onClick={() => addQuestion('typing')}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white border border-slate-700/80 font-semibold text-xs shadow-sm transition-all hover:scale-[1.01]"
          >
            <Plus className="w-4 h-4 text-amber-400" />
            <span>Add Typing Question</span>
          </button>
        </div>
      )}
    </div>
  );
};
