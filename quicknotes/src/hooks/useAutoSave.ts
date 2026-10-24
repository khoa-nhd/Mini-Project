import { useEffect, useRef, useCallback } from 'react';
import { updateNote } from '../services/firebaseSync';
import { countWords } from '../lib/utils';

type SaveStatus = 'saving' | 'saved' | 'error';

interface UseAutoSaveOptions {
  noteId: string | null;
  content: string;
  title: string;
  enabled?: boolean;
  delay?: number;
  onSave?: (status: SaveStatus) => void;
}

/**
 * Debounced auto-save for the note editor. The baseline is reset whenever the
 * note changes, and any pending save is flushed on note switch / unmount /
 * window blur / Ctrl+S so nothing typed is lost.
 */
export function useAutoSave({ noteId, content, title, enabled = true, delay = 1500, onSave }: UseAutoSaveOptions) {
  const savedRef = useRef({ noteId, content, title });
  const latestRef = useRef({ noteId, content, title, enabled });
  const onSaveRef = useRef(onSave);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    latestRef.current = { noteId, content, title, enabled };
    onSaveRef.current = onSave;
  });

  const save = useCallback(async () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }

    const { noteId: id, content: c, title: t, enabled: on } = latestRef.current;
    const saved = savedRef.current;
    if (!on || !id) return;
    if (saved.noteId === id && saved.content === c && saved.title === t) return;

    savedRef.current = { noteId: id, content: c, title: t };
    onSaveRef.current?.('saving');
    try {
      await updateNote(id, {
        content: c,
        title: t,
        wordCount: countWords(c),
        charCount: c.length,
      });
      onSaveRef.current?.('saved');
    } catch (error) {
      console.error('Auto-save failed:', error);
      onSaveRef.current?.('error');
    }
  }, []);

  // Reset baseline when switching notes; flush pending changes of the previous one
  useEffect(() => {
    savedRef.current = { noteId, content: latestRef.current.content, title: latestRef.current.title };
    return () => {
      save();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [noteId, save]);

  // Debounce on changes
  useEffect(() => {
    if (!enabled || !noteId) return;
    const saved = savedRef.current;
    if (saved.noteId === noteId && saved.content === content && saved.title === title) return;

    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(save, delay);
  }, [content, title, noteId, enabled, delay, save]);

  // Save on window blur, tab hide and explicit save shortcut
  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === 'hidden') save();
    };
    window.addEventListener('blur', save);
    window.addEventListener('quicknotes:save', save);
    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      window.removeEventListener('blur', save);
      window.removeEventListener('quicknotes:save', save);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [save]);

  return { forceSave: save };
}
