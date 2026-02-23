'use client';

import { X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import type { Tag } from '@/lib/types';

interface TagBadgeProps {
  tag: Tag;
  onRemove?: () => void;
}

export function TagBadge({ tag, onRemove }: TagBadgeProps) {
  return (
    <Badge
      variant="outline"
      className="text-xs px-2 py-0.5 gap-1"
      style={{
        borderColor: tag.color,
        color: tag.color,
        backgroundColor: `${tag.color}10`,
      }}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: tag.color }} />
      {tag.name}
      {onRemove && (
        <button
          onClick={(e) => { e.stopPropagation(); onRemove(); }}
          className="ml-0.5 hover:opacity-70"
        >
          <X className="h-3 w-3" />
        </button>
      )}
    </Badge>
  );
}
