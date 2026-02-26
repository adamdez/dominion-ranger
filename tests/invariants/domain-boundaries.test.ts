/**
 * Charter v2.3 — Domain Boundaries (Static Analysis)
 *
 * Validates that domain boundaries are not violated at the module level:
 *   - Scoring module does NOT import workflow modules
 *   - Workflow module does NOT import scoring service (scoreProperty)
 *   - Distress events module does NOT import scoring or workflow
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';

const SRC_ROOT = join(process.cwd(), 'src');

function getImports(dir: string): string[] {
  const fullPath = join(SRC_ROOT, dir);
  let files: string[];
  try {
    files = readdirSync(fullPath).filter((f) => f.endsWith('.ts') && !f.endsWith('.d.ts'));
  } catch {
    return [];
  }
  const imports: string[] = [];
  for (const file of files) {
    const content = readFileSync(join(fullPath, file), 'utf-8');
    const matches = content.matchAll(/from\s+['"]([^'"]+)['"]/g);
    for (const m of matches) imports.push(m[1]);
  }
  return imports;
}

function getAllImportsRecursive(dir: string): string[] {
  const fullPath = join(SRC_ROOT, dir);
  const imports: string[] = [];
  let entries: { name: string; isDirectory: () => boolean }[];
  try {
    entries = readdirSync(fullPath, { withFileTypes: true });
  } catch {
    return [];
  }
  for (const entry of entries) {
    const childPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      imports.push(...getAllImportsRecursive(childPath));
    } else if (entry.name.endsWith('.ts') && !entry.name.endsWith('.d.ts')) {
      const content = readFileSync(join(SRC_ROOT, childPath), 'utf-8');
      const matches = content.matchAll(/from\s+['"]([^'"]+)['"]/g);
      for (const m of matches) imports.push(m[1]);
    }
  }
  return imports;
}

describe('Domain Boundaries', () => {
  it('a) scoring module does NOT import workflow modules', () => {
    const imports = getAllImportsRecursive('modules/scoring');
    const workflowImports = imports.filter((i) => i.includes('workflow'));
    expect(workflowImports).toHaveLength(0);
  });

  it('b) workflow module does NOT import scoring service', () => {
    const imports = getAllImportsRecursive('modules/workflow');
    const scoringServiceImports = imports.filter(
      (i) =>
        i.includes('modules/scoring') ||
        i.includes('modules/scoring/') ||
        (i.includes('scoring') && i.includes('service')),
    );
    expect(scoringServiceImports).toHaveLength(0);
  });

  it('c) distress events module does NOT import scoring or workflow', () => {
    const imports = getAllImportsRecursive('modules/distress-events');
    const scoringImports = imports.filter((i) => i.includes('scoring'));
    const workflowImports = imports.filter((i) => i.includes('workflow'));
    expect(scoringImports).toHaveLength(0);
    expect(workflowImports).toHaveLength(0);
  });
});
