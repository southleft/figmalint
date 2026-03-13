/// <reference types="@figma/plugin-typings" />

import { LintIssue } from './types';
import { getLuminance, getContrastRatio, findBackgroundColor } from '../utils/figma-helpers';

let issueCounter = 0;
function nextId(): string {
  return `a11y-${++issueCounter}`;
}

// ──────────────────────────────────────────────
// Interactive detection patterns
// ──────────────────────────────────────────────

const INTERACTIVE_PATTERNS = /\b(button|btn|input|link|checkbox|toggle|switch|tab|radio|select|dropdown|menu-item|slider|chip)\b/i;

function isInteractiveName(name: string): boolean {
  return INTERACTIVE_PATTERNS.test(name);
}

const GENERIC_NAME_PATTERN = /^(Frame|Group|Rectangle|Ellipse|Vector|Line|Polygon|Star)\s*\d+$/i;

// ──────────────────────────────────────────────
// Tier 1: Visual checks
// ──────────────────────────────────────────────

function checkContrastRatio(node: SceneNode, issues: LintIssue[]): void {
  if (node.type !== 'TEXT') return;
  const textNode = node as TextNode;

  // Get text fill color
  const fills = textNode.fills;
  if (fills === figma.mixed || !Array.isArray(fills)) return;

  const textFill = fills.find((f: Paint) =>
    f.type === 'SOLID' && f.visible !== false && (f as SolidPaint).color &&
    !(f as any).boundVariables?.color
  );
  if (!textFill || textFill.type !== 'SOLID') return;

  const bgColor = findBackgroundColor(node);
  if (!bgColor) return;

  const textColor = (textFill as SolidPaint).color;
  const textLum = getLuminance(textColor.r, textColor.g, textColor.b);
  const bgLum = getLuminance(bgColor.r, bgColor.g, bgColor.b);
  const ratio = getContrastRatio(textLum, bgLum);

  // Determine if large text (>= 18px or >= 14px bold)
  const fontSize = textNode.fontSize !== figma.mixed ? textNode.fontSize : 0;
  const fontWeight = textNode.fontName !== figma.mixed ? (textNode.fontName as FontName).style : '';
  const isBold = fontWeight.toLowerCase().includes('bold') || fontWeight.toLowerCase().includes('black');
  const isLargeText = fontSize >= 18 || (fontSize >= 14 && isBold);
  const threshold = isLargeText ? 3 : 4.5;

  if (ratio < threshold) {
    const ratioStr = ratio.toFixed(1);
    issues.push({
      id: nextId(),
      type: 'accessibility',
      severity: 'critical',
      nodeId: node.id,
      nodeName: node.name,
      message: `Contrast ratio ${ratioStr}:1 below WCAG AA ${isLargeText ? 'large text' : ''} minimum of ${threshold}:1`,
      currentValue: `${ratioStr}:1`,
      suggestions: [`Increase contrast to at least ${threshold}:1`],
      autoFixable: false,
    });
  }
}

function checkTouchTarget(node: SceneNode, issues: LintIssue[]): void {
  if (node.type !== 'FRAME' && node.type !== 'COMPONENT' && node.type !== 'INSTANCE') return;
  if (!isInteractiveName(node.name)) return;

  const width = node.width;
  const height = node.height;

  if (width < 44 || height < 44) {
    issues.push({
      id: nextId(),
      type: 'accessibility',
      severity: 'warning',
      nodeId: node.id,
      nodeName: node.name,
      message: `Touch target ${Math.round(width)}x${Math.round(height)}px is below 44x44px recommended minimum`,
      currentValue: `${Math.round(width)}x${Math.round(height)}px`,
      suggestions: ['Increase to at least 44x44px'],
      autoFixable: false,
    });
  }
}

function checkMinTextSize(node: SceneNode, issues: LintIssue[]): void {
  if (node.type !== 'TEXT') return;
  const textNode = node as TextNode;
  const fontSize = textNode.fontSize;
  if (fontSize === figma.mixed || typeof fontSize !== 'number') return;

  if (fontSize > 0 && fontSize < 12) {
    issues.push({
      id: nextId(),
      type: 'accessibility',
      severity: 'warning',
      nodeId: node.id,
      nodeName: node.name,
      message: `Text size ${fontSize}px is below 12px readability minimum`,
      currentValue: `${fontSize}px`,
      suggestions: ['12px', '14px'],
      autoFixable: false,
    });
  }
}

// ──────────────────────────────────────────────
// Tier 2: Naming checks
// ──────────────────────────────────────────────

