import { useEffect, useState } from 'react';
import { Download, File as FileIcon, FileText, FileArchive, FileAudio, FileVideo, Loader2, X } from 'lucide-react';
import { Modal } from './ui/Modal';
import { Button } from './ui/Button';
import { useToast } from './ui/Toast';
import type { Attachment } from '../types';
import { downloadAttachment, formatBytes, loadAttachmentBlob, removeAttachment } from '../services/attachments';

function fileIconFor(type: string) {
  if (type.startsWith('video/')) return FileVideo;
  if (type.startsWith('audio/')) return FileAudio;
  if (type.includes('zip') || type.includes('compressed') || type.includes('tar')) return FileArchive;
  if (type.startsWith('text/') || type.includes('pdf') || type.includes('document') || type.includes('sheet')) return FileText;
  return FileIcon;
}

/** Object URL for an attachment's full bytes, revoked on unmount. */
function useAttachmentUrl(attachment: Attachment | null) {
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!attachment) return;
    let objectUrl: string | null = null;
    let cancelled = false;
    loadAttachmentBlob(attachment)
      .then((blob) => {
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setUrl(objectUrl);
      })
      .catch(() => !cancelled && setError(true));
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      setUrl(null);
      setError(false);
    };
  }, [attachment]);

  return { url, error };
}

function ImageViewer({ attachment, onClose }: { attachment: Attachment | null; onClose: () => void }) {
  const { url, error } = useAttachmentUrl(attachment);
  const { showToast } = useToast();

  return (
    <Modal isOpen={!!attachment} onClose={onClose} title={attachment?.name} size="full">
      {attachment && (
        <div className="space-y-4">
          <div className="relative flex items-center justify-center rounded-xl bg-black/40 min-h-[40vh] overflow-hidden">
            {/* Thumbnail first so something shows instantly, full image replaces it */}
            <img
              src={url ?? attachment.thumb}
              alt={attachment.name}
              className="max-h-[65vh] w-auto max-w-full object-contain"
              style={url ? undefined : { filter: 'blur(6px)' }}
            />
            {!url && !error && <Loader2 className="absolute w-6 h-6 animate-spin text-white/80" />}
            {error && <p className="absolute text-sm text-white/80">Image is still syncing. Try again shortly.</p>}
          </div>
          <div className="flex items-center justify-between gap-3 text-sm text-muted-foreground">
            <span>
              {attachment.width && attachment.height ? `${attachment.width} × ${attachment.height} · ` : ''}
              {formatBytes(attachment.size)}
            </span>
            <Button
              size="sm"
              onClick={() => downloadAttachment(attachment).catch(() => showToast('error', 'Download failed'))}
            >
              <Download className="w-4 h-4" />
              Download
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}

interface AttachmentStripProps {
  noteId: string;
  attachments: Attachment[];
  pending: number;
}

/** Images as a thumbnail grid, other files as rows. */
export function AttachmentStrip({ noteId, attachments, pending }: AttachmentStripProps) {
  const [viewing, setViewing] = useState<Attachment | null>(null);
  const { showToast } = useToast();
  const images = attachments.filter((a) => a.kind === 'image');
  const files = attachments.filter((a) => a.kind === 'file');

  if (attachments.length === 0 && pending === 0) return null;

  const remove = (attachment: Attachment) => {
    removeAttachment(noteId, attachment.id).catch(() => showToast('error', 'Could not remove attachment'));
  };

  return (
    <section
      className="flex-shrink-0 max-h-[40%] overflow-y-auto border-t border-border px-4 md:px-8 py-3"
      aria-label="Attachments"
    >
      <div className="mx-auto max-w-[70ch] space-y-3">
        {(images.length > 0 || pending > 0) && (
          <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
            {images.map((image) => (
              <div key={image.id} className="group relative aspect-square">
                <button
                  onClick={() => setViewing(image)}
                  className="block w-full h-full overflow-hidden rounded-xl border border-border bg-black/20 focus-visible:outline-2 focus-visible:outline-ring"
                  aria-label={`View ${image.name}`}
                >
                  <img src={image.thumb} alt={image.name} className="w-full h-full object-cover transition-transform duration-200 group-hover:scale-[1.03]" loading="lazy" />
                </button>
                <button
                  onClick={() => remove(image)}
                  className="absolute top-1.5 right-1.5 flex items-center justify-center size-7 rounded-full bg-black/60 text-white backdrop-blur-sm opacity-100 [@media(hover:hover)]:opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity"
                  aria-label={`Remove ${image.name}`}
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ))}
            {Array.from({ length: pending }, (_, i) => (
              <div
                key={`pending-${i}`}
                className="flex aspect-square items-center justify-center rounded-xl border border-dashed border-border text-muted-foreground"
                aria-label="Attaching"
              >
                <Loader2 className="w-5 h-5 animate-spin" />
              </div>
            ))}
          </div>
        )}

        {files.length > 0 && (
          <ul className="space-y-1.5">
            {files.map((file) => {
              const Icon = fileIconFor(file.type);
              return (
                <li key={file.id} className="group flex items-center gap-3 rounded-xl border border-border px-3 py-2">
                  <span className="flex items-center justify-center size-9 rounded-lg bg-primary/12 text-primary flex-shrink-0">
                    <Icon className="w-4.5 h-4.5" />
                  </span>
                  <button
                    onClick={() => downloadAttachment(file).catch(() => showToast('error', 'File is still syncing. Try again shortly.'))}
                    className="flex-1 min-w-0 text-left"
                    title="Download"
                  >
                    <span className="block truncate text-sm font-medium text-foreground">{file.name}</span>
                    <span className="block text-xs text-muted-foreground">{formatBytes(file.size)}</span>
                  </button>
                  <button
                    onClick={() => downloadAttachment(file).catch(() => showToast('error', 'File is still syncing. Try again shortly.'))}
                    className="toolbar-btn"
                    aria-label={`Download ${file.name}`}
                  >
                    <Download className="w-4 h-4" />
                  </button>
                  <button onClick={() => remove(file)} className="toolbar-btn" aria-label={`Remove ${file.name}`}>
                    <X className="w-4 h-4" />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <ImageViewer attachment={viewing} onClose={() => setViewing(null)} />
    </section>
  );
}
