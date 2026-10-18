import { useState, useRef, useEffect } from 'react';
import { cn } from '../lib/utils';
import { Folder, Plus, Edit2, Trash2, Archive, Inbox, FolderOpen, MoreVertical, ChevronDown, ChevronUp, Pin, Search, Settings, ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from './ui/Button';
import { Input } from './ui/Input';
import { Modal, ConfirmDialog } from './ui/Modal';
import { useAppStore } from '../stores/appStore';
import { createFolder, updateFolder, deleteFolder, reorderFolders } from '../services/firebaseSync';
import { SPECIAL_FOLDER_IDS } from '../types';
import { DndContext, closestCorners, KeyboardSensor, PointerSensor, useSensor, useSensors, DragEndEvent } from '@dnd-kit/core';
import { SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { SettingsButton } from './Settings';

interface SortableFolderItemProps {
  folder: {
    id: string;
    name: string;
    isInbox: boolean;
    isArchive: boolean;
    order: number;
    color?: string;
  };
  isActive: boolean;
  isEditing: boolean;
  onActivate: () => void;
  onEdit: () => void;
  onDelete: () => void;
}

function SortableFolderItem({ folder, isActive, isEditing, onActivate, onEdit, onDelete }: SortableFolderItemProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: folder.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const folderType = folder.isInbox ? 'inbox' : folder.isArchive ? 'archive' : 'custom';
  
  const Icons = {
    inbox: Inbox,
    archive: Archive,
    custom: Folder,
  };
  
  const FolderIcon = Icons[folderType];

  if (isEditing) {
    return (
      <div ref={setNodeRef} style={style} className="w-full">
        <Input
          autoFocus
          defaultValue={folder.name}
          onKeyDown={(e) => {
            if (e.key === 'Enter') onEdit();
            if (e.key === 'Escape') onEdit();
          }}
          onBlur={onEdit}
          className="w-full"
        />
      </div>
    );
  }

  return (
    <div ref={setNodeRef} style={style} className="w-full">
      <div
        {...attributes}
        {...listeners}
        className={cn(
          'folder-pill w-full',
          isActive ? 'folder-pill-active' : 'folder-pill-inactive',
          isDragging && 'ring-2 ring-ring'
        )}
        onClick={onActivate}
      >
        <FolderIcon className={cn('w-4 h-4 flex-shrink-0', isActive ? 'text-current' : '')} />
        <span className="truncate flex-1">{folder.name}</span>
        {!folder.isInbox && !folder.isArchive && (
          <div className="flex items-center gap-1 opacity-0 hover:opacity-100 transition-opacity">
            <button onClick={(e) => { e.stopPropagation(); onEdit(); }} className="toolbar-btn p-1" aria-label="Rename folder">
              <Edit2 className="w-4 h-4" />
            </button>
            <button onClick={(e) => { e.stopPropagation(); onDelete(); }} className="toolbar-btn p-1" aria-label="Delete folder">
              <Trash2 className="w-4 h-4" />
            </button>
            <span {...attributes} {...listeners} className="drag-handle p-1" aria-label="Drag to reorder">
              <MoreVertical className="w-4 h-4" />
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

export function Sidebar() {
  const {
    folders,
    activeFolderId,
    isSidebarOpen,
    isEditingFolder,
    setEditingFolder,
    setShowDeleteConfirm,
    setCreatingNote,
    setActiveFolder,
  } = useAppStore();

  const [showCreateFolder, setShowCreateFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [editingFolderId, setEditingFolderId] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<{ type: 'folder'; id: string } | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      const folderIds = folders.map(f => f.id);
      const activeIndex = folderIds.indexOf(active.id as string);
      const overIndex = folderIds.indexOf(over.id as string);
      const newOrder = [...folderIds];
      const [removed] = newOrder.splice(activeIndex, 1);
      newOrder.splice(overIndex, 0, removed);
      reorderFolders(newOrder);
    }
  };

  // Folder color constants from design tokens
const FOLDER_DEFAULT_COLOR = '#475569'; // muted-foreground / slate-blue from design tokens

const handleCreateFolder = async () => {
    if (!newFolderName.trim()) return;
    try {
      await createFolder({
        userId: '', // Will be filled by service
        name: newFolderName.trim(),
        order: folders.length,
        isArchive: false,
        isInbox: false,
        color: FOLDER_DEFAULT_COLOR,
        icon: 'folder',
      });
      setShowCreateFolder(false);
      setNewFolderName('');
    } catch (error) {
      console.error('Failed to create folder:', error);
    }
  };

  const handleRenameFolder = async (folderId: string, name: string) => {
    if (!name.trim()) return;
    try {
      await updateFolder(folderId, { name: name.trim() });
      setEditingFolderId(null);
    } catch (error) {
      console.error('Failed to rename folder:', error);
    }
  };

  const handleDeleteFolder = async (folderId: string) => {
    try {
      await deleteFolder(folderId);
      setDeleteConfirm(null);
    } catch (error) {
      console.error('Failed to delete folder:', error);
    }
  };

  const inboxFolder = folders.find(f => f.isInbox);
  const archiveFolder = folders.find(f => f.isArchive);
  const customFolders = folders.filter(f => !f.isInbox && !f.isArchive);

  return (
    <aside className={cn(
      'flex flex-col bg-card border-r border-border transition-all duration-fast',
      isSidebarOpen ? 'w-64' : 'w-16'
    )}>
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-border">
        {isSidebarOpen && (
          <h1 className="text-lg font-semibold text-foreground flex items-center gap-2">
            <Folder className="w-5 h-5 text-primary" />
            QuickNotes
          </h1>
        )}
        <button
          onClick={() => useAppStore.getState().toggleSidebar()}
          className="toolbar-btn p-1"
          aria-label={isSidebarOpen ? 'Collapse sidebar' : 'Expand sidebar'}
        >
          {isSidebarOpen ? <ChevronLeft className="w-5 h-5" /> : <ChevronRight className="w-5 h-5" />}
        </button>
      </div>

      {/* New Folder Button */}
      {isSidebarOpen && showCreateFolder && (
        <div className="p-3 border-b border-border">
          <Input
            autoFocus
            value={newFolderName}
            onChange={(e) => setNewFolderName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleCreateFolder();
              if (e.key === 'Escape') setShowCreateFolder(false);
            }}
            placeholder="Folder name"
            className="mb-2"
          />
          <div className="flex gap-2">
            <Button size="sm" onClick={handleCreateFolder} className="flex-1">Create</Button>
            <Button size="sm" variant="ghost" onClick={() => { setShowCreateFolder(false); setNewFolderName(''); }}>Cancel</Button>
          </div>
        </div>
      )}

      {isSidebarOpen && !showCreateFolder && (
        <Button
          onClick={() => setShowCreateFolder(true)}
          variant="ghost"
          className="mx-3 mb-3 w-full justify-start"
        >
          <Plus className="w-4 h-4 mr-2" />
          New Folder
        </Button>
      )}

      {/* Folders List */}
      <div className="flex-1 overflow-y-auto p-2">
        <DndContext
          sensors={sensors}
          collisionDetection={closestCorners}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={customFolders.map(f => f.id)}
            strategy={verticalListSortingStrategy}
          >
            {/* Inbox Folder */}
            {inboxFolder && (
              <SortableFolderItem
                key={inboxFolder.id}
                folder={inboxFolder}
                isActive={activeFolderId === inboxFolder.id}
                isEditing={false}
                onActivate={() => setActiveFolder(inboxFolder!.id)}
                onEdit={() => {}}
                onDelete={() => {}}
              />
            )}

            {/* Custom Folders */}
            {customFolders.map((folder) => (
              <SortableFolderItem
                key={folder.id}
                folder={folder}
                isActive={activeFolderId === folder.id}
                isEditing={editingFolderId === folder.id}
                onActivate={() => setActiveFolder(folder.id)}
                onEdit={() => {
                  if (editingFolderId === folder.id) {
                    // Save
                    const input = document.querySelector(`[data-folder-input="${folder.id}"]`) as HTMLInputElement;
                    if (input) handleRenameFolder(folder.id, input.value);
                  } else {
                    setEditingFolderId(folder.id);
                  }
                }}
                onDelete={() => setDeleteConfirm({ type: 'folder', id: folder.id })}
              />
            ))}

            {/* Archive Folder */}
            {archiveFolder && (
              <div className="mt-4 pt-4 border-t border-border" />
            )}
            {archiveFolder && (
              <SortableFolderItem
                key={archiveFolder.id}
                folder={archiveFolder}
                isActive={activeFolderId === archiveFolder.id}
                isEditing={false}
                onActivate={() => setActiveFolder(archiveFolder!.id)}
                onEdit={() => {}}
                onDelete={() => {}}
              />
            )}
          </SortableContext>
        </DndContext>
      </div>

      {/* Footer */}
      <div className="p-3 border-t border-border">
        {isSidebarOpen && (
          <SettingsButton />
        )}
      </div>

      {/* Confirm Dialog */}
      <ConfirmDialog
        isOpen={!!deleteConfirm}
        onClose={() => setDeleteConfirm(null)}
        onConfirm={() => deleteConfirm && handleDeleteFolder(deleteConfirm.id)}
        title="Delete Folder"
        message="Are you sure you want to delete this folder? Notes will be moved to Uncategorized."
        confirmText="Delete"
        variant="destructive"
      />
    </aside>
  );
}