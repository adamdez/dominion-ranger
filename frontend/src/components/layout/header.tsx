'use client';

import { usePathname } from 'next/navigation';
import { Menu } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';

const pageTitles: Record<string, string> = {
  '/': 'Dashboard',
  '/leads': 'Lead Management',
  '/assign': 'Lead Assignment',
  '/dial-queue': 'Dial Queue',
  '/scoring': 'Scoring Leaderboard',
  '/settings': 'Settings',
};

interface HeaderProps {
  onMenuClick: () => void;
}

export function Header({ onMenuClick }: HeaderProps) {
  const pathname = usePathname();
  const title = pageTitles[pathname] ?? 'Dominion Ranger';

  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-4 border-b border-border bg-background/95 px-4 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <Button
        variant="ghost"
        size="icon"
        className="md:hidden"
        onClick={onMenuClick}
      >
        <Menu className="h-5 w-5" />
      </Button>

      <h1 className="text-lg font-semibold">{title}</h1>

      <div className="ml-auto flex items-center gap-3">
        <div className="text-right hidden sm:block">
          <p className="text-sm font-medium">Admin</p>
          <p className="text-xs text-muted-foreground">admin-bootstrap</p>
        </div>
        <Avatar className="h-8 w-8">
          <AvatarFallback className="bg-primary text-primary-foreground text-xs">
            AD
          </AvatarFallback>
        </Avatar>
      </div>
    </header>
  );
}
