import { useRef, useEffect, useState, useCallback } from 'react';
import { cn } from '../lib/utils';
import { Save, Pin, Archive, Trash2, MoreVertical, Download, Copy, Type, X } from 'lucide-react';
import { Button } from './ui/Button';
import { Modal, ConfirmDialog } from './ui/Modal';
import { useAppStore } from '../stores/appStore';
import { updateNote, deleteNote, createNote } from '../services/firebaseSync';
import { useAutoSave } from '../hooks/useAutoSave';
import { formatRelativeTime, countWords, countChars, extractTitle } from '../lib/utils';

export function NoteEditor() {
  const {
    selectedNoteId,
    notes,
    activeFolderId,
    setSelectedNote,
    setCreatingNote,
    addNote,
    updateNote: updateNoteStore,
    deleteNote: deleteNoteStore,
    setShowDeleteConfirm,
  } = useAppStore();

  const note = notes.find(n => n.id === selectedNoteId);
  const isNew = !note && selectedNoteId;
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [showDeleteConfirm, setShowDeleteConfirmLocal] = useState(false);
  const [wordCount, setWordCount] = useState(0);
  const [charCount, setCharCount] = useState(0);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const titleRef = useRef<HTMLInputElement>(null);

  // Auto-save
  const { forceSave } = useAutoSave({
    noteId: selectedNoteId,
    content,
    title,
    enabled: !!selectedNoteId && !isNew,
    delay: 1500,
    onSave: setSaveStatus,
  });

  // Update counts
  useEffect(() => {
    setWordCount(countWords(content));
    setCharCount(countChars(content));
  }, [content]);

  // Load note data when selected
  useEffect(() => {
    if (note) {
      setTitle(note.title);
      setContent(note.content);
      setSaveStatus('idle');
    } else if (isNew) {
      setTitle('');
      setContent('');
      setSaveStatus('idle');
      // Focus title for new note
      setTimeout(() => titleRef.current?.focus(), 0);
    }
  }, [note, isNew]);

  // Handle title change
  const handleTitleChange = useCallback((newTitle: string) => {
    setTitle(newTitle);
    if (!isNew && selectedNoteId) {
      const newTitleText = newTitle || extractTitle(content);
      updateNote(selectedNoteId, { title: newTitleText, updatedAt: Date.now() });
    }
  }, [isNew, selectedNoteId, content]);

  // Handle content change
  const handleContentChange = useCallback((newContent: string) => {
    setContent(newContent);
  }, []);

  // Save note
  const handleSave = useCallback(async () => {
    if (!selectedNoteId) return;
    
    if (isNew) {
      // Create new note
      const newNote = await createNote({
        userId: '',
        folderId: activeFolderId!,
        title: title || extractTitle(content),
        content,
        order: 0,
        pinned: false,
        wordCount: countWords(content),
        charCount: countChars(content),
      });
      setSelectedNote(newNote.id);
      setCreatingNote(false);
    } else {
      // Update existing note
      await updateNote(selectedNoteId, {
        title: title || extractTitle(content),
        content,
        wordCount: countWords(content),
        charCount: countChars(content),
        updatedAt: Date.now(),
      });
      setSaveStatus('saved');
      setTimeout(() => setSaveStatus('idle'), 2000);
    }
  }, [selectedNoteId, isNew, title, content, activeFolderId, setSelectedNote, setCreatingNote]);

  // Keyboard shortcuts for editor
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault();
        handleSave();
      }
      if (e.key === 'Escape') {
        if (isNew) {
          setCreatingNote(false);
          setSelectedNote(null);
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleSave, isNew, setCreatingNote, setSelectedNote]);

  // Focus management
  useEffect(() => {
    const handleFocusEditor = () => {
      textareaRef.current?.focus();
    };
    window.addEventListener('quicknotes:focus-editor', handleFocusEditor);
    return () => window.removeEventListener('quicknotes:focus-editor', handleFocusEditor);
  }, []);

  if (!selectedNoteId) {
    return (
      <div className="flex-1 flex items-center justify-center bg-background">
        <div className="empty-state">
          <Type className="empty-state-icon" />
          <h3 className="empty-state-title">No note selected</h3>
          <p className="empty-state-text">Select a note from the list or press Cmd+N to create a new one</p>
        </div>
      </div>
    );
  }

  const folderType = useAppStore.getState().getFolderType(activeFolderId ?? '');
  const isArchive = folderType === 'archive';

  return (
    <div className="flex-1 flex flex-col bg-background">
      {/* Toolbar */}
      <div className="toolbar flex-shrink-0">
        <div className="flex-1 flex items-center gap-2">
          <input
            ref={titleRef}
            type="text"
            value={title}
            onChange={(e) => handleTitleChange(e.target.value)}
            placeholder="Note title..."
            className="bg-transparent border-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background text-lg font-medium text-foreground w-full px-2 py-1"
            aria-label="Note title"
          />
          <span className="text-xs px-2">
            {saveStatus === 'saving' && <Save className="w-4 h-4 animate-spin mr-1" />}
            {saveStatus === 'saving' && <span className="text-muted-foreground">Saving...</span>}
            {saveStatus === 'saved' && <span className="text-secondary-foreground">Saved</span>}
            {saveStatus === 'error' && <span className="text-destructive">Save failed</span>}
            {saveStatus === 'idle' && note && <span className="text-muted-foreground">Last edited {formatRelativeTime(note.updatedAt)}</span>}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleSave}
            disabled={saveStatus === 'saving'}
            aria-label="Save (Cmd+S)"
          >
            <Save className="w-4 h-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => updateNote(selectedNoteId!, { pinned: !note?.pinned })}
            className={note?.pinned ? 'toolbar-btn-active' : ''}
            aria-label={note?.pinned ? 'Unpin' : 'Pin'}
          >
            <Pin className="w-4 h-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowDeleteConfirmLocal(true)}
            aria-label="Archive"
          >
            <Archive className="w-4 h-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowDeleteConfirm('note', selectedNoteId!)}
            className="text-destructive hover:bg-destructive/10"
            aria-label="Delete"
          >
            <Trash2 className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* Editor */}
      <div className="flex-1 overflow-hidden relative">
        <textarea
          ref={textareaRef}
          value={content}
          onChange={(e) => handleContentChange(e.target.value)}
          placeholder="Start typing your thoughts..."
          className="w-full h-full p-4 bg-transparent border-none focus-visible:outline-none resize-none text-foreground placeholder:text-muted-foreground font-sans text-base leading-relaxed"
          spellCheck={true}
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          data-gramm="false"
        />
        
        {/* Word count badge */}
        <div className="absolute bottom-4 right-4 flex items-center gap-2">
          <span className="badge badge-muted text-xs">
            {wordCount} words · {charCount} chars
          </span>
        </div>
      </div>

      {/* Delete Confirm */}
      <ConfirmDialog
        isOpen={showDeleteConfirm}
        onClose={() => setShowDeleteConfirmLocal(false)}
        onConfirm={async () => {
          await deleteNote(selectedNoteId!, false);
          setShowDeleteConfirmLocal(false);
        }}
        title="Delete Note"
        message="Are you sure you want to delete this note? It will be moved to Archive."
        confirmText="Archive"
        variant="destructive"
      />
    </div>
  );
}