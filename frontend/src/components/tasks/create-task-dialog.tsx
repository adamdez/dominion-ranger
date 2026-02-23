'use client';

import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { useCreateTask } from '@/hooks/use-tasks';
import { TASK_TYPES } from '@/lib/constants';

interface CreateTaskDialogProps {
  open: boolean;
  onClose: () => void;
  dominionLeadId?: string;
  leadInstanceId?: string;
}

export function CreateTaskDialog({ open, onClose, dominionLeadId, leadInstanceId }: CreateTaskDialogProps) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [taskType, setTaskType] = useState('GENERAL');
  const [dueAt, setDueAt] = useState('');
  const [assignedTo, setAssignedTo] = useState('');
  const createTask = useCreateTask();

  const handleSubmit = () => {
    if (!title.trim()) return;
    createTask.mutate(
      {
        title: title.trim(),
        description: description.trim() || undefined,
        taskType,
        dueAt: dueAt || undefined,
        assignedTo: assignedTo.trim() || undefined,
        dominionLeadId,
        leadInstanceId,
      },
      {
        onSuccess: () => {
          setTitle('');
          setDescription('');
          setTaskType('GENERAL');
          setDueAt('');
          setAssignedTo('');
          onClose();
        },
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Create Task</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="task-title">Title</Label>
            <Input
              id="task-title"
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="e.g. Call back Thursday"
              onKeyDown={e => e.key === 'Enter' && handleSubmit()}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="task-desc">Description (optional)</Label>
            <Textarea
              id="task-desc"
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="Additional details..."
              rows={2}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Type</Label>
              <Select value={taskType} onValueChange={setTaskType}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(TASK_TYPES).map(([key, config]) => (
                    <SelectItem key={key} value={key}>{config.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="task-due">Due Date/Time</Label>
              <Input
                id="task-due"
                type="datetime-local"
                value={dueAt}
                onChange={e => setDueAt(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="task-assign">Assign To (optional)</Label>
            <Input
              id="task-assign"
              value={assignedTo}
              onChange={e => setAssignedTo(e.target.value)}
              placeholder="e.g. Logan"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={!title.trim() || createTask.isPending}>
            {createTask.isPending ? 'Creating...' : 'Create Task'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
