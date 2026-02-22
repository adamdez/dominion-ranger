/**
 * Basic address standardization for dedup matching.
 *
 * Phase 2 will add USPS API validation or SmartyStreets integration.
 * For now: normalize case, whitespace, common abbreviations.
 */

const ABBREVIATIONS: Record<string, string> = {
  'street': 'ST',
  'str': 'ST',
  'avenue': 'AVE',
  'ave': 'AVE',
  'boulevard': 'BLVD',
  'blvd': 'BLVD',
  'drive': 'DR',
  'dr': 'DR',
  'lane': 'LN',
  'ln': 'LN',
  'road': 'RD',
  'rd': 'RD',
  'court': 'CT',
  'ct': 'CT',
  'circle': 'CIR',
  'cir': 'CIR',
  'place': 'PL',
  'pl': 'PL',
  'terrace': 'TER',
  'ter': 'TER',
  'way': 'WAY',
  'north': 'N',
  'south': 'S',
  'east': 'E',
  'west': 'W',
  'northeast': 'NE',
  'northwest': 'NW',
  'southeast': 'SE',
  'southwest': 'SW',
  'apartment': 'APT',
  'apt': 'APT',
  'suite': 'STE',
  'ste': 'STE',
  'unit': 'UNIT',
  '#': 'UNIT',
};

export function standardizeAddress(raw: string): string {
  if (!raw) return '';

  let addr = raw
    .toUpperCase()
    .replace(/#(\d)/g, 'UNIT $1')
    .replace(/[.,#]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  // Replace known abbreviations
  const words = addr.split(' ');
  const standardized = words.map((word) => {
    const lower = word.toLowerCase();
    return ABBREVIATIONS[lower] ?? word;
  });

  return standardized.join(' ');
}

/**
 * Generate a dedup-safe address key for matching.
 * Strips all non-alphanumeric characters and lowercases.
 */
export function addressKey(address: string): string {
  return standardizeAddress(address)
    .replace(/[^A-Z0-9]/g, '')
    .toLowerCase();
}
