/// <reference types="@figma/plugin-typings" />

// ──────────────────────────────────────────────
// Extended Lint Types for new checks
// ──────────────────────────────────────────────

/**
 * All lint issue types — extends the original LintErrorType
 * with spacing, autoLayout, and naming checks.
 */
export type LintIssueType =
  | 'fill'
  | 'stroke'
  | 'effect'
  | 'textStyle'
  | 'radius'
  | 'spacing'
  | 'autoLayout'
  | 'naming'
  | 'accessibility';

export type LintSeverity = 'critical' | 'warning' | 'info';

export interface LintIssue {
  id: string;
  type: LintIssueType;
  severity: LintSeverity;
  nodeId: string;
  nodeName: string;
  message: string;
  currentValue?: string;
  suggestions?: string[];
  autoFixable: boolean;
  fixAction?: FixAction;
}

export interface FixAction {
  type: 'applyStyle' | 'fixSpacing' | 'renameLayer' | 'convertAutoLayout';
  params: Record<string, unknown>;
}

export interface SpacingLintResult {
  issues: LintIssue[];
  summary: {
    totalChecked: number;
    passed: number;
    failed: number;
  };
}

export interface AutoLayoutLintResult {
  issues: LintIssue[];
  summary: {
    totalFrames: number;
    withAutoLayout: number;
    withoutAutoLayout: number;
    percentage: number;
  };
}

/**
 * Allowed spacing scale — standard 4px/8px grid values.
 */
export const SPACING_SCALE = [0, 2, 4, 8, 12, 16, 20, 24, 32, 40, 48, 64, 80, 96] as const;

/**
 * Find the closest values from the spacing scale to a given value.
 */
export function findClosestSpacingValues(value: number): number[] {
  if (SPACING_SCALE.includes(value as typeof SPACING_SCALE[number])) return [];

  const sorted = [...SPACING_SCALE]
    .map(v => ({ v, diff: Math.abs(v - value) }))
    .sort((a, b) => a.diff - b.diff);

  // Return the two closest distinct values
  const closest: number[] = [];
  for (const s of sorted) {
    if (closest.length >= 2) break;
    if (!closest.includes(s.v)) closest.push(s.v);
  }
  return closest.sort((a, b) => a - b);
}
