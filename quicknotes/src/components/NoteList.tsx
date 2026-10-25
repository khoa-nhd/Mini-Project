import { useEffect, useRef, useState, Fragment } from 'react';
import { cn, formatRelativeTime, shortcutLabel, isMac } from '../lib/utils';
import { Search, X, Pin, Archive, ArchiveRestore, Trash2, FileText, Clock, GripVertical, Menu } from 'lucide-react';
import { useAppStore } from '../stores/appStore';
import { updateNote, reorderNotes, toggleArchiveNote } from '../services/firebaseSync';
import type { Note } from '../types';
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, DragEndEvent } from '@dnd-kit/core';
import { SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy, useSortable, arrayMove } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

/** Highlights matches of `query` in `text` without using innerHTML. */
function Highlight({ text, query }: { text: string; query: string }) {
  if (!query) return <>{text}</>;
  const lowerText = text.toLowerCase();
  const lowerQuery = query.toLowerCase();
  const parts: Array<{ text: string; match: boolean }> = [];
  let index = 0;
  while (index < text.length) {
    const found = lowerText.indexOf(lowerQuery, index);
    if (found === -1) {
      parts.push({ text: text.slice(index), match: false });
      break;
    }
    if (found > index) parts.push({ text: text.slice(index, found), match: false });
    parts.push({ text: text.slice(found, found + query.length), match: true });
    index = found + query.length;
  }
  return (
    <>
      {parts.map((part, i) =>
        part.match ? <mark key={i} className="search-highlight">{part.text}</mark> : <Fragment key={i}>{part.text}</Fragment>
      )}
    </>
  );
}

/** Snippet of the content around the first match so the highlight is visible. */
function snippet(content: string, query: string): string {
  const flat = content.replace(/\s+/g, ' ').trim();
  if (!query) return flat.slice(0, 160);
  const found = flat.toLowerCase().indexOf(query.toLowerCase());
  if (found <= 40) return flat.slice(0, 160);
  return '…' + flat.slice(found - 30, found + 130);
}

interface NoteItemProps {
  note: Note;
  isSelected: boolean;
  isArchived: boolean;
  draggable: boolean;
  searchQuery: string;
  folderName?: string;
  onSelect: () => void;
}

// Horizontal distance (px) a touch swipe must travel to archive / restore a note
const SWIPE_THRESHOLD = 80;

