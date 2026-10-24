import { openDB, DBSchema, IDBPDatabase } from 'idb';
import type { Note, Folder, User, SyncStatus } from '../types';

// Extended types for offline storage with sync metadata
interface StoredNote extends Note {
  _synced: boolean;
  _pending: boolean;
}

interface StoredFolder extends Folder {
  _synced: boolean;
  _pending: boolean;
}

interface SyncQueueItem {
  id: number;
  type: 'create' | 'update' | 'delete';
  collection: 'notes' | 'folders';
  data: unknown;
  timestamp: number;
  retries: number;
}

interface SearchIndexItem {
  noteId: string;
  title: string;
  content: string;
  folderId: string;
}

interface SettingItem {
  key: string;
  value: unknown;
}

interface SyncStatusItem {
  key: string;
  status: SyncStatus['status'];
  lastSynced?: number;
  pendingChanges: number;
  error?: string;
}

interface QuickNotesDB extends DBSchema {
  notes: {
    key: string;
    value: StoredNote;
    indexes: { byFolder: string; byUpdated: number; byUser: string };
  };
  folders: {
    key: string;
    value: StoredFolder;
    indexes: { byUser: string; byOrder: number };
  };
  user: {
    key: string;
    value: User;
  };
  syncQueue: {
    key: number;
    value: SyncQueueItem;
    indexes: { byTimestamp: number };
  };
  searchIndex: {
    key: string;
    value: SearchIndexItem;
    indexes: { byFolder: string };
  };
  settings: {
    key: string;
    value: { key: string; value: unknown };
  };
  syncStatus: {
    key: string;
    value: SyncStatusItem;
  };
}

let dbInstance: IDBPDatabase<QuickNotesDB> | null = null;

export async function getDB(): Promise<IDBPDatabase<QuickNotesDB>> {
  if (dbInstance) return dbInstance;

  dbInstance = await openDB<QuickNotesDB>('quicknotes', 1, {
    upgrade(db) {
      // Notes store
      const notesStore = db.createObjectStore('notes', { keyPath: 'id' });
      notesStore.createIndex('byFolder', 'folderId');
      notesStore.createIndex('byUpdated', 'updatedAt');
      notesStore.createIndex('byUser', 'userId');

      // Folders store
      const foldersStore = db.createObjectStore('folders', { keyPath: 'id' });
      foldersStore.createIndex('byUser', 'userId');
      foldersStore.createIndex('byOrder', 'order');

      // User store
      db.createObjectStore('user', { keyPath: 'uid' });

      // Sync queue - autoIncrement for numeric ID
      const syncQueueStore = db.createObjectStore('syncQueue', { keyPath: 'id', autoIncrement: true });
      syncQueueStore.createIndex('byTimestamp', 'timestamp');

      // Search index
      const searchIndexStore = db.createObjectStore('searchIndex', { keyPath: 'noteId' });
      searchIndexStore.createIndex('byFolder', 'folderId');

      // Settings
      db.createObjectStore('settings', { keyPath: 'key' });

      // Sync status
      db.createObjectStore('syncStatus', { keyPath: 'key' });
    },
  });

  return dbInstance;
}

// Notes operations
export async function getNotesOffline(userId: string, folderId?: string): Promise<Note[]> {
  const db = await getDB();
  let notes: StoredNote[];

  if (folderId) {
    notes = await db.getAllFromIndex('notes', 'byFolder', folderId);
  } else {
    notes = await db.getAllFromIndex('notes', 'byUser', userId);
  }

  return notes
    .filter((n) => !n.deletedAt)
    .map(({ _synced, _pending, ...note }) => note as Note)
    .sort((a, b) => a.order - b.order);
}

export async function getNoteOffline(id: string): Promise<Note | undefined> {
  const db = await getDB();
  return db.get('notes', id);
}

export async function saveNoteOffline(note: Note, synced = false): Promise<void> {
  const db = await getDB();
  await db.put('notes', { ...note, _synced: synced, _pending: !synced } as StoredNote);
  
  // Update search index
  await db.put('searchIndex', {
    noteId: note.id,
    title: note.title,
    content: note.content,
    folderId: note.folderId,
  });
}

export async function deleteNoteOffline(id: string): Promise<void> {
  const db = await getDB();
  await db.delete('notes', id);
  await db.delete('searchIndex', id);
}

export async function getPendingNotes(userId: string): Promise<Note[]> {
  const db = await getDB();
  const notes = await db.getAllFromIndex('notes', 'byUser', userId);
  return notes.filter((n) => n._pending === true) as Note[];
}

