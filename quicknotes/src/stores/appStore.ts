import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { Folder, Note, User, UserSettings, SyncStatus, FolderType } from '../types';
import { SPECIAL_FOLDER_IDS } from '../types';

interface AppState {
  // User
  user: User | null;
  setUser: (user: User | null) => void;
  updateUserSettings: (settings: Partial<UserSettings>) => void;

  // Folders
  folders: Folder[];
  activeFolderId: string | null;
  setFolders: (folders: Folder[]) => void;
  addFolder: (folder: Folder) => void;
  updateFolder: (id: string, updates: Partial<Folder>) => void;
  deleteFolder: (id: string) => void;
  setActiveFolder: (folderId: string | null) => void;
  reorderFolders: (folderIds: string[]) => void;

  // Notes
  notes: Note[];
  selectedNoteId: string | null;
  setNotes: (notes: Note[]) => void;
  addNote: (note: Note) => void;
  updateNote: (id: string, updates: Partial<Note>) => void;
  deleteNote: (id: string) => void;
  setSelectedNote: (noteId: string | null) => void;
  reorderNotes: (noteIds: string[]) => void;
  moveNoteToFolder: (noteId: string, folderId: string) => void;

  // Search
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  clearSearch: () => void;

  // UI State
  isSidebarOpen: boolean;
  toggleSidebar: () => void;
  setSidebarOpen: (open: boolean) => void;
  isCreatingNote: boolean;
  setCreatingNote: (creating: boolean) => void;
  isEditingFolder: string | null;
  setEditingFolder: (folderId: string | null) => void;
  showSettings: boolean;
  setShowSettings: (show: boolean) => void;

  // Sync
  syncStatus: SyncStatus;
  setSyncStatus: (status: Partial<SyncStatus>) => void;

  // Modals
  showDeleteConfirm: { type: 'note' | 'folder'; id: string | null };
  setShowDeleteConfirm: (type: 'note' | 'folder', id: string | null) => void;

  // Install prompt
  showInstallPrompt: boolean;
  setShowInstallPrompt: (show: boolean) => void;

  // Keyboard shortcuts
  shortcutsEnabled: boolean;
  setShortcutsEnabled: (enabled: boolean) => void;

  // Getters
  getActiveFolder: () => Folder | undefined;
  getSelectedNote: () => Note | undefined;
  getNotesByFolder: (folderId: string) => Note[];
  getPinnedNotes: (folderId: string) => Note[];
  getUnpinnedNotes: (folderId: string) => Note[];
  getFolderType: (folderId: string) => FolderType;
}

const defaultSettings: UserSettings = {
  theme: 'system',
  shortcutsEnabled: true,
  autoSaveDelay: 1500,
  sortOrder: 'manual',
};

