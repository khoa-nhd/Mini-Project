import { useRef, useEffect, useState } from 'react';
import { Save, Pin, Archive, ArchiveRestore, Trash2, Type, ArrowLeft } from 'lucide-react';
import { Button } from './ui/Button';
import { useAppStore } from '../stores/appStore';
import { updateNote, toggleArchiveNote } from '../services/firebaseSync';
import { useAutoSave } from '../hooks/useAutoSave';
import { formatRelativeTime, countWords, countChars, shortcutLabel, isMac, cn } from '../lib/utils';
import type { Note } from '../types';

export function NoteEditor() {
  const selectedNoteId = useAppStore((state) => state.selectedNoteId);
  const note = useAppStore((state) => state.notes.find((n) => n.id === state.selectedNoteId));

  if (!selectedNoteId || !note) {
    return (
      <div className="hidden md:flex flex-1 items-center justify-center bg-background">
        <div className="empty-state">
          <Type className="empty-state-icon" />
          <h3 className="empty-state-title">No note selected</h3>
          <p className="empty-state-text">
            Select a note from the list or press {isMac ? '⌥N' : 'Alt+N'} to create a new one
          </p>
        </div>
      </div>
    );
  }

  // Keyed by note id: local editor state is initialised once per note, so
  // background syncs never overwrite what the user is typing.
  return <NoteEditorPane key={note.id} note={note} />;
}

function NoteEditorPane({ note }: { note: Note }) {
  const setSelectedNote = useAppStore((state) => state.setSelectedNote);
  const setShowDeleteConfirm = useAppStore((state) => state.setShowDeleteConfirm);
  const isArchived = useAppStore((state) => state.folders.find((f) => f.id === note.folderId)?.isArchive ?? false);

  const [title, setTitle] = useState(note.title);
  const [content, setContent] = useState(note.content);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const titleRef = useRef<HTMLInputElement>(null);

  const wordCount = countWords(content);
  const charCount = countChars(content);

  const { forceSave } = useAutoSave({
    noteId: note.id,
    content,
    title,
    delay: 1500,
    onSave: setSaveStatus,
  });

  // Fade "Saved" back to the last-edited label
  useEffect(() => {
    if (saveStatus !== 'saved') return;
    const timer = setTimeout(() => setSaveStatus('idle'), 2000);
    return () => clearTimeout(timer);
  }, [saveStatus]);

  // Focus: new empty notes start in the title, Enter in the list focuses the body
  useEffect(() => {
    if (!note.title && !note.content) titleRef.current?.focus();

    const focusEditor = () => textareaRef.current?.focus();
    const focusTitle = () => titleRef.current?.focus();
    window.addEventListener('quicknotes:focus-editor', focusEditor);
    window.addEventListener('quicknotes:focus-title', focusTitle);
    return () => {
      window.removeEventListener('quicknotes:focus-editor', focusEditor);
      window.removeEventListener('quicknotes:focus-title', focusTitle);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleArchive = async () => {
    await forceSave();
    await toggleArchiveNote(note.id);
  };

  return (
    <div className="flex-1 flex flex-col bg-background min-w-0">
      {/* Toolbar */}
      <div className="toolbar flex-shrink-0">
        <div className="flex-1 flex items-center gap-2 min-w-0">
          <button
            onClick={async () => { await forceSave(); setSelectedNote(null); }}
            className="toolbar-btn md:hidden"
            aria-label="Back to notes"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <input
            ref={titleRef}
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                textareaRef.current?.focus();
              }
            }}
            placeholder="Note title..."
            className="bg-transparent border-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-md text-lg font-medium text-foreground w-full min-w-0 px-2 py-1"
            aria-label="Note title"
          />
          <span className="hidden sm:flex items-center text-xs px-2 whitespace-nowrap" aria-live="polite">
            {saveStatus === 'saving' && <span className="text-muted-foreground">Saving...</span>}
            {saveStatus === 'saved' && <span className="text-primary">Saved</span>}
            {saveStatus === 'error' && <span className="text-destructive">Save failed</span>}
            {saveStatus === 'idle' && <span className="text-muted-foreground">Edited {formatRelativeTime(note.updatedAt)}</span>}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => forceSave()}
            disabled={saveStatus === 'saving'}
            aria-label={`Save (${shortcutLabel('s')})`}
            title={`Save (${shortcutLabel('s')})`}
          >
            <Save className="w-4 h-4" />
          </Button>
          {!isArchived && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => updateNote(note.id, { pinned: !note.pinned })}
              className={cn(note.pinned && 'toolbar-btn-active')}
              aria-label={note.pinned ? 'Unpin' : 'Pin'}
              aria-pressed={note.pinned}
              title={note.pinned ? 'Unpin' : 'Pin'}
            >
              <Pin className="w-4 h-4" />
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            onClick={handleArchive}
            aria-label={isArchived ? 'Restore to Inbox' : 'Archive'}
            title={isArchived ? 'Restore to Inbox' : 'Archive'}
          >
            {isArchived ? <ArchiveRestore className="w-4 h-4" /> : <Archive className="w-4 h-4" />}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowDeleteConfirm('note', note.id)}
            className="text-destructive hover:bg-destructive/10"
            aria-label="Delete"
            title="Delete"
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
          onChange={(e) => setContent(e.target.value)}
          placeholder="Start typing your thoughts..."
          className="w-full h-full p-4 pb-16 bg-transparent border-none focus-visible:outline-none resize-none text-foreground placeholder:text-muted-foreground font-sans text-base leading-relaxed"
          aria-label="Note content"
          spellCheck={true}
          autoComplete="off"
          data-gramm="false"
        />

        {/* Word count badge (left side, the new-note button sits bottom right) */}
        <div className="absolute bottom-4 left-4 pointer-events-none">
          <span className="badge badge-muted text-xs">
            {wordCount} words · {charCount} chars
          </span>
        </div>
      </div>
    </div>
  );
}
