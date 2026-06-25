import Anthropic from '@anthropic-ai/sdk';
import { eq } from 'drizzle-orm';
import { getDb, agentSessions, agentLogs } from '@aiscrumboard/db';
import type { AgentCheckpoint } from '@aiscrumboard/db';

export class PauseSignalError extends Error {
  constructor(message = 'Agent paused by credit monitor') {
    super(message);
    this.name = 'PauseSignalError';
  }
}

export interface AgentConfig {
  sessionId: string;
  model: string;
  maxTokensPerTurn: number;
  systemPrompt: string;
  anthropicApiKey: string;
}

export abstract class BaseAgent {
  protected client: Anthropic;
  protected config: AgentConfig;
  protected conversationHistory: Anthropic.MessageParam[] = [];
  protected lastToolCallIndex = 0;
  protected tokensUsed = { input: 0, output: 0 };
  protected logSequence = 0;
  private pauseRequested = false;
  private cancelRequested = false;

  constructor(config: AgentConfig) {
    this.config = config;
    this.client = new Anthropic({ apiKey: config.anthropicApiKey });
  }

  /** Called by orchestrator when credits are exhausted */
  requestPause() { this.pauseRequested = true; }
  requestCancel() { this.cancelRequested = true; }

  /** Check cooperative pause/cancel point — call between tool calls */
  protected async checkControlSignal() {
    if (this.cancelRequested) {
      await this.updateStatus('cancelled');
      throw new Error('Agent cancelled');
    }
    if (this.pauseRequested) {
      await this.saveCheckpoint('Paused by credit monitor');
      await this.updateStatus('paused');
      throw new PauseSignalError();
    }
  }

  /** Resume from a saved checkpoint */
  async resumeFromCheckpoint(checkpoint: AgentCheckpoint) {
    this.conversationHistory = checkpoint.conversationHistory as Anthropic.MessageParam[];
    this.lastToolCallIndex = checkpoint.lastToolCallIndex;
    this.tokensUsed = checkpoint.tokensUsed;
    await this.updateStatus('running', { resumedAt: new Date() });
  }

  async saveCheckpoint(message: string) {
    const checkpoint: AgentCheckpoint = {
      conversationHistory: this.conversationHistory,
      lastToolCallIndex: this.lastToolCallIndex,
      gitStashRef: null,
      workingDirectory: '/workspace',
      tokensUsed: this.tokensUsed,
      checkpointMessage: message,
    };
    await getDb().update(agentSessions)
      .set({ pausedState: checkpoint, updatedAt: new Date() })
      .where(eq(agentSessions.id, this.config.sessionId));
  }

  protected async updateStatus(
    status: typeof agentSessions.status._.data,
    extra?: Record<string, unknown>,
  ) {
    await getDb().update(agentSessions)
      .set({ status, updatedAt: new Date(), ...extra } as Parameters<typeof getDb>['0'])
      .where(eq(agentSessions.id, this.config.sessionId));
  }

  protected async appendLog(
    level: 'info' | 'tool_call' | 'tool_result' | 'error' | 'system',
    message: string,
    metadata?: Record<string, unknown>,
  ) {
    const seq = ++this.logSequence;
    await getDb().insert(agentLogs).values({
      agentSessionId: this.config.sessionId,
      sequence: seq,
      level,
      message,
      metadata: metadata ?? {},
    });
  }

  protected async trackTokens(usage: { input_tokens: number; output_tokens: number }) {
    this.tokensUsed.input += usage.input_tokens;
    this.tokensUsed.output += usage.output_tokens;

    // Rough cost: claude-sonnet-4-6 pricing
    const inputCost = (this.tokensUsed.input / 1_000_000) * 3.0;
    const outputCost = (this.tokensUsed.output / 1_000_000) * 15.0;

    await getDb().update(agentSessions)
      .set({
        inputTokensUsed: this.tokensUsed.input,
        outputTokensUsed: this.tokensUsed.output,
        costUsd: String(inputCost + outputCost),
        updatedAt: new Date(),
      })
      .where(eq(agentSessions.id, this.config.sessionId));
  }

  /** Subclasses implement the core execution loop */
  abstract run(): Promise<void>;
}
