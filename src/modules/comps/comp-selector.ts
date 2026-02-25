export interface Comp {
  address: string;
  salePrice: number;
  saleDate: string;
  sqft: number;
  beds: number;
  baths: number;
  yearBuilt: number;
  distanceMiles: number;
}

export interface RankedComp extends Comp {
  rank: number;
  score: number;
  sqftDiff: number;
  distanceBucket: string;
}

export type CompQuality = 'excellent' | 'good' | 'fair' | 'poor' | 'no_data';

export interface CompAnalysis {
  allComps: Comp[];
  bestThree: RankedComp[];
  arv: number;
  compCount: number;
  quality: CompQuality;
  warning: string | null;
}

const MAX_DISTANCE = 1.0;
const MAX_SQFT_DIFF = 550;
const DISTANCE_WEIGHT = 100;
const SQFT_WEIGHT = 0.1;

export function selectBestComps(
  subjectSqft: number,
  allComps: Comp[],
): RankedComp[] {
  return allComps
    .map((comp) => {
      const sqftDiff = Math.abs(comp.sqft - subjectSqft);
      const score =
        comp.distanceMiles * DISTANCE_WEIGHT + sqftDiff * SQFT_WEIGHT;
      const distanceBucket =
        comp.distanceMiles <= 0.25
          ? '¼ mi'
          : comp.distanceMiles <= 0.5
            ? '½ mi'
            : comp.distanceMiles <= 0.75
              ? '¾ mi'
              : '1 mi';
      return { ...comp, score, sqftDiff, distanceBucket, rank: 0 };
    })
    .filter((c) => c.distanceMiles <= MAX_DISTANCE && c.sqftDiff <= MAX_SQFT_DIFF)
    .sort((a, b) => a.score - b.score)
    .slice(0, 3)
    .map((c, i) => ({ ...c, rank: i + 1 }));
}

export function assessCompQuality(bestThree: RankedComp[]): CompQuality {
  if (bestThree.length === 0) return 'no_data';
  if (bestThree.length < 3) return 'poor';

  const allWithinHalfMile = bestThree.every((c) => c.distanceMiles <= 0.5);
  const allWithin250 = bestThree.every((c) => c.sqftDiff <= 250);
  if (allWithinHalfMile && allWithin250) return 'excellent';

  const allWithin3qMile = bestThree.every((c) => c.distanceMiles <= 0.75);
  const allWithin350 = bestThree.every((c) => c.sqftDiff <= 350);
  if (allWithin3qMile && allWithin350) return 'good';

  const allWithin1Mile = bestThree.every((c) => c.distanceMiles <= 1.0);
  const allWithin450 = bestThree.every((c) => c.sqftDiff <= 450);
  if (allWithin1Mile && allWithin450) return 'fair';

  return 'poor';
}

export function analyzeComps(
  subjectSqft: number,
  rawComps: Comp[],
): CompAnalysis {
  const bestThree = selectBestComps(subjectSqft, rawComps);
  const quality = assessCompQuality(bestThree);

  const arv =
    bestThree.length > 0
      ? Math.round(
          bestThree.reduce((sum, c) => sum + c.salePrice, 0) /
            bestThree.length,
        )
      : 0;

  let warning: string | null = null;
  if (bestThree.length === 0) {
    warning = 'No comparable sales found within search parameters';
  } else if (bestThree.length < 3) {
    warning = `Only ${bestThree.length} comp${bestThree.length === 1 ? '' : 's'} found within parameters`;
  }

  return {
    allComps: rawComps,
    bestThree,
    arv,
    compCount: rawComps.length,
    quality,
    warning,
  };
}
