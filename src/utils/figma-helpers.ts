/// <reference types="@figma/plugin-typings" />

import { ValidNodeType } from '../types';

/**
 * Validate if an API key looks like a valid Claude API key
 */
export function isValidApiKeyFormat(apiKey: string): boolean {
  const trimmedKey = apiKey.trim();
  // Claude API keys typically start with 'sk-ant-' and are longer
  return trimmedKey.length > 40 && trimmedKey.startsWith('sk-ant-');
}

/**
 * Validate if a node is suitable for analysis
 */
export function isValidNodeForAnalysis(node: SceneNode): boolean {
  const validTypes: ValidNodeType[] = ['FRAME', 'COMPONENT', 'COMPONENT_SET', 'INSTANCE', 'GROUP'];

  // Check if it's a valid type
  if (!validTypes.includes(node.type as ValidNodeType)) {
    return false;
  }

  // Special check for component sets - always allow them for analysis
  if (node.type === 'COMPONENT_SET') {
    // Component sets are always valid for analysis, even if they have errors
    // The error handling is done in the component-analyzer when accessing properties
    return true;
  }

  return true;
}

/**
 * Convert RGB values to hex color string
 */
export function rgbToHex(r: number, g: number, b: number): string {
  const toHex = (n: number): string => {
    const hex = Math.round(n * 255).toString(16);
    return hex.length === 1 ? '0' + hex : hex;
  };
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

/**
 * Safely get variable name by ID using async method
 */
export async function getVariableName(variableId: string): Promise<string | null> {
  try {
    const variable = await figma.variables.getVariableByIdAsync(variableId);
    return variable ? variable.name : null;
  } catch (error) {
    console.warn('Could not access variable:', variableId, error);
    return null;
  }
}

/**
 * Safely get variable value for display (returns resolved value when possible)
 */
export async function getVariableValue(variableId: string, node?: SceneNode): Promise<string | null> {
  try {
    const variable = await figma.variables.getVariableByIdAsync(variableId);
    if (!variable) return null;

    // Try to resolve the variable value for the current node
    if (node && variable.resolveForConsumer) {
      try {
        const resolved = variable.resolveForConsumer(node);
        if (resolved && typeof resolved.value === 'object' && 'r' in resolved.value) {
          // It's a color value
          const color = resolved.value as { r: number; g: number; b: number };
          return rgbToHex(color.r, color.g, color.b);
        } else if (resolved && resolved.value !== undefined) {
          // Other value types
          return String(resolved.value);
        }
      } catch (resolveError) {
        console.warn('Could not resolve variable value:', resolveError);
      }
    }

    // Fallback to variable name if resolution fails
    return variable.name;
  } catch (error) {
    console.warn('Could not access variable:', variableId, error);
    return null;
  }
}

/**
 * Safely get style name by ID using async method
 */
export async function getStyleName(styleId: string): Promise<string | null> {
  try {
    const style = await figma.getStyleByIdAsync(styleId);
    return style ? style.name : null;
  } catch (error) {
    console.warn('Could not access style:', styleId, error);
    return null;
  }
}

/**
 * Send a message to the UI
 */
export function sendMessageToUI(type: string, data?: any): void {
  try {
    figma.ui.postMessage({ type, data });
  } catch (error) {
    console.error('Failed to send message to UI:', error);
  }
}

/**
 * Get the main component from a node (follows instance chains)
 */
export function getMainComponent(node: SceneNode): ComponentNode | null {
  if (node.type === 'INSTANCE') {
    const instance = node as InstanceNode;
    return instance.mainComponent;
  } else if (node.type === 'COMPONENT') {
    return node as ComponentNode;
  }
  return null;
}

/**
 * Traverse node tree and collect all child nodes
 */
export function getAllChildNodes(node: SceneNode): SceneNode[] {
  const nodes: SceneNode[] = [node];

  if ('children' in node) {
    for (const child of node.children) {
      nodes.push(...getAllChildNodes(child));
    }
  }

  return nodes;
}

/**
 * Check if a node has text content
 */
export function hasTextContent(node: SceneNode): boolean {
  if (node.type === 'TEXT') {
    return true;
  }

  if ('children' in node) {
    return node.children.some(child => hasTextContent(child));
  }

  return false;
}

/**
 * Extract text content from a node tree
 */
export function extractTextContent(node: SceneNode): string[] {
  const textContent: string[] = [];

  if (node.type === 'TEXT') {
    const textNode = node as TextNode;
    if (textNode.characters) {
      textContent.push(textNode.characters);
    }
  }

  if ('children' in node) {
    for (const child of node.children) {
      textContent.push(...extractTextContent(child));
    }
  }

  return textContent;
}

/**
 * Find a layer by name in a node tree
 */
export function findLayerByName(node: SceneNode, targetName: string): SceneNode | null {
  if (node.name === targetName) {
    return node;
  }

  if ('children' in node) {
    for (const child of node.children) {
      const found = findLayerByName(child, targetName);
      if (found) {
        return found;
      }
    }
  }

  return null;
}

/**
 * Rename a layer by finding it by current name
 */
export function renameLayer(rootNode: SceneNode, currentName: string, newName: string): boolean {
  const layer = findLayerByName(rootNode, currentName);
  if (layer) {
    layer.name = newName;
    return true;
  }
  return false;
}

/**
 * Check if a color meets WCAG contrast requirements
 */
export function checkColorContrast(foreground: string, background: string): 'pass' | 'fail' | 'unknown' {
  // Basic contrast check - could be enhanced with proper WCAG calculation
  if (foreground === background) {
    return 'fail';
  }

  // For now, return unknown - real implementation would calculate luminance ratios
  return 'unknown';
}

/**
 * Generate semantic token name from value and context
 */
export function generateSemanticTokenName(
  value: string | number,
  type: 'color' | 'spacing' | 'typography' | 'effect' | 'border',
  nodeType?: string,
  context: Record<string, any> = {}
): string {
  const nodePrefix = nodeType ? nodeType.toLowerCase() : 'component';

  switch (type) {
    case 'color':
      if (typeof value === 'string' && value.startsWith('#')) {
        if (value.toLowerCase() === '#000000' || value.toLowerCase() === '#000') {
          return 'semantic-color-text-primary';
        }
        if (value.toLowerCase() === '#ffffff' || value.toLowerCase() === '#fff') {
          return 'semantic-color-background-primary';
        }
        return `semantic-color-${nodePrefix}-primary`;
      }
      return `semantic-color-${value}`;

    case 'spacing':
      const numValue = typeof value === 'number' ? value : parseInt(value.toString());
      if (numValue % 8 === 0) {
        return `spacing-${numValue / 8}x-${numValue}px`;
      } else if (numValue % 4 === 0) {
        return `spacing-${numValue / 4}x-${numValue}px`;
      }
      return `spacing-custom-${numValue}px`;

    case 'typography':
      return `text-${nodePrefix}-${value}`;

    case 'effect':
      if (context.shadowType) {
        return `shadow-${context.shadowType}-${nodePrefix}`;
      }
      return `effect-${nodePrefix}-${value}`;

    case 'border':
      return `radius-${nodePrefix}-${value}`;

    default:
      return `token-${type}-${value}`;
  }
}

/**
 * Generate a descriptive path for a node to help with debugging
 */
export function getNodePath(node: SceneNode): string {
  const path: string[] = [];
  let currentNode: BaseNode | null = node;

  while (currentNode && currentNode.type !== 'DOCUMENT') {
    if (currentNode.type === 'PAGE') {
      break; // Don't include page in the path
    }

    // For component variants, include the variant properties
    if (currentNode.type === 'COMPONENT' && currentNode.parent?.type === 'COMPONENT_SET') {
      // Extract variant name (e.g., "Hover, Checked=True, Focus=True")
      path.unshift(`${currentNode.name}`);
    } else {
      path.unshift(currentNode.name);
    }

    currentNode = currentNode.parent;
  }

  return path.join(' → ');
}

/**
 * Generate a concise description for debugging context
 */
export function getDebugContext(node: SceneNode): { path: string; description: string } {
  const path = getNodePath(node);

  // Create a user-friendly description
  let description = `Found in "${node.name}"`;

  // If it's part of a component variant, be more specific
  if (node.parent?.type === 'COMPONENT_SET' ||
      (node.parent && node.parent.parent?.type === 'COMPONENT_SET')) {
    description = `Found in variant: "${node.name}"`;
  } else if (path.includes('→')) {
    // Show the immediate parent context for nested elements
    const pathParts = path.split(' → ');
    if (pathParts.length > 1) {
      description = `Found in "${pathParts[pathParts.length - 1]}" (${pathParts[pathParts.length - 2]})`;
    }
  }

  return { path, description };
}
