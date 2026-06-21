import type { Job } from 'bullmq';
import { eq } from 'drizzle-orm';
import { getDb, agentSessions, stories, users, projects } from '@aiscrumboard/db';
import type { StoryWorkerJobData } from '@aiscrumboard/shared';
import { WorkerAgent } from '../agents/worker.agent.js';
import { PauseSignalError } from '../agents/base.agent.js';
import { buildWorkerSystemPrompt } from '../agents/worker.agent.js';

// Map from sessionId → active agent instance (for pause/cancel signaling)
export const activeWorkerAgents = new Map<string, WorkerAgent>();

export async function storyProcessor(job: Job<StoryWorkerJobData>) {
  const data = job.data;
  const db = getDb();

  const story = await db.query.stories.findFirst({
    where: eq(stories.id, data.storyId),
    with: { project: true },
  });
  if (!story) throw new Error(`Story ${data.storyId} not found`);

  const project = await db.query.projects.findFirst({
    where: eq(projects.id, data.projectId),
  });
  if (!project) throw new Error(`Project ${data.projectId} not found`);

  const owner = await db.query.users.findFirst({
    where: eq(users.id, project.ownerId),
    columns: { anthropicApiKey: true },
  });

  const apiKey = owner?.anthropicApiKey ?? process.env['ANTHROPIC_API_KEY'];
  if (!apiKey) throw new Error('No Anthropic API key configured');

  // Update agent session to provisioning
  await db.update(agentSessions)
    .set({ status: 'provisioning', bullJobId: job.id, updatedAt: new Date() })
    .where(eq(agentSessions.id, data.agentSessionId));

  // Update story to in_progress
  await db.update(stories)
    .set({ stage: 'in_progress', startedAt: new Date(), updatedAt: new Date(), attemptCount: story.attemptCount + 1 })
    .where(eq(stories.id, data.storyId));

  const agent = new WorkerAgent(
    {
      sessionId: data.agentSessionId,
      model: 'claude-sonnet-4-6',
      maxTokensPerTurn: 4096,
      systemPrompt: buildWorkerSystemPrompt(story, data.previousFailureContext),
      anthropicApiKey: apiKey,
    },
    data,
  );

  activeWorkerAgents.set(data.agentSessionId, agent);

  // Listen for pause command from progress updates
  job.updateProgress = async (progress) => {
    if (typeof progress === 'object' && (progress as { command?: string }).command === 'pause') {
      agent.requestPause();
    }
  };

  try {
    await agent.run();
  } catch (err) {
    if (err instanceof PauseSignalError) {
      // Job will be re-queued when credits are restored
      return;
    }
    // Mark story and session as failed
    await db.update(agentSessions)
      .set({ status: 'failed', exitCode: 1, updatedAt: new Date() })
      .where(eq(agentSessions.id, data.agentSessionId));

    if (story.attemptCount + 1 >= story.maxAttempts) {
      await db.update(stories)
        .set({ stage: 'rejected', lastError: String(err), updatedAt: new Date() })
        .where(eq(stories.id, data.storyId));
    } else {
      await db.update(stories)
        .set({ stage: 'backlog', lastError: String(err), updatedAt: new Date() })
        .where(eq(stories.id, data.storyId));
    }
    throw err;
  } finally {
    activeWorkerAgents.delete(data.agentSessionId);
  }
}
