// Design System Rules for Consistent Token Analysis
// This module provides a single source of truth for token analysis and counting

export interface DesignToken {
  name: string;
  value: string;
  type: 'color' | 'spacing' | 'typography' | 'effect' | 'border';
  category: 'fill' | 'stroke' | 'text' | 'padding' | 'gap' | 'radius' | 'shadow' | 'blur';
  isToken: boolean;
  isActualToken?: boolean; // True if using Figma styles/variables
  source: 'figma-style' | 'figma-variable' | 'hard-coded' | 'ai-suggestion';
  usage?: string;
  recommendation?: string;
  suggestion?: string;
  context?: {
    nodeType: string;
    nodeName: string;
    layoutMode?: string;
    isInteractive?: boolean;
  };
  property?: string;
}

export interface TokenAnalysisResult {
  colors: DesignToken[];
  spacing: DesignToken[];
  typography: DesignToken[];
  effects: DesignToken[];
  borders: DesignToken[];
  summary: {
    totalTokens: number;
    actualTokens: number;
    hardCodedValues: number;
    aiSuggestions: number;
    byCategory: {
      [key: string]: {
        total: number;
        tokens: number;
        hardCoded: number;
        suggestions: number;
      };
    };
  };
}

export class DesignSystemAnalyzer {
  // Analyze tokens and provide consistent counts
  static analyzeTokens(extractedTokens: any, aiAnalysis?: any): TokenAnalysisResult {
    const result: TokenAnalysisResult = {
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

    // Process extracted tokens from Figma
    if (extractedTokens) {
      // Colors
      if (extractedTokens.colors) {
        result.colors = this.processColorTokens(extractedTokens.colors);
      }

      // Spacing
      if (extractedTokens.spacing) {
        result.spacing = this.processSpacingTokens(extractedTokens.spacing);
      }

      // Typography
      if (extractedTokens.typography) {
        result.typography = this.processTypographyTokens(extractedTokens.typography);
      }

      // Effects (if available in extracted tokens)
      if (extractedTokens.effects) {
        result.effects = this.processEffectTokens(extractedTokens.effects);
      }

      // Borders (if available in extracted tokens)
      if (extractedTokens.borders) {
        result.borders = this.processBorderTokens(extractedTokens.borders);
      }
    }

    // Merge AI suggestions if provided
    if (aiAnalysis) {
      this.mergeAiSuggestions(result, aiAnalysis);
    }

    // Calculate summary
    this.calculateSummary(result);

    return result;
  }

  private static processColorTokens(colors: any[]): DesignToken[] {
    return colors.map(color => ({
      name: color.name,
      value: color.value,
      type: 'color' as const,
      category: (color.type === 'stroke' || color.type === 'stroke-style') ? 'stroke' : 'fill',
      isToken: color.isToken !== false,
      isActualToken: color.source === 'figma-style' || color.source === 'figma-variable',
      source: color.source || 'hard-coded',
      usage: color.usage,
      recommendation: color.recommendation || this.getColorRecommendation(color),
      suggestion: color.suggestion || this.getColorSuggestion(color),
      context: color.context
    }));
  }

  private static processSpacingTokens(spacing: any[]): DesignToken[] {
    return spacing.map(space => ({
      name: space.name,
      value: space.value,
      type: 'spacing' as const,
      category: space.type === 'padding' ? 'padding' : 'gap',
      isToken: space.isToken !== false,
      isActualToken: space.source === 'figma-style' || space.source === 'figma-variable',
      source: space.source || 'hard-coded',
      property: space.property,
      recommendation: space.recommendation || this.getSpacingRecommendation(space),
      suggestion: space.suggestion || this.getSpacingSuggestion(space),
      context: space.context
    }));
  }

  private static processTypographyTokens(typography: any[]): DesignToken[] {
    return typography.map(typo => ({
      name: typo.name,
      value: typo.value || `${typo.family} ${typo.weight} ${typo.size}`,
      type: 'typography' as const,
      category: 'text',
      isToken: typo.isToken !== false,
      isActualToken: typo.source === 'figma-style' || typo.source === 'figma-variable',
      source: typo.source || 'hard-coded',
      recommendation: typo.recommendation || this.getTypographyRecommendation(typo),
      suggestion: typo.suggestion || this.getTypographySuggestion(typo),
      context: typo.context
    }));
  }

  private static processEffectTokens(effects: any[]): DesignToken[] {
    return effects.map(effect => ({
      name: effect.name,
      value: effect.value,
      type: 'effect' as const,
      category: effect.type?.includes('shadow') ? 'shadow' : 'blur',
      isToken: effect.isToken !== false,
      isActualToken: effect.source === 'figma-style' || effect.source === 'figma-variable',
      source: effect.source || 'hard-coded',
      recommendation: effect.recommendation || this.getEffectRecommendation(effect),
      suggestion: effect.suggestion || this.getEffectSuggestion(effect),
      context: effect.context
    }));
  }

  private static processBorderTokens(borders: any[]): DesignToken[] {
    return borders.map(border => ({
      name: border.name,
      value: border.value,
      type: 'border' as const,
      category: 'radius',
      isToken: border.isToken !== false,
      isActualToken: border.source === 'figma-style' || border.source === 'figma-variable',
      source: border.source || 'hard-coded',
      recommendation: border.recommendation || this.getBorderRecommendation(border),
      suggestion: border.suggestion || this.getBorderSuggestion(border),
      context: border.context
    }));
  }

  private static mergeAiSuggestions(result: TokenAnalysisResult, aiAnalysis: any) {
    // Add AI suggested tokens that don't exist in extracted tokens
    if (aiAnalysis.suggestedTokens) {
      Object.entries(aiAnalysis.suggestedTokens).forEach(([category, tokens]) => {
        if (Array.isArray(tokens)) {
          tokens.forEach((token: any) => {
            const aiToken: DesignToken = {
              name: token.name,
              value: token.value,
              type: this.mapCategoryToType(category),
              category: category as any,
              isToken: false,
              isActualToken: false,
              source: 'ai-suggestion',
              usage: token.usage,
              recommendation: token.recommendation,
              suggestion: token.suggestion
            };

            // Add to appropriate array
            switch (aiToken.type) {
              case 'color':
                result.colors.push(aiToken);
                break;
              case 'spacing':
                result.spacing.push(aiToken);
                break;
              case 'typography':
                result.typography.push(aiToken);
                break;
              case 'effect':
                result.effects.push(aiToken);
                break;
              case 'border':
                result.borders.push(aiToken);
                break;
            }
          });
        }
      });
    }
  }

  private static calculateSummary(result: TokenAnalysisResult) {
    const allTokens = [
      ...result.colors,
      ...result.spacing,
      ...result.typography,
      ...result.effects,
      ...result.borders
    ];

    result.summary.totalTokens = allTokens.length;
    result.summary.actualTokens = allTokens.filter(t => t.isActualToken).length;
    result.summary.hardCodedValues = allTokens.filter(t => t.source === 'hard-coded').length;
    result.summary.aiSuggestions = allTokens.filter(t => t.source === 'ai-suggestion').length;

    // Calculate by category
    const categories = ['colors', 'spacing', 'typography', 'effects', 'borders'] as const;
    categories.forEach(category => {
      const tokens = result[category];
      result.summary.byCategory[category] = {
        total: tokens.length,
        tokens: tokens.filter(t => t.isActualToken).length,
        hardCoded: tokens.filter(t => t.source === 'hard-coded').length,
        suggestions: tokens.filter(t => t.source === 'ai-suggestion').length
      };
    });
  }

  // Helper methods for recommendations
  private static getColorRecommendation(color: any): string {
    if (color.isToken) {
      return `Using ${color.name} token`;
    }
    return `Consider using a color token instead of ${color.value}`;
  }

  private static getColorSuggestion(color: any): string {
    if (color.value?.startsWith('#000')) return 'Use semantic color token (e.g., text.primary)';
    if (color.value?.startsWith('#FFF')) return 'Use semantic color token (e.g., background.primary)';
    return 'Create or use existing color token';
  }

  private static getSpacingRecommendation(space: any): string {
    if (space.isToken) {
      return `Using ${space.name} spacing token`;
    }
    return `Consider using spacing token instead of ${space.value}`;
  }

  private static getSpacingSuggestion(space: any): string {
    const value = parseInt(space.value);
    if (value % 8 === 0) return `Use spacing.${value / 8} token (8px grid)`;
    if (value % 4 === 0) return `Use spacing.${value / 4} token (4px grid)`;
    return 'Create or use existing spacing token';
  }

  private static getTypographyRecommendation(typo: any): string {
    if (typo.isToken) {
      return `Using ${typo.name} typography token`;
    }
    return 'Consider using typography token';
  }

  private static getTypographySuggestion(typo: any): string {
    return 'Use semantic typography token (e.g., heading.large, body.regular)';
  }

  private static getEffectRecommendation(effect: any): string {
    if (effect.isToken) {
      return `Using ${effect.name} effect token`;
    }
    return 'Consider using effect token';
  }

  private static getEffectSuggestion(effect: any): string {
    return 'Use semantic shadow token (e.g., shadow.small, shadow.medium)';
  }

  private static getBorderRecommendation(border: any): string {
    if (border.isToken) {
      return `Using ${border.name} border token`;
    }
    return 'Consider using border radius token';
  }

  private static getBorderSuggestion(border: any): string {
    const value = parseInt(border.value);
    if (value === 0) return 'Use radius.none token';
    if (value <= 4) return 'Use radius.small token';
    if (value <= 8) return 'Use radius.medium token';
    return 'Use radius.large token';
  }

  private static mapCategoryToType(category: string): DesignToken['type'] {
    switch (category.toLowerCase()) {
      case 'colors':
      case 'color':
        return 'color';
      case 'spacing':
      case 'space':
        return 'spacing';
      case 'typography':
      case 'text':
        return 'typography';
      case 'effects':
      case 'effect':
        return 'effect';
      case 'borders':
      case 'border':
        return 'border';
      default:
        return 'color'; // default fallback
    }
  }
}