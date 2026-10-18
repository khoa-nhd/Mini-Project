import {
  collection,
  doc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  onSnapshot,
  writeBatch,
  serverTimestamp,
  Timestamp,
  DocumentSnapshot,
  QuerySnapshot,
} from 'firebase/firestore';
import { db, auth } from '../lib/firebase';
import type { Note, Folder, User, UserSettings } from '../types';
import { getNotesOffline, getFoldersOffline, getUserOffline, saveNoteOffline, saveFolderOffline, saveUserOffline, clearAllData, addToSyncQueue, getSyncQueue, removeFromSyncQueue, incrementSyncRetry, setSyncStatus } from '../lib/offline-db';
import { useAppStore } from '../stores/appStore';

const NOTES_COLLECTION = 'notes';
const FOLDERS_COLLECTION = 'folders';
const USERS_COLLECTION = 'users';
const SETTINGS_COLLECTION = 'settings';

function getUserId(): string {
  const user = auth.currentUser;
  if (!user) throw new Error('User not authenticated');
  return user.uid;
}

function noteToFirestore(note: Note) {
  return {
    ...note,
    createdAt: Timestamp.fromMillis(note.createdAt),
    updatedAt: Timestamp.fromMillis(note.updatedAt),
    deletedAt: note.deletedAt ? Timestamp.fromMillis(note.deletedAt) : null,
  };
}

function noteFromFirestore(doc: DocumentSnapshot): Note {
  const data = doc.data()!;
  return {
    ...data,
    id: doc.id,
    createdAt: data.createdAt?.toMillis() ?? Date.now(),
    updatedAt: data.updatedAt?.toMillis() ?? Date.now(),
    deletedAt: data.deletedAt?.toMillis(),
  } as Note;
}

function folderToFirestore(folder: Folder) {
  return {
    ...folder,
    createdAt: Timestamp.fromMillis(folder.createdAt),
    updatedAt: Timestamp.fromMillis(folder.updatedAt),
  };
}

function folderFromFirestore(doc: DocumentSnapshot): Folder {
  const data = doc.data()!;
  return {
    ...data,
    id: doc.id,
    createdAt: data.createdAt?.toMillis() ?? Date.now(),
    updatedAt: data.updatedAt?.toMillis() ?? Date.now(),
  } as Folder;
}

function userToFirestore(user: User) {
  return {
    ...user,
    createdAt: Timestamp.fromMillis(user.createdAt),
    settings: user.settings,
  };
}

function userFromFirestore(doc: DocumentSnapshot): User {
  const data = doc.data()!;
  return {
    ...data,
    uid: doc.id,
    createdAt: data.createdAt?.toMillis() ?? Date.now(),
    settings: data.settings,
  } as User;
}

// Sync status helpers
function updateSyncStatus(partial: Partial<import('../types').SyncStatus>) {
  const current = useAppStore.getState().syncStatus;
  useAppStore.getState().setSyncStatus(partial);
  setSyncStatus({ ...current, ...partial });
}

// Initial full sync
export async function performInitialSync(): Promise<void> {
  const userId = getUserId();
  updateSyncStatus({ status: 'syncing' });

  try {
    // Fetch user profile
    const userDoc = await getDocs(query(collection(db, USERS_COLLECTION), where('uid', '==', userId)));
    if (!userDoc.empty) {
      const user = userFromFirestore(userDoc.docs[0]);
      useAppStore.getState().setUser(user);
      await saveUserOffline(user);
    }

    // Fetch folders
    const foldersSnapshot = await getDocs(
      query(collection(db, FOLDERS_COLLECTION), where('userId', '==', userId), orderBy('order'))
    );
    const folders = foldersSnapshot.docs.map(folderFromFirestore);
    useAppStore.getState().setFolders(folders);
    for (const folder of folders) {
      await saveFolderOffline(folder, true);
    }

    // Fetch notes
    const notesSnapshot = await getDocs(
      query(collection(db, NOTES_COLLECTION), where('userId', '==', userId), orderBy('order'))
    );
    const notes = notesSnapshot.docs.map(noteFromFirestore).filter((n) => !n.deletedAt);
    useAppStore.getState().setNotes(notes);
    for (const note of notes) {
      await saveNoteOffline(note, true);
    }

    // Set active folder to Inbox if not set
    const { activeFolderId, folders: currentFolders } = useAppStore.getState();
    if (!activeFolderId && currentFolders.length > 0) {
      const inbox = currentFolders.find((f) => f.isInbox);
      useAppStore.getState().setActiveFolder(inbox?.id ?? currentFolders[0].id);
    }

    updateSyncStatus({ status: 'synced', lastSynced: Date.now(), pendingChanges: 0 });
  } catch (error) {
    console.error('Initial sync failed:', error);
    updateSyncStatus({ status: 'error', error: String(error) });
    
    // Load from offline as fallback
    await loadFromOffline(userId);
  }
}

