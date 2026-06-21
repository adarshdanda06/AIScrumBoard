import Redis from 'ioredis';
import { getEnv } from './env.js';

let _redis: Redis | undefined;
let _pub: Redis | undefined;
let _sub: Redis | undefined;

export function getRedis(): Redis {
  if (!_redis) {
    _redis = new Redis(getEnv().REDIS_URL, {
      maxRetriesPerRequest: 3,
      lazyConnect: true,
    });
    _redis.on('error', (err) => console.error('[Redis] connection error:', err));
  }
  return _redis;
}

// Dedicated pub/sub clients (cannot share connection used for commands)
export function getRedisPub(): Redis {
  if (!_pub) {
    _pub = new Redis(getEnv().REDIS_URL, { lazyConnect: true });
  }
  return _pub;
}

export function getRedisSub(): Redis {
  if (!_sub) {
    _sub = new Redis(getEnv().REDIS_URL, { lazyConnect: true });
  }
  return _sub;
}

export const SSE_CHANNEL_PREFIX = 'sse:project:';
export const AGENT_LOG_STREAM_PREFIX = 'agent:logs:';

export function projectSseChannel(projectId: string) {
  return `${SSE_CHANNEL_PREFIX}${projectId}`;
}

export function agentLogStreamKey(agentSessionId: string) {
  return `${AGENT_LOG_STREAM_PREFIX}${agentSessionId}`;
}
