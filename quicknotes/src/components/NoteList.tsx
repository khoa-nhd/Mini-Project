import { useState, useRef, useEffect } from 'react';
import { cn } from '../lib/utils';
import { Search, X, Pin, Archive, MoreVertical, FileText, Clock, Loader2 } from 'lucide-react';
import { Button } from './ui/Button';
import { Input } from './ui/Input';
import { Modal, ConfirmDialog } from './ui/Modal';
import { useAppStore } from '../stores/appStore';
import { updateNote, deleteNote, reorderNotes } from '../services/firebaseSync';
import { formatRelativeTime, countWords, extractTitle } from '../lib/utils';
import { DndContext, closestCorners, KeyboardSensor, PointerSensor, useSensor, useSensors, DragEndEvent } from '@dnd-kit/core';
import { SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

interface SortableNoteItemProps {
  note: {
    id: string;
    title: string;
    content: string;
    pinned: boolean;
    updatedAt: number;
    createdAt: number;
    wordCount: number;
  };
  isSelected: boolean;
  onSelect: () => void;
  onArchive: () => void;
  onPin: () => void;
  onDelete: () => void;
  searchQuery?: string;
}

function SortableNoteItem({ note, isSelected, onSelect, onArchive, onPin, onDelete, searchQuery }: SortableNoteItemProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: note.id });
  const [showActions, setShowActions] = useState(false);
  const [swipeX, setSwipeX] = useState(0);
  const itemRef = useRef<HTMLDivElement>(null);

  const style = {
    transform: CSS.Transform.toString(transform),
    transition: isDragging ? undefined : transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    setSwipeX(0);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    const deltaX = e.touches[0].clientX - (e as any).nativeEvent.changedTouches[0].clientX;
    if (Math.abs(deltaX) > 10) {
      e.preventDefault();
      setSwipeX(Math.max(-100, Math.min(0, deltaX)));
    }
  };

  const handleTouchEnd = () => {
    if (swipeX < -50) {
      setShowActions(true);
      setSwipeX(-80);
    } else {
      setSwipeX(0);
      setShowActions(false);
    }
  };

  const highlightedTitle = searchQuery && note.title.toLowerCase().includes(searchQuery.toLowerCase())
    ? note.title.replace(new RegExp(`(${searchQuery})`, 'gi'), '<mark class="search-highlight">$1</mark>')
    : note.title;

  const highlightedContent = searchQuery && note.content.toLowerCase().includes(searchQuery.toLowerCase())
    ? note.content.replace(new RegExp(`(${searchQuery})`, 'gi'), '<mark class="search-highlight">$1</mark>')
    : note.content;

  return (
    <div
      ref={(el) => { setNodeRef(el); itemRef.current = el; }}
      style={style}
      className={cn(
        'note-item relative',
        isSelected && 'note-item-selected',
        note.pinned && 'note-item-pinned',
        showActions && 'translate-x-[-80px]'
      )}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onMouseEnter={() => setShowActions(true)}
      onMouseLeave={() => setShowActions(false)}
    >
      <div
        {...attributes}
        {...listeners}
        className={cn(
          'swipe-content flex items-start gap-3 p-3 rounded-lg transition-transform duration-fast',
          showActions && 'translate-x-[-80px]'
        )}
        onClick={onSelect}
      >
        <div className="flex flex-col items-center justify-center gap-1 p-1 rounded drag-handle" aria-label="Drag to reorder">
          <MoreVertical className="w-4 h-4" />
        </div>
        
        <div className="flex-1 min-w-0">
          <div className="flex items-start gap-2">
            {note.pinned && <Pin className="pin-indicator w-4 h-4 flex-shrink-0 mt-0.5" />}
            <div className="flex-1 min-w-0">
              <p className="font-medium text-foreground truncate" dangerouslySetInnerHTML={{ __html: highlightedTitle }} />
              <p className="text-sm text-muted-foreground truncate mt-0.5" dangerouslySetInnerHTML={{ __html: highlightedContent }} />
            </div>
          </div>
          <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
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

        {note.pinned && (
          <Pin className="pin-indicator w-5 h-5 flex-shrink-0" />
        )}
      </div>

      {/* Swipe Actions */}
      <div className="swipe-actions absolute inset-y-0 right-0 flex items-center gap-2 pr-4 pointer-events-none">
        <button
          onClick={(e) => { e.stopPropagation(); onPin(); }}
          className={cn('toolbar-btn pointer-events-auto', note.pinned && 'toolbar-btn-active')}
          aria-label={note.pinned ? 'Unpin' : 'Pin'}
        >
          <Pin className="w-5 h-5" />
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); onArchive(); }}
          className="toolbar-btn pointer-events-auto"
          aria-label="Archive"
        >
          <Archive className="w-5 h-5" />
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); onDelete(); }}
          className="toolbar-btn pointer-events-auto text-destructive hover:bg-destructive/10"
          aria-label="Delete"
        >
          <X className="w-5 h-5" />
        </button>
      </div>
    </div>
  );
}

