import { collection, deleteDoc, doc, getDocs, query, setDoc, where } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { generateId } from '../lib/utils';
import { useAppStore } from '../stores/appStore';
import type { Attachment } from '../types';
import { getUserId, trackWrite, updateNote } from './firebaseSync';

/*
 * Attachments are stored in Firestore (Cloud Storage needs a paid plan for
 * new projects). Bytes are base64-encoded and split across documents that
 * stay well under Firestore's 1 MiB document limit. The offline cache keeps
 * them, so attachments work offline like notes do.
 */

const CHUNKS_COLLECTION = 'attachmentChunks';
const CHUNK_CHARS = 700_000;
export const MAX_FILE_BYTES = 15 * 1024 * 1024;
export const MAX_ATTACHMENTS_PER_NOTE = 30;
const IMAGE_MAX_DIMENSION = 2000;
const THUMB_DIMENSION = 320;

// Decoded blobs by attachment id, so each attachment is fetched at most once per session
const blobCache = new Map<string, Blob>();
const pendingLoads = new Map<string, Promise<Blob>>();

const chunkId = (attachmentId: string, index: number) => `${attachmentId}_${index}`;

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',', 2)[1] ?? '');
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

function base64ToBlob(base64: string, type: string): Blob {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type });
}

function loadImage(blob: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Could not decode image'));
    };
    img.src = url;
  });
}

/** Draws the image scaled to fit `maxSide`; WebP where supported, JPEG otherwise (Safari). */
async function renderScaled(img: HTMLImageElement, maxSide: number, quality: number): Promise<Blob> {
  const scale = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
  const width = Math.max(1, Math.round(img.naturalWidth * scale));
  const height = Math.max(1, Math.round(img.naturalHeight * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  canvas.getContext('2d')!.drawImage(img, 0, 0, width, height);

  const toBlob = (type: string) =>
    new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, quality));
  const webp = await toBlob('image/webp');
  if (webp && webp.type === 'image/webp') return webp;
  const jpeg = await toBlob('image/jpeg');
  if (!jpeg) throw new Error('Could not encode image');
  return jpeg;
}

const blobToDataUrl = async (blob: Blob) => `data:${blob.type};base64,${await blobToBase64(blob)}`;

interface PreparedFile {
  blob: Blob;
  attachment: Omit<Attachment, 'chunks'>;
}

async function prepareFile(file: File): Promise<PreparedFile> {
  const base = {
    id: `att-${generateId()}`,
    name: file.name || (file.type.startsWith('image/') ? 'Pasted image' : 'File'),
    createdAt: Date.now(),
  };

  if (file.type.startsWith('image/') && file.type !== 'image/svg+xml') {
    try {
      const img = await loadImage(file);
      const thumb = await blobToDataUrl(await renderScaled(img, THUMB_DIMENSION, 0.7));
      // Keep GIFs (animation) and already-small images as they are; shrink big photos
      const keepOriginal =
        file.type === 'image/gif' ||
        (file.size <= 400 * 1024 && Math.max(img.naturalWidth, img.naturalHeight) <= IMAGE_MAX_DIMENSION);
      const blob = keepOriginal ? file : await renderScaled(img, IMAGE_MAX_DIMENSION, 0.85);
      const scale = keepOriginal ? 1 : Math.min(1, IMAGE_MAX_DIMENSION / Math.max(img.naturalWidth, img.naturalHeight));
      return {
        blob,
        attachment: {
          ...base,
          type: blob.type || file.type,
          size: blob.size,
          kind: 'image',
          width: Math.round(img.naturalWidth * scale),
          height: Math.round(img.naturalHeight * scale),
          thumb,
        },
      };
    } catch {
      // Formats the browser can't decode (e.g. HEIC on desktop) are kept as plain files
    }
  }

  return {
    blob: file,
    attachment: { ...base, type: file.type || 'application/octet-stream', size: file.size, kind: 'file' },
  };
}

export class AttachmentError extends Error {}

/** Attach files (picked, pasted or dropped) to a note. Returns the attachments that were added. */
export async function addAttachments(noteId: string, files: File[]): Promise<Attachment[]> {
  const userId = getUserId();
  const note = useAppStore.getState().notes.find((n) => n.id === noteId);
  if (!note) throw new AttachmentError('Note not found');

  const existing = note.attachments ?? [];
  if (existing.length + files.length > MAX_ATTACHMENTS_PER_NOTE) {
    throw new AttachmentError(`A note can have at most ${MAX_ATTACHMENTS_PER_NOTE} attachments`);
  }
  const tooBig = files.find((f) => f.size > MAX_FILE_BYTES);
  if (tooBig) throw new AttachmentError(`"${tooBig.name}" is larger than 15 MB`);

  const added: Attachment[] = [];
  for (const file of files) {
    const { blob, attachment } = await prepareFile(file);
    const base64 = await blobToBase64(blob);
    const chunks = Math.max(1, Math.ceil(base64.length / CHUNK_CHARS));

    for (let i = 0; i < chunks; i++) {
      trackWrite(
        setDoc(doc(db, CHUNKS_COLLECTION, chunkId(attachment.id, i)), {
          userId,
          noteId,
          attachmentId: attachment.id,
          index: i,
          data: base64.slice(i * CHUNK_CHARS, (i + 1) * CHUNK_CHARS),
        })
      );
    }

    blobCache.set(attachment.id, blob);
    added.push({ ...attachment, chunks });
  }

  // Re-read in case the note changed while files were being processed
  const current = useAppStore.getState().notes.find((n) => n.id === noteId)?.attachments ?? existing;
  await updateNote(noteId, { attachments: [...current, ...added] });
  return added;
}

/** Load an attachment's bytes (from memory, the offline cache or the server). */
export function loadAttachmentBlob(attachment: Attachment): Promise<Blob> {
  const cached = blobCache.get(attachment.id);
  if (cached) return Promise.resolve(cached);
  const pending = pendingLoads.get(attachment.id);
  if (pending) return pending;

  const load = (async () => {
    const snap = await getDocs(
      query(
        collection(db, CHUNKS_COLLECTION),
        where('userId', '==', getUserId()),
        where('attachmentId', '==', attachment.id)
      )
    );
    const parts = snap.docs
      .map((d) => d.data() as { index: number; data: string })
      .sort((a, b) => a.index - b.index);
    if (parts.length < attachment.chunks) throw new AttachmentError('Attachment is still syncing or missing');
    const blob = base64ToBlob(parts.map((p) => p.data).join(''), attachment.type);
    blobCache.set(attachment.id, blob);
    return blob;
  })();

  pendingLoads.set(attachment.id, load);
  load.finally(() => pendingLoads.delete(attachment.id)).catch(() => {});
  return load;
}

function deleteChunks(attachment: Attachment) {
  blobCache.delete(attachment.id);
  for (let i = 0; i < attachment.chunks; i++) {
    trackWrite(deleteDoc(doc(db, CHUNKS_COLLECTION, chunkId(attachment.id, i))));
  }
}

export async function removeAttachment(noteId: string, attachmentId: string): Promise<void> {
  const note = useAppStore.getState().notes.find((n) => n.id === noteId);
  const attachment = note?.attachments?.find((a) => a.id === attachmentId);
  if (!note || !attachment) return;
  await updateNote(noteId, { attachments: (note.attachments ?? []).filter((a) => a.id !== attachmentId) });
  deleteChunks(attachment);
}

export async function downloadAttachment(attachment: Attachment): Promise<void> {
  const blob = await loadAttachmentBlob(attachment);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = attachment.name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
