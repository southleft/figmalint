/// <reference types="@figma/plugin-typings" />

import { DesignToken, TokenAnalysis, TokenCategory } from '../types';
import { rgbToHex, getVariableName, getVariableValue, getDebugContext } from '../utils/figma-helpers';

/**
 * Extract comprehensive design tokens from a Figma node
 */
export async function extractDesignTokensFromNode(node: SceneNode): Promise<TokenAnalysis> {
  const colors: DesignToken[] = [];
  const spacing: DesignToken[] = [];
  const typography: DesignToken[] = [];
  const effects: DesignToken[] = [];
  const borders: DesignToken[] = [];

  const colorSet = new Set<string>();
  const spacingSet = new Set<string>();
  const typographySet = new Set<string>();
  const effectSet = new Set<string>();
  const borderSet = new Set<string>();

  async function traverseNode(currentNode: SceneNode): Promise<void> {
    console.log('🔍 Analyzing node:', currentNode.name, 'Type:', currentNode.type);

    // Check for Figma Styles (Design Tokens)
    const stylePromises: Promise<void>[] = [];

    // Fill styles
    if ('fillStyleId' in currentNode && typeof currentNode.fillStyleId === 'string') {
      stylePromises.push(
        figma.getStyleByIdAsync(currentNode.fillStyleId)
          .then((style) => {
            if (style?.name && !colorSet.has(style.name)) {
              colorSet.add(style.name);
              let colorValue = style.name;

              // Safely extract color value
              if ('fills' in currentNode && Array.isArray(currentNode.fills) && currentNode.fills.length > 0) {
                const fill = currentNode.fills[0];
                if (fill.type === 'SOLID' && fill.color) {
                  colorValue = rgbToHex(fill.color.r, fill.color.g, fill.color.b);
                }
              }

              colors.push({
                name: style.name,
                value: colorValue,
                type: 'fill-style',
                isToken: true,
                isActualToken: true,
                source: 'figma-style'
              });
            }
          })
          .catch(console.warn)
      );
    }

    // Stroke styles
    if ('strokeStyleId' in currentNode && typeof currentNode.strokeStyleId === 'string') {
      stylePromises.push(
        figma.getStyleByIdAsync(currentNode.strokeStyleId)
          .then((style) => {
            if (style?.name && !colorSet.has(style.name)) {
              colorSet.add(style.name);
              colors.push({
                name: style.name,
                value: style.name,
                type: 'stroke-style',
                isToken: true,
                isActualToken: true,
                source: 'figma-style'
              });
            }
          })
          .catch(console.warn)
      );
    }

    // Text styles
    if (currentNode.type === 'TEXT' && 'textStyleId' in currentNode && typeof currentNode.textStyleId === 'string') {
      stylePromises.push(
        figma.getStyleByIdAsync(currentNode.textStyleId)
          .then((style) => {
            if (style?.name && !typographySet.has(style.name)) {
              typographySet.add(style.name);
              typography.push({
                name: style.name,
                value: style.name,
                type: 'text-style',
                isToken: true,
                isActualToken: true,
                source: 'figma-style'
              });
            }
          })
          .catch(console.warn)
      );
    }

    // Effect styles
    if ('effectStyleId' in currentNode && typeof currentNode.effectStyleId === 'string') {
      stylePromises.push(
        figma.getStyleByIdAsync(currentNode.effectStyleId)
          .then((style) => {
            if (style?.name && !effectSet.has(style.name)) {
              effectSet.add(style.name);
              effects.push({
                name: style.name,
                value: style.name,
                type: 'effect-style',
                isToken: true,
                isActualToken: true,
                source: 'figma-style'
              });
            }
          })
          .catch(console.warn)
      );
    }

    await Promise.all(stylePromises);

    // Check for Figma Variables with comprehensive property checking
    if ('boundVariables' in currentNode && currentNode.boundVariables) {
      const boundVars = currentNode.boundVariables;
      console.log(`🔍 [VARIABLES] Checking bound variables for ${currentNode.name}:`, Object.keys(boundVars));

      // Helper function to process variable arrays
      const processVariableArray = async (variables: any, propertyName: string, targetSet: Set<string>, targetArray: DesignToken[], tokenType: string) => {
        try {
          const varArray = Array.isArray(variables) ? variables : [variables];
          for (const v of varArray) {
            if (v?.id && typeof v.id === 'string') {
              const varName = await getVariableName(v.id);
              console.log(`   🎯 Found ${propertyName} variable:`, varName);
              if (varName && !targetSet.has(varName)) {
                targetSet.add(varName);

                // Get actual value for color-related variables
                let displayValue = varName;
                if (tokenType === 'color' && (propertyName === 'fills' || propertyName === 'strokes')) {
                  const actualValue = await getVariableValue(v.id, currentNode);
                  if (actualValue && actualValue.startsWith('#')) {
                    displayValue = actualValue;
                  }
                }

                targetArray.push({
                  name: varName,
                  value: displayValue,
                  type: `${propertyName}-variable`,
                  isToken: true,
                  isActualToken: true,
                  source: 'figma-variable'
                });
                console.log(`   ✅ Added ${tokenType} token: ${varName} (value: ${displayValue})`);
              }
            }
          }
        } catch (error) {
          console.warn(`Error processing ${propertyName} variables:`, error);
        }
      };

      // Helper function to process single variables
      const processSingleVariable = async (variable: any, propertyName: string, targetSet: Set<string>, targetArray: DesignToken[], tokenType: string) => {
        if (variable && typeof variable === 'object' && 'id' in variable && typeof variable.id === 'string') {
          const varName = await getVariableName(variable.id);
          console.log(`   🎯 Found ${propertyName} variable:`, varName);
          if (varName && !targetSet.has(varName)) {
            targetSet.add(varName);
            targetArray.push({
              name: varName,
              value: varName,
              type: `${propertyName}-variable`,
              isToken: true,
              isActualToken: true,
              source: 'figma-variable'
            });
            console.log(`   ✅ Added ${tokenType} token: ${varName}`);
          }
        }
      };

      // Process all variable types with proper async handling
      const variableProcessingPromises: Promise<void>[] = [];

      // Color-related variables
      if (boundVars.fills) {
        console.log('   🎨 Processing fills variables...');
        variableProcessingPromises.push(processVariableArray(boundVars.fills, 'fills', colorSet, colors, 'color'));
      }

      if (boundVars.strokes) {
        console.log('   🖊️ Processing strokes variables...');
        variableProcessingPromises.push(processVariableArray(boundVars.strokes, 'strokes', colorSet, colors, 'color'));
      }

      // Effects variables (shadows, blurs, etc.)
      if (boundVars.effects) {
        console.log('   ✨ Processing effects variables...');
        variableProcessingPromises.push(processVariableArray(boundVars.effects, 'effects', effectSet, effects, 'effect'));
      }

      // Border-related variables
      if (boundVars.strokeWeight) {
        console.log('   📏 Processing strokeWeight variable...');
        variableProcessingPromises.push(processSingleVariable(boundVars.strokeWeight, 'strokeWeight', borderSet, borders, 'border'));
      }

      // Border radius variables
      const radiusProps = ['topLeftRadius', 'topRightRadius', 'bottomLeftRadius', 'bottomRightRadius'] as const;
      radiusProps.forEach(prop => {
        if ((boundVars as any)[prop]) {
          console.log(`   🔄 Processing ${prop} variable...`);
          variableProcessingPromises.push(processSingleVariable((boundVars as any)[prop], prop, borderSet, borders, 'border'));
        }
      });

      // Spacing variables
      const spacingProps = ['paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft', 'itemSpacing', 'counterAxisSpacing'] as const;
      spacingProps.forEach(prop => {
        if ((boundVars as any)[prop]) {
          console.log(`   📐 Processing ${prop} variable...`);
          variableProcessingPromises.push(processSingleVariable((boundVars as any)[prop], prop, spacingSet, spacing, 'spacing'));
        }
      });

      // Size variables
      const sizeProps = ['width', 'height', 'minWidth', 'maxWidth', 'minHeight', 'maxHeight'] as const;
      sizeProps.forEach(prop => {
        if ((boundVars as any)[prop]) {
          console.log(`   📦 Processing ${prop} variable...`);
          variableProcessingPromises.push(processSingleVariable((boundVars as any)[prop], prop, spacingSet, spacing, 'size'));
        }
      });

      // Opacity variables (treating as effects for now)
      if (boundVars.opacity) {
        console.log('   👻 Processing opacity variable...');
        variableProcessingPromises.push(processSingleVariable(boundVars.opacity, 'opacity', effectSet, effects, 'effect'));
      }

      // Typography variables (for text nodes)
      if (currentNode.type === 'TEXT') {
        const typographyProps = ['fontSize', 'lineHeight', 'letterSpacing', 'paragraphSpacing'] as const;
        typographyProps.forEach(prop => {
          if ((boundVars as any)[prop]) {
            console.log(`   📝 Processing ${prop} variable...`);
            variableProcessingPromises.push(processSingleVariable((boundVars as any)[prop], prop, typographySet, typography, 'typography'));
          }
        });
      }

      // Wait for all variable processing to complete
      await Promise.all(variableProcessingPromises);

      console.log(`🔍 [VARIABLES] Total variables found for ${currentNode.name}: ${Object.keys(boundVars).length}`);
    }

    // Extract hard-coded values ONLY if no bound variables and no styles
    const hasFillVariables = 'boundVariables' in currentNode &&
                            currentNode.boundVariables &&
                            currentNode.boundVariables.fills;
    const hasFillStyle = 'fillStyleId' in currentNode && currentNode.fillStyleId;

    if ('fills' in currentNode && Array.isArray(currentNode.fills) && !hasFillStyle && !hasFillVariables) {
      console.log(`🔍 [HARD-CODED] Checking fills for ${currentNode.name} (no variables, no style)`);
      currentNode.fills.forEach((fill) => {
        if (fill.type === 'SOLID' && fill.visible !== false && fill.color) {
          const hex = rgbToHex(fill.color.r, fill.color.g, fill.color.b);
          if (!colorSet.has(hex)) {
            console.log(`   ⚠️ Found hard-coded fill: ${hex}`);
            colorSet.add(hex);

            const debugContext = getDebugContext(currentNode);
            colors.push({
              name: `hard-coded-fill-${colors.length + 1}`,
              value: hex,
              type: 'fill',
              isToken: false,
              source: 'hard-coded',
              context: {
                nodeType: currentNode.type,
                nodeName: currentNode.name,
                nodeId: currentNode.id,
                path: debugContext.path,
                description: debugContext.description,
                property: 'fills'
              }
            });
          }
        }
      });
    } else if (hasFillVariables) {
      console.log(`🔍 [VARIABLES] ${currentNode.name} has fill variables - skipping hard-coded detection`);
    } else if (hasFillStyle) {
      console.log(`🔍 [STYLES] ${currentNode.name} has fill style - skipping hard-coded detection`);
    }

    // Extract stroke values ONLY if no bound variables and no styles
    const hasStrokeVariables = 'boundVariables' in currentNode &&
                              currentNode.boundVariables &&
                              currentNode.boundVariables.strokes;
    const hasStrokeStyle = 'strokeStyleId' in currentNode && currentNode.strokeStyleId;

    if ('strokes' in currentNode && Array.isArray(currentNode.strokes) && !hasStrokeStyle && !hasStrokeVariables) {
      console.log(`🔍 [HARD-CODED] Checking strokes for ${currentNode.name} (no variables, no style)`);
      currentNode.strokes.forEach((stroke) => {
        if (stroke.type === 'SOLID' && stroke.visible !== false && stroke.color) {
          const hex = rgbToHex(stroke.color.r, stroke.color.g, stroke.color.b);
          if (!colorSet.has(hex)) {
            console.log(`   ⚠️ Found hard-coded stroke: ${hex}`);
            colorSet.add(hex);

                          const debugContext = getDebugContext(currentNode);
              colors.push({
                name: `hard-coded-stroke-${colors.length + 1}`,
                value: hex,
                type: 'stroke',
                isToken: false,
                source: 'hard-coded',
                context: {
                  nodeType: currentNode.type,
                  nodeName: currentNode.name,
                  nodeId: currentNode.id,
                  path: debugContext.path,
                  description: debugContext.description,
                  property: 'strokes'
                }
              });
          }
        }
      });
    } else if (hasStrokeVariables) {
      console.log(`🔍 [VARIABLES] ${currentNode.name} has stroke variables - skipping hard-coded detection`);
    } else if (hasStrokeStyle) {
      console.log(`🔍 [STYLES] ${currentNode.name} has stroke style - skipping hard-coded detection`);
    }

    // Extract stroke weight only if there are visible strokes
    if ('strokeWeight' in currentNode && typeof currentNode.strokeWeight === 'number') {
      console.log(`🔍 Node ${currentNode.name} has strokeWeight: ${currentNode.strokeWeight}`);

      const hasStrokes = 'strokes' in currentNode && Array.isArray(currentNode.strokes) && currentNode.strokes.length > 0;
      const hasVisibleStrokes = hasStrokes && currentNode.strokes.some(stroke => stroke.visible !== false);

      console.log(`   Has strokes: ${hasStrokes}, Has visible strokes: ${hasVisibleStrokes}`);

      if (currentNode.strokeWeight > 0 && hasVisibleStrokes) {
        const strokeWeightValue = `${currentNode.strokeWeight}px`;
        // Get the color of the first visible stroke
        let strokeColor = undefined;
        const firstVisibleStroke = currentNode.strokes.find(stroke => stroke.visible !== false && stroke.type === 'SOLID');
        if (firstVisibleStroke && firstVisibleStroke.type === 'SOLID' && firstVisibleStroke.color) {
          strokeColor = rgbToHex(firstVisibleStroke.color.r, firstVisibleStroke.color.g, firstVisibleStroke.color.b);
        }

        if (!borderSet.has(strokeWeightValue)) {
          console.log(`   ✅ Adding stroke weight: ${strokeWeightValue}`);
          borderSet.add(strokeWeightValue);

          const debugContext = getDebugContext(currentNode);
          borders.push({
            name: `hard-coded-stroke-weight-${currentNode.strokeWeight}`,
            value: strokeWeightValue,
            type: 'stroke-weight',
            isToken: false,
            source: 'hard-coded',
            strokeColor: strokeColor,
            context: {
              nodeType: currentNode.type,
              nodeName: currentNode.name,
              nodeId: currentNode.id,
              hasVisibleStroke: true,
              path: debugContext.path,
              description: debugContext.description,
              property: 'strokeWeight'
            }
          });
        }
      }
    }

    // Extract hard-coded border radius ONLY if no bound variables
    const hasRadiusVariables = 'boundVariables' in currentNode &&
                              currentNode.boundVariables &&
                              (['topLeftRadius', 'topRightRadius', 'bottomLeftRadius', 'bottomRightRadius', 'cornerRadius'].some(prop =>
                                (currentNode.boundVariables as any)[prop]));

    if ('cornerRadius' in currentNode && typeof currentNode.cornerRadius === 'number' && !hasRadiusVariables) {
      console.log(`🔍 [HARD-CODED] Checking corner radius for ${currentNode.name} (no variables)`);
      const radius = currentNode.cornerRadius;
      if (radius > 0) {
        const radiusValue = `${radius}px`;
        if (!borderSet.has(radiusValue)) {
          console.log(`   ⚠️ Found hard-coded corner radius: ${radiusValue}`);
          borderSet.add(radiusValue);

          const debugContext = getDebugContext(currentNode);
          borders.push({
            name: `hard-coded-corner-radius-${radius}`,
            value: radiusValue,
            type: 'corner-radius',
            isToken: false,
            source: 'hard-coded',
            context: {
              nodeType: currentNode.type,
              nodeName: currentNode.name,
              nodeId: currentNode.id,
              path: debugContext.path,
              description: debugContext.description,
              property: 'cornerRadius'
            }
          });
        }
      }
    } else if (hasRadiusVariables) {
      console.log(`🔍 [VARIABLES] ${currentNode.name} has radius variables - skipping hard-coded detection`);
    }

    // Also check for individual corner radius properties if they exist
    if (!hasRadiusVariables && 'topLeftRadius' in currentNode) {
      console.log(`🔍 [HARD-CODED] Checking individual corner radius for ${currentNode.name} (no variables)`);
      const radiusProps = [
        { prop: 'topLeftRadius', name: 'top-left' },
        { prop: 'topRightRadius', name: 'top-right' },
        { prop: 'bottomLeftRadius', name: 'bottom-left' },
        { prop: 'bottomRightRadius', name: 'bottom-right' }
      ];

      radiusProps.forEach(({ prop, name }) => {
        if (prop in currentNode && typeof (currentNode as any)[prop] === 'number') {
          const radius = (currentNode as any)[prop];
          if (radius > 0) {
            const radiusValue = `${radius}px`;
            if (!borderSet.has(radiusValue)) {
              console.log(`   ⚠️ Found hard-coded ${name} radius: ${radiusValue}`);
              borderSet.add(radiusValue);

              const debugContext = getDebugContext(currentNode);
              borders.push({
                name: `hard-coded-${name}-radius-${radius}`,
                value: radiusValue,
                type: `${name}-radius`,
                isToken: false,
                source: 'hard-coded',
                context: {
                  nodeType: currentNode.type,
                  nodeName: currentNode.name,
                  nodeId: currentNode.id,
                  path: debugContext.path,
                  description: debugContext.description,
                  property: prop
                }
              });
            }
          }
        }
      });
    }

    // Extract spacing values ONLY if no bound variables
    const hasPaddingVariables = 'boundVariables' in currentNode &&
                               currentNode.boundVariables &&
                               (['paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft'].some(prop =>
                                 (currentNode.boundVariables as any)[prop]));

    if ('paddingLeft' in currentNode && typeof currentNode.paddingLeft === 'number' && !hasPaddingVariables) {
      console.log(`🔍 [HARD-CODED] Checking padding for ${currentNode.name} (no variables)`);
      const frame = currentNode as FrameNode;
      const paddings = [
        { value: frame.paddingLeft, name: 'left' },
        { value: frame.paddingRight, name: 'right' },
        { value: frame.paddingTop, name: 'top' },
        { value: frame.paddingBottom, name: 'bottom' }
      ];

      paddings.forEach((padding) => {
        if (typeof padding.value === 'number' && padding.value > 1 && !spacingSet.has(padding.value.toString())) {
          console.log(`   ⚠️ Found hard-coded padding-${padding.name}: ${padding.value}px`);
          spacingSet.add(padding.value.toString());

          const debugContext = getDebugContext(currentNode);
          spacing.push({
            name: `hard-coded-padding-${padding.name}-${padding.value}`,
            value: `${padding.value}px`,
            type: 'padding',
            isToken: false,
            source: 'hard-coded',
            context: {
              nodeType: currentNode.type,
              nodeName: currentNode.name,
              nodeId: currentNode.id,
              path: debugContext.path,
              description: debugContext.description,
              property: `padding${padding.name.charAt(0).toUpperCase() + padding.name.slice(1)}`
            }
          });
        }
      });
    } else if (hasPaddingVariables) {
      console.log(`🔍 [VARIABLES] ${currentNode.name} has padding variables - skipping hard-coded detection`);
    }

    // Traverse children
    if ('children' in currentNode) {
      for (const child of currentNode.children) {
        await traverseNode(child);
      }
    }
  }

  await traverseNode(node);
  return analyzeTokensConsistently({ colors, spacing, typography, effects, borders });
}

