'use client';

import { useState } from 'react';
import { CheckCircle, Clock, Phone, FileText, Calendar, Trash2, Plus } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Skeleton } from '@/components/ui/skeleton';
import { CreateTaskDialog } from '@/components/tasks/create-task-dialog';
import { PropertyDetailSheet } from '@/components/property-detail/property-detail-sheet';
import { useOverdueTasks, useTasksDueToday, useTaskView, useCompleteTask, useCancelTask } from '@/hooks/use-tasks';
import { useLeadInstance } from '@/hooks/use-leads';
import type { Task } from '@/lib/types';
import { format, formatDistanceToNow, isToday, isTomorrow, isYesterday } from 'date-fns';

const TASK_ICONS: Record<string, React.ElementType> = {
  CALLBACK: Phone,
  FOLLOW_UP: Phone,
  SEND_OFFER: FileText,
  GENERAL: Calendar,
  RESEARCH: Calendar,
  SITE_VISIT: Calendar,
};

function formatDueDate(dueAt: string | Date | null): string {
  if (!dueAt) return '—';
  const d = new Date(dueAt);
  if (isYesterday(d)) return 'Yesterday';
  if (isToday(d)) return 'Today';
  if (isTomorrow(d)) return 'Tomorrow';
  if (d < new Date()) return formatDistanceToNow(d, { addSuffix: true });
  return format(d, 'MMM d');
}

export default function TasksPage() {
  const [createOpen, setCreateOpen] = useState(false);
  const [showCompleted, setShowCompleted] = useState(false);
  const [selectedTaskLeadId, setSelectedTaskLeadId] = useState<string | null>(null);

  const overdueQuery = useOverdueTasks();
  const todayQuery = useTasksDueToday();
  const upcomingQuery = useTaskView('upcoming');
  const completedQuery = useTaskView('completed');
  const completeTask = useCompleteTask();
  const cancelTask = useCancelTask();

  const overdue = overdueQuery.data ?? [];
  const today = todayQuery.data ?? [];
  const upcoming = (upcomingQuery.data?.tasks ?? []).slice(0, 20);
  const completed = completedQuery.data?.tasks ?? [];
  const stats = upcomingQuery.data?.stats ?? { overdue: overdue.length, todayPending: today.length, totalPending: 0, completedToday: completed.length };

  const selectedLead = useLeadInstance(selectedTaskLeadId);

  const isLoading = overdueQuery.isLoading || todayQuery.isLoading || upcomingQuery.isLoading;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">Tasks</h1>
        <Button onClick={() => setCreateOpen(true)} size="sm">
          <Plus className="mr-1.5 h-3.5 w-3.5" />
          New Task
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-4">
          {[1, 2, 3, 4, 5].map((i) => (
            <Skeleton key={i} className="h-14 w-full" />
          ))}
        </div>
      ) : (
        <div className="space-y-6">
          {/* Overdue */}
          <TaskSection
            title="OVERDUE"
            count={overdue.length}
            badgeColor="text-red-500"
            tasks={overdue}
            statusIndicator="overdue"
            onComplete={(id) => completeTask.mutate(id)}
            onCancel={(id) => cancelTask.mutate(id)}
            onTaskClick={(t) => t.leadInstanceId && setSelectedTaskLeadId(t.leadInstanceId)}
            loading={completeTask.isPending || cancelTask.isPending}
          />

          {/* Today */}
          <TaskSection
            title="TODAY"
            count={today.length}
            badgeColor="text-amber-500"
            tasks={today}
            statusIndicator="today"
            onComplete={(id) => completeTask.mutate(id)}
            onCancel={(id) => cancelTask.mutate(id)}
            onTaskClick={(t) => t.leadInstanceId && setSelectedTaskLeadId(t.leadInstanceId)}
            loading={completeTask.isPending || cancelTask.isPending}
          />

          {/* Upcoming */}
          <TaskSection
            title="UPCOMING"
            count={upcoming.length}
            badgeColor="text-muted-foreground"
            tasks={upcoming}
            statusIndicator="upcoming"
            onComplete={(id) => completeTask.mutate(id)}
            onCancel={(id) => cancelTask.mutate(id)}
            onTaskClick={(t) => t.leadInstanceId && setSelectedTaskLeadId(t.leadInstanceId)}
            loading={completeTask.isPending || cancelTask.isPending}
          />

          {/* Completed toggle */}
          <div className="flex items-center gap-2">
            <Checkbox id="show-completed" checked={showCompleted} onCheckedChange={(c) => setShowCompleted(!!c)} />
            <label htmlFor="show-completed" className="text-sm text-muted-foreground cursor-pointer">
              Show completed
            </label>
          </div>
          {showCompleted && (
            <TaskSection
              title="COMPLETED"
              count={completed.length}
              badgeColor="text-emerald-500"
              tasks={completed}
              statusIndicator="completed"
              onComplete={() => {}}
              onCancel={() => {}}
              onTaskClick={(t) => t.leadInstanceId && setSelectedTaskLeadId(t.leadInstanceId)}
              loading={false}
            />
          )}
        </div>
      )}

      <CreateTaskDialog open={createOpen} onClose={() => setCreateOpen(false)} />
      <PropertyDetailSheet
        lead={selectedLead.data ?? null}
        open={!!selectedTaskLeadId && !!selectedLead.data}
        onClose={() => setSelectedTaskLeadId(null)}
      />
    </div>
  );
}

