import {
  pgTable, uuid, text, timestamp, jsonb, integer, numeric, index,
} from 'drizzle-orm/pg-core';
import { projects } from './projects.js';
import { stories } from './stories.js';

export type AgentStatus =
  | 'queued' | 'provisioning' | 'running' | 'paused'
  | 'completed' | 'failed' | 'cancelled';

export type AgentType = 'worker' | 'qa' | 'discovery';

export type AgentCheckpoint = {
  conversationHistory: Array<{ role: string; content: unknown }>;
  lastToolCallIndex: number;
  gitStashRef: string | null;
  workingDirectory: string;
  tokensUsed: { input: number; output: number };
  checkpointMessage: string;
};

export type QAResult = {
  passed: boolean;
  criteria: Array<{ id: string; text: string; passed: boolean; error?: string }>;
  testOutput: string;
  coverage?: number;
};

export const agentSessions = pgTable('agent_sessions', {
  id: uuid('id').primaryKey().defaultRandom(),
  storyId: uuid('story_id').notNull().references(() => stories.id, { onDelete: 'cascade' }),
  projectId: uuid('project_id').notNull().references(() => projects.id),
  type: text('type', { enum: ['worker', 'qa', 'discovery'] as const })
    .notNull().$type<AgentType>(),

  status: text('status', {
    enum: ['queued', 'provisioning', 'running', 'paused', 'completed', 'failed', 'cancelled'] as const,
  }).notNull().$type<AgentStatus>().default('queued'),

  bullJobId: text('bull_job_id').unique(),
  bullQueueName: text('bull_queue_name'),

  containerId: text('container_id'),
  containerName: text('container_name'),

  claudeSessionId: text('claude_session_id'),
  pausedState: jsonb('paused_state').$type<AgentCheckpoint>(),

  model: text('model').notNull().default('claude-sonnet-4-6'),
  inputTokensUsed: integer('input_tokens_used').notNull().default(0),
  outputTokensUsed: integer('output_tokens_used').notNull().default(0),
  costUsd: numeric('cost_usd', { precision: 10, scale: 6 }).notNull().default('0'),

  logStreamKey: text('log_stream_key'),

  queuedAt: timestamp('queued_at').notNull().defaultNow(),
  startedAt: timestamp('started_at'),
  pausedAt: timestamp('paused_at'),
  resumedAt: timestamp('resumed_at'),
  completedAt: timestamp('completed_at'),

  exitCode: integer('exit_code'),
  resultSummary: text('result_summary'),
  qaResult: jsonb('qa_result').$type<QAResult>(),

  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, (t) => [
  index('agent_sessions_story_idx').on(t.storyId),
  index('agent_sessions_project_status_idx').on(t.projectId, t.status),
]);

export const agentLogs = pgTable('agent_logs', {
  id: uuid('id').primaryKey().defaultRandom(),
  agentSessionId: uuid('agent_session_id').notNull()
    .references(() => agentSessions.id, { onDelete: 'cascade' }),
  sequence: integer('sequence').notNull(),
  level: text('level', {
    enum: ['info', 'tool_call', 'tool_result', 'error', 'system'] as const,
  }).notNull(),
  message: text('message').notNull(),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().default({}),
  timestamp: timestamp('timestamp').notNull().defaultNow(),
}, (t) => [
  index('agent_logs_session_seq_idx').on(t.agentSessionId, t.sequence),
]);
