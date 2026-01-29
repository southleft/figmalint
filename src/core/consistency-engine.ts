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

  /**
   * Query MCP for component-specific best practices
   * Returns expected properties, states, and variants for a component type
   */
  async getComponentBestPractices(componentFamily: string): Promise<ComponentBestPractices> {
    try {
      console.log(`🔍 Querying MCP for ${componentFamily} best practices...`);

      // Query MCP for component-specific guidance
      const mcpResult = await this.queryMCP(
        `${componentFamily} component best practices properties states variants accessibility`
      );

      // Parse MCP results into structured recommendations
      if (mcpResult?.results?.length > 0) {
        const bestPractices = this.parseMCPBestPractices(componentFamily, mcpResult.results);
        console.log(`✅ Retrieved MCP best practices for ${componentFamily}:`, bestPractices);
        return bestPractices;
      }

      // Fallback to built-in best practices
      return this.getBuiltInBestPractices(componentFamily);

    } catch (error) {
      console.warn(`⚠️ Failed to get MCP best practices for ${componentFamily}:`, error);
      return this.getBuiltInBestPractices(componentFamily);
    }
  }

  /**
   * Parse MCP response into structured best practices
   * Extracts states, properties, and accessibility requirements from MCP content
   */
  private parseMCPBestPractices(family: string, mcpResults: any[]): ComponentBestPractices {
    // Get content from MCP results
    const content = mcpResults.map(r => r.content || '').join(' ').toLowerCase();
    const mcpKnowledge = mcpResults.map(r => r.content || r.description || '').slice(0, 3);

    // Check if we have built-in best practices for this family
    const builtIn = this.getBuiltInBestPracticesInternal(family);
    if (builtIn) {
      return {
        ...builtIn,
        mcpKnowledge
      };
    }

    // For unknown components, extract recommendations from MCP content
    const extractedStates = this.extractStatesFromContent(content, family);
    const extractedProperties = this.extractPropertiesFromContent(content, family);
    const extractedAccessibility = this.extractAccessibilityFromContent(content);

    return {
      family,
      expectedStates: extractedStates.length > 0 ? extractedStates : ['default'],
      expectedProperties: extractedProperties,
      accessibilityRequirements: extractedAccessibility,
      mcpKnowledge
    };
  }

  /**
   * Extract expected states from MCP content
   */
  private extractStatesFromContent(content: string, family: string): string[] {
    const states: string[] = [];

    // Common interactive states to look for
    const stateKeywords: Record<string, string[]> = {
      interactive: ['default', 'hover', 'focus', 'active', 'disabled'],
      form: ['default', 'hover', 'focus', 'filled', 'disabled', 'error', 'success', 'loading'],
      selection: ['default', 'selected', 'hover', 'focus', 'disabled'],
      toggle: ['off', 'on', 'disabled'],
      loading: ['default', 'loading', 'success', 'error'],
      expandable: ['collapsed', 'expanded', 'hover', 'focus', 'disabled']
    };

    // Detect component interaction pattern from content or family name
    let pattern = 'interactive'; // default pattern

    if (content.includes('form') || content.includes('input') || family.includes('field') || family.includes('input')) {
      pattern = 'form';
    } else if (content.includes('select') || content.includes('checkbox') || content.includes('radio') || family.includes('select')) {
      pattern = 'selection';
    } else if (content.includes('toggle') || content.includes('switch') || family.includes('toggle') || family.includes('switch')) {
      pattern = 'toggle';
    } else if (content.includes('accordion') || content.includes('collapse') || content.includes('expand') || family.includes('accordion') || family.includes('dropdown')) {
      pattern = 'expandable';
    } else if (content.includes('loading') || content.includes('async') || family.includes('loader') || family.includes('spinner')) {
      pattern = 'loading';
    }

    // Add states from the detected pattern
    states.push(...stateKeywords[pattern]);

    // Also scan content for explicitly mentioned states
    const explicitStatePatterns = [
      /\b(hover|hovered)\b/,
      /\b(focus|focused)\b/,
      /\b(active|pressed)\b/,
      /\b(disabled)\b/,
      /\b(loading)\b/,
      /\b(error)\b/,
      /\b(success)\b/,
      /\b(selected)\b/,
      /\b(expanded|open)\b/,
      /\b(collapsed|closed)\b/,
      /\b(checked)\b/,
      /\b(indeterminate)\b/
    ];

    for (const pattern of explicitStatePatterns) {
      const match = content.match(pattern);
      if (match) {
        const state = match[1].replace('ed', '').replace('hovered', 'hover').replace('focused', 'focus').replace('pressed', 'active');
        if (!states.includes(state)) {
          states.push(state);
        }
      }
    }

    return [...new Set(states)]; // Remove duplicates
  }

  /**
   * Extract expected properties from MCP content
   */
  private extractPropertiesFromContent(content: string, family: string): ExpectedProperty[] {
    const properties: ExpectedProperty[] = [];

    // Common property patterns to detect
    const propertyPatterns: Array<{
      keywords: string[];
      property: ExpectedProperty;
    }> = [
      {
        keywords: ['size', 'sizes', 'small', 'medium', 'large'],
        property: { name: 'size', type: 'variant', values: ['small', 'medium', 'large'] }
      },
      {
        keywords: ['variant', 'variants', 'style', 'appearance'],
        property: { name: 'variant', type: 'variant', values: ['primary', 'secondary', 'outline'] }
      },
      {
        keywords: ['disabled', 'disable', 'enabled'],
        property: { name: 'disabled', type: 'boolean', description: 'Disables the component' }
      },
      {
        keywords: ['loading', 'loader', 'spinner'],
        property: { name: 'loading', type: 'boolean', description: 'Shows loading state' }
      },
      {
        keywords: ['icon', 'icons', 'leading icon', 'trailing icon'],
        property: { name: 'icon', type: 'instance-swap', description: 'Icon slot' }
      },
      {
        keywords: ['label', 'labels', 'text'],
        property: { name: 'label', type: 'text', description: 'Label text' }
      },
      {
        keywords: ['placeholder'],
        property: { name: 'placeholder', type: 'text', description: 'Placeholder text' }
      },
      {
        keywords: ['color', 'colors', 'semantic color'],
        property: { name: 'color', type: 'variant', values: ['default', 'primary', 'success', 'warning', 'error'] }
      },
      {
        keywords: ['orientation', 'horizontal', 'vertical'],
        property: { name: 'orientation', type: 'variant', values: ['horizontal', 'vertical'] }
      }
    ];

    // Check for each property pattern in content
    for (const { keywords, property } of propertyPatterns) {
      const hasKeyword = keywords.some(kw => content.includes(kw));
      if (hasKeyword) {
        properties.push(property);
      }
    }

    // Add family-specific defaults if no properties detected
    if (properties.length === 0) {
      // Check family name for common patterns
      if (family.includes('modal') || family.includes('dialog')) {
        properties.push({ name: 'open', type: 'boolean', description: 'Controls dialog visibility' });
        properties.push({ name: 'size', type: 'variant', values: ['small', 'medium', 'large', 'fullscreen'] });
      } else if (family.includes('dropdown') || family.includes('menu')) {
        properties.push({ name: 'open', type: 'boolean', description: 'Controls menu visibility' });
        properties.push({ name: 'placement', type: 'variant', values: ['top', 'bottom', 'left', 'right'] });
      } else if (family.includes('tooltip') || family.includes('popover')) {
        properties.push({ name: 'placement', type: 'variant', values: ['top', 'bottom', 'left', 'right'] });
      } else if (family.includes('tab') || family.includes('tabs')) {
        properties.push({ name: 'selected', type: 'boolean', description: 'Whether tab is selected' });
        properties.push({ name: 'disabled', type: 'boolean', description: 'Disables the tab' });
      } else if (family.includes('table') || family.includes('data')) {
        properties.push({ name: 'sortable', type: 'boolean', description: 'Enables sorting' });
        properties.push({ name: 'selectable', type: 'boolean', description: 'Enables row selection' });
      } else if (family.includes('list') || family.includes('item')) {
        properties.push({ name: 'selected', type: 'boolean', description: 'Selection state' });
        properties.push({ name: 'disabled', type: 'boolean', description: 'Disables the item' });
      }
    }

    return properties;
  }

  /**
   * Extract accessibility requirements from MCP content
   */
  private extractAccessibilityFromContent(content: string): string[] {
    const requirements: string[] = [];

    // Common accessibility requirements to look for
    const a11yPatterns: Array<{ pattern: RegExp; requirement: string }> = [
      { pattern: /keyboard|key press|arrow key/i, requirement: 'Keyboard navigation support' },
      { pattern: /screen reader|aria|accessible/i, requirement: 'Screen reader compatibility' },
      { pattern: /contrast|color ratio/i, requirement: 'Sufficient color contrast (WCAG 2.1)' },
      { pattern: /focus|focus indicator|focus ring/i, requirement: 'Visible focus indicator' },
      { pattern: /label|labeled|labelled/i, requirement: 'Associated label for form controls' },
      { pattern: /touch target|tap target|44px|44 pixel/i, requirement: 'Minimum touch target size (44x44px)' },
      { pattern: /announce|announced|live region/i, requirement: 'State changes announced to assistive technology' },
      { pattern: /escape|esc key|close/i, requirement: 'Escape key to close/dismiss' }
    ];

    for (const { pattern, requirement } of a11yPatterns) {
      if (pattern.test(content)) {
        requirements.push(requirement);
      }
    }

    // Add basic requirements if none detected
    if (requirements.length === 0) {
      requirements.push('Keyboard navigation support');
      requirements.push('Visible focus indicator');
    }

    return requirements;
  }

  /**
   * Get built-in best practices (internal - returns null for unknown families)
   */
  private getBuiltInBestPracticesInternal(family: string): ComponentBestPractices | null {
    const bestPractices = this.getBestPracticesMap();
    return bestPractices[family] || null;
  }

  /**
   * Get the best practices map (shared between internal and public methods)
   */
  private getBestPracticesMap(): Record<string, ComponentBestPractices> {
    return {
      button: {
        family: 'button',
        expectedStates: ['default', 'hover', 'focus', 'active', 'disabled', 'loading'],
        expectedProperties: [
          { name: 'variant', type: 'variant', values: ['primary', 'secondary', 'outline', 'ghost', 'destructive'] },
          { name: 'size', type: 'variant', values: ['small', 'medium', 'large'] },
          { name: 'disabled', type: 'boolean', description: 'Disables the button' },
          { name: 'loading', type: 'boolean', description: 'Shows loading state' },
          { name: 'iconBefore', type: 'instance-swap', description: 'Icon slot before text' },
          { name: 'iconAfter', type: 'instance-swap', description: 'Icon slot after text' }
        ],
        accessibilityRequirements: [
          'Minimum touch target size of 44x44px',
          'Color contrast ratio of at least 4.5:1 for text',
          'Visible focus indicator',
          'Disabled state should be visually distinct'
        ],
        mcpKnowledge: []
      },
      input: {
        family: 'input',
        expectedStates: ['default', 'hover', 'focus', 'filled', 'disabled', 'error', 'success'],
        expectedProperties: [
          { name: 'size', type: 'variant', values: ['small', 'medium', 'large'] },
          { name: 'state', type: 'variant', values: ['default', 'error', 'success'] },
          { name: 'disabled', type: 'boolean', description: 'Disables the input' },
          { name: 'label', type: 'text', description: 'Input label text' },
          { name: 'placeholder', type: 'text', description: 'Placeholder text' },
          { name: 'helperText', type: 'text', description: 'Helper or error message' }
        ],
        accessibilityRequirements: [
          'Associated label for screen readers',
          'Error messages announced to screen readers',
          'Sufficient color contrast',
          'Visible focus state'
        ],
        mcpKnowledge: []
      },
      card: {
        family: 'card',
        expectedStates: ['default', 'hover', 'selected'],
        expectedProperties: [
          { name: 'variant', type: 'variant', values: ['default', 'outlined', 'elevated'] },
          { name: 'padding', type: 'variant', values: ['none', 'small', 'medium', 'large'] },
          { name: 'clickable', type: 'boolean', description: 'Whether card is interactive' }
        ],
        accessibilityRequirements: [
          'Interactive cards should be keyboard focusable',
          'Card content should have logical reading order',
          'Sufficient contrast for card boundaries'
        ],
        mcpKnowledge: []
      },
      avatar: {
        family: 'avatar',
        expectedStates: ['default', 'loading', 'error'],
        expectedProperties: [
          { name: 'size', type: 'variant', values: ['xs', 'small', 'medium', 'large', 'xl'] },
          { name: 'shape', type: 'variant', values: ['circle', 'square', 'rounded'] },
          { name: 'showBadge', type: 'boolean', description: 'Show status badge' }
        ],
        accessibilityRequirements: [
          'Alternative text for images',
          'Fallback for failed image loads',
          'Badge status should be accessible'
        ],
        mcpKnowledge: []
      },
      icon: {
        family: 'icon',
        expectedStates: ['default'],
        expectedProperties: [
          { name: 'size', type: 'variant', values: ['xs', 'small', 'medium', 'large', 'xl'] },
          { name: 'color', type: 'color', description: 'Icon color' }
        ],
        accessibilityRequirements: [
          'Decorative icons should be hidden from assistive technology',
          'Meaningful icons need accessible labels'
        ],
        mcpKnowledge: []
      },
      badge: {
        family: 'badge',
        expectedStates: ['default'],
        expectedProperties: [
          { name: 'variant', type: 'variant', values: ['default', 'success', 'warning', 'error', 'info'] },
          { name: 'size', type: 'variant', values: ['small', 'medium'] }
        ],
        accessibilityRequirements: [
          'Color should not be the only indicator',
          'Text should have sufficient contrast'
        ],
        mcpKnowledge: []
      },
      checkbox: {
        family: 'checkbox',
        expectedStates: ['default', 'hover', 'focus', 'checked', 'indeterminate', 'disabled'],
        expectedProperties: [
          { name: 'checked', type: 'boolean', description: 'Whether checkbox is checked' },
          { name: 'indeterminate', type: 'boolean', description: 'Partial selection state' },
          { name: 'disabled', type: 'boolean', description: 'Disables the checkbox' },
          { name: 'label', type: 'text', description: 'Checkbox label' }
        ],
        accessibilityRequirements: [
          'Associated label for screen readers',
          'Keyboard operable',
          'State changes announced'
        ],
        mcpKnowledge: []
      },
      toggle: {
        family: 'toggle',
        expectedStates: ['off', 'on', 'disabled'],
        expectedProperties: [
          { name: 'checked', type: 'boolean', description: 'Toggle state' },
          { name: 'disabled', type: 'boolean', description: 'Disables the toggle' },
          { name: 'size', type: 'variant', values: ['small', 'medium'] }
        ],
        accessibilityRequirements: [
          'Role of switch',
          'State announced on change',
          'Keyboard operable'
        ],
        mcpKnowledge: []
      }
    };
  }

  /**
   * Get built-in best practices for common component families
   * Uses shared map for known families, generates intelligent defaults for unknown families
   */
  private getBuiltInBestPractices(family: string): ComponentBestPractices {
    const bestPractices = this.getBestPracticesMap();

    // Return built-in if available
    if (bestPractices[family]) {
      return bestPractices[family];
    }

    // For unknown families, generate intelligent defaults based on family name
    return this.generateDefaultsForUnknownFamily(family);
  }

  /**
   * Generate intelligent defaults for component families not in the built-in list
   */
  private generateDefaultsForUnknownFamily(family: string): ComponentBestPractices {
    const familyLower = family.toLowerCase();

    // Determine interaction pattern based on family name
    let expectedStates: string[] = ['default'];
    let expectedProperties: ExpectedProperty[] = [];
    let accessibilityRequirements: string[] = ['Keyboard navigation support', 'Visible focus indicator'];

    // Modal/Dialog pattern
    if (familyLower.includes('modal') || familyLower.includes('dialog') || familyLower.includes('popup')) {
      expectedStates = ['closed', 'open'];
      expectedProperties = [
        { name: 'open', type: 'boolean', description: 'Controls visibility' },
        { name: 'size', type: 'variant', values: ['small', 'medium', 'large', 'fullscreen'] }
      ];
      accessibilityRequirements = [
        'Focus trap when open',
        'Escape key to close',
        'Return focus on close',
        'ARIA modal role'
      ];
    }
    // Dropdown/Menu pattern
    else if (familyLower.includes('dropdown') || familyLower.includes('menu') || familyLower.includes('popover')) {
      expectedStates = ['closed', 'open', 'hover'];
      expectedProperties = [
        { name: 'open', type: 'boolean', description: 'Controls menu visibility' },
        { name: 'placement', type: 'variant', values: ['top', 'bottom', 'left', 'right'] }
      ];
      accessibilityRequirements = [
        'Arrow key navigation',
        'Escape key to close',
        'ARIA expanded state'
      ];
    }
    // Tooltip pattern
    else if (familyLower.includes('tooltip')) {
      expectedStates = ['hidden', 'visible'];
      expectedProperties = [
        { name: 'placement', type: 'variant', values: ['top', 'bottom', 'left', 'right'] }
      ];
      accessibilityRequirements = [
        'Accessible via keyboard focus',
        'ARIA describedby relationship'
      ];
    }
    // Table/Data pattern (check BEFORE tabs to avoid "DataTable" matching "tab")
    else if (familyLower.includes('table') || familyLower.includes('datagrid') || familyLower.includes('grid')) {
      expectedStates = ['default', 'hover', 'selected'];
      expectedProperties = [
        { name: 'sortable', type: 'boolean', description: 'Enables sorting' },
        { name: 'selectable', type: 'boolean', description: 'Enables row selection' }
      ];
      accessibilityRequirements = [
        'Proper table semantics',
        'Keyboard navigation for cells',
        'Sort status announced'
      ];
    }
    // Tabs pattern
    else if (familyLower.includes('tab')) {
      expectedStates = ['default', 'hover', 'focus', 'selected', 'disabled'];
      expectedProperties = [
        { name: 'selected', type: 'boolean', description: 'Whether tab is selected' },
        { name: 'disabled', type: 'boolean', description: 'Disables the tab' }
      ];
      accessibilityRequirements = [
        'Arrow key navigation between tabs',
        'ARIA tablist role',
        'ARIA selected state'
      ];
    }
    // Accordion pattern
    else if (familyLower.includes('accordion') || familyLower.includes('collapse') || familyLower.includes('expand')) {
      expectedStates = ['collapsed', 'expanded', 'hover', 'focus', 'disabled'];
      expectedProperties = [
        { name: 'expanded', type: 'boolean', description: 'Expansion state' },
        { name: 'disabled', type: 'boolean', description: 'Disables the section' }
      ];
      accessibilityRequirements = [
        'ARIA expanded state',
        'Enter/Space to toggle',
        'ARIA controls relationship'
      ];
    }
    // Data-driven components (check after table)
    else if (familyLower.includes('data')) {
      expectedStates = ['default', 'loading', 'empty', 'error'];
      expectedProperties = [
        { name: 'loading', type: 'boolean', description: 'Loading state' }
      ];
      accessibilityRequirements = [
        'Loading state announced',
        'Empty state has proper messaging'
      ];
    }
    // Stepper/Wizard pattern
    else if (familyLower.includes('stepper') || familyLower.includes('wizard') || familyLower.includes('step')) {
      expectedStates = ['default', 'active', 'completed', 'disabled', 'error'];
      expectedProperties = [
        { name: 'active', type: 'boolean', description: 'Current step' },
        { name: 'completed', type: 'boolean', description: 'Step completed' }
      ];
      accessibilityRequirements = [
        'Current step indicated',
        'Progress announced to screen readers'
      ];
    }
    // Chip/Tag pattern
    else if (familyLower.includes('chip') || familyLower.includes('tag') || familyLower.includes('pill')) {
      expectedStates = ['default', 'hover', 'selected', 'disabled'];
      expectedProperties = [
        { name: 'selected', type: 'boolean', description: 'Selection state' },
        { name: 'removable', type: 'boolean', description: 'Can be removed' }
      ];
      accessibilityRequirements = [
        'Remove action accessible',
        'Selection state announced'
      ];
    }
    // Slider/Range pattern
    else if (familyLower.includes('slider') || familyLower.includes('range')) {
      expectedStates = ['default', 'hover', 'focus', 'disabled'];
      expectedProperties = [
        { name: 'disabled', type: 'boolean', description: 'Disables the slider' }
      ];
      accessibilityRequirements = [
        'ARIA slider role',
        'Value announced on change',
        'Keyboard operable'
      ];
    }
    // Rating/Stars pattern
    else if (familyLower.includes('rating') || familyLower.includes('star')) {
      expectedStates = ['default', 'hover', 'selected', 'disabled'];
      expectedProperties = [
        { name: 'readonly', type: 'boolean', description: 'Read-only mode' }
      ];
      accessibilityRequirements = [
        'Current rating announced',
        'Keyboard selection support'
      ];
    }
    // List/Item pattern
    else if (familyLower.includes('list') || familyLower.includes('item')) {
      expectedStates = ['default', 'hover', 'focus', 'selected', 'disabled'];
      expectedProperties = [
        { name: 'selected', type: 'boolean', description: 'Selection state' },
        { name: 'disabled', type: 'boolean', description: 'Disables the item' }
      ];
      accessibilityRequirements = [
        'ARIA listbox/option roles',
        'Arrow key navigation'
      ];
    }
    // Alert/Banner pattern (includes announcement, toast, snackbar)
    else if (familyLower.includes('alert') || familyLower.includes('banner') || familyLower.includes('notification') ||
             familyLower.includes('announcement') || familyLower.includes('toast') || familyLower.includes('snackbar')) {
      expectedStates = ['default', 'dismissing'];
      expectedProperties = [
        { name: 'variant', type: 'variant', values: ['info', 'success', 'warning', 'error'] },
        { name: 'dismissible', type: 'boolean', description: 'Can be dismissed' }
      ];
      accessibilityRequirements = [
        'ARIA alert or status role',
        'Color not sole indicator'
      ];
    }
    // Progress/Loading pattern
    else if (familyLower.includes('progress') || familyLower.includes('loader') || familyLower.includes('spinner')) {
      expectedStates = ['default', 'loading', 'complete', 'error'];
      expectedProperties = [
        { name: 'indeterminate', type: 'boolean', description: 'Indeterminate state' }
      ];
      accessibilityRequirements = [
        'ARIA progressbar role',
        'Value announced to screen readers'
      ];
    }
    // Navigation pattern
    else if (familyLower.includes('nav') || familyLower.includes('breadcrumb') || familyLower.includes('pagination')) {
      expectedStates = ['default', 'hover', 'focus', 'active', 'disabled'];
      expectedProperties = [];
      accessibilityRequirements = [
        'ARIA navigation role',
        'Current page indicated'
      ];
    }
    // Interactive component (default with basic interaction)
    else if (familyLower.includes('button') || familyLower.includes('link') || familyLower.includes('action')) {
      expectedStates = ['default', 'hover', 'focus', 'active', 'disabled'];
      expectedProperties = [
        { name: 'disabled', type: 'boolean', description: 'Disables interaction' }
      ];
    }
    // Container/Layout (minimal states)
    else if (familyLower.includes('container') || familyLower.includes('section') || familyLower.includes('wrapper') || familyLower.includes('layout')) {
      expectedStates = ['default'];
      expectedProperties = [];
      accessibilityRequirements = ['Proper semantic structure'];
    }
    // Generic interactive component
    else {
      expectedStates = ['default', 'hover', 'focus', 'disabled'];
      expectedProperties = [
        { name: 'disabled', type: 'boolean', description: 'Disables the component' }
      ];
    }

    return {
      family,
      expectedStates,
      expectedProperties,
      accessibilityRequirements,
      mcpKnowledge: []
    };
  }

  /**
   * Compare component against best practices and return gaps
   */
  analyzeAgainstBestPractices(
    componentContext: ComponentContext,
    currentStates: string[],
    currentProperties: string[],
    bestPractices: ComponentBestPractices
  ): BestPracticesGap[] {
    const gaps: BestPracticesGap[] = [];

    // Detect non-interactive component patterns
    const familyLower = bestPractices.family.toLowerCase();
    const isNonInteractive = ['banner', 'alert', 'notification', 'toast', 'snackbar', 'announcement'].some(
      pattern => familyLower.includes(pattern)
    );

    // Check for missing states
    const missingStates = bestPractices.expectedStates.filter(
      state => !currentStates.some(s => s.toLowerCase().includes(state.toLowerCase()))
    );

    if (missingStates.length > 0) {
      gaps.push({
        category: 'states',
        severity: isNonInteractive ? 'info' : 'warning',
        message: `Missing expected states: ${missingStates.join(', ')}`,
        suggestion: `Add visual designs for: ${missingStates.join(', ')}`,
        missingItems: missingStates
      });
    }

    // Check for missing properties
    const missingProperties = bestPractices.expectedProperties.filter(
      prop => !currentProperties.some(p =>
        p.toLowerCase().includes(prop.name.toLowerCase())
      )
    );

    if (missingProperties.length > 0) {
      gaps.push({
        category: 'properties',
        severity: 'info',
        message: `Consider adding properties: ${missingProperties.map(p => p.name).join(', ')}`,
        suggestion: `Add component properties for configurability`,
        missingItems: missingProperties.map(p => p.name)
      });
    }

    return gaps;
  }
}

// Types for best practices
export interface ComponentBestPractices {
  family: string;
  expectedStates: string[];
  expectedProperties: ExpectedProperty[];
  accessibilityRequirements: string[];
  mcpKnowledge: string[];
}

export interface ExpectedProperty {
  name: string;
  type: 'variant' | 'boolean' | 'text' | 'number' | 'color' | 'instance-swap';
  values?: string[];
  description?: string;
}

export interface BestPracticesGap {
  category: 'states' | 'properties' | 'accessibility';
  severity: 'error' | 'warning' | 'info';
  message: string;
  suggestion: string;
  missingItems: string[];
}

export default ComponentConsistencyEngine;
