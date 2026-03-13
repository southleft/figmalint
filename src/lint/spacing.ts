/// <reference types="@figma/plugin-typings" />

import { LintIssue, SpacingLintResult, DEFAULT_SPACING_SCALE, findClosestSpacingValues } from './types';

let issueCounter = 0;
function nextId(): string {
  return `spacing-${++issueCounter}`;
}

/** Module-level scale, set per checkSpacing call */
let activeScale: readonly number[] = DEFAULT_SPACING_SCALE;

/**
 * Check if a spacing value is in the active scale.
 */
function isValidSpacing(value: number): boolean {
  return activeScale.includes(value);
}

/**
 * Build a human-readable label for a spacing property.
 */
function spacingLabel(property: string): string {
  const map: Record<string, string> = {
    itemSpacing: 'Gap',
    paddingTop: 'Padding Top',
    paddingBottom: 'Padding Bottom',
    paddingLeft: 'Padding Left',
    paddingRight: 'Padding Right',
    counterAxisSpacing: 'Counter-axis Gap',
  };
  return map[property] || property;
}

/**
 * Check spacing values on a single auto-layout frame.
 */
function checkFrameSpacing(node: FrameNode | ComponentNode | InstanceNode, issues: LintIssue[]): number {
  // Only check auto-layout frames
  if (node.layoutMode === 'NONE') return 0;

  let checked = 0;
  const spacingProperties: Array<{ prop: string; value: number }> = [
    { prop: 'itemSpacing', value: node.itemSpacing },
    { prop: 'paddingTop', value: node.paddingTop },
    { prop: 'paddingBottom', value: node.paddingBottom },
    { prop: 'paddingLeft', value: node.paddingLeft },
    { prop: 'paddingRight', value: node.paddingRight },
  ];

  // Check counterAxisSpacing if applicable (wrap mode)
  if ('counterAxisSpacing' in node && typeof (node as any).counterAxisSpacing === 'number') {
    spacingProperties.push({
      prop: 'counterAxisSpacing',
      value: (node as any).counterAxisSpacing,
    });
  }

  for (const { prop, value } of spacingProperties) {
    checked++;

    if (!isValidSpacing(value)) {
      const suggestions = findClosestSpacingValues(value, activeScale);
      issues.push({
        id: nextId(),
        type: 'spacing',
        severity: 'warning',
        nodeId: node.id,
        nodeName: node.name,
        message: `${spacingLabel(prop)} is ${value}px — not in spacing scale`,
        currentValue: `${value}px`,
        suggestions: suggestions.map(s => `${s}px`),
        autoFixable: true,
        fixAction: {
          type: 'fixSpacing',
          params: {
            nodeId: node.id,
            property: prop,
            currentValue: value,
            suggestedValue: suggestions[0] ?? value,
          },
        },
      });
    }
  }

  return checked;
}

/**
 * Recursively traverse nodes and check spacing on auto-layout frames.
 */
function traverseForSpacing(
  node: SceneNode,
  issues: LintIssue[],
  skipLocked: boolean,
  skipHidden: boolean,
  parentLocked: boolean
): { checked: number; passed: number } {
  const isLocked = parentLocked || ('locked' in node && (node as any).locked);
  const isHidden = 'visible' in node && !node.visible;

  if (skipLocked && isLocked) return { checked: 0, passed: 0 };
  if (skipHidden && isHidden) return { checked: 0, passed: 0 };

  let checked = 0;
  let passed = 0;

  // Check spacing if it's a frame-like node with auto-layout
  if (node.type === 'FRAME' || node.type === 'COMPONENT' || node.type === 'INSTANCE') {
    const preLen = issues.length;
    const count = checkFrameSpacing(node as FrameNode, issues);
    checked += count;
    passed += count - (issues.length - preLen);
  }

  // Recurse into children
  if ('children' in node) {
    for (const child of (node as any).children as SceneNode[]) {
      const sub = traverseForSpacing(child, issues, skipLocked, skipHidden, isLocked);
      checked += sub.checked;
      passed += sub.passed;
    }
  }

  return { checked, passed };
}

/**
 * Run spacing rhythm lint on the given nodes.
 * Checks itemSpacing, padding values against the spacing scale.
 * @param scale Custom spacing scale — defaults to DEFAULT_SPACING_SCALE
 */
export function checkSpacing(
  nodes: readonly SceneNode[],
  options: { skipLocked?: boolean; skipHidden?: boolean; scale?: readonly number[] } = {}
): SpacingLintResult {
  const { skipLocked = true, skipHidden = true, scale } = options;
  activeScale = scale || DEFAULT_SPACING_SCALE;
  issueCounter = 0;

  const issues: LintIssue[] = [];
  let totalChecked = 0;
  let totalPassed = 0;

  for (const node of nodes) {
    const { checked, passed } = traverseForSpacing(node, issues, skipLocked, skipHidden, false);
    totalChecked += checked;
    totalPassed += passed;
  }

  return {
    issues,
    summary: {
      totalChecked,
      passed: totalPassed,
      failed: issues.length,
    },
  };
}
