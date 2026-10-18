import { useEffect, useCallback } from 'react';
import { useAppStore } from '../stores/appStore';
import { KEYBOARD_SHORTCUTS } from '../types';

interface ShortcutHandler {
  (event: KeyboardEvent): void;
}

function parseShortcut(shortcut: string): { key: string; modifiers: Set<string> } {
  const parts = shortcut.toLowerCase().split('+');
  const key = parts.pop()!;
  const modifiers = new Set(parts);
  return { key, modifiers };
}

function matchesShortcut(event: KeyboardEvent, shortcut: string): boolean {
  const { key, modifiers } = parseShortcut(shortcut);
  
  const eventKey = event.key.toLowerCase();
  const eventModifiers = new Set<string>();
  if (event.ctrlKey || event.metaKey) eventModifiers.add('mod');
  if (event.shiftKey) eventModifiers.add('shift');
  if (event.altKey) eventModifiers.add('alt');
  
  return eventKey === key && 
    modifiers.has('mod') === eventModifiers.has('mod') &&
    modifiers.has('shift') === eventModifiers.has('shift') &&
    modifiers.has('alt') === eventModifiers.has('alt');
}

export function useKeyboardShortcuts() {
  const {
    shortcutsEnabled,
    activeFolderId,
    selectedNoteId,
    isCreatingNote,
    isEditingFolder,
    showDeleteConfirm,
    searchQuery,
    notes,
    folders,
    setSearchQuery,
    clearSearch,
    setSelectedNote,
    setCreatingNote,
    setEditingFolder,
    setShowDeleteConfirm,
    setActiveFolder,
    addNote,
    updateNote,
    deleteNote,
    addFolder,
    getNotesByFolder,
    getPinnedNotes,
    getUnpinnedNotes,
    getFolderType,
  } = useAppStore();

  const handleShortcut = useCallback((event: KeyboardEvent) => {
    if (!shortcutsEnabled) return;

    // Don't trigger shortcuts when typing in inputs
    const target = event.target as HTMLElement;
    if (
      target.tagName === 'INPUT' ||
      target.tagName === 'TEXTAREA' ||
      target.isContentEditable
    ) {
      // Allow some shortcuts even in inputs
      if (matchesShortcut(event, KEYBOARD_SHORTCUTS.SAVE)) {
        event.preventDefault();
        // Trigger save - handled by note editor
        window.dispatchEvent(new CustomEvent('quicknotes:save'));
      }
      if (matchesShortcut(event, KEYBOARD_SHORTCUTS.ESCAPE)) {
        event.preventDefault();
        // Let the escape handler below handle it
      }
      return;
    }

    // Global shortcuts
    if (matchesShortcut(event, KEYBOARD_SHORTCUTS.NEW_NOTE)) {
      event.preventDefault();
      setCreatingNote(true);
      // Create new note in current folder
      const folderId = activeFolderId ?? folders[0]?.id;
      if (folderId) {
        const newNote = {
          id: `note-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
          userId: '', // Will be filled by service
          folderId,
          title: '',
          content: '',
          order: 0,
          pinned: false,
          createdAt: Date.now(),
          updatedAt: Date.now(),
          wordCount: 0,
          charCount: 0,
        };
        addNote(newNote);
        setSelectedNote(newNote.id);
      }
      return;
    }

    if (matchesShortcut(event, KEYBOARD_SHORTCUTS.SEARCH)) {
      event.preventDefault();
      // Focus search input - handled by search component
      window.dispatchEvent(new CustomEvent('quicknotes:focus-search'));
      return;
    }

    if (matchesShortcut(event, KEYBOARD_SHORTCUTS.ARCHIVE)) {
      event.preventDefault();
      if (selectedNoteId) {
        // Archive selected note
        const archiveFolder = folders.find(f => f.isArchive);
        if (archiveFolder) {
          updateNote(selectedNoteId, { 
            folderId: archiveFolder.id, 
            deletedAt: Date.now(),
            updatedAt: Date.now(),
          });
        }
      }
      return;
    }

    if (matchesShortcut(event, KEYBOARD_SHORTCUTS.ESCAPE)) {
      event.preventDefault();
      if (isCreatingNote) {
        setCreatingNote(false);
        setSelectedNote(null);
      }
      if (isEditingFolder) {
        setEditingFolder(null);
      }
      if (showDeleteConfirm.id) {
        setShowDeleteConfirm('note', null);
      }
      if (searchQuery) {
        clearSearch();
      }
      return;
    }

    // Navigation shortcuts (when not in search/create mode)
    if (!isCreatingNote && !searchQuery && !isEditingFolder && !showDeleteConfirm.id) {
      const folderNotes = getNotesByFolder(activeFolderId ?? '');
      const pinnedNotes = getPinnedNotes(activeFolderId ?? '');
      const unpinnedNotes = getUnpinnedNotes(activeFolderId ?? '');
      const allNotes = [...pinnedNotes, ...unpinnedNotes];
      const currentIndex = allNotes.findIndex(n => n.id === selectedNoteId);

      if (matchesShortcut(event, KEYBOARD_SHORTCUTS.NAV_UP)) {
        event.preventDefault();
        if (currentIndex > 0) {
          setSelectedNote(allNotes[currentIndex - 1].id);
        } else if (allNotes.length > 0) {
          setSelectedNote(allNotes[allNotes.length - 1].id);
        }
        return;
      }

      if (matchesShortcut(event, KEYBOARD_SHORTCUTS.NAV_DOWN)) {
        event.preventDefault();
        if (currentIndex < allNotes.length - 1) {
          setSelectedNote(allNotes[currentIndex + 1].id);
        } else if (allNotes.length > 0) {
          setSelectedNote(allNotes[0].id);
        }
        return;
      }

      if (matchesShortcut(event, KEYBOARD_SHORTCUTS.OPEN_NOTE)) {
        event.preventDefault();
        if (selectedNoteId) {
          // Already selected, could focus editor
          window.dispatchEvent(new CustomEvent('quicknotes:focus-editor'));
        } else if (allNotes.length > 0) {
          setSelectedNote(allNotes[0].id);
        }
        return;
      }

      if (matchesShortcut(event, KEYBOARD_SHORTCUTS.DELETE)) {
        event.preventDefault();
        if (selectedNoteId) {
          setShowDeleteConfirm('note', selectedNoteId);
        }
        return;
      }
    }
  }, [
    shortcutsEnabled,
    activeFolderId,
    selectedNoteId,
    isCreatingNote,
    isEditingFolder,
    showDeleteConfirm,
    searchQuery,
    notes,
    folders,
    setSearchQuery,
    clearSearch,
    setSelectedNote,
    setCreatingNote,
    setEditingFolder,
    setShowDeleteConfirm,
    setActiveFolder,
    addNote,
    updateNote,
    deleteNote,
    addFolder,
    getNotesByFolder,
    getPinnedNotes,
    getUnpinnedNotes,
    getFolderType,
  ]);

  useEffect(() => {
    window.addEventListener('keydown', handleShortcut);
    return () => window.removeEventListener('keydown', handleShortcut);
  }, [handleShortcut]);
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