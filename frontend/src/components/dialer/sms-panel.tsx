'use client';

import { useState } from 'react';
import { Send, Phone, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { useMessages, useSendSms } from '@/hooks/use-dialer';
import { format } from 'date-fns';
import type { ConversationMessage } from '@/lib/types';

interface SmsPanelProps {
  dominionLeadId: string;
  toPhone: string | null;
  leadInstanceId?: string;
}

export function SmsPanel({ dominionLeadId, toPhone, leadInstanceId }: SmsPanelProps) {
  const [draft, setDraft] = useState('');
  const { data, isLoading } = useMessages(dominionLeadId);
  const sendSms = useSendSms();

  const messages = data?.messages ?? [];

  const handleSend = () => {
    if (!draft.trim() || !toPhone) return;
    sendSms.mutate(
      {
        dominionLeadId,
        leadInstanceId,
        toPhone,
        body: draft.trim(),
      },
      { onSuccess: () => setDraft('') },
    );
  };

  if (!toPhone) {
    return (
      <div className="text-sm text-muted-foreground text-center py-8">
        No phone number available. Run skip trace first.
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <ScrollArea className="flex-1 min-h-0 max-h-[400px]">
        {isLoading ? (
          <div className="space-y-3 p-4">
            {[1, 2, 3].map(i => <Skeleton key={i} className="h-12 w-3/4" />)}
          </div>
        ) : messages.length === 0 ? (
          <div className="text-center text-sm text-muted-foreground py-8">
            No messages yet. Start the conversation.
          </div>
        ) : (
          <div className="space-y-3 p-4">
            {messages.map((msg) => (
              <MessageBubble key={msg.id} message={msg} />
            ))}
          </div>
        )}
      </ScrollArea>

      <div className="border-t p-3 space-y-2">
        <Textarea
          placeholder="Type a message..."
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          rows={2}
          className="text-sm resize-none"
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              handleSend();
            }
          }}
        />
        <div className="flex justify-between items-center">
          <span className="text-xs text-muted-foreground">
            {draft.length}/1600
          </span>
          <Button
            size="sm"
            disabled={!draft.trim() || sendSms.isPending}
            onClick={handleSend}
          >
            {sendSms.isPending ? (
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
            ) : (
              <Send className="mr-1.5 h-3.5 w-3.5" />
            )}
            Send
          </Button>
        </div>
      </div>
    </div>
  );
}

function MessageBubble({ message }: { message: ConversationMessage }) {
  const isOutbound = message.direction === 'OUTBOUND';
  const isCall = message.type === 'call';
  const ts = format(new Date(message.timestamp), 'MMM d, h:mm a');

  if (isCall) {
    return (
      <div className="flex items-center gap-2 text-xs text-muted-foreground py-1">
        <Phone className="h-3 w-3" />
        <span>
          {isOutbound ? 'Outbound call' : 'Inbound call'} — {message.status}
          {message.durationSeconds ? ` (${Math.floor(message.durationSeconds / 60)}:${(message.durationSeconds % 60).toString().padStart(2, '0')})` : ''}
        </span>
        <span className="ml-auto">{ts}</span>
      </div>
    );
  }

  return (
    <div className={`flex ${isOutbound ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`max-w-[80%] rounded-lg px-3 py-2 text-sm ${
          isOutbound
            ? 'bg-primary text-primary-foreground'
            : 'bg-muted'
        }`}
      >
        <p className="whitespace-pre-wrap break-words">{message.body}</p>
        <div className={`text-[10px] mt-1 ${isOutbound ? 'text-primary-foreground/70' : 'text-muted-foreground'}`}>
          {ts}
          {message.status && message.status !== 'received' && (
            <span className="ml-1">• {message.status}</span>
          )}
        </div>
      </div>
    </div>
  );
}
