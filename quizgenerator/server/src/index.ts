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
import { blooketSessionRoute } from './routes/blooketSession.js';

const server = fastify({
  logger: {
    level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
  },
});

async function main() {
  await server.register(cors, {
    origin: true,
  });

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
  await server.register(blooketSessionRoute);

  const port = parseInt(process.env.PORT || '3001', 10);
  const host = '0.0.0.0';

  try {
    await server.listen({ port, host });
    console.log(`Server listening at http://${host}:${port}`);
  } catch (err) {
    server.log.error(err);
    process.exit(1);
  }
}

main();
