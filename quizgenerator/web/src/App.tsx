import React, { useState } from 'react';
import { useQuizStore } from './state/useQuizStore.js';
import { ChatPanel } from './components/chat/ChatPanel.js';
import { EditorHeader } from './components/editor/EditorHeader.js';
import { EditorCardList } from './components/editor/EditorCardList.js';
import { EditorTableView } from './components/editor/EditorTableView.js';
import { PublishModal } from './components/publish/PublishModal.js';
import { RecentSetsModal } from './components/publish/RecentSetsModal.js';
import {
  MessageSquare,
  Edit3,
  Sparkles,
  Zap,
} from 'lucide-react';

export const App: React.FC = () => {
  const { viewMode, mobileTab, setMobileTab, questions } = useQuizStore();
  const [isPublishOpen, setIsPublishOpen] = useState(false);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-slate-950 text-slate-100">
      {/* Top Header */}
      <header className="h-12 border-b border-slate-800 bg-slate-900/90 px-4 flex items-center justify-between shrink-0 z-30">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-gradient-to-tr from-indigo-600 to-violet-500 flex items-center justify-center shadow-md shadow-indigo-600/30">
            <Zap className="w-4 h-4 text-white" />
          </div>
          <div className="flex items-baseline gap-2">
            <h1 className="text-sm font-black tracking-tight text-white flex items-center gap-1">
              Quiz<span className="text-indigo-400">Generator</span>
            </h1>
            <span className="hidden sm:inline text-[10px] text-slate-400 font-medium bg-slate-800/80 px-2 py-0.5 rounded-full border border-slate-700/60">
              AI to Blooket
            </span>
          </div>
        </div>

        {/* Mobile Tab Switcher */}
        <div className="flex sm:hidden items-center bg-slate-800 rounded-lg p-0.5 border border-slate-700 text-xs">
          <button
            onClick={() => setMobileTab('chat')}
            className={`flex items-center gap-1 px-3 py-1 rounded-md font-semibold transition-colors ${
              mobileTab === 'chat'
                ? 'bg-indigo-600 text-white shadow-xs'
                : 'text-slate-400'
            }`}
          >
            <MessageSquare className="w-3.5 h-3.5" />
            <span>Chat</span>
          </button>
          <button
            onClick={() => setMobileTab('editor')}
            className={`flex items-center gap-1 px-3 py-1 rounded-md font-semibold transition-colors ${
              mobileTab === 'editor'
                ? 'bg-indigo-600 text-white shadow-xs'
                : 'text-slate-400'
            }`}
          >
            <Edit3 className="w-3.5 h-3.5" />
            <span>Editor ({questions.length})</span>
          </button>
        </div>

        {/* Top Right Info */}
        <div className="hidden sm:flex items-center gap-3 text-xs text-slate-400">
          <span className="flex items-center gap-1 bg-slate-800/60 px-2.5 py-1 rounded-full border border-slate-700/60 text-[11px]">
            <Sparkles className="w-3 h-3 text-amber-400" />
            <span>{questions.length} questions loaded</span>
          </span>
        </div>
      </header>

      {/* Main Workspace Body */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Column: Chat Assistant */}
        <div
          className={`${
            mobileTab === 'chat' ? 'flex' : 'hidden'
          } sm:flex flex-col w-full sm:w-[380px] lg:w-[420px] shrink-0 h-full border-r border-slate-800`}
        >
          <ChatPanel />
        </div>

        {/* Right Column: Quiz Editor */}
        <div
          className={`${
            mobileTab === 'editor' ? 'flex' : 'hidden'
          } sm:flex flex-col flex-1 h-full overflow-y-auto bg-slate-900/60`}
        >
          <EditorHeader
            onOpenPublish={() => setIsPublishOpen(true)}
            onOpenHistory={() => setIsHistoryOpen(true)}
          />

          <main className="flex-1 overflow-y-auto">
            {viewMode === 'cards' ? <EditorCardList /> : <EditorTableView />}
          </main>
        </div>
      </div>

      {/* Modals */}
      <PublishModal
        isOpen={isPublishOpen}
        onClose={() => setIsPublishOpen(false)}
      />
      <RecentSetsModal
        isOpen={isHistoryOpen}
        onClose={() => setIsHistoryOpen(false)}
      />
    </div>
  );
};
