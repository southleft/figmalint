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
function extractActualComponentProperties(node: SceneNode, selectedNode?: SceneNode): Array<{ name: string; values: string[]; default: string }> {
  const actualProperties: Array<{ name: string; values: string[]; default: string }> = [];

  console.log('🔍 [DEBUG] Starting property extraction for node:', node.name, 'type:', node.type);
  console.log('🔍 [DEBUG] Originally selected node:', selectedNode?.name, 'type:', selectedNode?.type);

  // PRIORITY 1: If we have a selected instance, extract from its componentProperties first
  if (selectedNode && selectedNode.type === 'INSTANCE') {
    const instance = selectedNode as InstanceNode;
    console.log('🔍 [DEBUG] Extracting from selected instance componentProperties...');

    try {
      if ('componentProperties' in instance && instance.componentProperties) {
        const instanceProps = instance.componentProperties;
        console.log('🔍 [DEBUG] Found componentProperties on selected instance:', Object.keys(instanceProps));

        // Get the component set for property definitions
        const mainComponent = instance.mainComponent;
        if (mainComponent && mainComponent.parent && mainComponent.parent.type === 'COMPONENT_SET') {
          const componentSet = mainComponent.parent as ComponentSetNode;

          // Try to get property definitions from component set (even if errored)
          let propertyDefinitions: any = null;
          try {
            if ('componentPropertyDefinitions' in componentSet) {
              propertyDefinitions = componentSet.componentPropertyDefinitions;
              console.log('🔍 [DEBUG] Got componentPropertyDefinitions from component set');
            }
          } catch (error) {
            console.log('🔍 [DEBUG] Could not access componentPropertyDefinitions, using instance properties only');
          }

          // Extract properties from instance
          for (const propName in instanceProps) {
            const instanceProp = instanceProps[propName];
            console.log(`🔍 [DEBUG] Processing instance property "${propName}":`, instanceProp);

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
              console.log(`🔍 [DEBUG] Found property definition for "${propName}":`, propDef);

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
              console.log(`🔍 [DEBUG] No property definition for "${propName}", inferring from value`);

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

            console.log(`🔍 [DEBUG] Added instance property:`, { name: displayName, values, default: currentValue });
          }

          // If we successfully extracted from instance, return early
          if (actualProperties.length > 0) {
            console.log(`🔍 [DEBUG] Successfully extracted ${actualProperties.length} properties from selected instance`);
            return actualProperties;
          }
        }
      }
    } catch (error) {
      console.log('🔍 [DEBUG] Could not extract from instance componentProperties:', error);
    }
  }

  // PRIORITY 2: Continue with original extraction methods if instance extraction failed
  if (node.type === 'COMPONENT_SET') {
    const componentSet = node as ComponentSetNode;

    // Method 1: Try componentPropertyDefinitions (most comprehensive)
    console.log('🔍 [DEBUG] Attempting to access componentPropertyDefinitions...');
    try {
      // Test if the property exists first
      if ('componentPropertyDefinitions' in componentSet) {
        console.log('🔍 [DEBUG] componentPropertyDefinitions property exists on componentSet');

        const propertyDefinitions = componentSet.componentPropertyDefinitions;
        console.log('🔍 [DEBUG] Raw componentPropertyDefinitions:', propertyDefinitions);
        console.log('🔍 [DEBUG] Type of componentPropertyDefinitions:', typeof propertyDefinitions);

        if (propertyDefinitions && typeof propertyDefinitions === 'object') {
          const propKeys = Object.keys(propertyDefinitions);
          console.log('🔍 [DEBUG] Found componentPropertyDefinitions with keys:', propKeys);

          for (const propName in propertyDefinitions) {
            const prop = propertyDefinitions[propName];
            console.log(`🔍 [DEBUG] Processing property "${propName}":`, prop);

            let displayName = propName;
            let values: string[] = [];
            let defaultValue = '';

            // Clean up property name (remove unique identifier for display)
            if (propName.includes('#')) {
              displayName = propName.split('#')[0];
              console.log(`🔍 [DEBUG] Cleaned display name: "${displayName}" from "${propName}"`);
            }

            switch (prop.type) {
              case 'VARIANT':
                values = prop.variantOptions || [];
                defaultValue = String(prop.defaultValue) || values[0] || 'default';
                console.log(`🔍 [DEBUG] VARIANT property "${displayName}": values=${values}, default=${defaultValue}`);
                break;

              case 'BOOLEAN':
                values = ['true', 'false'];
                defaultValue = prop.defaultValue ? 'true' : 'false';
                console.log(`🔍 [DEBUG] BOOLEAN property "${displayName}": default=${defaultValue}`);
                break;

              case 'TEXT':
                values = [String(prop.defaultValue || 'Text content')];
                defaultValue = String(prop.defaultValue || 'Text content');
                console.log(`🔍 [DEBUG] TEXT property "${displayName}": value=${defaultValue}`);
                break;

              case 'INSTANCE_SWAP':
                // Handle instance swap properties
                if (prop.preferredValues && Array.isArray(prop.preferredValues)) {
                  values = prop.preferredValues.map((v: any) => {
                    console.log(`🔍 [DEBUG] INSTANCE_SWAP preferred value:`, v);
                    return v.key || v.name || 'Component instance';
                  });
                } else {
                  values = ['Component instance'];
                }
                defaultValue = values[0] || 'Component instance';
                console.log(`🔍 [DEBUG] INSTANCE_SWAP property "${displayName}": values=${values}, default=${defaultValue}`);
                break;

              default:
                console.log(`🔍 [DEBUG] Unknown property type "${prop.type}" for "${displayName}"`);
                values = ['Property value'];
                defaultValue = 'Default';
            }

            actualProperties.push({
              name: displayName,
              values,
              default: defaultValue
            });

            console.log(`🔍 [DEBUG] Added property:`, { name: displayName, values, default: defaultValue });
          }
        } else {
          console.log('🔍 [DEBUG] componentPropertyDefinitions is not a valid object:', propertyDefinitions);
        }
      } else {
        console.log('🔍 [DEBUG] componentPropertyDefinitions property does not exist on componentSet');
      }
    } catch (error) {
      console.error('🔍 [ERROR] Could not access componentPropertyDefinitions:', error);
      console.error('🔍 [ERROR] Error stack:', error instanceof Error ? error.stack : 'No stack trace');
    }

    // Method 2: Fallback to variantGroupProperties if componentPropertyDefinitions failed
    if (actualProperties.length === 0) {
      console.log('🔍 [DEBUG] No properties found, trying variantGroupProperties fallback...');
      try {
        const variantProps = componentSet.variantGroupProperties;
        console.log('🔍 [DEBUG] variantGroupProperties:', variantProps);

        if (variantProps) {
          const variantKeys = Object.keys(variantProps);
          console.log('🔍 [DEBUG] Found variantGroupProperties with keys:', variantKeys);

          for (const propName in variantProps) {
            const prop = variantProps[propName];
            console.log(`🔍 [DEBUG] Processing variant property "${propName}":`, prop);

            actualProperties.push({
              name: propName,
              values: prop.values,
              default: prop.values[0] || 'default'
            });
          }
        } else {
          console.log('🔍 [DEBUG] variantGroupProperties is null/undefined');
        }
      } catch (error) {
        console.warn('🔍 [WARN] Component set has errors, cannot access variantGroupProperties:', error);
      }
    }

    // Method 3: Enhanced structural analysis when APIs fail
    if (actualProperties.length === 0) {
      console.log('🔍 [DEBUG] All Figma APIs failed, using comprehensive structural analysis...');
      const structuralProperties = extractPropertiesFromStructuralAnalysis(componentSet);
      console.log('🔍 [DEBUG] Properties from structural analysis:', structuralProperties);
      actualProperties.push(...structuralProperties);
    }

    // Method 4: Final fallback - extract from variant names
    if (actualProperties.length === 0) {
      console.log('🔍 [DEBUG] Final fallback: extracting from variant names');
      const variantPropsFromNames = extractPropertiesFromVariantNames(componentSet);
      console.log('🔍 [DEBUG] Properties from variant names:', variantPropsFromNames);
      actualProperties.push(...variantPropsFromNames);
    }

  } else if (node.type === 'COMPONENT') {
    const component = node as ComponentNode;
    console.log('🔍 [DEBUG] Processing COMPONENT node:', component.name);

    // For individual components, try componentPropertyDefinitions first
    try {
      if ('componentPropertyDefinitions' in component) {
        const propertyDefinitions = component.componentPropertyDefinitions;
        console.log('🔍 [DEBUG] Component componentPropertyDefinitions:', propertyDefinitions);

        if (propertyDefinitions && typeof propertyDefinitions === 'object') {
          const propKeys = Object.keys(propertyDefinitions);
          console.log('🔍 [DEBUG] Found componentPropertyDefinitions on component with keys:', propKeys);

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
        console.log('🔍 [DEBUG] componentPropertyDefinitions does not exist on component');
      }
    } catch (error) {
      console.warn('🔍 [WARN] Could not access componentPropertyDefinitions on component:', error);
    }

    // Check if component is part of a component set for variant properties
    if (component.parent && component.parent.type === 'COMPONENT_SET') {
      const componentSet = component.parent as ComponentSetNode;
      console.log('🔍 [DEBUG] Component is part of a component set, getting variant properties...');

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
    // This case is already handled above in PRIORITY 1
    console.log('🔍 [DEBUG] Instance case already handled in priority 1');
  }

  // Remove duplicates and return
  const uniqueProperties: Array<{ name: string; values: string[]; default: string }> = [];
  actualProperties.forEach(prop => {
    if (!uniqueProperties.find(p => p.name === prop.name)) {
      uniqueProperties.push(prop);
    }
  });

  console.log(`🔍 [DEBUG] Final result: Extracted ${uniqueProperties.length} unique properties:`, uniqueProperties.map(p => ({ name: p.name, valueCount: p.values.length, default: p.default })));
  return uniqueProperties;
}

/**
 * Comprehensive structural analysis to extract properties when Figma APIs fail completely
 */
function extractPropertiesFromStructuralAnalysis(componentSet: ComponentSetNode): Array<{ name: string; values: string[]; default: string }> {
  const properties: Array<{ name: string; values: string[]; default: string }> = [];

  console.log('🔍 [STRUCTURAL] Starting comprehensive structural analysis of component set:', componentSet.name);

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
      console.log(`🔍 [STRUCTURAL] Analyzing variant: ${variant.name}`);

      // Traverse the variant to find all child nodes
      const traverseNode = (node: SceneNode, depth = 0) => {
        const indent = '  '.repeat(depth);
        console.log(`🔍 [STRUCTURAL] ${indent}Found child: ${node.name} (type: ${node.type})`);

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

  console.log('🔍 [STRUCTURAL] Analysis results:');
  console.log('🔍 [STRUCTURAL] - All child names:', Array.from(allChildNames));
  console.log('🔍 [STRUCTURAL] - Text layers:', Array.from(textLayers));
  console.log('🔍 [STRUCTURAL] - Instance layers:', Array.from(instanceLayers));
  console.log('🔍 [STRUCTURAL] - Boolean indicators:', Array.from(booleanIndicators));

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
      console.log(`🔍 [STRUCTURAL] Added TEXT property: ${cleanName}`);
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
      console.log(`🔍 [STRUCTURAL] Added INSTANCE_SWAP property: ${cleanName}`);
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
      console.log(`🔍 [STRUCTURAL] Added BOOLEAN property: ${propertyName}`);
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
        console.log(`🔍 [STRUCTURAL] Added common ${type} property: ${name}`);
      }
    });
  }

  console.log(`🔍 [STRUCTURAL] Final structural analysis result: ${properties.length} properties found`);
  return properties;
}

