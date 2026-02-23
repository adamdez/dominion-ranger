'use client';

import { Settings, Database, BarChart3, RefreshCw, Play, ArrowUpCircle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { ErrorState } from '@/components/ui/error-state';
import { useSystemStats } from '@/hooks/use-system';
import { useScoringStats, useRunScoring, useRunPromotion } from '@/hooks/use-scoring';
import { SCORE_TIERS } from '@/lib/constants';

export default function SettingsPage() {
  const stats = useSystemStats();
  const scoringStats = useScoringStats();
  const runScoring = useRunScoring();
  const runPromotion = useRunPromotion();

  if (stats.error) {
    return <ErrorState message="Failed to load settings" onRetry={() => stats.refetch()} />;
  }

  return (
    <div className="space-y-6 max-w-3xl">
      {/* System Status */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Database className="h-4 w-4" />
            System Status
          </CardTitle>
        </CardHeader>
        <CardContent>
          {stats.isLoading ? (
            <div className="space-y-2">
              {[1, 2, 3, 4, 5].map(i => <Skeleton key={i} className="h-6 w-full" />)}
            </div>
          ) : (
            <div className="space-y-2 text-sm">
              <SettingRow label="Total Properties" value={(stats.data?.overview?.totalProperties ?? 0).toLocaleString()} />
              <SettingRow label="Total Events" value={(stats.data?.overview?.totalEvents ?? 0).toLocaleString()} />
              <SettingRow label="Promoted Leads" value={(stats.data?.overview?.promotedLeads ?? 0).toLocaleString()} />
              <SettingRow label="Properties w/ Phone" value={(stats.data?.overview?.withPhone ?? 0).toLocaleString()} />
              <SettingRow label="Absentee Owners" value={(stats.data?.overview?.absenteeOwners ?? 0).toLocaleString()} />
              <SettingRow label="Uptime" value={stats.data ? formatUptime(stats.data.uptime) : '—'} />
              <SettingRow label="Last Updated" value={stats.data?.timestamp ? new Date(stats.data.timestamp).toLocaleString() : '—'} />
            </div>
          )}
        </CardContent>
      </Card>

      {/* Scoring Configuration */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <BarChart3 className="h-4 w-4" />
            Scoring Configuration
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="text-sm space-y-2">
            <p className="text-muted-foreground">
              Scoring weights and thresholds are config-driven via the database.
              The values below are read from the active scoring_model_configs row.
            </p>
            <Separator />
            <div className="space-y-2">
              <h4 className="font-semibold text-xs text-muted-foreground uppercase">Tier Thresholds</h4>
              {Object.entries(SCORE_TIERS).map(([key, config]) => (
                <div key={key} className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className={`h-2.5 w-2.5 rounded-full ${config.color}`} />
                    <span>{config.label}</span>
                  </div>
                  <span className="text-muted-foreground">&ge; {config.min}</span>
                </div>
              ))}
            </div>
          </div>

          {scoringStats.data && (
            <>
              <Separator />
              <div className="space-y-2 text-sm">
                <h4 className="font-semibold text-xs text-muted-foreground uppercase">Current Stats</h4>
                <SettingRow label="Properties Scored" value={(scoringStats.data?.propertiesScored ?? 0).toLocaleString()} />
                <SettingRow label="Average Score" value={(scoringStats.data?.avgScore ?? 0).toFixed(1)} />
                <SettingRow label="Max Score" value={(scoringStats.data?.maxScore ?? 0).toFixed(1)} />
                <SettingRow label="Total Records" value={(scoringStats.data?.totalRecords ?? 0).toLocaleString()} />
              </div>
              <Separator />
              <div className="space-y-2 text-sm">
                <h4 className="font-semibold text-xs text-muted-foreground uppercase">Tier Breakdown</h4>
                <SettingRow label="Tier A" value={String(scoringStats.data?.tierA ?? 0)} />
                <SettingRow label="Tier B" value={String(scoringStats.data?.tierB ?? 0)} />
                <SettingRow label="Tier C" value={String(scoringStats.data?.tierC ?? 0)} />
                <SettingRow label="Below Threshold" value={String(scoringStats.data?.belowThreshold ?? 0)} />
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Actions */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Settings className="h-4 w-4" />
            Actions
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Rescore All Properties</p>
              <p className="text-xs text-muted-foreground">
                Re-run scoring engine for all properties using current model config
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              disabled={runScoring.isPending}
              onClick={() => runScoring.mutate({ rescore: true })}
            >
              <RefreshCw className={`mr-1.5 h-3.5 w-3.5 ${runScoring.isPending ? 'animate-spin' : ''}`} />
              Rescore
            </Button>
          </div>
          <Separator />
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Score New Properties</p>
              <p className="text-xs text-muted-foreground">
                Score only unscored properties
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              disabled={runScoring.isPending}
              onClick={() => runScoring.mutate({})}
            >
              <Play className="mr-1.5 h-3.5 w-3.5" />
              Score New
            </Button>
          </div>
          <Separator />
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Replay Promotions</p>
              <p className="text-xs text-muted-foreground">
                Evaluate all scored properties for lead promotion
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              disabled={runPromotion.isPending}
              onClick={() => runPromotion.mutate()}
            >
              <ArrowUpCircle className={`mr-1.5 h-3.5 w-3.5 ${runPromotion.isPending ? 'animate-spin' : ''}`} />
              Promote
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function SettingRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between py-1">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium tabular-nums">{value}</span>
    </div>
  );
}

function formatUptime(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m`;
}
