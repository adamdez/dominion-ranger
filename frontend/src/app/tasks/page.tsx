'use client';

import { useState } from 'react';
import { CheckCircle, Phone, FileText, Calendar, Trash2 } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { CreateTaskDialog } from '@/components/tasks/create-task-dialog';
import { useTaskView, useCompleteTask, useCancelTask } from '@/hooks/use-tasks';
import type { Task } from '@/lib/types';
import { Plus } from 'lucide-react';

type View = 'today' | 'overdue' | 'upcoming' | 'completed';

const TASK_ICONS: Record<string, React.ElementType> = {
  CALLBACK: Phone,
  FOLLOW_UP: Phone,
  SEND_OFFER: FileText,
  GENERAL: Calendar,
  RESEARCH: Calendar,
  SITE_VISIT: Calendar,
};

export default function TasksPage() {
  const [view, setView] = useState<View>('today');
  const [createOpen, setCreateOpen] = useState(false);

  const { data, isLoading } = useTaskView(view);
  const completeTask = useCompleteTask();
  const cancelTask = useCancelTask();

  const tasks = data?.tasks ?? [];
  const stats = data?.stats ?? { overdue: 0, todayPending: 0, totalPending: 0, completedToday: 0 };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Tabs value={view} onValueChange={(v) => setView(v as View)}>
            <TabsList className="h-7">
              <TabsTrigger value="today" className="text-[12px] h-6 px-2">
                Today ({stats.todayPending})
              </TabsTrigger>
              <TabsTrigger value="overdue" className="text-[12px] h-6 px-2">
                Overdue
                {stats.overdue > 0 && (
                  <span className="ml-1 text-[10px] text-rose-400">{stats.overdue}</span>
                )}
              </TabsTrigger>
              <TabsTrigger value="upcoming" className="text-[12px] h-6 px-2">Upcoming</TabsTrigger>
              <TabsTrigger value="completed" className="text-[12px] h-6 px-2">Done</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
        <Button onClick={() => setCreateOpen(true)} size="xs">
          <Plus className="mr-1 h-3 w-3" />
          New Task
        </Button>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-4 gap-3">
        <MiniStat label="Overdue" value={stats.overdue} color={stats.overdue > 0 ? 'text-rose-400' : 'text-muted-foreground'} />
        <MiniStat label="Due Today" value={stats.todayPending} color={stats.todayPending > 0 ? 'text-amber-400' : 'text-muted-foreground'} />
        <MiniStat label="Total Pending" value={stats.totalPending} color="text-foreground" />
        <MiniStat label="Done Today" value={stats.completedToday} color="text-emerald-400" />
      </div>

      {/* Task list */}
      {isLoading ? (
        <div className="text-[13px] text-muted-foreground py-8 text-center">Loading...</div>
      ) : tasks.length === 0 ? (
        <div className="text-center py-12 text-[13px] text-muted-foreground">
          {view === 'completed' ? 'No tasks completed today' : 'No tasks — you\'re all caught up.'}
        </div>
      ) : (
        <div className="space-y-1">
          {tasks.map((task) => (
            <TaskCard
              key={task.id}
              task={task}
              isOverdueView={view === 'overdue'}
              onComplete={() => completeTask.mutate(task.id)}
              onCancel={() => cancelTask.mutate(task.id)}
              loading={completeTask.isPending || cancelTask.isPending}
            />
          ))}
        </div>
      )}

      <CreateTaskDialog open={createOpen} onClose={() => setCreateOpen(false)} />
    </div>
  );
}

function TaskCard({
  task,
  isOverdueView,
  onComplete,
  onCancel,
  loading,
}: {
  task: Task;
  isOverdueView: boolean;
  onComplete: () => void;
  onCancel: () => void;
  loading: boolean;
}) {
  const Icon = TASK_ICONS[task.taskType] ?? Calendar;
  const isOverdue = task.dueAt && new Date(task.dueAt) < new Date() && task.status === 'PENDING';
  const isPending = task.status === 'PENDING';

  return (
    <Card className={isOverdue || isOverdueView ? 'border-rose-800/50' : ''}>
      <CardContent className="flex items-center justify-between py-2 px-3">
        <div className="flex items-center gap-2.5 flex-1 min-w-0">
          <Icon className={`h-3.5 w-3.5 shrink-0 ${isOverdue ? 'text-rose-400' : 'text-muted-foreground'}`} />
          <div className="min-w-0">
            <p className={`text-[13px] font-medium truncate ${task.status === 'COMPLETED' ? 'line-through text-muted-foreground' : 'text-foreground'}`}>
              {task.title}
            </p>
            <div className="flex items-center gap-2 flex-wrap">
              {task.dueAt && (
                <span className={`text-[11px] ${isOverdue ? 'text-rose-400' : 'text-muted-foreground'}`}>
                  {new Date(task.dueAt).toLocaleString()}
                </span>
              )}
              {task.cadenceRule && (
                <span className="text-[11px] text-muted-foreground">
                  {task.cadenceRule} #{task.attemptNumber}
                </span>
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <Badge
            variant={task.priority === 'HIGH' ? 'destructive' : 'outline'}
          >
            {task.priority}
          </Badge>
          {task.source === 'CADENCE' && (
            <Badge variant="outline">Auto</Badge>
          )}
          {isPending && (
            <>
              <Button
                size="icon-xs"
                variant="ghost"
                onClick={onComplete}
                disabled={loading}
                title="Complete"
              >
                <CheckCircle className="h-3.5 w-3.5 text-emerald-400" />
              </Button>
              <Button
                size="icon-xs"
                variant="ghost"
                onClick={onCancel}
                disabled={loading}
                title="Cancel"
              >
                <Trash2 className="h-3 w-3 text-muted-foreground" />
              </Button>
            </>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function MiniStat({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="border border-border rounded-md p-2.5">
      <p className={`text-xl font-semibold font-mono tabular-nums ${color}`}>{value}</p>
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p>
    </div>
  );
}
