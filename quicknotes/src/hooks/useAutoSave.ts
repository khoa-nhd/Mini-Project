import { useEffect, useRef, useCallback } from 'react';
import { debounce } from '../lib/utils';
import { updateNote } from '../services/firebaseSync';
import { useAppStore } from '../stores/appStore';

interface UseAutoSaveOptions {
  noteId: string | null;
  content: string;
  title: string;
  enabled?: boolean;
  delay?: number;
  onSave?: (status: 'saving' | 'saved' | 'error') => void;
}

export function useAutoSave({
  noteId,
  content,
  title,
  enabled = true,
  delay = 1500,
  onSave,
}: UseAutoSaveOptions) {
  const previousContentRef = useRef(content);
  const previousTitleRef = useRef(title);
  const isFirstRender = useRef(true);

  const debouncedSave = useCallback(
    debounce(async (noteId: string, updates: { content: string; title: string; wordCount: number; charCount: number }) => {
      onSave?.('saving');
      try {
        await updateNote(noteId, {
          ...updates,
          updatedAt: Date.now(),
        });
        onSave?.('saved');
      } catch (error) {
        console.error('Auto-save failed:', error);
        onSave?.('error');
      }
    }, delay),
    [delay, onSave]
  );

  useEffect(() => {
    if (!enabled || !noteId || isFirstRender.current) {
      isFirstRender.current = false;
      previousContentRef.current = content;
      previousTitleRef.current = title;
      return;
    }

    const hasChanges = content !== previousContentRef.current || title !== previousTitleRef.current;
    
    if (hasChanges) {
      const wordCount = content.trim() ? content.trim().split(/\s+/).length : 0;
      const charCount = content.length;
      
      previousContentRef.current = content;
      previousTitleRef.current = title;
      
      debouncedSave(noteId, { content, title, wordCount, charCount });
    }

    return () => {
      // Clear any pending debounced save on unmount
    };
  }, [content, title, noteId, enabled, debouncedSave]);

  // Force save function
  const forceSave = useCallback(async () => {
    if (!noteId) return;
    
    const wordCount = content.trim() ? content.trim().split(/\s+/).length : 0;
    const charCount = content.length;
    
    onSave?.('saving');
    try {
      await updateNote(noteId, {
        content,
        title,
        wordCount,
        charCount,
        updatedAt: Date.now(),
      });
      previousContentRef.current = content;
      previousTitleRef.current = title;
      onSave?.('saved');
    } catch (error) {
      console.error('Force save failed:', error);
      onSave?.('error');
    }
  }, [noteId, content, title, onSave]);

  // Save on window focus loss
  useEffect(() => {
    const handleBlur = () => {
      if (enabled && noteId && (content !== previousContentRef.current || title !== previousTitleRef.current)) {
        forceSave();
      }
    };

    window.addEventListener('blur', handleBlur);
    return () => window.removeEventListener('blur', handleBlur);
  }, [enabled, noteId, content, title, forceSave]);

  // Listen for global save shortcut
  useEffect(() => {
    const handleSave = () => {
      if (enabled && noteId) {
        forceSave();
      }
    };

    window.addEventListener('quicknotes:save', handleSave);
    return () => window.removeEventListener('quicknotes:save', handleSave);
  }, [enabled, noteId, forceSave]);

  return { forceSave };
}