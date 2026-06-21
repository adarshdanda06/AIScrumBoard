import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import { KanbanBoard } from '@/components/board/KanbanBoard';

async function getProjectData(projectId: string) {
  const apiUrl = process.env['NEXT_PUBLIC_API_URL'] ?? 'http://localhost:3001';
  const h = Object.fromEntries(await headers());

  const [projectRes, storiesRes] = await Promise.all([
    fetch(`${apiUrl}/api/projects/${projectId}`, { headers: h, cache: 'no-store' }),
    fetch(`${apiUrl}/api/projects/${projectId}/stories`, { headers: h, cache: 'no-store' }),
  ]);

  if (!projectRes.ok) return null;
  const { project } = await projectRes.json() as { project: Record<string, unknown> };
  const { stories } = storiesRes.ok
    ? await storiesRes.json() as { stories: Record<string, unknown>[] }
    : { stories: [] };

  return { project, stories };
}

export default async function ProjectPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const data = await getProjectData(projectId);
  if (!data) notFound();

  return (
    <div className="flex flex-col h-full">
      <div className="border-b px-8 py-4">
        <h1 className="text-xl font-bold">{String(data.project['name'])}</h1>
        <p className="text-sm text-muted-foreground">{String(data.project['status'])}</p>
      </div>
      <div className="flex-1 overflow-hidden">
        <KanbanBoard
          projectId={projectId}
          initialStories={data.stories as Parameters<typeof KanbanBoard>[0]['initialStories']}
        />
      </div>
    </div>
  );
}
