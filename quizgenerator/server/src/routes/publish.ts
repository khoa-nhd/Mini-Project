import type { FastifyPluginAsync } from 'fastify';
import { PublishRequestSchema, validateQuizDraft } from '@quizgenerator/shared';
import { jobQueue } from '../queue/jobQueue.js';
import { browserManager } from '../blooket/browserManager.js';
import { isPublishAvailable } from '../blooket/session.js';

export const publishRoute: FastifyPluginAsync = async (fastify) => {
  fastify.post('/api/publish', async (request, reply) => {
    const parseResult = PublishRequestSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(400).send({
        error: 'Invalid publish request data',
        details: parseResult.error.format(),
      });
    }

    const { title, description, questions } = parseResult.data;

    // Validate the draft
    const validation = validateQuizDraft({
      title,
      description,
      defaultTime: 20,
      questions: questions as any,
      history: [],
    });

    if (!validation.isValid) {
      return reply.status(400).send({
        error: 'Validation failed on quiz draft',
        generalErrors: validation.generalErrors,
        questionErrors: validation.questionErrors,
      });
    }

    // Fail fast instead of queueing a job that cannot log in; the web offers Download CSV.
    if (!isPublishAvailable(browserManager.sessionInfo.state)) {
      return reply.status(503).send({
        error: 'Publishing to Blooket is paused right now. Download the CSV and import it in Blooket instead.',
        code: 'SESSION_EXPIRED',
      });
    }

    const jobId = jobQueue.enqueue(title, description, questions as any);
    return reply.status(202).send({ jobId });
  });
};
