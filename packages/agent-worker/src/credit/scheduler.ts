import { Worker } from 'bullmq';
import { eq } from 'drizzle-orm';
import { getDb, users, creditAccounts } from '@aiscrumboard/db';
import { QUEUE_NAMES } from '@aiscrumboard/shared';
import type { CreditMonitorJobData, CreditResumeJobData } from '@aiscrumboard/shared';
import { getConnection, creditMonitorQueue } from '../queues/index.js';
import { checkCreditsForUser } from './monitor.js';

const NORMAL_POLL_INTERVAL_MS = 60_000;
const LOW_POLL_INTERVAL_MS = 15_000;

/** Start the credit monitor repeatable job for a user */
export async function startCreditMonitorForUser(userId: string) {
  await creditMonitorQueue.add(
    `monitor-${userId}`,
    { userId } satisfies CreditMonitorJobData,
    {
      repeat: { every: NORMAL_POLL_INTERVAL_MS },
      jobId: `credit-monitor-${userId}`,
    },
  );
}

/** BullMQ worker for the credit monitor queue */
export function startCreditMonitorWorker() {
  const worker = new Worker<CreditMonitorJobData>(
    QUEUE_NAMES.CREDIT_MONITOR,
    async (job) => {
      const { userId } = job.data;
      const db = getDb();

      const user = await db.query.users.findFirst({
        where: eq(users.id, userId),
        columns: { anthropicApiKey: true, id: true },
      });

      if (!user?.anthropicApiKey) return;

      // Adjust poll interval based on credit status
      const account = await db.query.creditAccounts.findFirst({
        where: eq(creditAccounts.userId, userId),
        columns: { status: true },
      });

      const isLow = account?.status === 'low' || account?.status === 'exhausted';
      const targetInterval = isLow ? LOW_POLL_INTERVAL_MS : NORMAL_POLL_INTERVAL_MS;

      // Re-schedule at adjusted interval if needed
      const repeatableJobs = await creditMonitorQueue.getRepeatableJobs();
      const existing = repeatableJobs.find((j) => j.id === `credit-monitor-${userId}`);
      if (existing && existing.every !== targetInterval) {
        await creditMonitorQueue.removeRepeatableByKey(existing.key);
        await startCreditMonitorForUser(userId);
      }

      await checkCreditsForUser(userId, user.anthropicApiKey);
    },
    { connection: getConnection(), concurrency: 5 },
  );

  worker.on('failed', (job, err) => {
    console.error(`[CreditMonitorWorker] Job ${job?.id} failed:`, err);
  });

  return worker;
}

/** BullMQ worker that polls for credit restoration while paused */
export function startCreditResumeWorker() {
  const worker = new Worker<CreditResumeJobData>(
    QUEUE_NAMES.CREDIT_RESUME,
    async (job) => {
      const { userId } = job.data;
      const db = getDb();

      const user = await db.query.users.findFirst({
        where: eq(users.id, userId),
        columns: { anthropicApiKey: true },
      });

      if (user?.anthropicApiKey) {
        await checkCreditsForUser(userId, user.anthropicApiKey);
      }
    },
    { connection: getConnection(), concurrency: 2 },
  );

  return worker;
}