/**
 * Extract actual states from a component
 */
function extractActualComponentStates(node: SceneNode): string[] {
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
  node: SceneNode,
  selectedNode?: SceneNode
): Promise<EnhancedAnalysisResult> {
  // Extract tokens from the actual node
  const tokens = await extractDesignTokensFromNode(node);

  // Get component context for analysis
  const context = extractAdditionalContext(node);

  // EXTRACT ACTUAL FIGMA DATA (source of truth) with selected node for instance properties
  const actualProperties = extractActualComponentProperties(node, selectedNode);
  const actualStates = extractActualComponentStates(node);

  // Generate property recommendations if component has few or no properties
  let recommendations: Array<{ name: string; type: string; description: string; examples: string[] }> | undefined;

  const shouldGenerateRecommendations = actualProperties.length <= 2; // Threshold for generating recommendations
  if (shouldGenerateRecommendations) {
    console.log('🔍 [DEBUG] Component has few properties, generating recommendations...');
    recommendations = generatePropertyRecommendations(node.name, actualProperties);
  }

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
    mcpReadiness: claudeData.mcpReadiness ?
      enhanceMCPReadinessWithFallback(claudeData.mcpReadiness, {
        node,
        context,
        actualProperties,
        actualStates,
        tokens
      }) : generateFallbackMCPReadiness({
        node,
        context,
        actualProperties,
        actualStates,
        tokens
      })
  };

  return {
    metadata: cleanMetadata,
    tokens,
    audit,
    properties: actualProperties, // This will be used by the UI for the property cheat sheet
    recommendations
  };
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
}): any {
  const { node, context, actualProperties, actualStates, tokens } = data;
  const family = context.componentFamily || 'generic';

  // Analyze component structure to determine strengths
  const strengths: string[] = [];
  const gaps: string[] = [];
  const recommendations: string[] = [];

  // Check layer naming
  if (node.name && node.name.trim() !== '' && !node.name.toLowerCase().includes('untitled')) {
    strengths.push('Component has descriptive naming');
  } else {
    gaps.push('Component name needs improvement');
    recommendations.push('Use descriptive component names that indicate purpose');
  }

  // Check component structure
  if (context.hierarchy && context.hierarchy.length > 1) {
    strengths.push('Well-structured component hierarchy');
  } else {
    gaps.push('Simple component structure');
  }

  // Check for properties
  if (actualProperties.length > 0) {
    strengths.push(`Has ${actualProperties.length} configurable properties`);
  } else {
    gaps.push('No configurable properties defined');
    recommendations.push('Add component properties for customization');
  }

  // Check for states based on component family
  const shouldHaveStates = context.hasInteractiveElements && family !== 'badge' && family !== 'icon';
  if (shouldHaveStates) {
    if (actualStates.length > 1) {
      strengths.push('Includes multiple component states');
    } else {
      gaps.push('Missing interactive states');
      recommendations.push('Add hover, focus, and disabled states for interactive components');
    }
  }

  // Check for design tokens usage
  const hasTokens = tokens && (
    (tokens.colors && tokens.colors.some((t: any) => t.isActualToken)) ||
    (tokens.spacing && tokens.spacing.some((t: any) => t.isActualToken)) ||
    (tokens.typography && tokens.typography.some((t: any) => t.isActualToken))
  );

  if (hasTokens) {
    strengths.push('Uses design tokens for consistency');
  } else {
    gaps.push('Limited design token usage');
    recommendations.push('Replace hard-coded values with design tokens');
  }

  // Component family specific recommendations
  if (family === 'avatar' && actualProperties.length === 0) {
    gaps.push('Missing size variants');
    recommendations.push('Add size property for different use cases');
  } else if (family === 'button' && actualStates.length <= 1) {
    gaps.push('Incomplete accessibility features');
    recommendations.push('Add accessibility states and ARIA labels');
  }

  // Ensure we have minimum content
  if (strengths.length === 0) {
    strengths.push('Component follows basic structure patterns');
  }
  if (gaps.length === 0) {
    gaps.push('Component could benefit from additional states');
  }
  if (recommendations.length === 0) {
    recommendations.push('Consider adding size variants for scalability');
  }

  // Calculate score based on strengths vs gaps
  const baseScore = Math.max(40, 100 - (gaps.length * 15) + (strengths.length * 10));
  const score = Math.min(100, baseScore);

  return {
    score,
    strengths,
    gaps,
    recommendations,
    implementationNotes: `This ${family} component can be enhanced for better MCP code generation compatibility by addressing the identified gaps.`
  };
}

