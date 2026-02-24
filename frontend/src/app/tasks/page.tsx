'use client';

import { useState } from 'react';
import { CheckCircle, Clock, AlertCircle, Phone, FileText, Calendar, Trash2 } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
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
        <h1 className="text-2xl font-bold tracking-tight">Tasks</h1>
        <Button onClick={() => setCreateOpen(true)} size="sm">
          <Plus className="mr-1.5 h-3.5 w-3.5" />
          New Task
        </Button>
      </div>

      {/* Stats cards */}
      <div className="grid grid-cols-4 gap-3">
        <StatCard label="Overdue" value={stats.overdue} icon={AlertCircle} color="text-red-500" />
        <StatCard label="Due Today" value={stats.todayPending} icon={Clock} color="text-amber-500" />
        <StatCard label="Total Pending" value={stats.totalPending} icon={Calendar} color="text-blue-500" />
        <StatCard label="Done Today" value={stats.completedToday} icon={CheckCircle} color="text-emerald-500" />
      </div>

      {/* View tabs */}
      <Tabs value={view} onValueChange={(v) => setView(v as View)}>
        <TabsList>
          <TabsTrigger value="today">
            Today ({stats.todayPending})
          </TabsTrigger>
          <TabsTrigger value="overdue">
            Overdue
            {stats.overdue > 0 && (
              <Badge variant="destructive" className="ml-1.5 text-[10px] px-1 py-0">{stats.overdue}</Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="upcoming">Upcoming</TabsTrigger>
          <TabsTrigger value="completed">Completed</TabsTrigger>
        </TabsList>
      </Tabs>

      {/* Task list */}
      {isLoading ? (
        <div className="space-y-2">
          {[1, 2, 3, 4, 5].map(i => <Skeleton key={i} className="h-16 w-full" />)}
        </div>
      ) : tasks.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          {view === 'completed' ? 'No tasks completed today' : 'No tasks — you\'re all caught up.'}
        </div>
      ) : (
        <div className="space-y-2">
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
    <Card className={isOverdue || isOverdueView ? 'border-red-200 dark:border-red-800' : ''}>
      <CardContent className="flex items-center justify-between py-3 px-4">
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <Icon className={`h-4 w-4 shrink-0 ${isOverdue ? 'text-red-500' : 'text-muted-foreground'}`} />
          <div className="min-w-0">
            <p className={`font-medium text-sm truncate ${task.status === 'COMPLETED' ? 'line-through text-muted-foreground' : ''}`}>
              {task.title}
            </p>
            <div className="flex items-center gap-2 flex-wrap">
              {task.dueAt && (
                <span className={`text-xs ${isOverdue ? 'text-red-500 font-medium' : 'text-muted-foreground'}`}>
                  Due: {new Date(task.dueAt).toLocaleString()}
                </span>
              )}
              {task.cadenceRule && (
                <span className="text-xs text-muted-foreground">
                  {task.cadenceRule} #{task.attemptNumber}
                </span>
              )}
              {task.assignedTo && (
                <span className="text-xs text-muted-foreground">
                  {task.assignedTo}
                </span>
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Badge
            variant={task.priority === 'HIGH' ? 'destructive' : 'outline'}
            className="text-[10px]"
          >
            {task.priority}
          </Badge>
          {task.source === 'CADENCE' && (
            <Badge variant="secondary" className="text-[10px]">Auto</Badge>
          )}
          {isPending && (
            <>
              <Button
                size="sm"
                variant="ghost"
                onClick={onComplete}
                disabled={loading}
                title="Complete"
              >
                <CheckCircle className="h-4 w-4 text-emerald-600" />
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={onCancel}
                disabled={loading}
                title="Cancel"
              >
                <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
              </Button>
            </>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function StatCard({ label, value, icon: Icon, color }: {
  label: string;
  value: number;
  icon: React.ElementType;
  color: string;
}) {
  return (
    <Card>
      <CardContent className="flex items-center gap-3 py-3 px-4">
        <Icon className={`h-5 w-5 ${color}`} />
        <div>
          <p className="text-2xl font-bold tabular-nums">{value}</p>
          <p className="text-xs text-muted-foreground">{label}</p>
        </div>
      </CardContent>
    </Card>
  );
}
