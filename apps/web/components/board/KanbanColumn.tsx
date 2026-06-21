'use client';

import { useDroppable } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { StoryCard } from './StoryCard';
import type { Story } from './KanbanBoard';

interface KanbanColumnProps {
  id: string;
  label: string;
  color: string;
  stories: Story[];
  projectId: string;
}

export function KanbanColumn({ id, label, color, stories, projectId }: KanbanColumnProps) {
  const { setNodeRef, isOver } = useDroppable({ id });

  return (
    <div className={`flex w-72 shrink-0 flex-col rounded-lg ${color} border`}>
      <div className="flex items-center justify-between px-4 py-3 border-b">
        <span className="font-semibold text-sm">{label}</span>
        <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
          {stories.length}
        </span>
      </div>

      <div
        ref={setNodeRef}
        className={`flex flex-col gap-2 flex-1 overflow-y-auto p-2 min-h-[100px] transition-colors ${
          isOver ? 'bg-primary/5' : ''
        }`}
      >
        <SortableContext items={stories.map((s) => s.id)} strategy={verticalListSortingStrategy}>
          {stories.map((story) => (
            <StoryCard key={story.id} story={story} projectId={projectId} />
          ))}
        </SortableContext>

        {stories.length === 0 && (
          <div className="flex items-center justify-center h-20 rounded-md border-2 border-dashed text-xs text-muted-foreground">
            Drop stories here
          </div>
        )}
      </div>
    </div>
  );
}
