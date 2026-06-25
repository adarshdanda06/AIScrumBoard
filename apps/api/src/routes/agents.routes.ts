import type { FastifyInstance } from 'fastify';
import { eq, and, desc } from 'drizzle-orm';
import { getDb } from '../config/database.js';
import { requireAuth } from '../plugins/auth.plugin.js';
import { agentSessions, agentLogs } from '@aiscrumboard/db';

export async function agentsRoutes(fastify: FastifyInstance) {
  fastify.addHook('onRequest', requireAuth);

  fastify.get('/', async (req) => {
    const { projectId } = req.params as { projectId: string };
    const db = getDb();
    const sessions = await db.query.agentSessions.findMany({
      where: eq(agentSessions.projectId, projectId),
      orderBy: (a, { desc: d }) => [d(a.createdAt)],
    });
    return { agents: sessions };
  });

  fastify.get('/:agentId', async (req, reply) => {
    const { projectId, agentId } = req.params as { projectId: string; agentId: string };
    const db = getDb();
    const session = await db.query.agentSessions.findFirst({
      where: and(eq(agentSessions.id, agentId), eq(agentSessions.projectId, projectId)),
    });
    if (!session) return reply.status(404).send({ error: 'Agent session not found' });
    return { agent: session };
  });

  fastify.get('/:agentId/logs', async (req) => {
    const { agentId } = req.params as { projectId: string; agentId: string };
    const query = req.query as { limit?: string; offset?: string };
    const limit = Math.min(Number(query.limit ?? 100), 500);
    const offset = Number(query.offset ?? 0);
    const db = getDb();

    const logs = await db.select().from(agentLogs)
      .where(eq(agentLogs.agentSessionId, agentId))
      .orderBy(agentLogs.sequence)
      .limit(limit)
      .offset(offset);

    return { logs, limit, offset };
  });

  fastify.delete('/:agentId', async (req, reply) => {
    const { projectId, agentId } = req.params as { projectId: string; agentId: string };
    const db = getDb();
    const [updated] = await db.update(agentSessions)
      .set({ status: 'cancelled', updatedAt: new Date() })
      .where(and(eq(agentSessions.id, agentId), eq(agentSessions.projectId, projectId)))
      .returning();
    if (!updated) return reply.status(404).send({ error: 'Agent session not found' });
    // TODO: signal BullMQ job to cancel
    return reply.status(200).send({ ok: true });
  });
}