function checkIconOnlyWithoutLabel(node: SceneNode, issues: LintIssue[]): void {
  if (node.type !== 'COMPONENT' && node.type !== 'INSTANCE') return;
  if (!isInteractiveName(node.name)) return;

  const frame = node as ComponentNode | InstanceNode;
  if (!('children' in frame) || frame.children.length === 0) return;

  const hasText = frame.children.some(child => {
    if (child.type === 'TEXT') return true;
    if ('children' in child) {
      return (child as any).children?.some?.((c: SceneNode) => c.type === 'TEXT');
    }
    return false;
  });

  if (!hasText) {
    issues.push({
      id: nextId(),
      type: 'accessibility',
      severity: 'warning',
      nodeId: node.id,
      nodeName: node.name,
      message: `Interactive element "${node.name}" has no visible text label`,
      currentValue: 'No text child',
      suggestions: ['Add a text label or ensure screen reader label is provided'],
      autoFixable: false,
    });
  }
}

function checkGenericLayerNames(node: SceneNode, issues: LintIssue[]): void {
  if (node.type !== 'FRAME' && node.type !== 'COMPONENT' && node.type !== 'INSTANCE') return;
  if (!('children' in node) || (node as any).children.length === 0) return;

  if (GENERIC_NAME_PATTERN.test(node.name)) {
    issues.push({
      id: nextId(),
      type: 'accessibility',
      severity: 'info',
      nodeId: node.id,
      nodeName: node.name,
      message: `Generic layer name "${node.name}" — use a descriptive name`,
      currentValue: node.name,
      suggestions: ['Rename to describe the layer purpose'],
      autoFixable: false,
    });
  }
}

// ──────────────────────────────────────────────
// Tier 2.5: Non-text contrast (WCAG 1.4.11)
// ──────────────────────────────────────────────

function checkNonTextContrast(node: SceneNode, issues: LintIssue[]): void {
  // Only check interactive-looking component/instance nodes
  if (node.type !== 'COMPONENT' && node.type !== 'INSTANCE') return;
  if (!isInteractiveName(node.name)) return;

  const frame = node as ComponentNode | InstanceNode;

  // Find boundary color: outermost visible fill or stroke
  let boundaryColor: { r: number; g: number; b: number } | null = null;

  // Check strokes first (more likely to be the boundary)
  const strokes = frame.strokes;
  if (Array.isArray(strokes)) {
    const visibleStroke = strokes.find((s: Paint) => s.type === 'SOLID' && s.visible !== false);
    if (visibleStroke && visibleStroke.type === 'SOLID') {
      boundaryColor = (visibleStroke as SolidPaint).color;
    }
  }

  // Fall back to fills if no stroke
  if (!boundaryColor) {
    const fills = frame.fills;
    if (fills !== figma.mixed && Array.isArray(fills)) {
      const visibleFill = fills.find((f: Paint) => f.type === 'SOLID' && f.visible !== false);
      if (visibleFill && visibleFill.type === 'SOLID') {
        boundaryColor = (visibleFill as SolidPaint).color;
      }
    }
  }

  if (!boundaryColor) return;

  const bgColor = findBackgroundColor(node);
  if (!bgColor) return;

  const boundaryLum = getLuminance(boundaryColor.r, boundaryColor.g, boundaryColor.b);
  const bgLum = getLuminance(bgColor.r, bgColor.g, bgColor.b);
  const ratio = getContrastRatio(boundaryLum, bgLum);

  if (ratio < 3) {
    issues.push({
      id: nextId(),
      type: 'accessibility',
      severity: 'warning',
      nodeId: node.id,
      nodeName: node.name,
      message: `Non-text contrast ${ratio.toFixed(1)}:1 below WCAG 1.4.11 minimum of 3:1`,
      currentValue: `${ratio.toFixed(1)}:1`,
      suggestions: ['Increase boundary contrast to at least 3:1 against background'],
      autoFixable: false,
    });
  }
}

// ──────────────────────────────────────────────
// Tier 2.5: Color-only information (WCAG 1.4.1 heuristic)
// ──────────────────────────────────────────────

const STATUS_NAME_PATTERN = /\b(error|success|warning|status|alert|badge|danger|info)\b/i;

function checkColorOnlyInfo(node: SceneNode, issues: LintIssue[]): void {
  if (node.type !== 'FRAME' && node.type !== 'COMPONENT' && node.type !== 'INSTANCE') return;
  if (!STATUS_NAME_PATTERN.test(node.name)) return;

  const frame = node as FrameNode | ComponentNode | InstanceNode;
  if (!('children' in frame) || frame.children.length === 0) return;

  // Check if there's a text node or icon child
  const hasTextOrIcon = frame.children.some(child => {
    if (child.type === 'TEXT') return true;
    if (/icon|svg|symbol|glyph/i.test(child.name)) return true;
    if ('children' in child) {
      return (child as any).children?.some?.((c: SceneNode) =>
        c.type === 'TEXT' || /icon|svg|symbol|glyph/i.test(c.name)
      );
    }
    return false;
  });

  if (!hasTextOrIcon) {
    issues.push({
      id: nextId(),
      type: 'accessibility',
      severity: 'info',
      nodeId: node.id,
      nodeName: node.name,
      message: `"${node.name}" may rely on color alone to convey status (WCAG 1.4.1)`,
      currentValue: 'No text or icon indicator',
      suggestions: ['Add a text label or icon to supplement the color indicator'],
      autoFixable: false,
    });
  }
}

