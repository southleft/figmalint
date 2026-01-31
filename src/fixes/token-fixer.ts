/// <reference types="@figma/plugin-typings" />

import { rgbToHex } from '../utils/figma-helpers';

// ============================================================================
// Types
// ============================================================================

/**
 * Preview of what a fix would do before applying
 */
export interface FixPreview {
  /** The node that would be modified */
  nodeId: string;
  nodeName: string;
  /** The property path being modified */
  propertyPath: string;
  /** Current value before fix */
  beforeValue: string;
  /** Value after fix is applied */
  afterValue: string;
  /** The token/variable being applied */
  tokenId: string;
  tokenName: string;
  /** Type of fix */
  fixType: 'color' | 'spacing' | 'border';
}

/**
 * Result of applying a fix
 */
export interface FixResult {
  /** Whether the fix was successfully applied */
  success: boolean;
  /** Description of what was done */
  message: string;
  /** Error message if fix failed */
  error?: string;
  /** The preview that was applied */
  appliedFix?: FixPreview;
}

/**
 * Suggestion for a token that could be used
 */
export interface TokenSuggestion {
  /** Variable ID */
  variableId: string;
  /** Variable name */
  variableName: string;
  /** Collection name */
  collectionName: string;
  /** The resolved value */
  value: string;
  /** How close the match is (0-1, 1 = exact) */
  matchScore: number;
  /** Type of token */
  type: 'color' | 'number';
}

/**
 * Color property types that can be bound to variables
 */
export type ColorPropertyType = 'fills' | 'strokes';

/**
 * Spacing property types that can be bound to variables
 */
export type SpacingPropertyType =
  | 'paddingTop'
  | 'paddingRight'
  | 'paddingBottom'
  | 'paddingLeft'
  | 'itemSpacing'
  | 'counterAxisSpacing'
  | 'cornerRadius'
  | 'topLeftRadius'
  | 'topRightRadius'
  | 'bottomLeftRadius'
  | 'bottomRightRadius'
  | 'strokeWeight';

// ============================================================================
// Token Binding Functions
// ============================================================================

/**
 * Bind an existing color variable to a node property (fills or strokes)
 *
 * @param node - The node to bind the variable to
 * @param propertyType - Either 'fills' or 'strokes'
 * @param variableId - The ID of the color variable to bind
 * @param paintIndex - Index of the paint to modify (default 0)
 * @returns Result of the binding operation
 */
