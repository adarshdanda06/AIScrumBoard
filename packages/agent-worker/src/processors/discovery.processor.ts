import type { Job } from 'bullmq';
import { eq } from 'drizzle-orm';
import { getDb, agentSessions, projects, users } from '@aiscrumboard/db';
import type { DiscoveryJobData } from '@aiscrumboard/shared';
import { DiscoveryAgent } from '../agents/discovery.agent.js';

export async function discoveryProcessor(job: Job<DiscoveryJobData>) {
  const data = job.data;
  const db = getDb();

  const project = await db.query.projects.findFirst({
    where: eq(projects.id, data.projectId),
  });
  if (!project) throw new Error(`Project ${data.projectId} not found`);

  const owner = await db.query.users.findFirst({
    where: eq(users.id, data.userId),
    columns: { anthropicApiKey: true },
  });

  const apiKey = owner?.anthropicApiKey ?? process.env['ANTHROPIC_API_KEY'];
  if (!apiKey) throw new Error('No Anthropic API key configured');

  await db.update(agentSessions)
    .set({ status: 'running', startedAt: new Date(), updatedAt: new Date() })
    .where(eq(agentSessions.id, data.agentSessionId));

  const agent = new DiscoveryAgent(
    {
      sessionId: data.agentSessionId,
      model: 'claude-opus-4-8',
      maxTokensPerTurn: 8096,
      systemPrompt: '',
      anthropicApiKey: apiKey,
    },
    data,
  );

  try {
    await agent.run();
  } catch (err) {
    await db.update(agentSessions)
      .set({ status: 'failed', exitCode: 1, updatedAt: new Date() })
      .where(eq(agentSessions.id, data.agentSessionId));
    throw err;
  }
}
