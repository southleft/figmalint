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
 * Process enhanced analysis data into structured result
 */
export async function processEnhancedAnalysis(
  claudeData: any,
  node: SceneNode
): Promise<EnhancedAnalysisResult> {
  // Extract tokens from the actual node
  const tokens = await extractDesignTokensFromNode(node);

  // Build audit results
  const audit = {
    states: [] as Array<{ name: string; found: boolean }>,
    accessibility: [] as Array<{ check: string; status: 'pass' | 'fail' | 'warning'; suggestion: string }>,
    naming: [] as Array<{ layer: string; issue: string; suggestion: string }>,
    consistency: [] as Array<{ property: string; issue: string; suggestion: string }>
  };

  // Get actual component variants from the node itself
  const actualStates: string[] = [];
  
  // If it's a component set, get the actual variant properties
  if (node.type === 'COMPONENT_SET') {
    const componentSet = node as ComponentSetNode;
    const variantProps = componentSet.variantGroupProperties;
    
    // Look for state-related variant properties
    for (const propName in variantProps) {
      const prop = variantProps[propName];
      if (propName.toLowerCase() === 'state' || propName.toLowerCase() === 'states') {
        actualStates.push(...prop.values);
      }
    }
    
    // Also check individual variant names
    componentSet.children.forEach(variant => {
      const variantName = variant.name.toLowerCase();
      ['default', 'hover', 'focus', 'disabled', 'pressed', 'active'].forEach(state => {
        if (variantName.includes(state) && !actualStates.includes(state)) {
          actualStates.push(state);
        }
      });
    });
  }
  
  // Get recommended states from Claude's analysis
  const recommendedStates = claudeData.states || [];
  
  // For component sets with existing states, audit them
  if (actualStates.length > 0) {
    // Check common interactive states
    const expectedStates = ['default', 'hover', 'focus', 'disabled'];
    expectedStates.forEach(state => {
      audit.states.push({
        name: state,
        found: actualStates.includes(state)
      });
    });
    
    // Add any additional states found
    actualStates.forEach(state => {
      if (!expectedStates.includes(state)) {
        audit.states.push({
          name: state,
          found: true
        });
      }
    });
  } else if (recommendedStates.length > 0) {
    // For single components, show recommended states as missing
    recommendedStates.forEach((state: string) => {
      audit.states.push({
        name: state,
        found: false
      });
    });
  }

  // Process accessibility audit
  if (claudeData.audit?.accessibilityIssues) {
    claudeData.audit.accessibilityIssues.forEach((issue: string) => {
      audit.accessibility.push({
        check: issue,
        status: 'fail',
        suggestion: 'Fix required'
      });
    });
  }

  // Process naming audit
  if (claudeData.audit?.namingIssues) {
    claudeData.audit.namingIssues.forEach((issue: string) => {
      // Try to extract layer name from the issue string
      let layerName = 'Component';
      let suggestion = 'Follow naming conventions';
      
      // Common patterns in naming issues
      const layerMatch = issue.match(/["']([^"']+)["']/); // Match quoted layer names
      if (layerMatch) {
        layerName = layerMatch[1];
      } else if (issue.toLowerCase().includes('component')) {
        layerName = node.name;
      }
      
      // Extract suggestion if present
      const suggestionMatch = issue.match(/should be ([\w-]+)/i);
      if (suggestionMatch) {
        suggestion = suggestionMatch[1];
      }
      
      audit.naming.push({
        layer: layerName,
        issue: issue,
        suggestion: suggestion
      });
    });
  }

  // Generate suggestions
  const suggestions: Array<{
    category: 'token' | 'accessibility' | 'naming' | 'state';
    priority: 'high' | 'medium' | 'low';
    title: string;
    description: string;
    action?: string;
  }> = [
    {
      category: 'token',
      priority: 'high',
      title: 'Token Implementation',
      description: `Found ${tokens.summary.hardCodedValues} hard-coded values that could use design tokens`,
      action: 'Review token recommendations'
    }
  ];

  // Add accessibility suggestions if issues found
  if (audit.accessibility.length > 0) {
    suggestions.push({
      category: 'accessibility',
      priority: 'high',
      title: 'Accessibility Improvements',
      description: `${audit.accessibility.length} accessibility issues need attention`,
      action: 'Review accessibility audit'
    });
  }

  return {
    metadata: claudeData,
    tokens,
    audit,
    suggestions
  };
}
