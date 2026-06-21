import { pgTable, uuid, text, timestamp, jsonb, primaryKey } from 'drizzle-orm/pg-core';
import { users } from './users.js';

export const projects = pgTable('projects', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  description: text('description'),
  ownerId: uuid('owner_id').notNull().references(() => users.id),
  githubRepoUrl: text('github_repo_url'),
  githubRepoOwner: text('github_repo_owner'),
  githubRepoName: text('github_repo_name'),
  defaultBranch: text('default_branch').notNull().default('main'),
  status: text('status', {
    enum: ['discovery', 'active', 'paused', 'completed'],
  }).notNull().default('discovery'),
  // { maxConcurrentAgents: number, autoAccept: boolean, qaRequired: boolean }
  settings: jsonb('settings').$type<{
    maxConcurrentAgents: number;
    autoAccept: boolean;
    qaRequired: boolean;
  }>().notNull().default({ maxConcurrentAgents: 3, autoAccept: false, qaRequired: true }),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

export const projectMembers = pgTable('project_members', {
  projectId: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  role: text('role', { enum: ['owner', 'member', 'viewer'] }).notNull().default('member'),
  joinedAt: timestamp('joined_at').notNull().defaultNow(),
}, (t) => [primaryKey({ columns: [t.projectId, t.userId] })]);
