import { useEffect } from 'react';
import { useAppStore } from '../stores/appStore';
import { KEYBOARD_SHORTCUTS } from '../types';
import { createNewNote, toggleArchiveNote, updateNote } from '../services/firebaseSync';

interface ShortcutHandler {
  (event: KeyboardEvent): void;
}

function parseShortcut(shortcut: string): { key: string; modifiers: Set<string> } {
  const parts = shortcut.toLowerCase().split('+');
  const key = parts.pop()!;
  const modifiers = new Set(parts);
  return { key, modifiers };
}

export function matchesShortcut(event: KeyboardEvent, shortcut: string): boolean {
  const { key, modifiers } = parseShortcut(shortcut);

  const eventKey = event.key.toLowerCase();
  const hasMod = event.ctrlKey || event.metaKey;

  return eventKey === key &&
    modifiers.has('mod') === hasMod &&
    modifiers.has('shift') === event.shiftKey &&
    modifiers.has('alt') === event.altKey;
}

function isTypingTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el) return false;
  return el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable;
}

function isModalOpen(): boolean {
  return !!document.querySelector('[role="dialog"]');
}

/** Global keyboard shortcuts. Reads the latest state from the store on every key press. */
export function useKeyboardShortcuts() {
  useEffect(() => {
    const handleShortcut = (event: KeyboardEvent) => {
      const state = useAppStore.getState();
      if (!state.shortcutsEnabled || state.authStatus !== 'authenticated') return;

      // Save works everywhere, including inside inputs
      if (matchesShortcut(event, KEYBOARD_SHORTCUTS.SAVE)) {
        event.preventDefault();
        window.dispatchEvent(new CustomEvent('quicknotes:save'));
        return;
      }

      if (isModalOpen()) return;

      // Shortcuts with a modifier also work while typing
      if (matchesShortcut(event, KEYBOARD_SHORTCUTS.NEW_NOTE) || matchesShortcut(event, 'alt+n')) {
        event.preventDefault();
        window.dispatchEvent(new CustomEvent('quicknotes:save'));
        createNewNote();
        return;
      }

      if (matchesShortcut(event, KEYBOARD_SHORTCUTS.SEARCH)) {
        event.preventDefault();
        window.dispatchEvent(new CustomEvent('quicknotes:focus-search'));
        return;
      }

      if (matchesShortcut(event, KEYBOARD_SHORTCUTS.ARCHIVE)) {
        event.preventDefault();
        if (state.selectedNoteId) {
          window.dispatchEvent(new CustomEvent('quicknotes:save'));
          toggleArchiveNote(state.selectedNoteId);
        }
        return;
      }

      if (matchesShortcut(event, KEYBOARD_SHORTCUTS.PIN)) {
        event.preventDefault();
        const note = state.notes.find((n) => n.id === state.selectedNoteId);
        if (note) updateNote(note.id, { pinned: !note.pinned });
        return;
      }

      const typing = isTypingTarget(event.target);

      if (matchesShortcut(event, KEYBOARD_SHORTCUTS.ESCAPE)) {
        if (typing) {
          (event.target as HTMLElement).blur();
          return;
        }
        if (state.searchQuery) state.clearSearch();
        else if (state.selectedNoteId) state.setSelectedNote(null);
        return;
      }

      if (typing) return;

      // List navigation (same order as the note list renders)
      const visibleNotes = [
        ...state.getPinnedNotes(state.activeFolderId ?? ''),
        ...state.getUnpinnedNotes(state.activeFolderId ?? ''),
      ];
      const currentIndex = visibleNotes.findIndex((n) => n.id === state.selectedNoteId);

      if (matchesShortcut(event, KEYBOARD_SHORTCUTS.NAV_UP) || matchesShortcut(event, KEYBOARD_SHORTCUTS.NAV_DOWN)) {
        if (visibleNotes.length === 0) return;
        event.preventDefault();
        const step = event.key === 'ArrowUp' ? -1 : 1;
        const nextIndex = currentIndex === -1
          ? (step === 1 ? 0 : visibleNotes.length - 1)
          : (currentIndex + step + visibleNotes.length) % visibleNotes.length;
        state.setSelectedNote(visibleNotes[nextIndex].id);
        return;
      }

      if (matchesShortcut(event, KEYBOARD_SHORTCUTS.OPEN_NOTE)) {
        if (state.selectedNoteId) {
          event.preventDefault();
          window.dispatchEvent(new CustomEvent('quicknotes:focus-editor'));
        } else if (visibleNotes.length > 0) {
          event.preventDefault();
          state.setSelectedNote(visibleNotes[0].id);
        }
        return;
      }

      if (matchesShortcut(event, KEYBOARD_SHORTCUTS.DELETE)) {
        if (state.selectedNoteId) {
          event.preventDefault();
          state.setShowDeleteConfirm('note', state.selectedNoteId);
        }
      }
    };

    window.addEventListener('keydown', handleShortcut);
    return () => window.removeEventListener('keydown', handleShortcut);
  }, []);
}

export function useShortcut(shortcut: string, handler: ShortcutHandler, enabled = true) {
  useEffect(() => {
    if (!enabled) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (matchesShortcut(event, shortcut)) {
        event.preventDefault();
        handler(event);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [shortcut, handler, enabled]);
}
