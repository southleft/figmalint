/// <reference types="@figma/plugin-typings" />

import { DesignToken, TokenAnalysis, TokenCategory } from '../types';
import { rgbToHex, getVariableName } from '../utils/figma-helpers';

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

    // Check for Figma Variables with proper type checking
    if ('boundVariables' in currentNode && currentNode.boundVariables) {
      const boundVars = currentNode.boundVariables;

      // Color variables - check only valid properties
      if (boundVars.fills) {
        try {
          const variables = Array.isArray(boundVars.fills) ? boundVars.fills : [boundVars.fills];
          variables.forEach((v: any) => {
            if (v?.id && typeof v.id === 'string') {
              const varName = getVariableName(v.id);
              if (varName && !colorSet.has(varName)) {
                colorSet.add(varName);
                colors.push({
                  name: varName,
                  value: varName,
                  type: 'fills-variable',
                  isToken: true,
                  isActualToken: true,
                  source: 'figma-variable'
                });
              }
            }
          });
        } catch (error) {
          console.warn('Error processing fills variables:', error);
        }
      }

      // Check strokes if available
      if (boundVars.strokes) {
        try {
          const variables = Array.isArray(boundVars.strokes) ? boundVars.strokes : [boundVars.strokes];
          variables.forEach((v: any) => {
            if (v?.id && typeof v.id === 'string') {
              const varName = getVariableName(v.id);
              if (varName && !colorSet.has(varName)) {
                colorSet.add(varName);
                colors.push({
                  name: varName,
                  value: varName,
                  type: 'strokes-variable',
                  isToken: true,
                  isActualToken: true,
                  source: 'figma-variable'
                });
              }
            }
          });
        } catch (error) {
          console.warn('Error processing strokes variables:', error);
        }
      }

      // Spacing variables - check only valid properties
      const spacingProps = ['paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft', 'itemSpacing'] as const;
      spacingProps.forEach(prop => {
        const variable = (boundVars as any)[prop];
        if (variable && typeof variable === 'object' && 'id' in variable && typeof variable.id === 'string') {
          const varName = getVariableName(variable.id);
          if (varName && !spacingSet.has(varName)) {
            spacingSet.add(varName);
            spacing.push({
              name: varName,
              value: varName,
              type: `${prop}-variable`,
              isToken: true,
              isActualToken: true,
              source: 'figma-variable'
            });
          }
        }
      });
    }

    // Extract hard-coded values with proper type checking
    if ('fills' in currentNode && Array.isArray(currentNode.fills) && !currentNode.fillStyleId) {
      currentNode.fills.forEach((fill) => {
        if (fill.type === 'SOLID' && fill.visible !== false && fill.color) {
          const hex = rgbToHex(fill.color.r, fill.color.g, fill.color.b);
          if (!colorSet.has(hex)) {
            colorSet.add(hex);
            colors.push({
              name: `hard-coded-fill-${colors.length + 1}`,
              value: hex,
              type: 'fill',
              isToken: false,
              source: 'hard-coded'
            });
          }
        }
      });
    }

    // Extract stroke values (color and width)
    if ('strokes' in currentNode && Array.isArray(currentNode.strokes) && !currentNode.strokeStyleId) {
      currentNode.strokes.forEach((stroke) => {
        if (stroke.type === 'SOLID' && stroke.visible !== false && stroke.color) {
          const hex = rgbToHex(stroke.color.r, stroke.color.g, stroke.color.b);
          if (!colorSet.has(hex)) {
            colorSet.add(hex);
            colors.push({
              name: `hard-coded-stroke-${colors.length + 1}`,
              value: hex,
              type: 'stroke',
              isToken: false,
              source: 'hard-coded',
              context: {
                nodeType: currentNode.type,
                nodeName: currentNode.name
              }
            });
          }
        }
      });
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
              hasVisibleStroke: true
            }
          });
        }
      }
    }

    // Extract spacing values with proper type checking
    if ('paddingLeft' in currentNode && typeof currentNode.paddingLeft === 'number') {
      const frame = currentNode as FrameNode;
      const paddings = [
        { value: frame.paddingLeft, name: 'left' },
        { value: frame.paddingRight, name: 'right' },
        { value: frame.paddingTop, name: 'top' },
        { value: frame.paddingBottom, name: 'bottom' }
      ];

      paddings.forEach((padding) => {
        if (typeof padding.value === 'number' && padding.value > 1 && !spacingSet.has(padding.value.toString())) {
          spacingSet.add(padding.value.toString());
          spacing.push({
            name: `hard-coded-padding-${padding.name}-${padding.value}`,
            value: `${padding.value}px`,
            type: 'padding',
            isToken: false,
            source: 'hard-coded',
            context: {
              nodeType: currentNode.type,
              nodeName: currentNode.name,
              paddingType: `padding-${padding.name}`,
              layoutMode: 'layoutMode' in currentNode ? currentNode.layoutMode : 'NONE'
            }
          });
        }
      });
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
