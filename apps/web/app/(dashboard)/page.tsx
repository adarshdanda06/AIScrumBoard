import Link from 'next/link';
import { headers } from 'next/headers';
import { PlusIcon, FolderIcon } from 'lucide-react';

async function getProjects() {
  const apiUrl = process.env['NEXT_PUBLIC_API_URL'] ?? 'http://localhost:3001';
  const res = await fetch(`${apiUrl}/api/projects`, {
    headers: Object.fromEntries(await headers()),
    cache: 'no-store',
  });
  if (!res.ok) return [];
  const data = await res.json() as { projects: Array<{ id: string; name: string; description?: string; status: string; createdAt: string }> };
  return data.projects;
}

export default async function DashboardPage() {
  const projects = await getProjects();

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold">Projects</h1>
          <p className="text-muted-foreground mt-1">Manage your AI-driven development projects</p>
        </div>
        <Link
          href="/projects/new"
          className="flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 transition-opacity"
        >
          <PlusIcon className="h-4 w-4" />
          New Project
        </Link>
      </div>

      {projects.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed p-12 text-center">
          <FolderIcon className="h-12 w-12 text-muted-foreground mb-4" />
          <h3 className="text-lg font-semibold">No projects yet</h3>
          <p className="text-muted-foreground mt-2 mb-4">Create your first project to get started</p>
          <Link
            href="/projects/new"
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 transition-opacity"
          >
            Create Project
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {projects.map((project) => (
            <Link
              key={project.id}
              href={`/projects/${project.id}`}
              className="group rounded-lg border bg-card p-6 shadow-sm hover:shadow-md transition-shadow"
            >
              <div className="flex items-start justify-between">
                <h3 className="font-semibold group-hover:text-primary transition-colors">{project.name}</h3>
                <StatusBadge status={project.status} />
              </div>
              {project.description && (
                <p className="text-sm text-muted-foreground mt-2 line-clamp-2">{project.description}</p>
              )}
              <p className="text-xs text-muted-foreground mt-4">
                {new Date(project.createdAt).toLocaleDateString()}
              </p>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    discovery: 'bg-blue-100 text-blue-800',
    active: 'bg-green-100 text-green-800',
    paused: 'bg-yellow-100 text-yellow-800',
    completed: 'bg-gray-100 text-gray-800',
  };
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${styles[status] ?? styles['active']}`}>
      {status}
    </span>
  );
}
