'use client';

import { useState, useEffect, useRef } from 'react';
import { XIcon, TerminalIcon } from 'lucide-react';
import { useAgentLogStream } from '@/lib/sse';

interface LogEntry {
  id: string;
  level: string;
  message: string;
  timestamp: string;
}

const LEVEL_COLORS: Record<string, string> = {
  info: 'text-foreground',
  tool_call: 'text-blue-400',
  tool_result: 'text-green-400',
  error: 'text-red-400',
  system: 'text-yellow-400',
};

interface AgentConsoleProps {
  agentSessionId: string;
  storyTitle: string;
  onClose: () => void;
}

export function AgentConsole({ agentSessionId, storyTitle, onClose }: AgentConsoleProps) {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);

  useAgentLogStream(agentSessionId, (entry) => {
    setLogs((prev) => [...prev, entry]);
    setTimeout(() => {
      scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
    }, 50);
  });

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-end p-4 pointer-events-none">
      <div className="w-full max-w-2xl h-96 rounded-lg border bg-zinc-950 shadow-2xl pointer-events-auto flex flex-col">
        {/* Header */}
        <div className="flex items-center gap-2 px-4 py-2 border-b border-zinc-800">
          <TerminalIcon className="h-4 w-4 text-green-400" />
          <span className="text-sm font-medium text-zinc-200 truncate">{storyTitle}</span>
          <span className="text-xs text-zinc-500 ml-1">• {agentSessionId.slice(0, 8)}</span>
          <button
            onClick={onClose}
            className="ml-auto rounded p-0.5 text-zinc-400 hover:text-zinc-200 transition-colors"
          >
            <XIcon className="h-4 w-4" />
          </button>
        </div>

        {/* Log output */}
        <div
          ref={scrollRef}
          className="flex-1 overflow-y-auto p-3 font-mono text-xs space-y-0.5"
        >
          {logs.length === 0 ? (
            <span className="text-zinc-600">Waiting for agent output...</span>
          ) : (
            logs.map((log) => (
              <div key={log.id} className="flex gap-2">
                <span className="text-zinc-600 shrink-0">
                  {new Date(log.timestamp).toLocaleTimeString()}
                </span>
                <span className={`shrink-0 w-12 ${LEVEL_COLORS[log.level] ?? 'text-zinc-400'}`}>
                  [{log.level.slice(0, 4)}]
                </span>
                <span className="text-zinc-300 break-all">{log.message}</span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
