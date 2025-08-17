/// <reference types="@figma/plugin-typings" />

import { ComponentContext, ComponentMetadata, EnhancedAnalysisResult, DesignToken } from '../types';
import { ComponentAnalysisCache, DesignSystemsKnowledge, ConsistencyConfig } from './types/consistency';

/**
 * Component Consistency Engine
 * Ensures deterministic analysis results by integrating with design systems knowledge
 * and caching identical component analyses.
 */
export class ComponentConsistencyEngine {
  private cache: Map<string, ComponentAnalysisCache> = new Map();
  private designSystemsKnowledge: DesignSystemsKnowledge | null = null;
  private config: ConsistencyConfig;

  constructor(config: ConsistencyConfig = {}) {
    this.config = {
      enableCaching: true,
      enableMCPIntegration: true,
      mcpServerUrl: 'https://design-systems-mcp.southleft-llc.workers.dev/mcp',
      consistencyThreshold: 0.95,
      ...config
    };
  }

  /**
   * Generate a deterministic hash for a component based on its structure
   */
  generateComponentHash(context: ComponentContext, tokens: any[]): string {
    const hashInput = {
      name: context.name,
      type: context.type,
      hierarchy: this.normalizeHierarchy(context.hierarchy),
      frameStructure: context.frameStructure,
      detectedStyles: context.detectedStyles,
      tokenFingerprint: this.generateTokenFingerprint(tokens),
      // Don't include dynamic context that could vary
      staticProperties: {
        hasInteractiveElements: context.additionalContext?.hasInteractiveElements || false,
        componentFamily: context.additionalContext?.componentFamily || 'generic'
      }
    };

    return this.createHash(JSON.stringify(hashInput));
  }

  /**
   * Get cached analysis if available and valid
   */
  getCachedAnalysis(hash: string): ComponentAnalysisCache | null {
    if (!this.config.enableCaching) return null;

    const cached = this.cache.get(hash);
    if (!cached) return null;

    // Check if cache is still valid (24 hours)
    const isExpired = Date.now() - cached.timestamp > 24 * 60 * 60 * 1000;
    if (isExpired) {
      this.cache.delete(hash);
      return null;
    }

    console.log('✅ Using cached analysis for component hash:', hash);
    return cached;
  }

  /**
   * Cache analysis result
   */
  cacheAnalysis(hash: string, result: EnhancedAnalysisResult): void {
    if (!this.config.enableCaching) return;

    this.cache.set(hash, {
      hash,
      result,
      timestamp: Date.now(),
      mcpKnowledgeVersion: this.designSystemsKnowledge?.version || '1.0.0'
    });

    console.log('💾 Cached analysis for component hash:', hash);
  }

    /**
   * Load design systems knowledge from MCP server
   */
  async loadDesignSystemsKnowledge(): Promise<void> {
    if (!this.config.enableMCPIntegration) {
      console.log('📚 MCP integration disabled, using fallback knowledge');
      this.loadFallbackKnowledge();
      return;
    }

    try {
      console.log('🔄 Loading design systems knowledge from MCP...');

      // Test MCP server connectivity first
      const connectivityTest = await this.testMCPConnectivity();
      if (!connectivityTest) {
        console.warn('⚠️ MCP server not accessible, using fallback knowledge');
        this.loadFallbackKnowledge();
        return;
      }

      // Fetch knowledge in parallel for better performance
      const [componentKnowledge, tokenKnowledge, accessibilityKnowledge, scoringKnowledge] = await Promise.allSettled([
        this.queryMCP('component analysis best practices'),
        this.queryMCP('design token naming conventions and patterns'),
        this.queryMCP('design system accessibility requirements'),
        this.queryMCP('design system component scoring methodology')
      ]);

      this.designSystemsKnowledge = {
        version: '1.0.0',
        components: this.processComponentKnowledge(
          componentKnowledge.status === 'fulfilled' ? componentKnowledge.value : null
        ),
        tokens: this.processKnowledgeContent(
          tokenKnowledge.status === 'fulfilled' ? tokenKnowledge.value : null
        ),
        accessibility: this.processKnowledgeContent(
          accessibilityKnowledge.status === 'fulfilled' ? accessibilityKnowledge.value : null
        ),
        scoring: this.processKnowledgeContent(
          scoringKnowledge.status === 'fulfilled' ? scoringKnowledge.value : null
        ),
        lastUpdated: Date.now()
      };

      // Check if we got any successful results
      const successfulQueries = [componentKnowledge, tokenKnowledge, accessibilityKnowledge, scoringKnowledge]
        .filter(result => result.status === 'fulfilled').length;

      if (successfulQueries > 0) {
        console.log(`✅ Design systems knowledge loaded successfully (${successfulQueries}/4 queries successful)`);
      } else {
        console.warn('⚠️ All MCP queries failed, using fallback knowledge');
        this.loadFallbackKnowledge();
      }
    } catch (error) {
      console.warn('⚠️ Failed to load design systems knowledge:', error);
      // Fallback to built-in knowledge
      this.loadFallbackKnowledge();
    }
  }

