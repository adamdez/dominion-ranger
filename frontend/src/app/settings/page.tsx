'use client';

import { Settings, Database, BarChart3, RefreshCw, Play, ArrowUpCircle, AlertTriangle, Activity, ToggleLeft, Zap, CheckCircle, XCircle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { ErrorState } from '@/components/ui/error-state';
import { useSystemStats } from '@/hooks/use-system';
import { useScoringStats, useRunScoring, useRunPromotion } from '@/hooks/use-scoring';
import { useFeatureFlags, useToggleFeatureFlag, useRecentErrors, useDeepHealth } from '@/hooks/use-settings';
import {
  usePipelineStatus,
  useTogglePipelineEnabled,
  useUpdatePipelineToggles,
  useRunPipelineJob,
} from '@/hooks/use-pipeline';
import type { PipelineJobResult } from '@/hooks/use-pipeline';
import { SCORE_TIERS } from '@/lib/constants';
import { useAuth } from '@/lib/auth-context';

export default function SettingsPage() {
  const { isAdmin } = useAuth();
  const stats = useSystemStats();
  const scoringStats = useScoringStats();
  const runScoring = useRunScoring();
  const runPromotion = useRunPromotion();
  const flags = useFeatureFlags();
  const toggleFlag = useToggleFeatureFlag();
  const errors = useRecentErrors(isAdmin);
  const health = useDeepHealth();
  const pipeline = usePipelineStatus();
  const togglePipelineEnabled = useTogglePipelineEnabled();
  const updatePipelineToggles = useUpdatePipelineToggles();
  const runPipelineJob = useRunPipelineJob();

  if (stats.error) {
    return <ErrorState message="Failed to load settings" onRetry={() => stats.refetch()} />;
  }

  return (
    <div className="space-y-6 max-w-3xl">

      {/* Batch Operations */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Settings className="h-4 w-4" />
            Batch Operations
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
              <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
              Rescore
            </Button>
          </div>
          <Separator />
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Run Scoring Batch</p>
              <p className="text-xs text-muted-foreground">Score unscored properties only</p>
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
              <p className="text-sm font-medium">Run Promotion</p>
              <p className="text-xs text-muted-foreground">Evaluate all scored properties for lead promotion</p>
            </div>
            <Button
              variant="outline"
              size="sm"
              disabled={runPromotion.isPending}
              onClick={() => runPromotion.mutate()}
            >
              <ArrowUpCircle className="mr-1.5 h-3.5 w-3.5" />
              Promote
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Pipeline Automation */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Zap className="h-4 w-4" />
            Pipeline Automation
            {pipeline.data && (
              <Badge
                variant={pipeline.data.enabled ? 'default' : 'secondary'}
                className="ml-auto text-xs"
              >
                {pipeline.data.enabled ? 'Active' : 'Paused'}
              </Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {pipeline.isLoading ? (
            <div className="space-y-3">
              {[1, 2, 3, 4, 5].map(i => <Skeleton key={i} className="h-10 w-full" />)}
            </div>
          ) : pipeline.data ? (
            <>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">Master Kill Switch</p>
                  <p className="text-xs text-muted-foreground">
                    When disabled, all scheduled pipeline jobs are paused
                  </p>
                </div>
                <Switch
                  checked={pipeline.data.enabled}
                  onCheckedChange={(enabled) => togglePipelineEnabled.mutate(enabled)}
                  disabled={togglePipelineEnabled.isPending}
                />
              </div>

              <Separator />

              <PipelineToggleRow
                label="Auto-Import"
                description="Check for new CSVs every 6 hours"
                checked={pipeline.data.toggles.autoImport}
                disabled={!pipeline.data.enabled || updatePipelineToggles.isPending}
                onCheckedChange={(v) => updatePipelineToggles.mutate({ autoImport: v })}
                lastRun={pipeline.data.lastRuns.import}
                onRunNow={() => runPipelineJob.mutate('import')}
                running={runPipelineJob.isPending}
              />

              <Separator />

              <PipelineToggleRow
                label="Auto-Scoring"
                description="Score unscored properties every hour"
                checked={pipeline.data.toggles.autoScoring}
                disabled={!pipeline.data.enabled || updatePipelineToggles.isPending}
                onCheckedChange={(v) => updatePipelineToggles.mutate({ autoScoring: v })}
                lastRun={pipeline.data.lastRuns.scoring}
                onRunNow={() => runPipelineJob.mutate('scoring')}
                running={runPipelineJob.isPending}
              />

              <Separator />

              <PipelineToggleRow
                label="Auto-Promotion"
                description="Promote qualified leads every hour"
                checked={pipeline.data.toggles.autoPromotion}
                disabled={!pipeline.data.enabled || updatePipelineToggles.isPending}
                onCheckedChange={(v) => updatePipelineToggles.mutate({ autoPromotion: v })}
                lastRun={pipeline.data.lastRuns.promotion}
                onRunNow={() => runPipelineJob.mutate('promotion')}
                running={runPipelineJob.isPending}
              />

              <Separator />

              <PipelineToggleRow
                label="Nightly Rescore"
                description="Full rescore of all properties daily at 2 AM"
                checked={pipeline.data.toggles.nightlyRescore}
                disabled={!pipeline.data.enabled || updatePipelineToggles.isPending}
                onCheckedChange={(v) => updatePipelineToggles.mutate({ nightlyRescore: v })}
                lastRun={pipeline.data.lastRuns.rescore}
                onRunNow={() => runPipelineJob.mutate('rescore')}
                running={runPipelineJob.isPending}
              />
            </>
          ) : (
            <p className="text-sm text-muted-foreground">Unable to load pipeline status</p>
          )}
        </CardContent>
      </Card>

      {/* Feature Flags */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <ToggleLeft className="h-4 w-4" />
            Feature Flags
          </CardTitle>
        </CardHeader>
        <CardContent>
          {flags.isLoading ? (
            <div className="space-y-3">
              {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-10 w-full" />)}
            </div>
          ) : flags.data && flags.data.length > 0 ? (
            <div className="space-y-1">
              {flags.data.map((flag) => (
                <div key={flag.flagKey} className="flex items-center justify-between py-2.5">
                  <div className="flex-1 min-w-0 pr-4">
                    <p className="text-sm font-medium font-mono">{flag.flagKey}</p>
                    {flag.description && (
                      <p className="text-xs text-muted-foreground truncate">{flag.description}</p>
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
            <p className="text-sm text-muted-foreground">No feature flags configured. Run migration 0006.</p>
          )}
        </CardContent>
      </Card>

      {/* System Health */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Activity className="h-4 w-4" />
            System Health
            {health.data && (
              <Badge variant={health.data.status === 'healthy' ? 'default' : 'destructive'} className="ml-auto text-xs">
                {health.data.status}
              </Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {health.isLoading ? (
            <div className="space-y-2">
              {[1, 2, 3, 4, 5, 6].map(i => <Skeleton key={i} className="h-6 w-full" />)}
            </div>
          ) : health.data ? (
            <div className="space-y-3">
              <div className="space-y-2 text-sm">
                <SettingRow label="Properties" value={health.data.counts.properties.toLocaleString()} />
                <SettingRow label="Distress Events" value={health.data.counts.events.toLocaleString()} />
                <SettingRow label="Scoring Records" value={health.data.counts.scores.toLocaleString()} />
                <SettingRow label="Lead Instances" value={health.data.counts.leads.toLocaleString()} />
                <SettingRow label="Active Scoring Configs" value={health.data.counts.active_configs.toLocaleString()} />
                <SettingRow label="Signal Accumulations" value={health.data.counts.accumulations.toLocaleString()} />
              </div>
              {health.data.issues.length > 0 && (
                <>
                  <Separator />
                  <div className="space-y-1">
                    {health.data.issues.map((issue, i) => (
                      <div key={i} className="flex items-center gap-2 text-sm text-amber-600 dark:text-amber-400">
                        <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                        {issue}
                      </div>
                    ))}
                  </div>
                </>
              )}
              <p className="text-xs text-muted-foreground">
                Last checked: {new Date(health.data.timestamp).toLocaleTimeString()}
              </p>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Unable to fetch health data</p>
          )}
        </CardContent>
      </Card>

      {/* System Errors */}
      {isAdmin && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <AlertTriangle className="h-4 w-4" />
              System Errors
              {errors.data && errors.data.length > 0 && (
                <Badge variant="destructive" className="ml-auto text-xs">
                  {errors.data.length}
                </Badge>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {errors.isLoading ? (
              <div className="space-y-2">
                {[1, 2, 3].map(i => <Skeleton key={i} className="h-12 w-full" />)}
              </div>
            ) : errors.data && errors.data.length > 0 ? (
              <div className="space-y-2">
                {errors.data.slice(0, 10).map((err) => (
                  <div key={err.errorId} className="rounded-md border p-2.5 text-xs space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">
                        {new Date(err.createdAt).toLocaleString()}
                      </span>
                    </div>
                    <p className="text-muted-foreground truncate">{err.errorMessage}</p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No recent system errors</p>
            )}
          </CardContent>
        </Card>
      )}

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
              </div>
            </>
          )}
        </CardContent>
      </Card>

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

function PipelineToggleRow({
  label,
  description,
  checked,
  disabled,
  onCheckedChange,
  lastRun,
  onRunNow,
  running,
}: {
  label: string;
  description: string;
  checked: boolean;
  disabled: boolean;
  onCheckedChange: (v: boolean) => void;
  lastRun: PipelineJobResult | null;
  onRunNow: () => void;
  running: boolean;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex-1 min-w-0 pr-4">
          <p className="text-sm font-medium">{label}</p>
          <p className="text-xs text-muted-foreground">{description}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="ghost"
            className="h-7 text-xs px-2"
            disabled={running}
            onClick={onRunNow}
          >
            <Play className="h-3 w-3 mr-1" />
            Run
          </Button>
          <Switch
            checked={checked}
            onCheckedChange={onCheckedChange}
            disabled={disabled}
          />
        </div>
      </div>
      {lastRun && (
        <div className="flex items-center gap-2 text-[11px] text-muted-foreground pl-0.5">
          {lastRun.success ? (
            <CheckCircle className="h-3 w-3 text-emerald-500 shrink-0" />
          ) : (
            <XCircle className="h-3 w-3 text-red-500 shrink-0" />
          )}
          <span className="truncate">{lastRun.message}</span>
          <span className="shrink-0 tabular-nums">
            {new Date(lastRun.completedAt).toLocaleString(undefined, {
              month: 'short',
              day: 'numeric',
              hour: 'numeric',
              minute: '2-digit',
            })}
          </span>
          <span className="shrink-0 tabular-nums">({lastRun.durationMs}ms)</span>
        </div>
      )}
    </div>
  );
}
