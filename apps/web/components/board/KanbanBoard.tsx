'use client';

import { useState, useCallback } from 'react';
import {
  DndContext, DragOverlay, closestCenter,
  type DragEndEvent, type DragStartEvent,
} from '@dnd-kit/core';
import { KanbanColumn } from './KanbanColumn';
import { StoryCard } from './StoryCard';
import { useSSE } from '@/lib/sse';
import { api } from '@/lib/api-client';

export type Story = {
  id: string;
  storyNumber: number;
  type: string;
  title: string;
  description: string;
  stage: 'backlog' | 'in_progress' | 'completed' | 'accepted' | 'rejected';
  priority: string;
  storyPoints?: number | null;
  position: number;
  assignedAgentId?: string | null;
  prUrl?: string | null;
};

const STAGES: Array<{ key: Story['stage']; label: string; color: string }> = [
  { key: 'backlog', label: 'Backlog', color: 'bg-slate-100' },
  { key: 'in_progress', label: 'In Progress', color: 'bg-blue-50' },
  { key: 'completed', label: 'Completed', color: 'bg-amber-50' },
  { key: 'accepted', label: 'Accepted', color: 'bg-green-50' },
];

interface KanbanBoardProps {
  projectId: string;
  initialStories: Story[];
}

export function KanbanBoard({ projectId, initialStories }: KanbanBoardProps) {
  const [stories, setStories] = useState<Story[]>(initialStories);
  const [activeStory, setActiveStory] = useState<Story | null>(null);

  // Subscribe to real-time SSE updates
  useSSE(projectId, {
    'board.story.created': (payload) => {
      const p = payload as { story: Story };
      setStories((prev) => [...prev, p.story]);
    },
    'board.story.updated': (payload) => {
      const p = payload as { storyId: string; patch: Partial<Story> };
      setStories((prev) => prev.map((s) => s.id === p.storyId ? { ...s, ...p.patch } : s));
    },
    'board.story.moved': (payload) => {
      const p = payload as { storyId: string; to: Story['stage'] };
      setStories((prev) => prev.map((s) => s.id === p.storyId ? { ...s, stage: p.to } : s));
    },
  });

  const handleDragStart = useCallback((event: DragStartEvent) => {
    const story = stories.find((s) => s.id === event.active.id);
    setActiveStory(story ?? null);
  }, [stories]);

  const handleDragEnd = useCallback(async (event: DragEndEvent) => {
    setActiveStory(null);
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const storyId = String(active.id);
    const targetStage = String(over.id) as Story['stage'];

    const story = stories.find((s) => s.id === storyId);
    if (!story || story.stage === targetStage) return;

    // Optimistic update
    setStories((prev) => prev.map((s) => s.id === storyId ? { ...s, stage: targetStage } : s));

    try {
      await api.patch(`/api/projects/${projectId}/stories/${storyId}`, { stage: targetStage });
    } catch {
      // Revert on failure
      setStories((prev) => prev.map((s) => s.id === storyId ? { ...s, stage: story.stage } : s));
    }
  }, [stories, projectId]);

  const storiesByStage = useCallback((stage: Story['stage']) =>
    stories.filter((s) => s.stage === stage).sort((a, b) => a.position - b.position),
    [stories],
  );

  return (
    <DndContext
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <div className="flex h-full gap-4 overflow-x-auto p-6">
        {STAGES.map((stage) => (
          <KanbanColumn
            key={stage.key}
            id={stage.key}
            label={stage.label}
            color={stage.color}
            stories={storiesByStage(stage.key)}
            projectId={projectId}
          />
        ))}
      </div>

      <DragOverlay>
        {activeStory ? <StoryCard story={activeStory} isDragging projectId={projectId} /> : null}
      </DragOverlay>
    </DndContext>
  );
}