    /**
   * Test MCP server connectivity using MCP initialization instead of health endpoint
   */
  private async testMCPConnectivity(): Promise<boolean> {
    try {
      console.log('🔗 Testing MCP server connectivity...');

      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Connectivity test timeout')), 5000)
      );

      // Use MCP initialization call instead of health endpoint to avoid CORS preflight
      const initPayload = {
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: "2024-11-05",
          capabilities: { roots: { listChanged: true } },
          clientInfo: { name: "figmalint", version: "2.0.0" }
        }
      };

      if (!this.config.mcpServerUrl) {
        throw new Error('MCP server URL not configured');
      }

      const fetchPromise = fetch(this.config.mcpServerUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(initPayload)
      });

      const response = await Promise.race([fetchPromise, timeoutPromise]) as Response;

      if (response.ok) {
        const data = await response.json();
        if (data.result?.serverInfo?.name) {
          console.log(`✅ MCP server accessible: ${data.result.serverInfo.name}`);
          return true;
        }
      }

      console.warn(`⚠️ MCP server returned ${response.status}`);
      return false;
    } catch (error) {
      console.warn('⚠️ MCP server connectivity test failed:', error);
      return false;
    }
  }

  /**
   * Query the design systems MCP server using proper JSON-RPC protocol
   */
  private async queryMCP(query: string): Promise<any> {
    try {
      console.log(`🔍 Querying MCP for: "${query}"`);

      // Create a timeout promise that rejects after 5 seconds
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('MCP query timeout')), 5000)
      );

      if (!this.config.mcpServerUrl) {
        throw new Error('MCP server URL not configured');
      }

      // Use proper MCP JSON-RPC protocol for search
      const searchPayload = {
        jsonrpc: "2.0",
        id: Math.floor(Math.random() * 1000) + 2, // Random ID > 1 (1 is used for init)
        method: "tools/call",
        params: {
          name: "search_design_knowledge",
          arguments: {
            query,
            limit: 5,
            category: 'components'
          }
        }
      };

      const fetchPromise = fetch(this.config.mcpServerUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(searchPayload)
      });

      // Race between fetch and timeout
      const response = await Promise.race([fetchPromise, timeoutPromise]) as Response;

      if (!response.ok) {
        throw new Error(`MCP query failed: ${response.status} ${response.statusText}`);
      }

      const result = await response.json();
      console.log(`✅ MCP query successful for: "${query}"`);

      // Extract content from MCP response format
      if (result.result && result.result.content) {
        return {
          results: result.result.content.map((item: any) => ({
            title: item.title || 'Design System Knowledge',
            content: item.content || item.description || 'Knowledge content',
            category: 'design-systems'
          }))
        };
      }

      return { results: [] };
    } catch (error) {
      console.warn(`⚠️ MCP query failed for "${query}":`, error);
      return this.getFallbackKnowledgeForQuery(query);
    }
  }

  /**
   * Create deterministic analysis prompt with MCP knowledge
   */
  createDeterministicPrompt(context: ComponentContext): string {
    const basePrompt = this.createBasePrompt(context);
    const mcpGuidance = this.getMCPGuidance(context);
    const scoringCriteria = this.getScoringCriteria(context);

    return `${basePrompt}

**CONSISTENCY REQUIREMENTS:**
- Use DETERMINISTIC analysis based on the exact component structure provided
- Apply CONSISTENT scoring criteria for identical components
- Follow established design system patterns and conventions
- Provide REPRODUCIBLE results for the same input

**DESIGN SYSTEMS GUIDANCE:**
${mcpGuidance}

**SCORING METHODOLOGY:**
${scoringCriteria}

**DETERMINISTIC SETTINGS:**
- Analysis must be based solely on the provided component structure
- Scores must be calculated using objective criteria
- Recommendations must follow established design system patterns
- Response format must be exactly as specified (JSON only)

**RESPONSE FORMAT (JSON only - no explanatory text):**
{
  "component": "Component name and purpose",
  "description": "Detailed component description based on structure analysis",
  "score": {
    "overall": 85,
    "breakdown": {
      "structure": 90,
      "tokens": 80,
      "accessibility": 85,
      "consistency": 90
    }
  },
  "props": [...],
  "states": [...],
  "slots": [...],
  "variants": {...},
  "usage": "Usage guidelines",
  "accessibility": {...},
  "tokens": {...},
  "audit": {...},
  "mcpReadiness": {...}
}`;
  }

  /**
   * Validate analysis result for consistency
   */
  validateAnalysisConsistency(result: EnhancedAnalysisResult, context: ComponentContext): boolean {
    const issues: string[] = [];

    // Check required fields
    if (!result.metadata?.component) issues.push('Missing component name');
    if (!result.metadata?.description) issues.push('Missing component description');

    // Validate score format
    if (!this.isValidScore(result.metadata?.mcpReadiness?.score)) {
      issues.push('Invalid or missing MCP readiness score');
    }

    // Check component family consistency
    const family = context.additionalContext?.componentFamily;
    if (family && !this.validateComponentFamilyConsistency(result, family)) {
      issues.push(`Inconsistent analysis for ${family} component family`);
    }

    // Validate token recommendations
    if (!this.validateTokenRecommendations(result.tokens)) {
      issues.push('Inconsistent token recommendations');
    }

    if (issues.length > 0) {
      console.warn('⚠️ Analysis consistency issues found:', issues);
      return false;
    }

    return true;
  }

  /**
   * Apply consistency corrections to analysis result
   */
  applyConsistencyCorrections(result: EnhancedAnalysisResult, context: ComponentContext): EnhancedAnalysisResult {
    const corrected = { ...result };

    // Apply component family-specific corrections
    if (context.additionalContext?.componentFamily) {
      corrected.metadata = this.applyComponentFamilyCorrections(
        corrected.metadata,
        context.additionalContext.componentFamily
      );
    }

    // Apply token consistency corrections
    corrected.tokens = this.applyTokenConsistencyCorrections(corrected.tokens);

    // Ensure scoring consistency
    corrected.metadata.mcpReadiness = this.ensureConsistentScoring(
      corrected.metadata.mcpReadiness || {},
      context
    );

    return corrected;
  }

  // Private helper methods

  private normalizeHierarchy(hierarchy: any[]): any[] {
    return hierarchy.map(item => ({
      name: item.name.toLowerCase().trim(),
      type: item.type,
      depth: item.depth
    }));
  }

  private generateTokenFingerprint(tokens: any[]): string {
    const fingerprint = tokens
      .map(token => `${token.type}:${token.isToken}:${token.source}`)
      .sort()
      .join('|');
    return this.createHash(fingerprint);
  }

  private createHash(input: string): string {
    let hash = 0;
    if (input.length === 0) return hash.toString();
    for (let i = 0; i < input.length; i++) {
      const char = input.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash).toString(36);
  }

  private createBasePrompt(context: ComponentContext): string {
    return `You are an expert design system architect analyzing a Figma component for comprehensive metadata and design token recommendations.

**Component Analysis Context:**
- Component Name: ${context.name}
- Component Type: ${context.type}
- Layer Structure: ${JSON.stringify(context.hierarchy, null, 2)}
- Frame Structure: ${JSON.stringify(context.frameStructure)}
- Detected Styles: ${JSON.stringify(context.detectedStyles)}
- Component Family: ${context.additionalContext?.componentFamily || 'generic'}
- Interactive Elements: ${context.additionalContext?.hasInteractiveElements || false}
- Design Patterns: ${context.additionalContext?.designPatterns?.join(', ') || 'none'}`;
  }

  private getMCPGuidance(context: ComponentContext): string {
    if (!this.designSystemsKnowledge) {
      return this.getFallbackGuidance(context);
    }

    const family = context.additionalContext?.componentFamily || 'generic';
    const guidance = this.designSystemsKnowledge.components[family] || this.designSystemsKnowledge.components.generic;

    return guidance || this.getFallbackGuidance(context);
  }

  private getScoringCriteria(context: ComponentContext): string {
    if (!this.designSystemsKnowledge?.scoring) {
      return this.getFallbackScoringCriteria();
    }

    return this.designSystemsKnowledge.scoring;
  }

  private processComponentKnowledge(knowledge: any): Record<string, string> {
    if (!knowledge || !knowledge.results || !Array.isArray(knowledge.results)) {
      console.log('📝 No component knowledge available, using defaults');
      return this.getDefaultComponentKnowledge();
    }

    const processed: Record<string, string> = {};
    knowledge.results.forEach((result: any) => {
      if (result.title && result.content) {
        // Extract component type from title
        const componentType = this.extractComponentType(result.title);
        processed[componentType] = result.content;
      }
    });

    // Ensure we have at least basic knowledge for common component types
    const defaults = this.getDefaultComponentKnowledge();
    return { ...defaults, ...processed };
  }

  private extractComponentType(title: string): string {
    const titleLower = title.toLowerCase();
    if (titleLower.includes('button')) return 'button';
    if (titleLower.includes('avatar')) return 'avatar';
    if (titleLower.includes('input') || titleLower.includes('field')) return 'input';
    if (titleLower.includes('card')) return 'card';
    if (titleLower.includes('badge') || titleLower.includes('tag')) return 'badge';
    return 'generic';
  }

  private processKnowledgeContent(knowledge: any): string {
    if (!knowledge || !knowledge.results || !Array.isArray(knowledge.results)) {
      return '';
    }

    return knowledge.results
      .map((result: any) => result.content)
      .filter((content: any) => content) // Filter out empty content
      .join('\n\n');
  }

  private getDefaultComponentKnowledge(): Record<string, string> {
    return {
      button: 'Button components require comprehensive state management (default, hover, focus, active, disabled). Score based on state completeness (45%), semantic token usage (35%), and accessibility (20%).',
      avatar: 'Avatar components should support multiple sizes and states. Interactive avatars need hover/focus states. Score based on size variants (25%), state coverage (25%), image handling (25%), and fallback mechanisms (25%).',
      card: 'Card components need consistent spacing, proper content hierarchy, and optional interactive states. Score based on content structure (30%), spacing consistency (25%), optional interactivity (25%), and token usage (20%).',
      badge: 'Badge components are typically status indicators with semantic color usage. Score based on semantic color mapping (40%), size variants (30%), content clarity (20%), and accessibility (10%).',
      input: 'Form input components require comprehensive state management and accessibility. Score based on state completeness (35%), accessibility compliance (30%), validation feedback (20%), and token usage (15%).',
      icon: 'Icon components should be scalable and consistent. Score based on sizing flexibility (35%), accessibility (35%), and style consistency (30%).',
      generic: 'Generic components should follow basic design system principles. Score based on structure clarity (35%), token usage (35%), and accessibility basics (30%).'
    };
  }

  private getFallbackKnowledgeForQuery(query: string): any {
    // Return structured fallback knowledge based on query
    return {
      results: [
        {
          title: `Fallback guidance for ${query}`,
          content: this.getFallbackContentForQuery(query),
          category: 'fallback'
        }
      ]
    };
  }

  private getFallbackContentForQuery(query: string): string {
    if (query.includes('component analysis')) {
      return 'Components should follow consistent naming, use design tokens, implement proper states, and maintain accessibility standards.';
    }
    if (query.includes('token')) {
      return 'Design tokens should use semantic naming patterns like semantic-color-primary, spacing-md-16px, and text-size-lg-18px.';
    }
    if (query.includes('accessibility')) {
      return 'Ensure WCAG 2.1 AA compliance with proper ARIA labels, keyboard support, and color contrast.';
    }
    if (query.includes('scoring')) {
      return 'Score components based on structure (25%), token usage (25%), accessibility (25%), and consistency (25%).';
    }
    return 'Follow established design system best practices for consistency and scalability.';
  }

  private getFallbackGuidance(context: ComponentContext): string {
    const family = context.additionalContext?.componentFamily || 'generic';

    const guidanceMap: Record<string, string> = {
      button: 'Buttons require all interactive states (default, hover, focus, active, disabled). Score based on state completeness (45%), semantic token usage (35%), and accessibility (20%).',
      avatar: 'Avatars should support multiple sizes and states. Interactive avatars need hover/focus states. Score based on size variants (25%), state coverage (25%), image handling (25%), and fallback mechanisms (25%).',
      card: 'Cards need consistent spacing, proper content hierarchy, and optional interactive states. Score based on content structure (30%), spacing consistency (25%), optional interactivity (25%), and token usage (20%).',
      badge: 'Badges are typically status indicators with semantic color usage. Score based on semantic color mapping (40%), size variants (30%), content clarity (20%), and accessibility (10%).',
      input: 'Form inputs require comprehensive state management and accessibility. Score based on state completeness (35%), accessibility compliance (30%), validation feedback (20%), and token usage (15%).',
      generic: 'Generic components should follow basic design system principles. Score based on structure clarity (35%), token usage (35%), and accessibility basics (30%).'
    };

    return guidanceMap[family] || guidanceMap.generic;
  }

  private getFallbackScoringCriteria(): string {
    return `
    **MCP Readiness Scoring (0-100):**
    - **Structure (25%)**: Clear hierarchy, logical organization, proper nesting
    - **Tokens (25%)**: Design token usage vs hard-coded values
    - **Accessibility (25%)**: WCAG compliance, keyboard support, ARIA labels
    - **Consistency (25%)**: Naming conventions, pattern adherence, scalability

    **Score Calculation:**
    - 90-100: Production ready, comprehensive implementation
    - 80-89: Good implementation, minor improvements needed
    - 70-79: Solid foundation, some important gaps
    - 60-69: Basic implementation, significant improvements needed
    - Below 60: Major issues, substantial rework required
    `;
  }

  private loadFallbackKnowledge(): void {
    this.designSystemsKnowledge = {
      version: '1.0.0-fallback',
      components: {
        button: 'Button components require comprehensive state management',
        avatar: 'Avatar components should support size variants and interactive states',
        card: 'Card components need consistent spacing and content hierarchy',
        badge: 'Badge components should use semantic colors for status indication',
        input: 'Input components require comprehensive accessibility and validation',
        generic: 'Generic components should follow basic design system principles'
      },
      tokens: 'Use semantic token naming: semantic-color-primary, spacing-md-16px, text-size-lg-18px',
      accessibility: 'Ensure WCAG 2.1 AA compliance with proper ARIA labels and keyboard support',
      scoring: this.getFallbackScoringCriteria(),
      lastUpdated: Date.now()
    };
  }

  private isValidScore(score: any): boolean {
    return typeof score === 'number' && score >= 0 && score <= 100;
  }

  private validateComponentFamilyConsistency(result: EnhancedAnalysisResult, family: string): boolean {
    // Check if the analysis is appropriate for the component family
    const metadata = result.metadata;

    switch (family) {
      case 'button':
        return this.validateButtonComponent(metadata);
      case 'avatar':
        return this.validateAvatarComponent(metadata);
      case 'input':
        return this.validateInputComponent(metadata);
      default:
        return true; // No specific validation for generic components
    }
  }

  private validateButtonComponent(metadata: any): boolean {
    const hasInteractiveStates = metadata.states?.some((state: string) =>
      ['hover', 'focus', 'active', 'disabled'].includes(state.toLowerCase())
    );
    return hasInteractiveStates || false;
  }

  private validateAvatarComponent(metadata: any): boolean {
    // Avatars should have size variants or appropriate props
    const hasSizeVariants = metadata.variants?.size?.length > 0;
    const hasSizeProps = metadata.props?.some((prop: any) =>
      prop.name.toLowerCase().includes('size')
    );
    return hasSizeVariants || hasSizeProps || false;
  }

  private validateInputComponent(metadata: any): boolean {
    const hasFormStates = metadata.states?.some((state: string) =>
      ['focus', 'error', 'disabled', 'filled'].includes(state.toLowerCase())
    );
    return hasFormStates || false;
  }

  private validateTokenRecommendations(tokens: any): boolean {
    // Basic validation that tokens follow semantic naming
    const hasSemanticColors = tokens.colors?.some((token: DesignToken) =>
      token.name.includes('semantic-') || token.name.includes('primary') || token.name.includes('secondary')
    );
    return hasSemanticColors !== false; // Allow undefined/null
  }

  private applyComponentFamilyCorrections(metadata: any, family: string): any {
    const corrected = { ...metadata };

    switch (family) {
      case 'button':
        if (!corrected.states?.includes('hover')) {
          corrected.states = [...(corrected.states || []), 'hover', 'focus', 'active', 'disabled'];
        }
        break;
      case 'avatar':
        if (!corrected.variants?.size && !corrected.props?.some((p: any) => p.name.includes('size'))) {
          corrected.variants = { ...corrected.variants, size: ['small', 'medium', 'large'] };
        }
        break;
    }

    return corrected;
  }

  private applyTokenConsistencyCorrections(tokens: any): any {
    // Ensure consistent token naming patterns
    if (!tokens) return tokens;

    const corrected = { ...tokens };

    // Don't add hard-coded suggestions - let the AI generate contextual ones
    // The original hard-coded semantic-color-primary suggestion has been removed
    // to allow for more contextual and relevant AI suggestions

    return corrected;
  }

  private ensureConsistentScoring(mcpReadiness: any, context: ComponentContext): any {
    // Return the actual calculated score without arbitrary baselines
    return {
      ...mcpReadiness,
      score: mcpReadiness.score || 0
    };
  }
}

export default ComponentConsistencyEngine;
