import { useRef, useEffect, useState } from 'react';
import { Save, Pin, Archive, ArchiveRestore, Trash2, Type, ArrowLeft, ImagePlus, Paperclip, Upload, ClipboardPaste } from 'lucide-react';
import { Button } from './ui/Button';
import { useAppStore } from '../stores/appStore';
import { updateNote, toggleArchiveNote } from '../services/firebaseSync';
import { useAutoSave } from '../hooks/useAutoSave';
import { useToast } from './ui/Toast';
import { AttachmentStrip } from './Attachments';
import { addAttachments, AttachmentError } from '../services/attachments';
import { formatRelativeTime, countWords, countChars, shortcutLabel, isMac, cn } from '../lib/utils';
import type { Note } from '../types';

export function NoteEditor() {
  const selectedNoteId = useAppStore((state) => state.selectedNoteId);
  const note = useAppStore((state) => state.notes.find((n) => n.id === state.selectedNoteId));

  if (!selectedNoteId || !note) {
    return (
      <div className="hidden md:flex panel flex-1 items-center justify-center rounded-2xl">
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
  const imageInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [pendingFiles, setPendingFiles] = useState(0);
  const [isDragOver, setIsDragOver] = useState(false);
  const { showToast } = useToast();

  const attachFiles = async (files: File[]) => {
    if (files.length === 0) return;
    setPendingFiles((n) => n + files.length);
    try {
      const added = await addAttachments(note.id, files);
      if (added.length > 1) showToast('success', `Attached ${added.length} files`);
    } catch (error) {
      showToast('error', error instanceof AttachmentError ? error.message : 'Could not attach file');
      console.error('Attach failed:', error);
    } finally {
      setPendingFiles((n) => Math.max(0, n - files.length));
    }
  };

  // Paste an image (or files) anywhere in the editor; plain text pastes as usual
  const handlePaste = (e: React.ClipboardEvent) => {
    const files = Array.from(e.clipboardData.files);
    if (files.length === 0) return;
    e.preventDefault();
    attachFiles(files);
  };

  // Phone keyboards only paste text into a plain text box, so offer an explicit
  // "Paste" button that reads images straight from the clipboard
  const pasteFromClipboard = async () => {
    if (!navigator.clipboard?.read) {
      showToast('info', "This browser can't read images from the clipboard. Use Image instead.");
      return;
    }
    try {
      const items = await navigator.clipboard.read();
      const files: File[] = [];
      for (const item of items) {
        const type = item.types.find((t) => t.startsWith('image/'));
        if (!type) continue;
        const blob = await item.getType(type);
        files.push(new File([blob], `Pasted image ${files.length + 1}.${type.split('/')[1] || 'png'}`, { type }));
      }
      if (files.length > 0) attachFiles(files);
      else showToast('info', 'No image on the clipboard. Copy an image first.');
    } catch {
      showToast('error', 'Clipboard access was blocked. Allow it, or use Image instead.');
    }
  };

  const hasDraggedFiles = (e: React.DragEvent) => Array.from(e.dataTransfer.types).includes('Files');

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
    <div
      className="panel relative flex-1 flex flex-col min-w-0 overflow-hidden border-0 md:border md:rounded-2xl"
      onPaste={handlePaste}
      onDragEnter={(e) => {
        if (!hasDraggedFiles(e)) return;
        e.preventDefault();
        setIsDragOver(true);
      }}
      onDragOver={(e) => {
        if (!hasDraggedFiles(e)) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'copy';
      }}
      onDragLeave={(e) => {
        // Only when the pointer actually leaves the editor, not when crossing children
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setIsDragOver(false);
      }}
      onDrop={(e) => {
        if (!hasDraggedFiles(e)) return;
        e.preventDefault();
        setIsDragOver(false);
        attachFiles(Array.from(e.dataTransfer.files));
      }}
    >
      {isDragOver && (
        <div className="pointer-events-none absolute inset-2 z-20 flex flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-primary bg-primary/10 text-primary backdrop-blur-sm">
          <Upload className="w-8 h-8" />
          <p className="font-medium">Drop to attach</p>
        </div>
      )}
      {/* Toolbar */}
      <div className="toolbar flex-shrink-0">
        <div className="flex-1 flex items-center gap-2 min-w-0">
          <button
            onClick={async () => { await forceSave(); setSelectedNote(null); }}
            className="toolbar-btn md:hidden size-11 flex items-center justify-center"
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
          <span className="hidden xl:flex items-center text-xs px-2 whitespace-nowrap" aria-live="polite">
            {saveStatus === 'saving' && <span className="text-muted-foreground">Saving...</span>}
            {saveStatus === 'saved' && <span className="text-primary">Saved</span>}
            {saveStatus === 'error' && <span className="text-destructive">Save failed</span>}
            {saveStatus === 'idle' && <span className="text-muted-foreground">Edited {formatRelativeTime(note.updatedAt)}</span>}
          </span>
        </div>
        <div className="flex items-center gap-1 [&>button]:max-md:size-11">
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

      {/* Editor: a centred ~70ch column keeps long lines readable */}
      <div className="flex-1 min-h-0 overflow-hidden flex justify-center">
        <textarea
          ref={textareaRef}
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="Start typing your thoughts..."
          className="w-full max-w-[70ch] h-full px-4 md:px-8 pt-5 pb-6 bg-transparent border-none focus-visible:outline-none resize-none text-foreground placeholder:text-muted-foreground font-sans text-base leading-relaxed"
          aria-label="Note content"
          spellCheck={true}
          autoComplete="off"
          data-gramm="false"
        />
      </div>

      <AttachmentStrip noteId={note.id} attachments={note.attachments ?? []} pending={pendingFiles} />

      {/* Bottom bar: labelled attach actions, word count on the right */}
      <div className="flex-shrink-0 flex items-center gap-1.5 border-t border-border px-2 md:px-4 py-2">
        {[
          { label: 'Image', icon: ImagePlus, onClick: () => imageInputRef.current?.click(), title: 'Add images (or drop them here)' },
          { label: 'File', icon: Paperclip, onClick: () => fileInputRef.current?.click(), title: 'Attach files (or drop them here)' },
          { label: 'Paste', icon: ClipboardPaste, onClick: pasteFromClipboard, title: 'Paste an image from the clipboard (Ctrl+V also works)' },
        ].map(({ label, icon: Icon, onClick, title }) => (
          <button
            key={label}
            onClick={onClick}
            disabled={pendingFiles > 0}
            title={title}
            className="flex items-center gap-1.5 h-9 max-md:h-11 px-3 rounded-lg border border-border text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-[var(--surface-hover)] disabled:opacity-50 transition-colors"
          >
            <Icon className="w-4 h-4" />
            {label}
          </button>
        ))}
        <span className="ml-auto pl-2 text-xs text-muted-foreground tabular-nums whitespace-nowrap max-sm:hidden">
          {pendingFiles > 0 ? 'Attaching…' : `${wordCount} words`}
        </span>
        {pendingFiles > 0 && <span className="ml-auto text-xs text-primary sm:hidden">Attaching…</span>}
        <input
          ref={imageInputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(e) => {
            attachFiles(Array.from(e.target.files ?? []));
            e.target.value = '';
          }}
        />
        <input
          ref={fileInputRef}
          type="file"
          multiple
          className="hidden"
          onChange={(e) => {
            attachFiles(Array.from(e.target.files ?? []));
            e.target.value = '';
          }}
        />
      </div>
    </div>
  );
}
