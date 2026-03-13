/// <reference types="@figma/plugin-typings" />

import { LintError, LintErrorType, LintResult, LintSettings, LintSummary } from '../types';
import { rgbToHex } from '../utils/figma-helpers';
import { checkSpacing } from '../lint/spacing';
import { checkAutoLayout } from '../lint/auto-layout';

// ──────────────────────────────────────────────
// Default lint settings
// ──────────────────────────────────────────────

export const DEFAULT_LINT_SETTINGS: LintSettings = {
  checkFills: true,
  checkStrokes: true,
  checkEffects: true,
  checkTextStyles: true,
  checkRadius: true,
  checkSpacing: true,
  checkAutoLayout: true,
  allowedRadii: [0, 2, 4, 8, 12, 16, 24, 32],
  skipLockedLayers: true,
  skipHiddenLayers: true,
};

// ──────────────────────────────────────────────
// Ignored errors storage (per-document)
// ──────────────────────────────────────────────

let ignoredNodeIds: Set<string> = new Set();
let ignoredErrorKeys: Set<string> = new Set();

function errorKey(nodeId: string, errorType: LintErrorType): string {
  return `${nodeId}::${errorType}`;
}

export function ignoreNode(nodeId: string): void {
  ignoredNodeIds.add(nodeId);
}

export function ignoreError(nodeId: string, errorType: LintErrorType): void {
  ignoredErrorKeys.add(errorKey(nodeId, errorType));
}

export function ignoreAllOfType(errors: LintError[], errorType: LintErrorType): void {
  for (const err of errors) {
    if (err.errorType === errorType) {
      ignoredErrorKeys.add(errorKey(err.nodeId, err.errorType));
    }
  }
}

export function clearIgnored(): void {
  ignoredNodeIds.clear();
  ignoredErrorKeys.clear();
}

export function getIgnoredState(): { nodeIds: string[]; errorKeys: string[] } {
  return {
    nodeIds: Array.from(ignoredNodeIds),
    errorKeys: Array.from(ignoredErrorKeys),
  };
}

export function restoreIgnoredState(state: { nodeIds: string[]; errorKeys: string[] }): void {
  ignoredNodeIds = new Set(state.nodeIds);
  ignoredErrorKeys = new Set(state.errorKeys);
}

// ──────────────────────────────────────────────
// Color / gradient formatting helpers
// ──────────────────────────────────────────────

function determineFill(paint: Paint): string {
  if (paint.type === 'SOLID') {
    const { r, g, b } = paint.color;
    const hex = rgbToHex(r, g, b);
    const opacity = paint.opacity !== undefined && paint.opacity < 1
      ? ` (${Math.round(paint.opacity * 100)}%)`
      : '';
    return hex + opacity;
  }
  if (paint.type === 'IMAGE') return 'Image fill';
  if (paint.type === 'VIDEO') return 'Video fill';
  if (paint.type.includes('GRADIENT')) return `${paint.type.replace('GRADIENT_', '').toLowerCase()} gradient`;
  return paint.type;
}

// ──────────────────────────────────────────────
// Core lint check functions
// ──────────────────────────────────────────────

function hasBoundVariable(node: SceneNode, property: string): boolean {
  try {
    if ('boundVariables' in node) {
      const bound = (node as any).boundVariables;
      if (bound && bound[property]) return true;
    }
  } catch {
    // ignore
  }
  return false;
}

function checkFills(node: SceneNode, errors: LintError[], path: string): void {
  if (!('fills' in node)) return;
  const fills = node.fills;
  if (fills === figma.mixed || !Array.isArray(fills)) return;

  const visibleFills = fills.filter((f: Paint) => f.visible !== false);
  if (visibleFills.length === 0) return;

  // Skip if fills are bound to a variable
  if (hasBoundVariable(node, 'fills')) return;

  // Check if node has a fill style applied
  if ('fillStyleId' in node) {
    const styleId = (node as any).fillStyleId;
    if (styleId && styleId !== '' && styleId !== figma.mixed) return; // Has a style applied
  }

  // No style applied — flag each visible fill
  for (const fill of visibleFills) {
    const value = determineFill(fill);
    errors.push({
      nodeId: node.id,
      nodeName: node.name,
      nodeType: node.type,
      errorType: 'fill',
      message: `Missing fill style: ${value}`,
      value,
      path,
    });
  }
}

function checkStrokes(node: SceneNode, errors: LintError[], path: string): void {
  if (!('strokes' in node)) return;
  const strokes = (node as any).strokes as Paint[];
  if (!Array.isArray(strokes)) return;

  const visibleStrokes = strokes.filter((s: Paint) => s.visible !== false);
  if (visibleStrokes.length === 0) return;

  if (hasBoundVariable(node, 'strokes')) return;

  if ('strokeStyleId' in node) {
    const styleId = (node as any).strokeStyleId;
    if (styleId && styleId !== '' && styleId !== figma.mixed) return;
  }

  for (const stroke of visibleStrokes) {
    const value = determineFill(stroke);
    const weight = ('strokeWeight' in node) ? ` (${(node as any).strokeWeight}px)` : '';
    errors.push({
      nodeId: node.id,
      nodeName: node.name,
      nodeType: node.type,
      errorType: 'stroke',
      message: `Missing stroke style: ${value}${weight}`,
      value: value + weight,
      path,
    });
  }
}

