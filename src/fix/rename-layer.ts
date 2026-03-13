/// <reference types="@figma/plugin-typings" />

export interface RenameResult {
  success: boolean;
  nodeId: string;
  oldName: string;
  newName: string;
  error?: string;
}

/**
 * Rename a single layer.
 */
export function renameLayerById(nodeId: string, newName: string): RenameResult {
  const node = figma.getNodeById(nodeId);
  if (!node || node.type === 'DOCUMENT' || node.type === 'PAGE') {
    return { success: false, nodeId, oldName: '', newName, error: 'Node not found' };
  }

  try {
    const oldName = node.name;
    node.name = newName;
    return { success: true, nodeId, oldName, newName };
  } catch (error) {
    return {
      success: false,
      nodeId,
      oldName: node.name,
      newName,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Batch rename layers from a list of {nodeId, newName} pairs.
 */
export function batchRenameLayersById(
  renames: Array<{ nodeId: string; newName: string }>
): RenameResult[] {
  const results: RenameResult[] = [];
  for (const { nodeId, newName } of renames) {
    results.push(renameLayerById(nodeId, newName));
  }
  return results;
}
