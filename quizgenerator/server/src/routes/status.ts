import type { FastifyPluginAsync } from 'fastify';
import { browserManager } from '../blooket/browserManager.js';
import { isPublishAvailable } from '../blooket/session.js';

/** Public: lets the web app hide Publish (and offer Download CSV) while the Blooket session is down. */
export const statusRoute: FastifyPluginAsync = async (fastify) => {
  fastify.get('/api/status', async (_request, reply) => {
    const { state, checkedAt } = browserManager.sessionInfo;
    return reply.send({
      publishAvailable: isPublishAvailable(state),
      sessionState: state,
      checkedAt,
    });
  });
};
