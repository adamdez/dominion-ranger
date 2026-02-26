'use client';

import { useState, type DragEvent } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { useAuth } from '@/lib/auth-context';
import { useFunnelDrag, type FunnelDragData } from '@/lib/funnel-drag-context';
import {
  LayoutDashboard,
  Phone,
  CheckSquare,
  Home,
  Users,
  UserCheck,
  DollarSign,
  Handshake,
  HeartHandshake,
  Package,
  Kanban,
  BarChart3,
  Settings,
  UsersRound,
  Megaphone,
} from 'lucide-react';

interface NavItem {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  adminOnly?: boolean;
  funnelStage?: string;
}

interface NavGroup {
  label: string;
  items: NavItem[];
}

const navGroups: NavGroup[] = [
  {
    label: 'COMMAND CENTER',
    items: [
      { href: '/', label: 'Dashboard', icon: LayoutDashboard },
      { href: '/dial-queue', label: 'Dial Queue', icon: Phone },
      { href: '/tasks', label: 'Tasks', icon: CheckSquare },
    ],
  },
  {
    label: 'FUNNEL',
    items: [
      { href: '/prospects', label: 'Prospects', icon: Home, funnelStage: 'prospect' },
      { href: '/facebook-craigslist', label: 'Facebook/Craigslist', icon: Megaphone },
      { href: '/leads', label: 'Leads', icon: Users, funnelStage: 'lead' },
      { href: '/my-leads', label: 'My Leads', icon: UserCheck },
      { href: '/paid-leads', label: 'Paid Leads', icon: DollarSign, funnelStage: 'paid_lead' },
      { href: '/negotiation', label: 'Negotiation', icon: Handshake, funnelStage: 'negotiation' },
      { href: '/disposition', label: 'Disposition', icon: Package, funnelStage: 'disposition' },
      { href: '/nurture', label: 'Nurture', icon: HeartHandshake, funnelStage: 'nurture' },
    ],
  },
  {
    label: 'DEALS',
    items: [
      { href: '/deal-board', label: 'Deal Board', icon: Kanban },
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
  const { isAdmin } = useAuth();
  const { isDragging, handleFunnelDrop } = useFunnelDrag();
  const [dragOverStage, setDragOverStage] = useState<string | null>(null);

  const isActive = (href: string) => {
    if (href === '/') return pathname === '/';
    return pathname.startsWith(href);
  };

  const onDragOver = (e: DragEvent, stage: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverStage(stage);
  };

  const onDragLeave = () => {
    setDragOverStage(null);
  };

  const onDrop = async (e: DragEvent, targetStage: string) => {
    e.preventDefault();
    setDragOverStage(null);
    try {
      const raw = e.dataTransfer.getData('application/json');
      if (!raw) return;
      const data: FunnelDragData = JSON.parse(raw);
      await handleFunnelDrop(data, targetStage);
    } catch {
      // Invalid drag data
    }
  };

  return (
    <>
      {open && (
        <div className="fixed inset-0 z-40 bg-black/50 md:hidden" onClick={onClose} />
      )}
      <aside
        className={cn(
          'fixed left-0 top-0 z-50 flex h-full w-[180px] flex-col border-r border-border bg-card transition-transform duration-200 md:translate-x-0',
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
                  const isDropTarget = !!item.funnelStage;
                  const isHovered = dragOverStage === item.funnelStage;

                  const navLink = (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={onClose}
                      className={cn(
                        'flex items-center gap-3 rounded-md px-3 py-2 text-xs font-medium transition-colors',
                        active
                          ? 'border-l-2 border-emerald-500 bg-emerald-500/10 text-foreground'
                          : 'border-l-2 border-transparent text-muted-foreground hover:bg-accent hover:text-accent-foreground',
                        isHovered && 'bg-emerald-500/20 ring-1 ring-emerald-500 text-foreground',
                      )}
                    >
                      <item.icon className="h-4 w-4 shrink-0" />
                      {item.label}
                    </Link>
                  );

                  if (isDropTarget && item.funnelStage) {
                    return (
                      <div
                        key={item.href}
                        onDragOver={(e) => onDragOver(e, item.funnelStage!)}
                        onDragLeave={onDragLeave}
                        onDrop={(e) => onDrop(e, item.funnelStage!)}
                      >
                        {navLink}
                      </div>
                    );
                  }

                  return navLink;
                })}
            </div>
          ))}
        </nav>

        <div className="border-t border-border p-4">
          <p className="text-xs text-muted-foreground">Dominion Ranger v2.3</p>
          {isDragging && (
            <p className="mt-1 text-[10px] text-emerald-400 animate-pulse">
              Drop on a funnel stage to move
            </p>
          )}
        </div>
      </aside>
    </>
  );
}
