import fastify from 'fastify';
import cors from '@fastify/cors';
import multipart from '@fastify/multipart';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Load environment variables from the project root, whether the server is
// started from quizgenerator/ (built output) or quizgenerator/server/ (npm run dev).
const moduleDir = path.dirname(fileURLToPath(import.meta.url));
const envCandidates = [
  path.resolve(process.cwd(), '.env'),
  path.resolve(process.cwd(), '..', '.env'),
  path.resolve(moduleDir, '..', '..', '.env'),
];
const envPath = envCandidates.find((candidate) => fs.existsSync(candidate));
if (envPath) {
  dotenv.config({ path: envPath });
  console.log(`Loaded environment from ${envPath}`);
}
dotenv.config();

import { generateRoute } from './routes/generate.js';
import { refineRoute } from './routes/refine.js';
import { publishRoute } from './routes/publish.js';
import { publishStatusRoute } from './routes/publishStatus.js';
import { adminRoute } from './routes/admin.js';
import { healthRoute } from './routes/health.js';
import { statusRoute } from './routes/status.js';
import { assertAdminConfig } from './routes/admin.js';
import { assertTurnstileConfig, registerRateLimit } from './security.js';
import { registerWebApp } from './webApp.js';
import { notifyAdmin } from './notify/telegram.js';

const isProduction = process.env.NODE_ENV === 'production';

const server = fastify({
  // Behind Caddy: take the client IP from X-Forwarded-For so rate limits are per user.
  trustProxy: process.env.TRUST_PROXY === 'true',
  logger: {
    level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
  },
});

async function main() {
  // Refuse to start in production without a real admin password or bot protection.
  assertAdminConfig();
  assertTurnstileConfig();

  // Production serves the web app from this same origin, so CORS is only for dev tools.
  if (!isProduction) {
    await server.register(cors, {
      origin: true,
    });
  }

  await registerRateLimit(server);

  await server.register(multipart, {
    limits: {
      fileSize: 20 * 1024 * 1024, // 20 MB max
    },
  });

  // Register routes
  await server.register(healthRoute);
  await server.register(generateRoute);
  await server.register(refineRoute);
  await server.register(publishRoute);
  await server.register(publishStatusRoute);
  await server.register(adminRoute);
  await server.register(statusRoute);

  // Last: its not-found handler serves index.html for client-side routes.
  await registerWebApp(server);

  const port = parseInt(process.env.PORT || '3001', 10);
  const host = '0.0.0.0';

  try {
    await server.listen({ port, host });
    console.log(`Server listening at http://${host}:${port}`);
    if (isProduction) void notifyAdmin('🚀 Quiz Generator server started.');
  } catch (err) {
    server.log.error(err);
    process.exit(1);
  }
}

main();