const defaultSyncStatus: SyncStatus = {
  status: 'synced',
  pendingChanges: 0,
};

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
      // User
      user: null,
      setUser: (user) => set({ user }),
      updateUserSettings: (settings) =>
        set((state) => ({
          user: state.user ? { ...state.user, settings: { ...state.user.settings, ...settings } } : null,
        })),

      // Folders
      folders: [],
      activeFolderId: null,
      setFolders: (folders) => set({ folders }),
      addFolder: (folder) =>
        set((state) => ({ folders: [...state.folders, folder] })),
      updateFolder: (id, updates) =>
        set((state) => ({
          folders: state.folders.map((f) => (f.id === id ? { ...f, ...updates } : f)),
        })),
      deleteFolder: (id) =>
        set((state) => ({
          folders: state.folders.filter((f) => f.id !== id),
          activeFolderId: state.activeFolderId === id ? null : state.activeFolderId,
        })),
      setActiveFolder: (folderId) => set({ activeFolderId: folderId }),
      reorderFolders: (folderIds) =>
        set((state) => {
          const folderMap = new Map(state.folders.map((f) => [f.id, f]));
          const reordered = folderIds.map((id, index) => ({
            ...folderMap.get(id)!,
            order: index,
          }));
          // Add any folders not in the list (shouldn't happen)
          const remaining = state.folders.filter((f) => !folderIds.includes(f.id));
          return { folders: [...reordered, ...remaining] };
        }),

      // Notes
      notes: [],
      selectedNoteId: null,
      setNotes: (notes) => set({ notes }),
      addNote: (note) =>
        set((state) => ({ notes: [note, ...state.notes] })),
      updateNote: (id, updates) =>
        set((state) => ({
          notes: state.notes.map((n) => (n.id === id ? { ...n, ...updates } : n)),
        })),
      deleteNote: (id) =>
        set((state) => ({
          notes: state.notes.filter((n) => n.id !== id),
          selectedNoteId: state.selectedNoteId === id ? null : state.selectedNoteId,
        })),
      setSelectedNote: (noteId) => set({ selectedNoteId: noteId }),
      reorderNotes: (noteIds) =>
        set((state) => {
          const noteMap = new Map(state.notes.map((n) => [n.id, n]));
          const reordered = noteIds.map((id, index) => ({
            ...noteMap.get(id)!,
            order: index,
          }));
          const remaining = state.notes.filter((n) => !noteIds.includes(n.id));
          return { notes: [...reordered, ...remaining] };
        }),
      moveNoteToFolder: (noteId, folderId) =>
        set((state) => ({
          notes: state.notes.map((n) =>
            n.id === noteId ? { ...n, folderId, updatedAt: Date.now() } : n
          ),
        })),

      // Search
      searchQuery: '',
      setSearchQuery: (query) => set({ searchQuery: query }),
      clearSearch: () => set({ searchQuery: '' }),

      // UI State
      isSidebarOpen: true,
      toggleSidebar: () => set((state) => ({ isSidebarOpen: !state.isSidebarOpen })),
      setSidebarOpen: (open) => set({ isSidebarOpen: open }),
      isCreatingNote: false,
      setCreatingNote: (creating) => set({ isCreatingNote: creating }),
      isEditingFolder: null,
      setEditingFolder: (folderId) => set({ isEditingFolder: folderId }),
      showSettings: false,
      setShowSettings: (show) => set({ showSettings: show }),

      // Sync
      syncStatus: defaultSyncStatus,
      setSyncStatus: (status) =>
        set((state) => ({ syncStatus: { ...state.syncStatus, ...status } })),

      // Modals
      showDeleteConfirm: { type: 'note', id: null },
      setShowDeleteConfirm: (type, id) => set({ showDeleteConfirm: { type, id } }),

      // Install prompt
      showInstallPrompt: false,
      setShowInstallPrompt: (show) => set({ showInstallPrompt: show }),

      // Keyboard shortcuts
      shortcutsEnabled: true,
      setShortcutsEnabled: (enabled) => set({ shortcutsEnabled: enabled }),

      // Getters
      getActiveFolder: () => {
        const { folders, activeFolderId } = get();
        return folders.find((f) => f.id === activeFolderId);
      },
      getSelectedNote: () => {
        const { notes, selectedNoteId } = get();
        return notes.find((n) => n.id === selectedNoteId);
      },
      getNotesByFolder: (folderId) => {
        const { notes, activeFolderId } = get();
        const targetFolder = folderId || activeFolderId;
        if (!targetFolder) return [];
        return notes.filter((n) => n.folderId === targetFolder && !n.deletedAt);
      },
      getPinnedNotes: (folderId) => {
        const notes = get().getNotesByFolder(folderId);
        return notes.filter((n) => n.pinned).sort((a, b) => a.order - b.order);
      },
      getUnpinnedNotes: (folderId) => {
        const notes = get().getNotesByFolder(folderId);
        return notes.filter((n) => !n.pinned).sort((a, b) => a.order - b.order);
      },
      getFolderType: (folderId) => {
        if (folderId === SPECIAL_FOLDER_IDS.INBOX) return 'inbox';
        if (folderId === SPECIAL_FOLDER_IDS.ARCHIVE) return 'archive';
        if (folderId === SPECIAL_FOLDER_IDS.UNCATEGORIZED) return 'uncategorized';
        return 'custom';
      },
    }),
    {
      name: 'quicknotes-app-state',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        activeFolderId: state.activeFolderId,
        isSidebarOpen: state.isSidebarOpen,
        shortcutsEnabled: state.shortcutsEnabled,
        searchQuery: '',
        selectedNoteId: null,
        isCreatingNote: false,
        isEditingFolder: null,
        showDeleteConfirm: { type: 'note', id: null },
        showInstallPrompt: state.showInstallPrompt,
      }),
    }
  )
);

// Selectors for performance
export const useUser = () => useAppStore((state) => state.user);
export const useFolders = () => useAppStore((state) => state.folders);
export const useActiveFolder = () => useAppStore((state) => state.getActiveFolder());
export const useActiveFolderId = () => useAppStore((state) => state.activeFolderId);
export const useNotes = () => useAppStore((state) => state.notes);
export const useSelectedNote = () => useAppStore((state) => state.getSelectedNote());
export const useSelectedNoteId = () => useAppStore((state) => state.selectedNoteId);
export const useSearchQuery = () => useAppStore((state) => state.searchQuery);
export const useSyncStatus = () => useAppStore((state) => state.syncStatus);
export const useUIState = () =>
  useAppStore((state) => ({
    isSidebarOpen: state.isSidebarOpen,
    isCreatingNote: state.isCreatingNote,
    isEditingFolder: state.isEditingFolder,
    showDeleteConfirm: state.showDeleteConfirm,
    showInstallPrompt: state.showInstallPrompt,
  }));
export const useActions = () =>
  useAppStore((state) => ({
    setUser: state.setUser,
    updateUserSettings: state.updateUserSettings,
    setFolders: state.setFolders,
    addFolder: state.addFolder,
    updateFolder: state.updateFolder,
    deleteFolder: state.deleteFolder,
    setActiveFolder: state.setActiveFolder,
    reorderFolders: state.reorderFolders,
    setNotes: state.setNotes,
    addNote: state.addNote,
    updateNote: state.updateNote,
    deleteNote: state.deleteNote,
    setSelectedNote: state.setSelectedNote,
    reorderNotes: state.reorderNotes,
    moveNoteToFolder: state.moveNoteToFolder,
    setSearchQuery: state.setSearchQuery,
    clearSearch: state.clearSearch,
    toggleSidebar: state.toggleSidebar,
    setSidebarOpen: state.setSidebarOpen,
    setCreatingNote: state.setCreatingNote,
    setEditingFolder: state.setEditingFolder,
    setSyncStatus: state.setSyncStatus,
    setShowDeleteConfirm: state.setShowDeleteConfirm,
    setShowInstallPrompt: state.setShowInstallPrompt,
    setShortcutsEnabled: state.setShortcutsEnabled,
    getNotesByFolder: state.getNotesByFolder,
    getPinnedNotes: state.getPinnedNotes,
    getUnpinnedNotes: state.getUnpinnedNotes,
    getFolderType: state.getFolderType,
  }));