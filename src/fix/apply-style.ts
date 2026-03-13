/// <reference types="@figma/plugin-typings" />

export interface StyleFixResult {
  success: boolean;
  nodeId: string;
  nodeName: string;
  property: string;
  oldValue: string;
  newValue: string;
  error?: string;
}

/**
 * Apply a fill style to a node by style key.
 */
export async function applyFillStyle(nodeId: string, styleKey: string): Promise<StyleFixResult> {
  const node = figma.getNodeById(nodeId) as SceneNode;
  if (!node || !('fillStyleId' in node)) {
    return { success: false, nodeId, nodeName: '', property: 'fillStyle', oldValue: '', newValue: '', error: 'Node not found or does not support fill styles' };
  }

  try {
    const style = await figma.importStyleByKeyAsync(styleKey);
    const oldStyleId = (node as any).fillStyleId || '';
    (node as any).fillStyleId = style.id;

    return {
      success: true,
      nodeId,
      nodeName: node.name,
      property: 'fillStyle',
      oldValue: oldStyleId ? 'existing style' : 'no style',
      newValue: style.name,
    };
  } catch (error) {
    return {
      success: false,
      nodeId,
      nodeName: node.name,
      property: 'fillStyle',
      oldValue: '',
      newValue: styleKey,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Apply a stroke style to a node by style key.
 */
export async function applyStrokeStyle(nodeId: string, styleKey: string): Promise<StyleFixResult> {
  const node = figma.getNodeById(nodeId) as SceneNode;
  if (!node || !('strokeStyleId' in node)) {
    return { success: false, nodeId, nodeName: '', property: 'strokeStyle', oldValue: '', newValue: '', error: 'Node not found or does not support stroke styles' };
  }

  try {
    const style = await figma.importStyleByKeyAsync(styleKey);
    const oldStyleId = (node as any).strokeStyleId || '';
    (node as any).strokeStyleId = style.id;

    return {
      success: true,
      nodeId,
      nodeName: node.name,
      property: 'strokeStyle',
      oldValue: oldStyleId ? 'existing style' : 'no style',
      newValue: style.name,
    };
  } catch (error) {
    return {
      success: false,
      nodeId,
      nodeName: node.name,
      property: 'strokeStyle',
      oldValue: '',
      newValue: styleKey,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Apply a text style to a text node by style key.
 */
export async function applyTextStyle(nodeId: string, styleKey: string): Promise<StyleFixResult> {
  const node = figma.getNodeById(nodeId) as SceneNode;
  if (!node || node.type !== 'TEXT') {
    return { success: false, nodeId, nodeName: '', property: 'textStyle', oldValue: '', newValue: '', error: 'Node not found or is not a text node' };
  }

  try {
    const style = await figma.importStyleByKeyAsync(styleKey);
    const textNode = node as TextNode;
    const oldStyleId = (textNode as any).textStyleId || '';
    (textNode as any).textStyleId = style.id;

    return {
      success: true,
      nodeId,
      nodeName: node.name,
      property: 'textStyle',
      oldValue: oldStyleId ? 'existing style' : 'no style',
      newValue: style.name,
    };
  } catch (error) {
    return {
      success: false,
      nodeId,
      nodeName: node.name,
      property: 'textStyle',
      oldValue: '',
      newValue: styleKey,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Apply an effect style to a node by style key.
 */
export async function applyEffectStyle(nodeId: string, styleKey: string): Promise<StyleFixResult> {
  const node = figma.getNodeById(nodeId) as SceneNode;
  if (!node || !('effectStyleId' in node)) {
    return { success: false, nodeId, nodeName: '', property: 'effectStyle', oldValue: '', newValue: '', error: 'Node not found or does not support effect styles' };
  }

  try {
    const style = await figma.importStyleByKeyAsync(styleKey);
    const oldStyleId = (node as any).effectStyleId || '';
    (node as any).effectStyleId = style.id;

    return {
      success: true,
      nodeId,
      nodeName: node.name,
      property: 'effectStyle',
      oldValue: oldStyleId ? 'existing style' : 'no style',
      newValue: style.name,
    };
  } catch (error) {
    return {
      success: false,
      nodeId,
      nodeName: node.name,
      property: 'effectStyle',
      oldValue: '',
      newValue: styleKey,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
