import { Worker } from 'bullmq';
import { QUEUE_NAMES } from '@aiscrumboard/shared';
import { getConnection, storyQueue, qaQueue, discoveryQueue } from './queues/index.js';
import { storyProcessor } from './processors/story.processor.js';
import { qaProcessor } from './processors/qa.processor.js';
import { discoveryProcessor } from './processors/discovery.processor.js';
import { startCreditMonitorWorker, startCreditResumeWorker } from './credit/scheduler.js';

const MAX_CONCURRENT_WORKERS = parseInt(process.env['MAX_GLOBAL_CONCURRENT_AGENTS'] ?? '10');

const workers: Worker[] = [];

// Story worker (main execution)
const storyWorker = new Worker(
  QUEUE_NAMES.STORY_WORKER,
  storyProcessor,
  {
    connection: getConnection(),
    concurrency: MAX_CONCURRENT_WORKERS,
    limiter: { max: MAX_CONCURRENT_WORKERS, duration: 1000 },
  },
);
workers.push(storyWorker);

// QA worker
const qaWorker = new Worker(
  QUEUE_NAMES.QA,
  qaProcessor,
  { connection: getConnection(), concurrency: 5 },
);
workers.push(qaWorker);

// Discovery worker
const discoveryWorker = new Worker(
  QUEUE_NAMES.DISCOVERY,
  discoveryProcessor,
  { connection: getConnection(), concurrency: 3 },
);
workers.push(discoveryWorker);

// Credit monitoring workers
const creditMonitorWorker = startCreditMonitorWorker();
const creditResumeWorker = startCreditResumeWorker();
workers.push(creditMonitorWorker, creditResumeWorker);

// Wire up event logging for all workers
for (const worker of workers) {
  worker.on('completed', (job) => {
    console.log(`[Worker:${worker.name}] Job ${job.id} completed`);
  });
  worker.on('failed', (job, err) => {
    console.error(`[Worker:${worker.name}] Job ${job?.id} failed:`, err.message);
  });
  worker.on('error', (err) => {
    console.error(`[Worker:${worker.name}] Worker error:`, err);
  });
}

console.log(`[AgentWorker] Started ${workers.length} workers. Max concurrency: ${MAX_CONCURRENT_WORKERS}`);

// Graceful shutdown
async function shutdown() {
  console.log('[AgentWorker] Shutting down...');
  await Promise.all(workers.map((w) => w.close()));
  process.exit(0);
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