// ──────────────────────────────────────────────
// Tier 3: State coverage
// ──────────────────────────────────────────────

function checkStateCoverage(node: SceneNode, issues: LintIssue[]): void {
  if (node.type !== 'COMPONENT') return;
  const parent = node.parent;
  if (!parent || parent.type !== 'COMPONENT_SET') return;

  const componentSet = parent as ComponentSetNode;
  const siblingNames = componentSet.children.map(c => c.name.toLowerCase());
  const allNames = siblingNames.join(' ');

  const requiredStates = ['hover', 'focus', 'disabled', 'pressed'];
  const missing = requiredStates.filter(state => !allNames.includes(state));

  if (missing.length > 0) {
    issues.push({
      id: nextId(),
      type: 'accessibility',
      severity: 'info',
      nodeId: node.id,
      nodeName: node.name,
      message: `Component set missing states: ${missing.join(', ')}`,
      currentValue: `${componentSet.children.length} variants`,
      suggestions: missing.map(s => `Add ${s} variant`),
      autoFixable: false,
    });
  }
}

// ──────────────────────────────────────────────
// Recursive traversal
// ──────────────────────────────────────────────

function traverseForAccessibility(
  node: SceneNode,
  issues: LintIssue[],
  skipLocked: boolean,
  skipHidden: boolean,
  parentLocked: boolean,
  seenComponentSets: Set<string>
): number {
  const isLocked = parentLocked || ('locked' in node && (node as any).locked);
  const isHidden = 'visible' in node && !node.visible;

  if (skipLocked && isLocked) return 0;
  if (skipHidden && isHidden) return 0;

  let checked = 0;

  // Tier 1: Visual checks
  checkContrastRatio(node, issues);
  checkTouchTarget(node, issues);
  checkMinTextSize(node, issues);
  checked++;

  // Tier 2: Naming checks
  checkIconOnlyWithoutLabel(node, issues);
  checkGenericLayerNames(node, issues);

  // Tier 2.5: New WCAG checks
  checkNonTextContrast(node, issues);
  checkColorOnlyInfo(node, issues);

  // Tier 3: State coverage (only check once per component set)
  if (node.type === 'COMPONENT' && node.parent?.type === 'COMPONENT_SET') {
    const setId = node.parent.id;
    if (!seenComponentSets.has(setId)) {
      seenComponentSets.add(setId);
      checkStateCoverage(node, issues);
    }
  }

  // Recurse into children
  if ('children' in node) {
    for (const child of (node as any).children as SceneNode[]) {
      checked += traverseForAccessibility(child, issues, skipLocked, skipHidden, isLocked, seenComponentSets);
    }
  }

  return checked;
}

// ──────────────────────────────────────────────
// Public API
// ──────────────────────────────────────────────

export interface AccessibilityLintResult {
  issues: LintIssue[];
  summary: {
    totalChecked: number;
    contrastIssues: number;
    touchTargetIssues: number;
    textSizeIssues: number;
    namingIssues: number;
    stateIssues: number;
    nonTextContrastIssues: number;
    colorOnlyIssues: number;
  };
}

/**
 * Run accessibility lint checks on the given nodes.
 * Checks: contrast ratio (WCAG AA), touch targets (44px), text size (12px min),
 * icon-only without label, generic names, missing component states.
 */
export function checkAccessibility(
  nodes: readonly SceneNode[],
  options: { skipLocked?: boolean; skipHidden?: boolean } = {}
): AccessibilityLintResult {
  const { skipLocked = true, skipHidden = true } = options;
  issueCounter = 0;

  const issues: LintIssue[] = [];
  const seenComponentSets = new Set<string>();
  let totalChecked = 0;

  for (const node of nodes) {
    totalChecked += traverseForAccessibility(node, issues, skipLocked, skipHidden, false, seenComponentSets);
  }

  return {
    issues,
    summary: {
      totalChecked,
      contrastIssues: issues.filter(i => i.message.includes('Contrast')).length,
      touchTargetIssues: issues.filter(i => i.message.includes('Touch target')).length,
      textSizeIssues: issues.filter(i => i.message.includes('Text size')).length,
      namingIssues: issues.filter(i => i.message.includes('text label') || i.message.includes('Generic')).length,
      stateIssues: issues.filter(i => i.message.includes('missing states')).length,
      nonTextContrastIssues: issues.filter(i => i.message.includes('Non-text contrast')).length,
      colorOnlyIssues: issues.filter(i => i.message.includes('color alone')).length,
    },
  };
}
