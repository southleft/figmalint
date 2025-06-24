/// <reference types="@figma/plugin-typings" />

import { ComponentContext, LayerHierarchy, ComponentMetadata, EnhancedAnalysisResult } from '../types';
import { extractTextContent, getAllChildNodes } from '../utils/figma-helpers';
import { extractDesignTokensFromNode } from './token-analyzer';

/**
 * Extract comprehensive component context for analysis
 */
export function extractComponentContext(node: SceneNode): ComponentContext {
  const hierarchy = extractLayerHierarchy(node);
  const nestedLayers = getLayerNames(hierarchy);
  const textContent = extractTextContent(node).join(' ');

  // Basic frame structure
  const frameStructure = {
    width: 'width' in node ? node.width : 0,
    height: 'height' in node ? node.height : 0,
    layoutMode: 'layoutMode' in node ? (node.layoutMode || 'NONE') : 'NONE'
  };

  // Detect styles
  const detectedStyles = {
    hasFills: hasFillsInNode(node),
    hasStrokes: hasStrokesInNode(node),
    hasEffects: hasEffectsInNode(node),
    cornerRadius: 'cornerRadius' in node ? (node.cornerRadius as number || 0) : 0
  };

  // Detect potential slots and variants
  const detectedSlots = detectSlots(node);
  const { isComponentSet, potentialVariants } = detectVariantPatterns(node);

  // Extract additional context
  const additionalContext = extractAdditionalContext(node);

  return {
    name: node.name,
    type: node.type,
    hierarchy,
    textContent: textContent || undefined,
    frameStructure,
    detectedStyles,
    detectedSlots,
    isComponentSet,
    potentialVariants,
    nestedLayers,
    additionalContext
  };
}

/**
 * Extract additional context to help AI make better decisions
 */
function extractAdditionalContext(node: SceneNode): any {
  const context: any = {
    hasInteractiveElements: false,
    possibleUseCase: '',
    designPatterns: [],
    componentFamily: '',
    suggestedConsiderations: []
  };

  const nodeName = node.name.toLowerCase();

  // Detect component family/type
  if (nodeName.includes('avatar') || nodeName.includes('profile')) {
    context.componentFamily = 'avatar';
    context.possibleUseCase = 'User representation, often clickable for profile access or dropdown menus';
    context.hasInteractiveElements = true;
    context.suggestedConsiderations.push('Consider if this avatar will be clickable/interactive');
    context.suggestedConsiderations.push('May need hover/focus states for navigation');
    context.designPatterns.push('profile-navigation', 'user-menu-trigger');
  } else if (nodeName.includes('button') || nodeName.includes('btn')) {
    context.componentFamily = 'button';
    context.possibleUseCase = 'Interactive element for user actions';
    context.hasInteractiveElements = true;
    context.suggestedConsiderations.push('Requires all interactive states');
    context.designPatterns.push('action-trigger', 'form-submission');
  } else if (nodeName.includes('badge') || nodeName.includes('tag')) {
    context.componentFamily = 'badge';
    context.possibleUseCase = 'Status indicator or label';
    context.hasInteractiveElements = false;
    context.suggestedConsiderations.push('Typically non-interactive unless used as a filter');
    context.designPatterns.push('status-indicator', 'category-label');
  } else if (nodeName.includes('input') || nodeName.includes('field')) {
    context.componentFamily = 'input';
    context.possibleUseCase = 'Form input element';
    context.hasInteractiveElements = true;
    context.suggestedConsiderations.push('Needs focus, error, and disabled states');
    context.designPatterns.push('form-control', 'data-entry');
  } else if (nodeName.includes('card')) {
    context.componentFamily = 'card';
    context.possibleUseCase = 'Content container';
    context.hasInteractiveElements = nodeName.includes('clickable') || nodeName.includes('interactive');
    context.suggestedConsiderations.push('May be interactive if used for navigation');
    context.designPatterns.push('content-container', 'information-display');
  } else if (nodeName.includes('icon')) {
    context.componentFamily = 'icon';
    context.possibleUseCase = 'Visual indicator or decoration';
    context.hasInteractiveElements = false;
    context.suggestedConsiderations.push('Usually decorative, but may be interactive if part of a button');
    context.designPatterns.push('visual-indicator', 'decoration');
  }

  // Check for interactive indicators in structure
  if ('children' in node) {
    const hasTextWithAction = node.findAll(n =>
      n.type === 'TEXT' && (n.name.toLowerCase().includes('click') ||
      n.name.toLowerCase().includes('action') ||
      n.name.toLowerCase().includes('link'))
    ).length > 0;

    if (hasTextWithAction) {
      context.hasInteractiveElements = true;
    }
  }

  // Check if it's part of a larger interactive component
  if (node.parent && node.parent.name.toLowerCase().includes('button')) {
    context.hasInteractiveElements = true;
    context.suggestedConsiderations.push('Part of a button component - needs interactive states');
  }

  return context;
}

