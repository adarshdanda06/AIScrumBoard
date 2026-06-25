'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LayoutDashboardIcon, FolderIcon, CreditCardIcon, LogOutIcon } from 'lucide-react';
import { signOut } from '@/lib/auth';

interface SidebarProps {
  user: { id: string; name: string; email: string; avatarUrl?: string | null };
}

const NAV_ITEMS = [
  { href: '/', label: 'Dashboard', icon: LayoutDashboardIcon },
  { href: '/projects', label: 'Projects', icon: FolderIcon },
  { href: '/credits', label: 'Credits', icon: CreditCardIcon },
];

export function Sidebar({ user }: SidebarProps) {
  const pathname = usePathname();

  return (
    <aside className="w-56 shrink-0 border-r bg-background flex flex-col">
      {/* Logo */}
      <div className="px-4 py-4 border-b">
        <span className="font-bold text-lg tracking-tight">AIScrumBoard</span>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-2 py-4 space-y-1">
        {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
          const isActive = pathname === href;
          return (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                isActive
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground'
              }`}
            >
              <Icon className="h-4 w-4" />
              {label}
            </Link>
          );
        })}
      </nav>

      {/* User footer */}
      <div className="border-t px-3 py-3">
        <div className="flex items-center gap-2 mb-2">
          {user.avatarUrl ? (
            <img src={user.avatarUrl} alt={user.name} className="h-7 w-7 rounded-full" />
          ) : (
            <div className="h-7 w-7 rounded-full bg-primary flex items-center justify-center text-primary-foreground text-xs font-bold">
              {user.name.charAt(0).toUpperCase()}
            </div>
          )}
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium truncate">{user.name}</p>
            <p className="text-xs text-muted-foreground truncate">{user.email}</p>
          </div>
        </div>
        <button
          onClick={() => void signOut({ fetchOptions: { onSuccess: () => { window.location.href = '/login'; } } })}
          className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-xs text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
        >
          <LogOutIcon className="h-3.5 w-3.5" />
          Sign out
        </button>
      </div>
    </aside>
  );
}
