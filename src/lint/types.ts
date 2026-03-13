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
 * Default spacing scale — standard 4px/8px grid values.
 * Can be overridden via TeamLintConfig.scales.spacing.
 */
export const DEFAULT_SPACING_SCALE: readonly number[] = [0, 2, 4, 8, 12, 16, 20, 24, 32, 40, 48, 64, 80, 96];

/** @deprecated Use DEFAULT_SPACING_SCALE */
export const SPACING_SCALE = DEFAULT_SPACING_SCALE;

/**
 * Find the closest values from a spacing scale to a given value.
 */
export function findClosestSpacingValues(value: number, scale: readonly number[] = DEFAULT_SPACING_SCALE): number[] {
  if (scale.includes(value)) return [];

  const sorted = [...scale]
    .map(v => ({ v, diff: Math.abs(v - value) }))
    .sort((a, b) => a.diff - b.diff);

  const closest: number[] = [];
  for (const s of sorted) {
    if (closest.length >= 2) break;
    if (!closest.includes(s.v)) closest.push(s.v);
  }
  return closest.sort((a, b) => a - b);
}
