import type { FastifyInstance } from 'fastify';
import { eq, and } from 'drizzle-orm';
import { z } from 'zod';
import { getDb } from '../config/database.js';
import { requireAuth } from '../plugins/auth.plugin.js';
import { sprints, stories } from '@aiscrumboard/db';

const SprintSchema = z.object({
  name: z.string().min(1).max(100),
  goal: z.string().optional(),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
});

export async function sprintsRoutes(fastify: FastifyInstance) {
  fastify.addHook('onRequest', requireAuth);

  fastify.get('/', async (req) => {
    const { projectId } = req.params as { projectId: string };
    const db = getDb();
    const result = await db.query.sprints.findMany({
      where: eq(sprints.projectId, projectId),
      orderBy: (s, { desc }) => [desc(s.createdAt)],
    });
    return { sprints: result };
  });

  fastify.post('/', async (req, reply) => {
    const { projectId } = req.params as { projectId: string };
    const body = SprintSchema.parse(req.body);
    const db = getDb();
    const [sprint] = await db.insert(sprints).values({
      projectId,
      name: body.name,
      goal: body.goal,
      startDate: body.startDate ? new Date(body.startDate) : undefined,
      endDate: body.endDate ? new Date(body.endDate) : undefined,
    }).returning();
    return reply.status(201).send({ sprint });
  });

  fastify.get('/:sprintId', async (req, reply) => {
    const { projectId, sprintId } = req.params as { projectId: string; sprintId: string };
    const db = getDb();
    const sprint = await db.query.sprints.findFirst({
      where: and(eq(sprints.id, sprintId), eq(sprints.projectId, projectId)),
    });
    if (!sprint) return reply.status(404).send({ error: 'Sprint not found' });

    const sprintStories = await db.query.stories.findMany({
      where: eq(stories.sprintId, sprintId),
      orderBy: (s, { asc }) => [asc(s.position)],
    });
    return { sprint, stories: sprintStories };
  });

  fastify.patch('/:sprintId', async (req, reply) => {
    const { projectId, sprintId } = req.params as { projectId: string; sprintId: string };
    const body = SprintSchema.partial().parse(req.body);
    const db = getDb();
    const [updated] = await db.update(sprints)
      .set({ ...body, updatedAt: new Date() })
      .where(and(eq(sprints.id, sprintId), eq(sprints.projectId, projectId)))
      .returning();
    if (!updated) return reply.status(404).send({ error: 'Sprint not found' });
    return { sprint: updated };
  });
}
