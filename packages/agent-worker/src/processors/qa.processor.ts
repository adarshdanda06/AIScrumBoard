import type { Job } from 'bullmq';
import { eq } from 'drizzle-orm';
import { getDb, agentSessions, stories, users, projects } from '@aiscrumboard/db';
import type { QAJobData } from '@aiscrumboard/shared';
import { QAAgent } from '../agents/qa.agent.js';
import { storyQueue } from '../queues/index.js';
import type { StoryWorkerJobData } from '@aiscrumboard/shared';

export async function qaProcessor(job: Job<QAJobData>) {
  const data = job.data;
  const db = getDb();

  const story = await db.query.stories.findFirst({
    where: eq(stories.id, data.storyId),
  });
  if (!story) throw new Error(`Story ${data.storyId} not found`);

  const project = await db.query.projects.findFirst({
    where: eq(projects.id, data.projectId),
  });

  const owner = await db.query.users.findFirst({
    where: eq(users.id, project!.ownerId),
    columns: { anthropicApiKey: true },
  });

  const apiKey = owner?.anthropicApiKey ?? process.env['ANTHROPIC_API_KEY'];
  if (!apiKey) throw new Error('No Anthropic API key configured');

  await db.update(agentSessions)
    .set({ status: 'running', startedAt: new Date(), updatedAt: new Date() })
    .where(eq(agentSessions.id, data.agentSessionId));

  const agent = new QAAgent(
    {
      sessionId: data.agentSessionId,
      model: 'claude-sonnet-4-6',
      maxTokensPerTurn: 4096,
      systemPrompt: '',
      anthropicApiKey: apiKey,
    },
    data,
  );

  try {
    await agent.run();

    // After QA, check result and potentially re-enqueue worker
    const updatedSession = await db.query.agentSessions.findFirst({
      where: eq(agentSessions.id, data.agentSessionId),
      columns: { qaResult: true },
    });

    if (!updatedSession?.qaResult?.passed) {
      // Re-enqueue story worker with failure context
      const failureContext = updatedSession?.qaResult?.criteria
        .filter((c) => !c.passed)
        .map((c) => `- ${c.text}: ${c.error ?? 'FAILED'}`)
        .join('\n') ?? 'QA validation failed';

      const newSessionId = crypto.randomUUID();
      await db.insert(agentSessions).values({
        id: newSessionId,
        storyId: data.storyId,
        projectId: data.projectId,
        type: 'worker',
        status: 'queued',
      });

      await storyQueue.add('story-worker', {
        storyId: data.storyId,
        projectId: data.projectId,
        agentSessionId: newSessionId,
        attempt: story.attemptCount + 1,
        previousFailureContext: failureContext,
      } satisfies StoryWorkerJobData);
    }
  } catch (err) {
    await db.update(agentSessions)
      .set({ status: 'failed', exitCode: 1, updatedAt: new Date() })
      .where(eq(agentSessions.id, data.agentSessionId));
    throw err;
  }
}
