/// <reference types="@figma/plugin-typings" />

import { PluginMessage, UIMessageType, EnhancedAnalysisOptions, ChatMessage, ChatResponse } from '../types';
import { sendMessageToUI, isValidApiKeyFormat, isValidNodeForAnalysis } from '../utils/figma-helpers';
import { processEnhancedAnalysis, extractComponentContext } from '../core/component-analyzer';
import { extractDesignTokensFromNode } from '../core/token-analyzer';
import { fetchClaude, extractJSONFromResponse, createEnhancedMetadataPrompt } from '../api/claude';
import ComponentConsistencyEngine from '../core/consistency-engine';

// Plugin state
let storedApiKey: string | null = null;
let selectedModel = 'claude-3-sonnet-20240229';

// Initialize consistency engine
const consistencyEngine = new ComponentConsistencyEngine({
  enableCaching: true,
  enableMCPIntegration: true,
  mcpServerUrl: 'https://design-systems-mcp.southleft-llc.workers.dev/mcp'
});

/**
 * Main message handler for UI communication
 */
export async function handleUIMessage(msg: PluginMessage): Promise<void> {
  const { type, data } = msg;
  console.log('Received message:', type, data);

  try {
    switch (type as UIMessageType) {
      case 'check-api-key':
        await handleCheckApiKey();
        break;
      case 'save-api-key':
        await handleSaveApiKey(data.apiKey, data.model);
        break;
      case 'update-model':
        await handleUpdateModel(data.model);
        break;
      case 'analyze':
        await handleAnalyzeComponent();
        break;
      case 'analyze-enhanced':
        await handleEnhancedAnalyze(data);
        break;
      case 'clear-api-key':
        await handleClearApiKey();
        break;
      case 'chat-message':
        await handleChatMessage(data);
        break;
      case 'chat-clear-history':
        await handleClearChatHistory();
        break;
      default:
        console.warn('Unknown message type:', type);
    }
  } catch (error) {
    console.error('Error handling message:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    sendMessageToUI('analysis-error', { error: errorMessage });
  }
}

/**
 * Check if API key is already saved
 */
async function handleCheckApiKey(): Promise<void> {
  try {
    // Check in-memory first
    if (storedApiKey) {
      sendMessageToUI('api-key-status', { hasKey: true });
      return;
    }

    // Check persistent storage
    const savedKey = await figma.clientStorage.getAsync('claude-api-key');
    if (savedKey && isValidApiKeyFormat(savedKey)) {
      storedApiKey = savedKey;
      sendMessageToUI('api-key-status', { hasKey: true });
    } else {
      sendMessageToUI('api-key-status', { hasKey: false });
    }
  } catch (error) {
    console.error('Error checking API key:', error);
    sendMessageToUI('api-key-status', { hasKey: false });
  }
}

/**
 * Save API key and model
 */
async function handleSaveApiKey(apiKey: string, model?: string): Promise<void> {
  try {
    // Validate API key format
    if (!isValidApiKeyFormat(apiKey)) {
      throw new Error('Invalid API key format. Please check your Claude API key.');
    }

    // Store in memory
    storedApiKey = apiKey;

    // Store selected model
    if (model) {
      selectedModel = model;
      await figma.clientStorage.setAsync('claude-model', model);
    }

    // Store in persistent storage
    await figma.clientStorage.setAsync('claude-api-key', apiKey);
    console.log('API key and model saved successfully');

    sendMessageToUI('api-key-saved', { success: true });
    figma.notify('API key and model saved successfully', { timeout: 2000 });
  } catch (error) {
    console.error('Error saving API key:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    sendMessageToUI('api-key-saved', { success: false, error: errorMessage });
    figma.notify(`Failed to save API key: ${errorMessage}`, { error: true });
  }
}

/**
 * Update selected model
 */
async function handleUpdateModel(model: string): Promise<void> {
  try {
    selectedModel = model;
    await figma.clientStorage.setAsync('claude-model', model);
    console.log('Model updated to:', model);
    figma.notify(`Model updated to ${model}`, { timeout: 2000 });
  } catch (error) {
    console.error('Error updating model:', error);
    figma.notify('Failed to update model', { error: true });
  }
}

/**
 * Enhanced component analysis with consistency engine
 */
async function handleEnhancedAnalyze(options: EnhancedAnalysisOptions): Promise<void> {
  try {
    // Check API key
    if (!storedApiKey) {
      throw new Error('API key not found. Please save your Claude API key first.');
    }

    // Get selection
    const selection = figma.currentPage.selection;
    if (selection.length === 0) {
      throw new Error('No component selected. Please select a Figma component to analyze.');
    }

    // Handle batch mode
    if (options.batchMode && selection.length > 1) {
      await handleBatchAnalysis(selection, options);
      return;
    }

    // Single component analysis
    let selectedNode = selection[0];
    const originalSelectedNode = selectedNode; // Keep track of the original selection

    // Handle instances
    if (selectedNode.type === 'INSTANCE') {
      const instance = selectedNode as InstanceNode;
      if (instance.mainComponent) {
        figma.notify('Analyzing main component instead of instance...', { timeout: 2000 });
        selectedNode = instance.mainComponent;
      } else {
        throw new Error('This instance has no main component. Please select a component directly.');
      }
    }

    // Handle component variants - if user selected a variant, analyze the parent component set
    if (selectedNode.type === 'COMPONENT' && selectedNode.parent?.type === 'COMPONENT_SET') {
      const component = selectedNode as ComponentNode;
      const parentComponentSet = component.parent as ComponentSetNode;

      figma.notify('Analyzing parent component set to include all variants...', { timeout: 2000 });
      selectedNode = parentComponentSet;
    }

    // Validate node type
    if (!isValidNodeForAnalysis(selectedNode)) {
      throw new Error('Please select a Frame, Component, Component Set, or Instance to analyze');
    }

    // Load design systems knowledge if not already loaded
    await consistencyEngine.loadDesignSystemsKnowledge();

    // Extract component context and tokens for hashing
    const componentContext = extractComponentContext(selectedNode);
    const tokenAnalysis = await extractDesignTokensFromNode(selectedNode);
    const allTokens = [
      ...tokenAnalysis.colors,
      ...tokenAnalysis.spacing,
      ...tokenAnalysis.typography,
      ...tokenAnalysis.effects,
      ...tokenAnalysis.borders
    ];

    // Generate component hash for consistency checking
    const componentHash = consistencyEngine.generateComponentHash(componentContext, allTokens);
    console.log('🔍 Component hash generated:', componentHash);

    // Check for cached analysis first
    const cachedAnalysis = consistencyEngine.getCachedAnalysis(componentHash);
    if (cachedAnalysis) {
      console.log('✅ Using cached analysis for consistent results');
      figma.notify('Using cached analysis for consistent results', { timeout: 2000 });

      // Store for later use
      (globalThis as any).lastAnalyzedMetadata = cachedAnalysis.result.metadata;
      (globalThis as any).lastAnalyzedNode = selectedNode;

      // Send cached results to UI
      sendMessageToUI('enhanced-analysis-result', cachedAnalysis.result);
      return;
    }

    // Create deterministic prompt using consistency engine
    const deterministicPrompt = consistencyEngine.createDeterministicPrompt(componentContext);

    // Show loading notification
    figma.notify('Performing enhanced analysis with design systems knowledge...', { timeout: 3000 });

    // Call Claude API with deterministic settings
    const analysis = await fetchClaude(deterministicPrompt, storedApiKey, selectedModel, true);

    // Parse JSON response
    const enhancedData = extractJSONFromResponse(analysis);

    // Process the enhanced data with the original selected node for property extraction
    let result = await processEnhancedAnalysis(enhancedData, selectedNode, originalSelectedNode);

    // Validate and apply consistency corrections
    const isConsistent = consistencyEngine.validateAnalysisConsistency(result, componentContext);
    if (!isConsistent) {
      console.log('⚠️ Applying consistency corrections...');
      result = consistencyEngine.applyConsistencyCorrections(result, componentContext);
      figma.notify('Applied consistency corrections to analysis', { timeout: 2000 });
    }

    // Cache the result for future consistency
    consistencyEngine.cacheAnalysis(componentHash, result);

    // Store for later use
    (globalThis as any).lastAnalyzedMetadata = result.metadata;
    (globalThis as any).lastAnalyzedNode = selectedNode;

    // Send results to UI
    sendMessageToUI('enhanced-analysis-result', result);
    figma.notify('Enhanced analysis complete! Results cached for consistency.', { timeout: 3000 });

  } catch (error) {
    console.error('Error during enhanced analysis:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    figma.notify(`Analysis failed: ${errorMessage}`, { error: true });
    sendMessageToUI('analysis-error', { error: errorMessage });
  }
}

/**
 * Basic component analysis (legacy support)
 */
async function handleAnalyzeComponent(): Promise<void> {
  // For backward compatibility, call enhanced analyze
  await handleEnhancedAnalyze({ batchMode: false });
}

/**
 * Handle batch analysis of multiple components with consistency
 */
async function handleBatchAnalysis(nodes: readonly SceneNode[], _options: EnhancedAnalysisOptions): Promise<void> {
  const results = [];

  // Ensure design systems knowledge is loaded
  await consistencyEngine.loadDesignSystemsKnowledge();

  for (const node of nodes) {
    if (isValidNodeForAnalysis(node)) {
      try {
        // Extract context and tokens for hashing
        const componentContext = extractComponentContext(node);
        const tokenAnalysis = await extractDesignTokensFromNode(node);
        const allTokens = [
          ...tokenAnalysis.colors,
          ...tokenAnalysis.spacing,
          ...tokenAnalysis.typography,
          ...tokenAnalysis.effects,
          ...tokenAnalysis.borders
        ];

        // Generate component hash
        const componentHash = consistencyEngine.generateComponentHash(componentContext, allTokens);

        // Check for cached analysis first
        const cachedAnalysis = consistencyEngine.getCachedAnalysis(componentHash);
        if (cachedAnalysis) {
          console.log(`✅ Using cached analysis for ${node.name}`);
          results.push({
            node: node.name,
            success: true,
            data: cachedAnalysis.result.metadata,
            cached: true
          });
          continue;
        }

        // Create deterministic prompt
        const deterministicPrompt = consistencyEngine.createDeterministicPrompt(componentContext);
        const analysis = await fetchClaude(deterministicPrompt, storedApiKey!, selectedModel, true);
        const enhancedData = extractJSONFromResponse(analysis);

        // Process and validate the result
        let result = await processEnhancedAnalysis(enhancedData, node, node);

        // Apply consistency corrections
        const isConsistent = consistencyEngine.validateAnalysisConsistency(result, componentContext);
        if (!isConsistent) {
          result = consistencyEngine.applyConsistencyCorrections(result, componentContext);
        }

        // Cache for future consistency
        consistencyEngine.cacheAnalysis(componentHash, result);

        results.push({
          node: node.name,
          success: true,
          data: result.metadata,
          cached: false
        });
      } catch (error) {
        results.push({
          node: node.name,
          success: false,
          error: error instanceof Error ? error.message : 'Analysis failed'
        });
      }
    }
  }

  const cachedCount = results.filter(r => r.success && (r as any).cached).length;
  const analyzedCount = results.filter(r => r.success && !(r as any).cached).length;

  sendMessageToUI('batch-analysis-result', { results });
  figma.notify(`Batch analysis complete: ${analyzedCount} analyzed, ${cachedCount} from cache`, { timeout: 3000 });
}


async function handleClearApiKey(): Promise<void> {
  try {
    storedApiKey = null;
    await figma.clientStorage.setAsync('claude-api-key', '');
    sendMessageToUI('api-key-cleared', { success: true });
    figma.notify('API key cleared', { timeout: 2000 });
  } catch (error) {
    console.error('Error clearing API key:', error);
  }
}

/**
 * Handle chat message and get response from design systems knowledge base
 */
async function handleChatMessage(data: { message: string; history: ChatMessage[] }): Promise<void> {
  try {
    console.log('Processing chat message:', data.message);

    // Check API key
    if (!storedApiKey) {
      throw new Error('API key not found. Please save your Claude API key first.');
    }

    // Send loading state
    sendMessageToUI('chat-response-loading', { isLoading: true });

    // Get current component context if available
    const componentContext = getCurrentComponentContext();

    // Query the MCP server for design systems knowledge
    const mcpResponse = await queryDesignSystemsMCP(data.message);

    // Create enhanced prompt with MCP context and component context
    const enhancedPrompt = createChatPromptWithContext(data.message, mcpResponse, data.history, componentContext);

    // Get response from Claude
    const response = await fetchClaude(enhancedPrompt, storedApiKey, selectedModel, false);

    // Send response back to UI
    const chatResponse: ChatResponse = {
      message: response,
      sources: mcpResponse.sources || []
    };

    sendMessageToUI('chat-response', { response: chatResponse });

  } catch (error) {
    console.error('Error handling chat message:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    sendMessageToUI('chat-error', { error: errorMessage });
  }
}

/**
 * Clear chat history
 */
async function handleClearChatHistory(): Promise<void> {
  try {
    sendMessageToUI('chat-history-cleared', { success: true });
    figma.notify('Chat history cleared', { timeout: 2000 });
  } catch (error) {
    console.error('Error clearing chat history:', error);
  }
}

/**
 * Query the design systems MCP server for relevant knowledge
 */
async function queryDesignSystemsMCP(query: string): Promise<{ sources: any[] }> {
  try {
    console.log('🔍 Querying MCP for chat:', query);

    const mcpServerUrl = consistencyEngine['config']?.mcpServerUrl || 'https://design-systems-mcp.southleft-llc.workers.dev/mcp';

    // Use multiple search strategies for better results
    const searchPromises = [
      // General design knowledge search
      searchMCPKnowledge(mcpServerUrl, query, { category: 'general', limit: 3 }),
      // Component-specific search if the query mentions components
      query.toLowerCase().includes('component') ?
        searchMCPKnowledge(mcpServerUrl, query, { category: 'components', limit: 2 }) :
        Promise.resolve({ results: [] }),
      // Token-specific search if the query mentions tokens/design tokens
      (query.toLowerCase().includes('token') || query.toLowerCase().includes('design token')) ?
        searchMCPKnowledge(mcpServerUrl, query, { category: 'tokens', limit: 2 }) :
        Promise.resolve({ results: [] })
    ];

    const results = await Promise.allSettled(searchPromises);

    // Combine all successful results
    const allSources: any[] = [];
    results.forEach(result => {
      if (result.status === 'fulfilled' && result.value.results) {
        allSources.push(...result.value.results);
      }
    });

    console.log(`✅ Found ${allSources.length} relevant sources for chat query`);

    return { sources: allSources.slice(0, 5) }; // Limit to top 5 results
  } catch (error) {
    console.warn('⚠️ MCP query failed for chat:', error);
    return { sources: [] };
  }
}

/**
 * Search MCP knowledge base
 */
async function searchMCPKnowledge(serverUrl: string, query: string, options: { category?: string; limit?: number } = {}): Promise<{ results: any[] }> {
  const searchPayload = {
    jsonrpc: "2.0",
    id: Math.floor(Math.random() * 1000) + 100,
    method: "tools/call",
    params: {
      name: "search_design_knowledge",
      arguments: {
        query,
        limit: options.limit || 5,
        ...(options.category && { category: options.category })
      }
    }
  };

  const response = await fetch(serverUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(searchPayload)
  });

  if (!response.ok) {
    throw new Error(`MCP search failed: ${response.status}`);
  }

  const result = await response.json();

  if (result.result && result.result.content) {
    return {
      results: result.result.content.map((item: any) => ({
        title: item.title || 'Design System Knowledge',
        content: item.content || item.description || '',
        category: item.category || 'general'
      }))
    };
  }

  return { results: [] };
}

/**
 * Get current component context for chat
 */
function getCurrentComponentContext(): any {
  try {
    // Get the last analyzed metadata and node from global state
    const lastMetadata = (globalThis as any).lastAnalyzedMetadata;
    const lastNode = (globalThis as any).lastAnalyzedNode;

    if (!lastMetadata && !lastNode) {
      return null;
    }

    // Build component context
    const context: any = {
      hasCurrentComponent: true,
      timestamp: Date.now()
    };

    // Add component info if we have a selected node
    if (lastNode) {
      context.component = {
        name: lastNode.name,
        type: lastNode.type,
        id: lastNode.id
      };

      // Add selection info
      const selection = figma.currentPage.selection;
      if (selection.length > 0) {
        context.selection = {
          count: selection.length,
          types: selection.map(node => node.type),
          names: selection.map(node => node.name)
        };
      }
    }

    // Add analysis metadata if available
    if (lastMetadata) {
      context.analysis = {
        component: lastMetadata.component,
        description: lastMetadata.description,
        props: lastMetadata.props || [],
        states: lastMetadata.states || [],
        accessibility: lastMetadata.accessibility,
        audit: lastMetadata.audit,
        mcpReadiness: lastMetadata.mcpReadiness
      };
    }

    return context;
  } catch (error) {
    console.warn('Failed to get component context:', error);
    return null;
  }
}

/**
 * Create enhanced chat prompt with MCP context and component context
 */
function createChatPromptWithContext(userMessage: string, mcpResponse: { sources: any[] }, history: ChatMessage[], componentContext: any): string {
  // Build conversation context
  let conversationContext = '';
  if (history.length > 0) {
    conversationContext = '\n**Previous Conversation:**\n';
    // Include last 6 messages for context (3 exchanges)
    const recentMessages = history.slice(-6);
    recentMessages.forEach(msg => {
      conversationContext += `${msg.role === 'user' ? 'User' : 'Assistant'}: ${msg.content}\n`;
    });
    conversationContext += '\n';
  }

  // Build current component context
  let currentComponentContext = '';
  if (componentContext && componentContext.hasCurrentComponent) {
    currentComponentContext = '\n**Current Component Context:**\n';

    if (componentContext.component) {
      currentComponentContext += `- Currently analyzing: ${componentContext.component.name} (${componentContext.component.type})\n`;
    }

    if (componentContext.selection) {
      currentComponentContext += `- Selected: ${componentContext.selection.count} item(s) - ${componentContext.selection.names.join(', ')}\n`;
    }

    if (componentContext.analysis) {
      currentComponentContext += `- Component: ${componentContext.analysis.component}\n`;
      currentComponentContext += `- Description: ${componentContext.analysis.description}\n`;

      if (componentContext.analysis.props && componentContext.analysis.props.length > 0) {
        currentComponentContext += `- Properties: ${componentContext.analysis.props.map((p: any) => typeof p === 'string' ? p : p.name).join(', ')}\n`;
      }

      if (componentContext.analysis.states && componentContext.analysis.states.length > 0) {
        currentComponentContext += `- States: ${componentContext.analysis.states.join(', ')}\n`;
      }

      if (componentContext.analysis.audit) {
        const issues = [
          ...(componentContext.analysis.audit.accessibilityIssues || []),
          ...(componentContext.analysis.audit.namingIssues || []),
          ...(componentContext.analysis.audit.consistencyIssues || [])
        ];
        if (issues.length > 0) {
          currentComponentContext += `- Current Issues: ${issues.slice(0, 3).join('; ')}${issues.length > 3 ? '...' : ''}\n`;
        }
      }

      if (componentContext.analysis.mcpReadiness) {
        currentComponentContext += `- MCP Readiness Score: ${componentContext.analysis.mcpReadiness.score || 'Not scored'}\n`;
      }
    }

    currentComponentContext += '\n';
  }

  // Build knowledge context from MCP sources
  let knowledgeContext = '';
  if (mcpResponse.sources && mcpResponse.sources.length > 0) {
    knowledgeContext = '\n**Relevant Design Systems Knowledge:**\n';
    mcpResponse.sources.forEach((source, index) => {
      knowledgeContext += `\n${index + 1}. **${source.title}** (${source.category})\n${source.content}\n`;
    });
    knowledgeContext += '\n';
  }

  const hasComponentContext = componentContext && componentContext.hasCurrentComponent;

  return `You are a specialized design systems assistant with access to comprehensive design systems knowledge. You're helping a user with their Figma plugin for design system analysis.

${conversationContext}**Current User Question:** ${userMessage}

${currentComponentContext}${knowledgeContext}**Instructions:**
1. ${hasComponentContext ?
    'The user is currently working on a specific component in Figma. Use the component context above to provide specific, actionable advice about their current work.' :
    'Provide helpful, accurate answers based on the design systems knowledge provided'}
2. ${hasComponentContext ?
    'If they ask about "this component" or "my component", refer to the current component context provided above' :
    'If you need context about a specific component, suggest they select and analyze a component first'}
3. Be conversational and practical in your responses
4. When discussing components, tokens, or patterns, provide specific guidance
5. If referencing the knowledge sources, mention them naturally in your response
6. Keep responses focused and actionable
7. If the user is asking about Figma-specific functionality, provide relevant plugin or design workflow advice
8. ${hasComponentContext ?
    'Help them improve their current component by addressing any issues mentioned in the analysis context' :
    'Provide general design systems guidance'}

${hasComponentContext ?
  'Since you have context about their current component, prioritize advice that directly applies to what they\'re working on.' :
  'If the user wants component-specific advice, suggest they select and analyze a component in Figma first.'}

Respond naturally and helpfully to the user's question.`;
}

/**
 * Initialize plugin with design systems knowledge
 */
export async function initializePlugin(): Promise<void> {
  try {
    // Load API key from storage
    const savedApiKey = await figma.clientStorage.getAsync('claude-api-key');
    if (savedApiKey) {
      storedApiKey = savedApiKey;
      sendMessageToUI('api-key-status', { hasKey: true });
    }

    // Load selected model from storage
    const savedModel = await figma.clientStorage.getAsync('claude-model');
    if (savedModel) {
      selectedModel = savedModel;
      console.log('Loaded saved model:', selectedModel);
    }

    // Initialize design systems knowledge in background
    console.log('🔄 Initializing design systems knowledge...');
    consistencyEngine.loadDesignSystemsKnowledge()
      .then(() => {
        console.log('✅ Design systems knowledge loaded successfully');
      })
      .catch((error) => {
        console.warn('⚠️ Failed to load design systems knowledge, using fallback:', error);
      });

    console.log('Plugin initialized successfully');
  } catch (error) {
    console.error('Error initializing plugin:', error);
  }
}
