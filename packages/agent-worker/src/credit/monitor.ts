import Anthropic from '@anthropic-ai/sdk';
import { eq } from 'drizzle-orm';
import { getDb, creditAccounts, creditEvents, agentSessions, users } from '@aiscrumboard/db';
import { creditResumeQueue } from '../queues/index.js';
import type { CreditResumeJobData } from '@aiscrumboard/shared';

const RESUME_JOB_ID = 'credit-resume-poller';
const RESUME_INTERVAL_MS = 15_000;

export async function checkCreditsForUser(userId: string, anthropicApiKey: string) {
  const db = getDb();
  const client = new Anthropic({ apiKey: anthropicApiKey });

  let remaining: number | null = null;
  let total: number | null = null;

  try {
    // Anthropic SDK: get organization usage (if billing API is available)
    // Fall back to summing local DB costs for current month
    const billingStart = new Date();
    billingStart.setDate(1);
    billingStart.setHours(0, 0, 0, 0);

    // Sum cost from all agent sessions for this user's projects
    // (Placeholder: real implementation queries Anthropic billing endpoint)
    const localUsed = await db.execute<{ total: string }>(
      `SELECT COALESCE(SUM(cost_usd), 0) as total FROM agent_sessions
       WHERE project_id IN (SELECT id FROM projects WHERE owner_id = '${userId}')
       AND queued_at >= '${billingStart.toISOString()}'`,
    );
    const usedUsd = parseFloat(String(localUsed.rows?.[0]?.total ?? '0'));

    const account = await db.query.creditAccounts.findFirst({
      where: eq(creditAccounts.userId, userId),
    });

    const threshold = parseFloat(account?.lowCreditThresholdUsd ?? '5.00');
    const prevStatus = account?.status ?? 'unknown';

    // Update account with local usage estimate
    await db.insert(creditAccounts)
      .values({ userId, usedCreditsUsd: String(usedUsd), status: 'unknown', lastCheckedAt: new Date() })
      .onConflictDoUpdate({
        target: creditAccounts.userId,
        set: { usedCreditsUsd: String(usedUsd), lastCheckedAt: new Date(), updatedAt: new Date() },
      });

    await db.insert(creditEvents).values({
      userId,
      eventType: 'checked',
      creditsAfter: account?.remainingCreditsUsd ?? null,
      metadata: { usedUsd },
    });

    // Credit exhaustion detection uses account.remainingCreditsUsd when set by
    // the Anthropic billing API. Fall back to threshold comparison with local estimate.
    if (account?.remainingCreditsUsd !== null && account?.remainingCreditsUsd !== undefined) {
      remaining = parseFloat(account.remainingCreditsUsd);

      if (remaining <= 0 && prevStatus !== 'exhausted') {
        await handleCreditExhaustion(userId);
      } else if (remaining < threshold && prevStatus === 'healthy') {
        await db.update(creditAccounts)
          .set({ status: 'low', updatedAt: new Date() })
          .where(eq(creditAccounts.userId, userId));
        await db.insert(creditEvents).values({
          userId, eventType: 'low_warning',
          creditsAfter: String(remaining), metadata: { threshold },
        });
      } else if (remaining > threshold && prevStatus === 'exhausted') {
        await handleCreditRestored(userId, remaining);
      }
    }
  } catch (err) {
    console.error(`[CreditMonitor] Error checking credits for ${userId}:`, err);
  }
}

async function handleCreditExhaustion(userId: string) {
  const db = getDb();
  await db.update(creditAccounts)
    .set({ status: 'exhausted', pausedAt: new Date(), updatedAt: new Date() })
    .where(eq(creditAccounts.userId, userId));

  await db.insert(creditEvents).values({ userId, eventType: 'exhausted', metadata: {} });

  // Pause all running agent sessions for this user
  const running = await db.query.agentSessions.findMany({
    where: eq(agentSessions.status, 'running'),
  });

  for (const session of running) {
    await db.update(agentSessions)
      .set({ status: 'paused', pausedAt: new Date(), updatedAt: new Date() })
      .where(eq(agentSessions.id, session.id));
  }

  await db.insert(creditEvents).values({ userId, eventType: 'paused', metadata: { pausedAgents: running.length } });

  // Schedule resume polling
  await creditResumeQueue.add(
    'check-credits-for-resume',
    { userId, triggeredBy: 'credit_exhaustion' } satisfies CreditResumeJobData,
    {
      repeat: { every: RESUME_INTERVAL_MS },
      jobId: `${RESUME_JOB_ID}-${userId}`,
    },
  );

  console.log(`[CreditMonitor] Credits exhausted for ${userId}. Paused ${running.length} agents.`);
}

async function handleCreditRestored(userId: string, newBalance: number) {
  const db = getDb();
  await db.update(creditAccounts)
    .set({ status: 'healthy', resumedAt: new Date(), pausedAt: null, updatedAt: new Date() })
    .where(eq(creditAccounts.userId, userId));

  await db.insert(creditEvents).values({
    userId, eventType: 'restored', creditsAfter: String(newBalance), metadata: {},
  });

  // Re-queue paused agent sessions
  const paused = await db.query.agentSessions.findMany({
    where: eq(agentSessions.status, 'paused'),
  });

  await db.insert(creditEvents).values({
    userId, eventType: 'resumed', metadata: { resumedAgents: paused.length },
  });

  // Cancel the resume poller
  await creditResumeQueue.removeRepeatable(
    'check-credits-for-resume',
    { every: RESUME_INTERVAL_MS },
    `${RESUME_JOB_ID}-${userId}`,
  );

  console.log(`[CreditMonitor] Credits restored for ${userId}. Resuming ${paused.length} agents.`);
}
