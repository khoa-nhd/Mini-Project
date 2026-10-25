import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  deleteField,
  query,
  where,
  onSnapshot,
  writeBatch,
  Timestamp,
  DocumentSnapshot,
  QuerySnapshot,
} from 'firebase/firestore';
import { db, auth } from '../lib/firebase';
import type { Note, Folder, User, UserSettings, SyncStatus, ExportData } from '../types';
import { DEFAULT_FOLDERS } from '../types';
import {
  getNotesOffline,
  getFoldersOffline,
  getUserOffline,
  saveNoteOffline,
  saveFolderOffline,
  saveUserOffline,
  deleteNoteOffline,
  deleteFolderOffline,
  clearAllData,
  addToSyncQueue,
  getSyncQueue,
  removeFromSyncQueue,
  incrementSyncRetry,
  setSyncStatus,
} from '../lib/offline-db';
import { useAppStore } from '../stores/appStore';
import { generateId } from '../lib/utils';
import { deleteChunks } from './attachments';

const NOTES_COLLECTION = 'notes';
const FOLDERS_COLLECTION = 'folders';
const USERS_COLLECTION = 'users';
const ATTACHMENT_CHUNKS_COLLECTION = 'attachmentChunks';

// Firestore caps a write batch at 500 operations
const BATCH_LIMIT = 450;

export const DEFAULT_USER_SETTINGS: UserSettings = {
  theme: 'dark',
  shortcutsEnabled: true,
  autoSaveDelay: 1500,
  sortOrder: 'manual',
};

const defaultSyncStatus: SyncStatus = {
  status: 'synced',
  pendingChanges: 0,
};

export function getUserId(): string {
  const user = auth.currentUser;
  if (!user) throw new Error('User not authenticated');
  return user.uid;
}

// Timestamps may be Firestore Timestamps (normal writes) or plain numbers
// (older writes from previous versions of the app). Accept both.
function toMillis(value: unknown): number | undefined {
  if (value == null) return undefined;
  if (typeof value === 'number') return value;
  if (value instanceof Timestamp) return value.toMillis();
  if (typeof (value as { toMillis?: unknown }).toMillis === 'function') {
    return (value as { toMillis: () => number }).toMillis();
  }
  return undefined;
}

const TIMESTAMP_FIELDS = ['createdAt', 'updatedAt', 'deletedAt', 'archivedAt'] as const;

// Convert a partial update into Firestore field values
function toFirestoreUpdate<T extends Record<string, unknown>>(updates: T): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(updates)) {
    if (key === 'id') continue;
    if ((TIMESTAMP_FIELDS as readonly string[]).includes(key)) {
      result[key] = typeof value === 'number' ? Timestamp.fromMillis(value) : deleteField();
    } else if (value === undefined) {
      result[key] = deleteField();
    } else {
      result[key] = value;
    }
  }
  return result;
}

function noteToFirestore(note: Note) {
  const { id: _id, deletedAt, archivedAt, ...rest } = note;
  return {
    ...rest,
    createdAt: Timestamp.fromMillis(note.createdAt),
    updatedAt: Timestamp.fromMillis(note.updatedAt),
    ...(deletedAt ? { deletedAt: Timestamp.fromMillis(deletedAt) } : {}),
    ...(archivedAt ? { archivedAt: Timestamp.fromMillis(archivedAt) } : {}),
  };
}

function noteFromFirestore(snap: DocumentSnapshot): Note {
  const data = snap.data()!;
  const content = typeof data.content === 'string' ? data.content : '';
  return {
    ...data,
    id: snap.id,
    title: typeof data.title === 'string' ? data.title : '',
    content,
    order: typeof data.order === 'number' ? data.order : 0,
    pinned: !!data.pinned,
    wordCount: typeof data.wordCount === 'number' ? data.wordCount : 0,
    charCount: typeof data.charCount === 'number' ? data.charCount : content.length,
    createdAt: toMillis(data.createdAt) ?? Date.now(),
    updatedAt: toMillis(data.updatedAt) ?? Date.now(),
    deletedAt: toMillis(data.deletedAt),
    archivedAt: toMillis(data.archivedAt),
  } as Note;
}

