import React from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { Question, QuestionType } from '@quizgenerator/shared';
import { MAX_Q_LEN, MAX_A_LEN, validateQuestion } from '@quizgenerator/shared';
import {
  GripVertical,
  Copy,
  Trash2,
  AlertTriangle,
  Clock,
  CheckCircle2,
  Circle,
  Plus,
  X,
  Sparkles,
} from 'lucide-react';

interface QuestionCardProps {
  question: Question;
  index: number;
  onUpdate: (updates: Partial<Question>) => void;
  onDuplicate: () => void;
  onDelete: () => void;
}

const ANSWER_COLORS = [
  {
    bg: 'bg-red-950/60 hover:bg-red-950/80',
    border: 'border-red-700/60 focus-within:border-red-400',
    badge: 'bg-red-600',
    label: 'Red',
  },
  {
    bg: 'bg-blue-950/60 hover:bg-blue-950/80',
    border: 'border-blue-700/60 focus-within:border-blue-400',
    badge: 'bg-blue-600',
    label: 'Blue',
  },
  {
    bg: 'bg-amber-950/60 hover:bg-amber-950/80',
    border: 'border-amber-700/60 focus-within:border-amber-400',
    badge: 'bg-amber-600',
    label: 'Amber',
  },
  {
    bg: 'bg-emerald-950/60 hover:bg-emerald-950/80',
    border: 'border-emerald-700/60 focus-within:border-emerald-400',
    badge: 'bg-emerald-600',
    label: 'Green',
  },
];