export function NoteList() {
  const {
    notes,
    activeFolderId,
    selectedNoteId,
    searchQuery,
    setSelectedNote,
    setShowDeleteConfirm,
    isCreatingNote,
  } = useAppStore();

  const [deleteConfirm, setDeleteConfirm] = useState<{ type: 'note'; id: string } | null>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const { getPinnedNotes, getUnpinnedNotes, getFolderType } = useAppStore.getState();
  const folderType = getFolderType(activeFolderId ?? '');
  const pinnedNotes = getPinnedNotes(activeFolderId ?? '');
  const unpinnedNotes = getUnpinnedNotes(activeFolderId ?? '');

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      const allNotes = [...pinnedNotes, ...unpinnedNotes];
      const noteIds = allNotes.map(n => n.id);
      const activeIndex = noteIds.indexOf(active.id as string);
      const overIndex = noteIds.indexOf(over.id as string);
      const newOrder = [...noteIds];
      const [removed] = newOrder.splice(activeIndex, 1);
      newOrder.splice(overIndex, 0, removed);
      reorderNotes(newOrder);
    }
  };

  const filteredNotes = searchQuery
    ? notes.filter(n => 
        n.folderId === activeFolderId &&
        !n.deletedAt &&
        (n.title.toLowerCase().includes(searchQuery.toLowerCase()) || 
         n.content.toLowerCase().includes(searchQuery.toLowerCase()))
      )
    : [...pinnedNotes, ...unpinnedNotes];

  if (!activeFolderId) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="empty-state">
          <FileText className="empty-state-icon" />
          <h3 className="empty-state-title">Select a folder</h3>
          <p className="empty-state-text">Choose a folder from the sidebar to view notes</p>
        </div>
      </div>
    );
  }

  if (isCreatingNote) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="empty-state">
          <Loader2 className="empty-state-icon animate-spin text-primary" />
          <p className="empty-state-text">Creating new note...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Search Bar */}
      <div className="p-3 border-b border-border">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => useAppStore.getState().setSearchQuery(e.target.value)}
            placeholder={`Search notes... (${navigator.platform.includes('Mac') ? 'Cmd' : 'Ctrl'}+K)`}
            className="input pl-10 pr-10"
            onKeyDown={(e) => {
              if (e.key === 'Escape') useAppStore.getState().clearSearch();
            }}
          />
          {searchQuery && (
            <button
              onClick={() => useAppStore.getState().clearSearch()}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background rounded-md p-1"
              aria-label="Clear search"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>
      </div>

      {/* Notes List */}
      <div className="flex-1 overflow-y-auto">
        <DndContext
          sensors={sensors}
          collisionDetection={closestCorners}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={filteredNotes.map(n => n.id)}
            strategy={verticalListSortingStrategy}
          >
            {pinnedNotes.length > 0 && (
              <>
                <div className="px-3 py-2 text-sm font-medium text-muted-foreground uppercase tracking-wider border-b border-border">
                  Pinned
                </div>
                {pinnedNotes.map((note) => (
                  <SortableNoteItem
                    key={note.id}
                    note={note}
                    isSelected={selectedNoteId === note.id}
                    onSelect={() => setSelectedNote(note.id)}
                    onArchive={() => setShowDeleteConfirm('note', note.id)}
                    onPin={() => updateNote(note.id, { pinned: !note.pinned })}
                    onDelete={() => setDeleteConfirm({ type: 'note', id: note.id })}
                    searchQuery={searchQuery}
                  />
                ))}
              </>
            )}

            {unpinnedNotes.length > 0 && (
              <>
                {pinnedNotes.length > 0 && (
                  <div className="px-3 py-2 text-sm font-medium text-muted-foreground uppercase tracking-wider border-b border-border">
                    Notes
                  </div>
                )}
                {unpinnedNotes.map((note) => (
                  <SortableNoteItem
                    key={note.id}
                    note={note}
                    isSelected={selectedNoteId === note.id}
                    onSelect={() => setSelectedNote(note.id)}
                    onArchive={() => setShowDeleteConfirm('note', note.id)}
                    onPin={() => updateNote(note.id, { pinned: !note.pinned })}
                    onDelete={() => setDeleteConfirm({ type: 'note', id: note.id })}
                    searchQuery={searchQuery}
                  />
                ))}
              </>
            )}

            {filteredNotes.length === 0 && (
              <div className="flex-1 flex items-center justify-center p-8">
                <div className="empty-state">
                  <FileText className="empty-state-icon" />
                  <h3 className="empty-state-title">
                    {searchQuery ? 'No matching notes' : 'No notes yet'}
                  </h3>
                  <p className="empty-state-text">
                    {searchQuery ? 'Try a different search term' : `Press ${navigator.platform.includes('Mac') ? 'Cmd' : 'Ctrl'}+N to create your first note`}
                  </p>
                </div>
              </div>
            )}
          </SortableContext>
        </DndContext>
      </div>
    </div>
  );
}

import { ChevronLeft, ChevronRight } from 'lucide-react';