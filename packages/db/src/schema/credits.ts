import { pgTable, uuid, text, timestamp, numeric, jsonb } from 'drizzle-orm/pg-core';
import { users } from './users.js';

export type CreditStatus = 'healthy' | 'low' | 'exhausted' | 'unknown';

export const creditAccounts = pgTable('credit_accounts', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id).unique(),
  anthropicOrgId: text('anthropic_org_id'),
  totalCreditsUsd: numeric('total_credits_usd', { precision: 12, scale: 4 }),
  usedCreditsUsd: numeric('used_credits_usd', { precision: 12, scale: 4 }).notNull().default('0'),
  remainingCreditsUsd: numeric('remaining_credits_usd', { precision: 12, scale: 4 }),
  lowCreditThresholdUsd: numeric('low_credit_threshold_usd', { precision: 12, scale: 4 })
    .notNull().default('5.00'),
  status: text('status', {
    enum: ['healthy', 'low', 'exhausted', 'unknown'] as const,
  }).notNull().$type<CreditStatus>().default('unknown'),
  lastCheckedAt: timestamp('last_checked_at'),
  pausedAt: timestamp('paused_at'),
  resumedAt: timestamp('resumed_at'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

export const creditEvents = pgTable('credit_events', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id),
  eventType: text('event_type', {
    enum: ['checked', 'low_warning', 'exhausted', 'paused', 'resumed', 'recharged'] as const,
  }).notNull(),
  creditsBefore: numeric('credits_before', { precision: 12, scale: 4 }),
  creditsAfter: numeric('credits_after', { precision: 12, scale: 4 }),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().default({}),
  occurredAt: timestamp('occurred_at').notNull().defaultNow(),
});