function SortableNoteItem({ note, isSelected, isArchived, draggable, searchQuery, folderName, onSelect }: NoteItemProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: note.id,
    disabled: !draggable,
  });
  const setShowDeleteConfirm = useAppStore((state) => state.setShowDeleteConfirm);

  const style = {
    transform: CSS.Transform.toString(transform),
    transition: isDragging ? undefined : transition,
    opacity: isDragging ? 0.5 : 1,
  };

  // Swipe left or right (touch) to archive, or restore when already archived
  const [swipeX, setSwipeX] = useState(0);
  const touchRef = useRef<{ x: number; y: number; horizontal: boolean | null } | null>(null);
  const swipedRef = useRef(false);

  const handleTouchStart = (e: React.TouchEvent) => {
    const touch = e.touches[0];
    touchRef.current = { x: touch.clientX, y: touch.clientY, horizontal: null };
    swipedRef.current = false;
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    const start = touchRef.current;
    if (!start) return;
    const dx = e.touches[0].clientX - start.x;
    const dy = e.touches[0].clientY - start.y;
    if (start.horizontal === null && (Math.abs(dx) > 10 || Math.abs(dy) > 10)) {
      start.horizontal = Math.abs(dx) > Math.abs(dy);
    }
    if (start.horizontal) setSwipeX(dx);
  };

  const handleTouchEnd = () => {
    if (touchRef.current?.horizontal) swipedRef.current = true;
    if (Math.abs(swipeX) >= SWIPE_THRESHOLD) toggleArchiveNote(note.id);
    touchRef.current = null;
    setSwipeX(0);
  };

  // Notes without a title borrow their first line, so the list stays scannable
  const lines = note.content.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const title = note.title || lines[0] || 'Empty note';
  const preview = snippet(note.title ? note.content : lines.slice(1).join(' '), searchQuery);
  const swipeReady = Math.abs(swipeX) >= SWIPE_THRESHOLD;
  const SwipeIcon = isArchived ? ArchiveRestore : Archive;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        'note-item group relative overflow-hidden touch-pan-y',
        isSelected && 'note-item-selected',
        note.pinned && 'note-item-pinned'
      )}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={() => { touchRef.current = null; setSwipeX(0); }}
      onClick={() => {
        // A finished swipe also fires a click; ignore it
        if (swipedRef.current) {
          swipedRef.current = false;
          return;
        }
        onSelect();
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSelect();
        }
      }}
      role="button"
      tabIndex={0}
      aria-current={isSelected ? 'true' : undefined}
    >
      {swipeX !== 0 && (
        <div
          className={cn(
            'absolute inset-0 flex items-center px-4 text-sm font-medium transition-colors',
            swipeX > 0 ? 'justify-start' : 'justify-end',
            swipeReady ? 'bg-accent text-accent-foreground' : 'bg-muted text-muted-foreground'
          )}
          aria-hidden="true"
        >
          <SwipeIcon className="w-5 h-5 mr-2" />
          {isArchived ? 'Restore' : 'Archive'}
        </div>
      )}
      <div
        className="relative flex items-start gap-2 p-3"
        style={{
          background: 'inherit',
          transform: swipeX ? `translateX(${swipeX}px)` : undefined,
          transition: swipeX ? 'none' : 'transform 150ms ease-out',
        }}
      >
        {draggable && (
          <span
            {...attributes}
            {...listeners}
            onClick={(e) => e.stopPropagation()}
            className="drag-handle p-1 -ml-1 mt-0.5 opacity-40 group-hover:opacity-100"
            aria-label="Drag to reorder"
          >
            <GripVertical className="w-4 h-4" />
          </span>
        )}

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            {note.pinned && <Pin className="pin-indicator w-3.5 h-3.5 flex-shrink-0" aria-label="Pinned" />}
            <p className={cn('font-medium truncate', title === 'Empty note' ? 'text-muted-foreground' : 'text-foreground')}>
              <Highlight text={title} query={searchQuery} />
            </p>
          </div>
          {preview && (
            <p className="text-sm text-muted-foreground truncate mt-0.5">
              <Highlight text={preview} query={searchQuery} />
            </p>
          )}
          <div className="flex items-center gap-3 mt-1.5 text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <Clock className="w-3 h-3" />
              {formatRelativeTime(note.updatedAt)}
            </span>
            <span className="flex items-center gap-1">
              <FileText className="w-3 h-3" />
              {note.wordCount} words
            </span>
            {folderName && <span className="badge badge-muted truncate max-w-[8rem]">{folderName}</span>}
          </div>
        </div>

        {/* Quick actions float over the text on hover/focus so previews use the full width.
            Touch devices use swipe and the editor toolbar instead. */}
        <div
          className="absolute top-2 right-2 flex items-center gap-0.5 rounded-md opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto group-focus-within:opacity-100 group-focus-within:pointer-events-auto transition-opacity duration-150 [@media(hover:none)]:hidden"
          style={{ background: 'inherit' }}
        >
          {!isArchived && (
            <button
              onClick={(e) => { e.stopPropagation(); updateNote(note.id, { pinned: !note.pinned }); }}
              className={cn('toolbar-btn p-1.5', note.pinned && 'toolbar-btn-active')}
              aria-label={note.pinned ? 'Unpin' : 'Pin'}
              title={note.pinned ? 'Unpin' : 'Pin'}
            >
              <Pin className="w-4 h-4" />
            </button>
          )}
          <button
            onClick={(e) => { e.stopPropagation(); toggleArchiveNote(note.id); }}
            className="toolbar-btn p-1.5"
            aria-label={isArchived ? 'Restore to Inbox' : 'Archive'}
            title={isArchived ? 'Restore to Inbox' : 'Archive'}
          >
            {isArchived ? <ArchiveRestore className="w-4 h-4" /> : <Archive className="w-4 h-4" />}
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); setShowDeleteConfirm('note', note.id); }}
            className="toolbar-btn p-1.5 text-destructive hover:bg-destructive/10"
            aria-label="Delete"
            title="Delete"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

function SectionLabel({ children }: { children: string }) {
  return (
    <div className="px-4 pt-3 pb-1 text-xs font-medium text-muted-foreground uppercase tracking-wider">
      {children}
    </div>
  );
}

