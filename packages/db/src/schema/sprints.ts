import { pgTable, uuid, text, timestamp, integer } from 'drizzle-orm/pg-core';
import { projects } from './projects.js';

export const sprints = pgTable('sprints', {
  id: uuid('id').primaryKey().defaultRandom(),
  projectId: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  goal: text('goal'),
  status: text('status', {
    enum: ['planning', 'active', 'completed'],
  }).notNull().default('planning'),
  startDate: timestamp('start_date'),
  endDate: timestamp('end_date'),
  velocity: integer('velocity'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});