function checkEffects(node: SceneNode, errors: LintError[], path: string): void {
  if (!('effects' in node)) return;
  const effects = (node as any).effects as Effect[];
  if (!Array.isArray(effects) || effects.length === 0) return;

  const visibleEffects = effects.filter((e: Effect) => (e as any).visible !== false);
  if (visibleEffects.length === 0) return;

  if ('effectStyleId' in node) {
    const styleId = (node as any).effectStyleId;
    if (styleId && styleId !== '' && styleId !== figma.mixed) return;
  }

  const descriptions = visibleEffects.map((e: Effect) => {
    const parts: string[] = [e.type.replace(/_/g, ' ').toLowerCase()];
    if ('radius' in e) parts.push(`r:${(e as any).radius}`);
    if ('color' in e && (e as any).color) {
      const c = (e as any).color;
      parts.push(rgbToHex(c.r, c.g, c.b));
    }
    return parts.join(' ');
  });

  errors.push({
    nodeId: node.id,
    nodeName: node.name,
    nodeType: node.type,
    errorType: 'effect',
    message: `Missing effect style: ${descriptions.join(', ')}`,
    value: descriptions.join(', '),
    path,
  });
}

function checkTextStyle(node: TextNode, errors: LintError[], path: string): void {
  if ('textStyleId' in node) {
    const styleId = (node as any).textStyleId;
    if (styleId && styleId !== '' && styleId !== figma.mixed) return;
  }

  // Build a description of the text properties
  const fontName = node.fontName !== figma.mixed ? (node.fontName as FontName) : null;
  const fontSize = node.fontSize !== figma.mixed ? node.fontSize : null;

  const parts: string[] = [];
  if (fontName) parts.push(`${fontName.family} ${fontName.style}`);
  if (fontSize) parts.push(`${fontSize}px`);
  const value = parts.join(' / ') || 'unknown text style';

  errors.push({
    nodeId: node.id,
    nodeName: node.name,
    nodeType: node.type,
    errorType: 'text',
    message: `Missing text style: ${value}`,
    value,
    path,
  });
}

function checkRadius(node: SceneNode, errors: LintError[], path: string, allowedRadii: number[]): void {
  if (!('cornerRadius' in node)) return;

  // Skip if bound to a variable
  if (hasBoundVariable(node, 'topLeftRadius') || hasBoundVariable(node, 'cornerRadius')) return;

  const cr = (node as any).cornerRadius;

  if (cr === figma.mixed) {
    // Check individual corners
    const corners = [
      (node as any).topLeftRadius,
      (node as any).topRightRadius,
      (node as any).bottomLeftRadius,
      (node as any).bottomRightRadius,
    ].filter((v: any) => v !== undefined && v !== null);

    for (const c of corners) {
      if (!allowedRadii.includes(c)) {
        errors.push({
          nodeId: node.id,
          nodeName: node.name,
          nodeType: node.type,
          errorType: 'radius',
          message: `Non-standard border radius: ${c}px (allowed: ${allowedRadii.join(', ')})`,
          value: `${c}px`,
          path,
        });
        break; // one error per node
      }
    }
    return;
  }

  if (typeof cr === 'number' && cr > 0 && !allowedRadii.includes(cr)) {
    errors.push({
      nodeId: node.id,
      nodeName: node.name,
      nodeType: node.type,
      errorType: 'radius',
      message: `Non-standard border radius: ${cr}px (allowed: ${allowedRadii.join(', ')})`,
      value: `${cr}px`,
      path,
    });
  }
}

// ──────────────────────────────────────────────
// Node type routing
// ──────────────────────────────────────────────

function lintNode(node: SceneNode, settings: LintSettings, errors: LintError[], path: string): void {
  // Skip groups, slices, connectors — their styles apply to children
  if (node.type === 'GROUP' || node.type === 'SLICE' || node.type === 'CONNECTOR') return;
  // Skip component sets — they are containers of variants
  if (node.type === 'COMPONENT_SET') return;

  switch (node.type) {
    case 'TEXT':
      if (settings.checkTextStyles) checkTextStyle(node as TextNode, errors, path);
      if (settings.checkFills) checkFills(node, errors, path);
      break;

    case 'FRAME':
    case 'SECTION':
      if (settings.checkFills) checkFills(node, errors, path);
      if (settings.checkStrokes) checkStrokes(node, errors, path);
      if (settings.checkEffects) checkEffects(node, errors, path);
      if (settings.checkRadius) checkRadius(node, errors, path, settings.allowedRadii);
      break;

    case 'RECTANGLE':
    case 'COMPONENT':
    case 'INSTANCE':
      if (settings.checkFills) checkFills(node, errors, path);
      if (settings.checkStrokes) checkStrokes(node, errors, path);
      if (settings.checkEffects) checkEffects(node, errors, path);
      if (settings.checkRadius) checkRadius(node, errors, path, settings.allowedRadii);
      break;

    case 'ELLIPSE':
    case 'POLYGON':
    case 'STAR':
    case 'VECTOR':
    case 'LINE':
    case 'BOOLEAN_OPERATION':
      if (settings.checkFills) checkFills(node, errors, path);
      if (settings.checkStrokes) checkStrokes(node, errors, path);
      if (settings.checkEffects) checkEffects(node, errors, path);
      break;
  }
}

