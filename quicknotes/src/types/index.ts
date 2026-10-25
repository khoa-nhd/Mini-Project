export interface User {
  uid: string;
  email: string;
  displayName?: string;
  photoURL?: string;
  createdAt: number;
  settings: UserSettings;
}

export interface UserSettings {
  theme: 'light' | 'dark' | 'system';
  shortcutsEnabled: boolean;
  autoSaveDelay: number;
  sortOrder: 'manual' | 'updated' | 'created' | 'alphabetical';
}

export interface Folder {
  id: string;
  userId: string;
  name: string;
  order: number;
  createdAt: number;
  updatedAt: number;
  isArchive: boolean;
  isInbox: boolean;
  color?: string;
  icon?: string;
}

export interface Note {
  id: string;
  userId: string;
  folderId: string;
  title: string;
  content: string;
  order: number;
  pinned: boolean;
  createdAt: number;
  updatedAt: number;
  deletedAt?: number;
  wordCount: number;
  charCount: number;
  tags?: string[];
}

export interface NoteWithFolder extends Note {
  folderName?: string;
}

export interface SearchResult {
  note: Note;
  score: number;
  matches: Array<{ field: string; indices: [number, number][] }>;
}

export interface SyncStatus {
  status: 'synced' | 'syncing' | 'offline' | 'error';
  lastSynced?: number;
  pendingChanges: number;
  error?: string;
}

export interface ExportData {
  version: string;
  exportedAt: number;
  user: Pick<User, 'uid' | 'email'>;
  folders: Folder[];
  notes: Note[];
}

export interface ImportOptions {
  mergeStrategy: 'replace' | 'merge' | 'skip';
  folderMapping?: Record<string, string>;
}

export type FolderType = 'inbox' | 'archive' | 'custom';

export const SPECIAL_FOLDER_IDS = {
  INBOX: 'inbox',
  ARCHIVE: 'archive',
} as const;

export const DEFAULT_FOLDERS: Omit<Folder, 'id' | 'userId' | 'createdAt' | 'updatedAt'>[] = [
  { name: 'Inbox', order: 0, isArchive: false, isInbox: true, color: '#334155', icon: 'inbox' },
  { name: 'Archive', order: 999, isArchive: true, isInbox: false, color: '#475569', icon: 'archive' },
];

export const KEYBOARD_SHORTCUTS = {
  NEW_NOTE: 'mod+n',
  SEARCH: 'mod+k',
  SAVE: 'mod+s',
  ARCHIVE: 'mod+shift+a',
  ESCAPE: 'escape',
  NAV_UP: 'arrowup',
  NAV_DOWN: 'arrowdown',
  OPEN_NOTE: 'enter',
  DELETE: 'delete',
  PIN: 'mod+shift+p',
  NEW_FOLDER: 'mod+shift+n',
} as const;

export type ShortcutKey = keyof typeof KEYBOARD_SHORTCUTS;