import { db } from '../db/connection.js';
import { systemSettings } from '../db/schema/index.js';
import { eq } from 'drizzle-orm';
import { logger } from '../config/logger.js';

export interface PipelineToggles {
  autoImport: boolean;
  autoScoring: boolean;
  autoPromotion: boolean;
  nightlyRescore: boolean;
}

export interface PipelineJobResult {
  job: string;
  success: boolean;
  message: string;
  count?: number;
  errors?: number;
  durationMs: number;
  completedAt: string;
}

const DEFAULT_TOGGLES: PipelineToggles = {
  autoImport: true,
  autoScoring: true,
  autoPromotion: true,
  nightlyRescore: true,
};

export async function getPipelineToggles(): Promise<PipelineToggles> {
  try {
    const [row] = await db
      .select()
      .from(systemSettings)
      .where(eq(systemSettings.key, 'pipeline_toggles'))
      .limit(1);
    if (!row) return DEFAULT_TOGGLES;
    return { ...DEFAULT_TOGGLES, ...(row.value as Partial<PipelineToggles>) };
  } catch {
    return DEFAULT_TOGGLES;
  }
}

export async function setPipelineToggles(toggles: Partial<PipelineToggles>): Promise<PipelineToggles> {
  const current = await getPipelineToggles();
  const updated = { ...current, ...toggles };
  await db
    .insert(systemSettings)
    .values({ key: 'pipeline_toggles', value: updated })
    .onConflictDoUpdate({
      target: systemSettings.key,
      set: { value: updated, updatedAt: new Date() },
    });
  return updated;
}

export async function getLastJobResult(jobName: string): Promise<PipelineJobResult | null> {
  try {
    const [row] = await db
      .select()
      .from(systemSettings)
      .where(eq(systemSettings.key, `pipeline_last_${jobName}`))
      .limit(1);
    return (row?.value as PipelineJobResult) ?? null;
  } catch {
    return null;
  }
}

export async function saveJobResult(result: PipelineJobResult): Promise<void> {
  const key = `pipeline_last_${result.job}`;
  await db
    .insert(systemSettings)
    .values({ key, value: result as unknown as Record<string, unknown> })
    .onConflictDoUpdate({
      target: systemSettings.key,
      set: { value: result as unknown as Record<string, unknown>, updatedAt: new Date() },
    });
  logger.info({ job: result.job, success: result.success, count: result.count }, 'Pipeline job result saved');
}

export async function getImportedFiles(): Promise<string[]> {
  try {
    const [row] = await db
      .select()
      .from(systemSettings)
      .where(eq(systemSettings.key, 'imported_files'))
      .limit(1);
    return (row?.value as string[]) ?? [];
  } catch {
    return [];
  }
}

export async function markFileImported(filename: string): Promise<void> {
  const current = await getImportedFiles();
  if (current.includes(filename)) return;
  const updated = [...current, filename];
  await db
    .insert(systemSettings)
    .values({ key: 'imported_files', value: updated })
    .onConflictDoUpdate({
      target: systemSettings.key,
      set: { value: updated, updatedAt: new Date() },
    });
}

export async function isPipelineEnabled(): Promise<boolean> {
  try {
    const [row] = await db
      .select()
      .from(systemSettings)
      .where(eq(systemSettings.key, 'pipeline_automation'))
      .limit(1);
    if (!row) return true;
    const val = row.value as { enabled?: boolean } | boolean;
    if (typeof val === 'boolean') return val;
    return val?.enabled !== false;
  } catch {
    return true;
  }
}
