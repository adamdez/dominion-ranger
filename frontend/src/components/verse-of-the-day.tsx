'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { BookOpen, X } from 'lucide-react';
import { type DailyVerse, dailyVerses } from '@/data/daily-verses';

function getTodayVerse(): DailyVerse {
  const now = new Date();
  const start = new Date(now.getFullYear(), 0, 0);
  const diff = now.getTime() - start.getTime();
  const dayOfYear = Math.floor(diff / (1000 * 60 * 60 * 24));
  return dailyVerses[dayOfYear % dailyVerses.length];
}

function truncateText(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  const truncated = text.slice(0, maxLen);
  const lastSpace = truncated.lastIndexOf(' ');
  return (lastSpace > 0 ? truncated.slice(0, lastSpace) : truncated) + '...';
}

export function VerseOfTheDay() {
  const [verse, setVerse] = useState<DailyVerse | null>(null);
  const [expanded, setExpanded] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setVerse(getTodayVerse());

    const now = new Date();
    const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    const msUntilMidnight = tomorrow.getTime() - now.getTime();

    const timeout = setTimeout(() => {
      setVerse(getTodayVerse());
    }, msUntilMidnight);

    return () => clearTimeout(timeout);
  }, []);

  const handleClickOutside = useCallback((e: MouseEvent) => {
    if (cardRef.current && !cardRef.current.contains(e.target as Node)) {
      setExpanded(false);
    }
  }, []);

  useEffect(() => {
    if (expanded) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [expanded, handleClickOutside]);

  if (!verse) return null;

  return (
    <div className="relative">
      {/* Collapsed: inline verse excerpt */}
      <button
        onClick={() => setExpanded(prev => !prev)}
        className="flex items-center gap-1.5 text-zinc-400 hover:text-zinc-300 transition-colors max-w-[500px] xl:max-w-[600px]"
      >
        <BookOpen className="h-3.5 w-3.5 flex-shrink-0 text-emerald-500/70" />
        <span className="text-xs italic truncate">
          &ldquo;{truncateText(verse.text, 70)}&rdquo; &mdash; {verse.reference} ESV
        </span>
      </button>

      {/* Expanded: full verse + commentary card */}
      {expanded && (
        <div
          ref={cardRef}
          className="absolute right-0 top-full mt-2 z-50 w-[420px] max-w-[calc(100vw-2rem)] rounded-lg border border-zinc-700/50 bg-zinc-800/95 backdrop-blur-sm shadow-xl animate-in fade-in slide-in-from-top-2 duration-200"
        >
          <div className="p-5">
            {/* Header */}
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <BookOpen className="h-4 w-4 text-emerald-500" />
                <span className="text-sm font-medium text-zinc-200">
                  {verse.reference}
                </span>
                <span className="text-xs text-zinc-500">(ESV)</span>
              </div>
              <button
                onClick={() => setExpanded(false)}
                className="text-zinc-500 hover:text-zinc-300 transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Verse text */}
            <blockquote className="text-sm italic leading-relaxed text-zinc-200 mb-5 pl-3 border-l-2 border-emerald-500/30">
              &ldquo;{verse.text}&rdquo;
            </blockquote>

            {/* Divider with author name */}
            <div className="flex items-center gap-3 mb-3">
              <div className="flex-1 border-t border-zinc-700/50" />
              <span className="text-xs font-medium text-emerald-400">
                {verse.author}
              </span>
              <span className="text-[10px] text-zinc-500">
                ({verse.authorLife})
              </span>
              <div className="flex-1 border-t border-zinc-700/50" />
            </div>

            {/* Commentary */}
            <p className="text-xs leading-relaxed text-zinc-400">
              {verse.commentary}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