// ──────────────────────────────────────────────
// Recursive traversal
// ──────────────────────────────────────────────

function traverseAndLint(
  node: SceneNode,
  settings: LintSettings,
  errors: LintError[],
  parentPath: string,
  parentLocked: boolean
): number {
  let count = 0;
  const isLocked = parentLocked || ('locked' in node && (node as any).locked);
  const isHidden = 'visible' in node && !node.visible;

  if (settings.skipLockedLayers && isLocked) return 0;
  if (settings.skipHiddenLayers && isHidden) return 0;

  const path = parentPath ? `${parentPath} > ${node.name}` : node.name;
  count++;

  // Check if node or error is ignored
  if (!ignoredNodeIds.has(node.id)) {
    const preLen = errors.length;
    lintNode(node, settings, errors, path);

    // Filter out ignored error keys
    for (let i = errors.length - 1; i >= preLen; i--) {
      if (ignoredErrorKeys.has(errorKey(errors[i].nodeId, errors[i].errorType))) {
        errors.splice(i, 1);
      }
    }
  }

  // Recurse into children
  if ('children' in node) {
    for (const child of (node as any).children) {
      count += traverseAndLint(child, settings, errors, path, isLocked);
    }
  }

  return count;
}

// ──────────────────────────────────────────────
// Public API
// ──────────────────────────────────────────────

/**
 * Run deterministic design lint on selected nodes.
 * No AI required — checks fills, strokes, effects, text styles, and border radius
 * against applied Figma styles and variables.
 */
export function runDesignLint(
  nodes: readonly SceneNode[],
  settings: LintSettings = DEFAULT_LINT_SETTINGS
): LintResult {
  const errors: LintError[] = [];
  let totalNodes = 0;

  for (const node of nodes) {
    totalNodes += traverseAndLint(node, settings, errors, '', false);
  }

  // Run new spacing and auto-layout checks
  const skipOpts = { skipLocked: settings.skipLockedLayers, skipHidden: settings.skipHiddenLayers };

  if (settings.checkSpacing) {
    const spacingResult = checkSpacing(nodes, skipOpts);
    for (const issue of spacingResult.issues) {
      errors.push({
        nodeId: issue.nodeId,
        nodeName: issue.nodeName,
        nodeType: 'FRAME',
        errorType: 'spacing',
        message: issue.message,
        value: issue.currentValue || '',
        path: issue.nodeName,
      });
    }
  }

  if (settings.checkAutoLayout) {
    const autoLayoutResult = checkAutoLayout(nodes, skipOpts);
    for (const issue of autoLayoutResult.issues) {
      errors.push({
        nodeId: issue.nodeId,
        nodeName: issue.nodeName,
        nodeType: 'FRAME',
        errorType: 'autoLayout',
        message: issue.message,
        value: issue.currentValue || '',
        path: issue.nodeName,
      });
    }
  }

  // Count unique nodes with errors
  const nodesWithErrors = new Set(errors.map(e => e.nodeId)).size;

  // Build summary
  const byType: Record<LintErrorType, number> = { fill: 0, stroke: 0, effect: 0, text: 0, radius: 0, spacing: 0, autoLayout: 0 };
  for (const err of errors) {
    byType[err.errorType]++;
  }

  const summary: LintSummary = {
    totalErrors: errors.length,
    byType,
    totalNodes,
    nodesWithErrors,
  };

  return {
    errors,
    ignoredNodeIds: Array.from(ignoredNodeIds),
    ignoredErrorKeys: Array.from(ignoredErrorKeys),
    summary,
  };
}

/**
 * Run lint on current page selection.
 */
export function lintSelection(settings?: LintSettings): LintResult {
  const selection = figma.currentPage.selection;
  if (selection.length === 0) {
    return {
      errors: [],
      ignoredNodeIds: [],
      ignoredErrorKeys: [],
      summary: { totalErrors: 0, byType: { fill: 0, stroke: 0, effect: 0, text: 0, radius: 0, spacing: 0, autoLayout: 0 }, totalNodes: 0, nodesWithErrors: 0 },
    };
  }
  return runDesignLint(selection, settings);
}

/**
 * Find all nodes with the same raw value (for "Select All" bulk fix).
 */
export function findNodesWithSameValue(
  rootNodes: readonly SceneNode[],
  errorType: LintErrorType,
  value: string,
  settings: LintSettings = DEFAULT_LINT_SETTINGS
): LintError[] {
  const result = runDesignLint(rootNodes, settings);
  return result.errors.filter(e => e.errorType === errorType && e.value === value);
}
