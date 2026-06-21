import Anthropic from '@anthropic-ai/sdk';
import { eq } from 'drizzle-orm';
import { getDb, stories, agentSessions } from '@aiscrumboard/db';
import type { QAJobData } from '@aiscrumboard/shared';
import type { QAResult } from '@aiscrumboard/db';
import { BaseAgent } from './base.agent.js';
import type { AgentConfig } from './base.agent.js';

const QA_SYSTEM_PROMPT = `You are a senior QA engineer validating a software implementation.

Your job is to verify that each acceptance criterion has been correctly implemented.
You may run tests, start servers, and make HTTP requests to verify behavior.
You have READ-ONLY access to source files — do not modify them.

When done, output exactly:
{"qaResult": {"passed": <true/false>, "criteria": [{"id": "<id>", "text": "<text>", "passed": <bool>, "error": "<optional error>"}], "testOutput": "<summary>"}}
`;

export class QAAgent extends BaseAgent {
  private jobData: QAJobData;

  constructor(config: AgentConfig, jobData: QAJobData) {
    super(config);
    this.jobData = jobData;
  }

  async run(): Promise<void> {
    await this.updateStatus('running', { startedAt: new Date() });
    await this.appendLog('system', `QA agent started for story ${this.jobData.storyId}`);

    const db = getDb();
    const story = await db.query.stories.findFirst({
      where: eq(stories.id, this.jobData.storyId),
    });
    if (!story) throw new Error(`Story ${this.jobData.storyId} not found`);

    const criteriaList = story.acceptanceCriteria
      .map((ac, i) => `${i + 1}. [id: ${ac.id}] ${ac.text}`)
      .join('\n');

    this.conversationHistory = [{
      role: 'user',
      content: `Verify this implementation on branch ${this.jobData.branchName}.\n\nAcceptance Criteria:\n${criteriaList}\n\nOutput the qaResult JSON when done.`,
    }];

    const tools: Anthropic.Tool[] = [
      {
        name: 'bash',
        description: 'Execute a read-only shell command (no file writes)',
        input_schema: {
          type: 'object' as const,
          properties: { command: { type: 'string' } },
          required: ['command'],
        },
      },
    ];

    let iterations = 0;
    const MAX_ITERATIONS = 30;

    while (iterations < MAX_ITERATIONS) {
      await this.checkControlSignal();
      iterations++;

      const response = await this.client.messages.create({
        model: this.config.model,
        max_tokens: this.config.maxTokensPerTurn,
        system: QA_SYSTEM_PROMPT,
        messages: this.conversationHistory,
        tools,
      });

      await this.trackTokens(response.usage);

      this.conversationHistory.push({ role: 'assistant', content: response.content });

      if (response.stop_reason === 'end_turn') {
        for (const block of response.content) {
          if (block.type === 'text') {
            const match = block.text.match(/\{[\s\S]*"qaResult"[\s\S]*\}/);
            if (match) {
              try {
                const parsed = JSON.parse(match[0]) as { qaResult: QAResult };
                const qaResult = parsed.qaResult;

                await db.update(agentSessions)
                  .set({ qaResult, status: 'completed', completedAt: new Date(), updatedAt: new Date() })
                  .where(eq(agentSessions.id, this.config.sessionId));

                const newStage = qaResult.passed ? 'accepted' : 'rejected';
                await db.update(stories)
                  .set({
                    stage: newStage,
                    acceptedAt: qaResult.passed ? new Date() : undefined,
                    updatedAt: new Date(),
                  })
                  .where(eq(stories.id, this.jobData.storyId));

                await this.appendLog('system', `QA ${qaResult.passed ? 'PASSED' : 'FAILED'}: ${qaResult.testOutput}`);
                return;
              } catch { /* continue */ }
            }
          }
        }
        throw new Error('QA agent stopped without result JSON');
      }

      if (response.stop_reason !== 'tool_use') break;

      const toolResults: Anthropic.ToolResultBlockParam[] = [];
      for (const block of response.content) {
        if (block.type !== 'tool_use') continue;
        await this.appendLog('tool_call', `QA Tool: ${block.name}`, { input: block.input });
        const result = `[QA bash] Would run: ${(block.input as { command: string }).command}`;
        toolResults.push({ type: 'tool_result', tool_use_id: block.id, content: result });
      }
      this.conversationHistory.push({ role: 'user', content: toolResults });
    }

    throw new Error('QA agent exceeded max iterations');
  }
}
