'use client';
import { useState, useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Sidebar } from './sidebar';
import { Header } from './header';
import { VerseOfTheDay } from '@/components/verse-of-the-day';
import { useAuth } from '@/lib/auth-context';
import { setApiAccessToken } from '@/lib/api';
import { FunnelDragProvider, useFunnelDrag } from '@/lib/funnel-drag-context';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export function AppShell({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { user, accessToken, isLoading } = useAuth();
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    setApiAccessToken(accessToken);
  }, [accessToken]);

  useEffect(() => {
    if (!isLoading && !user && pathname !== '/login') {
      router.push('/login');
    }
  }, [user, isLoading, router, pathname]);

  if (pathname === '/login') {
    return <>{children}</>;
  }

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          <p className="text-sm text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  return (
    <FunnelDragProvider>
      <div className="min-h-screen bg-background">
        <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
        <div className="md:pl-[180px]">
          <Header onMenuClick={() => setSidebarOpen(true)} />
          <div className="hidden md:flex items-center px-4 md:px-6 py-2 border-b border-border">
            <VerseOfTheDay />
          </div>
          <main className="p-4 md:p-6">{children}</main>
        </div>
      </div>
      <OfferAmountDialog />
    </FunnelDragProvider>
  );
}

function OfferAmountDialog() {
  const { offerPrompt, setOfferPrompt, submitOfferAndAdvance } = useFunnelDrag();
  const [amount, setAmount] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    const cents = Math.round(parseFloat(amount) * 100);
    if (isNaN(cents) || cents <= 0) return;
    setSubmitting(true);
    await submitOfferAndAdvance(cents);
    setSubmitting(false);
    setAmount('');
  };

  return (
    <Dialog open={!!offerPrompt} onOpenChange={(open) => { if (!open) { setOfferPrompt(null); setAmount(''); } }}>
      <DialogContent>
        <DialogHeader><DialogTitle>Offer Amount Required</DialogTitle></DialogHeader>
        <div className="space-y-3 py-2">
          <p className="text-sm text-muted-foreground">
            Moving <span className="font-medium text-foreground">{offerPrompt?.data.address}</span> to Negotiation requires an offer amount.
          </p>
          <div>
            <Label>Offer Amount ($)</Label>
            <Input type="number" placeholder="150000" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => { setOfferPrompt(null); setAmount(''); }}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={submitting || !amount}>Move to Negotiation</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}