/**
 * Enhance MCP readiness data from Claude with fallback content
 */
function enhanceMCPReadinessWithFallback(mcpData: any, data: {
  node: SceneNode;
  context: any;
  actualProperties: Array<{ name: string; values: string[]; default: string }>;
  actualStates: string[];
  tokens: any;
}): any {
  const score = parseInt(mcpData.score) || 0;
  let strengths = Array.isArray(mcpData.strengths) ? mcpData.strengths.filter((s: any) =>
    typeof s === 'string' && s.trim() && !s.includes('REQUIRED') && !s.includes('Examples')
  ) : [];
  let gaps = Array.isArray(mcpData.gaps) ? mcpData.gaps.filter((g: any) =>
    typeof g === 'string' && g.trim() && !g.includes('REQUIRED') && !g.includes('Examples')
  ) : [];
  let recommendations = Array.isArray(mcpData.recommendations) ? mcpData.recommendations.filter((r: any) =>
    typeof r === 'string' && r.trim() && !r.includes('REQUIRED') && !r.includes('Examples')
  ) : [];

  // Generate fallback content if Claude didn't provide enough
  if (strengths.length === 0 || gaps.length === 0 || recommendations.length === 0) {
    console.log('🔄 Enhancing MCP readiness with fallback content...');
    const fallback = generateFallbackMCPReadiness(data);

    if (strengths.length === 0) {
      strengths = fallback.strengths;
    }
    if (gaps.length === 0) {
      gaps = fallback.gaps;
    }
    if (recommendations.length === 0) {
      recommendations = fallback.recommendations;
    }
  }

  return {
    score,
    strengths,
    gaps,
    recommendations,
    implementationNotes: mcpData.implementationNotes ||
      `This component can be optimized for MCP code generation by addressing the identified improvements.`
  };
}

