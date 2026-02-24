'use client';

import { RefreshCw, Play, ArrowUpCircle, AlertTriangle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { ErrorState } from '@/components/ui/error-state';
import { useSystemStats } from '@/hooks/use-system';
import { useScoringStats, useRunScoring, useRunPromotion } from '@/hooks/use-scoring';
import { useFeatureFlags, useToggleFeatureFlag, useRecentErrors, useDeepHealth } from '@/hooks/use-settings';
import { SCORE_TIERS } from '@/lib/constants';

export default function SettingsPage() {
  const stats = useSystemStats();
  const scoringStats = useScoringStats();
  const runScoring = useRunScoring();
  const runPromotion = useRunPromotion();
  const flags = useFeatureFlags();
  const toggleFlag = useToggleFeatureFlag();
  const errors = useRecentErrors();
  const health = useDeepHealth();

  if (stats.error) {
    return <ErrorState message="Failed to load settings" onRetry={() => stats.refetch()} />;
  }

  return (
    <div className="space-y-4 max-w-3xl">

      {/* Batch Operations */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle>Batch Operations</CardTitle>
        </CardHeader>
        <CardContent className="space-y-0">
          <div className="flex items-center justify-between py-2.5 border-b border-border/50">
            <div>
              <p className="text-[13px] font-medium text-foreground">Rescore All Properties</p>
              <p className="text-[11px] text-muted-foreground">
                Re-run scoring engine for all properties
              </p>
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="border border-border"
              disabled={runScoring.isPending}
              onClick={() => runScoring.mutate({ rescore: true })}
            >
              <RefreshCw className="mr-1.5 h-3 w-3" />
              {runScoring.isPending ? '...' : 'Rescore'}
            </Button>
          </div>
          <div className="flex items-center justify-between py-2.5 border-b border-border/50">
            <div>
              <p className="text-[13px] font-medium text-foreground">Run Scoring Batch</p>
              <p className="text-[11px] text-muted-foreground">Score unscored properties only</p>
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="border border-border"
              disabled={runScoring.isPending}
              onClick={() => runScoring.mutate({})}
            >
              <Play className="mr-1.5 h-3 w-3" />
              {runScoring.isPending ? '...' : 'Score New'}
            </Button>
          </div>
          <div className="flex items-center justify-between py-2.5">
            <div>
              <p className="text-[13px] font-medium text-foreground">Run Promotion</p>
              <p className="text-[11px] text-muted-foreground">Evaluate scored properties for lead promotion</p>
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="border border-border"
              disabled={runPromotion.isPending}
              onClick={() => runPromotion.mutate()}
            >
              <ArrowUpCircle className="mr-1.5 h-3 w-3" />
              {runPromotion.isPending ? '...' : 'Promote'}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Feature Flags */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle>Feature Flags</CardTitle>
        </CardHeader>
        <CardContent>
          {flags.isLoading ? (
            <div className="space-y-2">
              {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-8 w-full" />)}
            </div>
          ) : flags.data && flags.data.length > 0 ? (
            <div className="space-y-0">
              {flags.data.map((flag) => (
                <div key={flag.flagKey} className="flex items-center justify-between py-2 border-b border-border/50 last:border-0">
                  <div className="flex-1 min-w-0 pr-4">
                    <p className="text-[13px] font-mono text-foreground">{flag.flagKey}</p>
                    {flag.description && (
                      <p className="text-[11px] text-muted-foreground truncate">{flag.description}</p>
                    )}
                  </div>
                  <Switch
                    checked={flag.enabled}
                    onCheckedChange={(enabled) =>
                      toggleFlag.mutate({ flagKey: flag.flagKey, enabled })
                    }
                    disabled={toggleFlag.isPending}
                  />
                </div>
              ))}
            </div>
          ) : (
            <p className="text-[13px] text-muted-foreground">No feature flags configured.</p>
          )}
        </CardContent>
      </Card>

      {/* System Health */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle>System Health</CardTitle>
            {health.data && (
              <span className={`text-[10px] font-medium uppercase tracking-wider ${health.data.status === 'healthy' ? 'text-emerald-400' : 'text-rose-400'}`}>
                {health.data.status}
              </span>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {health.isLoading ? (
            <div className="space-y-2">
              {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-5 w-full" />)}
            </div>
          ) : health.data ? (
            <div className="space-y-0">
              <SettingRow label="Properties" value={health.data.counts.properties.toLocaleString()} />
              <SettingRow label="Distress Events" value={health.data.counts.events.toLocaleString()} />
              <SettingRow label="Scoring Records" value={health.data.counts.scores.toLocaleString()} />
              <SettingRow label="Lead Instances" value={health.data.counts.leads.toLocaleString()} />
              <SettingRow label="Active Configs" value={health.data.counts.active_configs.toLocaleString()} />
              <SettingRow label="Accumulations" value={health.data.counts.accumulations.toLocaleString()} />
              {health.data.issues.length > 0 && (
                <div className="pt-2 mt-2 border-t border-border/50 space-y-1">
                  {health.data.issues.map((issue, i) => (
                    <div key={i} className="flex items-center gap-2 text-[12px] text-amber-400">
                      <AlertTriangle className="h-3 w-3 shrink-0" />
                      {issue}
                    </div>
                  ))}
                </div>
              )}
              <div className="pt-2 mt-1">
                <span className="text-[10px] text-muted-foreground">
                  Last checked: {new Date(health.data.timestamp).toLocaleTimeString()}
                </span>
              </div>
            </div>
          ) : (
            <p className="text-[13px] text-muted-foreground">Unable to fetch health data</p>
          )}
        </CardContent>
      </Card>

      {/* Recent Errors */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle>Recent Errors</CardTitle>
            {errors.data && errors.data.length > 0 && (
              <span className="text-[10px] font-mono text-rose-400">{errors.data.length}</span>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {errors.isLoading ? (
            <div className="space-y-2">
              {[1, 2, 3].map(i => <Skeleton key={i} className="h-8 w-full" />)}
            </div>
          ) : errors.data && errors.data.length > 0 ? (
            <div className="space-y-0">
              {errors.data.slice(0, 10).map((err) => (
                <div key={err.errorId} className="py-2 border-b border-border/50 last:border-0">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-mono text-muted-foreground">{err.errorType}</span>
                    <span className="text-[10px] text-muted-foreground">
                      {new Date(err.createdAt).toLocaleString()}
                    </span>
                  </div>
                  <p className="text-[12px] text-muted-foreground truncate mt-0.5">{err.message}</p>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-[13px] text-muted-foreground">No recent errors</p>
          )}
        </CardContent>
      </Card>

      {/* Scoring Configuration */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle>Scoring Configuration</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-[12px] text-muted-foreground">
            Scoring weights and thresholds are config-driven via the database.
          </p>
          <div className="space-y-0">
            <div className="py-1.5 border-b border-border/50">
              <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Tier Thresholds</span>
            </div>
            {Object.entries(SCORE_TIERS).map(([key, config]) => (
              <div key={key} className="flex items-center justify-between py-1.5 border-b border-border/50 last:border-0">
                <div className="flex items-center gap-2">
                  <div className={`h-2 w-2 rounded-sm ${config.color}`} />
                  <span className="text-[13px] text-foreground">{config.label}</span>
                </div>
                <span className="text-[13px] font-mono text-muted-foreground">&ge; {config.min}</span>
              </div>
            ))}
          </div>

          {scoringStats.data && (
            <div className="space-y-0 pt-2">
              <div className="py-1.5 border-b border-border/50">
                <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Current Stats</span>
              </div>
              <SettingRow label="Properties Scored" value={(scoringStats.data?.propertiesScored ?? 0).toLocaleString()} />
              <SettingRow label="Average Score" value={(scoringStats.data?.avgScore ?? 0).toFixed(1)} />
              <SettingRow label="Max Score" value={(scoringStats.data?.maxScore ?? 0).toFixed(1)} />
            </div>
          )}
        </CardContent>
      </Card>

      {/* System Status */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle>System Status</CardTitle>
        </CardHeader>
        <CardContent>
          {stats.isLoading ? (
            <div className="space-y-2">
              {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-5 w-full" />)}
            </div>
          ) : (
            <div className="space-y-0">
              <SettingRow label="Total Properties" value={(stats.data?.overview?.totalProperties ?? 0).toLocaleString()} />
              <SettingRow label="Total Events" value={(stats.data?.overview?.totalEvents ?? 0).toLocaleString()} />
              <SettingRow label="Promoted Leads" value={(stats.data?.overview?.promotedLeads ?? 0).toLocaleString()} />
              <SettingRow label="Properties w/ Phone" value={(stats.data?.overview?.withPhone ?? 0).toLocaleString()} />
              <SettingRow label="Absentee Owners" value={(stats.data?.overview?.absenteeOwners ?? 0).toLocaleString()} />
              <SettingRow label="Uptime" value={stats.data ? formatUptime(stats.data.uptime) : '\u2014'} />
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function SettingRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between py-1.5 border-b border-border/50 last:border-0">
      <span className="text-[13px] text-muted-foreground">{label}</span>
      <span className="text-[13px] font-mono font-medium tabular-nums text-foreground">{value}</span>
    </div>
  );
}

function formatUptime(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m`;
}
