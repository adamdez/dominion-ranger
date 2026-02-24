'use client';

import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { useCompleteTask } from '@/hooks/use-tasks';
import type { Task } from '@/lib/types';
import { TASK_TYPES } from '@/lib/constants';
import { format, isPast, isToday } from 'date-fns';

interface TaskListProps {
  tasks: Task[];
}

export function TaskList({ tasks }: TaskListProps) {
  const completeTask = useCompleteTask();

  if (tasks.length === 0) {
    return <p className="text-sm text-muted-foreground">No tasks.</p>;
  }

  return (
    <div className="space-y-1.5">
      {tasks.map(task => {
        const isOverdue = task.dueAt && isPast(new Date(task.dueAt)) && task.status === 'PENDING';
        const isDueToday = task.dueAt && isToday(new Date(task.dueAt));
        const isCompleted = task.status === 'COMPLETED';
        const typeConfig = TASK_TYPES[task.taskType as keyof typeof TASK_TYPES];

        return (
          <div
            key={task.id}
            className={`flex items-start gap-2 rounded-md border px-3 py-2 text-sm ${
              isOverdue ? 'border-red-200 bg-red-50/50 dark:border-red-900 dark:bg-red-950/20' : ''
            }`}
          >
            <Checkbox
              checked={isCompleted}
              onCheckedChange={() => {
                if (!isCompleted) completeTask.mutate(task.id);
              }}
              disabled={isCompleted || completeTask.isPending}
              className="mt-0.5"
            />
            <div className="flex-1 min-w-0 space-y-0.5">
              <div className={`text-sm ${isCompleted ? 'line-through text-muted-foreground' : ''}`}>
                {task.title}
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                {typeConfig && (
                  <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${typeConfig.color}`}>
                    {typeConfig.label}
                  </Badge>
                )}
                {task.dueAt && (
                  <span className={`text-[10px] ${
                    isOverdue ? 'text-red-600 dark:text-red-400 font-medium' :
                    isDueToday ? 'text-amber-600 dark:text-amber-400' :
                    'text-muted-foreground'
                  }`}>
                    {isOverdue ? 'Overdue: ' : ''}
                    {format(new Date(task.dueAt), 'MMM d, h:mm a')}
                  </span>
                )}
                {task.assignedTo && (
                  <span className="text-[10px] text-muted-foreground">
                    {task.assignedTo}
                  </span>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
