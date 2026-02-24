import { db } from '../../db/connection.js';
import { scoringModelConfigs } from '../../db/schema/index.js';
import { eq } from 'drizzle-orm';

interface ConfigValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export async function validateScoringConfig(): Promise<ConfigValidationResult> {
  const errors: string[] = [];
  const warnings: string[] = [];

  const configs = await db
    .select()
    .from(scoringModelConfigs)
    .where(eq(scoringModelConfigs.active, true));

  if (configs.length === 0) {
    errors.push('No active scoring_model_configs found. Run the seed migration.');
    return { valid: false, errors, warnings };
  }

  const config = configs[0];

  const requiredColumns: Array<{ name: string; value: unknown; requiredKeys?: string[] }> = [
    { name: 'confirmed_weights', value: config.confirmedWeights },
    { name: 'predictive_weights', value: config.predictiveWeights },
    { name: 'decay_config', value: config.decayConfig, requiredKeys: ['halfLifeDays', 'minWeight'] },
    { name: 'tier_thresholds', value: config.tierThresholds, requiredKeys: ['A', 'B', 'C'] },
    { name: 'confidence_config', value: config.confidenceConfig },
    { name: 'equity_multiplier_config', value: config.equityMultiplierConfig, requiredKeys: ['ranges', 'default_multiplier'] },
    { name: 'deal_score_weights', value: config.dealScoreWeights, requiredKeys: ['equity_thresholds', 'ownership_thresholds', 'equity_factors', 'ownership_factors'] },
    { name: 'composite_weights', value: config.compositeWeights, requiredKeys: ['motivationWeight', 'dealWeight'] },
    { name: 'suppression_config', value: config.suppressionConfig },
  ];

  for (const col of requiredColumns) {
    const val = col.value as Record<string, unknown> | null;
    if (!val || Object.keys(val).length === 0) {
      errors.push(`scoring_model_configs.${col.name} is empty. Scoring will fail.`);
      continue;
    }
    if (col.requiredKeys) {
      for (const key of col.requiredKeys) {
        if (!(key in val)) {
          errors.push(`scoring_model_configs.${col.name} missing required key "${key}". Scoring will fail.`);
        }
      }
    }
  }

  // Validate equity_multiplier_config.ranges is an array
  const emc = config.equityMultiplierConfig as Record<string, unknown> | null;
  if (emc && emc.ranges && !Array.isArray(emc.ranges)) {
    errors.push('equity_multiplier_config.ranges must be an array. Got: ' + typeof emc.ranges);
  }

  return { valid: errors.length === 0, errors, warnings };
}