/**
 * Extract layer hierarchy for component structure analysis
 */
function extractLayerHierarchy(node: SceneNode, depth: number = 0): LayerHierarchy[] {
  const hierarchy: LayerHierarchy[] = [];

  const nodeInfo: LayerHierarchy = {
    name: node.name,
    type: node.type,
    depth
  };

  if ('children' in node && node.children.length > 0) {
    nodeInfo.children = [];
    for (const child of node.children) {
      nodeInfo.children.push(...extractLayerHierarchy(child, depth + 1));
    }
  }

  hierarchy.push(nodeInfo);
  return hierarchy;
}

/**
 * Get flattened list of layer names
 */
function getLayerNames(hierarchy: LayerHierarchy[]): string[] {
  const names: string[] = [];

  function traverse(layers: LayerHierarchy[]) {
    for (const layer of layers) {
      names.push(layer.name);
      if (layer.children) {
        traverse(layer.children);
      }
    }
  }

  traverse(hierarchy);
  return names;
}

/**
 * Detect potential component variants from structure
 */
function detectVariantPatterns(node: SceneNode): { isComponentSet: boolean; potentialVariants: string[] } {
  const potentialVariants: string[] = [];
  let isComponentSet = false;

  if (node.type === 'COMPONENT_SET') {
    isComponentSet = true;
    try {
      const componentSet = node as ComponentSetNode;
      const variantProps = componentSet.variantGroupProperties;
      if (variantProps) {
        potentialVariants.push(...Object.keys(variantProps));
      }
    } catch (error) {
      console.warn('Error analyzing component set:', error);
    }
  } else {
    // Detect potential variants from layer names and structure
    const layerNames = getAllChildNodes(node).map(child => child.name.toLowerCase());

    // Common variant patterns
    const variantKeywords = [
      'primary', 'secondary', 'tertiary',
      'small', 'medium', 'large', 'xl', 'xs',
      'default', 'hover', 'focus', 'active', 'disabled',
      'filled', 'outline', 'ghost', 'link',
      'light', 'dark'
    ];

    variantKeywords.forEach(keyword => {
      if (layerNames.some(name => name.includes(keyword))) {
        if (!potentialVariants.includes(keyword)) {
          potentialVariants.push(keyword);
        }
      }
    });
  }

  return { isComponentSet, potentialVariants };
}

/**
 * Detect potential slots for content areas
 */
function detectSlots(node: SceneNode): string[] {
  const slots: string[] = [];
  const allNodes = getAllChildNodes(node);

  // Look for text nodes that might be content slots
  const textNodes = allNodes.filter(child => child.type === 'TEXT');
  textNodes.forEach(textNode => {
    const name = textNode.name.toLowerCase();
    if (name.includes('title') || name.includes('label') || name.includes('text') || name.includes('content')) {
      slots.push(textNode.name);
    }
  });

  // Look for frame nodes that might be content containers
  const frameNodes = allNodes.filter(child => child.type === 'FRAME');
  frameNodes.forEach(frameNode => {
    const name = frameNode.name.toLowerCase();
    if (name.includes('content') || name.includes('slot') || name.includes('container')) {
      slots.push(frameNode.name);
    }
  });

  return slots;
}

/**
 * Check if node has fills
 */
function hasFillsInNode(node: SceneNode): boolean {
  if ('fills' in node && Array.isArray(node.fills) && node.fills.length > 0) {
    return node.fills.some(fill => fill.visible !== false);
  }

  if ('children' in node) {
    return node.children.some(child => hasFillsInNode(child));
  }

  return false;
}

/**
 * Check if node has strokes
 */
function hasStrokesInNode(node: SceneNode): boolean {
  if ('strokes' in node && Array.isArray(node.strokes) && node.strokes.length > 0) {
    return node.strokes.some(stroke => stroke.visible !== false);
  }

  if ('children' in node) {
    return node.children.some(child => hasStrokesInNode(child));
  }

  return false;
}

