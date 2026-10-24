import { useState } from 'react';
import { cn } from '../lib/utils';
import { Folder as FolderIcon, Plus, Edit2, Trash2, Archive, Inbox, GripVertical, ChevronLeft, ChevronRight, Cloud, CloudOff, RefreshCw, AlertCircle, X } from 'lucide-react';
import { Button } from './ui/Button';
import { Input } from './ui/Input';
import { ConfirmDialog } from './ui/Modal';
import { useAppStore } from '../stores/appStore';
import { createFolder, updateFolder, deleteFolder, reorderFolders } from '../services/firebaseSync';
import type { Folder } from '../types';
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, DragEndEvent } from '@dnd-kit/core';
import { SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy, useSortable, arrayMove } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { SettingsButton } from './Settings';

// Folder color constants from design tokens
const FOLDER_DEFAULT_COLOR = '#475569';

interface FolderItemProps {
  folder: Folder;
  count: number;
  isActive: boolean;
  collapsed: boolean;
  onActivate: () => void;
  sortable?: boolean;
  isEditing?: boolean;
  onStartEdit?: () => void;
  onRename?: (name: string) => void;
  onCancelEdit?: () => void;
  onDelete?: () => void;
}

function FolderItem({
  folder,
  count,
  isActive,
  collapsed,
  onActivate,
  sortable = false,
  isEditing = false,
  onStartEdit,
  onRename,
  onCancelEdit,
  onDelete,
}: FolderItemProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: folder.id,
    disabled: !sortable || collapsed,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const Icon = folder.isInbox ? Inbox : folder.isArchive ? Archive : FolderIcon;

  if (isEditing && !collapsed) {
    return (
      <div ref={setNodeRef} style={style} className="w-full py-0.5">
        <Input
          autoFocus
          defaultValue={folder.name}
          aria-label="Folder name"
          onFocus={(e) => e.currentTarget.select()}
          onKeyDown={(e) => {
            if (e.key === 'Enter') onRename?.(e.currentTarget.value);
            if (e.key === 'Escape') {
              e.stopPropagation();
              onCancelEdit?.();
            }
          }}
          onBlur={(e) => onRename?.(e.currentTarget.value)}
          className="w-full"
        />
      </div>
    );
  }

  return (
    <div ref={setNodeRef} style={style} className="w-full py-0.5">
      <div
        className={cn(
          'folder-pill group w-full',
          isActive ? 'folder-pill-active' : 'folder-pill-inactive',
          collapsed && 'justify-center px-0',
          isDragging && 'outline-2 outline-ring'
        )}
        onClick={onActivate}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onActivate();
          }
        }}
        role="button"
        tabIndex={0}
        aria-current={isActive ? 'page' : undefined}
        title={collapsed ? folder.name : undefined}
      >
        {sortable && !collapsed && (
          <span
            {...attributes}
            {...listeners}
            onClick={(e) => e.stopPropagation()}
            className="drag-handle -ml-1 opacity-0 group-hover:opacity-60 hover:!opacity-100"
            aria-label="Drag to reorder"
          >
            <GripVertical className="w-3.5 h-3.5" />
          </span>
        )}
        <Icon className="w-4 h-4 flex-shrink-0" />
        {!collapsed && (
          <>
            <span className="truncate flex-1">{folder.name}</span>
            {onStartEdit && onDelete && (
              <div className="hidden group-hover:flex group-focus-within:flex items-center gap-0.5">
                <button
                  onClick={(e) => { e.stopPropagation(); onStartEdit(); }}
                  className="p-1 rounded hover:bg-foreground/10"
                  aria-label={`Rename ${folder.name}`}
                  title="Rename"
                >
                  <Edit2 className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); onDelete(); }}
                  className="p-1 rounded hover:bg-foreground/10"
                  aria-label={`Delete ${folder.name}`}
                  title="Delete"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
            <span className="text-xs opacity-70 tabular-nums group-hover:hidden">{count > 0 ? count : ''}</span>
          </>
        )}
      </div>
    </div>
  );
}

