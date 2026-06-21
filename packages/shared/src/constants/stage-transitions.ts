import type { StoryStage } from '@aiscrumboard/db';

export const VALID_TRANSITIONS: Record<StoryStage, StoryStage[]> = {
  backlog: ['in_progress'],
  in_progress: ['completed', 'backlog'],
  completed: ['accepted', 'rejected', 'in_progress'],
  accepted: [],
  rejected: ['backlog'],
};

export function isValidTransition(from: StoryStage, to: StoryStage): boolean {
  return VALID_TRANSITIONS[from]?.includes(to) ?? false;
}
