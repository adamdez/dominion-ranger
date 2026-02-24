'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import {
  LayoutDashboard,
  LayoutGrid,
  Users,
  Phone,
  BarChart3,
  Settings,
  UserPlus,
  CheckSquare,
} from 'lucide-react';

const navGroups = [
  {
    label: 'Pipeline',
    items: [
      { href: '/', label: 'Dashboard', icon: LayoutDashboard },
      { href: '/leads', label: 'Leads', icon: Users },
      { href: '/pipeline', label: 'Pipeline', icon: LayoutGrid },
    ],
  },
  {
    label: 'Workflow',
    items: [
      { href: '/tasks', label: 'Tasks', icon: CheckSquare },
      { href: '/assign', label: 'Assign', icon: UserPlus },
      { href: '/dial-queue', label: 'Dial Queue', icon: Phone },
    ],
  },
  {
    label: 'Intelligence',
    items: [
      { href: '/scoring', label: 'Scoring', icon: BarChart3 },
    ],
  },
  {
    label: 'System',
    items: [
      { href: '/settings', label: 'Settings', icon: Settings },
    ],
  },
];

interface SidebarProps {
  open: boolean;
  onClose: () => void;
}

export function Sidebar({ open, onClose }: SidebarProps) {
  const pathname = usePathname();

  return (
    <>
      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/60 md:hidden"
          onClick={onClose}
        />
      )}
      <aside
        className={cn(
          'fixed left-0 top-0 z-50 flex h-full w-[220px] flex-col border-r border-border bg-background transition-transform duration-150 md:translate-x-0',
          open ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        <div className="flex h-12 items-center px-5">
          <span className="text-[13px] font-medium uppercase tracking-[0.15em] text-foreground">
            Dominion
          </span>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 pt-1">
          {navGroups.map((group) => (
            <div key={group.label} className="mt-5 first:mt-1">
              <p className="mb-1 px-2 text-[10px] font-medium uppercase tracking-[0.15em] text-muted-foreground">
                {group.label}
              </p>
              {group.items.map((item) => {
                const isActive = pathname === item.href;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={onClose}
                    className={cn(
                      'flex items-center gap-2.5 rounded-md px-2 h-8 text-[13px] transition-colors',
                      isActive
                        ? 'text-foreground bg-white/5 border-l-2 border-emerald-500 pl-[6px]'
                        : 'text-muted-foreground hover:text-foreground border-l-2 border-transparent pl-[6px]'
                    )}
                  >
                    <item.icon className="h-4 w-4 text-muted-foreground" />
                    {item.label}
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>

        <div className="px-5 py-3">
          <p className="text-[10px] text-muted-foreground">v2.3</p>
        </div>
      </aside>
    </>
  );
}