// Load from offline storage
export async function loadFromOffline(userId: string): Promise<void> {
  try {
    const [user, folders, notes] = await Promise.all([
      getUserOffline(userId),
      getFoldersOffline(userId),
      getNotesOffline(userId),
    ]);

    if (user) useAppStore.getState().setUser(user);
    if (folders.length > 0) {
      useAppStore.getState().setFolders(folders);
      const inbox = folders.find((f) => f.isInbox);
      useAppStore.getState().setActiveFolder(inbox?.id ?? folders[0].id);
    }
    if (notes.length > 0) useAppStore.getState().setNotes(notes);

    updateSyncStatus({ status: 'offline', lastSynced: Date.now() });
  } catch (error) {
    console.error('Failed to load from offline:', error);
  }
}

// Real-time listeners
let unsubscribeNotes: (() => void) | null = null;
let unsubscribeFolders: (() => void) | null = null;

export function startRealtimeSync(): void {
  const userId = getUserId();

  // Notes listener
  unsubscribeNotes = onSnapshot(
    query(collection(db, NOTES_COLLECTION), where('userId', '==', userId), orderBy('order')),
    (snapshot: QuerySnapshot) => {
      const changes = snapshot.docChanges();
      const currentNotes = useAppStore.getState().notes;
      let hasChanges = false;

      for (const change of changes) {
        const note = noteFromFirestore(change.doc);
        
        if (change.type === 'added') {
          if (!currentNotes.find((n) => n.id === note.id)) {
            useAppStore.getState().addNote(note);
            saveNoteOffline(note, true);
            hasChanges = true;
          }
        } else if (change.type === 'modified') {
          useAppStore.getState().updateNote(note.id, note);
          saveNoteOffline(note, true);
          hasChanges = true;
        } else if (change.type === 'removed') {
          useAppStore.getState().deleteNote(note.id);
          hasChanges = true;
        }
      }

      if (hasChanges) {
        updateSyncStatus({ status: 'synced', lastSynced: Date.now() });
      }
    },
    (error) => {
      console.error('Notes listener error:', error);
      updateSyncStatus({ status: 'error', error: String(error) });
    }
  );

  // Folders listener
  unsubscribeFolders = onSnapshot(
    query(collection(db, FOLDERS_COLLECTION), where('userId', '==', userId), orderBy('order')),
    (snapshot: QuerySnapshot) => {
      const changes = snapshot.docChanges();
      const currentFolders = useAppStore.getState().folders;

      for (const change of changes) {
        const folder = folderFromFirestore(change.doc);
        
        if (change.type === 'added') {
          if (!currentFolders.find((f) => f.id === folder.id)) {
            useAppStore.getState().addFolder(folder);
            saveFolderOffline(folder, true);
          }
        } else if (change.type === 'modified') {
          useAppStore.getState().updateFolder(folder.id, folder);
          saveFolderOffline(folder, true);
        } else if (change.type === 'removed') {
          useAppStore.getState().deleteFolder(folder.id);
        }
      }
    },
    (error) => {
      console.error('Folders listener error:', error);
    }
  );
}

export function stopRealtimeSync(): void {
  unsubscribeNotes?.();
  unsubscribeFolders?.();
  unsubscribeNotes = null;
  unsubscribeFolders = null;
}

