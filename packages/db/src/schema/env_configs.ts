import { pgTable, uuid, text, timestamp, boolean, unique } from 'drizzle-orm/pg-core';
import { projects } from './projects.js';
import { agentSessions } from './agents.js';

export const envConfigs = pgTable('env_configs', {
  id: uuid('id').primaryKey().defaultRandom(),
  projectId: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  key: text('key').notNull(),
  value: text('value'),               // AES-256-GCM encrypted
  isSecret: boolean('is_secret').notNull().default(true),
  isProvided: boolean('is_provided').notNull().default(false),
  description: text('description'),   // why the agent needs this
  requestedByAgentId: uuid('requested_by_agent_id').references(() => agentSessions.id),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, (t) => [
  unique('env_configs_project_key_uniq').on(t.projectId, t.key),
]);
