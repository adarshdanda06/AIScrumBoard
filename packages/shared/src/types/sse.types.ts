export type SSEEventType =
  | 'board.story.moved'
  | 'board.story.created'
  | 'board.story.updated'
  | 'agent.started'
  | 'agent.log'
  | 'agent.paused'
  | 'agent.resumed'
  | 'agent.completed'
  | 'agent.failed'
  | 'qa.started'
  | 'qa.completed'
  | 'credits.low_warning'
  | 'credits.exhausted'
  | 'credits.restored'
  | 'discovery.progress'
  | 'discovery.complete'
  | 'env.config.requested';

export interface SSEEvent<T = unknown> {
  type: SSEEventType;
  payload: T;
  timestamp: string;
}

export interface StoryMovedPayload {
  storyId: string;
  from: string;
  to: string;
}

export interface AgentLogPayload {
  agentSessionId: string;
  sequence: number;
  level: string;
  message: string;
  metadata?: Record<string, unknown>;
}

export interface AgentStatusPayload {
  agentSessionId: string;
  storyId: string;
  status: string;
  reason?: string;
}

export interface CreditsPayload {
  userId: string;
  remainingUsd?: string;
  thresholdUsd?: string;
  newBalanceUsd?: string;
}

export interface EnvConfigRequestedPayload {
  projectId: string;
  key: string;
  description: string;
  agentSessionId: string;
}
