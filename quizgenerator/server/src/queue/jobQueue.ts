import { EventEmitter } from 'events';
import crypto from 'crypto';
import type { Question, PublishJobStatus, PublishJobProgress } from '@quizgenerator/shared';
import { publishToBlooket } from '../blooket/publisher.js';

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
}

class PublishJobQueue extends EventEmitter {
  private queue: PublishJob[] = [];
  private activeJob: PublishJob | null = null;
  private recentJobs: PublishJob[] = [];

  constructor() {
    super();
  }

  public enqueue(title: string, description: string, questions: Question[]): string {
    const id = `job_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
    const job: PublishJob = {
      id,
      title,
      description,
      questions,
      status: 'queued',
      createdAt: Date.now(),
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
    } finally {
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
