import React, { useEffect, useState } from 'react';
import { useQuizStore } from '../../state/useQuizStore.js';
import {
  Download,
  UploadCloud,
  LayoutGrid,
  Table as TableIcon,
  AlertTriangle,
  History,
  RotateCcw,
  Clock,
  Sparkles,
  CircleCheck,
  CirclePause,
} from 'lucide-react';
import { buildBlooketCsv, validateQuizDraft, type Question } from '@quizgenerator/shared';
import saveAs from 'file-saver';

interface EditorHeaderProps {
  onOpenPublish: () => void;
  onOpenHistory: () => void;
}

export const EditorHeader: React.FC<EditorHeaderProps> = ({
  onOpenPublish,
  onOpenHistory,
}) => {
  const {
    title,
    description,
    defaultTime,
    questions,
    history,
    undoStack,
    viewMode,
    filterMode,
    setTitle,
    setDescription,
    setDefaultTime,
    setViewMode,
    setFilterMode,
    setQuestions,
    undo,
  } = useQuizStore();

  // Whether the server can publish to Blooket right now (null = not known yet).
  const [publishAvailable, setPublishAvailable] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/status')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!cancelled && data) setPublishAvailable(Boolean(data.publishAvailable));
      })
      .catch(() => {
        // Unknown status: keep Publish enabled, the modal reports any failure.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Validation
  const validation = validateQuizDraft({
    title,
    description,
    defaultTime,
    questions,
    history,
  });

  const aiGuessedCount = questions.filter((q: Question) => q.aiGuessed).length;
  const errorCount = Object.keys(validation.questionErrors).length;

  const [isApplyingTime, setIsApplyingTime] = useState(false);

  const handleDownloadCsv = () => {
    const csvContent = buildBlooketCsv(questions);
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const filename = `${title.trim() ? title.toLowerCase().replace(/[^a-z0-9_-]/g, '_') : 'quiz'}_blooket.csv`;
    saveAs(blob, filename);
  };

  const handleApplyTimeToAll = () => {
    setDefaultTime(defaultTime, true);
    setIsApplyingTime(true);
    setTimeout(() => setIsApplyingTime(false), 1500);
  };

  const handleNewSession = () => {
    // Clear all quiz state for a fresh quiz (the Blooket login is server-side).
    setTitle('');
    setDescription('');
    setDefaultTime(20);
    setQuestions([], false);
  };

  return (
    <div className="bg-slate-800/90 backdrop-blur-md border-b border-slate-700/60 p-4 sticky top-0 z-20 space-y-3">
      {/* Top Row: Title, Description, Actions */}

      {/* Session Status Display */}
      <div className="flex items-center gap-3 text-xs">
        {publishAvailable === false ? (
          <span className="flex items-center gap-1 text-amber-400" title="Download the CSV and import it in Blooket instead">
            <CirclePause className="w-3.5 h-3.5" /> Blooket publishing paused
          </span>
        ) : publishAvailable ? (
          <span className="flex items-center gap-1 text-emerald-400">
            <CircleCheck className="w-3.5 h-3.5" /> Blooket publishing ready
          </span>
        ) : null}
        <button
  onClick={handleNewSession}
  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-[10px] font-medium transition-all shadow-md hover:shadow-indigo-500/25 active:scale-95"
  title="Clear the editor and start a new quiz">
  <RotateCcw className="w-3.5 h-3.5 opacity-70" />
  <span>New Quiz</span>
</button>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex-1 min-w-[240px]">
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Quiz Title (e.g. Science Chapter 4)..."
            className="w-full text-lg font-bold bg-transparent text-white border-b border-transparent hover:border-slate-600 focus:border-indigo-500 focus:outline-none transition-colors px-1 py-0.5 placeholder:text-slate-500"
          />
          <input
            type="text"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Add brief description..."
            className="w-full text-xs text-slate-400 bg-transparent border-b border-transparent hover:border-slate-700 focus:border-indigo-500 focus:outline-none px-1 py-0.5 placeholder:text-slate-600"
          />
        </div>

        <div className="flex items-center gap-2">
          {undoStack.length > 0 && (
            <button
              onClick={undo}
              title="Undo last change"
              className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg bg-slate-700/80 hover:bg-slate-700 text-slate-300 transition-colors"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Undo</span>
            </button>
          )}

          <button
            onClick={onOpenHistory}
            title="Recent Blooket links"
            className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg bg-slate-700/80 hover:bg-slate-700 text-slate-200 transition-colors"
          >
            <History className="w-3.5 h-3.5 text-indigo-400" />
            <span className="hidden sm:inline">Recent</span>
            {history.length > 0 && (
              <span className="bg-indigo-600 text-white rounded-full px-1.5 py-0.2 text-[10px] font-semibold">
                {history.length}
              </span>
            )}
          </button>

          <button
            onClick={handleDownloadCsv}
            disabled={questions.length === 0}
            className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg bg-slate-700 hover:bg-slate-600 text-white disabled:opacity-50 transition-colors shadow-sm"
          >
            <Download className="w-3.5 h-3.5 text-emerald-400" />
            <span>Download CSV</span>
          </button>

          <button
            onClick={onOpenPublish}
            disabled={questions.length === 0 || !validation.isValid || publishAvailable === false}
            title={
              publishAvailable === false
                ? 'Publishing is paused — use Download CSV'
                : !validation.isValid
                  ? 'Fix errors before publishing'
                  : 'Publish to Blooket'
            }
            className="flex items-center gap-1.5 text-xs font-bold px-3.5 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-700 disabled:opacity-50 text-white transition-all shadow-md hover:shadow-indigo-500/25 active:scale-95"
          >
            <UploadCloud className="w-4 h-4" />
            <span>Publish to Blooket</span>
          </button>
        </div>
      </div>

      {/* Bottom Controls Row: View Switch, Filter, Time limit */}
      <div className="flex flex-wrap items-center justify-between gap-3 text-xs pt-1 border-t border-slate-700/40">
        {/* Left: View Mode Toggle & Filter Switcher */}
        <div className="flex items-center gap-2">
          {/* View Mode (Cards vs Table) */}
          <div className="flex items-center bg-slate-900/90 rounded-lg p-0.5 border border-slate-700/70">
            <button
              onClick={() => setViewMode('cards')}
              className={`flex items-center gap-1 px-2.5 py-1 rounded-md transition-colors ${viewMode === 'cards' ? 'bg-indigo-600 text-white font-medium shadow-xs' : 'text-slate-400 hover:text-white'}`}
            >
              <LayoutGrid className="w-3.5 h-3.5" />
              <span>Cards</span>
            </button>
            <button
              onClick={() => setViewMode('table')}
              className={`flex items-center gap-1 px-2.5 py-1 rounded-md transition-colors ${viewMode === 'table' ? 'bg-indigo-600 text-white font-medium shadow-xs' : 'text-slate-400 hover:text-white'}`}
            >
              <TableIcon className="w-3.5 h-3.5" />
              <span>Table</span>
            </button>
          </div>

          {/* Filter: All | AI Guessed | Errors */}
          <div className="flex items-center bg-slate-900/80 rounded-lg p-0.5 border border-slate-700/60">
            <button
              onClick={() => setFilterMode('all')}
              className={`px-2 py-1 rounded-md transition-colors ${filterMode === 'all' ? 'bg-slate-700 text-white font-semibold' : 'text-slate-400 hover:text-slate-200'}`}
            >
              All ({questions.length})
            </button>
            <button
              onClick={() => setFilterMode('aiGuessed')}
              className={`flex items-center gap-1 px-2 py-1 rounded-md transition-colors ${filterMode === 'aiGuessed' ? 'bg-amber-600/40 text-amber-300 font-semibold border border-amber-500/50' : 'text-slate-400 hover:text-amber-300'}`}
            >
              <Sparkles className="w-3 h-3 text-amber-400" />
              <span>AI-guessed ({aiGuessedCount})</span>
            </button>
            <button
              onClick={() => setFilterMode('errors')}
              className={`flex items-center gap-1 px-2 py-1 rounded-md transition-colors ${filterMode === 'errors' ? 'bg-rose-900/50 text-rose-300 font-semibold border border-rose-500/50' : 'text-slate-400 hover:text-rose-300'}`}
            >
              <AlertTriangle className="w-3 h-3 text-rose-400" />
              <span>Errors ({errorCount})</span>
            </button>
          </div>
        </div>

        {/* Right: Default Time Limit & Apply All */}
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 text-slate-300 bg-slate-900/80 px-2.5 py-1 rounded-lg border border-slate-700/60">
            <Clock className="w-3.5 h-3.5 text-indigo-400" />
            <span className="text-slate-400">Default:</span>
            <input
              type="number"
              min={1}
              max={300}
              value={defaultTime}
              onChange={(e) => setDefaultTime(Math.max(1, Math.min(300, parseInt(e.target.value) || 20)))}
              className="w-12 bg-slate-800 text-center font-semibold text-white rounded border border-slate-700 px-1 py-0.5 focus:outline-none focus:border-indigo-500"
            />
            <span className="text-slate-400">sec</span>
          </div>

          <button
            onClick={handleApplyTimeToAll}
            title="Set this time limit for all questions in set"
            className={`px-2 py-1 rounded-md text-[11px] font-medium transition-colors ${isApplyingTime ? 'bg-emerald-600 text-white' : 'bg-slate-700 hover:bg-slate-600 text-slate-300'}`}
          >
            {isApplyingTime ? 'Applied!' : 'Apply to all'}
          </button>
        </div>
      </div>
    </div>
  );
};