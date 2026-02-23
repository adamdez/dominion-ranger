'use client';

import { useState } from 'react';
import { UserPlus, Shield, CheckCircle, XCircle } from 'lucide-react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { ScoreBadge } from '@/components/ui/score-badge';
import { EmptyState } from '@/components/ui/empty-state';
import { ErrorState } from '@/components/ui/error-state';
import { useLeads, useClaimLead, useRunCompliance } from '@/hooks/use-leads';
import { formatDistanceToNow } from 'date-fns';

interface ComplianceResult {
  leadInstanceId: string;
  cleared: boolean;
}

export default function AssignPage() {
  const { data, isLoading, error, refetch } = useLeads({
    status: 'PROMOTED',
    pageSize: 50,
    sortBy: 'compositeScore',
    sortOrder: 'desc',
  });

  const claimMutation = useClaimLead();
  const complianceMutation = useRunCompliance();
  const [complianceResults, setComplianceResults] = useState<Record<string, ComplianceResult>>({});

  const handleClaim = (leadInstanceId: string, expectedVersion: number) => {
    claimMutation.mutate(
      { leadInstanceId, expectedVersion },
      {
        onSuccess: (result) => {
          complianceMutation.mutate(result.leadInstanceId, {
            onSuccess: (compResult) => {
              setComplianceResults(prev => ({
                ...prev,
                [leadInstanceId]: {
                  leadInstanceId,
                  cleared: compResult.complianceCleared,
                },
              }));
            },
          });
        },
      }
    );
  };

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
        title="No promoted leads available"
        description="Run promotion from the Settings page to generate leads for assignment."
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {data?.pagination?.total ?? 0} promoted leads available for assignment
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
              <TableHead>Compliance</TableHead>
              <TableHead className="text-right">Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.data.map((lead) => {
              const compResult = complianceResults[lead.leadInstanceId];
              return (
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
                  <TableCell>
                    {compResult ? (
                      compResult.cleared ? (
                        <Badge variant="outline" className="bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400">
                          <CheckCircle className="mr-1 h-3 w-3" />
                          Cleared
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400">
                          <XCircle className="mr-1 h-3 w-3" />
                          Blocked
                        </Badge>
                      )
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      size="sm"
                      disabled={claimMutation.isPending || !!compResult}
                      onClick={() => handleClaim(lead.leadInstanceId, lead.version)}
                    >
                      <UserPlus className="mr-1.5 h-3.5 w-3.5" />
                      {compResult ? 'Claimed' : 'Claim'}
                    </Button>
                  </TableCell>
                </TableRow>
              );
            })}
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
