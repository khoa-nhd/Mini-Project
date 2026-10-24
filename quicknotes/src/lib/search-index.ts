import MiniSearch from 'minisearch';
import type { Note } from '../types';

class SearchIndex {
  private index: MiniSearch<{ id: string; title: string; content: string; folderId: string }>;
  private noteMap: Map<string, Note> = new Map();

  constructor() {
    this.index = new MiniSearch({
      fields: ['title', 'content'],
      storeFields: ['title', 'content', 'folderId'],
      searchOptions: {
        boost: { title: 2 },
        fuzzy: 0.2,
        prefix: true,
      },
    });
  }

  add(note: Note): void {
    this.noteMap.set(note.id, note);
    this.index.add({
      id: note.id,
      title: note.title,
      content: note.content,
      folderId: note.folderId,
    });
  }

  addAll(notes: Note[]): void {
    notes.forEach((note) => this.noteMap.set(note.id, note));
    this.index.addAll(
      notes.map((note) => ({
        id: note.id,
        title: note.title,
        content: note.content,
        folderId: note.folderId,
      }))
    );
  }

  remove(id: string): void {
    this.noteMap.delete(id);
    if (this.index.has(id)) this.index.discard(id);
  }

  update(note: Note): void {
    this.noteMap.set(note.id, note);
    if (this.index.has(note.id)) this.index.discard(note.id);
    // Add updated document
    this.index.add({
      id: note.id,
      title: note.title,
      content: note.content,
      folderId: note.folderId,
    });
  }

  clear(): void {
    this.noteMap.clear();
    this.index.removeAll();
  }

  search(query: string, options?: { folderId?: string; limit?: number }): Array<{ note: Note; score: number; matches: string[] }> {
    const results = this.index.search(query, {
      ...options,
      filter: options?.folderId
        ? (result: any) => result.folderId === options.folderId
        : undefined,
    }) as any[];

    return results
      .slice(0, options?.limit ?? 20)
      .map((result: any) => ({
        note: this.noteMap.get(result.id)!,
        score: result.score ?? 0,
        matches: result.match?.map((m: any) => m.term) ?? [],
      }))
      .filter((r) => r.note && !r.note.deletedAt);
  }

  getNote(id: string): Note | undefined {
    return this.noteMap.get(id);
  }

  getAllNotes(): Note[] {
    return Array.from(this.noteMap.values());
  }

  getNotesByFolder(folderId: string): Note[] {
    return Array.from(this.noteMap.values()).filter((n) => n.folderId === folderId && !n.deletedAt);
  }

  getSize(): number {
    return this.noteMap.size;
  }
}

// Singleton instance
export const searchIndex = new SearchIndex();

export function initializeSearchIndex(notes: Note[]): void {
  searchIndex.clear();
  searchIndex.addAll(notes);
}