export async function bindColorToken(
  node: SceneNode,
  propertyType: ColorPropertyType,
  variableId: string,
  paintIndex: number = 0
): Promise<FixResult> {
  try {
    // Validate node has the property
    if (!(propertyType in node)) {
      return {
        success: false,
        message: `Node does not support ${propertyType}`,
        error: `Property ${propertyType} not found on node type ${node.type}`
      };
    }

    // Get the variable
    const variable = await figma.variables.getVariableByIdAsync(variableId);
    if (!variable) {
      return {
        success: false,
        message: 'Variable not found',
        error: `Could not find variable with ID: ${variableId}`
      };
    }

    // Validate variable is a color type
    if (variable.resolvedType !== 'COLOR') {
      return {
        success: false,
        message: 'Variable is not a color type',
        error: `Variable ${variable.name} is of type ${variable.resolvedType}, expected COLOR`
      };
    }

    // Get current paints
    const nodeWithPaints = node as SceneNode & { [K in ColorPropertyType]: readonly Paint[] };
    const paints = [...nodeWithPaints[propertyType]] as Paint[];

    if (paintIndex >= paints.length) {
      return {
        success: false,
        message: 'Paint index out of range',
        error: `Paint index ${paintIndex} does not exist. Node has ${paints.length} ${propertyType}.`
      };
    }

    const currentPaint = paints[paintIndex];
    if (currentPaint.type !== 'SOLID') {
      return {
        success: false,
        message: 'Can only bind to solid paints',
        error: `Paint at index ${paintIndex} is of type ${currentPaint.type}, expected SOLID`
      };
    }

    // Create the bound paint
    const boundPaint = figma.variables.setBoundVariableForPaint(
      currentPaint as SolidPaint,
      'color',
      variable
    );

    // Update the paints array
    paints[paintIndex] = boundPaint;

    // Apply to node
    if (propertyType === 'fills') {
      (node as GeometryMixin).fills = paints;
    } else {
      (node as MinimalStrokesMixin).strokes = paints;
    }

    return {
      success: true,
      message: `Successfully bound ${variable.name} to ${propertyType}[${paintIndex}]`,
      appliedFix: {
        nodeId: node.id,
        nodeName: node.name,
        propertyPath: `${propertyType}[${paintIndex}]`,
        beforeValue: currentPaint.type === 'SOLID' && currentPaint.color
          ? rgbToHex(currentPaint.color.r, currentPaint.color.g, currentPaint.color.b)
          : 'unknown',
        afterValue: variable.name,
        tokenId: variableId,
        tokenName: variable.name,
        fixType: 'color'
      }
    };
  } catch (error) {
    return {
      success: false,
      message: 'Failed to bind color token',
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

/**
 * Bind a spacing/number variable to a node property
 *
 * @param node - The node to bind the variable to
 * @param property - The spacing property to bind (padding, gap, radius, etc.)
 * @param variableId - The ID of the number variable to bind
 * @returns Result of the binding operation
 */
export async function bindSpacingToken(
  node: SceneNode,
  property: SpacingPropertyType,
  variableId: string
): Promise<FixResult> {
  try {
    // Validate node has the property
    if (!(property in node)) {
      return {
        success: false,
        message: `Node does not support ${property}`,
        error: `Property ${property} not found on node type ${node.type}`
      };
    }

    // Get the variable
    const variable = await figma.variables.getVariableByIdAsync(variableId);
    if (!variable) {
      return {
        success: false,
        message: 'Variable not found',
        error: `Could not find variable with ID: ${variableId}`
      };
    }

    // Validate variable is a number type
    if (variable.resolvedType !== 'FLOAT') {
      return {
        success: false,
        message: 'Variable is not a number type',
        error: `Variable ${variable.name} is of type ${variable.resolvedType}, expected FLOAT`
      };
    }

    // Get current value for preview
    const currentValue = (node as any)[property];

    // Cast node to support setBoundVariable
    const bindableNode = node as SceneNode & {
      setBoundVariable(field: string, variable: Variable | null): void;
    };

    // Bind the variable
    bindableNode.setBoundVariable(property, variable);

    return {
      success: true,
      message: `Successfully bound ${variable.name} to ${property}`,
      appliedFix: {
        nodeId: node.id,
        nodeName: node.name,
        propertyPath: property,
        beforeValue: typeof currentValue === 'number' ? `${currentValue}px` : String(currentValue),
        afterValue: variable.name,
        tokenId: variableId,
        tokenName: variable.name,
        fixType: property.includes('Radius') ? 'border' : 'spacing'
      }
    };
  } catch (error) {
    return {
      success: false,
      message: 'Failed to bind spacing token',
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

/**
 * Remove a token binding from a node property
 *
 * @param node - The node to unbind from
 * @param property - The property to unbind
 * @returns Result of the unbind operation
 */
export async function unbindToken(
  node: SceneNode,
  property: ColorPropertyType | SpacingPropertyType
): Promise<FixResult> {
  try {
    // Handle color properties (fills/strokes)
    if (property === 'fills' || property === 'strokes') {
      const nodeWithPaints = node as SceneNode & { [K in ColorPropertyType]: readonly Paint[] };
      const paints = [...nodeWithPaints[property]] as Paint[];

      // Unbind all paints
      const unboundPaints = paints.map(paint => {
        if (paint.type === 'SOLID') {
          return figma.variables.setBoundVariableForPaint(
            paint as SolidPaint,
            'color',
            null
          );
        }
        return paint;
      });

      if (property === 'fills') {
        (node as GeometryMixin).fills = unboundPaints;
      } else {
        (node as MinimalStrokesMixin).strokes = unboundPaints;
      }

      return {
        success: true,
        message: `Successfully unbound variables from ${property}`
      };
    }

    // Handle spacing properties
    const bindableNode = node as SceneNode & {
      setBoundVariable(field: string, variable: Variable | null): void;
    };

    bindableNode.setBoundVariable(property, null);

    return {
      success: true,
      message: `Successfully unbound variable from ${property}`
    };
  } catch (error) {
    return {
      success: false,
      message: 'Failed to unbind token',
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

// ============================================================================
// Token Creation Functions
// ============================================================================

/**
 * Create a new color variable
 *
 * @param name - Name for the new variable
 * @param hexValue - Hex color value (e.g., '#FF0000')
 * @param collectionName - Name of collection to add to (creates if not exists)
 * @returns The created variable or error result
 */
export async function createColorVariable(
  name: string,
  hexValue: string,
  collectionName: string = 'Design Tokens'
): Promise<{ success: boolean; variable?: Variable; error?: string }> {
  try {
    // Get or create collection
    const collection = await findOrCreateVariableCollection(collectionName);
    if (!collection) {
      return {
        success: false,
        error: 'Failed to find or create variable collection'
      };
    }

    // Parse hex to RGB
    const rgb = hexToRgb(hexValue);
    if (!rgb) {
      return {
        success: false,
        error: `Invalid hex color: ${hexValue}`
      };
    }

    // Create the variable
    const variable = figma.variables.createVariable(
      name,
      collection,
      'COLOR'
    );

    // Set the value for the default mode
    const modeId = collection.modes[0].modeId;
    variable.setValueForMode(modeId, {
      r: rgb.r,
      g: rgb.g,
      b: rgb.b
    });

    return {
      success: true,
      variable
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

/**
 * Create a new spacing/number variable
 *
 * @param name - Name for the new variable
 * @param pixelValue - Pixel value (e.g., 16)
 * @param collectionName - Name of collection to add to (creates if not exists)
 * @returns The created variable or error result
 */
export async function createSpacingVariable(
  name: string,
  pixelValue: number,
  collectionName: string = 'Design Tokens'
): Promise<{ success: boolean; variable?: Variable; error?: string }> {
  try {
    // Get or create collection
    const collection = await findOrCreateVariableCollection(collectionName);
    if (!collection) {
      return {
        success: false,
        error: 'Failed to find or create variable collection'
      };
    }

    // Create the variable
    const variable = figma.variables.createVariable(
      name,
      collection,
      'FLOAT'
    );

    // Set the value for the default mode
    const modeId = collection.modes[0].modeId;
    variable.setValueForMode(modeId, pixelValue);

    return {
      success: true,
      variable
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

/**
 * Find an existing variable collection by name or create a new one
 *
 * @param name - Name of the collection
 * @returns The found or created collection, or null if failed
 */
export async function findOrCreateVariableCollection(
  name: string
): Promise<VariableCollection | null> {
  try {
    // Get all local collections
    const collections = await figma.variables.getLocalVariableCollectionsAsync();

    // Find existing collection by name
    const existing = collections.find(c => c.name === name);
    if (existing) {
      return existing;
    }

    // Create new collection
    return figma.variables.createVariableCollection(name);
  } catch (error) {
    console.error('Failed to find or create collection:', error);
    return null;
  }
}

// ============================================================================
// Token Search Functions
// ============================================================================

/**
 * Find existing variables that match a given hex color
 *
 * @param hexColor - Hex color to match (e.g., '#FF0000')
 * @param tolerance - Color tolerance (0-1, default 0 for exact match)
 * @returns Array of matching token suggestions sorted by match score
 */
export async function findMatchingColorVariable(
  hexColor: string,
  tolerance: number = 0
): Promise<TokenSuggestion[]> {
  try {
    const targetRgb = hexToRgb(hexColor);
    if (!targetRgb) {
      return [];
    }

    const suggestions: TokenSuggestion[] = [];

    // Get all color variables
    const colorVariables = await figma.variables.getLocalVariablesAsync('COLOR');
    const collections = await figma.variables.getLocalVariableCollectionsAsync();

    // Create collection lookup map
    const collectionMap = new Map<string, VariableCollection>();
    for (const collection of collections) {
      collectionMap.set(collection.id, collection);
    }

    for (const variable of colorVariables) {
      const collection = collectionMap.get(variable.variableCollectionId);
      if (!collection) continue;

      // Get the default mode value
      const modeId = collection.modes[0].modeId;
      const value = variable.valuesByMode[modeId];

      // Skip if it's an alias or not a direct color value
      if (!value || typeof value !== 'object' || !('r' in value)) {
        continue;
      }

      const varColor = value as { r: number; g: number; b: number };

      // Calculate color difference
      const matchScore = calculateColorMatchScore(targetRgb, varColor);

      if (matchScore >= 1 - tolerance) {
        suggestions.push({
          variableId: variable.id,
          variableName: variable.name,
          collectionName: collection.name,
          value: rgbToHex(varColor.r, varColor.g, varColor.b),
          matchScore,
          type: 'color'
        });
      }
    }

    // Sort by match score (highest first)
    return suggestions.sort((a, b) => b.matchScore - a.matchScore);
  } catch (error) {
    console.error('Error finding matching color variable:', error);
    return [];
  }
}

/**
 * Find existing variables that match a given pixel value
 *
 * @param pixelValue - Pixel value to match
 * @param tolerance - Value tolerance in pixels (default 0 for exact match)
 * @returns Array of matching token suggestions sorted by match score
 */
export async function findMatchingSpacingVariable(
  pixelValue: number,
  tolerance: number = 0
): Promise<TokenSuggestion[]> {
  try {
    const suggestions: TokenSuggestion[] = [];

    // Get all number variables
    const numberVariables = await figma.variables.getLocalVariablesAsync('FLOAT');
    const collections = await figma.variables.getLocalVariableCollectionsAsync();

    // Create collection lookup map
    const collectionMap = new Map<string, VariableCollection>();
    for (const collection of collections) {
      collectionMap.set(collection.id, collection);
    }

    for (const variable of numberVariables) {
      const collection = collectionMap.get(variable.variableCollectionId);
      if (!collection) continue;

      // Get the default mode value
      const modeId = collection.modes[0].modeId;
      const value = variable.valuesByMode[modeId];

      // Skip if it's an alias or not a number
      if (typeof value !== 'number') {
        continue;
      }

      // Calculate value difference
      const difference = Math.abs(value - pixelValue);

      if (difference <= tolerance) {
        const matchScore = difference === 0 ? 1 : 1 - (difference / (tolerance || 1));
        suggestions.push({
          variableId: variable.id,
          variableName: variable.name,
          collectionName: collection.name,
          value: `${value}px`,
          matchScore,
          type: 'number'
        });
      }
    }

    // Sort by match score (highest first)
    return suggestions.sort((a, b) => b.matchScore - a.matchScore);
  } catch (error) {
    console.error('Error finding matching spacing variable:', error);
    return [];
  }
}

/**
 * Find the best matching variable for a given pixel value with property-name affinity.
 * Wraps findMatchingSpacingVariable with scoring boosts for semantically appropriate names.
 *
 * @param pixelValue - Pixel value to match
 * @param propertyPath - The property being fixed (e.g., 'strokeWeight', 'cornerRadius', 'paddingTop')
 * @param tolerance - Value tolerance in pixels (default 2)
 * @returns Array of matching token suggestions re-sorted by boosted scores
 */
export async function findBestMatchingVariable(
  pixelValue: number,
  propertyPath: string,
  tolerance: number = 2
): Promise<TokenSuggestion[]> {
  const suggestions = await findMatchingSpacingVariable(pixelValue, tolerance);
  if (suggestions.length === 0) return suggestions;

  // Define affinity keywords per property type
  const affinityMap: Record<string, string[]> = {
    strokeWeight: ['stroke', 'border-width', 'border/width', 'borderwidth'],
    cornerRadius: ['radius', 'corner', 'round', 'border-radius'],
    topLeftRadius: ['radius', 'corner', 'round'],
    topRightRadius: ['radius', 'corner', 'round'],
    bottomLeftRadius: ['radius', 'corner', 'round'],
    bottomRightRadius: ['radius', 'corner', 'round'],
    paddingTop: ['padding', 'spacing', 'space'],
    paddingRight: ['padding', 'spacing', 'space'],
    paddingBottom: ['padding', 'spacing', 'space'],
    paddingLeft: ['padding', 'spacing', 'space'],
    itemSpacing: ['gap', 'spacing', 'space'],
    counterAxisSpacing: ['gap', 'spacing', 'space'],
  };

  const keywords = affinityMap[propertyPath] || [];
  if (keywords.length === 0) return suggestions;

  // Boost scores for variables whose names match affinity keywords
  const boosted = suggestions.map(s => {
    const nameLower = s.variableName.toLowerCase();
    const hasAffinity = keywords.some(kw => nameLower.includes(kw));
    return {
      ...s,
      matchScore: hasAffinity ? Math.min(s.matchScore + 0.3, 1) : s.matchScore,
    };
  });

  return boosted.sort((a, b) => b.matchScore - a.matchScore);
}

/**
 * Suggest a semantic token name based on value and context
 *
 * @param value - The value (hex color or pixel number)
 * @param context - Context information for naming
 * @returns Suggested semantic token name
 */
export function suggestSemanticTokenName(
  value: string | number,
  context: {
    nodeType?: string;
    nodeName?: string;
    propertyType?: string;
    usage?: string;
  }
): string {
  const { nodeType, nodeName, propertyType, usage } = context;

  // Color naming
  if (typeof value === 'string' && value.startsWith('#')) {
    const hex = value.toUpperCase();

    // Common color semantic names
    if (hex === '#000000' || hex === '#000') {
      return 'color/text/primary';
    }
    if (hex === '#FFFFFF' || hex === '#FFF') {
      return 'color/background/primary';
    }

    // Property-based naming
    if (propertyType === 'fills') {
      if (usage === 'background' || nodeType === 'FRAME') {
        return 'color/background/default';
      }
      return 'color/surface/default';
    }
    if (propertyType === 'strokes') {
      return 'color/border/default';
    }

    // Node name based
    if (nodeName) {
      const cleanName = nodeName.toLowerCase().replace(/[^a-z0-9]/g, '-');
      return `color/${cleanName}/default`;
    }

    return 'color/custom/default';
  }

  // Spacing naming
  if (typeof value === 'number') {
    const px = value;

    // Property-based naming
    if (propertyType?.includes('padding')) {
      const size = getSpacingSizeLabel(px);
      return `spacing/padding/${size}`;
    }
    if (propertyType === 'itemSpacing' || propertyType === 'counterAxisSpacing') {
      const size = getSpacingSizeLabel(px);
      return `spacing/gap/${size}`;
    }
    if (propertyType?.includes('Radius')) {
      const size = getRadiusSizeLabel(px);
      return `radius/${size}`;
    }
    if (propertyType === 'strokeWeight') {
      return `border/width/${px === 1 ? 'thin' : px === 2 ? 'medium' : 'thick'}`;
    }

    // Generic spacing
    const size = getSpacingSizeLabel(px);
    return `spacing/${size}`;
  }

  return 'token/custom';
}

// ============================================================================
// Apply Fix Functions
// ============================================================================

/**
 * Apply a color token fix to a node after confirmation
 *
 * @param node - The node to fix
 * @param propertyPath - Property path (e.g., 'fills[0]', 'strokes[1]')
 * @param tokenId - The variable ID to apply
 * @returns Result of the fix operation
 */
export async function applyColorFix(
  node: SceneNode,
  propertyPath: string,
  tokenId: string
): Promise<FixResult> {
  // Parse property path
  const match = propertyPath.match(/^(fills|strokes)\[(\d+)\]$/);
  if (!match) {
    return {
      success: false,
      message: 'Invalid property path',
      error: `Expected format: fills[n] or strokes[n], got: ${propertyPath}`
    };
  }

  const [, propertyType, indexStr] = match;
  const paintIndex = parseInt(indexStr, 10);

  return bindColorToken(
    node,
    propertyType as ColorPropertyType,
    tokenId,
    paintIndex
  );
}

/**
 * Apply a spacing token fix to a node after confirmation
 *
 * @param node - The node to fix
 * @param propertyPath - Property name (e.g., 'paddingTop', 'itemSpacing')
 * @param tokenId - The variable ID to apply
 * @returns Result of the fix operation
 */
export async function applySpacingFix(
  node: SceneNode,
  propertyPath: string,
  tokenId: string
): Promise<FixResult> {
  // Validate property is a valid spacing property
  const validProperties: SpacingPropertyType[] = [
    'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft',
    'itemSpacing', 'counterAxisSpacing',
    'cornerRadius',
    'topLeftRadius', 'topRightRadius', 'bottomLeftRadius', 'bottomRightRadius',
    'strokeWeight'
  ];

  if (!validProperties.includes(propertyPath as SpacingPropertyType)) {
    return {
      success: false,
      message: 'Invalid property path',
      error: `Property ${propertyPath} is not a valid spacing property`
    };
  }

  // For uniform cornerRadius, bind the variable to all 4 individual corners
  if (propertyPath === 'cornerRadius') {
    const corners: SpacingPropertyType[] = [
      'topLeftRadius', 'topRightRadius', 'bottomLeftRadius', 'bottomRightRadius'
    ];
    const results: FixResult[] = [];
    for (const corner of corners) {
      const result = await bindSpacingToken(node, corner, tokenId);
      results.push(result);
      if (!result.success) {
        return {
          success: false,
          message: `Failed to bind ${corner}`,
          error: result.error
        };
      }
    }
    return {
      success: true,
      message: `Successfully bound variable to all 4 corner radii`,
      appliedFix: results[0].appliedFix
        ? { ...results[0].appliedFix, propertyPath: 'cornerRadius' }
        : undefined
    };
  }

  return bindSpacingToken(
    node,
    propertyPath as SpacingPropertyType,
    tokenId
  );
}

/**
 * Generate a preview of what a fix would do without applying it
 *
 * @param node - The node that would be fixed
 * @param propertyPath - Property path to fix
 * @param tokenId - The variable ID that would be applied
 * @returns Preview of the fix or null if preview cannot be generated
 */
export async function previewFix(
  node: SceneNode,
  propertyPath: string,
  tokenId: string
): Promise<FixPreview | null> {
  try {
    // Get the variable
    const variable = await figma.variables.getVariableByIdAsync(tokenId);
    if (!variable) {
      return null;
    }

    // Determine fix type and get current value
    let fixType: 'color' | 'spacing' | 'border';
    let beforeValue: string;

    // Handle color properties
    const colorMatch = propertyPath.match(/^(fills|strokes)\[(\d+)\]$/);
    if (colorMatch) {
      fixType = 'color';
      const [, propertyType, indexStr] = colorMatch;
      const paintIndex = parseInt(indexStr, 10);

      if (!(propertyType in node)) {
        return null;
      }

      const nodeWithPaints = node as SceneNode & { [K in ColorPropertyType]: readonly Paint[] };
      const paints = nodeWithPaints[propertyType as ColorPropertyType];

      if (paintIndex >= paints.length) {
        return null;
      }

      const paint = paints[paintIndex];
      if (paint.type === 'SOLID' && paint.color) {
        beforeValue = rgbToHex(paint.color.r, paint.color.g, paint.color.b);
      } else {
        beforeValue = paint.type;
      }
    } else {
      // Handle spacing properties
      if (!(propertyPath in node)) {
        return null;
      }

      const currentValue = (node as any)[propertyPath];
      beforeValue = typeof currentValue === 'number' ? `${currentValue}px` : String(currentValue);
      fixType = propertyPath.includes('Radius') ? 'border' : 'spacing';
    }

    // Get token value for afterValue
    let afterValue = variable.name;
    const collection = await figma.variables.getVariableCollectionByIdAsync(variable.variableCollectionId);
    if (collection) {
      const modeId = collection.modes[0].modeId;
      const value = variable.valuesByMode[modeId];
      if (typeof value === 'number') {
        afterValue = `${variable.name} (${value}px)`;
      } else if (value && typeof value === 'object' && 'r' in value) {
        const rgb = value as { r: number; g: number; b: number };
        afterValue = `${variable.name} (${rgbToHex(rgb.r, rgb.g, rgb.b)})`;
      }
    }

    return {
      nodeId: node.id,
      nodeName: node.name,
      propertyPath,
      beforeValue,
      afterValue,
      tokenId,
      tokenName: variable.name,
      fixType
    };
  } catch (error) {
    console.error('Error generating fix preview:', error);
    return null;
  }
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Convert hex color to RGB object
 */
function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  // Remove # if present
  const cleanHex = hex.replace(/^#/, '');

  // Handle 3-digit hex
  let fullHex = cleanHex;
  if (cleanHex.length === 3) {
    fullHex = cleanHex[0] + cleanHex[0] + cleanHex[1] + cleanHex[1] + cleanHex[2] + cleanHex[2];
  }

  if (fullHex.length !== 6) {
    return null;
  }

  const r = parseInt(fullHex.substring(0, 2), 16);
  const g = parseInt(fullHex.substring(2, 4), 16);
  const b = parseInt(fullHex.substring(4, 6), 16);

  if (isNaN(r) || isNaN(g) || isNaN(b)) {
    return null;
  }

  // Return as 0-1 range for Figma
  return {
    r: r / 255,
    g: g / 255,
    b: b / 255
  };
}

/**
 * Calculate color match score (0-1, 1 = exact match)
 */
function calculateColorMatchScore(
  color1: { r: number; g: number; b: number },
  color2: { r: number; g: number; b: number }
): number {
  // Calculate Euclidean distance in RGB space (normalized 0-1)
  const dr = color1.r - color2.r;
  const dg = color1.g - color2.g;
  const db = color1.b - color2.b;

  // Max distance is sqrt(3) for colors at opposite corners of RGB cube
  const distance = Math.sqrt(dr * dr + dg * dg + db * db);
  const maxDistance = Math.sqrt(3);

  // Convert distance to match score (1 = exact match, 0 = completely different)
  return 1 - (distance / maxDistance);
}

/**
 * Get spacing size label based on pixel value
 */
function getSpacingSizeLabel(px: number): string {
  if (px <= 2) return 'xxs';
  if (px <= 4) return 'xs';
  if (px <= 8) return 'sm';
  if (px <= 12) return 'md';
  if (px <= 16) return 'default';
  if (px <= 24) return 'lg';
  if (px <= 32) return 'xl';
  if (px <= 48) return '2xl';
  if (px <= 64) return '3xl';
  return '4xl';
}

/**
 * Get radius size label based on pixel value
 */
function getRadiusSizeLabel(px: number): string {
  if (px <= 2) return 'xs';
  if (px <= 4) return 'sm';
  if (px <= 8) return 'md';
  if (px <= 12) return 'lg';
  if (px <= 16) return 'xl';
  if (px <= 24) return '2xl';
  if (px === 9999) return 'full';
  return 'custom';
}
