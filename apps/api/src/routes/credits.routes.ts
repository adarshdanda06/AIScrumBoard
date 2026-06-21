import type { FastifyInstance } from 'fastify';
import { eq, desc } from 'drizzle-orm';
import { z } from 'zod';
import { getDb } from '../config/database.js';
import { requireAuth } from '../plugins/auth.plugin.js';
import { creditAccounts, creditEvents, users } from '@aiscrumboard/db';

const ConfigureCreditsSchema = z.object({
  anthropicApiKey: z.string().min(1).optional(),
  lowCreditThresholdUsd: z.number().min(0.5).max(1000).optional(),
});

export async function creditsRoutes(fastify: FastifyInstance) {
  fastify.addHook('onRequest', requireAuth);

  fastify.get('/', async (req) => {
    const db = getDb();
    const account = await db.query.creditAccounts.findFirst({
      where: eq(creditAccounts.userId, req.user.id),
    });
    return { credits: account ?? null };
  });

  fastify.get('/events', async (req) => {
    const query = req.query as { limit?: string };
    const limit = Math.min(Number(query.limit ?? 50), 200);
    const db = getDb();
    const events = await db.select().from(creditEvents)
      .where(eq(creditEvents.userId, req.user.id))
      .orderBy(desc(creditEvents.occurredAt))
      .limit(limit);
    return { events };
  });

  fastify.post('/configure', async (req, reply) => {
    const body = ConfigureCreditsSchema.parse(req.body);
    const db = getDb();

    if (body.anthropicApiKey) {
      // Store encrypted API key on user record
      // Encryption handled in a service layer (placeholder — uses plain storage for scaffold)
      await db.update(users)
        .set({ anthropicApiKey: body.anthropicApiKey, updatedAt: new Date() })
        .where(eq(users.id, req.user.id));
    }

    if (body.lowCreditThresholdUsd !== undefined) {
      await db.insert(creditAccounts)
        .values({
          userId: req.user.id,
          lowCreditThresholdUsd: String(body.lowCreditThresholdUsd),
          status: 'unknown',
        })
        .onConflictDoUpdate({
          target: creditAccounts.userId,
          set: {
            lowCreditThresholdUsd: String(body.lowCreditThresholdUsd),
            updatedAt: new Date(),
          },
        });
    }

    return reply.status(200).send({ ok: true });
  });

  fastify.post('/check', async (_req, reply) => {
    // Manual trigger for credit re-check — enqueues a credit monitor job
    // (BullMQ integration wired in Phase 5)
    return reply.status(202).send({ message: 'Credit check queued' });
  });
}
