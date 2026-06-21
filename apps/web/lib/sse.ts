'use client';

import { useEffect, useRef, useCallback } from 'react';
import type { SSEEventType } from '@aiscrumboard/shared';

type SSEHandler = (payload: unknown) => void;

export function useSSE(projectId: string, handlers: Partial<Record<SSEEventType, SSEHandler>>) {
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;

  useEffect(() => {
    if (!projectId) return;

    const es = new EventSource(`/api/sse/${projectId}`, { withCredentials: true });

    const eventTypes: SSEEventType[] = [
      'board.story.moved', 'board.story.created', 'board.story.updated',
      'agent.started', 'agent.log', 'agent.paused', 'agent.resumed',
      'agent.completed', 'agent.failed',
      'qa.started', 'qa.completed',
      'credits.low_warning', 'credits.exhausted', 'credits.restored',
      'discovery.progress', 'discovery.complete',
      'env.config.requested',
    ];

    for (const type of eventTypes) {
      es.addEventListener(type, (e: MessageEvent<string>) => {
        try {
          const payload = JSON.parse(e.data) as unknown;
          handlersRef.current[type]?.(payload);
        } catch { /* ignore */ }
      });
    }

    es.onerror = () => {
      // Auto-reconnect is handled by EventSource natively
    };

    return () => { es.close(); };
  }, [projectId]);
}

export function useAgentLogStream(
  agentSessionId: string,
  onLog: (entry: { id: string; level: string; message: string; timestamp: string }) => void,
) {
  const onLogRef = useRef(onLog);
  onLogRef.current = onLog;

  useEffect(() => {
    if (!agentSessionId) return;
    const es = new EventSource(`/api/agents/${agentSessionId}/logs/stream`, { withCredentials: true });
    es.onmessage = (e: MessageEvent<string>) => {
      try {
        const entry = JSON.parse(e.data) as { id: string; level: string; message: string; timestamp: string };
        onLogRef.current(entry);
      } catch { /* ignore */ }
    };
    return () => { es.close(); };
  }, [agentSessionId]);
}