// Note operations
export async function createNote(note: Omit<Note, 'id' | 'createdAt' | 'updatedAt'>): Promise<Note> {
  const userId = getUserId();
  const now = Date.now();
  const newNote: Note = {
    ...note,
    id: `note-${now}-${Math.random().toString(36).substring(2, 9)}`,
    createdAt: now,
    updatedAt: now,
  };

  // Optimistic update
  useAppStore.getState().addNote(newNote);
  await saveNoteOffline(newNote);
  updateSyncStatus({ status: 'syncing', pendingChanges: useAppStore.getState().syncStatus.pendingChanges + 1 });

  try {
    await setDoc(doc(db, NOTES_COLLECTION, newNote.id), noteToFirestore(newNote));
    await saveNoteOffline(newNote, true);
    updateSyncStatus({ status: 'synced', lastSynced: Date.now(), pendingChanges: Math.max(0, useAppStore.getState().syncStatus.pendingChanges - 1) });
  } catch (error) {
    console.error('Failed to create note:', error);
    await addToSyncQueue('create', 'notes', newNote);
    updateSyncStatus({ status: 'error', error: String(error) });
  }

  return newNote;
}

export async function updateNote(noteId: string, updates: Partial<Note>): Promise<void> {
  const userId = getUserId();
  const now = Date.now();
  const updatedNote = { ...updates, updatedAt: now };

  // Optimistic update
  useAppStore.getState().updateNote(noteId, updatedNote);
  const note = useAppStore.getState().notes.find((n) => n.id === noteId);
  if (note) await saveNoteOffline({ ...note, ...updatedNote });
  updateSyncStatus({ status: 'syncing', pendingChanges: useAppStore.getState().syncStatus.pendingChanges + 1 });

  try {
    await updateDoc(doc(db, NOTES_COLLECTION, noteId), updatedNote);
    const updated = useAppStore.getState().notes.find((n) => n.id === noteId);
    if (updated) await saveNoteOffline(updated, true);
    updateSyncStatus({ status: 'synced', lastSynced: Date.now(), pendingChanges: Math.max(0, useAppStore.getState().syncStatus.pendingChanges - 1) });
  } catch (error) {
    console.error('Failed to update note:', error);
    const currentNote = useAppStore.getState().notes.find((n) => n.id === noteId);
    if (currentNote) await addToSyncQueue('update', 'notes', { id: noteId, ...updatedNote });
    updateSyncStatus({ status: 'error', error: String(error) });
  }
}

export async function deleteNote(noteId: string, permanent = false): Promise<void> {
  const userId = getUserId();
  const now = Date.now();

  if (permanent) {
    // Hard delete
    useAppStore.getState().deleteNote(noteId);
    await saveNoteOffline({ id: noteId } as Note); // Will be filtered out
    
    try {
      await deleteDoc(doc(db, NOTES_COLLECTION, noteId));
    } catch (error) {
      console.error('Failed to delete note:', error);
      await addToSyncQueue('delete', 'notes', { id: noteId });
    }
  } else {
    // Soft delete (archive)
    await updateNote(noteId, { 
      deletedAt: now, 
      folderId: 'archive',
      updatedAt: now,
    });
  }
}

export async function restoreNote(noteId: string, folderId: string = 'inbox'): Promise<void> {
  await updateNote(noteId, { 
    deletedAt: undefined, 
    folderId,
    updatedAt: Date.now(),
  });
}

// Folder operations
export async function createFolder(folder: Omit<Folder, 'id' | 'createdAt' | 'updatedAt'>): Promise<Folder> {
  const userId = getUserId();
  const now = Date.now();
  const newFolder: Folder = {
    ...folder,
    id: `folder-${now}-${Math.random().toString(36).substring(2, 9)}`,
    createdAt: now,
    updatedAt: now,
  };

  useAppStore.getState().addFolder(newFolder);
  await saveFolderOffline(newFolder);
  updateSyncStatus({ status: 'syncing', pendingChanges: useAppStore.getState().syncStatus.pendingChanges + 1 });

  try {
    await setDoc(doc(db, FOLDERS_COLLECTION, newFolder.id), folderToFirestore(newFolder));
    await saveFolderOffline(newFolder, true);
    updateSyncStatus({ status: 'synced', lastSynced: Date.now(), pendingChanges: Math.max(0, useAppStore.getState().syncStatus.pendingChanges - 1) });
  } catch (error) {
    console.error('Failed to create folder:', error);
    await addToSyncQueue('create', 'folders', newFolder);
    updateSyncStatus({ status: 'error', error: String(error) });
  }

  return newFolder;
}

