'use client';

import { useState } from 'react';
import { UserPlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useAgents } from '@/hooks/use-agents';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';
import { toast } from 'sonner';

function getInitials(name: string | null): string {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

interface AssignDropdownProps {
  leadInstanceIds: string[];
  currentAssignee?: string | null;
  onAssigned?: () => void;
  variant?: 'icon' | 'button';
}

export function AssignDropdown({ leadInstanceIds, currentAssignee, onAssigned, variant = 'icon' }: AssignDropdownProps) {
  const { data: agents } = useAgents();
  const qc = useQueryClient();

  const assignMut = useMutation({
    mutationFn: async (assignedTo: string) => {
      await api.patch('/api/leads/bulk-assign', {
        leadInstanceIds,
        assignedTo,
      });
    },
    onSuccess: () => {
      toast.success(`Assigned to agent`);
      qc.invalidateQueries({ queryKey: ['funnel'] });
      qc.invalidateQueries({ queryKey: ['leads'] });
      qc.invalidateQueries({ queryKey: ['funnelStats'] });
      onAssigned?.();
    },
    onError: () => toast.error('Failed to assign'),
  });

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        {variant === 'icon' ? (
          <Button variant="ghost" size="icon" className="h-7 w-7" title="Assign to agent">
            <UserPlus className="h-3.5 w-3.5" />
          </Button>
        ) : (
          <Button variant="outline" size="sm" className="h-7 text-xs">
            <UserPlus className="mr-1 h-3 w-3" />
            Assign
          </Button>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        {!agents?.length ? (
          <div className="px-3 py-2 text-sm text-muted-foreground">No agents found</div>
        ) : (
          agents.map((agent) => (
            <DropdownMenuItem
              key={agent.userId}
              onClick={() => assignMut.mutate(agent.userId)}
              className="flex items-center gap-2"
              disabled={agent.userId === currentAssignee}
            >
              <Avatar className="h-6 w-6">
                <AvatarFallback className="bg-primary/10 text-primary text-[10px]">
                  {getInitials(agent.name)}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 truncate">
                <span className="text-sm">{agent.name ?? agent.email}</span>
              </div>
              {agent.userId === currentAssignee && (
                <span className="text-xs text-emerald-500">Current</span>
              )}
            </DropdownMenuItem>
          ))
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
