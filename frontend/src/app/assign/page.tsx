'use client';

import { UserPlus, Shield } from 'lucide-react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ScoreBadge } from '@/components/ui/score-badge';
import { EmptyState } from '@/components/ui/empty-state';
import { ErrorState } from '@/components/ui/error-state';
import { useLeads, useClaimLead, useRunCompliance } from '@/hooks/use-leads';
import { formatDistanceToNow } from 'date-fns';

export default function AssignPage() {
  const { data, isLoading, error, refetch } = useLeads({
    status: 'PROMOTED',
    pageSize: 50,
    sortBy: 'compositeScore',
    sortOrder: 'desc',
  });

  const claimMutation = useClaimLead();
  const complianceMutation = useRunCompliance();

  if (error) {
    return <ErrorState message="Failed to load unassigned leads" onRetry={() => refetch()} />;
  }

  if (isLoading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-14 w-full" />
        ))}
      </div>
    );
  }

  if (!data?.data.length) {
    return (
      <EmptyState
        icon={UserPlus}
        title="No unassigned leads"
        description="All promoted leads have been claimed. Run promotion to generate new leads."
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {data.pagination.total} promoted leads available for assignment
        </p>
      </div>

      <div className="rounded-md border overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Address</TableHead>
              <TableHead>Owner</TableHead>
              <TableHead>County</TableHead>
              <TableHead>Score</TableHead>
              <TableHead>Promoted</TableHead>
              <TableHead className="text-right">Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.data.map((lead) => (
              <TableRow key={lead.leadInstanceId}>
                <TableCell className="font-medium max-w-[200px] truncate">
                  {lead.streetAddress ?? '—'}
                </TableCell>
                <TableCell className="max-w-[150px] truncate">
                  {lead.ownerName ?? '—'}
                </TableCell>
                <TableCell>{lead.county ?? '—'}</TableCell>
                <TableCell>
                  <ScoreBadge score={lead.compositeScore} />
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {formatDistanceToNow(new Date(lead.createdAt), { addSuffix: true })}
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex items-center justify-end gap-2">
                    <Button
                      size="sm"
                      disabled={claimMutation.isPending}
                      onClick={() =>
                        claimMutation.mutate(
                          { leadInstanceId: lead.leadInstanceId, expectedVersion: lead.version },
                          {
                            onSuccess: (result) => {
                              complianceMutation.mutate(result.leadInstanceId);
                            },
                          }
                        )
                      }
                    >
                      <UserPlus className="mr-1.5 h-3.5 w-3.5" />
                      Claim
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <div className="rounded-lg border border-dashed p-4">
        <div className="flex items-start gap-3">
          <Shield className="h-5 w-5 text-muted-foreground mt-0.5" />
          <div>
            <p className="text-sm font-medium">Compliance Gating</p>
            <p className="text-xs text-muted-foreground">
              When you claim a lead, compliance checks (DNC, litigant) run automatically.
              If the lead passes, it moves to DIAL_READY. If blocked, it moves to DEAD.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
