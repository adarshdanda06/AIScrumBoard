'use client';

import { useState } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { BotIcon, ExternalLinkIcon, FlaskConicalIcon } from 'lucide-react';
import type { Story } from './KanbanBoard';
import { AgentConsole } from './AgentConsole';

const PRIORITY_COLORS: Record<string, string> = {
  critical: 'bg-red-500',
  high: 'bg-orange-400',
  medium: 'bg-yellow-400',
  low: 'bg-blue-400',
};

const TYPE_ICONS: Record<string, string> = {
  story: '📖',
  spike: '⚡',
  bug: '🐛',
  task: '✅',
};

interface StoryCardProps {
  story: Story;
  projectId: string;
  isDragging?: boolean;
}

export function StoryCard({ story, projectId, isDragging }: StoryCardProps) {
  const [showConsole, setShowConsole] = useState(false);
  const { attributes, listeners, setNodeRef, transform, transition, isDragging: isSortableDragging } = useSortable({ id: story.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isSortableDragging ? 0.5 : 1,
  };

  return (
    <>
      <div
        ref={setNodeRef}
        style={style}
        {...attributes}
        {...listeners}
        className={`rounded-md border bg-white p-3 shadow-sm cursor-grab active:cursor-grabbing select-none ${
          isDragging ? 'shadow-lg ring-2 ring-primary' : 'hover:shadow-md'
        } transition-shadow`}
      >
        {/* Header row */}
        <div className="flex items-center gap-1.5 mb-2">
          <span className="text-xs">{TYPE_ICONS[story.type] ?? '📌'}</span>
          <span className="text-xs text-muted-foreground font-mono">US-{String(story.storyNumber).padStart(3, '0')}</span>
          <div className={`ml-auto h-2 w-2 rounded-full ${PRIORITY_COLORS[story.priority] ?? 'bg-gray-400'}`} title={story.priority} />
        </div>

        {/* Title */}
        <p className="text-sm font-medium line-clamp-2 leading-snug">{story.title}</p>

        {/* Footer */}
        <div className="flex items-center gap-2 mt-2">
          {story.storyPoints && (
            <span className="rounded bg-muted px-1.5 py-0.5 text-xs font-medium">{story.storyPoints}pt</span>
          )}
          {story.assignedAgentId && (
            <button
              onPointerDown={(e) => e.stopPropagation()}
              onClick={() => setShowConsole(true)}
              className="ml-auto rounded p-0.5 hover:bg-muted transition-colors"
              title="View agent console"
            >
              <BotIcon className="h-3.5 w-3.5 text-primary" />
            </button>
          )}
          {story.prUrl && (
            <a
              href={story.prUrl}
              target="_blank"
              rel="noopener noreferrer"
              onPointerDown={(e) => e.stopPropagation()}
              className="rounded p-0.5 hover:bg-muted transition-colors"
              title="View PR"
            >
              <ExternalLinkIcon className="h-3.5 w-3.5 text-muted-foreground" />
            </a>
          )}
          {story.stage === 'completed' && (
            <FlaskConicalIcon className="h-3.5 w-3.5 text-amber-500 ml-auto" title="Pending QA" />
          )}
        </div>
      </div>

      {showConsole && story.assignedAgentId && (
        <AgentConsole
          agentSessionId={story.assignedAgentId}
          storyTitle={story.title}
          onClose={() => setShowConsole(false)}
        />
      )}
    </>
  );
}
