import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { getStateDir } from '../blooket/session.js';

export interface JobLogEntry {
  at: string;
  jobId: string;
  ipHash: string;
  title: string;
  questionCount: number;
  status: 'done' | 'failed';
  url?: string;
  error?: string;
  durationMs: number;
}

/** Short one-way hash: enough to spot one IP hammering publish, without storing the IP. */
export function hashIp(ip: string): string {
  return crypto.createHash('sha256').update(ip).digest('hex').slice(0, 12);
}

/**
 * Appends one JSON line per finished publish to <STATE_DIR>/jobs.jsonl.
 * Question text is never written. Never throws.
 */
export function appendJobLog(entry: JobLogEntry, stateDir = getStateDir()): void {
  try {
    fs.mkdirSync(stateDir, { recursive: true });
    fs.appendFileSync(path.join(stateDir, 'jobs.jsonl'), `${JSON.stringify(entry)}\n`);
  } catch (err: any) {
    console.warn(`Could not write job log: ${err.message}`);
  }
}

/** Last `limit` entries, newest first; a missing or damaged file yields what can be read. */
export function readJobLog(limit = 20, stateDir = getStateDir()): JobLogEntry[] {
  let raw = '';
  try {
    raw = fs.readFileSync(path.join(stateDir, 'jobs.jsonl'), 'utf-8');
  } catch {
    return [];
  }
  const entries: JobLogEntry[] = [];
  for (const line of raw.split('\n').reverse()) {
    if (entries.length >= limit) break;
    if (!line.trim()) continue;
    try {
      entries.push(JSON.parse(line));
    } catch {
      // skip a half-written line
    }
  }
  return entries;
}