/**
 * Check if node has effects
 */
function hasEffectsInNode(node: SceneNode): boolean {
  if ('effects' in node && Array.isArray(node.effects) && node.effects.length > 0) {
    return node.effects.some(effect => effect.visible !== false);
  }

  if ('children' in node) {
    return node.children.some(child => hasEffectsInNode(child));
  }

  return false;
}

/**
 * Validate metadata structure
 */
export function isValidMetadata(metadata: any): metadata is ComponentMetadata {
  if (!metadata || typeof metadata !== 'object') return false;

  // Check required fields
  const requiredFields = ['component', 'description'];
  for (const field of requiredFields) {
    if (!metadata[field]) return false;
  }

  // Check array fields
  const arrayFields = ['props', 'states', 'slots'];
  for (const field of arrayFields) {
    if (metadata[field] && !Array.isArray(metadata[field])) return false;
  }

  return true;
}

/**
 * Extract actual properties from a Figma component or component set
 */
function extractActualComponentProperties(node: SceneNode): Array<{ name: string; values: string[]; default: string }> {
  const actualProperties: Array<{ name: string; values: string[]; default: string }> = [];

  if (node.type === 'COMPONENT_SET') {
    const componentSet = node as ComponentSetNode;
    const variantProps = componentSet.variantGroupProperties;

    // Extract real variant properties from the component set
    if (variantProps) {
      for (const propName in variantProps) {
        const prop = variantProps[propName];
        actualProperties.push({
          name: propName,
          values: prop.values,
          default: prop.values[0] || 'default'
        });
      }
    }
  } else if (node.type === 'COMPONENT') {
    // For individual components, check if they're part of a component set
    const component = node as ComponentNode;
    if (component.parent && component.parent.type === 'COMPONENT_SET') {
      const componentSet = component.parent as ComponentSetNode;
      const variantProps = componentSet.variantGroupProperties;

      if (variantProps) {
        for (const propName in variantProps) {
          const prop = variantProps[propName];
          actualProperties.push({
            name: propName,
            values: prop.values,
            default: prop.values[0] || 'default'
          });
        }
      }
    }
  } else if (node.type === 'INSTANCE') {
    // For instances, get properties from the main component
    const instance = node as InstanceNode;
    const mainComponent = instance.mainComponent;

    if (mainComponent && mainComponent.parent && mainComponent.parent.type === 'COMPONENT_SET') {
      const componentSet = mainComponent.parent as ComponentSetNode;
      const variantProps = componentSet.variantGroupProperties;

      if (variantProps) {
        for (const propName in variantProps) {
          const prop = variantProps[propName];

          // Get the current value for this instance
          let currentValue = prop.values[0];
          try {
            // Try to get the current variant property value
            const variantProperties = (instance as any).variantProperties;
            if (variantProperties && variantProperties[propName]) {
              currentValue = variantProperties[propName];
            }
          } catch (e) {
            // Fallback to default
          }

          actualProperties.push({
            name: propName,
            values: prop.values,
            default: currentValue || prop.values[0] || 'default'
          });
        }
      }
    }
  }

  // Add common component properties detected from structure
  const detectedProperties = detectAdditionalProperties(node);
  actualProperties.push(...detectedProperties);

  return actualProperties;
}

/**
 * Detect additional properties from component structure (like icon, text content, etc.)
 */
function detectAdditionalProperties(node: SceneNode): Array<{ name: string; values: string[]; default: string }> {
  const properties: Array<{ name: string; values: string[]; default: string }> = [];
  const allNodes = getAllChildNodes(node);

  // Detect icon property
  const iconNodes = allNodes.filter(child => 
    child.type === 'VECTOR' || 
    child.type === 'FRAME' || 
    child.name.toLowerCase().includes('icon') ||
    child.name.toLowerCase().includes('symbol')
  );

  if (iconNodes.length > 0) {
    // Check if there are multiple different icon variants
    const iconNames = iconNodes.map(n => n.name).filter((name, index, arr) => 
      arr.indexOf(name) === index
    );
    
    properties.push({
      name: 'icon',
      values: iconNames.length > 1 ? iconNames : ['arrow-right', 'chevron-down', 'plus', 'close'],
      default: iconNames[0] || 'arrow-right'
    });
  }

  // Detect text content property
  const textNodes = allNodes.filter(child => child.type === 'TEXT');
  if (textNodes.length > 0) {
    properties.push({
      name: 'label',
      values: ['Button text', 'Custom label'],
      default: 'Button text'
    });
  }

  return properties;
}

