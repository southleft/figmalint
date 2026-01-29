/// <reference types="@figma/plugin-typings" />

import { PluginMessage, UIMessageType, EnhancedAnalysisOptions, ChatMessage, ChatResponse } from '../types';
import { sendMessageToUI, isValidNodeForAnalysis } from '../utils/figma-helpers';
import { processEnhancedAnalysis, processAnalysisResult, extractComponentContext } from '../core/component-analyzer';
import { extractDesignTokensFromNode } from '../core/token-analyzer';
import { extractJSONFromResponse, createEnhancedMetadataPrompt, filterDevelopmentRecommendations } from '../api/claude';
import ComponentConsistencyEngine from '../core/consistency-engine';
import {
  ProviderId,
  callProvider,
  getProvider,
  loadProviderConfig,
  saveProviderConfig,
  clearProviderKey,
  STORAGE_KEYS,
  DEFAULTS,
  migrateLegacyStorage,
} from '../api/providers';
import {
  previewFix as previewTokenFix,
  applyColorFix,
  applySpacingFix,
  findMatchingColorVariable,
  findMatchingSpacingVariable,
  suggestSemanticTokenName,
  FixPreview,
  FixResult,
} from '../fixes/token-fixer';
import {
  previewRename,
  renameLayer,
  batchRename,
  suggestLayerName,
  analyzeNamingIssues,
  getNamingIssueSummary,
  NamingStrategy,
  RenamePreview,
} from '../fixes/naming-fixer';
import { FixRequest, FixPreviewRequest, BatchFixRequest } from '../types';

// Plugin state
let storedApiKey: string | null = null;
let selectedModel = 'claude-sonnet-4-5-20250929'; // Default to Claude Sonnet 4.5
let selectedProvider: ProviderId = 'anthropic'; // Default to Anthropic

// Validate API key format based on provider
function isValidApiKeyFormat(apiKey: string, provider: ProviderId = selectedProvider): boolean {
  const trimmed = apiKey?.trim() || '';

  switch (provider) {
    case 'anthropic':
      return trimmed.startsWith('sk-ant-') && trimmed.length >= 40;
    case 'openai':
      return trimmed.startsWith('sk-') && trimmed.length >= 20;
    case 'google':
      return trimmed.startsWith('AIza') && trimmed.length >= 35;
    default:
      return false;
  }
}

// Plugin-level state for storing last analyzed component
let lastAnalyzedMetadata: any = null;
let lastAnalyzedNode: any = null;

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
        await handleSaveApiKey(data.apiKey, data.model, data.provider);
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
      case 'select-node':
        await handleSelectNode(data);
        break;
      // Auto-fix handlers
      case 'preview-fix':
        await handlePreviewFix(data);
        break;
      case 'apply-token-fix':
        await handleApplyTokenFix(data);
        break;
      case 'apply-naming-fix':
        await handleApplyNamingFix(data);
        break;
      case 'apply-batch-fix':
        await handleApplyBatchFix(data);
        break;
      case 'update-description':
        await handleUpdateDescription(data);
        break;
      case 'add-component-property':
        await handleAddComponentProperty(data);
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
    // Run migration for legacy Claude storage
    await migrateLegacyStorage();

    // Load saved provider configuration
    const config = await loadProviderConfig();
    selectedProvider = config.providerId;
    selectedModel = config.modelId;

    // Check in-memory first
    if (storedApiKey) {
      sendMessageToUI('api-key-status', {
        hasKey: true,
        provider: selectedProvider,
        model: selectedModel
      });
      return;
    }

    // Check persistent storage for current provider
    if (config.apiKey && isValidApiKeyFormat(config.apiKey, config.providerId)) {
      storedApiKey = config.apiKey;
      sendMessageToUI('api-key-status', {
        hasKey: true,
        provider: selectedProvider,
        model: selectedModel
      });
    } else {
      sendMessageToUI('api-key-status', {
        hasKey: false,
        provider: selectedProvider,
        model: selectedModel
      });
    }
  } catch (error) {
    console.error('Error checking API key:', error);
    sendMessageToUI('api-key-status', { hasKey: false, provider: 'anthropic' });
  }
}