function folderToFirestore(folder: Folder) {
  const { id: _id, ...rest } = folder;
  return {
    ...rest,
    createdAt: Timestamp.fromMillis(folder.createdAt),
    updatedAt: Timestamp.fromMillis(folder.updatedAt),
  };
}

function folderFromFirestore(snap: DocumentSnapshot): Folder {
  const data = snap.data()!;
  return {
    ...data,
    id: snap.id,
    isInbox: !!data.isInbox,
    isArchive: !!data.isArchive,
    order: typeof data.order === 'number' ? data.order : 0,
    createdAt: toMillis(data.createdAt) ?? Date.now(),
    updatedAt: toMillis(data.updatedAt) ?? Date.now(),
  } as Folder;
}

function userToFirestore(user: User) {
  return {
    ...user,
    createdAt: Timestamp.fromMillis(user.createdAt),
  };
}

function userFromFirestore(snap: DocumentSnapshot): User {
  const data = snap.data()!;
  return {
    ...data,
    uid: snap.id,
    createdAt: toMillis(data.createdAt) ?? Date.now(),
    settings: { ...DEFAULT_USER_SETTINGS, ...(data.settings ?? {}) },
  } as User;
}

const byOrder = (a: { order: number }, b: { order: number }) => a.order - b.order;

// Sync status helpers
function updateSyncStatus(partial: Partial<SyncStatus>) {
  useAppStore.getState().setSyncStatus(partial);
  setSyncStatus(useAppStore.getState().syncStatus).catch(() => {});
}

/**
 * Send a write to Firestore without blocking the UI. With the offline cache,
 * Firestore applies writes locally right away but only resolves the promise
 * once the server acknowledges, which never happens while offline. So the
 * caller updates local state first, and we track the server ack here.
 */
export function trackWrite(write: Promise<unknown>, onError?: () => Promise<void>): void {
  const pending = useAppStore.getState().syncStatus.pendingChanges + 1;
  updateSyncStatus({ status: navigator.onLine ? 'syncing' : 'offline', pendingChanges: pending });

  write
    .then(() => {
      const left = Math.max(0, useAppStore.getState().syncStatus.pendingChanges - 1);
      updateSyncStatus({
        pendingChanges: left,
        ...(left === 0 ? { status: 'synced', lastSynced: Date.now(), error: undefined } : {}),
      });
    })
    .catch(async (error) => {
      console.error('Sync write failed:', error);
      try {
        await onError?.();
      } catch (queueError) {
        console.error('Failed to queue write:', queueError);
      }
      updateSyncStatus({
        status: 'error',
        error: String(error),
        pendingChanges: Math.max(0, useAppStore.getState().syncStatus.pendingChanges - 1),
      });
    });
}

async function commitInChunks(ops: Array<(batch: ReturnType<typeof writeBatch>) => void>): Promise<void> {
  for (let i = 0; i < ops.length; i += BATCH_LIMIT) {
    const batch = writeBatch(db);
    ops.slice(i, i + BATCH_LIMIT).forEach((op) => op(batch));
    await batch.commit();
  }
}

// Make sure the user has the Inbox and Archive folders.
// IDs are deterministic per user so two devices never create duplicates.
async function ensureDefaultFolders(userId: string, folders: Folder[]): Promise<Folder[]> {
  const now = Date.now();
  const missing: Folder[] = [];

  for (const def of DEFAULT_FOLDERS) {
    const exists = folders.some((f) =>
      def.isInbox ? f.isInbox : def.isArchive ? f.isArchive : f.name === def.name && !f.isInbox && !f.isArchive
    );
    if (!exists) {
      missing.push({
        ...def,
        id: `${def.name.toLowerCase()}-${userId}`,
        userId,
        createdAt: now,
        updatedAt: now,
      });
    }
  }

  if (missing.length === 0) return folders;

  for (const folder of missing) {
    await saveFolderOffline(folder);
    trackWrite(setDoc(doc(db, FOLDERS_COLLECTION, folder.id), folderToFirestore(folder)));
  }
  return [...folders, ...missing].sort(byOrder);
}

