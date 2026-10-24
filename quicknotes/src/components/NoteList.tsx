import { useEffect, useRef, Fragment } from 'react';
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
  onSelect: () => void;
}

function SortableNoteItem({ note, isSelected, isArchived, draggable, searchQuery, onSelect }: NoteItemProps) {
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

  const title = note.title || 'Untitled';
  const preview = snippet(note.content, searchQuery);

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn('note-item group relative', isSelected && 'note-item-selected', note.pinned && 'note-item-pinned')}
      onClick={onSelect}
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
      <div className="flex items-start gap-2 p-3">
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
            <p className={cn('font-medium truncate', note.title ? 'text-foreground' : 'text-muted-foreground italic')}>
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
          </div>
        </div>

        {/* Quick actions: visible on hover/focus, always visible for the selected note */}
        <div
          className={cn(
            'flex items-center gap-0.5 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity',
            isSelected && 'opacity-100'
          )}
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
    <div className="px-3 py-2 text-xs font-medium text-muted-foreground uppercase tracking-wider">
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

  const folderNotes = notes
    .filter((n) => n.folderId === activeFolderId && !n.deletedAt)
    .filter((n) => !query || n.title.toLowerCase().includes(lowerQuery) || n.content.toLowerCase().includes(lowerQuery))
    .sort((a, b) => a.order - b.order);
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
        isArchived={isArchived}
        draggable={draggable}
        searchQuery={query}
        onSelect={() => setSelectedNote(note.id)}
      />
    ));

  return (
    <section
      className={cn(
        'flex-col overflow-hidden border-r border-border bg-background w-full md:w-80 lg:w-96 flex-shrink-0',
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
          <h2 className="font-semibold text-foreground truncate flex-1">{activeFolder?.name ?? 'Notes'}</h2>
          <span className="text-xs text-muted-foreground">{folderNotes.length}</span>
        </div>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
          <input
            ref={searchRef}
            type="search"
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
        {!activeFolderId ? (
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
