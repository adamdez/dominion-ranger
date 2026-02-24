'use client';

import { UserPlus, Shield } from 'lucide-react';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
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
      <div className="text-[13px] text-muted-foreground py-8 text-center">Loading...</div>
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
    <div className="space-y-3">
      <p className="text-[12px] text-muted-foreground font-mono">
        {data?.pagination?.total ?? 0} promoted leads available
      </p>

      <div className="border rounded-md overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="bg-secondary/50">
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
                <TableCell className="font-medium text-foreground max-w-[200px] truncate">
                  {lead.streetAddress ?? '—'}
                </TableCell>
                <TableCell className="text-muted-foreground max-w-[150px] truncate">
                  {lead.ownerName ?? '—'}
                </TableCell>
                <TableCell className="text-muted-foreground">{lead.county ?? '—'}</TableCell>
                <TableCell>
                  <ScoreBadge score={lead.compositeScore} />
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {formatDistanceToNow(new Date(lead.createdAt), { addSuffix: true })}
                </TableCell>
                <TableCell className="text-right">
                  <Button
                    size="xs"
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
                    <UserPlus className="mr-1 h-3 w-3" />
                    {claimMutation.isPending ? '...' : 'Claim'}
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <div className="flex items-start gap-2.5 py-2 text-[12px] text-muted-foreground">
        <Shield className="h-3.5 w-3.5 mt-0.5 shrink-0" />
        <span>
          Compliance checks (DNC, litigant) run automatically on claim.
          Passed leads move to DIAL_READY; blocked leads move to DEAD.
        </span>
      </div>
    </div>
  );
}
