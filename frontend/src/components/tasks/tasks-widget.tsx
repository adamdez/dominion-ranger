'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { CreateTaskDialog } from '@/components/tasks/create-task-dialog';
import { useTasksDueToday, useOverdueTasks, useCompleteTask } from '@/hooks/use-tasks';
import { TASK_TYPES } from '@/lib/constants';
import type { Task } from '@/lib/types';
import { format, formatDistanceToNow } from 'date-fns';
import { Plus } from 'lucide-react';

export function TasksWidget() {
  const [createOpen, setCreateOpen] = useState(false);
  const dueTodayQuery = useTasksDueToday();
  const overdueQuery = useOverdueTasks();
  const completeTask = useCompleteTask();

  const dueToday = dueTodayQuery.data ?? [];
  const overdue = overdueQuery.data ?? [];
  const isLoading = dueTodayQuery.isLoading || overdueQuery.isLoading;

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle>Tasks</CardTitle>
          <Button variant="ghost" size="xs" onClick={() => setCreateOpen(true)}>
            <Plus className="h-3 w-3 mr-1" />
            New
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-2">
            {[1, 2, 3].map(i => <Skeleton key={i} className="h-6 w-full" />)}
          </div>
        ) : dueToday.length === 0 && overdue.length === 0 ? (
          <p className="text-[13px] text-muted-foreground">No pending tasks.</p>
        ) : (
          <div className="space-y-3">
            {overdue.length > 0 && (
              <div className="space-y-0.5">
                <h4 className="text-[10px] font-medium uppercase tracking-wider text-rose-400 mb-1">
                  Overdue ({overdue.length})
                </h4>
                {overdue.slice(0, 5).map(task => (
                  <TaskRow key={task.id} task={task} overdue onComplete={completeTask.mutate} />
                ))}
              </div>
            )}
            {dueToday.length > 0 && (
              <div className="space-y-0.5">
                <h4 className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground mb-1">
                  Due Today ({dueToday.length})
                </h4>
                {dueToday.slice(0, 5).map(task => (
                  <TaskRow key={task.id} task={task} onComplete={completeTask.mutate} />
                ))}
              </div>
            )}
          </div>
        )}
      </CardContent>

      <CreateTaskDialog open={createOpen} onClose={() => setCreateOpen(false)} />
    </Card>
  );
}

function TaskRow({ task, overdue, onComplete }: { task: Task; overdue?: boolean; onComplete: (id: string) => void }) {
  const typeConfig = TASK_TYPES[task.taskType as keyof typeof TASK_TYPES];
  return (
    <div className="flex items-center gap-2 px-1 py-1 rounded-md text-[13px]">
      <Checkbox
        checked={task.status === 'COMPLETED'}
        onCheckedChange={() => onComplete(task.id)}
        disabled={task.status === 'COMPLETED'}
      />
      <span className="flex-1 truncate text-[12px] text-foreground">{task.title}</span>
      {typeConfig && (
        <Badge variant="outline" className={typeConfig.color}>
          {typeConfig.label}
        </Badge>
      )}
      <span className="text-[10px] text-muted-foreground shrink-0">
        {task.dueAt
          ? overdue
            ? formatDistanceToNow(new Date(task.dueAt), { addSuffix: true })
            : format(new Date(task.dueAt), 'h:mm a')
          : '—'}
      </span>
    </div>
  );
}
