'use client';

import { usePathname, useRouter } from 'next/navigation';
import { Menu, LogOut, User, ChevronDown, Bell } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useAuth } from '@/lib/auth-context';
import { useNotifications } from '@/hooks/use-notifications';

const pageTitles: Record<string, string> = {
  '/': 'Dashboard',
  '/leads': 'Lead Management',
  '/pipeline': 'Pipeline',
  '/tasks': 'Tasks',
  '/assign': 'Lead Assignment',
  '/dial-queue': 'Dial Queue',
  '/scoring': 'Scoring Leaderboard',
  '/settings': 'Settings',
  '/settings/users': 'User Management',
};

interface HeaderProps {
  onMenuClick: () => void;
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

function getRoleLabel(role: string): string {
  switch (role) {
    case 'ADMIN': return 'Admin';
    case 'MANAGER': return 'Manager';
    case 'AGENT': return 'Agent';
    default: return role;
  }
}

export function Header({ onMenuClick }: HeaderProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, logout } = useAuth();
  const notifications = useNotifications();
  const title = pageTitles[pathname] ?? 'Dominion Ranger';
  const unreadCount = notifications.data?.filter((item) => !item.readAt).length ?? 0;

  async function handleLogout() {
    await logout();
    router.push('/login');
  }

  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-4 border-b border-border bg-background/95 px-4 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <Button variant="ghost" size="icon" className="md:hidden" onClick={onMenuClick}>
        <Menu className="h-5 w-5" />
      </Button>

      <h1 className="text-lg font-semibold">{title}</h1>

      <div className="ml-auto flex items-center gap-3">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="relative" aria-label="Notifications">
              <Bell className="h-5 w-5" />
              {unreadCount > 0 && (
                <Badge className="absolute -right-1 -top-1 h-5 min-w-5 rounded-full px-1.5 text-[10px]">
                  {unreadCount > 9 ? '9+' : unreadCount}
                </Badge>
              )}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-80">
            <div className="px-2 py-1.5">
              <p className="text-sm font-medium">Notifications</p>
              <p className="text-xs text-muted-foreground">Latest updates for your account</p>
            </div>
            <DropdownMenuSeparator />
            {notifications.isLoading ? (
              <div className="px-2 py-2 text-xs text-muted-foreground">Loading notifications...</div>
            ) : notifications.data && notifications.data.length > 0 ? (
              notifications.data.slice(0, 8).map((notification) => (
                <DropdownMenuItem key={notification.notificationId} className="py-2">
                  <div className="w-full min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <p className="truncate text-sm font-medium">{notification.title}</p>
                      {!notification.readAt && (
                        <span className="h-2 w-2 shrink-0 rounded-full bg-primary" aria-hidden />
                      )}
                    </div>
                    {notification.body && (
                      <p className="truncate text-xs text-muted-foreground">{notification.body}</p>
                    )}
                    <p className="text-[10px] text-muted-foreground">
                      {new Date(notification.createdAt).toLocaleString()}
                    </p>
                  </div>
                </DropdownMenuItem>
              ))
            ) : (
              <div className="px-2 py-2 text-xs text-muted-foreground">
                No notifications yet.
              </div>
            )}
          </DropdownMenuContent>
        </DropdownMenu>

        {user && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="flex items-center gap-2 rounded-md px-2 py-1 transition-colors hover:bg-accent">
                <div className="text-right hidden sm:block">
                  <p className="text-sm font-medium">{user.name}</p>
                  <p className="text-xs text-muted-foreground">{getRoleLabel(user.role)}</p>
                </div>
                <Avatar className="h-8 w-8">
                  <AvatarFallback className="bg-primary text-primary-foreground text-xs">
                    {getInitials(user.name || user.email)}
                  </AvatarFallback>
                </Avatar>
                <ChevronDown className="h-3 w-3 text-muted-foreground hidden sm:block" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <div className="px-2 py-1.5">
                <p className="text-sm font-medium">{user.name}</p>
                <p className="text-xs text-muted-foreground">{user.email}</p>
              </div>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => router.push('/settings')}>
                <User className="mr-2 h-4 w-4" />
                Profile
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={handleLogout} className="text-destructive">
                <LogOut className="mr-2 h-4 w-4" />
                Sign out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
    </header>
  );
}
