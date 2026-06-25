import {
  pgTable, uuid, text, timestamp, jsonb, integer, real, index, serial,
} from 'drizzle-orm/pg-core';
import { projects } from './projects.js';
import { sprints } from './sprints.js';

export type StoryStage = 'backlog' | 'in_progress' | 'completed' | 'accepted' | 'rejected';
export type StoryType = 'story' | 'spike' | 'bug' | 'task';
export type StoryPriority = 'critical' | 'high' | 'medium' | 'low';

export type AcceptanceCriterion = {
  id: string;
  text: string;
  verified: boolean;
};

export type ExecutionContext = {
  env: Record<string, string>;
  setupCommands: string[];
};

export const stories = pgTable('stories', {
  id: uuid('id').primaryKey().defaultRandom(),
  projectId: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  sprintId: uuid('sprint_id').references(() => sprints.id, { onDelete: 'set null' }),

  storyNumber: serial('story_number'),
  type: text('type', { enum: ['story', 'spike', 'bug', 'task'] as const })
    .notNull().$type<StoryType>().default('story'),
  title: text('title').notNull(),
  description: text('description').notNull(),
  acceptanceCriteria: jsonb('acceptance_criteria')
    .$type<AcceptanceCriterion[]>().notNull().default([]),

  stage: text('stage', {
    enum: ['backlog', 'in_progress', 'completed', 'accepted', 'rejected'] as const,
  }).notNull().$type<StoryStage>().default('backlog'),
  priority: text('priority', {
    enum: ['critical', 'high', 'medium', 'low'] as const,
  }).notNull().$type<StoryPriority>().default('medium'),
  storyPoints: integer('story_points'),
  position: real('position').notNull().default(0),

  assignedAgentId: uuid('assigned_agent_id'),
  branchName: text('branch_name'),
  prUrl: text('pr_url'),
  prNumber: integer('pr_number'),

  dependsOn: jsonb('depends_on').$type<string[]>().notNull().default([]),
  blockedBy: jsonb('blocked_by').$type<string[]>().notNull().default([]),

  attemptCount: integer('attempt_count').notNull().default(0),
  maxAttempts: integer('max_attempts').notNull().default(3),
  lastError: text('last_error'),
  executionContext: jsonb('execution_context').$type<ExecutionContext>().notNull().default({ env: {}, setupCommands: [] }),

  startedAt: timestamp('started_at'),
  completedAt: timestamp('completed_at'),
  acceptedAt: timestamp('accepted_at'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
  deletedAt: timestamp('deleted_at'),
}, (t) => [
  index('stories_project_stage_idx').on(t.projectId, t.stage),
  index('stories_sprint_idx').on(t.sprintId),
  index('stories_stage_position_idx').on(t.stage, t.position),
]);