export async function updateFolder(folderId: string, updates: Partial<Folder>): Promise<void> {
  const updatedFolder = { ...updates, updatedAt: Date.now() };
  
  useAppStore.getState().updateFolder(folderId, updatedFolder);
  const folder = useAppStore.getState().folders.find((f) => f.id === folderId);
  if (folder) await saveFolderOffline({ ...folder, ...updatedFolder });
  updateSyncStatus({ status: 'syncing', pendingChanges: useAppStore.getState().syncStatus.pendingChanges + 1 });

  try {
    await updateDoc(doc(db, FOLDERS_COLLECTION, folderId), updatedFolder);
    const updated = useAppStore.getState().folders.find((f) => f.id === folderId);
    if (updated) await saveFolderOffline(updated, true);
    updateSyncStatus({ status: 'synced', lastSynced: Date.now(), pendingChanges: Math.max(0, useAppStore.getState().syncStatus.pendingChanges - 1) });
  } catch (error) {
    console.error('Failed to update folder:', error);
    const currentFolder = useAppStore.getState().folders.find((f) => f.id === folderId);
    if (currentFolder) await addToSyncQueue('update', 'folders', { id: folderId, ...updatedFolder });
    updateSyncStatus({ status: 'error', error: String(error) });
  }
}

export async function deleteFolder(folderId: string): Promise<void> {
  // Move notes to uncategorized first
  const uncategorized = useAppStore.getState().folders.find((f) => f.name === 'Uncategorized');
  const notesToMove = useAppStore.getState().notes.filter((n) => n.folderId === folderId);
  
  for (const note of notesToMove) {
    await updateNote(note.id, { folderId: uncategorized?.id ?? 'uncategorized' });
  }

  useAppStore.getState().deleteFolder(folderId);
  await saveFolderOffline({ id: folderId } as Folder); // Will be filtered
  updateSyncStatus({ status: 'syncing', pendingChanges: useAppStore.getState().syncStatus.pendingChanges + 1 });

  try {
    await deleteDoc(doc(db, FOLDERS_COLLECTION, folderId));
    updateSyncStatus({ status: 'synced', lastSynced: Date.now(), pendingChanges: Math.max(0, useAppStore.getState().syncStatus.pendingChanges - 1) });
  } catch (error) {
    console.error('Failed to delete folder:', error);
    await addToSyncQueue('delete', 'folders', { id: folderId });
    updateSyncStatus({ status: 'error', error: String(error) });
  }
}

export async function reorderFolders(folderIds: string[]): Promise<void> {
  const batch = writeBatch(db);
  const userId = getUserId();
  
  folderIds.forEach((id, index) => {
    const folderRef = doc(db, FOLDERS_COLLECTION, id);
    batch.update(folderRef, { order: index, updatedAt: serverTimestamp() });
  });

  try {
    await batch.commit();
    useAppStore.getState().reorderFolders(folderIds);
    // Update offline
    for (let i = 0; i < folderIds.length; i++) {
      const folder = useAppStore.getState().folders.find((f) => f.id === folderIds[i]);
      if (folder) await saveFolderOffline({ ...folder, order: i }, true);
    }
  } catch (error) {
    console.error('Failed to reorder folders:', error);
  }
}

export async function reorderNotes(noteIds: string[]): Promise<void> {
  const batch = writeBatch(db);
  
  noteIds.forEach((id, index) => {
    const noteRef = doc(db, NOTES_COLLECTION, id);
    batch.update(noteRef, { order: index, updatedAt: serverTimestamp() });
  });

  try {
    await batch.commit();
    useAppStore.getState().reorderNotes(noteIds);
    // Update offline
    for (let i = 0; i < noteIds.length; i++) {
      const note = useAppStore.getState().notes.find((n) => n.id === noteIds[i]);
      if (note) await saveNoteOffline({ ...note, order: i }, true);
    }
  } catch (error) {
    console.error('Failed to reorder notes:', error);
  }
}

// User operations
export async function createUserProfile(user: User): Promise<void> {
  try {
    await setDoc(doc(db, USERS_COLLECTION, user.uid), userToFirestore(user));
    await saveUserOffline(user);
  } catch (error) {
    console.error('Failed to create user profile:', error);
  }
}

export async function updateUserSettings(settings: Partial<UserSettings>): Promise<void> {
  const userId = getUserId();
  const user = useAppStore.getState().user;
  if (!user) return;

  const updatedSettings = { ...user.settings, ...settings };
  useAppStore.getState().updateUserSettings(settings);

  try {
    await updateDoc(doc(db, USERS_COLLECTION, userId), { settings: updatedSettings });
    await saveUserOffline({ ...user, settings: updatedSettings });
  } catch (error) {
    console.error('Failed to update user settings:', error);
  }
}

