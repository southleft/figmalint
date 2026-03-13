/// <reference types="@figma/plugin-typings" />

import { SPACING_SCALE, findClosestSpacingValues } from '../lint/types';

export interface SpacingFixResult {
  success: boolean;
  nodeId: string;
  nodeName: string;
  property: string;
  oldValue: number;
  newValue: number;
  error?: string;
}

type SpacingProperty = 'itemSpacing' | 'paddingTop' | 'paddingBottom' | 'paddingLeft' | 'paddingRight' | 'counterAxisSpacing';

const SPACING_PROPERTIES: SpacingProperty[] = [
  'itemSpacing',
  'paddingTop',
  'paddingBottom',
  'paddingLeft',
  'paddingRight',
  'counterAxisSpacing',
];

/**
 * Fix a single spacing property on a node by rounding to the nearest scale value.
 */
export function fixSpacing(nodeId: string, property: SpacingProperty, newValue: number): SpacingFixResult {
  const node = figma.getNodeById(nodeId) as SceneNode;
  if (!node) {
    return { success: false, nodeId, nodeName: '', property, oldValue: 0, newValue, error: 'Node not found' };
  }

  if (node.type !== 'FRAME' && node.type !== 'COMPONENT' && node.type !== 'INSTANCE') {
    return { success: false, nodeId, nodeName: node.name, property, oldValue: 0, newValue, error: 'Node is not a frame' };
  }

  const frame = node as FrameNode;
  if (frame.layoutMode === 'NONE') {
    return { success: false, nodeId, nodeName: node.name, property, oldValue: 0, newValue, error: 'Frame has no auto-layout' };
  }

  try {
    const oldValue = (frame as any)[property] as number;
    (frame as any)[property] = newValue;

    return {
      success: true,
      nodeId,
      nodeName: node.name,
      property,
      oldValue,
      newValue,
    };
  } catch (error) {
    return {
      success: false,
      nodeId,
      nodeName: node.name,
      property,
      oldValue: 0,
      newValue,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Auto-fix a spacing value by rounding to the nearest value in the spacing scale.
 * Returns the closer of the two nearest values.
 */
export function fixSpacingToNearest(nodeId: string, property: SpacingProperty): SpacingFixResult {
  const node = figma.getNodeById(nodeId) as SceneNode;
  if (!node || (node.type !== 'FRAME' && node.type !== 'COMPONENT' && node.type !== 'INSTANCE')) {
    return { success: false, nodeId, nodeName: node?.name || '', property, oldValue: 0, newValue: 0, error: 'Invalid node' };
  }

  const frame = node as FrameNode;
  const currentValue = (frame as any)[property] as number;

  if (typeof currentValue !== 'number') {
    return { success: false, nodeId, nodeName: node.name, property, oldValue: 0, newValue: 0, error: 'Property is not a number' };
  }

  // Already on scale
  if (SPACING_SCALE.includes(currentValue as typeof SPACING_SCALE[number])) {
    return { success: true, nodeId, nodeName: node.name, property, oldValue: currentValue, newValue: currentValue };
  }

  const suggestions = findClosestSpacingValues(currentValue);
  if (suggestions.length === 0) {
    return { success: false, nodeId, nodeName: node.name, property, oldValue: currentValue, newValue: currentValue, error: 'No suggestion found' };
  }

  // Pick the closest
  const closest = suggestions.reduce((a, b) => Math.abs(a - currentValue) <= Math.abs(b - currentValue) ? a : b);
  return fixSpacing(nodeId, property, closest);
}

/**
 * Fix ALL off-grid spacing properties on a single node.
 */
export function fixAllSpacingOnNode(nodeId: string): SpacingFixResult[] {
  const node = figma.getNodeById(nodeId) as SceneNode;
  if (!node || (node.type !== 'FRAME' && node.type !== 'COMPONENT' && node.type !== 'INSTANCE')) {
    return [];
  }

  const frame = node as FrameNode;
  if (frame.layoutMode === 'NONE') return [];

  const results: SpacingFixResult[] = [];

  for (const prop of SPACING_PROPERTIES) {
    if (!(prop in frame)) continue;
    const value = (frame as any)[prop] as number;
    if (typeof value !== 'number') continue;
    if (SPACING_SCALE.includes(value as typeof SPACING_SCALE[number])) continue;

    const result = fixSpacingToNearest(nodeId, prop);
    results.push(result);
  }

  return results;
}