/**
 * Extract actual states from a component
 */
function extractActualComponentStates(node: SceneNode): string[] {
  const actualStates: string[] = [];

  if (node.type === 'COMPONENT_SET') {
    const componentSet = node as ComponentSetNode;
    const variantProps = componentSet.variantGroupProperties;

    // Look for state-related properties
    if (variantProps) {
      for (const propName in variantProps) {
        const lowerPropName = propName.toLowerCase();
        if (lowerPropName === 'state' || lowerPropName === 'states' || lowerPropName === 'status') {
          actualStates.push(...variantProps[propName].values);
        }
      }
    }

    // Also check individual variant names for common state patterns
    componentSet.children.forEach(variant => {
      const variantName = variant.name.toLowerCase();
      ['default', 'hover', 'focus', 'disabled', 'pressed', 'active', 'selected'].forEach(state => {
        // Case-insensitive check to avoid duplicates
        const existingState = actualStates.find(existing => existing.toLowerCase() === state.toLowerCase());
        if (variantName.includes(state) && !existingState) {
          actualStates.push(state);
        }
      });
    });
  } else if (node.type === 'COMPONENT') {
    // For individual components, check if they're part of a component set with states
    const component = node as ComponentNode;
    if (component.parent && component.parent.type === 'COMPONENT_SET') {
      return extractActualComponentStates(component.parent);
    }
  } else if (node.type === 'INSTANCE') {
    // For instances, get states from the main component
    const instance = node as InstanceNode;
    const mainComponent = instance.mainComponent;
    if (mainComponent) {
      return extractActualComponentStates(mainComponent);
    }
  }

  // Final deduplication with case-insensitive comparison
  const uniqueStates: string[] = [];
  actualStates.forEach(state => {
    if (state && typeof state === 'string' && state.trim() !== '') {
      const existingState = uniqueStates.find(existing => existing.toLowerCase() === state.toLowerCase());
      if (!existingState) {
        uniqueStates.push(state.trim());
      }
    }
  });

  return uniqueStates;
}

/**
 * Process enhanced analysis data into structured result
 */
