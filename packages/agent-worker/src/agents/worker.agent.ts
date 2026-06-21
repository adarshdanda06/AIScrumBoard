import Anthropic from '@anthropic-ai/sdk';
import { eq } from 'drizzle-orm';
import { getDb, stories, agentSessions } from '@aiscrumboard/db';
import type { StoryWorkerJobData } from '@aiscrumboard/shared';
import { BaseAgent, PauseSignalError } from './base.agent.js';
import type { AgentConfig } from './base.agent.js';

const WORKER_SYSTEM_PROMPT = `You are an expert software engineer implementing a user story.

You have access to a git repository in /workspace. Your job is to:
1. Read the user story requirements carefully
2. Implement ALL acceptance criteria
3. Write tests where appropriate
4. Run the tests to verify your implementation
5. Commit your changes with a clear message
6. Report completion with a structured JSON summary

Rules:
- Only modify files in /workspace
- Never push to the remote; the orchestrator will handle that
- When done, output exactly: {"done": true, "summary": "<brief description>", "filesModified": [...]}
- If you encounter an environment variable that is missing, output: {"needsEnvVar": true, "key": "VAR_NAME", "description": "why it's needed"}
`;

export function buildWorkerSystemPrompt(
  story: { title: string; description: string; acceptanceCriteria: unknown[] },
  failureContext?: string,
): string {
  let prompt = WORKER_SYSTEM_PROMPT;
  prompt += `\n\n## Story to Implement\n\n**${story.title}**\n\n${story.description}\n`;
  prompt += '\n## Acceptance Criteria\n';
  for (const [i, ac] of Object.entries(story.acceptanceCriteria)) {
    prompt += `${Number(i) + 1}. ${(ac as { text: string }).text}\n`;
  }
  if (failureContext) {
    prompt += `\n## Previous Attempt Failed\n\n${failureContext}\n\nPlease address these issues.\n`;
  }
  return prompt;
}

export class WorkerAgent extends BaseAgent {
  private jobData: StoryWorkerJobData;

  constructor(config: AgentConfig, jobData: StoryWorkerJobData) {
    super(config);
    this.jobData = jobData;
  }

  async run(): Promise<void> {
    await this.updateStatus('running', { startedAt: new Date() });
    await this.appendLog('system', `Worker agent started for story ${this.jobData.storyId}`);

    const db = getDb();
    const story = await db.query.stories.findFirst({
      where: eq(stories.id, this.jobData.storyId),
    });
    if (!story) throw new Error(`Story ${this.jobData.storyId} not found`);

    this.conversationHistory = [{
      role: 'user',
      content: `Please implement the following user story. Once complete, output the JSON completion signal.\n\n${buildWorkerSystemPrompt(story, this.jobData.previousFailureContext)}`,
    }];

    const tools: Anthropic.Tool[] = [
      {
        name: 'bash',
        description: 'Execute a shell command in /workspace',
        input_schema: {
          type: 'object' as const,
          properties: { command: { type: 'string' }, timeout: { type: 'number' } },
          required: ['command'],
        },
      },
      {
        name: 'read_file',
        description: 'Read a file from /workspace',
        input_schema: {
          type: 'object' as const,
          properties: { path: { type: 'string' } },
          required: ['path'],
        },
      },
      {
        name: 'write_file',
        description: 'Write content to a file in /workspace',
        input_schema: {
          type: 'object' as const,
          properties: { path: { type: 'string' }, content: { type: 'string' } },
          required: ['path', 'content'],
        },
      },
    ];

    let iterations = 0;
    const MAX_ITERATIONS = 50;

    while (iterations < MAX_ITERATIONS) {
      await this.checkControlSignal();
      iterations++;

      const response = await this.client.messages.create({
        model: this.config.model,
        max_tokens: this.config.maxTokensPerTurn,
        system: this.config.systemPrompt,
        messages: this.conversationHistory,
        tools,
      });

      await this.trackTokens(response.usage);

      const assistantMessage: Anthropic.MessageParam = {
        role: 'assistant',
        content: response.content,
      };
      this.conversationHistory.push(assistantMessage);

      if (response.stop_reason === 'end_turn') {
        // Check for completion signal in text blocks
        for (const block of response.content) {
          if (block.type === 'text') {
            const match = block.text.match(/\{[\s\S]*"done"\s*:\s*true[\s\S]*\}/);
            if (match) {
              try {
                const result = JSON.parse(match[0]) as { done: boolean; summary: string };
                await this.appendLog('system', `Story implementation complete: ${result.summary}`);
                await this.updateStatus('completed', {
                  completedAt: new Date(),
                  resultSummary: result.summary,
                });
                await db.update(stories)
                  .set({ stage: 'completed', completedAt: new Date(), updatedAt: new Date() })
                  .where(eq(stories.id, this.jobData.storyId));
                return;
              } catch { /* not valid JSON, continue */ }
            }
          }
        }
        // No done signal and no tool calls — agent is stuck
        await this.appendLog('error', 'Agent stopped without completion signal');
        throw new Error('Agent stopped without completion signal');
      }

      if (response.stop_reason !== 'tool_use') break;

      // Process tool calls
      const toolResults: Anthropic.ToolResultBlockParam[] = [];
      for (const block of response.content) {
        if (block.type !== 'tool_use') continue;
        this.lastToolCallIndex++;
        await this.checkControlSignal();

        await this.appendLog('tool_call', `Tool: ${block.name}`, { input: block.input });
        const result = await this.executeToolCall(block.name, block.input as Record<string, unknown>);
        await this.appendLog('tool_result', result.slice(0, 500));

        toolResults.push({ type: 'tool_result', tool_use_id: block.id, content: result });
      }

      this.conversationHistory.push({ role: 'user', content: toolResults });
    }

    throw new Error(`Agent exceeded ${MAX_ITERATIONS} iterations without completing`);
  }

  private async executeToolCall(name: string, input: Record<string, unknown>): Promise<string> {
    // Tool execution is handled by the Docker container via exec.
    // In Phase 2, this delegates to docker/manager.ts exec().
    // Placeholder implementation for scaffold:
    switch (name) {
      case 'bash':
        return `[bash] Would execute: ${input['command']} (Docker exec not yet wired)`;
      case 'read_file':
        return `[read_file] Would read: ${input['path']}`;
      case 'write_file':
        return `[write_file] Would write to: ${input['path']}`;
      default:
        return `Unknown tool: ${name}`;
    }
  }
}