/**
 * Analyze tokens consistently for proper categorization
 */
export function analyzeTokensConsistently(extractedTokens: {
  colors: DesignToken[];
  spacing: DesignToken[];
  typography: DesignToken[];
  effects: DesignToken[];
  borders: DesignToken[];
}): TokenAnalysis {
  const categories: TokenCategory[] = ['colors', 'spacing', 'typography', 'effects', 'borders'];
  const summary = {
    totalTokens: 0,
    actualTokens: 0,
    hardCodedValues: 0,
    aiSuggestions: 0,
    byCategory: {} as Record<string, any>
  };

  categories.forEach(category => {
    const tokens = extractedTokens[category].map(token => ({
      ...token,
      isActualToken: token.source === 'figma-style' || token.source === 'figma-variable',
      recommendation: getDefaultRecommendation(token, category),
      suggestion: getDefaultSuggestion(token, category)
    }));

    const actualTokens = tokens.filter(t => t.isActualToken).length;
    const hardCoded = tokens.filter(t => t.source === 'hard-coded').length;

    summary.byCategory[category] = {
      total: tokens.length,
      tokens: actualTokens,
      hardCoded,
      suggestions: 0
    };

    summary.totalTokens += tokens.length;
    summary.actualTokens += actualTokens;
    summary.hardCodedValues += hardCoded;

    extractedTokens[category] = tokens;
  });

  return {
    ...extractedTokens,
    summary
  };
}

