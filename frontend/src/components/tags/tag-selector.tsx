'use client';

import { useState } from 'react';
import { Plus, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Input } from '@/components/ui/input';
import { useTags, useCreateTag } from '@/hooks/use-tags';
import type { Tag } from '@/lib/types';

const TAG_COLORS = [
  '#ef4444', '#f97316', '#eab308', '#22c55e',
  '#3b82f6', '#8b5cf6', '#ec4899', '#6b7280',
];

interface TagSelectorProps {
  leadInstanceId: string;
  existingTagIds: string[];
  onAdd: (tagId: string) => void;
}

export function TagSelector({ leadInstanceId, existingTagIds, onAdd }: TagSelectorProps) {
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [newColor, setNewColor] = useState(TAG_COLORS[0]);
  const { data: allTags } = useTags();
  const createTag = useCreateTag();

  // Suppress unused-var lint — leadInstanceId reserved for future direct-add flow
  void leadInstanceId;

  const handleCreate = async () => {
    if (!newName.trim()) return;
    createTag.mutate(
      { name: newName.trim(), color: newColor },
      {
        onSuccess: () => {
          setNewName('');
          setCreating(false);
        },
      },
    );
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="h-6 px-2 text-xs">
          <Plus className="h-3 w-3 mr-1" />
          Add Tag
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-56 p-2" align="start">
        <div className="space-y-1">
          {(allTags ?? []).map((tag: Tag) => {
            const isAdded = existingTagIds.includes(tag.tagId);
            return (
              <button
                key={tag.tagId}
                className="flex items-center gap-2 w-full rounded px-2 py-1.5 text-xs hover:bg-muted transition-colors"
                onClick={() => {
                  if (!isAdded) onAdd(tag.tagId);
                }}
                disabled={isAdded}
              >
                <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: tag.color }} />
                <span className="flex-1 text-left truncate">{tag.name}</span>
                {isAdded && <Check className="h-3 w-3 text-muted-foreground" />}
              </button>
            );
          })}
        </div>

        <div className="border-t mt-2 pt-2">
          {!creating ? (
            <button
              className="flex items-center gap-2 w-full rounded px-2 py-1.5 text-xs hover:bg-muted transition-colors text-muted-foreground"
              onClick={() => setCreating(true)}
            >
              <Plus className="h-3 w-3" />
              Create New Tag
            </button>
          ) : (
            <div className="space-y-2">
              <Input
                value={newName}
                onChange={e => setNewName(e.target.value)}
                placeholder="Tag name..."
                className="h-7 text-xs"
                onKeyDown={e => e.key === 'Enter' && handleCreate()}
                autoFocus
              />
              <div className="flex gap-1">
                {TAG_COLORS.map(c => (
                  <button
                    key={c}
                    className={`h-5 w-5 rounded-full border-2 transition-all ${
                      newColor === c ? 'border-foreground scale-110' : 'border-transparent'
                    }`}
                    style={{ backgroundColor: c }}
                    onClick={() => setNewColor(c)}
                  />
                ))}
              </div>
              <div className="flex gap-1">
                <Button size="sm" className="h-6 text-xs flex-1" onClick={handleCreate} disabled={createTag.isPending}>
                  Create
                </Button>
                <Button size="sm" variant="outline" className="h-6 text-xs" onClick={() => setCreating(false)}>
                  Cancel
                </Button>
              </div>
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
