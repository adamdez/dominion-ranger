'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { cn } from '@/lib/utils';
import { useAuth } from '@/lib/auth-context';
import {
  LayoutDashboard,
  Users,
  Phone,
  CheckSquare,
  DollarSign,
  Kanban,
  BarChart3,
  Settings,
  UsersRound,
} from 'lucide-react';

interface NavItem {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  adminOnly?: boolean;
}

interface NavGroup {
  label: string;
  items: NavItem[];
}

const navGroups: NavGroup[] = [
  {
    label: 'COMMAND CENTER',
    items: [{ href: '/', label: 'Dashboard', icon: LayoutDashboard }],
  },
  {
    label: 'PIPELINE',
    items: [
      { href: '/pipeline', label: 'Pipeline', icon: Users },
      { href: '/dial-queue', label: 'Dial Queue', icon: Phone },
      { href: '/tasks', label: 'Tasks', icon: CheckSquare },
    ],
  },
  {
    label: 'DEALS',
    items: [
      { href: '/offers', label: 'Offers', icon: DollarSign },
      { href: '/pipeline?view=board', label: 'Deal Board', icon: Kanban },
    ],
  },
  {
    label: 'INTELLIGENCE',
    items: [{ href: '/analytics', label: 'Analytics', icon: BarChart3 }],
  },
  {
    label: 'SYSTEM',
    items: [
      { href: '/settings/users', label: 'Users', icon: UsersRound, adminOnly: true },
      { href: '/settings', label: 'Settings', icon: Settings },
    ],
  },
];

export function Sidebar({ open, onClose }: { open: boolean; onClose: () => void }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { isAdmin } = useAuth();

  const isActive = (href: string) => {
    if (href === '/') return pathname === '/';
    if (href.startsWith('/pipeline')) {
      const [, search] = href.split('?');
      if (search) {
        const params = new URLSearchParams(search);
        const view = params.get('view');
        const currentView = searchParams.get('view');
        return pathname.startsWith('/pipeline') && view === currentView;
      }
      return pathname.startsWith('/pipeline') && !searchParams.get('view');
    }
    return pathname.startsWith(href);
  };

  return (
    <>
      {open && (
        <div className="fixed inset-0 z-40 bg-black/50 md:hidden" onClick={onClose} />
      )}
      <aside
        className={cn(
          'fixed left-0 top-0 z-50 flex h-full w-[220px] flex-col border-r border-border bg-card transition-transform duration-200 md:translate-x-0',
          open ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        <div className="flex h-14 items-center gap-2 border-b border-border px-4">
          <span className="text-lg font-bold tracking-tight">Dominion</span>
        </div>

        <nav className="flex-1 space-y-1 overflow-y-auto p-3">
          {navGroups.map((group) => (
            <div key={group.label}>
              <div className="px-3 py-2 text-[11px] font-medium uppercase tracking-wider text-zinc-600 dark:text-zinc-500">
                {group.label}
              </div>
              {group.items
                .filter((item) => !item.adminOnly || isAdmin)
                .map((item) => {
                  const active = isActive(item.href);
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={onClose}
                      className={cn(
                        'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                        active
                          ? 'border-l-2 border-emerald-500 bg-emerald-500/10 text-foreground'
                          : 'border-l-2 border-transparent text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                      )}
                    >
                      <item.icon className="h-4 w-4 shrink-0" />
                      {item.label}
                    </Link>
                  );
                })}
            </div>
          ))}
        </nav>

        <div className="border-t border-border p-4">
          <p className="text-xs text-muted-foreground">Dominion Ranger v2.3</p>
        </div>
      </aside>
    </>
  );
}
