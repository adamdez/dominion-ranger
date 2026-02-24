'use client';

import { DollarSign } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export default function OffersPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold tracking-tight">Offers</h1>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <DollarSign className="h-5 w-5" />
            Phase 4A Placeholder
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">
            Offers management will be implemented in Phase 4A. This page will show active offers, negotiations, and deal terms.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
