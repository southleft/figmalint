/// <reference types="@figma/plugin-typings" />

import { applyFillStyle, applyStrokeStyle, applyTextStyle, applyEffectStyle, type StyleFixResult } from './apply-style';
import { fixSpacing, fixSpacingToNearest, type SpacingFixResult } from './fix-spacing';
import { fixRadiusToNearest, type RadiusFixResult } from './fix-radius';
import { renameLayerById, type RenameResult } from './rename-layer';

// ──────────────────────────────────────────────
// Batch Fix Types
// ──────────────────────────────────────────────

export type FixActionType = 'applyStyle' | 'fixSpacing' | 'renameLayer' | 'fixSpacingToNearest' | 'fixRadiusToNearest';

export interface BatchFixAction {
  type: FixActionType;
  params: Record<string, unknown>;
}

export interface BatchFixItemResult {
  index: number;
  type: FixActionType;
  success: boolean;
  nodeId: string;
  nodeName: string;
  message: string;
  oldValue?: string;
  newValue?: string;
  error?: string;
}

export interface BatchFixSummary {
  total: number;
  applied: number;
  failed: number;
  results: BatchFixItemResult[];
}

// ──────────────────────────────────────────────
// Batch Fix Orchestrator
// ──────────────────────────────────────────────

/**
 * Execute a batch of fix actions. Each fix is a separate undo step.
 */
export async function executeBatchFix(fixes: BatchFixAction[]): Promise<BatchFixSummary> {
  let applied = 0;
  let failed = 0;
  const results: BatchFixItemResult[] = [];

  for (let i = 0; i < fixes.length; i++) {
    const fix = fixes[i];
    try {
      const result = await executeSingleFix(fix);
      results.push({ index: i, ...result });
      if (result.success) {
        applied++;
      } else {
        failed++;
      }
    } catch (error) {
      failed++;
      results.push({
        index: i,
        type: fix.type,
        success: false,
        nodeId: String(fix.params.nodeId || ''),
        nodeName: '',
        message: 'Unexpected error',
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return { total: fixes.length, applied, failed, results };
}

/**
 * Execute a single fix action and return a normalized result.
 */
async function executeSingleFix(fix: BatchFixAction): Promise<Omit<BatchFixItemResult, 'index'>> {
  const { type, params } = fix;

  switch (type) {
    case 'applyStyle': {
      const styleType = params.styleType as string;
      const nodeId = params.nodeId as string;
      const styleKey = params.styleKey as string;

      let result: StyleFixResult;
      switch (styleType) {
        case 'fill':
          result = await applyFillStyle(nodeId, styleKey);
          break;
        case 'stroke':
          result = await applyStrokeStyle(nodeId, styleKey);
          break;
        case 'text':
          result = await applyTextStyle(nodeId, styleKey);
          break;
        case 'effect':
          result = await applyEffectStyle(nodeId, styleKey);
          break;
        default:
          return { type, success: false, nodeId, nodeName: '', message: `Unknown style type: ${styleType}` };
      }

      return {
        type,
        success: result.success,
        nodeId: result.nodeId,
        nodeName: result.nodeName,
        message: result.success ? `Applied ${result.property}: ${result.newValue}` : (result.error || 'Failed'),
        oldValue: result.oldValue,
        newValue: result.newValue,
        error: result.error,
      };
    }

    case 'fixSpacing': {
      const nodeId = params.nodeId as string;
      const property = params.property as string;
      const value = params.value as number;

      const result: SpacingFixResult = fixSpacing(
        nodeId,
        property as 'itemSpacing' | 'paddingTop' | 'paddingBottom' | 'paddingLeft' | 'paddingRight' | 'counterAxisSpacing',
        value
      );

      return {
        type,
        success: result.success,
        nodeId: result.nodeId,
        nodeName: result.nodeName,
        message: result.success
          ? `${result.property}: ${result.oldValue}px → ${result.newValue}px`
          : (result.error || 'Failed'),
        oldValue: `${result.oldValue}px`,
        newValue: `${result.newValue}px`,
        error: result.error,
      };
    }

    case 'fixSpacingToNearest': {
      const nodeId = params.nodeId as string;
      const property = params.property as string;

      const result: SpacingFixResult = fixSpacingToNearest(
        nodeId,
        property as 'itemSpacing' | 'paddingTop' | 'paddingBottom' | 'paddingLeft' | 'paddingRight' | 'counterAxisSpacing'
      );

      return {
        type,
        success: result.success,
        nodeId: result.nodeId,
        nodeName: result.nodeName,
        message: result.success
          ? `${result.property}: ${result.oldValue}px → ${result.newValue}px`
          : (result.error || 'Failed'),
        oldValue: `${result.oldValue}px`,
        newValue: `${result.newValue}px`,
        error: result.error,
      };
    }

    case 'fixRadiusToNearest': {
      const nodeId = params.nodeId as string;
      const allowedRadii = params.allowedRadii as number[];

      const result: RadiusFixResult = fixRadiusToNearest(nodeId, allowedRadii);

      return {
        type,
        success: result.success,
        nodeId: result.nodeId,
        nodeName: result.nodeName,
        message: result.success
          ? `radius: ${result.oldValue}px → ${result.newValue}px`
          : (result.error || 'Failed'),
        oldValue: `${result.oldValue}px`,
        newValue: `${result.newValue}px`,
        error: result.error,
      };
    }

    case 'renameLayer': {
      const nodeId = params.nodeId as string;
      const newName = params.newName as string;

      const result: RenameResult = renameLayerById(nodeId, newName);

      return {
        type,
        success: result.success,
        nodeId: result.nodeId,
        nodeName: result.newName,
        message: result.success
          ? `Renamed "${result.oldName}" → "${result.newName}"`
          : (result.error || 'Failed'),
        oldValue: result.oldName,
        newValue: result.newName,
        error: result.error,
      };
    }

    default:
      return { type, success: false, nodeId: '', nodeName: '', message: `Unknown fix type: ${type}` };
  }
}
