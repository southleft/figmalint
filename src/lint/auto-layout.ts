/// <reference types="@figma/plugin-typings" />

import { LintIssue, AutoLayoutLintResult } from './types';

let issueCounter = 0;
function nextId(): string {
  return `autolayout-${++issueCounter}`;
}

/**
 * Recursively traverse nodes and check for auto-layout presence on frames.
 * Only checks frames that have children (containers).
 */
function traverseForAutoLayout(
  node: SceneNode,
  issues: LintIssue[],
  skipLocked: boolean,
  skipHidden: boolean,
  parentLocked: boolean
): { totalFrames: number; withAutoLayout: number } {
  const isLocked = parentLocked || ('locked' in node && (node as any).locked);
  const isHidden = 'visible' in node && !node.visible;

  if (skipLocked && isLocked) return { totalFrames: 0, withAutoLayout: 0 };
  if (skipHidden && isHidden) return { totalFrames: 0, withAutoLayout: 0 };

  let totalFrames = 0;
  let withAutoLayout = 0;

  // Check if this is a frame-like container with children
  const isFrameLike = node.type === 'FRAME' || node.type === 'COMPONENT' || node.type === 'INSTANCE';

  if (isFrameLike && 'children' in node) {
    const children = (node as FrameNode).children;

    // Only flag frames that have 2+ children — single-child frames don't need auto-layout
    if (children.length >= 2) {
      totalFrames++;
      const frameNode = node as FrameNode;

      if (frameNode.layoutMode !== 'NONE') {
        withAutoLayout++;
      } else {
        issues.push({
          id: nextId(),
          type: 'autoLayout',
          severity: 'warning',
          nodeId: node.id,
          nodeName: node.name,
          message: `Frame "${node.name}" has ${children.length} children but no Auto Layout`,
          currentValue: 'No Auto Layout',
          suggestions: ['HORIZONTAL', 'VERTICAL'],
          autoFixable: false, // Converting to auto-layout can break designs
        });
      }
    }
  }

  // Recurse into children
  if ('children' in node) {
    for (const child of (node as any).children as SceneNode[]) {
      const sub = traverseForAutoLayout(child, issues, skipLocked, skipHidden, isLocked);
      totalFrames += sub.totalFrames;
      withAutoLayout += sub.withAutoLayout;
    }
  }

  return { totalFrames, withAutoLayout };
}

/**
 * Run auto-layout presence check on the given nodes.
 * Flags frames with 2+ children that don't use auto-layout.
 */
export function checkAutoLayout(
  nodes: readonly SceneNode[],
  options: { skipLocked?: boolean; skipHidden?: boolean } = {}
): AutoLayoutLintResult {
  const { skipLocked = true, skipHidden = true } = options;
  issueCounter = 0;

  const issues: LintIssue[] = [];
  let totalFrames = 0;
  let withAutoLayout = 0;

  for (const node of nodes) {
    const sub = traverseForAutoLayout(node, issues, skipLocked, skipHidden, false);
    totalFrames += sub.totalFrames;
    withAutoLayout += sub.withAutoLayout;
  }

  const withoutAutoLayout = totalFrames - withAutoLayout;
  const percentage = totalFrames > 0 ? Math.round((withAutoLayout / totalFrames) * 100) : 100;

  return {
    issues,
    summary: {
      totalFrames,
      withAutoLayout,
      withoutAutoLayout,
      percentage,
    },
  };
}
