/// <reference types="@figma/plugin-typings" />

import { ComponentContext, LayerHierarchy, ComponentMetadata, EnhancedAnalysisResult, DetailedAuditResults, AuditCheck, DetachedInstanceInfo, TokenAnalysis, DesignToken, EnhancedAnalysisOptions } from '../types';
import { extractTextContent, getAllChildNodes, sendMessageToUI } from '../utils/figma-helpers';
import { debugLog } from '../utils/debug';
import { extractDesignTokensFromNode } from './token-analyzer';
import { extractJSONFromResponse, createEnhancedMetadataPrompt, filterDevelopmentRecommendations } from '../api/claude';
import { callProvider, ProviderId } from '../api/providers';
import { consistencyEngine } from './consistency-engine';
import { analyzeNamingIssues } from '../fixes/naming-fixer';
import { findMatchingColorVariable, findBestMatchingVariable, colorFieldFromPropertyPath } from '../fixes/token-fixer';

/**
 * Extract comprehensive component context for analysis
 */
export async function extractComponentContext(node: SceneNode): Promise<ComponentContext> {
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
  const additionalContext = await extractAdditionalContext(node);

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
async function extractAdditionalContext(node: SceneNode): Promise<any> {
  const context: any = {
    hasInteractiveElements: false,
    possibleUseCase: '',
    designPatterns: [],
    componentFamily: '',
    suggestedConsiderations: []
  };

  const nodeName = node.name.toLowerCase();

  // Expanded container component detection patterns
  const containerPatterns = [
    'tabs', 'tab-group', 'tabset',
    'nav', 'navbar', 'navigation', 'menu', 'menubar', 'dropdown',
    'form', 'form-group', 'fieldset',
    'list', 'grid', 'collection', 'gallery',
    'group', 'container', 'wrapper', 'layout',
    'toolbar', 'panel', 'sidebar', 'header', 'footer',
    'card-group', 'button-group', 'radio-group', 'checkbox-group'
  ];

  // Name-based container detection
  const isContainerByName = containerPatterns.some(pattern => nodeName.includes(pattern));

  // Structural container detection by analyzing nested instances
  const isContainerByStructure = await analyzeContainerStructure(node);

  // Combine both approaches
  const isContainer = isContainerByName || isContainerByStructure;

  debugLog(`🔍 [CONTAINER DETECTION] ${node.name}:`);
  debugLog(`  Name-based: ${isContainerByName}`);
  debugLog(`  Structure-based: ${isContainerByStructure}`);
  debugLog(`  Final result: ${isContainer}`);

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
  } else if (isContainer) {
    context.componentFamily = 'container';
    context.possibleUseCase = 'Layout container for organizing child components';
    context.hasInteractiveElements = false; // Containers typically don't have direct interactions
    context.suggestedConsiderations.push('Focus on layout and organization rather than interaction states');
    context.suggestedConsiderations.push('Child components handle individual interactions');
    context.designPatterns.push('layout-container', 'component-organization');
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
 * Analyze component structure to determine if it's a container
 * Based on nested instances and their patterns
 */
async function analyzeContainerStructure(node: SceneNode): Promise<boolean> {
  if (!('children' in node) || !node.children || node.children.length === 0) {
    return false;
  }

  // Get all direct child instances (not nested deeper)
  const childInstances = node.children.filter(child => child.type === 'INSTANCE') as InstanceNode[];

  if (childInstances.length === 0) {
    debugLog(`🔍 [STRUCTURE] No child instances found in ${node.name}`);
    return false;
  }

  debugLog(`🔍 [STRUCTURE] Analyzing ${node.name} with ${childInstances.length} child instances`);

  // Group instances by their main component name
  const instanceGroups = new Map<string, InstanceNode[]>();

  // Use Promise.all to handle async operations
  await Promise.all(childInstances.map(async (instance) => {
    try {
      const mainComponent = await instance.getMainComponentAsync();
      if (mainComponent) {
        const componentName = mainComponent.name;
        if (!instanceGroups.has(componentName)) {
          instanceGroups.set(componentName, []);
        }
        instanceGroups.get(componentName)!.push(instance);
      }
    } catch (error) {
      // Ignore instances with inaccessible main components
      debugLog(`⚠️ [STRUCTURE] Could not access main component for instance:`, error);
    }
  }));

  debugLog(`🔍 [STRUCTURE] Instance groups:`, Array.from(instanceGroups.entries()).map(([name, instances]) => `${name}: ${instances.length}`));

  // Container indicators:

  // 1. Multiple instances of the same component type (like multiple tabs)
  const hasRepeatedComponents = Array.from(instanceGroups.values()).some(group => group.length > 1);

  // 2. Component names suggest organizational/container patterns
  const hasOrganizationalComponents = Array.from(instanceGroups.keys()).some(name => {
    const lowerName = name.toLowerCase();
    return lowerName.includes('item') ||
           lowerName.includes('panel') ||
           lowerName.includes('content') ||
           lowerName.includes('section') ||
           lowerName.includes('group') ||
           lowerName.includes('wrapper') ||
           // Tab-specific patterns
           (lowerName.includes('tab') && !lowerName.includes('button')) ||
           // Navigation patterns
           lowerName.includes('nav-item') ||
           lowerName.includes('menu-item') ||
           // List patterns
           lowerName.includes('list-item') ||
           // Card patterns
           lowerName.includes('card-item');
  });

  // 3. High ratio of instances to total children (suggests this is primarily organizing components)
  const instanceRatio = childInstances.length / node.children.length;
  const isInstanceHeavy = instanceRatio > 0.6; // More than 60% of children are component instances

  // 4. Has components that suggest they're managed as a collection
  const hasCollectionPattern = instanceGroups.size >= 2 && hasRepeatedComponents;

  debugLog(`🔍 [STRUCTURE] Analysis for ${node.name}:`);
  debugLog(`  Repeated components: ${hasRepeatedComponents}`);
  debugLog(`  Organizational components: ${hasOrganizationalComponents}`);
  debugLog(`  Instance ratio: ${instanceRatio.toFixed(2)} (${isInstanceHeavy ? 'high' : 'low'})`);
  debugLog(`  Collection pattern: ${hasCollectionPattern}`);

  // A component is likely a container if it has any of these strong indicators:
  const isContainer = hasRepeatedComponents || hasOrganizationalComponents || (isInstanceHeavy && instanceGroups.size >= 2);

  return isContainer;
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
 * Extract unique INSTANCE node names from a layer hierarchy.
 * Used to inform AI prompts about nested/child component instances.
 */
export function extractInstanceNames(hierarchy: LayerHierarchy[]): string[] {
  const names = new Set<string>();

  function traverse(layers: LayerHierarchy[]) {
    for (const layer of layers) {
      if (layer.type === 'INSTANCE') {
        names.add(layer.name);
      }
      if (layer.children) {
        traverse(layer.children);
      }
    }
  }

  traverse(hierarchy);
  return Array.from(names);
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
      // Safely access variantGroupProperties with error handling
      let variantProps: Record<string, {values: string[]}> | undefined;
      try {
        variantProps = componentSet.variantGroupProperties;
      } catch (variantError) {
        console.warn('Component set has errors, cannot access variantGroupProperties:', variantError);
        variantProps = undefined;
      }

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
 * Only detect legitimate content slots, not component structure elements
 */
function detectSlots(node: SceneNode): string[] {
  const slots: string[] = [];
  const allNodes = getAllChildNodes(node);
  const componentName = node.name.toLowerCase();

  // List of terms that indicate component structure, not content slots
  const structuralTerms = [
    'radiobutton', 'checkbox', 'icon', 'button', 'input', 'focusring', 'focus',
    'indicator', 'background', 'border', 'outline', 'shadow', 'ring',
    'control', 'handle', 'thumb', 'track', 'progress', 'slider',
    'arrow', 'chevron', 'close', 'minimize', 'maximize'
  ];

  // Look for text nodes that might be content slots (but exclude structural elements)
  const textNodes = allNodes.filter(child => child.type === 'TEXT');
  textNodes.forEach(textNode => {
    const name = textNode.name.toLowerCase();

    // Skip if this looks like a structural element
    if (structuralTerms.some(term => name.includes(term))) {
      return;
    }

    // Skip if the name is too similar to the component name (likely not a slot)
    if (componentName.includes(name) || name.includes(componentName.split(' ')[0])) {
      return;
    }

    // Only include if it looks like actual content
    if ((name.includes('title') || name.includes('label') || name.includes('text') || name.includes('content')) &&
        name.length > 2) { // Avoid single letters or very short names
      slots.push(textNode.name);
    }
  });

  // Look for frame nodes that might be content containers (be more selective)
  const frameNodes = allNodes.filter(child => child.type === 'FRAME');
  frameNodes.forEach(frameNode => {
    const name = frameNode.name.toLowerCase();

    // Skip structural elements
    if (structuralTerms.some(term => name.includes(term))) {
      return;
    }

    // Only include frames that are clearly content containers
    if ((name.includes('content') && !name.includes('background')) ||
        name.includes('slot') ||
        (name.includes('container') && !name.includes('main'))) {
      slots.push(frameNode.name);
    }
  });

  // Deduplicate and filter out very generic names
  const filteredSlots = [...new Set(slots)].filter(slot => {
    const lowerSlot = slot.toLowerCase();
    return lowerSlot.length > 2 &&
           !['text', 'label', 'content'].includes(lowerSlot) && // Too generic
           !structuralTerms.some(term => lowerSlot.includes(term));
  });

  debugLog(`🔍 [SLOTS] Detected ${filteredSlots.length} legitimate content slots from ${slots.length} candidates:`, filteredSlots);

  return filteredSlots;
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
 * Extract properties from variant names when variantGroupProperties is not accessible
 */
function extractPropertiesFromVariantNames(componentSet: ComponentSetNode): Array<{ name: string; values: string[]; default: string }> {
  const properties: Map<string, Set<string>> = new Map();

  // Parse variant names to extract properties
  componentSet.children.forEach(variant => {
    if (variant.type === 'COMPONENT') {
      const variantName = variant.name;
      // Common pattern: "Property1=Value1, Property2=Value2"
      const pairs = variantName.split(',').map(s => s.trim());

      pairs.forEach(pair => {
        const [key, value] = pair.split('=').map(s => s.trim());
        if (key && value) {
          if (!properties.has(key)) {
            properties.set(key, new Set());
          }
          properties.get(key)!.add(value);
        }
      });
    }
  });

  // Convert to array format
  const result: Array<{ name: string; values: string[]; default: string }> = [];
  properties.forEach((values, name) => {
    const valueArray = Array.from(values);
    result.push({
      name,
      values: valueArray,
      default: valueArray[0] || 'default'
    });
  });

  return result;
}

/**
 * Extract actual properties from a Figma component or component set
 * @param node The node to extract properties from (component set, component, or instance)
 * @param selectedNode The originally selected node (for accessing instance properties)
 */
async function extractActualComponentProperties(node: SceneNode, selectedNode?: SceneNode): Promise<Array<{ name: string; values: string[]; default: string }>> {
  const actualProperties: Array<{ name: string; values: string[]; default: string }> = [];

  debugLog('🔍 [DEBUG] Starting property extraction for node:', node.name, 'type:', node.type);
  debugLog('🔍 [DEBUG] Originally selected node:', selectedNode?.name, 'type:', selectedNode?.type);

  // PRIORITY 1: If we have a selected instance, extract from its componentProperties first
  if (selectedNode && selectedNode.type === 'INSTANCE') {
    const instance = selectedNode as InstanceNode;
    debugLog('🔍 [DEBUG] Extracting from selected instance componentProperties...');

    try {
      if ('componentProperties' in instance && instance.componentProperties) {
        const instanceProps = instance.componentProperties;
        debugLog('🔍 [DEBUG] Found componentProperties on selected instance:', Object.keys(instanceProps));

        // Get the component set for property definitions
        const mainComponent = await instance.getMainComponentAsync();
        if (mainComponent && mainComponent.parent && mainComponent.parent.type === 'COMPONENT_SET') {
          const componentSet = mainComponent.parent as ComponentSetNode;

          // Try to get property definitions from component set (even if errored)
          let propertyDefinitions: any = null;
          try {
            if ('componentPropertyDefinitions' in componentSet) {
              propertyDefinitions = componentSet.componentPropertyDefinitions;
              debugLog('🔍 [DEBUG] Got componentPropertyDefinitions from component set');
            }
          } catch (error) {
            debugLog('🔍 [DEBUG] Could not access componentPropertyDefinitions, using instance properties only');
          }

          // Extract properties from instance
          for (const propName in instanceProps) {
            const instanceProp = instanceProps[propName];
            debugLog(`🔍 [DEBUG] Processing instance property "${propName}":`, instanceProp);

            let displayName = propName;
            let values: string[] = [];
            let currentValue = '';

            // Clean up property name (remove unique identifier for display)
            if (propName.includes('#')) {
              displayName = propName.split('#')[0];
            }

            // Get current value from instance
            if (instanceProp && typeof instanceProp === 'object' && 'value' in instanceProp) {
              currentValue = String(instanceProp.value);
            } else {
              currentValue = String(instanceProp);
            }

            // Try to get property definition for values
            if (propertyDefinitions && propertyDefinitions[propName]) {
              const propDef = propertyDefinitions[propName];
              debugLog(`🔍 [DEBUG] Found property definition for "${propName}":`, propDef);

              switch (propDef.type) {
                case 'VARIANT':
                  values = propDef.variantOptions || [];
                  break;
                case 'BOOLEAN':
                  values = ['true', 'false'];
                  break;
                case 'TEXT':
                  values = [currentValue || 'Text content'];
                  break;
                case 'INSTANCE_SWAP':
                  if (propDef.preferredValues && Array.isArray(propDef.preferredValues)) {
                    values = propDef.preferredValues.map((v: any) => v.key || v.name || 'Component instance');
                  } else {
                    values = ['Component instance'];
                  }
                  break;
                default:
                  values = [currentValue || 'Property value'];
              }
            } else {
              // No property definition available, infer from current value
              debugLog(`🔍 [DEBUG] No property definition for "${propName}", inferring from value`);

              if (currentValue === 'true' || currentValue === 'false') {
                values = ['true', 'false'];
              } else {
                values = [currentValue || 'Property value'];
              }
            }

            actualProperties.push({
              name: displayName,
              values,
              default: currentValue || values[0] || 'default'
            });

            debugLog(`🔍 [DEBUG] Added instance property:`, { name: displayName, values, default: currentValue });
          }

          // If we successfully extracted from instance, return early
          if (actualProperties.length > 0) {
            debugLog(`🔍 [DEBUG] Successfully extracted ${actualProperties.length} properties from selected instance`);
            return actualProperties;
          }
        }
      }
    } catch (error) {
      debugLog('🔍 [DEBUG] Could not extract from instance componentProperties:', error);
    }
  }

  // PRIORITY 2: Continue with original extraction methods if instance extraction failed
  if (node.type === 'COMPONENT_SET') {
    const componentSet = node as ComponentSetNode;

    // Method 1: Try componentPropertyDefinitions (most comprehensive)
    debugLog('🔍 [DEBUG] Attempting to access componentPropertyDefinitions...');
    try {
      // Test if the property exists first
      if ('componentPropertyDefinitions' in componentSet) {
        debugLog('🔍 [DEBUG] componentPropertyDefinitions property exists on componentSet');

        const propertyDefinitions = componentSet.componentPropertyDefinitions;
        debugLog('🔍 [DEBUG] Raw componentPropertyDefinitions:', propertyDefinitions);
        debugLog('🔍 [DEBUG] Type of componentPropertyDefinitions:', typeof propertyDefinitions);

        if (propertyDefinitions && typeof propertyDefinitions === 'object') {
          const propKeys = Object.keys(propertyDefinitions);
          debugLog('🔍 [DEBUG] Found componentPropertyDefinitions with keys:', propKeys);

          for (const propName in propertyDefinitions) {
            const prop = propertyDefinitions[propName];
            debugLog(`🔍 [DEBUG] Processing property "${propName}":`, prop);

            let displayName = propName;
            let values: string[] = [];
            let defaultValue = '';

            // Clean up property name (remove unique identifier for display)
            if (propName.includes('#')) {
              displayName = propName.split('#')[0];
              debugLog(`🔍 [DEBUG] Cleaned display name: "${displayName}" from "${propName}"`);
            }

            switch (prop.type) {
              case 'VARIANT':
                values = prop.variantOptions || [];
                defaultValue = String(prop.defaultValue) || values[0] || 'default';
                debugLog(`🔍 [DEBUG] VARIANT property "${displayName}": values=${values}, default=${defaultValue}`);
                break;

              case 'BOOLEAN':
                values = ['true', 'false'];
                defaultValue = prop.defaultValue ? 'true' : 'false';
                debugLog(`🔍 [DEBUG] BOOLEAN property "${displayName}": default=${defaultValue}`);
                break;

              case 'TEXT':
                values = [String(prop.defaultValue || 'Text content')];
                defaultValue = String(prop.defaultValue || 'Text content');
                debugLog(`🔍 [DEBUG] TEXT property "${displayName}": value=${defaultValue}`);
                break;

              case 'INSTANCE_SWAP':
                // Handle instance swap properties
                if (prop.preferredValues && Array.isArray(prop.preferredValues)) {
                  values = prop.preferredValues.map((v: any) => {
                    debugLog(`🔍 [DEBUG] INSTANCE_SWAP preferred value:`, v);
                    return v.key || v.name || 'Component instance';
                  });
                } else {
                  values = ['Component instance'];
                }
                defaultValue = values[0] || 'Component instance';
                debugLog(`🔍 [DEBUG] INSTANCE_SWAP property "${displayName}": values=${values}, default=${defaultValue}`);
                break;

              default:
                debugLog(`🔍 [DEBUG] Unknown property type "${prop.type}" for "${displayName}"`);
                values = ['Property value'];
                defaultValue = 'Default';
            }

            actualProperties.push({
              name: displayName,
              values,
              default: defaultValue
            });

            debugLog(`🔍 [DEBUG] Added property:`, { name: displayName, values, default: defaultValue });
          }
        } else {
          debugLog('🔍 [DEBUG] componentPropertyDefinitions is not a valid object:', propertyDefinitions);
        }
      } else {
        debugLog('🔍 [DEBUG] componentPropertyDefinitions property does not exist on componentSet');
      }
    } catch (error) {
      console.error('🔍 [ERROR] Could not access componentPropertyDefinitions:', error);
      console.error('🔍 [ERROR] Error stack:', error instanceof Error ? error.stack : 'No stack trace');
    }

    // Method 2: Fallback to variantGroupProperties if componentPropertyDefinitions failed
    if (actualProperties.length === 0) {
      debugLog('🔍 [DEBUG] No properties found, trying variantGroupProperties fallback...');
      try {
        const variantProps = componentSet.variantGroupProperties;
        debugLog('🔍 [DEBUG] variantGroupProperties:', variantProps);

        if (variantProps) {
          const variantKeys = Object.keys(variantProps);
          debugLog('🔍 [DEBUG] Found variantGroupProperties with keys:', variantKeys);

          for (const propName in variantProps) {
            const prop = variantProps[propName];
            debugLog(`🔍 [DEBUG] Processing variant property "${propName}":`, prop);

            actualProperties.push({
              name: propName,
              values: prop.values,
              default: prop.values[0] || 'default'
            });
          }
        } else {
          debugLog('🔍 [DEBUG] variantGroupProperties is null/undefined');
        }
      } catch (error) {
        console.warn('🔍 [WARN] Component set has errors, cannot access variantGroupProperties:', error);
      }
    }

      // Method 2.5: Try to extract properties by analyzing variant differences
  if (actualProperties.length === 0 && componentSet.children.length > 0) {
    debugLog('🔍 [DEBUG] Analyzing variant structure to infer properties...');

    // Collect all unique layer structures and naming patterns
    const propertyPatterns = new Map<string, Set<string>>();
    const layerVisibilityPatterns = new Map<string, boolean[]>();

    // Analyze each variant to find property patterns
    componentSet.children.forEach((variant, index) => {
      if (variant.type === 'COMPONENT') {
        const variantName = variant.name;
        debugLog(`🔍 [DEBUG] Analyzing variant ${index}: ${variantName}`);

        // Parse variant name for property-value pairs
        const pairs = variantName.split(',').map(s => s.trim());
        pairs.forEach(pair => {
          const [key, value] = pair.split('=').map(s => s.trim());
          if (key && value) {
            if (!propertyPatterns.has(key)) {
              propertyPatterns.set(key, new Set());
            }
            propertyPatterns.get(key)!.add(value);
          }
        });

        // Analyze layer visibility patterns for boolean properties
        const checkLayerVisibility = (node: SceneNode, path: string = '') => {
          const fullPath = path ? `${path}/${node.name}` : node.name;

          if (!layerVisibilityPatterns.has(fullPath)) {
            layerVisibilityPatterns.set(fullPath, []);
          }
          layerVisibilityPatterns.get(fullPath)!.push(node.visible);

          if ('children' in node) {
            node.children.forEach(child => checkLayerVisibility(child, fullPath));
          }
        };

        checkLayerVisibility(variant);
      }
    });

    // Convert property patterns to actual properties
    propertyPatterns.forEach((values, key) => {
      if (!actualProperties.find(p => p.name === key)) {
        actualProperties.push({
          name: key,
          values: Array.from(values),
          default: Array.from(values)[0] || 'default'
        });
      }
    });

    // Infer boolean properties from visibility patterns
    layerVisibilityPatterns.forEach((visibilityArray, layerPath) => {
      // If a layer has different visibility states across variants, it's likely a boolean property
      const hasTrue = visibilityArray.includes(true);
      const hasFalse = visibilityArray.includes(false);

      if (hasTrue && hasFalse) {
        const layerName = layerPath.split('/').pop() || '';
        const propertyName = layerName
          .replace(/\s*(layer|group|frame|icon|text)?\s*/gi, '')
          .trim();

        if (propertyName && !actualProperties.find(p => p.name === propertyName)) {
          actualProperties.push({
            name: propertyName,
            values: ['true', 'false'],
            default: 'false'
          });
          debugLog(`🔍 [DEBUG] Inferred boolean property from visibility: ${propertyName}`);
        }
      }
    });

    debugLog(`🔍 [DEBUG] Inferred ${actualProperties.length} properties from variant analysis`);
  }

    // Method 3: Enhanced structural analysis when APIs fail
    if (actualProperties.length === 0) {
      debugLog('🔍 [DEBUG] All Figma APIs failed, using comprehensive structural analysis...');
      const structuralProperties = extractPropertiesFromStructuralAnalysis(componentSet);
      debugLog('🔍 [DEBUG] Properties from structural analysis:', structuralProperties);
      actualProperties.push(...structuralProperties);
    }

  } else if (node.type === 'COMPONENT') {
    const component = node as ComponentNode;
    debugLog('🔍 [DEBUG] Processing COMPONENT node:', component.name);

    // For individual components, try componentPropertyDefinitions first
    try {
      if ('componentPropertyDefinitions' in component) {
        const propertyDefinitions = component.componentPropertyDefinitions;
        debugLog('🔍 [DEBUG] Component componentPropertyDefinitions:', propertyDefinitions);

        if (propertyDefinitions && typeof propertyDefinitions === 'object') {
          const propKeys = Object.keys(propertyDefinitions);
          debugLog('🔍 [DEBUG] Found componentPropertyDefinitions on component with keys:', propKeys);

          for (const propName in propertyDefinitions) {
            const prop = propertyDefinitions[propName];

            let displayName = propName;
            let values: string[] = [];
            let defaultValue = '';

            // Clean up property name (remove unique identifier for display)
            if (propName.includes('#')) {
              displayName = propName.split('#')[0];
            }

            switch (prop.type) {
              case 'BOOLEAN':
                values = ['true', 'false'];
                defaultValue = prop.defaultValue ? 'true' : 'false';
                break;

              case 'TEXT':
                values = [String(prop.defaultValue || 'Text content')];
                defaultValue = String(prop.defaultValue || 'Text content');
                break;

              case 'INSTANCE_SWAP':
                if (prop.preferredValues && Array.isArray(prop.preferredValues)) {
                  values = prop.preferredValues.map((v: any) => v.key || v.name || 'Component instance');
                } else {
                  values = ['Component instance'];
                }
                defaultValue = values[0] || 'Component instance';
                break;

              default:
                values = ['Property value'];
                defaultValue = 'Default';
            }

            actualProperties.push({
              name: displayName,
              values,
              default: defaultValue
            });
          }
        }
      } else {
        debugLog('🔍 [DEBUG] componentPropertyDefinitions does not exist on component');
      }
    } catch (error) {
      console.warn('🔍 [WARN] Could not access componentPropertyDefinitions on component:', error);
    }

    // Check if component is part of a component set for variant properties
    if (component.parent && component.parent.type === 'COMPONENT_SET') {
      const componentSet = component.parent as ComponentSetNode;
      debugLog('🔍 [DEBUG] Component is part of a component set, getting variant properties...');

      try {
        const variantProps = componentSet.variantGroupProperties;
        if (variantProps) {
          for (const propName in variantProps) {
            const prop = variantProps[propName];
            // Only add if not already present
            if (!actualProperties.find(p => p.name === propName)) {
              actualProperties.push({
                name: propName,
                values: prop.values,
                default: prop.values[0] || 'default'
              });
            }
          }
        }
      } catch (error) {
        console.warn('🔍 [WARN] Component set has errors, cannot access variantGroupProperties:', error);
      }
    }

  } else if (node.type === 'INSTANCE') {
    const instance = node as InstanceNode;
    debugLog('🔍 [DEBUG] Processing INSTANCE node (fallback — Priority 1 may have been skipped)');

    // If Priority 1 didn't run (no selectedNode), extract from the instance directly
    if (actualProperties.length === 0) {
      try {
        const mainComponent = await instance.getMainComponentAsync();
        if (mainComponent) {
          // If main component belongs to a component set, extract from the set
          if (mainComponent.parent && mainComponent.parent.type === 'COMPONENT_SET') {
            const componentSet = mainComponent.parent as ComponentSetNode;
            debugLog('🔍 [DEBUG] Instance fallback: extracting from parent component set:', componentSet.name);

            try {
              if ('componentPropertyDefinitions' in componentSet) {
                const propertyDefinitions = componentSet.componentPropertyDefinitions;
                if (propertyDefinitions && typeof propertyDefinitions === 'object') {
                  for (const propName in propertyDefinitions) {
                    const prop = propertyDefinitions[propName];
                    let displayName = propName;
                    let values: string[] = [];
                    let defaultValue = '';

                    if (propName.includes('#')) {
                      displayName = propName.split('#')[0];
                    }

                    switch (prop.type) {
                      case 'VARIANT':
                        values = prop.variantOptions || [];
                        defaultValue = String(prop.defaultValue) || values[0] || 'default';
                        break;
                      case 'BOOLEAN':
                        values = ['true', 'false'];
                        defaultValue = prop.defaultValue ? 'true' : 'false';
                        break;
                      case 'TEXT':
                        values = [String(prop.defaultValue || 'Text content')];
                        defaultValue = String(prop.defaultValue || 'Text content');
                        break;
                      case 'INSTANCE_SWAP':
                        if (prop.preferredValues && Array.isArray(prop.preferredValues)) {
                          values = prop.preferredValues.map((v: any) => v.key || v.name || 'Component instance');
                        } else {
                          values = ['Component instance'];
                        }
                        defaultValue = values[0] || 'Component instance';
                        break;
                      default:
                        values = ['Property value'];
                        defaultValue = 'Default';
                    }

                    actualProperties.push({ name: displayName, values, default: defaultValue });
                  }
                  debugLog(`🔍 [DEBUG] Instance fallback: extracted ${actualProperties.length} properties from component set`);
                }
              }
            } catch (error) {
              console.warn('🔍 [WARN] Instance fallback: could not access componentPropertyDefinitions:', error);
            }

            // Also get variant group properties if needed
            if (actualProperties.length === 0) {
              try {
                const variantProps = componentSet.variantGroupProperties;
                if (variantProps) {
                  for (const propName in variantProps) {
                    const prop = variantProps[propName];
                    if (!actualProperties.find(p => p.name === propName)) {
                      actualProperties.push({
                        name: propName,
                        values: prop.values,
                        default: prop.values[0] || 'default'
                      });
                    }
                  }
                }
              } catch (error) {
                console.warn('🔍 [WARN] Instance fallback: could not access variantGroupProperties:', error);
              }
            }
          } else {
            // Main component is standalone (no component set)
            debugLog('🔍 [DEBUG] Instance fallback: extracting from standalone main component');
            try {
              if ('componentPropertyDefinitions' in mainComponent) {
                const propertyDefinitions = mainComponent.componentPropertyDefinitions;
                if (propertyDefinitions && typeof propertyDefinitions === 'object') {
                  for (const propName in propertyDefinitions) {
                    const prop = propertyDefinitions[propName];
                    let displayName = propName;
                    let values: string[] = [];
                    let defaultValue = '';

                    if (propName.includes('#')) {
                      displayName = propName.split('#')[0];
                    }

                    switch (prop.type) {
                      case 'BOOLEAN':
                        values = ['true', 'false'];
                        defaultValue = prop.defaultValue ? 'true' : 'false';
                        break;
                      case 'TEXT':
                        values = [String(prop.defaultValue || 'Text content')];
                        defaultValue = String(prop.defaultValue || 'Text content');
                        break;
                      case 'INSTANCE_SWAP':
                        if (prop.preferredValues && Array.isArray(prop.preferredValues)) {
                          values = prop.preferredValues.map((v: any) => v.key || v.name || 'Component instance');
                        } else {
                          values = ['Component instance'];
                        }
                        defaultValue = values[0] || 'Component instance';
                        break;
                      default:
                        values = ['Property value'];
                        defaultValue = 'Default';
                    }

                    actualProperties.push({ name: displayName, values, default: defaultValue });
                  }
                  debugLog(`🔍 [DEBUG] Instance fallback: extracted ${actualProperties.length} properties from main component`);
                }
              }
            } catch (error) {
              console.warn('🔍 [WARN] Instance fallback: could not access componentPropertyDefinitions on main component:', error);
            }
          }
        }
      } catch (error) {
        console.warn('🔍 [WARN] Instance fallback: could not get main component:', error);
      }
    }
  }

  // Remove duplicates and return
  const uniqueProperties: Array<{ name: string; values: string[]; default: string }> = [];
  actualProperties.forEach(prop => {
    if (!uniqueProperties.find(p => p.name === prop.name)) {
      uniqueProperties.push(prop);
    }
  });

  debugLog(`🔍 [DEBUG] Final result: Extracted ${uniqueProperties.length} unique properties:`, uniqueProperties.map(p => ({ name: p.name, valueCount: p.values.length, default: p.default })));
  return uniqueProperties;
}

/**
 * Comprehensive structural analysis to extract properties when Figma APIs fail completely
 */
function extractPropertiesFromStructuralAnalysis(componentSet: ComponentSetNode): Array<{ name: string; values: string[]; default: string }> {
  const properties: Array<{ name: string; values: string[]; default: string }> = [];

  debugLog('🔍 [STRUCTURAL] Starting comprehensive structural analysis of component set:', componentSet.name);

  // First, get all variant properties from variant names
  const variantProperties = extractPropertiesFromVariantNames(componentSet);
  properties.push(...variantProperties);

  // Analyze the structure of individual variants to find additional properties
  const allChildNames: Set<string> = new Set();
  const textLayers: Set<string> = new Set();
  const instanceLayers: Set<string> = new Set();
  const booleanIndicators: Set<string> = new Set();

  componentSet.children.forEach(variant => {
    if (variant.type === 'COMPONENT') {
      debugLog(`🔍 [STRUCTURAL] Analyzing variant: ${variant.name}`);

      // Traverse the variant to find all child nodes
      const traverseNode = (node: SceneNode, depth = 0) => {
        const indent = '  '.repeat(depth);
        debugLog(`🔍 [STRUCTURAL] ${indent}Found child: ${node.name} (type: ${node.type})`);

        allChildNames.add(node.name);

        // Track different types of layers
        if (node.type === 'TEXT') {
          textLayers.add(node.name);
        } else if (node.type === 'INSTANCE') {
          instanceLayers.add(node.name);
        }

        // Look for boolean indicators (visible/hidden pattern)
        if (node.visible === false || node.name.toLowerCase().includes('hidden')) {
          booleanIndicators.add(node.name);
        }

        // Recursively traverse children
        if ('children' in node && node.children) {
          node.children.forEach(child => traverseNode(child, depth + 1));
        }
      };

      traverseNode(variant);
    }
  });

  debugLog('🔍 [STRUCTURAL] Analysis results:');
  debugLog('🔍 [STRUCTURAL] - All child names:', Array.from(allChildNames));
  debugLog('🔍 [STRUCTURAL] - Text layers:', Array.from(textLayers));
  debugLog('🔍 [STRUCTURAL] - Instance layers:', Array.from(instanceLayers));
  debugLog('🔍 [STRUCTURAL] - Boolean indicators:', Array.from(booleanIndicators));

  // Infer additional properties from common patterns

  // 1. Text properties (if there are text layers)
  textLayers.forEach(textLayerName => {
    const cleanName = textLayerName.replace(/\s*(layer|text|label)?\s*/gi, '').trim();
    if (cleanName && !properties.find(p => p.name.toLowerCase() === cleanName.toLowerCase())) {
      properties.push({
        name: cleanName,
        values: ['Text content'],
        default: 'Label'
      });
      debugLog(`🔍 [STRUCTURAL] Added TEXT property: ${cleanName}`);
    }
  });

  // 2. Instance swap properties (for icon/component slots)
  instanceLayers.forEach(instanceLayerName => {
    const cleanName = instanceLayerName.replace(/\s*(layer|instance)?\s*/gi, '').trim();
    if (cleanName && !properties.find(p => p.name.toLowerCase() === cleanName.toLowerCase())) {
      properties.push({
        name: cleanName,
        values: ['Component instance'],
        default: 'Default component'
      });
      debugLog(`🔍 [STRUCTURAL] Added INSTANCE_SWAP property: ${cleanName}`);
    }
  });

  // 3. Boolean properties (for show/hide toggles)
  const commonBooleanPatterns = [
    'icon before', 'icon after', 'slot before', 'slot after',
    'before', 'after', 'prefix', 'suffix', 'leading', 'trailing'
  ];

  commonBooleanPatterns.forEach(pattern => {
    const foundLayer = Array.from(allChildNames).find(name =>
      name.toLowerCase().includes(pattern.toLowerCase())
    );

    if (foundLayer && !properties.find(p => p.name.toLowerCase().includes(pattern.toLowerCase()))) {
      const propertyName = pattern.split(' ').map(word =>
        word.charAt(0).toUpperCase() + word.slice(1)
      ).join(' ');

      properties.push({
        name: propertyName,
        values: ['true', 'false'],
        default: 'false'
      });
      debugLog(`🔍 [STRUCTURAL] Added BOOLEAN property: ${propertyName}`);
    }
  });

  // 4. Common button properties if this looks like a button
  const componentName = componentSet.name.toLowerCase();
  if (componentName.includes('button') || componentName.includes('btn')) {
    const commonButtonProperties = [
      { name: 'Slot Before', type: 'BOOLEAN' },
      { name: 'Text', type: 'TEXT' },
      { name: 'Icon Before', type: 'INSTANCE_SWAP' },
      { name: 'Icon After', type: 'INSTANCE_SWAP' }
    ];

    commonButtonProperties.forEach(({ name, type }) => {
      if (!properties.find(p => p.name.toLowerCase() === name.toLowerCase())) {
        let values: string[], defaultValue: string;

        switch (type) {
          case 'BOOLEAN':
            values = ['true', 'false'];
            defaultValue = 'false';
            break;
          case 'TEXT':
            values = ['Text content'];
            defaultValue = 'Label';
            break;
          case 'INSTANCE_SWAP':
            values = ['Component instance'];
            defaultValue = 'Default icon';
            break;
          default:
            values = ['Property value'];
            defaultValue = 'Default';
        }

        properties.push({
          name,
          values,
          default: defaultValue
        });
        debugLog(`🔍 [STRUCTURAL] Added common ${type} property: ${name}`);
      }
    });
  }

  debugLog(`🔍 [STRUCTURAL] Final structural analysis result: ${properties.length} properties found`);
  return properties;
}

/**
 * Extract actual states from a component
 */
async function extractActualComponentStates(node: SceneNode): Promise<string[]> {
  const actualStates: string[] = [];

  if (node.type === 'COMPONENT_SET') {
    const componentSet = node as ComponentSetNode;

    // Safely access variantGroupProperties with error handling
    let variantProps: Record<string, {values: string[]}> | undefined;
    try {
      variantProps = componentSet.variantGroupProperties;
    } catch (error) {
      console.warn('Component set has errors, cannot access variantGroupProperties:', error);
      variantProps = undefined;
    }

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
      return await extractActualComponentStates(component.parent);
    }
  } else if (node.type === 'INSTANCE') {
    // For instances, get states from the main component
    const instance = node as InstanceNode;
    const mainComponent = await instance.getMainComponentAsync();
    if (mainComponent) {
      return await extractActualComponentStates(mainComponent);
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

const ANALYSIS_TOTAL_STEPS = 4;

/** Post a phase-boundary progress update so the UI can show real progress
 * instead of a static spinner during a 10-60s analysis. */
function reportAnalysisProgress(step: number, label: string): void {
  sendMessageToUI('analysis-progress', { step, total: ANALYSIS_TOTAL_STEPS, label });
}

/**
 * Process enhanced analysis with improved MCP integration
 * Now leverages the upgraded MCP server processing capabilities
 */
export async function processEnhancedAnalysis(
  context: ComponentContext,
  apiKey: string,
  model: string,
  options: EnhancedAnalysisOptions = {},
  providerId: ProviderId = 'anthropic'
): Promise<EnhancedAnalysisResult> {
  debugLog('🎯 Starting enhanced component analysis...');

  const selectedNode = figma.currentPage.selection[0];
  const node = options.node || selectedNode;
  if (!node) {
    throw new Error('No node selected');
  }

  reportAnalysisProgress(1, 'Extracting component data from Figma');

  // Extract actual component data from Figma API
  const actualProperties = await extractActualComponentProperties(node, selectedNode);
  const actualStates = await extractActualComponentStates(node);
  const tokens = await extractDesignTokensFromNode(node);
  
  // Extract component description if available
  let componentDescription = '';
  if (node.type === 'COMPONENT' || node.type === 'COMPONENT_SET') {
    componentDescription = (node as ComponentNode | ComponentSetNode).description || '';
  } else if (node.type === 'INSTANCE') {
    const instance = node as InstanceNode;
    const mainComponent = await instance.getMainComponentAsync();
    if (mainComponent) {
      componentDescription = mainComponent.description || '';
    }
  }

  // Thread existing description into context for downstream prompts
  context.existingDescription = componentDescription;

  // Log extracted data for debugging
  debugLog(`📊 [ANALYSIS] Extracted from Figma API:`);
  debugLog(`  Properties: ${actualProperties.length}`);
  debugLog(`  States: ${actualStates.length}`);
  debugLog(`  Tokens: ${Object.keys(tokens).length} categories`);
  debugLog(`  Description: ${componentDescription ? 'Present' : 'Missing'}`);

  // Serve structurally identical components from the analysis cache — this
  // skips the entire LLM round trip (and its cost) when re-analyzing an
  // unchanged component. `bypassCache` forces a fresh analysis.
  const allTokensForHash = [
    ...tokens.colors,
    ...tokens.spacing,
    ...tokens.typography,
    ...tokens.effects,
    ...tokens.borders,
  ];
  const componentHash = consistencyEngine.generateComponentHash(context, allTokensForHash);
  if (!options.bypassCache) {
    const cached = consistencyEngine.getCachedAnalysis(componentHash);
    if (cached) {
      console.log('✅ Returning cached analysis (component unchanged)');
      return { ...cached.result, fromCache: true };
    }
  }

  // Check if MCP server is available. Default to the hosted design-systems MCP
  // server — it is the only MCP endpoint in manifest.json's networkAccess
  // allowlist, so any other default (e.g. localhost) is silently blocked by
  // Figma's network sandbox and MCP enhancement never actually runs.
  const mcpServerUrl = options.mcpServerUrl || 'https://design-systems-mcp.southleft-llc.workers.dev/mcp';
  const useMCP = options.useMCP !== false && options.enableMCPEnhancement !== false && !!mcpServerUrl;

  let analysisResult: any;

  if (useMCP) {
    debugLog(`🔄 Using hybrid LLM + MCP approach (${providerId})...`);
    reportAnalysisProgress(2, 'Analyzing with AI');

    // Run the LLM extraction and the MCP best-practice queries in parallel —
    // the MCP queries only need the component family, which is known before
    // the LLM responds, and getMCPBestPractices never rejects (it resolves
    // with {success: false} on failure, which the merge treats as "no MCP").
    const llmPrompt = createFigmaDataExtractionPrompt(context, actualProperties, actualStates, tokens, componentDescription);
    const [llmResponse, mcpEnhancements] = await Promise.all([
      callProvider(providerId, apiKey, {
        prompt: llmPrompt,
        model,
        maxTokens: 4096,
        temperature: 0.1,
      }),
      getMCPBestPractices(context, mcpServerUrl, {}),
    ]);
    const llmData = extractJSONFromResponse(llmResponse.content);

    if (!llmData) {
      throw new Error('Failed to extract JSON from LLM response');
    }

    if (mcpEnhancements?.success) {
      debugLog('✅ MCP enhancements received');
    } else {
      console.warn('⚠️ MCP enhancement unavailable, continuing with LLM data only');
    }
    reportAnalysisProgress(3, 'Applying design-system guidance');

    // Step 3: Merge LLM data with MCP enhancements
    analysisResult = mergClaudeAndMCPResults(llmData, mcpEnhancements, {
      node,
      context,
      actualProperties,
      actualStates,
      tokens,
      componentDescription
    });

  } else {
    // Fallback to LLM-only analysis (no MCP)
    debugLog(`📝 Using ${providerId}-only analysis...`);
    reportAnalysisProgress(2, 'Analyzing with AI');
    const prompt = createEnhancedMetadataPrompt(context);
    const llmFallbackResponse = await callProvider(providerId, apiKey, {
      prompt,
      model,
      maxTokens: 4096,
      temperature: 0.1,
    });
    analysisResult = extractJSONFromResponse(llmFallbackResponse.content);

    if (!analysisResult) {
      throw new Error('Failed to extract JSON from response');
    }
  }

  // Filter and process the result, reusing the data extracted above so the
  // Figma traversal doesn't run twice per analysis.
  reportAnalysisProgress(4, 'Building audit results');
  const filteredData = filterDevelopmentRecommendations(analysisResult);
  const result = await processAnalysisResult(filteredData, context, options, {
    actualProperties,
    actualStates,
    tokens,
    componentDescription,
  });

  consistencyEngine.cacheAnalysis(componentHash, result);
  return result;
}

/**
 * Serialize a layer hierarchy as a compact indented outline for LLM prompts.
 *
 * Pretty-printed JSON of the full tree was easily 10-100KB of prompt on large
 * component sets; an outline capped by depth and sibling count carries the
 * same structural signal at a fraction of the tokens.
 */
export function serializeHierarchy(
  hierarchy: LayerHierarchy[],
  maxDepth: number = 4,
  maxChildrenPerNode: number = 12
): string {
  const lines: string[] = [];

  const countNodes = (nodes: LayerHierarchy[]): number => {
    let count = 0;
    for (const n of nodes) {
      count += 1 + (n.children ? countNodes(n.children) : 0);
    }
    return count;
  };

  const walk = (nodes: LayerHierarchy[], depth: number): void => {
    const indent = '  '.repeat(depth);
    for (const n of nodes.slice(0, maxChildrenPerNode)) {
      lines.push(`${indent}${n.type} "${n.name}"`);
      if (n.children && n.children.length > 0) {
        if (depth + 1 < maxDepth) {
          walk(n.children, depth + 1);
        } else {
          lines.push(`${indent}  … ${countNodes(n.children)} nested layers omitted`);
        }
      }
    }
    if (nodes.length > maxChildrenPerNode) {
      lines.push(`${indent}… ${nodes.length - maxChildrenPerNode} more siblings omitted`);
    }
  };

  walk(hierarchy, 0);
  return lines.join('\n');
}

/**
 * Create a focused prompt for Claude to extract Figma-specific data
 */
function createFigmaDataExtractionPrompt(
  context: ComponentContext,
  actualProperties: Array<{ name: string; values: string[]; default: string }>,
  actualStates: string[],
  tokens: TokenAnalysis,
  componentDescription: string
): string {
  const componentFamily = context.additionalContext?.componentFamily || 'generic';
  const nestedInstances = extractInstanceNames(context.hierarchy);

  return `Analyze this Figma component and extract its structure and patterns.

**Component Details:**
- Name: ${context.name}
- Type: ${context.type}
- Family: ${componentFamily}
- Existing Figma Description: ${componentDescription || 'None set'}
- Nested Component Instances: ${nestedInstances.length > 0 ? nestedInstances.join(', ') : 'None detected'}

**Actual Figma Properties (${actualProperties.length} total):**
${actualProperties.slice(0, 10).map(p => `- ${p.name}: ${p.values.join(', ')} (default: ${p.default})`).join('\n')}
${actualProperties.length > 10 ? `... and ${actualProperties.length - 10} more properties` : ''}

**Detected States:** ${actualStates.join(', ')}

**Token Analysis:**
- Total token opportunities: ${tokens.summary.totalTokens}
- Actual tokens used: ${tokens.summary.actualTokens}
- Hard-coded values: ${tokens.summary.hardCodedValues}
- AI suggestions: ${tokens.summary.aiSuggestions}

**Component Structure:**
${serializeHierarchy(context.hierarchy)}

**TASK:** Analyze this Figma component and provide:
1. Component name and description based on actual structure
2. All properties with their actual values from Figma
3. All states detected in the component
4. Token usage analysis
5. Structural patterns and variants
6. Recommended properties this component SHOULD have but currently LACKS

Return JSON in this exact format:
{
  "component": "Component name and type",
  "description": "Start with a brief 1-2 sentence summary of what this component is and its key variants/capabilities. Then provide structured sections: PURPOSE: What this component is and its primary function. BEHAVIOR: Interactive behavior patterns (skip if not interactive). COMPOSITION: List all nested/child component instances used — note that AI code generators should check the development codebase for these sub-components before creating new ones. USAGE: When and how to use this component vs alternatives. CODE GENERATION NOTES: Implementation considerations including leveraging existing sub-components and interaction details not visible from design specs alone.",
  "props": [
    {
      "name": "property name from Figma",
      "type": "type",
      "description": "what this property controls",
      "values": ["actual", "values", "from", "figma"],
      "default": "default value"
    }
  ],
  "states": ["actual", "states", "detected"],
  "variants": {
    "property": ["values"]
  },
  "tokens": {
    "colors": ["actual tokens used"],
    "spacing": ["actual tokens used"],
    "typography": ["actual tokens used"]
  },
  "structure": {
    "layers": ${context.hierarchy.length},
    "hasSlots": ${context.detectedSlots.length > 0},
    "complexity": "low|medium|high"
  },
  "recommendedProperties": [
    {
      "name": "Figma property name to add",
      "type": "VARIANT|BOOLEAN|TEXT|INSTANCE_SWAP",
      "description": "Why this property improves the component",
      "examples": ["specific example values"]
    }
  ]
}

For "recommendedProperties": Compare the EXISTING properties listed above against design system best practices (Material Design, Carbon, Ant Design, Polaris, etc.). Only recommend Figma component properties that do NOT already exist. Use Figma property types (VARIANT, BOOLEAN, TEXT, INSTANCE_SWAP). If the component already has comprehensive properties, return an empty array.

Focus ONLY on what's actually in the Figma component for existing data. Recommendations should draw from your knowledge of design system best practices.`;
}

/**
 * Get best practices from MCP with lightweight, focused queries
 */
async function getMCPBestPractices(
  context: ComponentContext,
  mcpServerUrl: string,
  claudeData: any
): Promise<any> {
  const componentFamily = context.additionalContext?.componentFamily || claudeData.component?.toLowerCase() || 'generic';

  try {
    // Make parallel but focused MCP queries
    const [bestPractices, tokenGuidance, scoringCriteria] = await Promise.all([
      // Component best practices (small query)
      queryMCPWithTimeout(mcpServerUrl, 'search_design_knowledge', {
        query: `${componentFamily} component essential properties states variants`,
        category: 'components',
        limit: 2
      }, 3000),

      // Token recommendations (small query)
      queryMCPWithTimeout(mcpServerUrl, 'search_design_knowledge', {
        query: `design tokens ${componentFamily} semantic naming`,
        category: 'tokens',
        limit: 2
      }, 3000),

      // Scoring criteria (small query)
      queryMCPWithTimeout(mcpServerUrl, 'search_chunks', {
        query: `component assessment scoring criteria ${componentFamily}`,
        limit: 1
      }, 3000)
    ]);

    return {
      bestPractices: bestPractices?.entries || [],
      tokenGuidance: tokenGuidance?.entries || [],
      scoringCriteria: scoringCriteria?.chunks || [],
      success: true
    };

  } catch (error) {
    console.warn('⚠️ MCP queries failed:', error);
    return {
      bestPractices: [],
      tokenGuidance: [],
      scoringCriteria: [],
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

/**
 * Query MCP with timeout to prevent hanging on large components
 */
async function queryMCPWithTimeout(
  serverUrl: string,
  toolName: string,
  arguments_: any,
  timeoutMs: number = 5000
): Promise<any> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const payload = {
      jsonrpc: "2.0",
      id: Math.floor(Math.random() * 1000) + 100,
      method: "tools/call",
      params: {
        name: `mcp_design-systems_${toolName}`,
        arguments: arguments_
      }
    };

    const response = await fetch(serverUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`MCP ${toolName} failed: ${response.status}`);
    }

    const result = await response.json();
    return result.result?.content?.[0] || {};

  } catch (error) {
    clearTimeout(timeoutId);
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error(`MCP ${toolName} timeout after ${timeoutMs}ms`);
    }
    throw error;
  }
}

/**
 * Merge Claude's Figma analysis with MCP best practices
 */
function mergClaudeAndMCPResults(
  claudeData: any,
  mcpEnhancements: any,
  fallbackData: {
    node: SceneNode;
    context: ComponentContext;
    actualProperties: Array<{ name: string; values: string[]; default: string }>;
    actualStates: string[];
    tokens: TokenAnalysis;
    componentDescription?: string;
  }
): any {
  // Start with Claude's extracted data
  const merged = { ...claudeData };

  // Add property cheat sheet based on actual properties
  merged.propertyCheatSheet = generatePropertyCheatSheet(
    fallbackData.actualProperties,
    claudeData.component || fallbackData.context.name
  );

  // Create audit results
  merged.audit = {
    designIssues: [],
    tokenOpportunities: [],
    structureIssues: []
  };
  
  // Add issue for missing component description
  if (!fallbackData.componentDescription || fallbackData.componentDescription.trim().length === 0) {
    merged.audit.structureIssues.push('Component lacks description - Add a description in component properties to help MCP and AI understand the component\'s purpose and usage');
  }

  // Add MCP-enhanced readiness score if available
  if (mcpEnhancements?.success) {
    merged.mcpReadiness = generateMCPReadinessFromBestPractices(
      mcpEnhancements,
      claudeData,
      fallbackData
    );
  } else {
    // Fallback MCP readiness
    merged.mcpReadiness = generateFallbackMCPReadiness(fallbackData);
  }

  // Ensure we have all required fields
  merged.component = merged.component || fallbackData.context.name;
  merged.description = merged.description || `${fallbackData.context.additionalContext?.componentFamily || 'Component'} with ${fallbackData.actualProperties.length} properties`;
  merged.props = merged.props || fallbackData.actualProperties.map(p => ({
    name: p.name,
    type: 'select',
    description: `Controls ${p.name}`,
    values: p.values,
    default: p.default
  }));
  merged.states = merged.states || fallbackData.actualStates;

  // Pass through AI-generated property recommendations
  merged.recommendedProperties = claudeData.recommendedProperties || [];

  return merged;
}

/**
 * Generate MCP readiness score from best practices
 */
function generateMCPReadinessFromBestPractices(
  mcpEnhancements: any,
  claudeData: any,
  fallbackData: any
): any {
  const strengths: string[] = [];
  const gaps: string[] = [];
  const recommendations: string[] = [];

  // Analyze based on MCP best practices
  if (mcpEnhancements.bestPractices?.length > 0) {
    // Extract insights from MCP responses
    mcpEnhancements.bestPractices.forEach((entry: any) => {
      if (entry.title?.includes('best practice') || entry.title?.includes('pattern')) {
        recommendations.push(`Follow ${entry.title}`);
      }
    });
  }

  // Calculate score based on actual component analysis
  const hasAllStates = fallbackData.actualStates.length >= 3;
  const hasSemanticTokens = fallbackData.tokens.summary &&
    fallbackData.tokens.summary.actualTokens > fallbackData.tokens.summary.hardCodedValues;
  const hasGoodStructure = claudeData.structure?.complexity !== 'high';

  if (hasAllStates) strengths.push('Component has comprehensive states');
  else gaps.push('Missing interactive states');

  if (hasSemanticTokens) strengths.push('Good token usage');
  else gaps.push('Improve token adoption');

  if (hasGoodStructure) strengths.push('Well-structured component');
  else gaps.push('Complex structure may need simplification');

  const score = Math.round(
    ((hasAllStates ? 35 : 15) +
     (hasSemanticTokens ? 35 : 15) +
     (hasGoodStructure ? 30 : 20))
  );

  return {
    score,
    strengths,
    gaps,
    recommendations: recommendations.slice(0, 3) // Limit recommendations
  };
}

/**
 * Generate a concise property cheat sheet
 */
function generatePropertyCheatSheet(
  properties: Array<{ name: string; values: string[]; default: string }>,
  _componentName: string
): string[] {
  const cheatSheet: string[] = [];

  // Group properties by common patterns
  const sizeProps = properties.filter(p =>
    p.name.toLowerCase().includes('size') ||
    p.values.some(v => ['small', 'medium', 'large'].includes(v.toLowerCase()))
  );

  const variantProps = properties.filter(p =>
    p.name.toLowerCase().includes('variant') ||
    p.name.toLowerCase().includes('type')
  );

  const stateProps = properties.filter(p =>
    p.name.toLowerCase().includes('state') ||
    p.values.some(v => ['hover', 'active', 'disabled'].includes(v.toLowerCase()))
  );

  // Add grouped summaries
  if (sizeProps.length > 0) {
    cheatSheet.push(`📏 Sizes: ${sizeProps.map(p => p.values.join('/')).join(', ')}`);
  }

  if (variantProps.length > 0) {
    cheatSheet.push(`🎨 Variants: ${variantProps.map(p => `${p.name}(${p.values.length})`).join(', ')}`);
  }

  if (stateProps.length > 0) {
    cheatSheet.push(`🔄 States: ${stateProps.map(p => p.values.join('/')).join(', ')}`);
  }

  // Add remaining important properties
  const covered = new Set([...sizeProps, ...variantProps, ...stateProps].map(p => p.name));
  const remaining = properties
    .filter(p => !covered.has(p.name))
    .slice(0, 3)
    .map(p => `${p.name}: ${p.values.slice(0, 3).join('/')}`);

  if (remaining.length > 0) {
    cheatSheet.push(`⚙️ Other: ${remaining.join(', ')}`);
  }

  return cheatSheet.slice(0, 5); // Limit to 5 entries
}

/**
 * Annotate hard-coded tokens with whether a matching design-token variable
 * exists (drives the Fix buttons in the UI). Mutates the token contexts.
 * Also used by the lightweight refresh-tokens path after fixes are applied.
 */
export async function enrichTokensWithMatches(tokens: TokenAnalysis): Promise<void> {
  const categories: Array<'colors' | 'spacing' | 'typography' | 'effects' | 'borders'> = ['colors', 'spacing', 'typography', 'effects', 'borders'];
  for (const category of categories) {
    for (const token of tokens[category]) {
      if (token.source !== 'hard-coded' || !token.context?.nodeId || !token.context?.property) continue;

      try {
        const isColorProperty = /^(fills|strokes)(\[\d+\])?$/.test(token.context.property);
        if (isColorProperty) {
          const matches = await findMatchingColorVariable(token.value || '', 0.1, colorFieldFromPropertyPath(token.context.property));
          token.context.hasMatchingToken = matches.length > 0;
        } else {
          const pixelValue = parseFloat(token.value || '0');
          if (!isNaN(pixelValue)) {
            const matches = await findBestMatchingVariable(pixelValue, token.context.property, 2);
            token.context.hasMatchingToken = matches.length > 0;
          } else {
            token.context.hasMatchingToken = false;
          }
        }
      } catch {
        token.context.hasMatchingToken = false;
      }
    }
  }
}

/**
 * Process analysis result from Claude and convert to EnhancedAnalysisResult
 */
export async function processAnalysisResult(
  filteredData: any,
  context: ComponentContext,
  options: EnhancedAnalysisOptions,
  preExtracted?: {
    actualProperties?: Array<{ name: string; values: string[]; default: string }>;
    actualStates?: string[];
    tokens?: TokenAnalysis;
    componentDescription?: string;
  }
): Promise<EnhancedAnalysisResult> {
  try {
    debugLog('🔄 Processing analysis result...');

    // Prefer the node resolved by the caller (instance → main component,
    // variant → component set, batch-loop node); the raw selection is only a
    // last resort and may not match the node the context was built from.
    let node: SceneNode | null = options.node || null;

    if (!node) {
      const selection = figma.currentPage.selection;
      if (selection.length > 0) {
        node = selection[0];
      } else {
        throw new Error('No component selected');
      }
    }

    // Reuse data the caller already extracted (processEnhancedAnalysis and the
    // batch loop both traverse the node before calling us) — re-extracting
    // doubles the Figma-side cost of every analysis.
    const actualProperties = preExtracted?.actualProperties
      ?? await extractActualComponentProperties(node, node);

    const actualStates = preExtracted?.actualStates
      ?? await extractActualComponentStates(node);

    // Extract component description if available
    let componentDescription = preExtracted?.componentDescription ?? '';
    if (preExtracted?.componentDescription === undefined) {
      if (node.type === 'COMPONENT' || node.type === 'COMPONENT_SET') {
        componentDescription = (node as ComponentNode | ComponentSetNode).description || '';
      } else if (node.type === 'INSTANCE') {
        const instance = node as InstanceNode;
        const mainComponent = await instance.getMainComponentAsync();
        if (mainComponent) {
          componentDescription = mainComponent.description || '';
        }
      }
    }

    // Extract design tokens if enabled
    let tokens: TokenAnalysis = {
      colors: [],
      spacing: [],
      typography: [],
      effects: [],
      borders: [],
      summary: {
        totalTokens: 0,
        actualTokens: 0,
        hardCodedValues: 0,
        aiSuggestions: 0,
        byCategory: {}
      }
    };

    if (options.includeTokenAnalysis !== false) {
      tokens = preExtracted?.tokens ?? await extractDesignTokensFromNode(node);
      await enrichTokensWithMatches(tokens);
    }

    // Ensure we have complete metadata even if some parts failed
    const metadata: ComponentMetadata = {
      component: filteredData.component || context.name || 'Component',
      description: filteredData.description || `A ${context.type} component with ${actualProperties.length} properties`,

      // Use actual properties from Figma if Claude didn't provide them
      props: filteredData.props && filteredData.props.length > 0
        ? filteredData.props
        : actualProperties.map(p => ({
            name: p.name,
            type: 'select',
            description: `Controls ${p.name}`,
            values: p.values,
            defaultValue: p.default,
            required: false
          })),

      // Use actual states from Figma if Claude didn't provide them
      states: filteredData.states && filteredData.states.length > 0
        ? filteredData.states.map((s: any) => typeof s === 'string' ? s : s.name)
        : actualStates.length > 0 ? actualStates : ['default'],

      variants: filteredData.variants || {},
      slots: filteredData.slots || [],

      tokens: filteredData.tokens || {
        colors: tokens.colors.filter((t: DesignToken) => t.isActualToken).map((t: DesignToken) => t.name),
        spacing: tokens.spacing.filter((t: DesignToken) => t.isActualToken).map((t: DesignToken) => t.name),
        typography: tokens.typography.filter((t: DesignToken) => t.isActualToken).map((t: DesignToken) => t.name)
      },

      usage: filteredData.usage || 'General purpose component for design systems',

      accessibility: filteredData.accessibility || {
        keyboardNavigation: 'Standard keyboard navigation support',
        screenReader: 'Screen reader accessible',
        colorContrast: 'WCAG compliant contrast ratios'
      },

      audit: filteredData.audit || {
        accessibilityIssues: [],
        namingIssues: [],
        consistencyIssues: [],
        tokenOpportunities: []
      },

      // Ensure propertyCheatSheet exists
      propertyCheatSheet: filteredData.propertyCheatSheet || actualProperties.map(p => ({
        name: p.name,
        values: p.values,
        default: p.default,
        description: `Property for ${p.name} configuration`
      })),

      // Ensure mcpReadiness exists
      mcpReadiness: filteredData.mcpReadiness || generateFallbackMCPReadiness({
        node,
        context,
        actualProperties,
        actualStates,
        tokens,
        componentDescription
      })
    };

    // Log what we're sending to UI
    debugLog('📤 Sending to UI - metadata.props:', metadata.props?.length);
    debugLog('📤 Sending to UI - metadata.states:', metadata.states);
    debugLog('📤 Sending to UI - metadata.mcpReadiness:', metadata.mcpReadiness);

    // Create audit results with best practices analysis
    const audit: DetailedAuditResults = await createAuditResults(filteredData, context, node, actualProperties, actualStates, tokens, componentDescription);

    // Extract AI-generated property recommendations from the LLM response
    const recommendations = (filteredData.recommendedProperties || []).map((rec: any) => ({
      name: rec.name || '',
      type: rec.type || 'VARIANT',
      description: rec.description || '',
      examples: rec.examples || []
    })).filter((rec: any) => rec.name);
    debugLog(`💡 AI-generated property recommendations: ${recommendations.length}`);

    // Analyze naming issues (depth-limited to 5 for performance)
    const namingIssues = analyzeNamingIssues(node, 5);
    debugLog(`📛 Found ${namingIssues.length} naming issues`);

    debugLog('✅ Analysis result processed successfully');

    return {
      metadata,
      tokens,
      audit,
      properties: actualProperties,
      recommendations,
      namingIssues,
      existingDescription: componentDescription
    };
  } catch (error) {
    console.error('Error processing analysis result:', error);
    throw error;
  }
}

/**
 * Create audit results from Claude analysis data
 */
async function createAuditResults(
  _filteredData: any,
  _context: ComponentContext,
  node: SceneNode,
  actualProperties: Array<{ name: string; values: string[]; default: string }>,
  actualStates: string[],
  _tokens: TokenAnalysis,
  componentDescription?: string
): Promise<DetailedAuditResults> {
  // Check parent component set description for context-aware description check
  let parentHasDescription = false;
  let parentDescription = '';
  if (node.type === 'COMPONENT' && node.parent?.type === 'COMPONENT_SET') {
    const parentSet = node.parent as ComponentSetNode;
    parentDescription = parentSet.description || '';
    parentHasDescription = parentDescription.trim().length > 0;
  } else if (node.type === 'COMPONENT_SET') {
    parentHasDescription = !!(componentDescription && componentDescription.trim().length > 0);
  }

  const hasDescription = !!(componentDescription && componentDescription.trim().length > 0);

  // Build description check with component set awareness
  let descriptionStatus: 'pass' | 'warning' = hasDescription ? 'pass' : 'warning';
  let descriptionSuggestion = '';
  if (hasDescription) {
    descriptionSuggestion = 'Component has description for MCP/AI context';
  } else if (parentHasDescription) {
    descriptionStatus = 'pass';
    descriptionSuggestion = 'Component set has a description. Consider adding a variant-specific description for richer context.';
  } else {
    descriptionSuggestion = 'Add a component description to help MCP and AI understand the component purpose and usage';
  }

  // Component Readiness checks (property config + description)
  const componentReadiness: AuditCheck[] = [
    {
      check: 'Property configuration',
      status: actualProperties.length > 0 ? 'pass' : 'warning',
      suggestion: actualProperties.length > 0
        ? 'Component has configurable properties'
        : 'Consider adding properties for component customization'
    },
    {
      check: 'Component description',
      status: descriptionStatus,
      suggestion: descriptionSuggestion
    }
  ];

  // Real accessibility checks
  const accessibility = runAccessibilityChecks(node, actualStates);

  // Detached instance detection
  const detachedInstances = detectDetachedInstances(node);

  return {
    states: actualStates.map(state => ({
      name: state,
      found: true
    })),
    componentReadiness,
    accessibility,
    detachedInstances
  };
}

// ============================================================================
// Accessibility Check Helpers
// ============================================================================

const INTERACTIVE_KEYWORDS = [
  'button', 'btn', 'link', 'anchor', 'checkbox', 'check-box',
  'radio', 'toggle', 'switch', 'tab', 'chip', 'tag',
  'input', 'select', 'dropdown', 'menu-item', 'menuitem',
  'slider', 'stepper', 'icon-button', 'fab', 'action'
];

/**
 * Determine if a component is interactive based on name, states, and structure
 */
function isInteractiveComponent(node: SceneNode, states: string[]): boolean {
  const nameLower = node.name.toLowerCase();
  // Check name keywords
  if (INTERACTIVE_KEYWORDS.some(kw => nameLower.includes(kw))) return true;
  // Check if it has interactive states (hover, pressed, focus, active, disabled)
  const interactiveStates = ['hover', 'pressed', 'focus', 'focused', 'active', 'disabled'];
  if (states.some(s => interactiveStates.includes(s.toLowerCase()))) return true;
  return false;
}

/**
 * Get the luminance of an RGB color (0-1 range) for contrast calculation
 */
function getLuminance(r: number, g: number, b: number): number {
  const [rs, gs, bs] = [r, g, b].map(c => {
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
}

/**
 * Calculate WCAG contrast ratio between two luminance values
 */
function getContrastRatio(l1: number, l2: number): number {
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

/**
 * Find the nearest background color by walking up the parent chain
 */
function findBackgroundColor(node: SceneNode): { r: number; g: number; b: number } | null {
  let current: BaseNode | null = node.parent;
  while (current && 'type' in current) {
    const sceneNode = current as SceneNode;
    if ('fills' in sceneNode) {
      const fills = (sceneNode as any).fills;
      if (Array.isArray(fills)) {
        for (const fill of fills) {
          if (fill.type === 'SOLID' && fill.visible !== false && fill.color) {
            // Skip if bound to a variable — we can't resolve the actual value reliably
            if (fill.boundVariables && fill.boundVariables.color) continue;
            return fill.color;
          }
        }
      }
    }
    current = current.parent;
  }
  return null;
}

/**
 * Run real accessibility checks on a component node
 */
function runAccessibilityChecks(node: SceneNode, states: string[]): AuditCheck[] {
  const checks: AuditCheck[] = [];
  const interactive = isInteractiveComponent(node, states);

  // 1. Touch target size (for interactive components)
  if (interactive) {
    const width = 'width' in node ? (node as any).width : 0;
    const height = 'height' in node ? (node as any).height : 0;
    const minDim = Math.min(width, height);

    if (minDim >= 44) {
      checks.push({
        check: 'Touch target size',
        status: 'pass',
        suggestion: `Target size ${Math.round(width)}×${Math.round(height)}px meets recommended 44px minimum`
      });
    } else if (minDim >= 24) {
      checks.push({
        check: 'Touch target size',
        status: 'warning',
        suggestion: `Target size ${Math.round(width)}×${Math.round(height)}px meets WCAG minimum (24px) but is below recommended 44px`
      });
    } else {
      checks.push({
        check: 'Touch target size',
        status: 'fail',
        suggestion: `Target size ${Math.round(width)}×${Math.round(height)}px is below WCAG 2.5.8 minimum of 24×24px`
      });
    }
  }

  // 2. Focus state (for interactive components)
  if (interactive) {
    const hasFocus = states.some(s => {
      const lower = s.toLowerCase();
      return lower === 'focus' || lower === 'focused' || lower.includes('focus');
    });
    checks.push({
      check: 'Focus state',
      status: hasFocus ? 'pass' : 'warning',
      suggestion: hasFocus
        ? 'Component has a focus state for keyboard navigation'
        : 'Add a visible focus state to support keyboard navigation (WCAG 2.4.7)'
    });
  }

  // 3. Minimum font size
  if ('findAll' in node) {
    const containerNode = node as FrameNode | ComponentNode | ComponentSetNode;
    const textNodes = containerNode.findAll(n => n.type === 'TEXT') as TextNode[];
    if (textNodes.length > 0) {
      let smallestSize = Infinity;
      let hasSmallText = false;
      for (const text of textNodes) {
        const size = typeof text.fontSize === 'number' ? text.fontSize : 0;
        if (size > 0 && size < smallestSize) smallestSize = size;
        if (size > 0 && size < 12) hasSmallText = true;
      }

      if (hasSmallText) {
        checks.push({
          check: 'Minimum font size',
          status: 'warning',
          suggestion: `Text as small as ${smallestSize}px detected. Consider using 12px minimum for readability`
        });
      } else if (smallestSize !== Infinity) {
        checks.push({
          check: 'Minimum font size',
          status: 'pass',
          suggestion: `Smallest text is ${smallestSize}px, meets readability guidelines`
        });
      }
    }
  }

  // 4. Color contrast (text vs background)
  if ('findAll' in node) {
    const containerNode = node as FrameNode | ComponentNode | ComponentSetNode;
    const textNodes = containerNode.findAll(n => n.type === 'TEXT') as TextNode[];
    let worstRatio = Infinity;
    let checkedCount = 0;
    let worstTextName = '';

    for (const text of textNodes) {
      // Get text fill color (skip variable-bound fills)
      const fills = (text as any).fills;
      if (!Array.isArray(fills) || fills.length === 0) continue;
      const textFill = fills.find((f: any) =>
        f.type === 'SOLID' && f.visible !== false && f.color &&
        !(f.boundVariables && f.boundVariables.color)
      );
      if (!textFill) continue;

      // Find background color
      const bgColor = findBackgroundColor(text);
      if (!bgColor) continue;

      const textLum = getLuminance(textFill.color.r, textFill.color.g, textFill.color.b);
      const bgLum = getLuminance(bgColor.r, bgColor.g, bgColor.b);
      const ratio = getContrastRatio(textLum, bgLum);
      checkedCount++;

      if (ratio < worstRatio) {
        worstRatio = ratio;
        worstTextName = text.name || 'text';
      }
    }

    if (checkedCount > 0 && worstRatio !== Infinity) {
      const ratioStr = worstRatio.toFixed(1);
      // WCAG AA: 4.5:1 for normal text, 3:1 for large text
      if (worstRatio >= 4.5) {
        checks.push({
          check: 'Color contrast',
          status: 'pass',
          suggestion: `Lowest contrast ratio is ${ratioStr}:1, meets WCAG AA (4.5:1)`
        });
      } else if (worstRatio >= 3) {
        checks.push({
          check: 'Color contrast',
          status: 'warning',
          suggestion: `"${worstTextName}" has ${ratioStr}:1 contrast. Meets large text AA (3:1) but not normal text (4.5:1)`
        });
      } else {
        checks.push({
          check: 'Color contrast',
          status: 'fail',
          suggestion: `"${worstTextName}" has ${ratioStr}:1 contrast, below WCAG AA minimum of 3:1`
        });
      }
    }
  }

  // If no checks were applicable (e.g., non-interactive, no text), add a generic pass
  if (checks.length === 0) {
    checks.push({
      check: 'Accessibility review',
      status: 'pass',
      suggestion: 'No accessibility issues detected for this component type'
    });
  }

  return checks;
}

/**
 * Generate fallback MCP readiness data when Claude doesn't provide it
 */
function generateFallbackMCPReadiness(data: {
  node: SceneNode;
  context: any;
  actualProperties: Array<{ name: string; values: string[]; default: string }>;
  actualStates: string[];
  tokens: any;
  componentDescription?: string;
}): any {
  const { node, context, actualProperties, actualStates, tokens, componentDescription } = data;
  const family = context.componentFamily || 'generic';

  // Analyze component structure to determine strengths
  const strengths: string[] = [];
  const gaps: string[] = [];
  const recommendations: string[] = [];


  // Skip meaningless layer counting - focus on actual functionality instead

  // Check for component description (important for MCP/AI understanding)
  if (componentDescription && componentDescription.trim().length > 0) {
    strengths.push('Has component description for better MCP/AI context');
  } else {
    gaps.push('Missing component description - AI cannot understand component purpose and intent');
    recommendations.push('Add a descriptive explanation in component properties to help AI understand the component\'s purpose, behavior, and usage patterns');
  }

  // Check for properties
  if (actualProperties.length > 0) {
    strengths.push(`Has ${actualProperties.length} configurable properties`);
  } else {
    gaps.push('No configurable properties - component cannot be customized for different use cases');
    recommendations.push('Add component properties for customization (size, variant, text content, etc.)');
  }

  // Check for states based on component family
  const shouldHaveStates = context.hasInteractiveElements && family !== 'badge' && family !== 'icon';
  if (shouldHaveStates) {
    if (actualStates.length > 1) {
      strengths.push('Includes multiple component states');
    } else {
      gaps.push('Missing interactive states - users won\'t receive proper feedback for interactions');
      recommendations.push('Add hover, focus, and disabled states with clear visual feedback');
    }
  }

  // Check for design tokens usage with more specificity
  const tokenCounts = {
    colors: tokens?.colors?.filter((t: any) => t.isActualToken)?.length || 0,
    spacing: tokens?.spacing?.filter((t: any) => t.isActualToken)?.length || 0,
    typography: tokens?.typography?.filter((t: any) => t.isActualToken)?.length || 0,
    // Count ALL hard-coded values across categories, not just colors
    hardCoded: [
      ...(tokens?.colors?.filter((t: any) => !t.isActualToken && !t.isDefaultVariantStyle) || []),
      ...(tokens?.spacing?.filter((t: any) => !t.isActualToken && !t.isDefaultVariantStyle) || []),
      ...(tokens?.typography?.filter((t: any) => !t.isActualToken && !t.isDefaultVariantStyle) || []),
      ...(tokens?.effects?.filter((t: any) => !t.isActualToken && !t.isDefaultVariantStyle) || []),
      ...(tokens?.borders?.filter((t: any) => !t.isActualToken && !t.isDefaultVariantStyle) || [])
    ].length
  };

  const totalTokens = tokenCounts.colors + tokenCounts.spacing + tokenCounts.typography;

  if (totalTokens > 0) {
    strengths.push('Uses design tokens for consistency');
    if (tokenCounts.hardCoded > 0) {
      gaps.push('Found hard-coded values - inconsistent with design system');
      recommendations.push('Replace remaining hard-coded colors and spacing with design tokens');
    }
  } else if (tokenCounts.hardCoded > 2) {
    gaps.push('No design tokens used - component styling is inconsistent with design system');
    recommendations.push('Replace hard-coded values with design tokens for colors, spacing, and typography');
  }

  // Check for specific property gaps (be smarter about existing properties)
  const hasSize = actualProperties.some(prop =>
    prop.name.toLowerCase().includes('size') ||
    prop.name.toLowerCase().includes('scale') ||
    prop.name.toLowerCase().includes('dimension')
  );

  const hasVariant = actualProperties.some(prop =>
    prop.name.toLowerCase().includes('variant') ||
    prop.name.toLowerCase().includes('style') ||
    prop.name.toLowerCase().includes('type')
  );

  // Component family specific recommendations (check existing properties first)
  if (family === 'avatar') {
    if (!hasSize && actualProperties.length > 0) {
      gaps.push('No size variants defined - limits reusability across different contexts');
      recommendations.push('Add size property (xs, sm, md, lg, xl) for headers, lists, and profiles');
    }
  } else if (family === 'button') {
    if (actualStates.length <= 1) {
      gaps.push('Missing interactive states - reduces accessibility and user feedback');
      recommendations.push('Add hover, focus, and disabled states with clear visual feedback');
    }
    if (!hasVariant && actualProperties.length > 0) {
      gaps.push('No visual hierarchy variants - limits design flexibility');
      recommendations.push('Add variant property (primary, secondary, danger) for proper hierarchy');
    }
  } else if (family === 'input') {
    if (actualStates.length <= 1) {
      gaps.push('Missing form states - poor accessibility and user experience');
      recommendations.push('Add focus, error, and disabled states with clear visual indicators');
    }
  } else if (family === 'container') {
    // Container-specific recommendations
    if (!hasVariant && actualProperties.length > 0) {
      gaps.push('No layout variants defined - limits flexibility for different use cases');
      recommendations.push('Add orientation property (horizontal, vertical) or density variants');
    }
    if (actualProperties.length > 0 && !actualProperties.some(prop => prop.name.toLowerCase().includes('spacing'))) {
      gaps.push('No spacing customization - may not fit all design contexts');
      recommendations.push('Add spacing property to control internal padding and gaps');
    }
  }

  // Generic improvements (only suggest if not already present)
  if (actualProperties.length === 0) {
    gaps.push('No configurable properties - component lacks flexibility for different use cases');

    // Different recommendations based on component family
    if (family === 'container') {
      recommendations.push('Add layout properties for customization (orientation, spacing, alignment)');
    } else {
      recommendations.push('Add component properties to enable customization and reuse');
    }
  } else if (actualProperties.length === 1 && !hasSize && !hasVariant) {
    gaps.push('Limited customization options - consider adding more properties for flexibility');

    // Container components don't need interactive states
    if (family !== 'container' && shouldHaveStates && actualStates.length <= 1) {
      recommendations.push('Add interactive states and additional variant options');
    } else if (family === 'container') {
      recommendations.push('Consider adding layout variant properties (orientation, density)');
    }
  }

  // Ensure we have minimum content (but make it more specific)
  if (strengths.length === 0) {
    strengths.push('Component follows basic Figma structure patterns');
  }
  if (gaps.length === 0) {
    gaps.push('Well-structured component - consider minor enhancements for broader usage');
  }
  if (recommendations.length === 0) {
    recommendations.push('Component is well-configured - ready for code generation');
  }

  // Calculate score based on actual code generation readiness
  let score = 0;
  
  // Core requirements for code generation (70% of score)
  const hasProperties = actualProperties.length > 0;
  const hasTokens = totalTokens > 0;
  const tokenUsageRatio = totalTokens > 0 ? totalTokens / (totalTokens + tokenCounts.hardCoded) : 0;
  
  // Properties (22% - essential for component flexibility)
  if (hasProperties) {
    score += 22;
  }
  
  // Component description (3% - important for MCP/AI understanding)
  const hasDescription = componentDescription && componentDescription.trim().length > 0;
  if (hasDescription) {
    score += 3;
  }
  
  // Design tokens (25% - essential for consistency)
  score += Math.round(25 * tokenUsageRatio);
  
  // States for interactive components (20% - conditional)
  const needsStates = context.hasInteractiveElements && family !== 'badge' && family !== 'icon';
  if (needsStates) {
    const stateCompleteness = Math.min(actualStates.length / 3, 1); // Expect at least 3 states
    score += Math.round(20 * stateCompleteness);
  } else {
    // Non-interactive components get this portion automatically
    score += 20;
  }
  
  // Component definition clarity (30%)
  // - Has clear boundaries (10%)
  // - Is a proper component/instance (10%)
  // - Has semantic purpose (10%)
  if (node.type === 'COMPONENT' || node.type === 'COMPONENT_SET' || node.type === 'INSTANCE') {
    score += 10; // Clear component boundaries
  }
  
  if (context.name && !context.name.toLowerCase().includes('untitled')) {
    score += 10; // Has semantic purpose (indicated by meaningful name)
  }
  
  // Component is properly structured (not just a raw frame)
  if (hasProperties || hasTokens || actualStates.length > 0) {
    score += 10; // Shows intentional component design
  }
  
  // Ensure score is within bounds
  score = Math.max(0, Math.min(100, score));

  return {
    score,
    strengths,
    gaps: deduplicateRecommendations(gaps), // Apply same deduplication to gaps
    recommendations: deduplicateRecommendations(recommendations),
    implementationNotes: generateImplementationNotes(family, strengths, gaps, actualProperties, actualStates, tokenCounts)
  };
}

/**
 * Generate meaningful implementation notes based on component analysis
 */
function generateImplementationNotes(
  family: string,
  strengths: string[],
  gaps: string[],
  properties: any[],
  states: string[],
  tokenCounts: any
): string {
  // Provide specific guidance based on the component's current state
  const notes: string[] = [];
  
  // Component-specific guidance
  if (family === 'button') {
    if (states.length < 3) {
      notes.push('Implement hover, focus, and active states for better interactivity');
    }
    if (properties.length === 0) {
      notes.push('Add variant and size properties to support different use cases');
    }
  } else if (family === 'input') {
    if (!states.includes('error')) {
      notes.push('Add error state with clear visual indicators for form validation');
    }
    notes.push('Ensure proper label association and placeholder text patterns');
  } else if (family === 'card') {
    notes.push('Consider implementing click handlers for interactive cards');
    if (properties.length === 0) {
      notes.push('Add elevation or variant properties for visual hierarchy');
    }
  } else if (family === 'avatar') {
    notes.push('Implement fallback patterns for missing images');
    if (!properties.some(p => p.name.toLowerCase().includes('size'))) {
      notes.push('Add size variants for flexible usage across contexts');
    }
  } else if (family === 'container') {
    notes.push('Focus on layout flexibility and content composition');
    notes.push('Consider responsive behavior for different screen sizes');
  }
  
  // Token usage guidance
  if (tokenCounts.hardCoded > tokenCounts.colors + tokenCounts.spacing) {
    notes.push('Prioritize converting hard-coded values to design tokens');
  }
  
  // Property guidance
  if (properties.length === 0) {
    notes.push('Define component properties to enable customization without code changes');
  } else if (properties.length === 1) {
    notes.push('Consider additional properties for greater flexibility');
  }
  
  // If we have no specific notes, provide general guidance
  if (notes.length === 0) {
    if (gaps.length > 3) {
      notes.push('Focus on addressing the high-priority gaps identified above');
    } else if (strengths.length > gaps.length) {
      notes.push('Component is well-structured for code generation with minor improvements needed');
    } else {
      notes.push('Balance quick wins with systematic improvements for optimal results');
    }
  }
  
  return notes.join('. ') + '.';
}

/**
 * Deduplicate similar items (recommendations, gaps, etc.) to avoid redundancy
 */
function deduplicateRecommendations(items: string[]): string[] {
  if (items.length <= 1) return items;

  const deduplicated: string[] = [];
  const seenPatterns = new Set<string>();

    // Define similarity patterns - if two items match these patterns, keep only one
  const similarityPatterns = [
    // Component properties patterns (recommendations)
    {
      pattern: /add.*component.*propert/i,
      message: 'Add component properties for customization and reuse'
    },
    // State patterns (recommendations)
    {
      pattern: /add.*(hover|focus|disabled|interactive).*state/i,
      message: 'Add hover, focus, and disabled states with clear visual feedback'
    },
    // Token patterns (recommendations)
    {
      pattern: /replace.*hard.coded.*(color|spacing|token)/i,
      message: 'Replace remaining hard-coded colors and spacing with design tokens'
    },
    // Variant patterns (recommendations)
    {
      pattern: /add.*(size|variant).*propert/i,
      message: 'Add size and style variant properties for different use cases'
    },
    // Gap-specific patterns
    {
      pattern: /no.*configurable.*propert.*(cannot|lacks|limited)/i,
      message: 'No configurable properties - component lacks flexibility for different use cases'
    },
    {
      pattern: /(missing|no).*(interactive|hover|focus).*state/i,
      message: 'Missing interactive states - reduces accessibility and user feedback'
    },
    {
      pattern: /found.*hard.coded.*value.*(inconsistent|design.*system)/i,
      message: 'Found hard-coded values - inconsistent with design system'
    },
    {
      pattern: /(minimal|simple).*layer.*structure.*(lack|semantic|organization)/i,
      message: 'Minimal layer structure - may lack semantic organization for complex use cases'
    }
  ];

  items.forEach(item => {
    const normalizedItem = item.trim();
    if (!normalizedItem) return;

    // Check if this item matches any existing pattern
    let shouldAdd = true;
    let patternMessage = normalizedItem;

    for (const { pattern, message } of similarityPatterns) {
      if (pattern.test(normalizedItem)) {
        if (seenPatterns.has(pattern.source)) {
          // We've already seen an item matching this pattern
          shouldAdd = false;
          break;
        } else {
          // First time seeing this pattern, mark it as seen and use the canonical message
          seenPatterns.add(pattern.source);
          patternMessage = message;
          break;
        }
      }
    }

    // Also check for exact duplicates (case insensitive)
    const lowerItem = normalizedItem.toLowerCase();
    const isDuplicate = deduplicated.some(existing =>
      existing.toLowerCase() === lowerItem ||
      // Check for very similar messages (80% similarity)
      calculateSimilarity(existing.toLowerCase(), lowerItem) > 0.8
    );

    if (shouldAdd && !isDuplicate) {
      deduplicated.push(patternMessage);
    }
  });

  debugLog(`🔍 [DEDUP] Reduced ${items.length} items to ${deduplicated.length}`);
  if (items.length !== deduplicated.length) {
    debugLog(`🔍 [DEDUP] Original:`, items);
    debugLog(`🔍 [DEDUP] Deduplicated:`, deduplicated);
  }

  return deduplicated;
}

/**
 * Calculate string similarity (simple version)
 */
function calculateSimilarity(str1: string, str2: string): number {
  const longer = str1.length > str2.length ? str1 : str2;
  const shorter = str1.length > str2.length ? str2 : str1;

  if (longer.length === 0) return 1.0;

  const distance = levenshteinDistance(longer, shorter);
  return (longer.length - distance) / longer.length;
}

/**
 * Calculate Levenshtein distance between two strings
 */
function levenshteinDistance(str1: string, str2: string): number {
  const matrix: number[][] = [];

  for (let i = 0; i <= str2.length; i++) {
    matrix[i] = [i];
  }

  for (let j = 0; j <= str1.length; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= str2.length; i++) {
    for (let j = 1; j <= str1.length; j++) {
      if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1, // substitution
          matrix[i][j - 1] + 1,     // insertion
          matrix[i - 1][j] + 1      // deletion
        );
      }
    }
  }

  return matrix[str2.length][str1.length];
}

// ============================================================================
// Detached Instance Detection
// ============================================================================

/**
 * Scan the current page for FRAME nodes that appear to be detached copies
 * of a specific component being analyzed.
 *
 * Only runs for COMPONENT or COMPONENT_SET nodes. Scans the page — not the
 * component's own children — for frames whose name matches the component
 * (or its variant names). Skips frames that live inside other components.
 *
 * Returns DetachedInstanceInfo[] with node IDs (for click-to-navigate) and
 * parent paths (for disambiguation when multiple detached copies share a name).
 *
 * This is an informational check (not scored) that helps designers identify
 * orphaned copies before AI code-generation handoff.
 */
export function detectDetachedInstances(node: SceneNode): DetachedInstanceInfo[] {
  // Only run for components — never for plain FRAMEs or other node types
  if (node.type !== 'COMPONENT' && node.type !== 'COMPONENT_SET') {
    return [];
  }

  const page = figma.currentPage;

  // Build the set of names to match against:
  //  - The component/component-set name itself
  //  - If it's a component set, also collect child variant names (e.g. "Button/Primary")
  const targetNames = new Set<string>();
  const componentId = node.id;
  targetNames.add(node.name);

  if (node.type === 'COMPONENT_SET') {
    const componentSet = node as ComponentSetNode;
    for (const child of componentSet.children) {
      if (child.type === 'COMPONENT') {
        targetNames.add(child.name);
      }
    }
  }

  // Also match frames with variant-style naming where the base name matches
  // e.g. "Button/Large/Disabled" when analyzing a component named "Button"
  const componentBaseName = node.name.split('/')[0].trim().toLowerCase();

  // Scan the page for FRAME nodes (detached instances become FRAMEs).
  // findAllWithCriteria is the optimized native path — page.findAll with a
  // JS predicate walks every node through the plugin bridge.
  const allFrames = page.findAllWithCriteria({ types: ['FRAME'] });

  const results: DetachedInstanceInfo[] = [];

  for (const frame of allFrames) {
    // Skip the component itself and anything inside it
    if (frame.id === componentId) continue;
    if (isDescendantOf(frame, componentId)) continue;

    // Skip frames that are inside any component (they're part of another component's design)
    if (isInsideComponent(frame)) continue;

    // Skip top-level frames (direct children of the page). These are artboards/canvases
    // used for organization (e.g. documentation pages, showcases). Detached instances
    // are always nested inside other frames where the component was being used.
    if (frame.parent && frame.parent.type === 'PAGE') continue;

    const frameName = frame.name;

    // Layer 1: Exact name match against this component or its variants
    if (targetNames.has(frameName)) {
      results.push({
        name: frameName,
        nodeId: frame.id,
        parentPath: buildParentPath(frame),
        reason: `This frame matches component "${node.name}" but is not a component instance. It was likely detached and won't receive component updates. Consider replacing it with a proper instance.`
      });
      continue;
    }

    // Layer 2: Variant-style naming where the base name matches this component
    if (frameName.includes('/')) {
      const frameBaseName = frameName.split('/')[0].trim().toLowerCase();
      if (frameBaseName === componentBaseName && frameBaseName.length >= 2) {
        results.push({
          name: frameName,
          nodeId: frame.id,
          parentPath: buildParentPath(frame),
          reason: `This frame uses variant-style naming matching "${node.name}" but is a plain frame, not a component instance. It was likely detached and won't receive updates.`
        });
      }
    }
  }

  return results;
}

/**
 * Build a human-readable parent path for a node (e.g. "Section > Frame > Group").
 * Shows up to 3 ancestor levels for context without being overwhelming.
 */
function buildParentPath(node: BaseNode): string {
  const parts: string[] = [];
  let current: BaseNode | null = node.parent;
  let depth = 0;
  const maxDepth = 3;

  while (current && depth < maxDepth) {
    if ('name' in current && current.name) {
      // Skip the page itself — it's implied
      if (current.type === 'PAGE') break;
      parts.unshift(current.name as string);
    }
    current = current.parent;
    depth++;
  }

  return parts.length > 0 ? parts.join(' > ') : 'Page root';
}

/**
 * Check if a node is a descendant of a specific node by ID.
 */
function isDescendantOf(node: BaseNode, ancestorId: string): boolean {
  let current: BaseNode | null = node.parent;
  while (current) {
    if (current.id === ancestorId) return true;
    current = current.parent;
  }
  return false;
}

/**
 * Check if a node is nested inside a COMPONENT or COMPONENT_SET ancestor.
 */
function isInsideComponent(node: BaseNode): boolean {
  let current: BaseNode | null = node.parent;
  while (current) {
    if ('type' in current) {
      const t = (current as SceneNode).type;
      if (t === 'COMPONENT' || t === 'COMPONENT_SET') return true;
    }
    current = current.parent;
  }
  return false;
}