// Sync queue processing
export async function processSyncQueue(): Promise<void> {
  if (!navigator.onLine) return;
  
  const queue = await getSyncQueue();
  for (const item of queue) {
    if (item.retries > 5) {
      await removeFromSyncQueue(item.id);
      continue;
    }

    try {
      if (item.collection === 'notes') {
        const data = item.data as Note;
        if (item.type === 'create') {
          await setDoc(doc(db, NOTES_COLLECTION, data.id), noteToFirestore(data));
        } else if (item.type === 'update') {
          await updateDoc(doc(db, NOTES_COLLECTION, data.id), data);
        } else if (item.type === 'delete') {
          await deleteDoc(doc(db, NOTES_COLLECTION, data.id));
        }
      } else if (item.collection === 'folders') {
        const data = item.data as Folder;
        if (item.type === 'create') {
          await setDoc(doc(db, FOLDERS_COLLECTION, data.id), folderToFirestore(data));
        } else if (item.type === 'update') {
          await updateDoc(doc(db, FOLDERS_COLLECTION, data.id), data);
        } else if (item.type === 'delete') {
          await deleteDoc(doc(db, FOLDERS_COLLECTION, data.id));
        }
      }
      await removeFromSyncQueue(item.id);
    } catch (error) {
      console.error('Sync queue item failed:', error);
      await incrementSyncRetry(item.id);
    }
  }

  updateSyncStatus({ status: 'synced', lastSynced: Date.now(), pendingChanges: 0 });
}

// Export/Import
export async function exportAllData(): Promise<string> {
  const userId = getUserId();
  const user = useAppStore.getState().user;
  const folders = useAppStore.getState().folders;
  const notes = useAppStore.getState().notes;

  const exportData = {
    version: '1.0',
    exportedAt: Date.now(),
    user: { uid: user?.uid, email: user?.email },
    folders,
    notes,
  };

  return JSON.stringify(exportData, null, 2);
}

export async function importData(json: string, options: { mergeStrategy: 'replace' | 'merge' | 'skip' } = { mergeStrategy: 'merge' }): Promise<void> {
  const data = JSON.parse(json) as { folders: Folder[]; notes: Note[] };
  const userId = getUserId();

  if (options.mergeStrategy === 'replace') {
    // Clear existing data
    stopRealtimeSync();
    // Note: In a real app, you'd batch delete from Firestore
    useAppStore.getState().setFolders([]);
    useAppStore.getState().setNotes([]);
    await clearAllData();
  }

  const batch = writeBatch(db);
  let hasChanges = false;

  for (const folder of data.folders) {
    if (folder.isInbox || folder.isArchive) continue; // Skip system folders
    
    const existing = useAppStore.getState().folders.find((f) => f.name === folder.name);
    if (existing && options.mergeStrategy === 'skip') continue;
    
    const folderId = existing?.id ?? `folder-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
    const folderData = { ...folder, id: folderId, userId, updatedAt: Date.now() };
    batch.set(doc(db, FOLDERS_COLLECTION, folderId), folderToFirestore(folderData));
    useAppStore.getState().addFolder(folderData);
    await saveFolderOffline(folderData);
    hasChanges = true;
  }

  for (const note of data.notes) {
    const noteId = `note-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
    const noteData = { ...note, id: noteId, userId, updatedAt: Date.now() };
    batch.set(doc(db, NOTES_COLLECTION, noteId), noteToFirestore(noteData));
    useAppStore.getState().addNote(noteData);
    await saveNoteOffline(noteData);
    hasChanges = true;
  }

  if (hasChanges) {
    await batch.commit();
    startRealtimeSync();
    updateSyncStatus({ status: 'synced', lastSynced: Date.now() });
  }
}

// Cleanup on logout
export async function cleanupOnLogout(): Promise<void> {
  stopRealtimeSync();
  await clearAllData();
  useAppStore.getState().setUser(null);
  useAppStore.getState().setFolders([]);
  useAppStore.getState().setNotes([]);
  useAppStore.getState().setActiveFolder(null);
  updateSyncStatus(defaultSyncStatus);
}

const defaultSyncStatus: import('../types').SyncStatus = {
  status: 'synced',
  pendingChanges: 0,
};