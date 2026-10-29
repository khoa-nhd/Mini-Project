import type { FastifyPluginAsync } from 'fastify';
import { RefineRequestSchema } from '@quizgenerator/shared';
import { refineQuestionsWithPrompt } from '../llm/gemini.js';
import { rateLimits } from '../security.js';

export const refineRoute: FastifyPluginAsync = async (fastify) => {
  // No Turnstile here: refine is a quick follow-up chat; the daily limit caps cost.
  fastify.post('/api/refine', { config: { rateLimit: rateLimits().refine } }, async (request, reply) => {
    const parseResult = RefineRequestSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(400).send({
        error: 'Invalid request body',
        details: parseResult.error.format(),
      });
    }

    const { questions, message } = parseResult.data;

    try {
      const response = await refineQuestionsWithPrompt(questions as any, message);
      return reply.send(response);
    } catch (err: any) {
      request.log.error(err);
      return reply.status(500).send({
        error: err.message || 'Failed to refine quiz draft.',
      });
    }
  });
};