function SyncIndicator({ collapsed }: { collapsed: boolean }) {
  const syncStatus = useAppStore((state) => state.syncStatus);
  const config = {
    synced: { icon: Cloud, label: 'All changes synced', className: 'text-muted-foreground' },
    syncing: { icon: RefreshCw, label: 'Syncing…', className: 'text-primary' },
    offline: { icon: CloudOff, label: 'Offline — changes saved locally', className: 'text-accent' },
    error: { icon: AlertCircle, label: 'Sync error — will retry', className: 'text-destructive' },
  }[syncStatus.status];
  const Icon = config.icon;

  return (
    <div
      className={cn('flex items-center gap-2 px-3 py-1 text-xs', config.className, collapsed && 'justify-center px-0')}
      title={syncStatus.error ?? config.label}
      aria-live="polite"
    >
      <Icon className={cn('w-3.5 h-3.5 flex-shrink-0', syncStatus.status === 'syncing' && 'animate-spin')} />
      {!collapsed && <span className="truncate">{config.label}</span>}
    </div>
  );
}

export function Sidebar() {
  const folders = useAppStore((state) => state.folders);
  const notes = useAppStore((state) => state.notes);
  const activeFolderId = useAppStore((state) => state.activeFolderId);
  const isSidebarOpen = useAppStore((state) => state.isSidebarOpen);
  const isMobileNavOpen = useAppStore((state) => state.isMobileNavOpen);
  const setActiveFolder = useAppStore((state) => state.setActiveFolder);
  const toggleSidebar = useAppStore((state) => state.toggleSidebar);
  const setMobileNavOpen = useAppStore((state) => state.setMobileNavOpen);

  const [showCreateFolder, setShowCreateFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [editingFolderId, setEditingFolderId] = useState<string | null>(null);
  const [deleteFolderId, setDeleteFolderId] = useState<string | null>(null);

  // The mobile drawer is always expanded
  const collapsed = !isSidebarOpen && !isMobileNavOpen;

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const inboxFolder = folders.find((f) => f.isInbox);
  const archiveFolder = folders.find((f) => f.isArchive);
  const customFolders = folders.filter((f) => !f.isInbox && !f.isArchive);

  const countFor = (folderId: string) => notes.filter((n) => n.folderId === folderId && !n.deletedAt).length;

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const ids = customFolders.map((f) => f.id);
    const from = ids.indexOf(active.id as string);
    const to = ids.indexOf(over.id as string);
    if (from === -1 || to === -1) return;
    // Custom folders sit between Inbox (order 0) and the system folders (998+)
    reorderFolders(arrayMove(ids, from, to), 1);
  };

  const handleCreateFolder = async () => {
    const name = newFolderName.trim();
    if (!name) return;
    if (folders.some((f) => f.name.toLowerCase() === name.toLowerCase())) {
      alert('Folder name already exists');
      return;
    }
    try {
      const maxOrder = customFolders.reduce((max, f) => Math.max(max, f.order), 0);
      const folder = await createFolder({
        name,
        order: maxOrder + 1,
        isArchive: false,
        isInbox: false,
        color: FOLDER_DEFAULT_COLOR,
        icon: 'folder',
      });
      setShowCreateFolder(false);
      setNewFolderName('');
      setActiveFolder(folder.id);
    } catch (error) {
      console.error('Failed to create folder:', error);
    }
  };

  const handleRenameFolder = async (folder: Folder, name: string) => {
    setEditingFolderId(null);
    const trimmed = name.trim();
    if (!trimmed || trimmed === folder.name) return;
    try {
      await updateFolder(folder.id, { name: trimmed });
    } catch (error) {
      console.error('Failed to rename folder:', error);
    }
  };

  const handleDeleteFolder = async (folderId: string) => {
    setDeleteFolderId(null);
    try {
      await deleteFolder(folderId);
    } catch (error) {
      console.error('Failed to delete folder:', error);
    }
  };

  return (
    <>
      {/* Mobile backdrop */}
      {isMobileNavOpen && (
        <div className="fixed inset-0 z-30 bg-black/40 md:hidden" onClick={() => setMobileNavOpen(false)} aria-hidden="true" />
      )}

      <aside
        className={cn(
          'flex flex-col bg-card border-r border-border transition-[width,translate] duration-150 flex-shrink-0',
          // Mobile: off-canvas drawer. Desktop: collapsible column.
          'fixed inset-y-0 left-0 z-40 w-72 md:static md:z-auto',
          isMobileNavOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0',
          isSidebarOpen ? 'md:w-64' : 'md:w-16'
        )}
        aria-label="Folders"
      >
        {/* Header */}
        <div className={cn('flex items-center p-4 border-b border-border', collapsed ? 'justify-center' : 'justify-between')}>
          {!collapsed && (
            <h1 className="text-lg font-semibold text-foreground flex items-center gap-2">
              <FolderIcon className="w-5 h-5 text-primary" />
              QuickNotes
            </h1>
          )}
          <button onClick={() => setMobileNavOpen(false)} className="toolbar-btn p-1 md:hidden" aria-label="Close folders">
            <X className="w-5 h-5" />
          </button>
          <button
            onClick={toggleSidebar}
            className="toolbar-btn p-1 hidden md:block"
            aria-label={isSidebarOpen ? 'Collapse sidebar' : 'Expand sidebar'}
          >
            {isSidebarOpen ? <ChevronLeft className="w-5 h-5" /> : <ChevronRight className="w-5 h-5" />}
          </button>
        </div>

        {/* New Folder */}
        {!collapsed && showCreateFolder && (
          <div className="p-3 border-b border-border">
            <Input
              autoFocus
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleCreateFolder();
                if (e.key === 'Escape') {
                  e.stopPropagation();
                  setShowCreateFolder(false);
                  setNewFolderName('');
                }
              }}
              placeholder="Folder name"
              aria-label="New folder name"
              maxLength={60}
              className="mb-2"
            />
            <div className="flex gap-2">
              <Button size="sm" onClick={handleCreateFolder} disabled={!newFolderName.trim()} className="flex-1">Create</Button>
              <Button size="sm" variant="ghost" onClick={() => { setShowCreateFolder(false); setNewFolderName(''); }}>Cancel</Button>
            </div>
          </div>
        )}

        {!showCreateFolder && (
          <div className="px-3 pt-3">
            <Button
              onClick={() => {
                if (collapsed) toggleSidebar();
                setShowCreateFolder(true);
              }}
              variant="ghost"
              className={cn('w-full rounded-lg', collapsed ? 'justify-center px-0' : 'justify-start')}
              aria-label="New folder"
              title="New folder"
            >
              <Plus className="w-4 h-4" />
              {!collapsed && 'New Folder'}
            </Button>
          </div>
        )}

        {/* Folders List */}
        <nav className="flex-1 overflow-y-auto p-2">
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          {inboxFolder && (
            <FolderItem
              folder={inboxFolder}
              count={countFor(inboxFolder.id)}
              isActive={activeFolderId === inboxFolder.id}
              collapsed={collapsed}
              onActivate={() => setActiveFolder(inboxFolder.id)}
            />
          )}

            <SortableContext items={customFolders.map((f) => f.id)} strategy={verticalListSortingStrategy}>
              {customFolders.map((folder) => (
                <FolderItem
                  key={folder.id}
                  folder={folder}
                  count={countFor(folder.id)}
                  isActive={activeFolderId === folder.id}
                  collapsed={collapsed}
                  sortable
                  isEditing={editingFolderId === folder.id}
                  onActivate={() => setActiveFolder(folder.id)}
                  onStartEdit={() => setEditingFolderId(folder.id)}
                  onRename={(name) => handleRenameFolder(folder, name)}
                  onCancelEdit={() => setEditingFolderId(null)}
                  onDelete={() => setDeleteFolderId(folder.id)}
                />
              ))}
            </SortableContext>

          {archiveFolder && (
            <div className="mt-3 pt-3 border-t border-border">
              <FolderItem
                folder={archiveFolder}
                count={countFor(archiveFolder.id)}
                isActive={activeFolderId === archiveFolder.id}
                collapsed={collapsed}
                onActivate={() => setActiveFolder(archiveFolder.id)}
              />
            </div>
          )}
          </DndContext>
        </nav>

        {/* Footer */}
        <div className="p-3 border-t border-border space-y-1">
          <SyncIndicator collapsed={collapsed} />
          <SettingsButton collapsed={collapsed} />
        </div>

        <ConfirmDialog
          isOpen={!!deleteFolderId}
          onClose={() => setDeleteFolderId(null)}
          onConfirm={() => deleteFolderId && handleDeleteFolder(deleteFolderId)}
          title="Delete Folder"
          message="Are you sure you want to delete this folder? Its notes will be moved to Inbox."
          confirmText="Delete"
          variant="destructive"
        />
      </aside>
    </>
  );
}
