import React, { useState } from 'react';
import { useQuizStore } from '../../state/useQuizStore.js';
import type { QuestionType } from '@quizgenerator/shared';
import { Trash2, Copy, Plus, Sparkles, CheckSquare, Square } from 'lucide-react';

export const EditorTableView: React.FC = () => {
  const {
    questions,
    filterMode,
    updateQuestion,
    deleteQuestion,
    duplicateQuestion,
    addQuestion,
  } = useQuizStore();

  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [bulkTime, setBulkTime] = useState<number>(20);

  const displayedQuestions = questions.filter((q) => {
    if (filterMode === 'aiGuessed') return q.aiGuessed;
    return true;
  });

  const handleSelectAll = () => {
    if (selectedIds.length === displayedQuestions.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(displayedQuestions.map((q) => q.id));
    }
  };

  const handleToggleSelect = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const handleBulkDelete = () => {
    for (const id of selectedIds) {
      deleteQuestion(id);
    }
    setSelectedIds([]);
  };

  const handleBulkSetTime = () => {
    for (const id of selectedIds) {
      updateQuestion(id, { timeLimit: bulkTime });
    }
  };

  return (
    <div className="p-4 space-y-3 pb-24">
      {/* Bulk Action Bar */}
      {selectedIds.length > 0 && (
        <div className="flex items-center justify-between bg-indigo-950/80 border border-indigo-700/80 rounded-xl px-4 py-2.5 text-xs text-indigo-200">
          <div className="flex items-center gap-2">
            <span className="font-bold text-white">{selectedIds.length}</span>
            <span>questions selected</span>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5 bg-slate-900/80 px-2 py-1 rounded-md border border-slate-700">
              <span>Set Time:</span>
              <input
                type="number"
                min={1}
                max={300}
                value={bulkTime}
                onChange={(e) => setBulkTime(Math.max(1, Math.min(300, parseInt(e.target.value) || 20)))}
                className="w-10 bg-transparent text-center font-bold text-white focus:outline-none"
              />
              <button
                onClick={handleBulkSetTime}
                className="px-2 py-0.5 rounded bg-indigo-600 hover:bg-indigo-500 text-white font-medium text-[11px]"
              >
                Apply
              </button>
            </div>

            <button
              onClick={handleBulkDelete}
              className="flex items-center gap-1 px-3 py-1 rounded-md bg-rose-600 hover:bg-rose-500 text-white font-semibold"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Delete</span>
            </button>
          </div>
        </div>
      )}

      {/* Grid Table */}
      <div className="overflow-x-auto rounded-xl border border-slate-700/80 bg-slate-900/80 shadow-md">
        <table className="w-full text-left text-xs border-collapse">
          <thead>
            <tr className="bg-slate-800/90 text-slate-300 border-b border-slate-700 font-semibold select-none">
              <th className="p-2.5 w-10 text-center">
                <button
                  onClick={handleSelectAll}
                  className="text-slate-400 hover:text-white"
                >
                  {selectedIds.length === displayedQuestions.length &&
                  displayedQuestions.length > 0 ? (
                    <CheckSquare className="w-4 h-4 text-indigo-400" />
                  ) : (
                    <Square className="w-4 h-4" />
                  )}
                </button>
              </th>
              <th className="p-2.5 w-12 text-center">#</th>
              <th className="p-2.5 w-24">Type</th>
              <th className="p-2.5 min-w-[220px]">Question Text</th>
              <th className="p-2.5 min-w-[140px]">Ans 1</th>
              <th className="p-2.5 min-w-[140px]">Ans 2</th>
              <th className="p-2.5 min-w-[120px]">Ans 3</th>
              <th className="p-2.5 min-w-[120px]">Ans 4</th>
              <th className="p-2.5 w-16 text-center">Correct</th>
              <th className="p-2.5 w-16 text-center">Time</th>
              <th className="p-2.5 w-10 text-center">⚠️</th>
              <th className="p-2.5 w-16 text-center">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800">
            {displayedQuestions.map((q, idx) => {
              const isSelected = selectedIds.includes(q.id);
              const correctStr = q.correct.map((c) => c + 1).join(',');

              return (
                <tr
                  key={q.id}
                  className={`hover:bg-slate-800/50 transition-colors ${
                    isSelected ? 'bg-indigo-950/30' : ''
                  }`}
                >
                  {/* Select Checkbox */}
                  <td className="p-2 text-center">
                    <button
                      onClick={() => handleToggleSelect(q.id)}
                      className="text-slate-500 hover:text-white"
                    >
                      {isSelected ? (
                        <CheckSquare className="w-4 h-4 text-indigo-400" />
                      ) : (
                        <Square className="w-4 h-4" />
                      )}
                    </button>
                  </td>

                  {/* Index */}
                  <td className="p-2 text-center font-bold text-slate-400">
                    {idx + 1}
                  </td>

                  {/* Type */}
                  <td className="p-1.5">
                    <select
                      value={q.type}
                      onChange={(e) =>
                        updateQuestion(q.id, {
                          type: e.target.value as QuestionType,
                        })
                      }
                      className="w-full bg-slate-800 border border-slate-700 text-slate-200 rounded px-1.5 py-1 text-[11px] focus:outline-none focus:border-indigo-500"
                    >
                      <option value="mc">MC</option>
                      <option value="typing">Typing</option>
                    </select>
                  </td>

                  {/* Question Text */}
                  <td className="p-1.5">
                    <input
                      type="text"
                      value={q.text}
                      onChange={(e) =>
                        updateQuestion(q.id, { text: e.target.value })
                      }
                      className="w-full bg-slate-800/80 border border-slate-700/60 rounded px-2 py-1 text-slate-100 focus:outline-none focus:border-indigo-500"
                    />
                  </td>

                  {/* Answers 1 to 4 */}
                  {[0, 1, 2, 3].map((ansIdx) => (
                    <td key={ansIdx} className="p-1.5">
                      <input
                        type="text"
                        value={q.answers[ansIdx] || ''}
                        onChange={(e) => {
                          const nextAnswers = [...q.answers];
                          nextAnswers[ansIdx] = e.target.value;
                          updateQuestion(q.id, { answers: nextAnswers.filter(Boolean) });
                        }}
                        placeholder={`Ans ${ansIdx + 1}`}
                        className="w-full bg-slate-800/80 border border-slate-700/60 rounded px-2 py-1 text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-indigo-500"
                      />
                    </td>
                  ))}

                  {/* Correct Answers input (comma separated) */}
                  <td className="p-1.5 text-center">
                    <input
                      type="text"
                      value={correctStr}
                      onChange={(e) => {
                        const parsed = e.target.value
                          .split(',')
                          .map((s) => parseInt(s.trim()) - 1)
                          .filter((n) => !isNaN(n) && n >= 0);
                        updateQuestion(q.id, {
                          correct: parsed.length > 0 ? parsed : [0],
                        });
                      }}
                      title="1-based index (e.g. 1 or 1,4)"
                      className="w-12 text-center bg-slate-800 border border-slate-700 rounded px-1 py-1 font-mono text-emerald-400 focus:outline-none"
                    />
                  </td>

                  {/* Time limit */}
                  <td className="p-1.5 text-center">
                    <input
                      type="number"
                      min={1}
                      max={300}
                      value={q.timeLimit}
                      onChange={(e) =>
                        updateQuestion(q.id, {
                          timeLimit: Math.max(
                            1,
                            Math.min(300, parseInt(e.target.value) || 20)
                          ),
                        })
                      }
                      className="w-12 text-center bg-slate-800 border border-slate-700 rounded px-1 py-1 font-mono text-slate-300 focus:outline-none"
                    />
                  </td>

                  {/* AI Guessed Flag */}
                  <td className="p-1.5 text-center">
                    <button
                      onClick={() =>
                        updateQuestion(q.id, { aiGuessed: !q.aiGuessed })
                      }
                      className={`p-1 rounded ${
                        q.aiGuessed
                          ? 'text-amber-400 bg-amber-950/60'
                          : 'text-slate-600 hover:text-slate-400'
                      }`}
                      title="Toggle AI Guessed"
                    >
                      <Sparkles className="w-3.5 h-3.5" />
                    </button>
                  </td>

                  {/* Actions */}
                  <td className="p-1.5 text-center">
                    <div className="flex items-center justify-center gap-1">
                      <button
                        onClick={() => duplicateQuestion(q.id)}
                        className="p-1 text-slate-400 hover:text-white"
                        title="Duplicate"
                      >
                        <Copy className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => deleteQuestion(q.id)}
                        className="p-1 text-slate-400 hover:text-rose-400"
                        title="Delete"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Add Row Button */}
      <div className="flex justify-start">
        <button
          onClick={() => addQuestion('mc')}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold border border-slate-700 transition-colors"
        >
          <Plus className="w-3.5 h-3.5 text-indigo-400" />
          <span>Add Row</span>
        </button>
      </div>
    </div>
  );
};
