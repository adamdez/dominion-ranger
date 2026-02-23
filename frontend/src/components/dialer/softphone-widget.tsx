'use client';

import { useState } from 'react';
import {
  Phone,
  PhoneOff,
  Mic,
  MicOff,
  X,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DISPOSITION_TYPES } from '@/lib/constants';
import type { CallState } from '@/hooks/use-twilio-device';

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60).toString().padStart(2, '0');
  const s = (seconds % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

interface SoftphoneWidgetProps {
  leadName: string;
  phone: string;
  callState: CallState;
  callDuration: number;
  isMuted: boolean;
  onHangup: () => void;
  onToggleMute: () => void;
  onDisposition: (disposition: string, notes: string) => void;
  onDismiss: () => void;
}

export function SoftphoneWidget({
  leadName,
  phone,
  callState,
  callDuration,
  isMuted,
  onHangup,
  onToggleMute,
  onDisposition,
  onDismiss,
}: SoftphoneWidgetProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [disposition, setDisposition] = useState('');
  const [notes, setNotes] = useState('');

  const isActive = callState === 'connecting' || callState === 'ringing' || callState === 'connected';
  const isEnded = callState === 'ended' || callState === 'error';

  if (callState === 'idle') return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 w-80">
      <Card className="border-2 border-primary/30 shadow-2xl bg-background">
        <div
          className="flex items-center justify-between px-4 py-3 cursor-pointer border-b"
          onClick={() => setCollapsed(!collapsed)}
        >
          <div className="flex items-center gap-2">
            {isActive && (
              <span className="relative flex h-2.5 w-2.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500 opacity-75" />
                <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500" />
              </span>
            )}
            <Phone className="h-4 w-4" />
            <span className="text-sm font-semibold">
              {isActive ? 'Active Call' : isEnded ? 'Call Ended' : 'Dialer'}
            </span>
          </div>
          <div className="flex items-center gap-1">
            {isActive && (
              <span className="text-xs font-mono text-muted-foreground mr-2">
                {formatTime(callDuration)}
              </span>
            )}
            {collapsed ? (
              <ChevronUp className="h-4 w-4 text-muted-foreground" />
            ) : (
              <ChevronDown className="h-4 w-4 text-muted-foreground" />
            )}
          </div>
        </div>

        {!collapsed && (
          <CardContent className="p-4 space-y-3">
            <div>
              <p className="font-medium text-sm">{leadName}</p>
              <p className="text-xs text-muted-foreground font-mono">{phone}</p>
            </div>

            {callState === 'connecting' && (
              <p className="text-sm text-amber-500">Connecting...</p>
            )}
            {callState === 'ringing' && (
              <p className="text-sm text-amber-500">Ringing...</p>
            )}
            {callState === 'connected' && (
              <p className="text-sm text-emerald-500">
                Connected — {formatTime(callDuration)}
              </p>
            )}
            {callState === 'error' && (
              <p className="text-sm text-red-500">Call failed</p>
            )}

            {isActive && (
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant={isMuted ? 'destructive' : 'outline'}
                  className="flex-1"
                  onClick={onToggleMute}
                >
                  {isMuted ? (
                    <><MicOff className="mr-1.5 h-3.5 w-3.5" /> Unmute</>
                  ) : (
                    <><Mic className="mr-1.5 h-3.5 w-3.5" /> Mute</>
                  )}
                </Button>
                <Button
                  size="sm"
                  variant="destructive"
                  className="flex-1"
                  onClick={onHangup}
                >
                  <PhoneOff className="mr-1.5 h-3.5 w-3.5" />
                  End
                </Button>
              </div>
            )}

            {(isActive || isEnded) && (
              <div className="space-y-2 pt-1 border-t">
                <p className="text-xs font-semibold text-muted-foreground">Disposition</p>
                <Select value={disposition} onValueChange={setDisposition}>
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue placeholder="Select outcome..." />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(DISPOSITION_TYPES).map(([key, config]) => (
                      <SelectItem key={key} value={key} className="text-xs">
                        {config.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Textarea
                  placeholder="Call notes..."
                  className="text-xs min-h-[60px]"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                />
                <Button
                  size="sm"
                  className="w-full"
                  disabled={!disposition}
                  onClick={() => {
                    onDisposition(disposition, notes);
                    setDisposition('');
                    setNotes('');
                  }}
                >
                  Submit Disposition
                </Button>
              </div>
            )}

            {isEnded && (
              <Button
                size="sm"
                variant="ghost"
                className="w-full text-xs"
                onClick={onDismiss}
              >
                <X className="mr-1.5 h-3 w-3" />
                Close
              </Button>
            )}
          </CardContent>
        )}
      </Card>
    </div>
  );
}
