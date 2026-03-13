/// <reference types="@figma/plugin-typings" />

export interface RadiusFixResult {
  success: boolean;
  nodeId: string;
  nodeName: string;
  oldValue: string;
  newValue: string;
  error?: string;
}

/**
 * Find the nearest value in an allowed list.
 */
function findNearest(value: number, allowed: number[]): number {
  if (allowed.length === 0) return value;
  return allowed.reduce((best, v) =>
    Math.abs(v - value) < Math.abs(best - value) ? v : best
  );
}

/**
 * Fix a node's corner radius to the nearest allowed value.
 * Handles both uniform radius and per-corner (mixed) radius.
 */
export function fixRadiusToNearest(nodeId: string, allowedRadii: number[]): RadiusFixResult {
  const node = figma.getNodeById(nodeId) as SceneNode;
  if (!node) {
    return { success: false, nodeId, nodeName: '', oldValue: '', newValue: '', error: 'Node not found' };
  }

  if (!('cornerRadius' in node)) {
    return { success: false, nodeId, nodeName: node.name, oldValue: '', newValue: '', error: 'Node has no corner radius' };
  }

  const frame = node as FrameNode;

  try {
    const cr = frame.cornerRadius;

    if (cr === figma.mixed) {
      // Per-corner fix
      const tl = frame.topLeftRadius;
      const tr = frame.topRightRadius;
      const bl = frame.bottomLeftRadius;
      const br = frame.bottomRightRadius;

      const oldValue = `${tl}/${tr}/${br}/${bl}`;

      frame.topLeftRadius = findNearest(tl, allowedRadii);
      frame.topRightRadius = findNearest(tr, allowedRadii);
      frame.bottomLeftRadius = findNearest(bl, allowedRadii);
      frame.bottomRightRadius = findNearest(br, allowedRadii);

      const newValue = `${frame.topLeftRadius}/${frame.topRightRadius}/${frame.bottomRightRadius}/${frame.bottomLeftRadius}`;

      return { success: true, nodeId, nodeName: node.name, oldValue, newValue };
    } else {
      // Uniform radius
      const oldValue = `${cr}`;
      const nearest = findNearest(cr, allowedRadii);
      frame.cornerRadius = nearest;

      return { success: true, nodeId, nodeName: node.name, oldValue, newValue: `${nearest}` };
    }
  } catch (error) {
    return {
      success: false,
      nodeId,
      nodeName: node.name,
      oldValue: '',
      newValue: '',
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
