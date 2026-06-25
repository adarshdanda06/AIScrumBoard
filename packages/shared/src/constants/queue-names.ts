export const QUEUE_NAMES = {
  STORY_WORKER: 'story-worker',
  QA: 'qa',
  DISCOVERY: 'discovery',
  CREDIT_MONITOR: 'credit-monitor',
  CREDIT_RESUME: 'credit-resume',
} as const;

export type QueueName = (typeof QUEUE_NAMES)[keyof typeof QUEUE_NAMES];
