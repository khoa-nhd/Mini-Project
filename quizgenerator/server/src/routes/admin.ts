import type { FastifyPluginAsync } from 'fastify';
import { jobQueue } from '../queue/jobQueue.js';

export const adminRoute: FastifyPluginAsync = async (fastify) => {
  // Simple auth hook for /admin/*
  fastify.addHook('preHandler', async (request, reply) => {
    if (request.url.startsWith('/admin')) {
      const authHeader = request.headers['authorization'];
      const adminPassword = process.env.ADMIN_PASSWORD || 'admin';

      if (!authHeader) {
        reply.header('WWW-Authenticate', 'Basic realm="QuizGenerator Admin"');
        return reply.status(401).send({ error: 'Unauthorized' });
      }

      const match = authHeader.match(/^Basic\s+(.*)$/);
      if (!match) {
        return reply.status(401).send({ error: 'Invalid auth header format' });
      }

      const decoded = Buffer.from(match[1], 'base64').toString('utf-8');
      const [, password] = decoded.split(':');

      if (password !== adminPassword) {
        return reply.status(403).send({ error: 'Forbidden: Incorrect password' });
      }
    }
  });

  fastify.get('/admin/status', async (_request, reply) => {
    const recentJobs = jobQueue.getRecentJobs();
    return reply.send({
      serverTime: new Date().toISOString(),
      recentJobsCount: recentJobs.length,
      recentJobs,
    });
  });
};