// Older versions created an "Uncategorized" folder for every user. It is no
// longer a default: delete it; repairOrphanNotes then moves its notes to Inbox.
async function removeLegacyUncategorized(userId: string, folders: Folder[]): Promise<Folder[]> {
  const legacyId = `uncategorized-${userId}`;
  if (!folders.some((f) => f.id === legacyId)) return folders;

  await deleteFolderOffline(legacyId);
  trackWrite(deleteDoc(doc(db, FOLDERS_COLLECTION, legacyId)));
  return folders.filter((f) => f.id !== legacyId);
}

const THIRTY_DAYS = 30 * 24 * 60 * 60 * 1000;

function checkExpiredAttachments(notes: Note[], folders: Folder[]): Note[] {
  const archiveFolderIds = new Set(folders.filter((f) => f.isArchive || f.name.toLowerCase() === 'archive').map((f) => f.id));
  const now = Date.now();

  return notes.map((note) => {
    if (!archiveFolderIds.has(note.folderId)) return note;
    if (!note.attachments || note.attachments.length === 0) return note;

    const archiveTime = note.archivedAt ?? note.updatedAt ?? note.createdAt;
    if (now - archiveTime > THIRTY_DAYS) {
      for (const att of note.attachments) {
        deleteChunks(att);
      }
      const fixed: Note = { ...note, attachments: [] };
      trackWrite(
        updateDoc(doc(db, NOTES_COLLECTION, note.id), toFirestoreUpdate({ attachments: [] }))
      );
      return fixed;
    }
    return note;
  });
}

// Notes from older versions could reference folders that don't exist
// (e.g. folderId "archive") or be soft-deleted. Move them somewhere visible.
function repairOrphanNotes(notes: Note[], folders: Folder[]): Note[] {
  const folderIds = new Set(folders.map((f) => f.id));
  const inbox = folders.find((f) => f.isInbox);
  const archive = folders.find((f) => f.isArchive);
  if (!inbox) return notes;

  return notes.map((note) => {
    let target: string | null = null;
    if (note.deletedAt) target = archive?.id ?? inbox.id;
    else if (!folderIds.has(note.folderId)) target = note.folderId === 'archive' && archive ? archive.id : inbox.id;
    if (!target) return note;

    const fixed: Note = { ...note, folderId: target, deletedAt: undefined };
    trackWrite(
      updateDoc(doc(db, NOTES_COLLECTION, note.id), toFirestoreUpdate({ folderId: target, deletedAt: undefined }))
    );
    return fixed;
  });
}

function pickActiveFolder(folders: Folder[]) {
  const { activeFolderId, setActiveFolder } = useAppStore.getState();
  if (activeFolderId && folders.some((f) => f.id === activeFolderId)) return;
  const inbox = folders.find((f) => f.isInbox);
  setActiveFolder(inbox?.id ?? folders[0]?.id ?? null);
}

// Initial full sync
export async function performInitialSync(): Promise<void> {
  const userId = getUserId();
  updateSyncStatus({ status: 'syncing' });

  try {
    // User profile (create it if this is the first sign-in)
    const userRef = doc(db, USERS_COLLECTION, userId);
    const userSnap = await getDoc(userRef);
    let user: User;
    if (userSnap.exists()) {
      user = userFromFirestore(userSnap);
    } else {
      const fbUser = auth.currentUser!;
      user = {
        uid: userId,
        email: fbUser.email ?? '',
        displayName: fbUser.displayName ?? undefined,
        createdAt: Date.now(),
        settings: DEFAULT_USER_SETTINGS,
      };
      trackWrite(setDoc(userRef, userToFirestore(user), { merge: true }));
    }
    useAppStore.getState().setUser(user);
    useAppStore.getState().setShortcutsEnabled(user.settings.shortcutsEnabled);
    await saveUserOffline(user);

    // Folders (sorted client-side so no composite index is needed)
    const foldersSnapshot = await getDocs(query(collection(db, FOLDERS_COLLECTION), where('userId', '==', userId)));
    let folders = foldersSnapshot.docs.map(folderFromFirestore).sort(byOrder);
    folders = await ensureDefaultFolders(userId, folders);
    folders = await removeLegacyUncategorized(userId, folders);
    useAppStore.getState().setFolders(folders);
    for (const folder of folders) {
      await saveFolderOffline(folder, true);
    }

    // Notes
    const notesSnapshot = await getDocs(query(collection(db, NOTES_COLLECTION), where('userId', '==', userId)));
    let notes = repairOrphanNotes(notesSnapshot.docs.map(noteFromFirestore), folders);
    notes = checkExpiredAttachments(notes, folders).sort(byOrder);
    useAppStore.getState().setNotes(notes);
    for (const note of notes) {
      await saveNoteOffline(note, true);
    }

    pickActiveFolder(folders);

    if (useAppStore.getState().syncStatus.pendingChanges === 0) {
      updateSyncStatus({ status: 'synced', lastSynced: Date.now(), error: undefined });
    }
  } catch (error) {
    console.error('Initial sync failed:', error);
    updateSyncStatus({ status: navigator.onLine ? 'error' : 'offline', error: String(error) });

    // Load from offline as fallback
    await loadFromOffline(userId);
  }
}

