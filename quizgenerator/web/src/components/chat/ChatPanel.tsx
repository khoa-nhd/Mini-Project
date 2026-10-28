import React, { useState, useRef } from 'react';
import { useQuizStore } from '../../state/useQuizStore.js';
import {
  Paperclip,
  Send,
  X,
  FileText,
  Sparkles,
  Loader2,
  AlertCircle,
} from 'lucide-react';
import type { Question, RefineResponse } from '@quizgenerator/shared';

interface UploadedFile {
  file: File;
  name: string;
  size: number;
}

export const ChatPanel: React.FC = () => {
  const {
    questions,
    messages,
    isStreaming,
    streamingStatus,
    addChatMessage,
    setIsStreaming,
    setQuestions,
    applyPatches,
    setTitle,
  } = useQuizStore();

  const [prompt, setPrompt] = useState('');
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [fileMode, setFileMode] = useState<'append' | 'replace'>('replace');
  const [showModeModal, setShowModeModal] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files) return;
    const incoming: UploadedFile[] = Array.from(e.target.files).map((f) => ({
      file: f,
      name: f.name,
      size: f.size,
    }));
    setFiles((prev) => [...prev, ...incoming]);
    if (questions.length > 0) {
      setShowModeModal(true);
    }
  };

  const handleRemoveFile = (index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSend = async () => {
    const trimmedPrompt = prompt.trim();
    if (!trimmedPrompt && files.length === 0) return;

    // User Message
    addChatMessage({
      sender: 'user',
      text: trimmedPrompt || (files.length > 0 ? `Uploaded ${files.length} document(s)` : ''),
    });

    setPrompt('');

    // If files are attached, this is a Generate request
    if (files.length > 0) {
      setIsStreaming(true, 'Extracting questions from files...');
      const formData = new FormData();
      files.forEach((f) => formData.append('files', f.file));
      formData.append('prompt', trimmedPrompt);

      try {
        const response = await fetch('/api/generate', {
          method: 'POST',
          body: formData,
        });

        if (!response.ok) {
          const errData = await response.json().catch(() => ({}));
          throw new Error(errData.error || `Server returned ${response.status}`);
        }

        const reader = response.body?.getReader();
        const decoder = new TextDecoder();
        let extractedQuestions: Question[] = fileMode === 'append' ? [...questions] : [];
        let guessedCount = 0;

        if (reader) {
          let buffer = '';
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n\n');
            buffer = lines.pop() || '';

            for (const block of lines) {
              const line = block.trim();
              if (!line.startsWith('data:')) continue;
              const jsonStr = line.replace(/^data:\s*/, '');
              try {
                const payload = JSON.parse(jsonStr);
                if (payload.event === 'meta' && payload.title) {
                  setTitle(payload.title);
                } else if (payload.event === 'question' && payload.question) {
                  extractedQuestions.push(payload.question);
                  if (payload.question.aiGuessed) guessedCount++;
                  setQuestions([...extractedQuestions], false);
                } else if (payload.event === 'progress') {
                  setIsStreaming(true, `Processing chunk ${payload.chunk}/${payload.total}...`);
                } else if (payload.event === 'error') {
                  // Without this branch a failed stream never cleared the spinner
                  // and the failure was reported as a successful 0-question run.
                  setIsStreaming(false, '');
                  addChatMessage({
                    sender: 'assistant',
                    text: `Extraction failed: ${payload.message || 'unknown error'}. You can retry, or add questions manually on the right and download the CSV.`,
                  });
                } else if (payload.event === 'done') {
                  setIsStreaming(false, '');
                  const failed = payload.stats?.failedChunks || 0;
                  const summary =
                    failed > 0
                      ? `Extracted ${extractedQuestions.length} questions, but ${failed} chunk(s) failed and their questions are missing. Send the file again to retry. `
                      : `Extracted ${extractedQuestions.length} questions successfully!`;
                  addChatMessage({
                    sender: 'assistant',
                    text: payload.warning ? `${summary} ${payload.warning}` : summary,
                    stats: {
                      total: extractedQuestions.length,
                      aiGuessed: guessedCount,
                      errors: 0,
                    },
                  });
                }
              } catch (e) {
                console.warn('SSE parse error:', e);
              }
            }
          }
        }

        setFiles([]);
      } catch (err: any) {
        setIsStreaming(false, '');
        addChatMessage({
          sender: 'assistant',
          text: `Failed to extract: ${err.message}. If the backend is not yet started, you can still create questions on the right and download CSV!`,
        });
      }
    } else {
      // Prompt only -> Refine request
      setIsStreaming(true, 'Thinking and applying adjustments...');
      try {
        const response = await fetch('/api/refine', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            questions,
            message: trimmedPrompt,
          }),
        });

        if (!response.ok) {
          const errData = await response.json().catch(() => ({}));
          throw new Error(errData.error || `Server error ${response.status}`);
        }

        const data: RefineResponse = await response.json();
        if (data.patches && data.patches.length > 0) {
          applyPatches(data.patches);
        }

        setIsStreaming(false, '');
        addChatMessage({
          sender: 'assistant',
          text: data.reply || `Applied ${data.patches?.length || 0} modifications. You can undo if needed!`,
        });
      } catch (err: any) {
        setIsStreaming(false, '');
        addChatMessage({
          sender: 'assistant',
          text: `Refine command error: ${err.message}.`,
        });
      }
    }
  };

  return (
    <div className="flex flex-col h-full bg-slate-900 border-r border-slate-800">
      {/* Chat Header */}
      <div className="flex items-center justify-between p-3.5 border-b border-slate-800 bg-slate-900/90">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-indigo-600/30 border border-indigo-500/40 flex items-center justify-center text-indigo-400">
            <Sparkles className="w-4 h-4" />
          </div>
          <div>
            <h2 className="text-xs font-bold text-white tracking-wide">
              AI Quiz Assistant
            </h2>
            <p className="text-[10px] text-slate-400">Gemini Flash</p>
          </div>
        </div>

        <span className="text-[10px] text-slate-500 bg-slate-800 px-2 py-0.5 rounded-full border border-slate-700/60">
          RAM only (no upload stored)
        </span>
      </div>

      {/* Message List */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3.5">
        {messages.map((m) => (
          <div
            key={m.id}
            className={`flex flex-col ${
              m.sender === 'user' ? 'items-end' : 'items-start'
            }`}
          >
            <div
              className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-xs leading-relaxed ${
                m.sender === 'user'
                  ? 'bg-indigo-600 text-white rounded-br-xs'
                  : 'bg-slate-800/90 text-slate-200 border border-slate-700/80 rounded-bl-xs'
              }`}
            >
              {m.text}

              {/* Stats badges */}
              {m.stats && (
                <div className="mt-2 pt-2 border-t border-slate-700/60 flex flex-wrap gap-1.5 text-[10px]">
                  <span className="bg-indigo-950/80 text-indigo-300 px-2 py-0.5 rounded border border-indigo-700/60">
                    Total: {m.stats.total} questions
                  </span>
                  {m.stats.aiGuessed > 0 && (
                    <span className="bg-amber-950/80 text-amber-300 px-2 py-0.5 rounded border border-amber-700/60">
                      ⚠️ {m.stats.aiGuessed} flagged
                    </span>
                  )}
                </div>
              )}
            </div>
            <span className="text-[9px] text-slate-500 mt-1 px-1">
              {new Date(m.timestamp).toLocaleTimeString([], {
                hour: '2-digit',
                minute: '2-digit',
              })}
            </span>
          </div>
        ))}

        {/* Streaming indicator */}
        {isStreaming && (
          <div className="flex items-center gap-2 text-xs text-indigo-400 bg-indigo-950/40 border border-indigo-800/50 rounded-xl p-3">
            <Loader2 className="w-4 h-4 animate-spin text-indigo-400" />
            <span>{streamingStatus || 'Extracting questions...'}</span>
          </div>
        )}

        <div ref={chatEndRef} />
      </div>

      {/* Append vs Replace Modal for new files */}
      {showModeModal && (
        <div className="bg-indigo-950/90 border-t border-b border-indigo-700/80 p-3 text-xs text-indigo-200 space-y-2">
          <div className="font-semibold text-white flex items-center gap-1.5">
            <AlertCircle className="w-4 h-4 text-indigo-400" />
            <span>You have existing questions in the editor.</span>
          </div>
          <p className="text-[11px] text-indigo-300">
            How would you like to handle the newly extracted questions?
          </p>
          <div className="flex gap-2 pt-1">
            <button
              onClick={() => {
                setFileMode('append');
                setShowModeModal(false);
              }}
              className="px-3 py-1 bg-indigo-600 hover:bg-indigo-500 text-white rounded font-medium text-xs transition-colors"
            >
              Append to existing
            </button>
            <button
              onClick={() => {
                setFileMode('replace');
                setShowModeModal(false);
              }}
              className="px-3 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded font-medium text-xs transition-colors"
            >
              Replace all
            </button>
          </div>
        </div>
      )}

      {/* File Chips */}
      {files.length > 0 && (
        <div className="px-3 pt-2 flex flex-wrap gap-1.5 max-h-24 overflow-y-auto">
          {files.map((f, i) => (
            <div
              key={i}
              className="flex items-center gap-1.5 bg-slate-800 border border-slate-700 rounded-lg px-2.5 py-1 text-xs text-slate-200"
            >
              <FileText className="w-3.5 h-3.5 text-indigo-400" />
              <span className="max-w-[120px] truncate" title={f.name}>
                {f.name}
              </span>
              <span className="text-[10px] text-slate-500">
                ({formatFileSize(f.size)})
              </span>
              <button
                onClick={() => handleRemoveFile(i)}
                className="text-slate-400 hover:text-rose-400 p-0.5"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Input Area */}
      <div className="p-3 border-t border-slate-800 bg-slate-900/90">
        <div className="relative bg-slate-800/90 rounded-2xl border border-slate-700/80 focus-within:border-indigo-500 transition-colors p-2 flex flex-col gap-2">
          <textarea
            rows={2}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            placeholder={
              files.length > 0
                ? 'Optional instructions (e.g. questions 1 to 20 only, bold is answer)...'
                : 'Upload files or ask to refine (e.g. "change all time limits to 30s")...'
            }
            className="w-full bg-transparent text-xs text-white placeholder:text-slate-500 focus:outline-none resize-none px-1"
          />

          <div className="flex items-center justify-between border-t border-slate-700/50 pt-2 px-1">
            <div className="flex items-center gap-1.5">
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept=".pdf,.docx,.xlsx,.xls,.txt,image/*"
                onChange={handleFileChange}
                className="hidden"
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="flex items-center gap-1 text-[11px] font-medium text-slate-400 hover:text-indigo-400 p-1.5 rounded-lg hover:bg-slate-700/50 transition-colors"
                title="Attach PDF, DOCX, XLSX, TXT or Images (Max 20MB total)"
              >
                <Paperclip className="w-4 h-4" />
                <span>Attach File</span>
              </button>
            </div>

            <button
              onClick={handleSend}
              disabled={isStreaming || (!prompt.trim() && files.length === 0)}
              className="flex items-center justify-center w-7 h-7 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white shadow transition-all active:scale-95"
            >
              <Send className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
