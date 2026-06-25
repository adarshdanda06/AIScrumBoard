import type { FastifyInstance } from 'fastify';
import { eq, and, isNull, sql } from 'drizzle-orm';
import { z } from 'zod';
import { getDb } from '../config/database.js';
import { requireAuth } from '../plugins/auth.plugin.js';
import { stories } from '@aiscrumboard/db';
import { isValidTransition } from '@aiscrumboard/shared';
import { getRedisPub, projectSseChannel } from '../config/redis.js';

const CreateStorySchema = z.object({
  type: z.enum(['story', 'spike', 'bug', 'task']).default('story'),
  title: z.string().min(1).max(200),
  description: z.string().default(''),
  acceptanceCriteria: z.array(z.object({
    id: z.string(),
    text: z.string(),
    verified: z.boolean().default(false),
  })).default([]),
  priority: z.enum(['critical', 'high', 'medium', 'low']).default('medium'),
  storyPoints: z.number().int().min(1).max(100).optional(),
  sprintId: z.string().uuid().optional(),
  dependsOn: z.array(z.string().uuid()).default([]),
});

const UpdateStorySchema = CreateStorySchema.partial().extend({
  stage: z.enum(['backlog', 'in_progress', 'completed', 'accepted', 'rejected']).optional(),
  position: z.number().optional(),
});

const ReorderSchema = z.object({
  items: z.array(z.object({
    storyId: z.string().uuid(),
    position: z.number(),
  })),
});

export async function storiesRoutes(fastify: FastifyInstance) {
  fastify.addHook('onRequest', requireAuth);

  fastify.get('/', async (req) => {
    const { projectId } = req.params as { projectId: string };
    const query = req.query as { stage?: string; sprintId?: string };
    const db = getDb();

    const conditions = [
      eq(stories.projectId, projectId),
      isNull(stories.deletedAt),
    ];
    if (query.stage) {
      conditions.push(eq(stories.stage, query.stage as typeof stories.stage._.data));
    }
    if (query.sprintId) {
      conditions.push(eq(stories.sprintId, query.sprintId));
    }

    const result = await db.query.stories.findMany({
      where: and(...conditions),
      orderBy: (s, { asc }) => [asc(s.position), asc(s.createdAt)],
    });
    return { stories: result };
  });

  fastify.post('/', async (req, reply) => {
    const { projectId } = req.params as { projectId: string };
    const body = CreateStorySchema.parse(req.body);
    const db = getDb();

    // Compute max position in backlog
    const [maxPos] = await db.select({ max: sql<number>`MAX(position)` })
      .from(stories)
      .where(and(eq(stories.projectId, projectId), eq(stories.stage, 'backlog')));

    const [story] = await db.insert(stories).values({
      projectId,
      ...body,
      position: (maxPos?.max ?? 0) + 1000,
      stage: 'backlog',
    }).returning();

    await emitSse(projectId, 'board.story.created', { story });
    return reply.status(201).send({ story });
  });

  fastify.get('/:storyId', async (req, reply) => {
    const { projectId, storyId } = req.params as { projectId: string; storyId: string };
    const db = getDb();
    const story = await db.query.stories.findFirst({
      where: and(eq(stories.id, storyId), eq(stories.projectId, projectId), isNull(stories.deletedAt)),
    });
    if (!story) return reply.status(404).send({ error: 'Story not found' });
    return { story };
  });

  fastify.patch('/:storyId', async (req, reply) => {
    const { projectId, storyId } = req.params as { projectId: string; storyId: string };
    const body = UpdateStorySchema.parse(req.body);
    const db = getDb();

    // Validate stage transition
    if (body.stage) {
      const current = await db.query.stories.findFirst({
        where: and(eq(stories.id, storyId), eq(stories.projectId, projectId)),
        columns: { stage: true },
      });
      if (current && !isValidTransition(current.stage, body.stage)) {
        return reply.status(422).send({
          error: `Invalid stage transition: ${current.stage} → ${body.stage}`,
        });
      }
    }

    const [updated] = await db.update(stories)
      .set({ ...body, updatedAt: new Date() })
      .where(and(eq(stories.id, storyId), eq(stories.projectId, projectId), isNull(stories.deletedAt)))
      .returning();

    if (!updated) return reply.status(404).send({ error: 'Story not found' });

    if (body.stage) {
      await emitSse(projectId, 'board.story.moved', {
        storyId,
        from: body.stage,
        to: body.stage,
      });
    } else {
      await emitSse(projectId, 'board.story.updated', { storyId, patch: body });
    }

    return { story: updated };
  });

  fastify.delete('/:storyId', async (req, reply) => {
    const { projectId, storyId } = req.params as { projectId: string; storyId: string };
    const db = getDb();
    await db.update(stories)
      .set({ deletedAt: new Date(), updatedAt: new Date() })
      .where(and(eq(stories.id, storyId), eq(stories.projectId, projectId)));
    return reply.status(204).send();
  });

  fastify.post('/reorder', async (req, reply) => {
    const { projectId } = req.params as { projectId: string };
    const { items } = ReorderSchema.parse(req.body);
    const db = getDb();

    await Promise.all(items.map(({ storyId, position }) =>
      db.update(stories)
        .set({ position, updatedAt: new Date() })
        .where(and(eq(stories.id, storyId), eq(stories.projectId, projectId))),
    ));

    return reply.status(200).send({ ok: true });
  });

  fastify.post('/:storyId/accept', async (req, reply) => {
    const { projectId, storyId } = req.params as { projectId: string; storyId: string };
    const db = getDb();
    const [updated] = await db.update(stories)
      .set({ stage: 'accepted', acceptedAt: new Date(), updatedAt: new Date() })
      .where(and(eq(stories.id, storyId), eq(stories.projectId, projectId)))
      .returning();
    if (!updated) return reply.status(404).send({ error: 'Story not found' });
    await emitSse(projectId, 'board.story.moved', { storyId, from: updated.stage, to: 'accepted' });
    return { story: updated };
  });

  fastify.post('/:storyId/reject', async (req, reply) => {
    const { projectId, storyId } = req.params as { projectId: string; storyId: string };
    const db = getDb();
    const [updated] = await db.update(stories)
      .set({ stage: 'rejected', updatedAt: new Date() })
      .where(and(eq(stories.id, storyId), eq(stories.projectId, projectId)))
      .returning();
    if (!updated) return reply.status(404).send({ error: 'Story not found' });
    return { story: updated };
  });
}

async function emitSse(projectId: string, type: string, payload: unknown) {
  try {
    const pub = getRedisPub();
    await pub.publish(
      projectSseChannel(projectId),
      JSON.stringify({ type, payload, timestamp: new Date().toISOString() }),
    );
  } catch {
    // Non-fatal: SSE emission failure shouldn't break the request
  }
}