/**
 * Save API key, model, and provider
 */
async function handleSaveApiKey(apiKey: string, model?: string, provider?: string): Promise<void> {
  try {
    // Update provider if specified
    const providerId = (provider as ProviderId) || selectedProvider;

    // Validate API key format for the provider
    if (!isValidApiKeyFormat(apiKey, providerId)) {
      const providerObj = getProvider(providerId);
      throw new Error(`Invalid API key format for ${providerObj.name}. Expected format: ${providerObj.keyPlaceholder}`);
    }

    // Update state
    selectedProvider = providerId;
    storedApiKey = apiKey;

    // Store selected model
    if (model) {
      selectedModel = model;
    }

    // Save to persistent storage
    await saveProviderConfig(providerId, selectedModel, apiKey);
    console.log(`${providerId} API key and model saved successfully`);

    const providerObj = getProvider(providerId);
    sendMessageToUI('api-key-saved', { success: true, provider: providerId });
    figma.notify(`${providerObj.name} API key saved successfully`, { timeout: 2000 });
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
    await saveProviderConfig(selectedProvider, model);
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
      const providerName = getProvider(selectedProvider).name;
      throw new Error(`API key not found. Please save your ${providerName} API key first.`);
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
      try {
        const mainComponent = await instance.getMainComponentAsync();
        if (mainComponent) {
          figma.notify('Analyzing main component instead of instance...', { timeout: 2000 });
          selectedNode = mainComponent;
        } else {
          throw new Error('This instance has no main component. Please select a component directly.');
        }
      } catch (error) {
        console.error('Error accessing main component:', error);
        throw new Error('Could not access main component. Please select a component directly.');
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

    // Extract component context
    const componentContext = await extractComponentContext(selectedNode);

    // Set up enhanced analysis options with MCP enabled by default
    const enhancedOptions: EnhancedAnalysisOptions = {
      enableMCPEnhancement: true, // Enable MCP enhancement by default
      batchMode: options.batchMode || false,
      enableAudit: options.enableAudit !== false, // Enable by default
      includeTokenAnalysis: options.includeTokenAnalysis !== false, // Enable by default
      ...options // Override with any user-specified options
    };

    // Show loading notification
    figma.notify('Performing enhanced analysis with design systems knowledge...', { timeout: 3000 });

    // Use the new MCP-enhanced analysis flow
    const result = await processEnhancedAnalysis(
      componentContext,
      storedApiKey,
      selectedModel,
      enhancedOptions,
      selectedProvider
    );

    // Store for later use
    lastAnalyzedMetadata = result.metadata;
    lastAnalyzedNode = selectedNode;

    // Send results to UI, including the analyzed node ID for fix operations
    sendMessageToUI('enhanced-analysis-result', {
      ...result,
      analyzedNodeId: selectedNode.id
    });
    figma.notify('Enhanced analysis complete! Check the results panel.', { timeout: 3000 });

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
        const componentContext = await extractComponentContext(node);
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
        const batchLlmResponse = await callProvider(selectedProvider, storedApiKey!, {
          prompt: deterministicPrompt,
          model: selectedModel,
          maxTokens: 2048,
          temperature: 0.1,
        });
        const rawEnhancedData = extractJSONFromResponse(batchLlmResponse.content);

        // Filter out development-focused recommendations
        const enhancedData = filterDevelopmentRecommendations(rawEnhancedData);

        // Process and validate the result
        let result = await processAnalysisResult(enhancedData, componentContext, { batchMode: true });

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
    await clearProviderKey(selectedProvider);
    // Also clear legacy key for backward compatibility
    await figma.clientStorage.setAsync('claude-api-key', '');
    const providerName = getProvider(selectedProvider).name;
    sendMessageToUI('api-key-cleared', { success: true });
    figma.notify(`${providerName} API key cleared`, { timeout: 2000 });
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
      const providerName = getProvider(selectedProvider).name;
      throw new Error(`API key not found. Please save your ${providerName} API key first.`);
    }

    // Send loading state
    sendMessageToUI('chat-response-loading', { isLoading: true });

    // Get current component context if available
    const componentContext = getCurrentComponentContext();

    // Query the MCP server for design systems knowledge
    const mcpResponse = await queryDesignSystemsMCP(data.message);

    // Create enhanced prompt with MCP context and component context
    const enhancedPrompt = createChatPromptWithContext(data.message, mcpResponse, data.history, componentContext);

    // Get response from LLM provider
    const llmResponse = await callProvider(selectedProvider, storedApiKey, {
      prompt: enhancedPrompt,
      model: selectedModel,
      maxTokens: 2048,
      temperature: 0.7,
    });

    // Send response back to UI
    const chatResponse: ChatResponse = {
      message: llmResponse.content,
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
 * Select a specific node in Figma
 */
async function handleSelectNode(data: { nodeId: string }): Promise<void> {
  try {
    console.log('🎯 Attempting to select node:', data.nodeId);

    // Find the node by ID
    const node = await figma.getNodeByIdAsync(data.nodeId);

    if (!node) {
      console.warn('⚠️ Node not found:', data.nodeId);
      figma.notify('Node not found - it may have been deleted or moved', { error: true });
      return;
    }

    // Check if the node is on the current page
    if (!isNodeOnCurrentPage(node)) {
      console.warn('⚠️ Node is not on current page:', data.nodeId);
      figma.notify('Node is on a different page', { error: true });
      return;
    }

    // Select the node
    figma.currentPage.selection = [node as SceneNode];

    // Zoom to the node for better visibility
    figma.viewport.scrollAndZoomIntoView([node as SceneNode]);

    console.log('✅ Successfully selected and zoomed to node:', node.name);
    figma.notify(`Selected "${node.name}"`, { timeout: 2000 });

  } catch (error) {
    console.error('Error selecting node:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    figma.notify(`Failed to select node: ${errorMessage}`, { error: true });
  }
}

/**
 * Check if a node is on the current page
 */
function isNodeOnCurrentPage(node: BaseNode): boolean {
  try {
    // For most nodes, check if they're descendants of the current page
    let currentNode: BaseNode | null = node;
    const maxDepth = 50; // Prevent infinite loops
    let depth = 0;

    while (currentNode && currentNode.parent && depth < maxDepth) {
      currentNode = currentNode.parent;
      depth++;

      // If we reached the current page, the node is on this page
      if (currentNode === figma.currentPage) {
        return true;
      }
    }

    // If we reached the root and it's the current page
    if (currentNode === figma.currentPage) {
      return true;
    }

    // Additional check: if the node is directly on the current page
    if (node.parent === figma.currentPage) {
      return true;
    }

    // For component instances and other special cases,
    // check if any page contains this node
    const allPages = figma.root.children.filter(child => child.type === 'PAGE');
    const currentPage = figma.currentPage;

    // If this is a component or component set, it might be in the current page
    if (node.type === 'COMPONENT' || node.type === 'COMPONENT_SET') {
      // Try to find this node in the current page
      return findNodeInPage(currentPage, node.id);
    }

    return false;
  } catch (error) {
    console.warn('Error checking node page:', error);
    // If we can't determine, assume it's not on the current page to be safe
    return false;
  }
}

/**
 * Helper function to find a node by ID within a page
 */
function findNodeInPage(page: PageNode, nodeId: string): boolean {
  try {
    const allNodes = page.findAll();
    return allNodes.some(node => node.id === nodeId);
  } catch (error) {
    return false;
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
    // Get the last analyzed metadata and node from module state
    const lastMetadata = lastAnalyzedMetadata;
    const lastNode = lastAnalyzedNode;

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
    // Load multi-provider configuration (handles legacy migration automatically)
    const config = await loadProviderConfig();
    selectedProvider = config.providerId;
    selectedModel = config.modelId;

    if (config.apiKey) {
      storedApiKey = config.apiKey;
      sendMessageToUI('api-key-status', {
        hasKey: true,
        provider: selectedProvider,
        model: selectedModel
      });
    } else {
      sendMessageToUI('api-key-status', {
        hasKey: false,
        provider: selectedProvider,
        model: selectedModel
      });
    }

    console.log(`Plugin initialized with provider: ${selectedProvider}, model: ${selectedModel}`);

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

// ============================================================================
// Auto-Fix Handler Functions
// ============================================================================

/**
 * Preview a fix without applying it
 * @param data - The fix preview request containing node ID, type, and property info
 */
async function handlePreviewFix(data: FixPreviewRequest): Promise<void> {
  try {
    const node = await figma.getNodeByIdAsync(data.nodeId);

    if (!node || !('type' in node)) {
      sendMessageToUI('fix-preview', {
        success: false,
        error: 'Node not found or is not a valid scene node'
      });
      return;
    }

    const sceneNode = node as SceneNode;
    let preview: FixPreview | RenamePreview | null = null;

    if (data.type === 'token') {
      // Token fix preview
      if (!data.propertyPath) {
        sendMessageToUI('fix-preview', {
          success: false,
          error: 'Property path is required for token fixes'
        });
        return;
      }

      // Find matching variable for the property
      // For preview, we need to find a matching token first
      const matches = data.propertyPath.match(/^(fills|strokes)\[(\d+)\]$/);
      if (matches) {
        // Color property - find matching color variable
        const colorMatches = await findMatchingColorVariable(data.suggestedValue || '', 0.1);
        if (colorMatches.length > 0) {
          preview = await previewTokenFix(sceneNode, data.propertyPath, colorMatches[0].variableId);
        }
      } else {
        // Spacing property - find matching spacing variable
        const pixelValue = parseFloat(data.suggestedValue || '0');
        const spacingMatches = await findMatchingSpacingVariable(pixelValue, 2);
        if (spacingMatches.length > 0) {
          preview = await previewTokenFix(sceneNode, data.propertyPath, spacingMatches[0].variableId);
        }
      }

      if (preview) {
        sendMessageToUI('fix-preview', { success: true, preview });
      } else {
        sendMessageToUI('fix-preview', {
          success: false,
          error: 'No matching token found for this value'
        });
      }
    } else if (data.type === 'naming') {
      // Naming fix preview
      const suggestedName = data.suggestedValue || suggestLayerName(sceneNode);
      preview = previewRename(sceneNode, suggestedName);
      sendMessageToUI('fix-preview', { success: true, preview });
    } else {
      sendMessageToUI('fix-preview', {
        success: false,
        error: `Unknown fix type: ${data.type}`
      });
    }
  } catch (error) {
    console.error('Error previewing fix:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    sendMessageToUI('fix-preview', { success: false, error: errorMessage });
  }
}

/**
 * Apply a token binding fix (color or spacing)
 * @param data - The fix request containing node ID, property path, and token ID
 */
async function handleApplyTokenFix(data: FixRequest): Promise<void> {
  try {
    const node = await figma.getNodeByIdAsync(data.nodeId);

    if (!node || !('type' in node)) {
      sendMessageToUI('fix-applied', {
        success: false,
        error: 'Node not found or is not a valid scene node'
      });
      figma.notify('Failed to apply fix: Node not found', { error: true });
      return;
    }

    const sceneNode = node as SceneNode;

    if (!data.propertyPath) {
      sendMessageToUI('fix-applied', {
        success: false,
        error: 'Property path is required for token fixes'
      });
      figma.notify('Failed to apply fix: Property path missing', { error: true });
      return;
    }

    if (!data.tokenId) {
      sendMessageToUI('fix-applied', {
        success: false,
        error: 'Token ID is required for token fixes'
      });
      figma.notify('Failed to apply fix: Token ID missing', { error: true });
      return;
    }

    let result: FixResult;

    // Determine if this is a color or spacing fix based on property path
    const isColorProperty = /^(fills|strokes)\[\d+\]$/.test(data.propertyPath);

    if (isColorProperty) {
      // Apply color fix
      result = await applyColorFix(sceneNode, data.propertyPath, data.tokenId);
    } else {
      // Apply spacing fix
      result = await applySpacingFix(sceneNode, data.propertyPath, data.tokenId);
    }

    sendMessageToUI('fix-applied', result);

    if (result.success) {
      figma.notify(`Applied token to ${sceneNode.name}`, { timeout: 2000 });
    } else {
      figma.notify(`Failed to apply token: ${result.error || result.message}`, { error: true });
    }
  } catch (error) {
    console.error('Error applying token fix:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    sendMessageToUI('fix-applied', { success: false, error: errorMessage });
    figma.notify(`Failed to apply fix: ${errorMessage}`, { error: true });
  }
}

/**
 * Apply a layer rename fix
 * @param data - The fix request containing node ID and new name
 */
async function handleApplyNamingFix(data: FixRequest): Promise<void> {
  try {
    const node = await figma.getNodeByIdAsync(data.nodeId);

    if (!node || !('type' in node)) {
      sendMessageToUI('fix-applied', {
        success: false,
        error: 'Node not found or is not a valid scene node'
      });
      figma.notify('Failed to rename: Node not found', { error: true });
      return;
    }

    const sceneNode = node as SceneNode;
    const newName = data.newValue || suggestLayerName(sceneNode);
    const oldName = sceneNode.name;

    const success = renameLayer(sceneNode, newName);

    const result = {
      success,
      message: success
        ? `Renamed "${oldName}" to "${newName}"`
        : `Failed to rename layer`,
      oldName,
      newName: success ? newName : oldName
    };

    sendMessageToUI('fix-applied', result);

    if (success) {
      figma.notify(`Renamed "${oldName}" to "${newName}"`, { timeout: 2000 });
    } else {
      figma.notify('Failed to rename layer', { error: true });
    }
  } catch (error) {
    console.error('Error applying naming fix:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    sendMessageToUI('fix-applied', { success: false, error: errorMessage });
    figma.notify(`Failed to rename: ${errorMessage}`, { error: true });
  }
}

/**
 * Apply multiple fixes in a batch
 * @param data - The batch fix request containing an array of fixes
 */
async function handleApplyBatchFix(data: BatchFixRequest): Promise<void> {
  try {
    const results: Array<{
      nodeId: string;
      success: boolean;
      message: string;
      error?: string;
    }> = [];

    let successCount = 0;
    let errorCount = 0;

    for (const fix of data.fixes) {
      try {
        const node = await figma.getNodeByIdAsync(fix.nodeId);

        if (!node || !('type' in node)) {
          results.push({
            nodeId: fix.nodeId,
            success: false,
            message: 'Node not found',
            error: 'Node not found or is not a valid scene node'
          });
          errorCount++;
          continue;
        }

        const sceneNode = node as SceneNode;

        if (fix.type === 'token') {
          // Apply token fix
          if (!fix.propertyPath) {
            results.push({
              nodeId: fix.nodeId,
              success: false,
              message: 'Missing property path',
              error: 'Token fixes require a propertyPath'
            });
            errorCount++;
            continue;
          }

          let tokenId = fix.tokenId;
          const isColorProperty = /^(fills|strokes)\[\d+\]$/.test(fix.propertyPath);

          // If no tokenId provided, try to find a matching variable
          if (!tokenId && fix.newValue) {
            try {
              if (isColorProperty) {
                const colorMatches = await findMatchingColorVariable(fix.newValue, 0.1);
                if (colorMatches.length > 0) {
                  tokenId = colorMatches[0].variableId;
                }
              } else {
                const pixelValue = parseFloat(fix.newValue);
                if (!isNaN(pixelValue)) {
                  const spacingMatches = await findMatchingSpacingVariable(pixelValue, 2);
                  if (spacingMatches.length > 0) {
                    tokenId = spacingMatches[0].variableId;
                  }
                }
              }
            } catch (matchError) {
              console.warn('Could not find matching variable:', matchError);
            }
          }

          if (!tokenId) {
            results.push({
              nodeId: fix.nodeId,
              success: false,
              message: 'No matching design token found for this value',
              error: 'Could not find a matching variable to bind'
            });
            errorCount++;
            continue;
          }

          let result: FixResult;

          if (isColorProperty) {
            result = await applyColorFix(sceneNode, fix.propertyPath, tokenId);
          } else {
            result = await applySpacingFix(sceneNode, fix.propertyPath, tokenId);
          }

          results.push({
            nodeId: fix.nodeId,
            success: result.success,
            message: result.message,
            error: result.error
          });

          if (result.success) {
            successCount++;
          } else {
            errorCount++;
          }
        } else if (fix.type === 'naming') {
          // Apply naming fix
          const newName = fix.newValue || suggestLayerName(sceneNode);
          const oldName = sceneNode.name;
          const success = renameLayer(sceneNode, newName);

          results.push({
            nodeId: fix.nodeId,
            success,
            message: success
              ? `Renamed "${oldName}" to "${newName}"`
              : 'Failed to rename layer'
          });

          if (success) {
            successCount++;
          } else {
            errorCount++;
          }
        } else {
          results.push({
            nodeId: fix.nodeId,
            success: false,
            message: `Unknown fix type: ${fix.type}`,
            error: `Unsupported fix type: ${fix.type}`
          });
          errorCount++;
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        results.push({
          nodeId: fix.nodeId,
          success: false,
          message: 'Error applying fix',
          error: errorMessage
        });
        errorCount++;
      }
    }

    const summary = {
      total: data.fixes.length,
      success: successCount,
      errors: errorCount,
      results
    };

    sendMessageToUI('batch-fix-applied', summary);

    if (errorCount === 0) {
      figma.notify(`Applied ${successCount} fix${successCount !== 1 ? 'es' : ''} successfully`, { timeout: 2000 });
    } else if (successCount > 0) {
      figma.notify(`Applied ${successCount} fix${successCount !== 1 ? 'es' : ''}, ${errorCount} failed`, { timeout: 3000 });
    } else {
      figma.notify(`Failed to apply ${errorCount} fix${errorCount !== 1 ? 'es' : ''}`, { error: true });
    }
  } catch (error) {
    console.error('Error applying batch fixes:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    sendMessageToUI('batch-fix-applied', {
      total: data.fixes.length,
      success: 0,
      errors: data.fixes.length,
      error: errorMessage
    });
    figma.notify(`Batch fix failed: ${errorMessage}`, { error: true });
  }
}

/**
 * Update a component's description
 * @param data - Object containing nodeId and description string
 */
async function handleUpdateDescription(data: { nodeId: string; description: string }): Promise<void> {
  try {
    const node = await figma.getNodeByIdAsync(data.nodeId);

    if (!node) {
      sendMessageToUI('description-updated', {
        success: false,
        error: 'Node not found'
      });
      figma.notify('Failed to update description: Node not found', { error: true });
      return;
    }

    // Only COMPONENT and COMPONENT_SET nodes have writable descriptions
    if (node.type !== 'COMPONENT' && node.type !== 'COMPONENT_SET') {
      sendMessageToUI('description-updated', {
        success: false,
        error: 'Node is not a component or component set'
      });
      figma.notify('Description can only be set on components', { error: true });
      return;
    }

    const componentNode = node as ComponentNode | ComponentSetNode;
    const oldDescription = componentNode.description;
    componentNode.description = data.description;

    sendMessageToUI('description-updated', {
      success: true,
      oldDescription,
      newDescription: data.description
    });
    figma.notify('Component description updated', { timeout: 2000 });
  } catch (error) {
    console.error('Error updating description:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    sendMessageToUI('description-updated', {
      success: false,
      error: errorMessage
    });
    figma.notify(`Failed to update description: ${errorMessage}`, { error: true });
  }
}

/**
 * Handle adding a component property via the Figma Plugin API
 */
async function handleAddComponentProperty(data: {
  nodeId: string;
  propertyName: string;
  propertyType: string;
  defaultValue: string;
  variantOptions?: string[];
}): Promise<void> {
  try {
    const { nodeId, propertyName, propertyType, defaultValue } = data;
    const node = await figma.getNodeByIdAsync(nodeId);

    if (!node) {
      sendMessageToUI('property-added', {
        success: false,
        propertyName,
        message: 'Node not found'
      });
      figma.notify('Node not found', { error: true });
      return;
    }

    // Resolve to the target component node.
    // For variant properties, we must target the parent ComponentSet, not
    // a child variant Component — the Figma API only supports adding VARIANT
    // properties on ComponentSetNode.
    let targetNode: ComponentNode | ComponentSetNode | null = null;

    if (node.type === 'COMPONENT') {
      const component = node as ComponentNode;
      if (component.parent && component.parent.type === 'COMPONENT_SET') {
        targetNode = component.parent as ComponentSetNode;
      } else {
        targetNode = component;
      }
    } else if (node.type === 'COMPONENT_SET') {
      targetNode = node as ComponentSetNode;
    } else if (node.type === 'INSTANCE') {
      const mainComponent = await (node as InstanceNode).getMainComponentAsync();
      if (mainComponent) {
        if (mainComponent.parent && mainComponent.parent.type === 'COMPONENT_SET') {
          targetNode = mainComponent.parent as ComponentSetNode;
        } else {
          targetNode = mainComponent;
        }
      }
    }

    if (!targetNode) {
      sendMessageToUI('property-added', {
        success: false,
        propertyName,
        message: 'Selected node is not a component'
      });
      figma.notify('Selected node is not a component', { error: true });
      return;
    }

    // Check for duplicate property names (strip #id:suffix from keys)
    const existingDefs = targetNode.componentPropertyDefinitions;
    for (const key of Object.keys(existingDefs)) {
      const baseName = key.replace(/#\d+:\d+$/, '');
      if (baseName.toLowerCase() === propertyName.toLowerCase()) {
        sendMessageToUI('property-added', {
          success: false,
          propertyName,
          message: `Property "${propertyName}" already exists`
        });
        figma.notify(`Property "${propertyName}" already exists`, { error: true });
        return;
      }
    }

    // Map recommendation types to Figma property types
    let figmaType: ComponentPropertyType;
    switch (propertyType.toLowerCase()) {
      case 'boolean':
        figmaType = 'BOOLEAN';
        break;
      case 'text':
        figmaType = 'TEXT';
        break;
      case 'slot':
        figmaType = 'INSTANCE_SWAP';
        break;
      case 'variant':
        if (targetNode.type === 'COMPONENT_SET') {
          figmaType = 'VARIANT';
        } else {
          figmaType = 'TEXT';
        }
        break;
      default:
        figmaType = 'TEXT';
    }

    targetNode.addComponentProperty(propertyName, figmaType, defaultValue);

    // For VARIANT properties on a ComponentSet with multiple options,
    // create a staging frame adjacent to the ComponentSet containing
    // cloned variants for each additional option. Positioning clones
    // inside the ComponentSet is unreliable because Figma's internal
    // layout engine overrides manual x/y placement on children.
    let stagingNote = '';
    if (
      figmaType === 'VARIANT' &&
      targetNode.type === 'COMPONENT_SET' &&
      data.variantOptions &&
      data.variantOptions.length > 1
    ) {
      const componentSet = targetNode as ComponentSetNode;
      const existingChildren = [...componentSet.children] as SceneNode[];
      const additionalOptions = data.variantOptions.slice(1);
      const searchStr = `${propertyName}=${defaultValue}`;

      // Walk up to the topmost frame containing the ComponentSet to get
      // absolute page coordinates (componentSet.x/y are parent-relative)
      const page = figma.currentPage;
      let containerNode: SceneNode = componentSet;
      while (containerNode.parent && containerNode.parent.type !== 'PAGE') {
        containerNode = containerNode.parent as SceneNode;
      }
      const absX = containerNode.absoluteTransform[0][2];
      const absY = containerNode.absoluteTransform[1][2];
      const stagingX = absX;
      const stagingY = absY + containerNode.height + 50;

      const section = figma.createSection();
      section.name = `FigmaLint: ${propertyName} Variants`;
      page.appendChild(section);
      section.x = stagingX;
      section.y = stagingY;

      // Add a label text node inside the section
      const label = figma.createText();
      await figma.loadFontAsync({ family: 'Inter', style: 'Medium' });
      label.fontName = { family: 'Inter', style: 'Medium' };
      label.characters = `New "${propertyName}" variants — drag into the ComponentSet`;
      label.fontSize = 14;
      label.fills = [{ type: 'SOLID', color: { r: 0.4, g: 0.4, b: 0.4 } }];
      section.appendChild(label);
      label.x = 24;
      label.y = 24;

      // Clone existing children for each additional option value
      const padding = 24;
      const childGap = 32;
      let currentY = label.y + label.height + 24;
      let maxWidth = label.width + padding * 2;

      for (const option of additionalOptions) {
        const replaceStr = `${propertyName}=${option}`;

        // Add option label
        const optionLabel = figma.createText();
        await figma.loadFontAsync({ family: 'Inter', style: 'Semi Bold' });
        optionLabel.fontName = { family: 'Inter', style: 'Semi Bold' };
        optionLabel.characters = `${propertyName}=${option}`;
        optionLabel.fontSize = 12;
        optionLabel.fills = [{ type: 'SOLID', color: { r: 0.6, g: 0.3, b: 0.9 } }];
        section.appendChild(optionLabel);
        optionLabel.x = padding;
        optionLabel.y = currentY;
        currentY += optionLabel.height + 12;

        // Clone each existing variant child with the new option value
        let rowX = padding;
        let rowMaxHeight = 0;
        for (const child of existingChildren) {
          const clone = child.clone();
          clone.name = clone.name.replace(searchStr, replaceStr);
          section.appendChild(clone);
          clone.x = rowX;
          clone.y = currentY;
          rowX += clone.width + childGap;
          rowMaxHeight = Math.max(rowMaxHeight, clone.height);
        }
        maxWidth = Math.max(maxWidth, rowX - childGap + padding);
        currentY += rowMaxHeight + childGap;
      }

      // Resize the section to fit all content
      section.resizeWithoutConstraints(
        Math.max(maxWidth, 400),
        currentY + padding
      );

      stagingNote = ` — new variants created in staging section to the right`;
    }

    sendMessageToUI('property-added', {
      success: true,
      propertyName,
      message: `Property "${propertyName}" added successfully${stagingNote}`
    });
    figma.notify(`Property "${propertyName}" added${stagingNote ? ' (see staging section)' : ''}`, { timeout: 3000 });
  } catch (error) {
    console.error('Error adding component property:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    sendMessageToUI('property-added', {
      success: false,
      propertyName: data.propertyName,
      message: errorMessage
    });
    figma.notify(`Failed to add property: ${errorMessage}`, { error: true });
  }
}