function TaskSection({
  title,
  count,
  badgeColor,
  tasks,
  statusIndicator,
  onComplete,
  onCancel,
  onTaskClick,
  loading,
}: {
  title: string;
  count: number;
  badgeColor: string;
  tasks: Task[];
  statusIndicator: 'overdue' | 'today' | 'upcoming' | 'completed';
  onComplete: (id: string) => void;
  onCancel: (id: string) => void;
  onTaskClick: (task: Task) => void;
  loading: boolean;
}) {
  return (
    <div>
      <h3 className={`text-xs font-semibold uppercase tracking-wider mb-2 ${badgeColor}`}>
        {title} ({count})
      </h3>
      <div className="space-y-2">
        {tasks.length === 0 ? (
          <p className="text-sm text-muted-foreground py-2">None</p>
        ) : (
          tasks.map((task) => (
            <TaskRow
              key={task.id}
              task={task}
              statusIndicator={statusIndicator}
              onComplete={() => onComplete(task.id)}
              onCancel={() => onCancel(task.id)}
              onClick={() => onTaskClick(task)}
              loading={loading}
            />
          ))
        )}
      </div>
    </div>
  );
}

function TaskRow({
  task,
  statusIndicator,
  onComplete,
  onCancel,
  onClick,
  loading,
}: {
  task: Task;
  statusIndicator: string;
  onComplete: () => void;
  onCancel: () => void;
  onClick: () => void;
  loading: boolean;
}) {
  const Icon = TASK_ICONS[task.taskType] ?? Calendar;
  const isOverdue = task.dueAt && new Date(task.dueAt) < new Date() && task.status === 'PENDING';
  const isPending = task.status === 'PENDING';

  const dotColor =
    statusIndicator === 'overdue' ? 'bg-red-500' :
    statusIndicator === 'today' ? 'bg-amber-500' :
    statusIndicator === 'completed' ? 'bg-emerald-500' :
    'bg-zinc-500';

  return (
    <Card
      className={`cursor-pointer hover:bg-muted/50 transition-colors ${isOverdue ? 'border-red-200 dark:border-red-800' : ''}`}
      onClick={onClick}
    >
      <CardContent className="flex items-center justify-between py-3 px-4">
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <span className={`h-2 w-2 rounded-full shrink-0 ${dotColor}`} />
          <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
          <div className="min-w-0 flex-1">
            <p className={`font-medium text-sm truncate ${task.status === 'COMPLETED' ? 'line-through text-muted-foreground' : ''}`}>
              {task.title}
            </p>
            <p className="text-xs text-muted-foreground truncate">
              {task.dominionLeadId ? `Lead: ${task.dominionLeadId.slice(0, 8)}...` : '—'} · Due: {formatDueDate(task.dueAt)}
            </p>
            {task.assignedTo && (
              <p className="text-[10px] text-muted-foreground">Assigned: {task.assignedTo}</p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0" onClick={(e) => e.stopPropagation()}>
          {isPending && (
            <>
              <Button size="sm" variant="ghost" onClick={onComplete} disabled={loading} title="Complete">
                <CheckCircle className="h-4 w-4 text-emerald-600" />
              </Button>
              <Button size="sm" variant="ghost" onClick={onCancel} disabled={loading} title="Cancel">
                <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
              </Button>
            </>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