export function NoteList() {
  const notes = useAppStore((state) => state.notes);
  const folders = useAppStore((state) => state.folders);
  const activeFolderId = useAppStore((state) => state.activeFolderId);
  const selectedNoteId = useAppStore((state) => state.selectedNoteId);
  const searchQuery = useAppStore((state) => state.searchQuery);
  const setSelectedNote = useAppStore((state) => state.setSelectedNote);
  const setSearchQuery = useAppStore((state) => state.setSearchQuery);
  const clearSearch = useAppStore((state) => state.clearSearch);
  const setMobileNavOpen = useAppStore((state) => state.setMobileNavOpen);
  const searchRef = useRef<HTMLInputElement>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  useEffect(() => {
    const focusSearch = () => {
      searchRef.current?.focus();
      searchRef.current?.select();
    };
    window.addEventListener('quicknotes:focus-search', focusSearch);
    return () => window.removeEventListener('quicknotes:focus-search', focusSearch);
  }, []);

  const activeFolder = folders.find((f) => f.id === activeFolderId);
  const isArchived = !!activeFolder?.isArchive;
  const query = searchQuery.trim();
  const lowerQuery = query.toLowerCase();

  // Searching looks across every folder; otherwise show the active folder
  const folderNotes = notes
    .filter((n) => !n.deletedAt && (query ? true : n.folderId === activeFolderId))
    .filter((n) => !query || n.title.toLowerCase().includes(lowerQuery) || n.content.toLowerCase().includes(lowerQuery))
    .sort((a, b) => (query ? b.updatedAt - a.updatedAt : a.order - b.order));
  const folderById = new Map(folders.map((f) => [f.id, f]));
  const pinnedNotes = folderNotes.filter((n) => n.pinned);
  const unpinnedNotes = folderNotes.filter((n) => !n.pinned);
  const draggable = !query;

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    // Only reorder within the same group (pinned / unpinned)
    const group = pinnedNotes.some((n) => n.id === active.id) ? pinnedNotes : unpinnedNotes;
    const ids = group.map((n) => n.id);
    const from = ids.indexOf(active.id as string);
    const to = ids.indexOf(over.id as string);
    if (from === -1 || to === -1) return;

    const reorderedGroup = arrayMove(ids, from, to);
    const allIds = group === pinnedNotes
      ? [...reorderedGroup, ...unpinnedNotes.map((n) => n.id)]
      : [...pinnedNotes.map((n) => n.id), ...reorderedGroup];
    reorderNotes(allIds);
  };

  const renderItems = (items: Note[]) =>
    items.map((note) => (
      <SortableNoteItem
        key={note.id}
        note={note}
        isSelected={selectedNoteId === note.id}
        isArchived={!!folderById.get(note.folderId)?.isArchive}
        draggable={draggable}
        searchQuery={query}
        folderName={query ? folderById.get(note.folderId)?.name : undefined}
        onSelect={() => setSelectedNote(note.id)}
      />
    ));

  return (
    <section
      className={cn(
        'panel flex-col overflow-hidden w-full md:w-80 lg:w-96 flex-shrink-0 border-0 md:border md:rounded-2xl',
        selectedNoteId ? 'hidden md:flex' : 'flex'
      )}
      aria-label="Notes"
    >
      {/* Header + Search */}
      <div className="p-3 border-b border-border space-y-3">
        <div className="flex items-center gap-2">
          <button onClick={() => setMobileNavOpen(true)} className="toolbar-btn md:hidden" aria-label="Open folders">
            <Menu className="w-5 h-5" />
          </button>
          <h2 className="font-semibold text-foreground truncate flex-1">
            {query ? 'Search all notes' : activeFolder?.name ?? 'Notes'}
          </h2>
          <span className="text-xs text-muted-foreground">{folderNotes.length}</span>
        </div>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
          <input
            ref={searchRef}
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={`Search notes... (${shortcutLabel('k')})`}
            className="input pl-9 pr-9"
            aria-label="Search notes"
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                e.stopPropagation();
                clearSearch();
                e.currentTarget.blur();
              }
            }}
          />
          {searchQuery && (
            <button
              onClick={() => clearSearch()}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-md p-1"
              aria-label="Clear search"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Notes List */}
      <div className="flex-1 overflow-y-auto pb-24">
        {!activeFolderId && !query ? (
          <div className="empty-state p-8">
            <FileText className="empty-state-icon" />
            <h3 className="empty-state-title">Select a folder</h3>
            <p className="empty-state-text">Choose a folder from the sidebar to view notes</p>
          </div>
        ) : folderNotes.length === 0 ? (
          <div className="empty-state p-8">
            <FileText className="empty-state-icon" />
            <h3 className="empty-state-title">
              {query ? 'No matching notes' : isArchived ? 'Archive is empty' : 'No notes yet'}
            </h3>
            <p className="empty-state-text">
              {query
                ? 'Try a different search term'
                : isArchived
                  ? 'Archived notes will show up here'
                  : `Press ${isMac ? '⌥N' : 'Alt+N'} or the + button to create your first note`}
            </p>
          </div>
        ) : (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            {pinnedNotes.length > 0 && (
              <>
                <SectionLabel>Pinned</SectionLabel>
                <SortableContext items={pinnedNotes.map((n) => n.id)} strategy={verticalListSortingStrategy}>
                  {renderItems(pinnedNotes)}
                </SortableContext>
              </>
            )}
            {unpinnedNotes.length > 0 && (
              <>
                {pinnedNotes.length > 0 && <SectionLabel>Notes</SectionLabel>}
                <SortableContext items={unpinnedNotes.map((n) => n.id)} strategy={verticalListSortingStrategy}>
                  {renderItems(unpinnedNotes)}
                </SortableContext>
              </>
            )}
          </DndContext>
        )}
      </div>
    </section>
  );
}
