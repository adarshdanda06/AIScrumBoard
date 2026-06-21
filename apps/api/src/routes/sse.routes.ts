import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { getAuth } from '../plugins/auth.plugin.js';
import { getRedisSub, projectSseChannel, agentLogStreamKey } from '../config/redis.js';
import { getRedis } from '../config/redis.js';

export async function sseRoutes(fastify: FastifyInstance) {
  // Board-level SSE stream for a project
  fastify.get('/sse/:projectId', {
    config: { auth: false },
  }, async (req: FastifyRequest, reply: FastifyReply) => {
    const auth = getAuth();
    const session = await auth.api.getSession({
      headers: new Headers(req.headers as Record<string, string>),
    });
    if (!session?.user) {
      return reply.status(401).send({ error: 'Unauthorized' });
    }

    const { projectId } = req.params as { projectId: string };
    const channel = projectSseChannel(projectId);

    reply.raw.setHeader('Content-Type', 'text/event-stream');
    reply.raw.setHeader('Cache-Control', 'no-cache');
    reply.raw.setHeader('Connection', 'keep-alive');
    reply.raw.setHeader('X-Accel-Buffering', 'no');
    reply.raw.flushHeaders();

    const send = (event: string, data: unknown) => {
      reply.raw.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    };

    send('connected', { projectId, userId: session.user.id });

    const sub = getRedisSub().duplicate();
    await sub.subscribe(channel);

    sub.on('message', (_chan: string, message: string) => {
      try {
        const parsed = JSON.parse(message) as { type: string; payload: unknown };
        send(parsed.type, parsed.payload);
      } catch {
        // ignore malformed messages
      }
    });

    // Heartbeat to keep connection alive through proxies
    const heartbeat = setInterval(() => {
      reply.raw.write(': heartbeat\n\n');
    }, 25_000);

    req.raw.on('close', () => {
      clearInterval(heartbeat);
      void sub.unsubscribe(channel);
      void sub.quit();
    });

    // Keep the reply open
    await new Promise<void>((resolve) => {
      req.raw.on('close', resolve);
    });
  });

  // Agent log SSE stream (paginated history + live tail from Redis stream)
  fastify.get('/agents/:agentSessionId/logs/stream', async (req: FastifyRequest, reply: FastifyReply) => {
    const auth = getAuth();
    const session = await auth.api.getSession({
      headers: new Headers(req.headers as Record<string, string>),
    });
    if (!session?.user) {
      return reply.status(401).send({ error: 'Unauthorized' });
    }

    const { agentSessionId } = req.params as { agentSessionId: string };
    const streamKey = agentLogStreamKey(agentSessionId);

    reply.raw.setHeader('Content-Type', 'text/event-stream');
    reply.raw.setHeader('Cache-Control', 'no-cache');
    reply.raw.setHeader('Connection', 'keep-alive');
    reply.raw.setHeader('X-Accel-Buffering', 'no');
    reply.raw.flushHeaders();

    const send = (data: unknown) => {
      reply.raw.write(`data: ${JSON.stringify(data)}\n\n`);
    };

    // Tail the Redis stream
    const redis = getRedis();
    let lastId = '0-0';
    let closed = false;

    req.raw.on('close', () => { closed = true; });

    while (!closed) {
      try {
        const results = await redis.xread('COUNT', 100, 'BLOCK', 5000, 'STREAMS', streamKey, lastId);
        if (results) {
          for (const [, entries] of results) {
            for (const [id, fields] of entries) {
              lastId = id;
              const obj: Record<string, string> = {};
              for (let i = 0; i < fields.length; i += 2) {
                obj[fields[i]!] = fields[i + 1]!;
              }
              send({ id, ...obj });
            }
          }
        }
      } catch {
        break;
      }
    }
  });
}
