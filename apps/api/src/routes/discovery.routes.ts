import type { FastifyInstance } from 'fastify';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { getDb } from '../config/database.js';
import { requireAuth } from '../plugins/auth.plugin.js';
import { projects } from '@aiscrumboard/db';

const StartDiscoverySchema = z.object({
  conceptText: z.string().min(10).max(10_000),
});

export async function discoveryRoutes(fastify: FastifyInstance) {
  fastify.addHook('onRequest', requireAuth);

  fastify.post('/', async (req, reply) => {
    const { projectId } = req.params as { projectId: string };
    const body = StartDiscoverySchema.parse(req.body);
    const db = getDb();

    const project = await db.query.projects.findFirst({
      where: eq(projects.id, projectId),
    });
    if (!project) return reply.status(404).send({ error: 'Project not found' });

    // Phase 1: Discovery runs inline (no BullMQ yet).
    // Phase 2 will enqueue this via the discovery queue.
    // For now return 202 Accepted — client polls /discovery/status
    return reply.status(202).send({
      message: 'Discovery started',
      projectId,
      conceptText: body.conceptText,
    });
  });

  fastify.get('/status', async (req, reply) => {
    const { projectId } = req.params as { projectId: string };
    const db = getDb();
    const project = await db.query.projects.findFirst({
      where: eq(projects.id, projectId),
      columns: { status: true, id: true },
    });
    if (!project) return reply.status(404).send({ error: 'Project not found' });
    return { status: project.status };
  });

  fastify.post('/confirm', async (req, reply) => {
    const { projectId } = req.params as { projectId: string };
    const db = getDb();
    const [updated] = await db.update(projects)
      .set({ status: 'active', updatedAt: new Date() })
      .where(eq(projects.id, projectId))
      .returning();
    if (!updated) return reply.status(404).send({ error: 'Project not found' });
    return { project: updated };
  });
}
