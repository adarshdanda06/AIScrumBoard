import Anthropic from '@anthropic-ai/sdk';
import { eq, sql } from 'drizzle-orm';
import { getDb, projects, stories } from '@aiscrumboard/db';
import type { DiscoveryJobData } from '@aiscrumboard/shared';
import { BaseAgent } from './base.agent.js';
import type { AgentConfig } from './base.agent.js';

const DISCOVERY_SYSTEM_PROMPT = `You are an expert Agile product manager and software architect.

Given a software concept description, decompose it into an actionable backlog of User Stories and SPIKES.

Output a single JSON object with this exact structure:
{
  "stories": [
    {
      "type": "story" | "spike" | "bug" | "task",
      "title": "Short title (max 100 chars)",
      "description": "As a [user], I want [goal] so that [benefit]",
      "acceptanceCriteria": [
        { "id": "<uuid>", "text": "Criterion text", "verified": false }
      ],
      "priority": "critical" | "high" | "medium" | "low",
      "storyPoints": 1-13,
      "dependsOnTitles": ["title of story this depends on"]
    }
  ]
}

Rules:
- Use SPIKE for research/unknowns with no implementation
- Start with foundational infrastructure stories (auth, DB, API scaffolding)
- Keep stories small and independently deliverable (1-5 points)
- Maximum 20 stories for the initial backlog
- Acceptance criteria must be specific and testable
`;

export class DiscoveryAgent extends BaseAgent {
  private jobData: DiscoveryJobData;

  constructor(config: AgentConfig, jobData: DiscoveryJobData) {
    super(config);
    this.jobData = jobData;
  }

  async run(): Promise<void> {
    await this.updateStatus('running', { startedAt: new Date() });
    await this.appendLog('system', `Discovery agent started for project ${this.jobData.projectId}`);

    const response = await this.client.messages.create({
      model: this.config.model,
      max_tokens: 8096,
      system: DISCOVERY_SYSTEM_PROMPT,
      messages: [{
        role: 'user',
        content: `Decompose the following concept into a prioritized backlog:\n\n${this.jobData.conceptText}`,
      }],
    });

    await this.trackTokens(response.usage);

    const text = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('');

    const match = text.match(/\{[\s\S]*"stories"[\s\S]*\}/);
    if (!match) throw new Error('Discovery agent produced no structured output');

    const parsed = JSON.parse(match[0]) as {
      stories: Array<{
        type: string;
        title: string;
        description: string;
        acceptanceCriteria: Array<{ id: string; text: string; verified: boolean }>;
        priority: string;
        storyPoints: number;
        dependsOnTitles: string[];
      }>;
    };

    const db = getDb();
    const insertedStories: Array<{ id: string; title: string }> = [];

    for (const [idx, s] of parsed.stories.entries()) {
      const [maxPos] = await db.select({ max: sql<number>`COALESCE(MAX(position), 0)` })
        .from(stories)
        .where(eq(stories.projectId, this.jobData.projectId));

      const [inserted] = await db.insert(stories).values({
        projectId: this.jobData.projectId,
        type: s.type as 'story' | 'spike' | 'bug' | 'task',
        title: s.title,
        description: s.description,
        acceptanceCriteria: s.acceptanceCriteria,
        priority: s.priority as 'critical' | 'high' | 'medium' | 'low',
        storyPoints: s.storyPoints,
        stage: 'backlog',
        position: (maxPos?.max ?? 0) + (idx + 1) * 1000,
      }).returning({ id: stories.id, title: stories.title });

      if (inserted) insertedStories.push(inserted);
    }

    // Second pass: wire up dependencies by title
    for (const s of parsed.stories) {
      if (!s.dependsOnTitles?.length) continue;
      const inserted = insertedStories.find((i) => i.title === s.title);
      if (!inserted) continue;

      const depIds = s.dependsOnTitles
        .map((t) => insertedStories.find((i) => i.title === t)?.id)
        .filter((id): id is string => id !== undefined);

      if (depIds.length) {
        await db.update(stories)
          .set({ dependsOn: depIds, updatedAt: new Date() })
          .where(eq(stories.id, inserted.id));
      }
    }

    await db.update(projects)
      .set({ status: 'active', updatedAt: new Date() })
      .where(eq(projects.id, this.jobData.projectId));

    await this.updateStatus('completed', { completedAt: new Date(), resultSummary: `Created ${insertedStories.length} stories` });
    await this.appendLog('system', `Discovery complete: created ${insertedStories.length} stories`);
  }
}