/**
 * Generate property recommendations for components with few or no properties
 */
function generatePropertyRecommendations(componentName: string, existingProperties: Array<{ name: string; values: string[]; default: string }>): Array<{ name: string; type: string; description: string; examples: string[] }> {
  const recommendations: Array<{ name: string; type: string; description: string; examples: string[] }> = [];
  const lowerName = componentName.toLowerCase();

  console.log('🔍 [RECOMMENDATIONS] Generating recommendations for:', componentName, 'with', existingProperties.length, 'existing properties');

  // Check what properties are already present
  const hasProperty = (name: string) => {
    const lowerName = name.toLowerCase();
    return existingProperties.some(prop => {
      const propName = prop.name.toLowerCase();
      // Exact match or very close match
      return propName === lowerName ||
             propName.includes(lowerName) ||
             lowerName.includes(propName) ||
             // Handle common variations
             (lowerName === 'text' && (propName === 'label' || propName.includes('text'))) ||
             (lowerName === 'label' && (propName === 'text' || propName.includes('label')));
    });
  };

  // Avatar/Profile component recommendations
  if (lowerName.includes('avatar') || lowerName.includes('profile') || lowerName.includes('user')) {
    if (!hasProperty('size')) {
      recommendations.push({
        name: 'Size',
        type: 'VARIANT',
        description: 'Different sizes for various use cases (list items, headers, etc.)',
        examples: ['xs (24px)', 'sm (32px)', 'md (40px)', 'lg (56px)', 'xl (80px)']
      });
    }

    if (!hasProperty('initials') && !hasProperty('text')) {
      recommendations.push({
        name: 'Initials',
        type: 'TEXT',
        description: 'User initials displayed when no image is available',
        examples: ['JD', 'AS', 'MT']
      });
    }

    if (!hasProperty('image') && !hasProperty('src')) {
      recommendations.push({
        name: 'Image',
        type: 'INSTANCE_SWAP',
        description: 'User profile image or placeholder',
        examples: ['User photo', 'Default avatar', 'Company logo']
      });
    }

    if (!hasProperty('status') && !hasProperty('indicator')) {
      recommendations.push({
        name: 'Status Indicator',
        type: 'BOOLEAN',
        description: 'Online/offline status or notification badge',
        examples: ['true (show indicator)', 'false (no indicator)']
      });
    }

    if (!hasProperty('border') && !hasProperty('ring')) {
      recommendations.push({
        name: 'Border',
        type: 'BOOLEAN',
        description: 'Optional border around the avatar',
        examples: ['true (with border)', 'false (no border)']
      });
    }
  }

  // Button component recommendations
  else if (lowerName.includes('button') || lowerName.includes('btn')) {
    if (!hasProperty('variant') && !hasProperty('style')) {
      recommendations.push({
        name: 'Variant',
        type: 'VARIANT',
        description: 'Visual style variants for different hierarchy levels',
        examples: ['primary', 'secondary', 'tertiary', 'danger', 'ghost']
      });
    }

    if (!hasProperty('size')) {
      recommendations.push({
        name: 'Size',
        type: 'VARIANT',
        description: 'Button sizes for different contexts',
        examples: ['sm', 'md', 'lg', 'xl']
      });
    }

    if (!hasProperty('state')) {
      recommendations.push({
        name: 'State',
        type: 'VARIANT',
        description: 'Interactive states for user feedback',
        examples: ['default', 'hover', 'focus', 'pressed', 'disabled']
      });
    }

    if (!hasProperty('icon') && !hasProperty('before') && !hasProperty('after')) {
      recommendations.push({
        name: 'Icon Before',
        type: 'INSTANCE_SWAP',
        description: 'Optional icon before the button text',
        examples: ['Plus icon', 'Arrow icon', 'No icon']
      });
    }

    if (!hasProperty('text') && !hasProperty('label')) {
      recommendations.push({
        name: 'Text',
        type: 'TEXT',
        description: 'Button label text',
        examples: ['Click me', 'Submit', 'Cancel', 'Save changes']
      });
    }
  }

  // Input/Form component recommendations
  else if (lowerName.includes('input') || lowerName.includes('field') || lowerName.includes('form')) {
    if (!hasProperty('label')) {
      recommendations.push({
        name: 'Label',
        type: 'TEXT',
        description: 'Input label for accessibility and clarity',
        examples: ['Email address', 'Full name', 'Password']
      });
    }

    if (!hasProperty('placeholder')) {
      recommendations.push({
        name: 'Placeholder',
        type: 'TEXT',
        description: 'Placeholder text shown when input is empty',
        examples: ['Enter your email...', 'Type here...']
      });
    }

    if (!hasProperty('state')) {
      recommendations.push({
        name: 'State',
        type: 'VARIANT',
        description: 'Input states for different interactions',
        examples: ['default', 'focus', 'error', 'disabled', 'success']
      });
    }

    if (!hasProperty('required')) {
      recommendations.push({
        name: 'Required',
        type: 'BOOLEAN',
        description: 'Whether the field is required',
        examples: ['true (required)', 'false (optional)']
      });
    }

    if (!hasProperty('error') && !hasProperty('helper')) {
      recommendations.push({
        name: 'Helper Text',
        type: 'TEXT',
        description: 'Helper or error message below the input',
        examples: ['This field is required', 'Must be a valid email']
      });
    }
  }

  // Card component recommendations
  else if (lowerName.includes('card')) {
    if (!hasProperty('variant') && !hasProperty('elevation')) {
      recommendations.push({
        name: 'Elevation',
        type: 'VARIANT',
        description: 'Card elevation/shadow level',
        examples: ['none', 'low', 'medium', 'high']
      });
    }

    if (!hasProperty('interactive') && !hasProperty('clickable')) {
      recommendations.push({
        name: 'Interactive',
        type: 'BOOLEAN',
        description: 'Whether the card is clickable/interactive',
        examples: ['true (clickable)', 'false (static)']
      });
    }

    if (!hasProperty('image') && !hasProperty('media')) {
      recommendations.push({
        name: 'Media',
        type: 'INSTANCE_SWAP',
        description: 'Optional image or media at the top of the card',
        examples: ['Product image', 'Hero image', 'No media']
      });
    }
  }

  // Badge/Tag component recommendations
  else if (lowerName.includes('badge') || lowerName.includes('tag') || lowerName.includes('chip')) {
    if (!hasProperty('variant') && !hasProperty('color')) {
      recommendations.push({
        name: 'Variant',
        type: 'VARIANT',
        description: 'Badge color/style variants',
        examples: ['primary', 'secondary', 'success', 'warning', 'error']
      });
    }

    if (!hasProperty('size')) {
      recommendations.push({
        name: 'Size',
        type: 'VARIANT',
        description: 'Badge sizes for different contexts',
        examples: ['sm', 'md', 'lg']
      });
    }

    if (!hasProperty('text') && !hasProperty('label')) {
      recommendations.push({
        name: 'Text',
        type: 'TEXT',
        description: 'Badge text content',
        examples: ['New', 'Beta', 'Sale', '5', 'Premium']
      });
    }

    if (!hasProperty('removable') && !hasProperty('close')) {
      recommendations.push({
        name: 'Removable',
        type: 'BOOLEAN',
        description: 'Whether the badge can be removed/dismissed',
        examples: ['true (show close button)', 'false (static)']
      });
    }
  }

  // Icon component recommendations
  else if (lowerName.includes('icon')) {
    if (!hasProperty('size')) {
      recommendations.push({
        name: 'Size',
        type: 'VARIANT',
        description: 'Icon sizes for different use cases',
        examples: ['12px', '16px', '20px', '24px', '32px']
      });
    }

    if (!hasProperty('color') && !hasProperty('variant')) {
      recommendations.push({
        name: 'Color',
        type: 'VARIANT',
        description: 'Icon color variants',
        examples: ['default', 'muted', 'primary', 'success', 'warning', 'error']
      });
    }
  }

  // Generic component recommendations (if no specific type detected)
  if (recommendations.length === 0) {
    // Add some common recommendations for any component
    if (!hasProperty('size')) {
      recommendations.push({
        name: 'Size',
        type: 'VARIANT',
        description: 'Component sizes for different contexts',
        examples: ['sm', 'md', 'lg']
      });
    }

    if (!hasProperty('variant') && !hasProperty('style')) {
      recommendations.push({
        name: 'Variant',
        type: 'VARIANT',
        description: 'Visual style variants',
        examples: ['primary', 'secondary', 'tertiary']
      });
    }
  }

  // Filter out recommendations that are too similar to existing properties
  const filteredRecommendations = recommendations.filter(rec => {
    const recName = rec.name.toLowerCase();
    const similarExists = existingProperties.some(existing => {
      const existingName = existing.name.toLowerCase();

      // Exact match
      if (existingName === recName) return true;

      // Partial matches
      if (existingName.includes(recName) || recName.includes(existingName)) return true;

      // Common semantic equivalents
      const semanticMatches = [
        ['text', 'label', 'content'],
        ['size', 'scale', 'dimension'],
        ['variant', 'style', 'type', 'kind'],
        ['state', 'status', 'mode'],
        ['color', 'theme', 'palette'],
        ['icon', 'symbol', 'graphic']
      ];

      for (const group of semanticMatches) {
        if (group.includes(recName) && group.some(term => existingName.includes(term))) {
          return true;
        }
      }

      return false;
    });
    return !similarExists;
  });

  // Debug logging
  if (recommendations.length > filteredRecommendations.length) {
    const filtered = recommendations.filter(rec => !filteredRecommendations.includes(rec));
    console.log('🔍 [RECOMMENDATIONS] Filtered out duplicates:', filtered.map(r => r.name));
  }

  console.log(`🔍 [RECOMMENDATIONS] Generated ${filteredRecommendations.length} recommendations for ${componentName}`);
  console.log('🔍 [RECOMMENDATIONS] Existing properties:', existingProperties.map(p => p.name));
  console.log('🔍 [RECOMMENDATIONS] Final recommendations:', filteredRecommendations.map(r => r.name));

  return filteredRecommendations;
}