export async function processEnhancedAnalysis(
  claudeData: any,
  node: SceneNode
): Promise<EnhancedAnalysisResult> {
  // Extract tokens from the actual node
  const tokens = await extractDesignTokensFromNode(node);

  // Get component context for analysis
  const context = extractAdditionalContext(node);

  // EXTRACT ACTUAL FIGMA DATA (source of truth)
  const actualProperties = extractActualComponentProperties(node);
  const actualStates = extractActualComponentStates(node);

  // Build audit results with proper separation of facts vs recommendations
  const audit = {
    states: [] as Array<{ name: string; found: boolean }>,
    accessibility: [] as Array<{ check: string; status: 'pass' | 'fail' | 'warning'; suggestion: string }>,
    naming: [] as Array<{ layer: string; issue: string; suggestion: string }>,
    consistency: [] as Array<{ property: string; issue: string; suggestion: string }>
  };

  // STATES AUDIT: Show actual states first, then recommendations
  if (actualStates.length > 0) {
    // Component has actual states - show them as found
    actualStates.forEach(state => {
      audit.states.push({
        name: state,
        found: true
      });
    });
  } else {
    // No actual states found
    const shouldHaveStates = context.hasInteractiveElements &&
                            context.componentFamily !== 'badge' &&
                            context.componentFamily !== 'icon';

    if (shouldHaveStates) {
      // Show recommended states as missing for interactive components
      const recommendedStates = ['default', 'hover', 'focus', 'disabled'];
      recommendedStates.forEach(state => {
        audit.states.push({
          name: state,
          found: false
        });
      });
    } else {
      // For non-interactive components, show positive message
      audit.states.push({
        name: 'default',
        found: true
      });
    }
  }

  // ACCESSIBILITY AUDIT: Process Claude's suggestions safely
  if (claudeData.audit && Array.isArray(claudeData.audit.accessibilityIssues)) {
    claudeData.audit.accessibilityIssues.forEach((issue: any) => {
      if (typeof issue === 'string' && issue.trim()) {
        audit.accessibility.push({
          check: issue,
          status: 'warning',
          suggestion: 'Review accessibility requirements'
        });
      }
    });
  }

  // NAMING AUDIT: Process Claude's suggestions safely
  if (claudeData.audit && Array.isArray(claudeData.audit.namingIssues) && claudeData.audit.namingIssues.length > 0) {
    claudeData.audit.namingIssues.forEach((issue: any) => {
      if (typeof issue === 'string' && issue.trim() && issue.toLowerCase() !== 'undefined') {
        audit.naming.push({
          layer: node.name,
          issue: issue,
          suggestion: 'Follow naming conventions'
        });
      }
    });
  }
  
  // If no issues were found or processed, show positive result
  if (audit.naming.length === 0) {
    audit.naming.push({
      layer: node.name,
      issue: 'Component naming follows conventions',
      suggestion: 'Good naming structure'
    });
  }

  // CONSISTENCY AUDIT: Process Claude's suggestions safely
  if (claudeData.audit && Array.isArray(claudeData.audit.consistencyIssues) && claudeData.audit.consistencyIssues.length > 0) {
    claudeData.audit.consistencyIssues.forEach((issue: any) => {
      if (typeof issue === 'string' && issue.trim() && issue.toLowerCase() !== 'undefined') {
        audit.consistency.push({
          property: 'Design consistency',
          issue: issue,
          suggestion: 'Review design system standards'
        });
      }
    });
  }
  
  // If no issues were found or processed, show positive result
  if (audit.consistency.length === 0) {
    audit.consistency.push({
      property: 'Design consistency',
      issue: 'Component follows design system patterns',
      suggestion: 'Consistent with design standards'
    });
  }

  // Clean and validate metadata from Claude
  const cleanMetadata: ComponentMetadata = {
    component: claudeData.component || node.name,
    description: claudeData.description || 'Component analysis',
    props: actualProperties.map(prop => ({
      name: prop.name,
      type: prop.values.length > 1 ? 'variant' : 'string',
      description: `Property with values: ${prop.values.join(', ')}`,
      defaultValue: prop.default,
      required: false
    })),
    propertyCheatSheet: actualProperties.map(prop => ({
      name: prop.name,
      values: prop.values,
      default: prop.default,
      description: `Available values: ${prop.values.join(', ')}`
    })),
    states: actualStates.length > 0 ? actualStates : (context.componentFamily === 'badge' ? ['default'] : []),
    slots: claudeData.slots || [],
    variants: actualProperties.reduce((acc, prop) => {
      acc[prop.name] = prop.values;
      return acc;
    }, {} as Record<string, string[]>),
    usage: claudeData.usage || `This ${context.componentFamily || 'component'} is used for ${context.possibleUseCase || 'displaying content'}.`,
    accessibility: {
      ariaLabels: claudeData.accessibility?.ariaLabels || [],
      keyboardSupport: claudeData.accessibility?.keyboardSupport || 'Standard keyboard navigation',
      colorContrast: claudeData.accessibility?.colorContrast || 'WCAG AA compliant',
      focusManagement: claudeData.accessibility?.focusManagement || 'Proper focus indicators'
    },
    tokens: {
      colors: claudeData.tokens?.colors || [],
      spacing: claudeData.tokens?.spacing || [],
      typography: claudeData.tokens?.typography || [],
      effects: claudeData.tokens?.effects || [],
      borders: claudeData.tokens?.borders || []
    },
    audit: {
      accessibilityIssues: claudeData.audit?.accessibilityIssues || [],
      namingIssues: claudeData.audit?.namingIssues || [],
      consistencyIssues: claudeData.audit?.consistencyIssues || [],
      tokenOpportunities: claudeData.audit?.tokenOpportunities || []
    },
    mcpReadiness: claudeData.mcpReadiness ? {
      score: parseInt(claudeData.mcpReadiness.score) || 0,
      strengths: claudeData.mcpReadiness.strengths || [],
      gaps: claudeData.mcpReadiness.gaps || [],
      recommendations: claudeData.mcpReadiness.recommendations || [],
      implementationNotes: claudeData.mcpReadiness.implementationNotes || ''
    } : undefined
  };

  return {
    metadata: cleanMetadata,
    tokens,
    audit,
    properties: actualProperties // This will be used by the UI for the property cheat sheet
  };
}