function getDefaultRecommendation(token: DesignToken, category: TokenCategory): string {
  if (token.isToken) return `Using ${token.name} token`;

  switch (category) {
    case 'colors': return `Consider using a color token instead of ${token.value}`;
    case 'spacing': return `Consider using spacing token instead of ${token.value}`;
    case 'typography': return 'Consider using typography token';
    case 'effects': return 'Consider using effect token';
    case 'borders': return 'Consider using border radius token';
    default: return 'Consider using a design token';
  }
}

function getDefaultSuggestion(token: DesignToken, category: TokenCategory): string {
  switch (category) {
    case 'colors':
      if (token.value?.startsWith('#000')) return 'Use semantic color token (e.g., text.primary)';
      if (token.value?.startsWith('#FFF')) return 'Use semantic color token (e.g., background.primary)';
      return 'Create or use existing color token';
    case 'spacing':
      const value = parseInt(token.value || '0');
      if (value % 8 === 0) return 'Create or use existing spacing token (follows 8px grid)';
      if (value % 4 === 0) return 'Create or use existing spacing token (follows 4px grid)';
      return 'Create or use existing spacing token';
    case 'typography': return 'Use semantic typography token (e.g., heading.large, body.regular)';
    case 'effects': return 'Use semantic shadow token (e.g., shadow.small, shadow.medium)';
    case 'borders': return 'Use appropriate radius token (e.g., radius.small, radius.medium)';
    default: return 'Create or use existing design token';
  }
}
