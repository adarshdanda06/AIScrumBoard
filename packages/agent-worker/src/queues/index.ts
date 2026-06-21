import { Queue, Worker, type ConnectionOptions } from 'bullmq';
import { QUEUE_NAMES } from '@aiscrumboard/shared';

let connection: ConnectionOptions;

export function getConnection(): ConnectionOptions {
  if (!connection) {
    const redisUrl = new URL(process.env['REDIS_URL'] ?? 'redis://localhost:6379');
    connection = {
      host: redisUrl.hostname,
      port: Number(redisUrl.port) || 6379,
      password: redisUrl.password || undefined,
    };
  }
  return connection;
}

export const storyQueue = new Queue(QUEUE_NAMES.STORY_WORKER, {
  connection: getConnection(),
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 5000 },
    removeOnComplete: { age: 86400 }, // keep 24h
    removeOnFail: { age: 7 * 86400 }, // keep 7 days
  },
});

export const qaQueue = new Queue(QUEUE_NAMES.QA, {
  connection: getConnection(),
  defaultJobOptions: {
    attempts: 2,
    backoff: { type: 'exponential', delay: 10000 },
  },
});

export const discoveryQueue = new Queue(QUEUE_NAMES.DISCOVERY, {
  connection: getConnection(),
  defaultJobOptions: { attempts: 1 },
});

export const creditMonitorQueue = new Queue(QUEUE_NAMES.CREDIT_MONITOR, {
  connection: getConnection(),
  defaultJobOptions: { removeOnComplete: true, removeOnFail: true },
});

export const creditResumeQueue = new Queue(QUEUE_NAMES.CREDIT_RESUME, {
  connection: getConnection(),
  defaultJobOptions: { removeOnComplete: true },
});

export { Queue, Worker };
