import { describe, it, expect, afterEach, vi } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { assertTurnstileConfig, isAllowedUpload, verifyTurnstile } from '../security.js';
import { isSpaRoute } from '../webApp.js';
import { notifyAdmin, resetNotifyThrottle } from '../notify/telegram.js';
import { appendJobLog, hashIp, readJobLog } from '../queue/jobLog.js';

const ORIGINAL_ENV = { ...process.env };

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
  resetNotifyThrottle();
});

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

describe('Turnstile', () => {
  it('passes everything when no secret is configured (local dev)', async () => {
    delete process.env.TURNSTILE_SECRET;
    const fetchMock = vi.fn();
    expect(await verifyTurnstile(undefined, '1.2.3.4', fetchMock as any)).toEqual({ ok: true });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('requires a token and trusts only Cloudflare success', async () => {
    process.env.TURNSTILE_SECRET = 'secret';
    expect((await verifyTurnstile(undefined, '1.2.3.4')).ok).toBe(false);

    const ok = vi.fn().mockResolvedValue(jsonResponse({ success: true }));
    expect((await verifyTurnstile('tok', '1.2.3.4', ok as any)).ok).toBe(true);
    const sent = JSON.parse(ok.mock.calls[0][1].body);
    expect(sent).toEqual({ secret: 'secret', response: 'tok', remoteip: '1.2.3.4' });

    const bad = vi.fn().mockResolvedValue(jsonResponse({ success: false, 'error-codes': ['timeout-or-duplicate'] }));
    expect((await verifyTurnstile('tok', '1.2.3.4', bad as any)).ok).toBe(false);

    const down = vi.fn().mockRejectedValue(new Error('network'));
    expect((await verifyTurnstile('tok', '1.2.3.4', down as any)).ok).toBe(false);
  });

  it('fails closed in production without a secret', () => {
    expect(() => assertTurnstileConfig({ NODE_ENV: 'production' })).toThrow(/TURNSTILE_SECRET/);
    expect(() => assertTurnstileConfig({ NODE_ENV: 'production', TURNSTILE_SECRET: 's' })).not.toThrow();
    expect(() => assertTurnstileConfig({ NODE_ENV: 'development' })).not.toThrow();
  });
});

describe('Uploads', () => {
  it('accepts only extractor-supported file types', () => {
    expect(isAllowedUpload('de-thi.PDF')).toBe(true);
    expect(isAllowedUpload('notes.docx')).toBe(true);
    expect(isAllowedUpload('photo.jpeg')).toBe(true);
    expect(isAllowedUpload('virus.exe')).toBe(false);
    expect(isAllowedUpload('noextension')).toBe(false);
  });
});

describe('SPA fallback', () => {
  it('serves index.html for page routes but never for API paths', () => {
    expect(isSpaRoute('GET', '/')).toBe(true);
    expect(isSpaRoute('GET', '/history?x=1')).toBe(true);
    expect(isSpaRoute('GET', '/api/unknown')).toBe(false);
    expect(isSpaRoute('GET', '/api')).toBe(false);
    expect(isSpaRoute('GET', '/admin/status')).toBe(false);
    expect(isSpaRoute('GET', '/healthz')).toBe(false);
    expect(isSpaRoute('POST', '/')).toBe(false);
  });
});

describe('Telegram notify', () => {
  it('only logs when not configured', async () => {
    delete process.env.TELEGRAM_BOT_TOKEN;
    delete process.env.TELEGRAM_CHAT_ID;
    const fetchMock = vi.fn();
    expect(await notifyAdmin('hi', {}, fetchMock as any)).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('sends to the chat and throttles repeated alerts', async () => {
    process.env.TELEGRAM_BOT_TOKEN = 'bot-token';
    process.env.TELEGRAM_CHAT_ID = '42';
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ ok: true }));

    expect(await notifyAdmin('expired', { throttleKey: 'k', throttleMs: 60_000 }, fetchMock as any)).toBe(true);
    expect(await notifyAdmin('expired', { throttleKey: 'k', throttleMs: 60_000 }, fetchMock as any)).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe('https://api.telegram.org/botbot-token/sendMessage');
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).chat_id).toBe('42');
  });
});

describe('Job log', () => {
  it('appends JSON lines and reads newest first without the raw IP', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'qg-jobs-'));
    try {
      const base = { ipHash: hashIp('1.2.3.4'), title: 't', questionCount: 3, durationMs: 1 };
      appendJobLog({ ...base, at: 'a', jobId: 'j1', status: 'done', url: 'u' }, dir);
      appendJobLog({ ...base, at: 'b', jobId: 'j2', status: 'failed', error: 'e' }, dir);
      fs.appendFileSync(path.join(dir, 'jobs.jsonl'), '{"broken');

      const entries = readJobLog(20, dir);
      expect(entries.map((e) => e.jobId)).toEqual(['j2', 'j1']);
      expect(fs.readFileSync(path.join(dir, 'jobs.jsonl'), 'utf-8')).not.toContain('1.2.3.4');
      expect(readJobLog(1, dir)).toHaveLength(1);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
