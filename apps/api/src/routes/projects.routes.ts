import type { FastifyInstance } from 'fastify';
import { eq, and } from 'drizzle-orm';
import { z } from 'zod';
import { getDb } from '../config/database.js';
import { requireAuth } from '../plugins/auth.plugin.js';
import { projects, projectMembers } from '@aiscrumboard/db';

const CreateProjectSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().optional(),
  githubRepoOwner: z.string().optional(),
  githubRepoName: z.string().optional(),
  defaultBranch: z.string().default('main'),
  settings: z.object({
    maxConcurrentAgents: z.number().int().min(1).max(10).default(3),
    autoAccept: z.boolean().default(false),
    qaRequired: z.boolean().default(true),
  }).optional(),
});

const UpdateProjectSchema = CreateProjectSchema.partial();

export async function projectsRoutes(fastify: FastifyInstance) {
  fastify.addHook('onRequest', requireAuth);

  fastify.get('/', async (req) => {
    const db = getDb();
    const userProjects = await db.query.projects.findMany({
      where: eq(projects.ownerId, req.user.id),
      orderBy: (p, { desc }) => [desc(p.createdAt)],
    });
    return { projects: userProjects };
  });

  fastify.post('/', async (req, reply) => {
    const body = CreateProjectSchema.parse(req.body);
    const db = getDb();

    const [project] = await db.insert(projects).values({
      name: body.name,
      description: body.description,
      ownerId: req.user.id,
      githubRepoOwner: body.githubRepoOwner,
      githubRepoName: body.githubRepoName,
      defaultBranch: body.defaultBranch,
      settings: body.settings ?? { maxConcurrentAgents: 3, autoAccept: false, qaRequired: true },
      status: 'discovery',
    }).returning();

    // Add owner as project member
    await db.insert(projectMembers).values({
      projectId: project!.id,
      userId: req.user.id,
      role: 'owner',
    });

    return reply.status(201).send({ project });
  });

  fastify.get('/:projectId', async (req, reply) => {
    const { projectId } = req.params as { projectId: string };
    const db = getDb();

    const project = await db.query.projects.findFirst({
      where: and(
        eq(projects.id, projectId),
        eq(projects.ownerId, req.user.id),
      ),
      with: {
        sprints: { orderBy: (s, { desc }) => [desc(s.createdAt)] },
      },
    });

    if (!project) return reply.status(404).send({ error: 'Project not found' });
    return { project };
  });

  fastify.patch('/:projectId', async (req, reply) => {
    const { projectId } = req.params as { projectId: string };
    const body = UpdateProjectSchema.parse(req.body);
    const db = getDb();

    const [updated] = await db.update(projects)
      .set({ ...body, updatedAt: new Date() })
      .where(and(eq(projects.id, projectId), eq(projects.ownerId, req.user.id)))
      .returning();

    if (!updated) return reply.status(404).send({ error: 'Project not found' });
    return { project: updated };
  });

  fastify.delete('/:projectId', async (req, reply) => {
    const { projectId } = req.params as { projectId: string };
    const db = getDb();

    await db.delete(projects).where(
      and(eq(projects.id, projectId), eq(projects.ownerId, req.user.id)),
    );
    return reply.status(204).send();
  });
}
