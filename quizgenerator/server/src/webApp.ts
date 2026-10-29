import type { FastifyInstance } from 'fastify';
import fastifyStatic from '@fastify/static';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const moduleDir = path.dirname(fileURLToPath(import.meta.url));

/** Paths the SPA fallback must never swallow: unknown API calls stay JSON 404s. */
const API_PREFIXES = ['/api/', '/admin', '/healthz'];

/** `web/dist` next to the server, whether running from src (tsx) or dist (node). */
export function resolveWebDistDir(env: NodeJS.ProcessEnv = process.env): string {
  return path.resolve(env.WEB_DIST_DIR || path.join(moduleDir, '..', '..', 'web', 'dist'));
}

export function isSpaRoute(method: string, url: string): boolean {
  if (method !== 'GET' && method !== 'HEAD') return false;
  const pathname = url.split('?')[0];
  return !API_PREFIXES.some((prefix) => pathname === prefix.replace(/\/$/, '') || pathname.startsWith(prefix));
}

/**
 * Serves the built web app from the same origin as the API, so production needs
 * no CORS and no proxy rewrites. Skipped when web/dist has not been built (dev uses Vite).
 */
export async function registerWebApp(server: FastifyInstance): Promise<boolean> {
  const root = resolveWebDistDir();
  if (!fs.existsSync(path.join(root, 'index.html'))) {
    server.log.info(`No web build at ${root}; serving the API only`);
    return false;
  }

  await server.register(fastifyStatic, {
    root,
    // Off so the plugin's default `max-age=0` does not override the headers below.
    cacheControl: false,
    // Hashed asset names can be cached forever; index.html must always revalidate.
    setHeaders: (res, filePath) => {
      res.setHeader(
        'Cache-Control',
        filePath.includes(`${path.sep}assets${path.sep}`)
          ? 'public, max-age=31536000, immutable'
          : 'no-cache',
      );
    },
  });

  server.setNotFoundHandler((request, reply) => {
    if (isSpaRoute(request.method, request.url)) {
      return reply.header('Cache-Control', 'no-cache').sendFile('index.html');
    }
    return reply.status(404).send({ error: 'Not found' });
  });

  server.log.info(`Serving web app from ${root}`);
  return true;
}
