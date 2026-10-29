import React, { useState, useEffect } from 'react';
import { useQuizStore } from '../../state/useQuizStore.js';
import {
  X,
  UploadCloud,
  CheckCircle2,
  AlertTriangle,
  Copy,
  ExternalLink,
  Download,
  Loader2,
} from 'lucide-react';
import { buildBlooketCsv } from '@quizgenerator/shared';
import saveAs from 'file-saver';

interface PublishModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type StepStatus =
  | 'idle'
  | 'verifying'
  | 'queued'
  | 'logging-in'
  | 'creating-set'
  | 'importing'
  | 'saving'
  | 'done'
  | 'failed';

export const PublishModal: React.FC<PublishModalProps> = ({
  isOpen,
  onClose,
}) => {
  const { title, description, questions, addHistoryItem } = useQuizStore();

  const [status, setStatus] = useState<StepStatus>('idle');
  const [queuePos, setQueuePos] = useState<number | null>(null);
  const [errorMessage, setErrorMessage] = useState('');
  const [publishedUrl, setPublishedUrl] = useState('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setStatus('idle');
      setErrorMessage('');
      setPublishedUrl('');
      setCopied(false);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleStartPublish = async () => {
    setStatus('verifying');
    setErrorMessage('');

    try {
      // 1. Submit publish job to backend
      const res = await fetch('/api/publish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim() || 'Untitled Set',
          description,
          questions,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Publish request failed (${res.status})`);
      }

      const { jobId } = await res.json();
      if (!jobId) {
        throw new Error('No job ID returned from server');
      }

      // 2. Listen to SSE status
      setStatus('queued');
      const eventSource = new EventSource(`/api/publish/${jobId}`);
      // Terminal-state flags must live in this closure: React state captured
      // here is stale, so `status !== 'done'` was always true and a normal
      // server-close AFTER a successful publish overwrote success with
      // "Connection lost with publish worker." (observed in a real run).
      let terminal = false;
      let reconnectAttempts = 0;

      eventSource.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data);
          if (payload.status === 'queued') {
            setStatus('queued');
            setQueuePos(payload.queuePosition || 1);
          } else if (payload.status === 'logging-in') {
            setStatus('logging-in');
          } else if (payload.status === 'creating-set') {
            setStatus('creating-set');
          } else if (payload.status === 'importing') {
            setStatus('importing');
          } else if (payload.status === 'saving') {
            setStatus('saving');
          } else if (payload.status === 'done' && payload.url) {
            terminal = true;
            setStatus('done');
            setPublishedUrl(payload.url);
            addHistoryItem({
              title: title.trim() || 'Untitled Set',
              url: payload.url,
              questionCount: questions.length,
            });
            eventSource.close();
          } else if (payload.status === 'failed') {
            terminal = true;
            setStatus('failed');
            setErrorMessage(payload.error || 'Failed to publish to Blooket');
            eventSource.close();
          }
          // Any valid message means the stream is alive (the server replays the
          // current job state on every reconnect).
          reconnectAttempts = 0;
        } catch (e) {
          console.warn('Error reading publish SSE:', e);
        }
      };

      eventSource.onerror = async () => {
        if (terminal) {
          // The server closes the stream after done/failed — that is expected.
          eventSource.close();
          return;
        }
        // EventSource auto-reconnects; the server replays the current job
        // state, which recovers from a dropped stream mid-publish. Only give up
        // after several failed reconnects.
        reconnectAttempts += 1;
        if (reconnectAttempts >= 3) {
          eventSource.close();
          // Final resync: read the first state event directly from the job
          // endpoint, in case the job finished while the stream was down.
          try {
            const res = await fetch(`/api/publish/${jobId}`);
            const reader = res.body?.getReader();
            const decoder = new TextDecoder();
            const { value } = await reader?.read() ?? { value: undefined };
            const payload = JSON.parse(
              (decoder.decode(value) || '').trim().split('\n')[0].replace(/^data:\s*/, '')
            );
            if (payload.status === 'done' && payload.url) {
              setStatus('done');
              setPublishedUrl(payload.url);
              addHistoryItem({
                title: title.trim() || 'Untitled Set',
                url: payload.url,
                questionCount: questions.length,
              });
              return;
            }
            if (payload.status === 'failed') {
              setStatus('failed');
              setErrorMessage(payload.error || 'Failed to publish to Blooket');
              return;
            }
          } catch {
            // fall through to the connection-lost error below
          }
          setStatus('failed');
          setErrorMessage('Connection lost with publish worker.');
        }
      };
    } catch (err: any) {
      setStatus('failed');
      setErrorMessage(err.message || 'An unexpected error occurred.');
    }
  };

  const handleCopy = () => {
    if (publishedUrl) {
      navigator.clipboard.writeText(publishedUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleDownloadFallback = () => {
    const csvContent = buildBlooketCsv(questions);
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const filename = `${title.trim() ? title.toLowerCase().replace(/[^a-z0-9_-]/g, '_') : 'quiz'}_blooket.csv`;
    saveAs(blob, filename);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <div className="relative w-full max-w-lg bg-slate-900 border border-slate-700/80 rounded-2xl shadow-2xl overflow-hidden p-6 space-y-5 animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400">
              <UploadCloud className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-white">
                Publish to Blooket
              </h2>
              <p className="text-[11px] text-slate-400">
                Automated Playwright Publisher
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Status Body */}
        {status === 'idle' && (
          <div className="space-y-4 text-xs text-slate-300">
            <div className="bg-slate-800/80 p-3.5 rounded-xl border border-slate-700/60 space-y-2">
              <div className="flex justify-between">
                <span className="text-slate-400">Quiz Title:</span>
                <span className="font-semibold text-white">{title || 'Untitled Set'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Questions:</span>
                <span className="font-semibold text-white">{questions.length} questions</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Visibility:</span>
                <span className="font-semibold text-emerald-400">Public Link</span>
              </div>
            </div>

            <p className="text-[11px] text-slate-400 leading-relaxed">
              Our automated browser will create a fresh set on Blooket, upload your questions CSV, and return a public link ready to host games.
            </p>

            <button
              onClick={handleStartPublish}
              className="w-full py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs shadow-lg transition-all active:scale-98"
            >
              Start Automated Publish
            </button>
          </div>
        )}

        {/* In-Progress Statuses */}
        {[
          'verifying',
          'queued',
          'logging-in',
          'creating-set',
          'importing',
          'saving',
        ].includes(status) && (
          <div className="py-8 text-center space-y-4">
            <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-indigo-600/20 text-indigo-400 border border-indigo-500/30">
              <Loader2 className="w-7 h-7 animate-spin" />
            </div>

            <div className="space-y-1">
              <h3 className="text-sm font-bold text-white">
                {status === 'verifying' && 'Verifying set data & security...'}
                {status === 'queued' && `In Job Queue (#${queuePos || 1})...`}
                {status === 'logging-in' && 'Authenticating with Blooket...'}
                {status === 'creating-set' && 'Creating the question set...'}
                {status === 'importing' && `Importing ${questions.length} questions...`}
                {status === 'saving' && 'Finalizing & saving public set...'}
              </h3>
              <p className="text-xs text-slate-400">
                Please wait a few moments while Playwright automates Blooket.
              </p>
            </div>
          </div>
        )}

        {/* Done Status */}
        {status === 'done' && (
          <div className="text-center py-4 space-y-4">
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-emerald-600/20 text-emerald-400 border border-emerald-500/30">
              <CheckCircle2 className="w-6 h-6" />
            </div>

            <div className="space-y-1">
              <h3 className="text-base font-bold text-white">
                Published Successfully!
              </h3>
              <p className="text-xs text-slate-300">
                Your Blooket question set is live and ready to play.
              </p>
            </div>

            <div className="flex items-center gap-2 bg-slate-800 p-2.5 rounded-xl border border-slate-700 text-xs">
              <input
                type="text"
                readOnly
                value={publishedUrl}
                className="w-full bg-transparent text-slate-200 font-mono text-[11px] focus:outline-none"
              />
              <button
                onClick={handleCopy}
                className="flex items-center gap-1 px-3 py-1 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg font-medium text-[11px] transition-colors shrink-0"
              >
                <Copy className="w-3.5 h-3.5" />
                <span>{copied ? 'Copied!' : 'Copy'}</span>
              </button>
            </div>

            <div className="flex justify-center gap-3 pt-2">
              <a
                href={publishedUrl}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-xl shadow-md transition-all"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                <span>Open in Blooket</span>
              </a>
              <button
                onClick={onClose}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-xl"
              >
                Done
              </button>
            </div>
          </div>
        )}

        {/* Failed / Fallback Status */}
        {status === 'failed' && (
          <div className="space-y-4 text-xs">
            <div className="bg-rose-950/40 border border-rose-800/80 p-3.5 rounded-xl space-y-2 text-rose-300">
              <div className="flex items-center gap-2 font-bold text-rose-200">
                <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
                <span>Publish Error</span>
              </div>
              <p className="text-[11px] leading-relaxed">{errorMessage}</p>
            </div>

            {/* Manual 3-step fallback guide */}
            <div className="bg-slate-800/80 p-3.5 rounded-xl border border-slate-700 space-y-2 text-slate-300">
              <span className="font-bold text-white text-[11px] uppercase tracking-wider">
                Fallback: 3-Step Manual Import
              </span>
              <ol className="list-decimal list-inside space-y-1 text-[11px] text-slate-400">
                <li>Download your formatted Blooket CSV below.</li>
                <li>Create a set at <strong className="text-white">dashboard.blooket.com/create</strong>.</li>
                <li>On its edit page pick "Import from → Spreadsheet", upload the file and click "Save Set".</li>
              </ol>
            </div>

            <div className="flex items-center gap-2 pt-1">
              <button
                onClick={handleDownloadFallback}
                className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow transition-all"
              >
                <Download className="w-4 h-4" />
                <span>Download CSV File</span>
              </button>

              <button
                onClick={onClose}
                className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold text-xs rounded-xl"
              >
                Close
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
