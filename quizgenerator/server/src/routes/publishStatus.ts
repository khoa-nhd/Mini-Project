import type { FastifyPluginAsync } from 'fastify';
import { jobQueue } from '../queue/jobQueue.js';
import type { PublishJobProgress } from '@quizgenerator/shared';

export const publishStatusRoute: FastifyPluginAsync = async (fastify) => {
  fastify.get('/api/publish/:jobId', async (request, reply) => {
    const { jobId } = request.params as { jobId: string };

    const job = jobQueue.getJob(jobId);
    if (!job) {
      return reply.status(404).send({ error: 'Job not found' });
    }

    reply.raw.setHeader('Content-Type', 'text/event-stream');
    reply.raw.setHeader('Cache-Control', 'no-cache, no-transform');
    reply.raw.setHeader('Connection', 'keep-alive');
    reply.raw.flushHeaders?.();

    const sendEvent = (data: PublishJobProgress) => {
      reply.raw.write(`data: ${JSON.stringify(data)}\n\n`);
    };

    // Send current initial state
    sendEvent({
      jobId: job.id,
      status: job.status,
      queuePosition: job.queuePosition,
      url: job.url,
      error: job.error,
    });

    if (job.status === 'done' || job.status === 'failed') {
      reply.raw.end();
      return;
    }

    // Listen to updates for this jobId
    const progressListener = (progress: PublishJobProgress) => {
      sendEvent(progress);
      if (progress.status === 'done' || progress.status === 'failed') {
        jobQueue.off(`progress:${jobId}`, progressListener);
        reply.raw.end();
      }
    };

    jobQueue.on(`progress:${jobId}`, progressListener);

    request.raw.on('close', () => {
      jobQueue.off(`progress:${jobId}`, progressListener);
    });
  });
};
