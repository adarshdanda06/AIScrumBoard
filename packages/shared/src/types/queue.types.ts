export interface StoryWorkerJobData {
  storyId: string;
  projectId: string;
  agentSessionId: string;
  attempt: number;
  previousFailureContext?: string;
}

export interface QAJobData {
  storyId: string;
  projectId: string;
  agentSessionId: string;
  branchName: string;
  prNumber: number;
}

export interface DiscoveryJobData {
  projectId: string;
  agentSessionId: string;
  conceptText: string;
  userId: string;
}

export interface CreditMonitorJobData {
  userId: string;
}

export interface CreditResumeJobData {
  userId: string;
  triggeredBy: 'credit_exhaustion';
}

export type AgentPauseCommand = { command: 'pause' };
export type AgentResumeCommand = { command: 'resume' };
