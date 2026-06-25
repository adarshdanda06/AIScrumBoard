import Fastify from 'fastify';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import { getEnv } from './config/env.js';
import { authPlugin } from './plugins/auth.plugin.js';
import { projectsRoutes } from './routes/projects.routes.js';
import { storiesRoutes } from './routes/stories.routes.js';
import { sprintsRoutes } from './routes/sprints.routes.js';
import { agentsRoutes } from './routes/agents.routes.js';
import { creditsRoutes } from './routes/credits.routes.js';
import { discoveryRoutes } from './routes/discovery.routes.js';
import { envConfigRoutes } from './routes/env_config.routes.js';
import { sseRoutes } from './routes/sse.routes.js';

const env = getEnv();

const fastify = Fastify({
  logger: {
    level: env.NODE_ENV === 'production' ? 'info' : 'debug',
    transport: env.NODE_ENV !== 'production'
      ? { target: 'pino-pretty', options: { colorize: true } }
      : undefined,
  },
});

await fastify.register(cors, {
  origin: [env.NEXT_PUBLIC_APP_URL],
  credentials: true,
});

await fastify.register(rateLimit, {
  max: 200,
  timeWindow: '1 minute',
});

// Auth routes (Better Auth handler)
await fastify.register(authPlugin);

// SSE routes (no prefix, handled at root level)
await fastify.register(sseRoutes);

// API routes
await fastify.register(projectsRoutes, { prefix: '/api/projects' });

await fastify.register(async (app) => {
  await app.register(storiesRoutes);
  await app.register(sprintsRoutes, { prefix: '/sprints' });
  await app.register(agentsRoutes, { prefix: '/agents' });
  await app.register(discoveryRoutes, { prefix: '/discovery' });
  await app.register(envConfigRoutes, { prefix: '/env' });
}, { prefix: '/api/projects/:projectId' });

await fastify.register(creditsRoutes, { prefix: '/api/credits' });

fastify.get('/health', async () => ({ status: 'ok', timestamp: new Date().toISOString() }));

fastify.setErrorHandler((error, _req, reply) => {
  fastify.log.error(error);
  if (error.validation) {
    return reply.status(400).send({ error: 'Validation error', details: error.validation });
  }
  return reply.status(error.statusCode ?? 500).send({ error: error.message });
});

try {
  await fastify.listen({ port: env.PORT, host: env.HOST });
  fastify.log.info(`API server listening on port ${env.PORT}`);
} catch (err) {
  fastify.log.error(err);
  process.exit(1);
}