// Load from offline storage
export async function loadFromOffline(userId: string): Promise<void> {
  try {
    const [user, folders, notesRaw] = await Promise.all([
      getUserOffline(userId),
      getFoldersOffline(userId),
      getNotesOffline(userId),
    ]);

    if (user) useAppStore.getState().setUser(user);
    if (folders.length > 0) {
      useAppStore.getState().setFolders(folders);
      pickActiveFolder(folders);
    }
    if (notesRaw.length > 0) {
      const notes = folders.length > 0 ? checkExpiredAttachments(notesRaw, folders) : notesRaw;
      useAppStore.getState().setNotes(notes);
    }
  } catch (error) {
    console.error('Failed to load from offline:', error);
  }
}

// Real-time listeners
let unsubscribeNotes: (() => void) | null = null;
let unsubscribeFolders: (() => void) | null = null;

export function startRealtimeSync(): void {
  stopRealtimeSync();
  const userId = getUserId();
  if (!userId) {
    console.warn('startRealtimeSync: no userId, skipping');
    return;
  }
  // Force initial load from server in case listener misses early docs
  const initialNotesQuery = query(collection(db, NOTES_COLLECTION), where('userId', '==', userId));
  getDocs(initialNotesQuery).then((snap) => {
    const store = useAppStore.getState();
    snap.forEach((docSnap) => {
      const n = noteFromFirestore(docSnap);
      if (!store.notes.some((note) => note.id === n.id)) {
        store.addNote(n);
        saveNoteOffline(n, true).catch(() => {});
      } else if (store.notes.find((note) => note.id === n.id)?.updatedAt !== n.updatedAt) {
        store.updateNote(n.id, n);
        saveNoteOffline(n, true).catch(() => {});
      }
    });
  }).catch((err) => console.error('Initial notes load error:', err));

  unsubscribeNotes = onSnapshot(
    query(collection(db, NOTES_COLLECTION), where('userId', '==', userId)),
    (snapshot: QuerySnapshot) => {
      const store = useAppStore.getState();
      for (const change of snapshot.docChanges()) {
        const note = noteFromFirestore(change.doc);
        if (change.type === 'removed') {
          store.deleteNote(note.id);
          deleteNoteOffline(note.id).catch(() => {});
        } else if (useAppStore.getState().notes.some((n) => n.id === note.id)) {
          store.updateNote(note.id, note);
          saveNoteOffline(note, true).catch(() => {});
        } else {
          store.addNote(note);
          saveNoteOffline(note, true).catch(() => {});
        }
      }
    },
    (error) => {
      console.error('Notes listener error:', error);
      updateSyncStatus({ status: 'error', error: String(error) });
    }
  );

  unsubscribeFolders = onSnapshot(
    query(collection(db, FOLDERS_COLLECTION), where('userId', '==', userId)),
    (snapshot: QuerySnapshot) => {
      const store = useAppStore.getState();
      for (const change of snapshot.docChanges()) {
        const folder = folderFromFirestore(change.doc);
        if (change.type === 'removed') {
          store.deleteFolder(folder.id);
          deleteFolderOffline(folder.id).catch(() => {});
        } else if (useAppStore.getState().folders.some((f) => f.id === folder.id)) {
          store.updateFolder(folder.id, folder);
          saveFolderOffline(folder, true).catch(() => {});
        } else {
          store.addFolder(folder);
          saveFolderOffline(folder, true).catch(() => {});
        }
      }
      // Keep folders sorted after remote reorders
      store.setFolders([...useAppStore.getState().folders].sort(byOrder));
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
export async function createNote(note: Omit<Note, 'id' | 'userId' | 'createdAt' | 'updatedAt'>): Promise<Note> {
  const userId = getUserId();
  const now = Date.now();
  const newNote: Note = {
    ...note,
    id: `note-${generateId()}`,
    userId,
    createdAt: now,
    updatedAt: now,
  };

  // Optimistic update
  useAppStore.getState().addNote(newNote);
  await saveNoteOffline(newNote);

  trackWrite(setDoc(doc(db, NOTES_COLLECTION, newNote.id), noteToFirestore(newNote)), () =>
    addToSyncQueue('create', 'notes', newNote)
  );

  return newNote;
}

/** Create an empty note at the top of the given (or active) folder and select it. */
export async function createNewNote(folderId?: string): Promise<Note | null> {
  const state = useAppStore.getState();
  const active = state.folders.find((f) => f.id === state.activeFolderId);
  const inbox = state.folders.find((f) => f.isInbox);
  // New notes never go straight into the archive
  const targetFolderId = folderId ?? (active && !active.isArchive ? active.id : inbox?.id ?? state.folders[0]?.id);
  if (!targetFolderId) return null;

  const folderNotes = state.notes.filter((n) => n.folderId === targetFolderId);
  const minOrder = folderNotes.reduce((min, n) => Math.min(min, n.order), 0);

  const note = await createNote({
    folderId: targetFolderId,
    title: '',
    content: '',
    order: minOrder - 1,
    pinned: false,
    wordCount: 0,
    charCount: 0,
  });

  const store = useAppStore.getState();
  store.clearSearch();
  if (store.activeFolderId !== targetFolderId) store.setActiveFolder(targetFolderId);
  store.setSelectedNote(note.id);
  window.dispatchEvent(new CustomEvent('quicknotes:focus-title'));
  return note;
}

export async function updateNote(noteId: string, updates: Partial<Note>): Promise<void> {
  const updatedFields: Partial<Note> = { ...updates, updatedAt: Date.now() };

  // Optimistic update
  useAppStore.getState().updateNote(noteId, updatedFields);
  const note = useAppStore.getState().notes.find((n) => n.id === noteId);
  if (!note) return;
  await saveNoteOffline(note);

  trackWrite(updateDoc(doc(db, NOTES_COLLECTION, noteId), toFirestoreUpdate(updatedFields)), () =>
    addToSyncQueue('update', 'notes', { id: noteId, ...updatedFields })
  );
}

/** Permanently delete a note. */
export async function deleteNote(noteId: string): Promise<void> {
  // Attachment bytes live in their own documents; remove them with the note
  const attachments = useAppStore.getState().notes.find((n) => n.id === noteId)?.attachments ?? [];
  for (const attachment of attachments) {
    for (let i = 0; i < attachment.chunks; i++) {
      trackWrite(deleteDoc(doc(db, ATTACHMENT_CHUNKS_COLLECTION, `${attachment.id}_${i}`)));
    }
  }
  useAppStore.getState().deleteNote(noteId);
  await deleteNoteOffline(noteId);

  trackWrite(deleteDoc(doc(db, NOTES_COLLECTION, noteId)), () => addToSyncQueue('delete', 'notes', { id: noteId }));
}

/** Move a note to Archive, or back to Inbox if it is already archived. */
export async function toggleArchiveNote(noteId: string): Promise<void> {
  const { notes, folders } = useAppStore.getState();
  const note = notes.find((n) => n.id === noteId);
  const archive = folders.find((f) => f.isArchive || f.name.toLowerCase() === 'archive');
  const inbox = folders.find((f) => f.isInbox || f.name.toLowerCase() === 'inbox');
  if (!note || !archive || !inbox) return;

  const isArchived = note.folderId === archive.id;
  const now = Date.now();
  await updateNote(noteId, {
    folderId: isArchived ? inbox.id : archive.id,
    pinned: false,
    archivedAt: isArchived ? undefined : now,
  });

  if (!isArchived && note.attachments && note.attachments.length > 0) {
    window.dispatchEvent(
      new CustomEvent('quicknotes:toast', {
        detail: {
          type: 'warning',
          message: `Ghi chú có ${note.attachments.length} file đính kèm sẽ hết hạn và tự động xóa sau 30 ngày trong Archive.`,
          duration: 6000,
        },
      })
    );
  }

  if (useAppStore.getState().selectedNoteId === noteId) {
    useAppStore.getState().setSelectedNote(null);
  }
}

// Folder operations
export async function createFolder(folder: Omit<Folder, 'id' | 'userId' | 'createdAt' | 'updatedAt'>): Promise<Folder> {
  const userId = getUserId();
  const now = Date.now();
  const newFolder: Folder = {
    ...folder,
    id: `folder-${generateId()}`,
    userId,
    createdAt: now,
    updatedAt: now,
  };

  useAppStore.getState().addFolder(newFolder);
  await saveFolderOffline(newFolder);

  trackWrite(setDoc(doc(db, FOLDERS_COLLECTION, newFolder.id), folderToFirestore(newFolder)), () =>
    addToSyncQueue('create', 'folders', newFolder)
  );

  return newFolder;
}

export async function updateFolder(folderId: string, updates: Partial<Folder>): Promise<void> {
  const updatedFields: Partial<Folder> = { ...updates, updatedAt: Date.now() };

  useAppStore.getState().updateFolder(folderId, updatedFields);
  const folder = useAppStore.getState().folders.find((f) => f.id === folderId);
  if (!folder) return;
  await saveFolderOffline(folder);

  trackWrite(updateDoc(doc(db, FOLDERS_COLLECTION, folderId), toFirestoreUpdate(updatedFields)), () =>
    addToSyncQueue('update', 'folders', { id: folderId, ...updatedFields })
  );
}

/** Delete a folder; its notes are moved to Inbox. */
export async function deleteFolder(folderId: string): Promise<void> {
  const { folders, notes } = useAppStore.getState();
  const folder = folders.find((f) => f.id === folderId);
  if (!folder || folder.isInbox || folder.isArchive) return;

  const inbox = folders.find((f) => f.isInbox);
  if (inbox) {
    for (const note of notes.filter((n) => n.folderId === folderId)) {
      await updateNote(note.id, { folderId: inbox.id });
    }
  }

  useAppStore.getState().deleteFolder(folderId);
  if (!useAppStore.getState().activeFolderId && inbox) {
    useAppStore.getState().setActiveFolder(inbox.id);
  }
  await deleteFolderOffline(folderId);

  trackWrite(deleteDoc(doc(db, FOLDERS_COLLECTION, folderId)), () =>
    addToSyncQueue('delete', 'folders', { id: folderId })
  );
}

export async function reorderFolders(folderIds: string[], startOrder = 0): Promise<void> {
  const now = Date.now();
  const store = useAppStore.getState();
  folderIds.forEach((id, index) => store.updateFolder(id, { order: startOrder + index, updatedAt: now }));
  store.setFolders([...useAppStore.getState().folders].sort(byOrder));

  const batch = writeBatch(db);
  folderIds.forEach((id, index) => {
    batch.update(doc(db, FOLDERS_COLLECTION, id), { order: startOrder + index, updatedAt: Timestamp.fromMillis(now) });
  });
  trackWrite(batch.commit());

  for (const id of folderIds) {
    const folder = useAppStore.getState().folders.find((f) => f.id === id);
    if (folder) await saveFolderOffline(folder);
  }
}

export async function reorderNotes(noteIds: string[]): Promise<void> {
  const store = useAppStore.getState();
  noteIds.forEach((id, index) => store.updateNote(id, { order: index }));

  const batch = writeBatch(db);
  noteIds.forEach((id, index) => {
    batch.update(doc(db, NOTES_COLLECTION, id), { order: index });
  });
  trackWrite(batch.commit());

  for (const id of noteIds) {
    const note = useAppStore.getState().notes.find((n) => n.id === id);
    if (note) await saveNoteOffline(note);
  }
}

// User operations
export async function createUserProfile(user: User): Promise<void> {
  try {
    await setDoc(doc(db, USERS_COLLECTION, user.uid), userToFirestore(user), { merge: true });
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
  await saveUserOffline({ ...user, settings: updatedSettings });

  trackWrite(setDoc(doc(db, USERS_COLLECTION, userId), { settings: updatedSettings }, { merge: true }));
}

// Sync queue processing
export async function processSyncQueue(): Promise<void> {
  if (!navigator.onLine || !auth.currentUser) return;

  const queue = await getSyncQueue();
  for (const item of queue) {
    if (item.retries > 5) {
      await removeFromSyncQueue(item.id);
      continue;
    }

    try {
      const data = item.data as { id: string } & Record<string, unknown>;
      const collectionName = item.collection === 'notes' ? NOTES_COLLECTION : FOLDERS_COLLECTION;
      const ref = doc(db, collectionName, data.id);

      if (item.type === 'create') {
        await setDoc(
          ref,
          item.collection === 'notes' ? noteToFirestore(data as unknown as Note) : folderToFirestore(data as unknown as Folder)
        );
      } else if (item.type === 'update') {
        await updateDoc(ref, toFirestoreUpdate(data));
      } else {
        await deleteDoc(ref);
      }
      await removeFromSyncQueue(item.id);
    } catch (error) {
      console.error('Sync queue item failed:', error);
      await incrementSyncRetry(item.id);
    }
  }

  if (useAppStore.getState().syncStatus.status !== 'syncing') {
    updateSyncStatus({ status: 'synced', lastSynced: Date.now(), error: undefined });
  }
}

// Export/Import
export async function exportAllData(): Promise<string> {
  const { user, folders, notes } = useAppStore.getState();

  const exportData: ExportData = {
    version: '1.0',
    exportedAt: Date.now(),
    user: { uid: user?.uid ?? '', email: user?.email ?? '' },
    folders,
    notes,
  };

  return JSON.stringify(exportData, null, 2);
}

export async function importData(
  data: { folders?: Folder[]; notes?: Note[] },
  options: { mergeStrategy: 'replace' | 'merge' | 'skip' } = { mergeStrategy: 'merge' }
): Promise<{ folders: number; notes: number }> {
  const userId = getUserId();
  const importFolders = Array.isArray(data.folders) ? data.folders : [];
  const importNotes = Array.isArray(data.notes) ? data.notes : [];
  if (importFolders.length === 0 && importNotes.length === 0) {
    throw new Error('No notes or folders found in file');
  }

  const ops: Array<(batch: ReturnType<typeof writeBatch>) => void> = [];
  const store = useAppStore.getState();

  if (options.mergeStrategy === 'replace') {
    // Delete all notes and custom folders, keep system folders
    for (const note of store.notes) {
      ops.push((b) => b.delete(doc(db, NOTES_COLLECTION, note.id)));
      store.deleteNote(note.id);
      await deleteNoteOffline(note.id);
    }
    for (const folder of store.folders.filter((f) => !f.isInbox && !f.isArchive)) {
      ops.push((b) => b.delete(doc(db, FOLDERS_COLLECTION, folder.id)));
      store.deleteFolder(folder.id);
      await deleteFolderOffline(folder.id);
    }
  }

  const currentFolders = useAppStore.getState().folders;
  const inbox = currentFolders.find((f) => f.isInbox);
  const archive = currentFolders.find((f) => f.isArchive);
  const folderMap = new Map<string, string>(); // imported folder id -> local folder id
  let folderCount = 0;
  let noteCount = 0;
  const now = Date.now();

  for (const folder of importFolders) {
    if (!folder?.id) continue;
    if (folder.isInbox && inbox) { folderMap.set(folder.id, inbox.id); continue; }
    if (folder.isArchive && archive) { folderMap.set(folder.id, archive.id); continue; }

    const existing = useAppStore.getState().folders.find((f) => f.name === folder.name && !f.isInbox && !f.isArchive);
    if (existing) {
      folderMap.set(folder.id, existing.id);
      continue;
    }

    const newFolder: Folder = {
      ...folder,
      id: `folder-${generateId()}`,
      userId,
      isInbox: false,
      isArchive: false,
      order: typeof folder.order === 'number' ? folder.order : useAppStore.getState().folders.length,
      createdAt: typeof folder.createdAt === 'number' ? folder.createdAt : now,
      updatedAt: now,
    };
    folderMap.set(folder.id, newFolder.id);
    ops.push((b) => b.set(doc(db, FOLDERS_COLLECTION, newFolder.id), folderToFirestore(newFolder)));
    useAppStore.getState().addFolder(newFolder);
    await saveFolderOffline(newFolder);
    folderCount++;
  }

  for (const note of importNotes) {
    if (!note || typeof note.content !== 'string') continue;
    const existing = useAppStore.getState().notes.find((n) => n.id === note.id);
    if (existing && options.mergeStrategy === 'skip') continue;

    const folderId = folderMap.get(note.folderId) ?? (currentFolders.some((f) => f.id === note.folderId) ? note.folderId : inbox?.id);
    if (!folderId) continue;

    const noteData: Note = {
      ...note,
      id: existing ? existing.id : `note-${generateId()}`,
      userId,
      folderId,
      title: note.title ?? '',
      pinned: !!note.pinned,
      order: typeof note.order === 'number' ? note.order : 0,
      wordCount: typeof note.wordCount === 'number' ? note.wordCount : 0,
      charCount: typeof note.charCount === 'number' ? note.charCount : note.content.length,
      createdAt: typeof note.createdAt === 'number' ? note.createdAt : now,
      updatedAt: now,
      deletedAt: undefined,
    };
    ops.push((b) => b.set(doc(db, NOTES_COLLECTION, noteData.id), noteToFirestore(noteData)));
    if (existing) useAppStore.getState().updateNote(noteData.id, noteData);
    else useAppStore.getState().addNote(noteData);
    await saveNoteOffline(noteData);
    noteCount++;
  }

  if (ops.length > 0) {
    trackWrite(commitInChunks(ops));
  }
  return { folders: folderCount, notes: noteCount };
}

/** Delete every note, folder and the profile of the current user from Firestore. */
export async function deleteAllUserData(): Promise<void> {
  const userId = getUserId();
  stopRealtimeSync();

  const [notesSnap, foldersSnap, chunksSnap] = await Promise.all([
    getDocs(query(collection(db, NOTES_COLLECTION), where('userId', '==', userId))),
    getDocs(query(collection(db, FOLDERS_COLLECTION), where('userId', '==', userId))),
    getDocs(query(collection(db, ATTACHMENT_CHUNKS_COLLECTION), where('userId', '==', userId))),
  ]);

  const ops: Array<(batch: ReturnType<typeof writeBatch>) => void> = [
    ...chunksSnap.docs.map((d) => (b: ReturnType<typeof writeBatch>) => b.delete(d.ref)),
    ...notesSnap.docs.map((d) => (b: ReturnType<typeof writeBatch>) => b.delete(d.ref)),
    ...foldersSnap.docs.map((d) => (b: ReturnType<typeof writeBatch>) => b.delete(d.ref)),
    (b) => b.delete(doc(db, USERS_COLLECTION, userId)),
  ];
  await commitInChunks(ops);
}

// Cleanup on logout
export async function cleanupOnLogout(): Promise<void> {
  stopRealtimeSync();
  await clearAllData();
  const store = useAppStore.getState();
  store.setUser(null);
  store.setFolders([]);
  store.setNotes([]);
  store.setActiveFolder(null);
  store.setSelectedNote(null);
  store.clearSearch();
  updateSyncStatus(defaultSyncStatus);
}
