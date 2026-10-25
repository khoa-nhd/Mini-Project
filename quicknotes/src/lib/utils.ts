import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDate(date: Date | number | string, options?: Intl.DateTimeFormatOptions): string {
  const d = new Date(date);
  if (isNaN(d.getTime())) return 'Invalid date';
  
  const defaultOptions: Intl.DateTimeFormatOptions = {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  };
  
  return d.toLocaleDateString(undefined, options ?? defaultOptions);
}

export function formatRelativeTime(date: Date | number | string): string {
  const d = new Date(date);
  if (isNaN(d.getTime())) return 'Invalid date';
  
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffSecs = Math.floor(diffMs / 1000);
  const diffMins = Math.floor(diffSecs / 60);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);
  const diffWeeks = Math.floor(diffDays / 7);
  const diffMonths = Math.floor(diffDays / 30);
  const diffYears = Math.floor(diffDays / 365);
  
  if (diffSecs < 60) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  if (diffWeeks < 4) return `${diffWeeks}w ago`;
  if (diffMonths < 12) return `${diffMonths}mo ago`;
  return `${diffYears}y ago`;
}

export function countWords(text: string): number {
  if (!text.trim()) return 0;
  return text.trim().split(/\s+/).length;
}

export function countChars(text: string): number {
  return text.length;
}

export function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
}

export function debounce<T extends (...args: any[]) => any>(
  fn: T,
  delay: number
): (...args: Parameters<T>) => void {
  let timeoutId: ReturnType<typeof setTimeout>;
  return (...args: Parameters<T>) => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => fn(...args), delay);
  };
}

export function throttle<T extends (...args: any[]) => any>(
  fn: T,
  limit: number
): (...args: Parameters<T>) => void {
  let inThrottle = false;
  return (...args: Parameters<T>) => {
    if (!inThrottle) {
      fn(...args);
      inThrottle = true;
      setTimeout(() => (inThrottle = false), limit);
    }
  };
}

export function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength).trim() + '…';
}

export function extractTitle(content: string, maxLength = 50): string {
  const lines = content.trim().split('\n');
  const firstLine = lines[0] || '';
  return truncate(firstLine, maxLength) || 'Untitled';
}

export function parseFrontmatter(content: string): { data: Record<string, unknown>; body: string } {
  const frontmatterRegex = /^---\n([\s\S]*?)\n---/;
  const match = content.match(frontmatterRegex);
  
  if (!match) {
    return { data: {}, body: content };
  }
  
  const frontmatter = match[1];
  const body = content.slice(match[0].length);
  const data: Record<string, unknown> = {};
  
  frontmatter.split('\n').forEach((line) => {
    const [key, ...valueParts] = line.split(':');
    if (key && valueParts.length) {
      const rawValue = valueParts.join(':').trim();
      let parsedValue: unknown = rawValue;
      if (rawValue.startsWith('"') && rawValue.endsWith('"')) {
        parsedValue = rawValue.slice(1, -1);
      } else if (rawValue === 'true') {
        parsedValue = true;
      } else if (rawValue === 'false') {
        parsedValue = false;
      } else if (!isNaN(Number(rawValue))) {
        parsedValue = Number(rawValue);
      }
      data[key.trim()] = parsedValue;
    }
  });
  
  return { data, body: body.trim() };
}

export function stringifyFrontmatter(data: Record<string, unknown>, body: string): string {
  const lines = ['---'];
  for (const [key, value] of Object.entries(data)) {
    let valueStr: string;
    if (typeof value === 'string') {
      valueStr = value.includes('\n') || value.includes(':') 
        ? `"${value.replace(/"/g, '\\"')}"`
        : value;
    } else if (typeof value === 'boolean') {
      valueStr = value.toString();
    } else if (typeof value === 'number') {
      valueStr = value.toString();
    } else {
      valueStr = String(value);
    }
    lines.push(`${key}: ${valueStr}`);
  }
  lines.push('---', '', body);
  return lines.join('\n');
}

export const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad|iPod/.test(navigator.platform || navigator.userAgent);

/** Human readable label for a "mod+x" shortcut on the current platform. */
export function shortcutLabel(key: string): string {
  return `${isMac ? '⌘' : 'Ctrl+'}${key.toUpperCase()}`;
}

export function isOnline(): boolean {
  return navigator.onLine;
}

export function getInitials(name: string): string {
  return name
    .split(' ')
    .map((part) => part[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function retry<T>(
  fn: () => Promise<T>,
  retries: number = 3,
  delay: number = 1000
): Promise<T> {
  return fn().catch((err) => {
    if (retries <= 0) throw err;
    return sleep(delay).then(() => retry(fn, retries - 1, delay * 2));
  });
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export function shuffle<T>(array: T[]): T[] {
  const result = [...array];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

export function groupBy<T>(array: T[], key: keyof T | ((item: T) => string)): Record<string, T[]> {
  return array.reduce((groups, item) => {
    const groupKey = typeof key === 'function' ? key(item) : String(item[key]);
    if (!groups[groupKey]) groups[groupKey] = [];
    groups[groupKey].push(item);
    return groups;
  }, {} as Record<string, T[]>);
}

export function sortBy<T>(array: T[], key: keyof T | ((item: T) => unknown), direction: 'asc' | 'desc' = 'asc'): T[] {
  return [...array].sort((a, b) => {
    const aVal = typeof key === 'function' ? key(a) : a[key];
    const bVal = typeof key === 'function' ? key(b) : b[key];
    if (aVal == null && bVal == null) return 0;
    if (aVal == null) return direction === 'asc' ? -1 : 1;
    if (bVal == null) return direction === 'asc' ? 1 : -1;
    if (aVal < bVal) return direction === 'asc' ? -1 : 1;
    if (aVal > bVal) return direction === 'asc' ? 1 : -1;
    return 0;
  });
}

export function uniqueBy<T>(array: T[], key: keyof T | ((item: T) => unknown)): T[] {
  const seen = new Set();
  return array.filter((item) => {
    const val = typeof key === 'function' ? key(item) : item[key];
    if (seen.has(val)) return false;
    seen.add(val);
    return true;
  });
}
/** Short haptic tick when a long-press drag picks an item up (Android). */
export function vibrateOnDragStart() {
  navigator.vibrate?.(15);
}