export const QuestionCard: React.FC<QuestionCardProps> = ({
  question,
  index,
  onUpdate,
  onDuplicate,
  onDelete,
}) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: question.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const errors = validateQuestion(question);
  const hasErrors = errors.length > 0;

  const handleToggleCorrect = (ansIndex: number) => {
    let nextCorrect = [...question.correct];
    if (nextCorrect.includes(ansIndex)) {
      if (nextCorrect.length > 1) {
        nextCorrect = nextCorrect.filter((i) => i !== ansIndex);
      }
    } else {
      nextCorrect.push(ansIndex);
      nextCorrect.sort((a, b) => a - b);
    }
    onUpdate({ correct: nextCorrect });
  };

  const handleAnswerTextChange = (ansIndex: number, text: string) => {
    const nextAnswers = [...question.answers];
    nextAnswers[ansIndex] = text;
    onUpdate({ answers: nextAnswers });
  };

  const handleAddAnswer = () => {
    if (question.answers.length < 4) {
      onUpdate({ answers: [...question.answers, ''] });
    }
  };

  const handleRemoveAnswer = (ansIndex: number) => {
    if (question.answers.length <= 2 && question.type === 'mc') return;
    if (question.answers.length <= 1 && question.type === 'typing') return;

    const nextAnswers = question.answers.filter((_, i) => i !== ansIndex);
    // Shift correct indices
    const nextCorrect = question.correct
      .filter((i) => i !== ansIndex)
      .map((i) => (i > ansIndex ? i - 1 : i));

    onUpdate({
      answers: nextAnswers,
      correct: nextCorrect.length > 0 ? nextCorrect : [0],
    });
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`rounded-xl border transition-all ${
        isDragging ? 'opacity-40 shadow-2xl scale-[1.01] z-30' : 'opacity-100'
      } ${
        hasErrors
          ? 'bg-slate-900/90 border-rose-600/70 shadow-rose-950/20'
          : 'bg-slate-800/80 border-slate-700/80 hover:border-slate-600/90'
      } shadow-md overflow-hidden p-4 space-y-3.5`}
    >
      {/* Top Bar: Drag, Number, Type, Time, AI Guessed, Actions */}
      <div className="flex items-center justify-between gap-2 border-b border-slate-700/60 pb-2.5">
        <div className="flex items-center gap-2">
          {/* Drag Handle */}
          <button
            {...attributes}
            {...listeners}
            className="cursor-grab active:cursor-grabbing text-slate-500 hover:text-slate-300 p-0.5 rounded transition-colors"
            title="Drag to reorder"
          >
            <GripVertical className="w-4 h-4" />
          </button>

          {/* Question Index Badge */}
          <span className="flex items-center justify-center w-6 h-6 rounded-full bg-slate-700 text-white font-bold text-xs">
            {index + 1}
          </span>

          {/* Question Type Selector */}
          <select
            value={question.type}
            onChange={(e) => {
              const newType = e.target.value as QuestionType;
              onUpdate({
                type: newType,
                answers: newType === 'typing' ? [question.answers[0] || ''] : (question.answers.length < 2 ? [...question.answers, ''] : question.answers),
                correct: [0],
              });
            }}
            className="bg-slate-900/90 text-xs font-semibold text-slate-200 border border-slate-700 rounded-md px-2 py-1 focus:outline-none focus:border-indigo-500"
          >
            <option value="mc">Multiple Choice</option>
            <option value="typing">Typing Answer</option>
          </select>

          {/* Time Limit Input */}
          <div className="flex items-center gap-1 bg-slate-900/80 px-2 py-0.5 rounded-md border border-slate-700 text-xs text-slate-300">
            <Clock className="w-3 h-3 text-slate-400" />
            <input
              type="number"
              min={1}
              max={300}
              value={question.timeLimit}
              onChange={(e) =>
                onUpdate({
                  timeLimit: Math.max(1, Math.min(300, parseInt(e.target.value) || 20)),
                })
              }
              className="w-10 bg-transparent text-center font-semibold text-white focus:outline-none"
            />
            <span className="text-slate-500 text-[10px]">sec</span>
          </div>

          {/* AI-Guessed Badge Toggle */}
          <button
            onClick={() => onUpdate({ aiGuessed: !question.aiGuessed })}
            title="Toggle AI-guessed flag (helps mark answers generated or inferred by AI)"
            className={`flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full border transition-colors ${
              question.aiGuessed
                ? 'bg-amber-950/60 border-amber-600/80 text-amber-300'
                : 'bg-slate-900/60 border-slate-700 text-slate-400 hover:text-slate-300'
            }`}
          >
            <Sparkles className="w-3 h-3 text-amber-400" />
            <span>AI Guessed</span>
          </button>
        </div>

        {/* Right Action Icons */}
        <div className="flex items-center gap-1">
          {question.sourceRef && (
            <span
              className="text-[10px] text-slate-400 bg-slate-900/80 px-2 py-0.5 rounded border border-slate-700/60 max-w-[140px] truncate"
              title={question.sourceRef}
            >
              Ref: {question.sourceRef}
            </span>
          )}

          <button
            onClick={onDuplicate}
            className="p-1 rounded text-slate-400 hover:text-slate-200 hover:bg-slate-700/60 transition-colors"
            title="Duplicate question"
          >
            <Copy className="w-3.5 h-3.5" />
          </button>

          <button
            onClick={onDelete}
            className="p-1 rounded text-slate-400 hover:text-rose-400 hover:bg-rose-950/30 transition-colors"
            title="Delete question"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Question Text Box */}
      <div className="space-y-1">
        <div className="flex items-center justify-between text-[11px] text-slate-400">
          <label className="font-medium">Question Text</label>
          <span
            className={
              question.text.length > MAX_Q_LEN ? 'text-rose-400 font-bold' : ''
            }
          >
            {question.text.length}/{MAX_Q_LEN}
          </span>
        </div>
        <textarea
          rows={2}
          value={question.text}
          onChange={(e) => onUpdate({ text: e.target.value })}
          placeholder="Enter question text here..."
          className="w-full bg-slate-900/90 text-sm text-slate-100 rounded-lg p-2.5 border border-slate-700/80 focus:border-indigo-500 focus:outline-none placeholder:text-slate-500 transition-colors"
        />
      </div>

      {/* Answers Section */}
      {question.type === 'mc' ? (
        <div className="space-y-2">
          <div className="flex items-center justify-between text-[11px] text-slate-400">
            <span>Answer Options (click circle to mark correct, multiple allowed):</span>
            {question.answers.length < 4 && (
              <button
                onClick={handleAddAnswer}
                className="flex items-center gap-1 text-indigo-400 hover:text-indigo-300 font-medium transition-colors"
              >
                <Plus className="w-3 h-3" />
                <span>Add answer ({question.answers.length}/4)</span>
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {question.answers.map((answer, ansIdx) => {
              const isCorrect = question.correct.includes(ansIdx);
              const colorConfig = ANSWER_COLORS[ansIdx] || ANSWER_COLORS[0];

              return (
                <div
                  key={ansIdx}
                  className={`flex items-center gap-2 rounded-lg border p-2 transition-all ${colorConfig.bg} ${colorConfig.border} ${
                    isCorrect ? 'ring-2 ring-emerald-500/80 shadow-md' : ''
                  }`}
                >
                  {/* Correct Toggle Button */}
                  <button
                    type="button"
                    onClick={() => handleToggleCorrect(ansIdx)}
                    className="shrink-0 p-0.5 rounded transition-transform active:scale-90"
                    title={isCorrect ? 'Correct answer (click to unmark)' : 'Mark as correct answer'}
                  >
                    {isCorrect ? (
                      <CheckCircle2 className="w-5 h-5 text-emerald-400 fill-emerald-950" />
                    ) : (
                      <Circle className="w-5 h-5 text-slate-500 hover:text-slate-300" />
                    )}
                  </button>

                  {/* Answer Input */}
                  <div className="flex-1 min-w-0">
                    <input
                      type="text"
                      value={answer}
                      maxLength={MAX_A_LEN}
                      onChange={(e) => handleAnswerTextChange(ansIdx, e.target.value)}
                      placeholder={`Answer ${ansIdx + 1}...`}
                      className="w-full bg-transparent text-xs text-white placeholder:text-slate-500 focus:outline-none"
                    />
                  </div>

                  {/* Remove Answer Option */}
                  {question.answers.length > 2 && (
                    <button
                      type="button"
                      onClick={() => handleRemoveAnswer(ansIdx)}
                      className="shrink-0 text-slate-500 hover:text-rose-400 p-0.5 transition-colors"
                      title="Remove this answer choice"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        /* Typing Answer Type */
        <div className="space-y-2 bg-slate-900/60 p-3 rounded-lg border border-slate-700/60">
          <div className="flex items-center justify-between text-[11px] text-slate-400">
            <span>Accepted Answers (exact match variations):</span>
            {question.answers.length < 4 && (
              <button
                onClick={handleAddAnswer}
                className="flex items-center gap-1 text-indigo-400 hover:text-indigo-300 font-medium transition-colors"
              >
                <Plus className="w-3 h-3" />
                <span>Add variation</span>
              </button>
            )}
          </div>

          <div className="space-y-1.5">
            {question.answers.map((ans, ansIdx) => (
              <div key={ansIdx} className="flex items-center gap-2">
                <span className="text-[11px] text-slate-500 font-mono w-4">
                  #{ansIdx + 1}
                </span>
                <input
                  type="text"
                  value={ans}
                  maxLength={MAX_A_LEN}
                  onChange={(e) => handleAnswerTextChange(ansIdx, e.target.value)}
                  placeholder="e.g. Photosynthesis"
                  className="flex-1 bg-slate-800 text-xs text-white rounded px-2.5 py-1.5 border border-slate-700 focus:border-indigo-500 focus:outline-none"
                />
                {question.answers.length > 1 && (
                  <button
                    type="button"
                    onClick={() => handleRemoveAnswer(ansIdx)}
                    className="text-slate-500 hover:text-rose-400 p-1 transition-colors"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Error alert messages */}
      {hasErrors && (
        <div className="bg-rose-950/50 border border-rose-800/80 rounded-lg p-2 text-xs text-rose-300 space-y-0.5">
          {errors.map((err, errIdx) => (
            <div key={errIdx} className="flex items-center gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5 text-rose-400 shrink-0" />
              <span>{err.message}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
