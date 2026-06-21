import type { FastifyInstance } from 'fastify';
import { eq, and } from 'drizzle-orm';
import { z } from 'zod';
import { getDb } from '../config/database.js';
import { requireAuth } from '../plugins/auth.plugin.js';
import { envConfigs } from '@aiscrumboard/db';

const SetEnvSchema = z.object({
  key: z.string().min(1).max(100).regex(/^[A-Z0-9_]+$/, 'Key must be SCREAMING_SNAKE_CASE'),
  value: z.string().min(1),
  isSecret: z.boolean().default(true),
  description: z.string().optional(),
});

export async function envConfigRoutes(fastify: FastifyInstance) {
  fastify.addHook('onRequest', requireAuth);

  fastify.get('/', async (req) => {
    const { projectId } = req.params as { projectId: string };
    const db = getDb();
    const configs = await db.query.envConfigs.findMany({
      where: eq(envConfigs.projectId, projectId),
    });
    // Mask secret values
    return {
      env: configs.map((c) => ({
        ...c,
        value: c.isSecret ? (c.isProvided ? '***' : null) : c.value,
      })),
    };
  });

  fastify.post('/', async (req, reply) => {
    const { projectId } = req.params as { projectId: string };
    const body = SetEnvSchema.parse(req.body);
    const db = getDb();

    // Placeholder: in Phase 6 this value will be AES-256-GCM encrypted
    const encryptedValue = body.value;

    const [config] = await db.insert(envConfigs)
      .values({
        projectId,
        key: body.key,
        value: encryptedValue,
        isSecret: body.isSecret,
        isProvided: true,
        description: body.description,
      })
      .onConflictDoUpdate({
        target: [envConfigs.projectId, envConfigs.key],
        set: {
          value: encryptedValue,
          isProvided: true,
          updatedAt: new Date(),
        },
      })
      .returning();

    return reply.status(201).send({ config: { ...config, value: body.isSecret ? '***' : config!.value } });
  });

  fastify.delete('/:key', async (req, reply) => {
    const { projectId, key } = req.params as { projectId: string; key: string };
    const db = getDb();
    await db.delete(envConfigs).where(
      and(eq(envConfigs.projectId, projectId), eq(envConfigs.key, key)),
    );
    return reply.status(204).send();
  });
}
