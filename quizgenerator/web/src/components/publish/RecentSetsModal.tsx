import React, { useState } from 'react';
import { useQuizStore } from '../../state/useQuizStore.js';
import { X, History, ExternalLink, Copy, Check } from 'lucide-react';

interface RecentSetsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const RecentSetsModal: React.FC<RecentSetsModalProps> = ({
  isOpen,
  onClose,
}) => {
  const { history } = useQuizStore();
  const [copiedId, setCopiedId] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleCopy = (id: string, url: string) => {
    navigator.clipboard.writeText(url);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <div className="relative w-full max-w-md bg-slate-900 border border-slate-700/80 rounded-2xl shadow-2xl p-5 space-y-4 animate-in fade-in zoom-in-95 duration-150">
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2">
            <History className="w-5 h-5 text-indigo-400" />
            <h2 className="text-sm font-bold text-white">Recent Blooket Sets</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {history.length === 0 ? (
          <div className="text-center py-8 text-xs text-slate-400 space-y-1">
            <p>No published sets yet.</p>
            <p className="text-[11px] text-slate-500">
              When you publish a set to Blooket, the live link will be saved here.
            </p>
          </div>
        ) : (
          <div className="max-h-80 overflow-y-auto space-y-2.5 pr-1">
            {history.map((item) => (
              <div
                key={item.id}
                className="bg-slate-800/80 border border-slate-700/60 rounded-xl p-3 text-xs space-y-2 hover:border-slate-600 transition-colors"
              >
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-white max-w-[200px] truncate">
                    {item.title}
                  </span>
                  <span className="text-[10px] text-slate-400">
                    {item.questionCount} questions
                  </span>
                </div>

                <div className="flex items-center justify-between gap-2 pt-1 border-t border-slate-700/40 text-[11px]">
                  <span className="text-[10px] text-slate-500">
                    {new Date(item.createdAt).toLocaleDateString()}
                  </span>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleCopy(item.id, item.url)}
                      className="flex items-center gap-1 text-slate-400 hover:text-indigo-400 transition-colors"
                    >
                      {copiedId === item.id ? (
                        <>
                          <Check className="w-3.5 h-3.5 text-emerald-400" />
                          <span className="text-emerald-400 font-medium">Copied</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5" />
                          <span>Copy</span>
                        </>
                      )}
                    </button>

                    <a
                      href={item.url}
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center gap-1 text-indigo-400 hover:text-indigo-300 font-medium transition-colors"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                      <span>Open</span>
                    </a>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="pt-2 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold rounded-lg"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
