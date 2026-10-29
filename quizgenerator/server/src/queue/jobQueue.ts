import { EventEmitter } from 'events';
import crypto from 'crypto';
import type { Question, PublishJobStatus, PublishJobProgress } from '@quizgenerator/shared';
import { publishToBlooket } from '../blooket/publisher.js';
import { SessionExpiredError } from '../blooket/session.js';
import { adminLink, notifyAdmin } from '../notify/telegram.js';
import { appendJobLog, hashIp } from './jobLog.js';

export interface PublishJob {
  id: string;
  title: string;
  description: string;
  questions: Question[];
  status: PublishJobStatus;
  queuePosition?: number;
  url?: string;
  error?: string;
  createdAt: number;
  /** Hashed client IP for the job log; the raw IP is never stored. */
  ipHash: string;
}

class PublishJobQueue extends EventEmitter {
  private queue: PublishJob[] = [];
  private activeJob: PublishJob | null = null;
  private recentJobs: PublishJob[] = [];

  constructor() {
    super();
  }

  public enqueue(
    title: string,
    description: string,
    questions: Question[],
    meta: { ip?: string } = {},
  ): string {
    const id = `job_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
    const job: PublishJob = {
      id,
      title,
      description,
      questions,
      status: 'queued',
      createdAt: Date.now(),
      ipHash: meta.ip ? hashIp(meta.ip) : '',
    };

    this.queue.push(job);
    this.updateQueuePositions();
    this.emitProgress(job);

    // Process next if idle
    this.processNext();
    return id;
  }

  public getJob(id: string): PublishJob | undefined {
    if (this.activeJob && this.activeJob.id === id) {
      return this.activeJob;
    }
    const queued = this.queue.find((j) => j.id === id);
    if (queued) return queued;
    return this.recentJobs.find((j) => j.id === id);
  }

  public getRecentJobs(): PublishJob[] {
    return this.recentJobs;
  }

  private updateQueuePositions() {
    this.queue.forEach((job, index) => {
      job.queuePosition = index + 1;
    });
  }

  private emitProgress(job: PublishJob, message?: string) {
    const progress: PublishJobProgress = {
      jobId: job.id,
      status: job.status,
      queuePosition: job.queuePosition,
      url: job.url,
      error: job.error,
      message,
    };
    this.emit(`progress:${job.id}`, progress);
  }

  private async processNext() {
    if (this.activeJob || this.queue.length === 0) {
      return;
    }

    const job = this.queue.shift()!;
    this.activeJob = job;
    this.updateQueuePositions();
    const startedAt = Date.now();

    try {
      const url = await publishToBlooket({
        title: job.title,
        description: job.description,
        questions: job.questions,
        onProgress: (status, message) => {
          job.status = status;
          this.emitProgress(job, message);
        },
      });

      job.status = 'done';
      job.url = url;
      this.emitProgress(job, 'Published successfully!');
    } catch (err: any) {
      job.status = 'failed';
      job.error = err.message || 'Publishing failed';
      this.emitProgress(job, job.error);
      // Session expiry is reported by the browser manager; anything else is a bug or a Blooket change.
      if (!(err instanceof SessionExpiredError)) {
        void notifyAdmin(
          `⚠️ Blooket publish failed: ${job.error}
Set: ${job.title} (${job.questions.length} questions)
${adminLink()}`,
          { throttleKey: 'publish-failed', throttleMs: 10 * 60 * 1000 },
        );
      }
    } finally {
      appendJobLog({
        at: new Date().toISOString(),
        jobId: job.id,
        ipHash: job.ipHash,
        title: job.title,
        questionCount: job.questions.length,
        status: job.status === 'done' ? 'done' : 'failed',
        url: job.url,
        error: job.error,
        durationMs: Date.now() - startedAt,
      });
      this.recentJobs.unshift(job);
      if (this.recentJobs.length > 20) {
        this.recentJobs.pop();
      }
      this.activeJob = null;
      this.processNext();
    }
  }
}

export const jobQueue = new PublishJobQueue();