// Folders operations
export async function getFoldersOffline(userId: string): Promise<Folder[]> {
  const db = await getDB();
  const folders = await db.getAllFromIndex('folders', 'byUser', userId);
  return folders
    .map(({ _synced, _pending, ...folder }) => folder as Folder)
    .sort((a, b) => a.order - b.order);
}

export async function saveFolderOffline(folder: Folder, synced = false): Promise<void> {
  const db = await getDB();
  await db.put('folders', { ...folder, _synced: synced, _pending: !synced } as StoredFolder);
}

export async function deleteFolderOffline(id: string): Promise<void> {
  const db = await getDB();
  await db.delete('folders', id);
}

// User operations
export async function saveUserOffline(user: User): Promise<void> {
  const db = await getDB();
  await db.put('user', user);
}

export async function getUserOffline(uid: string): Promise<User | undefined> {
  const db = await getDB();
  return db.get('user', uid);
}

// Sync queue operations
export async function addToSyncQueue(
  type: 'create' | 'update' | 'delete',
  collection: 'notes' | 'folders',
  data: unknown
): Promise<void> {
  const db = await getDB();
  await db.add('syncQueue', {
    type,
    collection,
    data,
    timestamp: Date.now(),
    retries: 0,
  } as Omit<SyncQueueItem, 'id'> as SyncQueueItem);
}

export async function getSyncQueue(): Promise<SyncQueueItem[]> {
  const db = await getDB();
  return db.getAllFromIndex('syncQueue', 'byTimestamp');
}

export async function removeFromSyncQueue(id: number): Promise<void> {
  const db = await getDB();
  await db.delete('syncQueue', id);
}

export async function incrementSyncRetry(id: number): Promise<void> {
  const db = await getDB();
  const item = await db.get('syncQueue', id);
  if (item) {
    item.retries += 1;
    await db.put('syncQueue', item);
  }
}

// Search index operations
export async function searchNotesOffline(query: string, folderId?: string): Promise<string[]> {
  const db = await getDB();
  let notes: SearchIndexItem[];

  if (folderId) {
    notes = await db.getAllFromIndex('searchIndex', 'byFolder', folderId);
  } else {
    notes = await db.getAll('searchIndex');
  }

  const lowerQuery = query.toLowerCase();
  return notes
    .filter(
      (n) =>
        n.title.toLowerCase().includes(lowerQuery) || n.content.toLowerCase().includes(lowerQuery)
    )
    .map((n) => n.noteId);
}

export async function rebuildSearchIndex(userId: string): Promise<void> {
  const db = await getDB();
  const notes = await db.getAllFromIndex('notes', 'byUser', userId);
  const tx = db.transaction('searchIndex', 'readwrite');
  
  // Clear existing index
  await tx.store.clear();
  
  // Rebuild
  for (const note of notes) {
    if (!note.deletedAt) {
      await tx.store.put({
        noteId: note.id,
        title: note.title,
        content: note.content,
        folderId: note.folderId,
      });
    }
  }
  
  await tx.done;
}

// Settings operations
export async function getSetting<T>(key: string): Promise<T | undefined> {
  const db = await getDB();
  const result = await db.get('settings', key);
  return result?.value as T | undefined;
}

export async function setSetting(key: string, value: unknown): Promise<void> {
  const db = await getDB();
  await db.put('settings', { key, value });
}

// Sync status
export async function getSyncStatus(): Promise<SyncStatus | undefined> {
  const db = await getDB();
  const result = await db.get('syncStatus', 'status');
  if (!result) return undefined;
  return {
    status: result.status,
    lastSynced: result.lastSynced,
    pendingChanges: result.pendingChanges,
    error: result.error,
  };
}

export async function setSyncStatus(status: SyncStatus): Promise<void> {
  const db = await getDB();
  await db.put('syncStatus', { 
    key: 'status', 
    status: status.status, 
    lastSynced: status.lastSynced, 
    pendingChanges: status.pendingChanges, 
    error: status.error 
  });
}

// Clear all data (for logout)
export async function clearAllData(): Promise<void> {
  const db = await getDB();
  const tx = db.transaction(['notes', 'folders', 'user', 'syncQueue', 'searchIndex', 'syncStatus'], 'readwrite');
  await Promise.all([
    tx.objectStore('notes').clear(),
    tx.objectStore('folders').clear(),
    tx.objectStore('user').clear(),
    tx.objectStore('syncQueue').clear(),
    tx.objectStore('searchIndex').clear(),
    tx.objectStore('syncStatus').clear(),
  ]);
  await tx.done;
}