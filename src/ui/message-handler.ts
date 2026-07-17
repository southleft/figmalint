/// <reference types="@figma/plugin-typings" />

import { PluginMessage, UIMessageType, EnhancedAnalysisOptions, ChatMessage, ChatResponse } from '../types';
import { sendMessageToUI, isValidNodeForAnalysis } from '../utils/figma-helpers';
import { processEnhancedAnalysis, processAnalysisResult, extractComponentContext, enrichTokensWithMatches } from '../core/component-analyzer';
import { extractDesignTokensFromNode } from '../core/token-analyzer';
import { extractJSONFromResponse, filterDevelopmentRecommendations } from '../api/claude';
import { consistencyEngine } from '../core/consistency-engine';
import {
  ProviderId,
  LLMError,
  callProvider,
  getProvider,
  detectProviderFromKey,
  loadProviderConfig,
  saveProviderConfig,
  saveOpenAIEndpointConfig,
  clearProviderKey,
  migrateLegacyStorage,
} from '../api/providers';
import {
  previewFix as previewTokenFix,
  applyColorFix,
  applySpacingFix,
  findMatchingColorVariable,
  findBestMatchingVariable,
  colorFieldFromPropertyPath,
  FixPreview,
  FixResult,
} from '../fixes/token-fixer';
import {
  previewRename,
  renameLayer,
  suggestLayerName,
  applyNamingConvention,
  NamingStrategy,
  RenamePreview,
} from '../fixes/naming-fixer';
import { FixRequest, FixPreviewRequest, BatchFixRequest } from '../types';

// Plugin state
let storedApiKey: string | null = null;
let selectedModel = 'claude-sonnet-5'; // Default to Claude Sonnet 5
let selectedProvider: ProviderId = 'anthropic'; // Default to Anthropic

// Validate API key format based on provider
function isValidApiKeyFormat(apiKey: string, provider: ProviderId = selectedProvider): boolean {
  const trimmed = apiKey?.trim() || '';

  switch (provider) {
    case 'anthropic':
      // sk-ant-admin... keys are Admin API keys — valid format, but they cannot
      // call Claude models. Rejected here so handleSaveApiKey surfaces the
      // detailed provider message instead of failing with a 401 at analyze time.
      return trimmed.startsWith('sk-ant-') && !trimmed.startsWith('sk-ant-admin') && trimmed.length >= 40;
    case 'openai':
      return trimmed.startsWith('sk-') && trimmed.length >= 20;
    case 'google':
      return (
        (trimmed.startsWith('AIza') || trimmed.startsWith('AQ.')) &&
        trimmed.length >= 30 &&
        trimmed.length <= 100
      );
    default:
      return false;
  }
}

// Plugin-level state for storing last analyzed component
let lastAnalyzedMetadata: any = null;
let lastAnalyzedNode: any = null;

// Id of the analysis the UI is currently waiting on. Cleared by
// 'cancel-analysis'; a finished analysis whose id no longer matches is
// dropped instead of overwriting the UI.
let activeAnalysisRequestId: string | null = null;

// clientStorage key for the persisted last analysis (restored across sessions
// so closing the plugin doesn't discard a paid LLM analysis).
const LAST_ANALYSIS_STORAGE_KEY = 'figmalint-last-analysis';

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
        await handleSaveApiKey(data.apiKey, data.model, data.provider, data.customEndpoint, data.customDeployment);
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
      case 'cancel-analysis':
        activeAnalysisRequestId = null;
        sendMessageToUI('analysis-cancelled', {});
        break;
      case 'restore-last-analysis':
        await handleRestoreLastAnalysis();
        break;
      case 'refresh-tokens':
        await handleRefreshTokens();
        break;
      case 'preview-naming-strategy':
        await handlePreviewNamingStrategy(data);
        break;
      case 'apply-naming-strategy':
        await handleApplyNamingStrategy(data);
        break;
      case 'preview-batch-fix':
        await handlePreviewBatchFix(data);
        break;
      case 'generate-instance-sheet':
        await handleGenerateInstanceSheet(data);
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

    // A custom OpenAI endpoint (Azure) changes how the saved key is validated:
    // Azure/gateway keys don't follow the `sk-` convention.
    const openaiEndpoint = config.openaiEndpoint;
    const hasCustomEndpoint = config.providerId === 'openai' && !!openaiEndpoint.endpoint;
    const savedKeyUsable = !!config.apiKey && (
      hasCustomEndpoint ? config.apiKey.trim().length > 0 : isValidApiKeyFormat(config.apiKey, config.providerId)
    );

    // Check in-memory first
    if (storedApiKey) {
      sendMessageToUI('api-key-status', {
        hasKey: true,
        provider: selectedProvider,
        model: selectedModel,
        openaiEndpoint
      });
      return;
    }

    // Check persistent storage for current provider
    if (savedKeyUsable) {
      storedApiKey = config.apiKey;
      sendMessageToUI('api-key-status', {
        hasKey: true,
        provider: selectedProvider,
        model: selectedModel,
        openaiEndpoint
      });
    } else {
      sendMessageToUI('api-key-status', {
        hasKey: false,
        provider: selectedProvider,
        model: selectedModel,
        openaiEndpoint
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
async function handleSaveApiKey(
  apiKey: string,
  model?: string,
  provider?: string,
  customEndpoint?: string,
  customDeployment?: string
): Promise<void> {
  try {
    // Update provider if specified
    const providerId = (provider as ProviderId) || selectedProvider;

    // A custom OpenAI-compatible endpoint (Azure OpenAI / Azure AI Foundry) uses
    // keys that don't follow the `sk-` convention, so the format check is skipped
    // for that case — we only require a non-empty key.
    const hasCustomEndpoint = providerId === 'openai' && !!(customEndpoint && customEndpoint.trim());

    // Validate API key format for the provider
    if (hasCustomEndpoint) {
      if (!apiKey || !apiKey.trim()) {
        throw new Error('Please enter your Azure / OpenAI-compatible API key.');
      }
    } else if (!isValidApiKeyFormat(apiKey, providerId)) {
      const providerObj = getProvider(providerId);

      // If the prefix matches a different known provider, name both so the user
      // knows exactly which dropdown to switch (rather than guessing at the format).
      const detected = detectProviderFromKey(apiKey);
      if (detected && detected !== providerId) {
        const detectedObj = getProvider(detected);
        throw new Error(
          `This looks like a ${detectedObj.name} key (${detectedObj.keyPlaceholder}), but ${providerObj.name} is selected. ` +
          `Switch the AI Provider dropdown to ${detectedObj.name}, or paste a ${providerObj.name} key (${providerObj.keyPlaceholder}).`
        );
      }

      // Use the provider's own validation message when it has one — it carries
      // specifics (e.g. Admin-key explanation) the generic line below lacks.
      const detailed = providerObj.validateApiKey(apiKey);
      throw new Error(
        detailed.error ||
        `Invalid ${providerObj.name} API key format. Expected: ${providerObj.keyPlaceholder}`
      );
    }

    // Persist (or clear) the custom OpenAI endpoint. Only OpenAI supports it; for
    // other providers this is a no-op that also clears any stale config.
    if (providerId === 'openai') {
      await saveOpenAIEndpointConfig(customEndpoint || '', customDeployment || '');
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
  const requestId = options.requestId || `analysis-${Date.now()}`;
  activeAnalysisRequestId = requestId;

  // True when the user cancelled this analysis or started a newer one while
  // we were waiting on the LLM — in that case the result must be dropped.
  const isStale = () => activeAnalysisRequestId !== requestId;

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

    // If the selected node isn't directly analyzable, walk up to find an analyzable ancestor.
    // Prefer component-level ancestors (COMPONENT_SET, COMPONENT, INSTANCE) over plain FRAMEs
    // so that selecting a child layer inside a component bubbles up to the component set.
    if (!isValidNodeForAnalysis(selectedNode)) {
      const componentTypes = new Set(['COMPONENT_SET', 'COMPONENT', 'INSTANCE']);
      let componentAncestor: SceneNode | null = null;
      let frameAncestor: SceneNode | null = null;

      let ancestor: BaseNode | null = selectedNode.parent;
      while (ancestor && 'type' in ancestor) {
        const sceneAncestor = ancestor as SceneNode;
        if (componentTypes.has(sceneAncestor.type) && !componentAncestor) {
          componentAncestor = sceneAncestor;
          break; // Component-level ancestor found, no need to continue
        }
        if (!frameAncestor && isValidNodeForAnalysis(sceneAncestor)) {
          frameAncestor = sceneAncestor; // Track as fallback, keep looking for component
        }
        ancestor = ancestor.parent;
      }

      const bestAncestor = componentAncestor || frameAncestor;
      if (bestAncestor) {
        figma.notify(`Analyzing parent ${bestAncestor.type.toLowerCase()} "${bestAncestor.name}"...`, { timeout: 2000 });
        selectedNode = bestAncestor;
      }
    }

    // Handle instances found via parent traversal
    if (selectedNode.type === 'INSTANCE') {
      const instance = selectedNode as InstanceNode;
      try {
        const mainComponent = await instance.getMainComponentAsync();
        if (mainComponent) {
          figma.notify('Analyzing main component instead of instance...', { timeout: 2000 });
          selectedNode = mainComponent;
        }
      } catch {
        // Fall through to validation below
      }
    }

    // Handle component variants found via parent traversal
    if (selectedNode.type === 'COMPONENT' && selectedNode.parent?.type === 'COMPONENT_SET') {
      const parentComponentSet = selectedNode.parent as ComponentSetNode;
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
      ...options, // Override with any user-specified options
      // Always analyze the resolved node (instance → main component, variant →
      // component set, child layer → analyzable ancestor) — the raw selection
      // may point at a node we deliberately walked away from above.
      node: selectedNode,
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

    if (isStale()) {
      console.log('ℹ️ Dropping analysis result — cancelled or superseded');
      return;
    }

    // Store for later use
    lastAnalyzedMetadata = result.metadata;
    lastAnalyzedNode = selectedNode;

    // Send results to UI, including the analyzed node for fix operations and
    // the results header ("Button — Component Set · analyzed 14:02").
    const payload = {
      ...result,
      analyzedNodeId: selectedNode.id,
      analyzedNode: {
        id: selectedNode.id,
        name: selectedNode.name,
        type: selectedNode.type,
      },
      analyzedAt: Date.now(),
      fromCache: result.fromCache === true,
    };
    sendMessageToUI('enhanced-analysis-result', payload);
    figma.notify(
      result.fromCache
        ? 'Loaded cached analysis (component unchanged).'
        : 'Enhanced analysis complete! Check the results panel.',
      { timeout: 3000 }
    );

    // Persist so reopening the plugin can restore without a paid re-analysis.
    // Results can be large; a failed write (quota) must never fail the analysis.
    try {
      await figma.clientStorage.setAsync(LAST_ANALYSIS_STORAGE_KEY, payload);
    } catch (storageError) {
      console.warn('Could not persist last analysis:', storageError);
    }

  } catch (error) {
    console.error('Error during enhanced analysis:', error);
    if (isStale()) return; // user already cancelled — don't surface the error

    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    figma.notify(`Analysis failed: ${errorMessage}`, { error: true });

    // Structured details let the UI offer targeted recovery (retry countdown
    // for rate limits, portal link for auth errors).
    const structured = error instanceof LLMError
      ? { code: error.code, statusCode: error.statusCode, retryAfterMs: error.retryAfter }
      : {};
    sendMessageToUI('analysis-error', {
      error: errorMessage,
      provider: selectedProvider,
      ...structured,
    });
  } finally {
    if (activeAnalysisRequestId === requestId) {
      activeAnalysisRequestId = null;
    }
  }
}

/** Map a UI strategy string to the NamingStrategy enum (defaults to semantic). */
function toNamingStrategy(value: string | undefined): NamingStrategy {
  const strategies = Object.values(NamingStrategy) as string[];
  return strategies.includes(value || '')
    ? (value as NamingStrategy)
    : NamingStrategy.SEMANTIC;
}

/** Resolve the node naming-strategy operations should target. */
function resolveNamingTarget(): SceneNode {
  const last = lastAnalyzedNode as SceneNode | null;
  if (last && !last.removed) return last;
  const selected = figma.currentPage.selection[0];
  if (!selected) {
    throw new Error('No component selected. Analyze a component first.');
  }
  return selected;
}

/**
 * Dry-run a naming strategy over the analyzed component and return previews.
 */
async function handlePreviewNamingStrategy(data: { strategy?: string; prefix?: string }): Promise<void> {
  try {
    const node = resolveNamingTarget();
    const strategy = toNamingStrategy(data?.strategy);
    const result = applyNamingConvention(
      node,
      { strategy, prefix: data?.prefix },
      // Semantic renames only fix generic names; convention strategies
      // (BEM/kebab/…) reformat every layer.
      { dryRun: true, onlyGeneric: strategy === NamingStrategy.SEMANTIC }
    );
    sendMessageToUI('naming-strategy-preview', {
      strategy,
      previews: result.previews.filter((p) => p.willChange),
      errors: result.errors,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    sendMessageToUI('naming-strategy-preview', { strategy: data?.strategy, previews: [], errors: [errorMessage] });
  }
}

/**
 * Apply a naming strategy over the analyzed component.
 */
async function handleApplyNamingStrategy(data: { strategy?: string; prefix?: string }): Promise<void> {
  try {
    const node = resolveNamingTarget();
    const strategy = toNamingStrategy(data?.strategy);
    const result = applyNamingConvention(
      node,
      { strategy, prefix: data?.prefix },
      { dryRun: false, onlyGeneric: strategy === NamingStrategy.SEMANTIC }
    );
    sendMessageToUI('naming-strategy-applied', {
      strategy,
      renamed: result.renamed,
      skipped: result.skipped,
      errors: result.errors,
    });
    figma.notify(`Renamed ${result.renamed} layer${result.renamed === 1 ? '' : 's'} (${strategy})`, { timeout: 3000 });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    sendMessageToUI('naming-strategy-applied', { strategy: data?.strategy, renamed: 0, skipped: 0, errors: [errorMessage] });
  }
}

/**
 * Resolve which design token each pending batch fix will bind to, so the
 * Fix All modal can show "#FF6633 → color/brand/primary" instead of asking
 * the user to confirm blind. Resolutions are keyed by `${value}|${property}`.
 */
async function handlePreviewBatchFix(data: { fixes?: Array<{ nodeId: string; propertyPath?: string; newValue?: string }> }): Promise<void> {
  const resolutions: Record<string, { tokenId: string; tokenName: string; collectionName: string } | null> = {};
  try {
    for (const fix of data?.fixes || []) {
      if (!fix.propertyPath || !fix.newValue) continue;
      const key = `${fix.newValue}|${fix.propertyPath}`;
      if (key in resolutions) continue;

      try {
        const isColorProperty = /^(fills|strokes)(\[\d+\])?$/.test(fix.propertyPath);
        let matches;
        if (isColorProperty) {
          matches = await findMatchingColorVariable(fix.newValue, 0.1, colorFieldFromPropertyPath(fix.propertyPath));
        } else {
          const pixelValue = parseFloat(fix.newValue);
          matches = isNaN(pixelValue) ? [] : await findBestMatchingVariable(pixelValue, fix.propertyPath, 2);
        }
        resolutions[key] = matches.length > 0
          ? {
              tokenId: matches[0].variableId,
              tokenName: matches[0].variableName,
              collectionName: matches[0].collectionName,
            }
          : null;
      } catch {
        resolutions[key] = null;
      }
    }
    sendMessageToUI('batch-fix-preview', { resolutions });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    sendMessageToUI('batch-fix-preview', { resolutions, error: errorMessage });
  }
}

/**
 * Restore the persisted last analysis (no LLM call).
 */
async function handleRestoreLastAnalysis(): Promise<void> {
  try {
    const saved = await figma.clientStorage.getAsync(LAST_ANALYSIS_STORAGE_KEY) as Record<string, unknown> | undefined;
    if (!saved) {
      sendMessageToUI('restore-unavailable', {});
      return;
    }
    sendMessageToUI('enhanced-analysis-result', { ...saved, restored: true });
  } catch (error) {
    console.warn('Could not restore last analysis:', error);
    sendMessageToUI('restore-unavailable', {});
  }
}

/**
 * Lightweight post-fix refresh: re-extract and re-match design tokens only
 * (no LLM round trip), so the Token Analysis section reflects applied fixes.
 */
async function handleRefreshTokens(): Promise<void> {
  try {
    const node = (lastAnalyzedNode as SceneNode | null) && !(lastAnalyzedNode as SceneNode).removed
      ? lastAnalyzedNode as SceneNode
      : figma.currentPage.selection[0];
    if (!node) {
      throw new Error('No component to refresh. Select the component and re-analyze.');
    }

    const tokens = await extractDesignTokensFromNode(node);
    await enrichTokensWithMatches(tokens);
    sendMessageToUI('tokens-refreshed', { tokens, analyzedNodeId: node.id });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    sendMessageToUI('tokens-refresh-error', { error: errorMessage });
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
          maxTokens: 4096,
          temperature: 0.1,
        });
        const rawEnhancedData = extractJSONFromResponse(batchLlmResponse.content);

        // Filter out development-focused recommendations
        const enhancedData = filterDevelopmentRecommendations(rawEnhancedData);

        // Process and validate the result
        let result = await processAnalysisResult(enhancedData, componentContext, { batchMode: true, node }, {
          tokens: tokenAnalysis,
        });

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
      maxTokens: 4096,
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

    // The parent walk above is exhaustive for attached nodes (its 50-level cap
    // exceeds any realistic Figma tree), so if it didn't reach the current
    // page, the node isn't on it. The previous fallback scanned every node on
    // the page (page.findAll()) just to re-answer the same question.
    return false;
  } catch (error) {
    console.warn('Error checking node page:', error);
    // If we can't determine, assume it's not on the current page to be safe
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

    // Keep the UI in sync with the canvas selection: reveals the batch-mode
    // toggle for multi-selections, and drives the "Will analyze: X" hint +
    // Analyze-button enablement for single selections.
    const notifySelectionChange = () => {
      const selection = figma.currentPage.selection;
      const components = selection
        .filter((node) => isValidNodeForAnalysis(node))
        .map((node) => ({ id: node.id, name: node.name, type: node.type }));

      // A child layer inside a component is analyzable too — the analyze
      // handler walks up to the nearest component/frame ancestor.
      const hasAnalyzableAncestor = (node: SceneNode): boolean => {
        let ancestor: BaseNode | null = node.parent;
        while (ancestor && 'type' in ancestor) {
          const sceneAncestor = ancestor as SceneNode;
          if (isValidNodeForAnalysis(sceneAncestor)) return true;
          ancestor = ancestor.parent;
        }
        return false;
      };

      const first = selection[0];
      const primary = first
        ? {
            id: first.id,
            name: first.name,
            type: first.type,
            isValid: isValidNodeForAnalysis(first) || hasAnalyzableAncestor(first),
          }
        : null;

      sendMessageToUI('batch-selection-update', {
        components,
        primary,
        count: selection.length,
      });
    };
    figma.on('selectionchange', notifySelectionChange);
    notifySelectionChange();

    // Let the UI offer restoring the previous session's analysis.
    try {
      const saved = await figma.clientStorage.getAsync(LAST_ANALYSIS_STORAGE_KEY) as {
        analyzedNode?: { name?: string };
        analyzedAt?: number;
      } | undefined;
      if (saved && saved.analyzedNode?.name) {
        sendMessageToUI('last-analysis-available', {
          nodeName: saved.analyzedNode.name,
          analyzedAt: saved.analyzedAt || null,
        });
      }
    } catch (storageError) {
      console.warn('Could not check for saved analysis:', storageError);
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
      const matches = data.propertyPath.match(/^(fills|strokes)(\[(\d+)\])?$/);
      if (matches) {
        // Color property - find matching color variable
        // Normalize property path to include index (default to [0])
        const normalizedPath = matches[2] ? data.propertyPath : `${matches[1]}[0]`;
        const colorMatches = await findMatchingColorVariable(data.suggestedValue || '', 0.1, colorFieldFromPropertyPath(data.propertyPath));
        if (colorMatches.length > 0) {
          preview = await previewTokenFix(sceneNode, normalizedPath, colorMatches[0].variableId);
        }
      } else {
        // Spacing property - find matching variable with property-aware ranking
        const pixelValue = parseFloat(data.suggestedValue || '0');
        const spacingMatches = await findBestMatchingVariable(pixelValue, data.propertyPath || '', 2);
        if (spacingMatches.length > 0) {
          preview = await previewTokenFix(sceneNode, data.propertyPath, spacingMatches[0].variableId);
        }
      }

      if (preview) {
        const fixPreview = preview as FixPreview;
        sendMessageToUI('fix-preview', {
          success: true,
          type: 'token',
          nodeId: fixPreview.nodeId,
          nodeName: fixPreview.nodeName,
          propertyPath: fixPreview.propertyPath,
          beforeValue: fixPreview.beforeValue,
          afterValue: fixPreview.afterValue,
          tokenId: fixPreview.tokenId,
          tokenName: fixPreview.tokenName,
        });
      } else {
        sendMessageToUI('fix-preview', {
          success: false,
          error: 'No matching token found. Add a variable with this value to your design tokens to enable auto-fix.'
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
    const isColorProperty = /^(fills|strokes)(\[\d+\])?$/.test(data.propertyPath);
    // Normalize property path to include index (default to [0])
    const normalizedPath = isColorProperty && !/\[\d+\]$/.test(data.propertyPath)
      ? `${data.propertyPath}[0]` : data.propertyPath;

    if (isColorProperty) {
      // Apply color fix
      result = await applyColorFix(sceneNode, normalizedPath, data.tokenId);
    } else {
      // Apply spacing fix
      result = await applySpacingFix(sceneNode, data.propertyPath, data.tokenId);
    }

    sendMessageToUI('fix-applied', {
      ...result,
      fixType: 'token',
      nodeId: data.nodeId,
      propertyPath: data.propertyPath
    });

    if (result.success) {
      figma.notify(`Applied token to ${sceneNode.name}`, { timeout: 2000 });
    } else {
      figma.notify(`Failed to apply token: ${result.error || result.message}`, { error: true });
    }
  } catch (error) {
    console.error('Error applying token fix:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    sendMessageToUI('fix-applied', { success: false, error: errorMessage, fixType: 'token', nodeId: data.nodeId });
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

    // Skip if name is already the target value
    if (oldName === newName) {
      sendMessageToUI('fix-applied', {
        success: true,
        fixType: 'naming',
        nodeId: data.nodeId,
        message: `Layer already named "${newName}"`,
        oldName,
        newName
      });
      figma.notify(`Layer already named "${newName}"`, { timeout: 2000 });
      return;
    }

    const success = renameLayer(sceneNode, newName);

    const result = {
      success,
      fixType: 'naming',
      nodeId: data.nodeId,
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
      fixType?: string;
      propertyPath?: string;
      newName?: string;
    }> = [];

    let successCount = 0;
    let errorCount = 0;
    let processedCount = 0;
    const totalFixes = data.fixes.length;

    for (const fix of data.fixes) {
      processedCount++;
      // Incremental progress so large batches don't look hung after the modal closes
      sendMessageToUI('batch-fix-progress', { current: processedCount, total: totalFixes });
      try {
        const node = await figma.getNodeByIdAsync(fix.nodeId);

        if (!node || !('type' in node)) {
          results.push({
            nodeId: fix.nodeId,
            success: false,
            message: 'Node not found',
            error: 'Node not found or is not a valid scene node',
            fixType: fix.type
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
              error: 'Token fixes require a propertyPath',
              fixType: 'token'
            });
            errorCount++;
            continue;
          }

          let tokenId = fix.tokenId;
          const isColorProperty = /^(fills|strokes)(\[\d+\])?$/.test(fix.propertyPath);
          // Normalize property path to include index (default to [0]) for color fixes
          if (isColorProperty && !/\[\d+\]$/.test(fix.propertyPath)) {
            fix.propertyPath = `${fix.propertyPath}[0]`;
          }

          // If no tokenId provided, try to find a matching variable
          if (!tokenId && fix.newValue) {
            try {
              if (isColorProperty) {
                const colorMatches = await findMatchingColorVariable(fix.newValue, 0.1, colorFieldFromPropertyPath(fix.propertyPath));
                if (colorMatches.length > 0) {
                  tokenId = colorMatches[0].variableId;
                }
              } else {
                const pixelValue = parseFloat(fix.newValue);
                if (!isNaN(pixelValue)) {
                  const spacingMatches = await findBestMatchingVariable(pixelValue, fix.propertyPath || '', 2);
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
              message: 'No matching token — add a variable for this value to your design tokens',
              error: 'No matching design token variable found. Add a variable with this value to enable auto-fix.',
              fixType: 'token'
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
            error: result.error,
            fixType: 'token',
            propertyPath: fix.propertyPath
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
              : 'Failed to rename layer',
            newName: success ? newName : oldName,
            fixType: 'naming'
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
            error: `Unsupported fix type: ${fix.type}`,
            fixType: fix.type
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

    // Check if all errors are due to no matching tokens
    const noMatchErrors = results.filter(r => !r.success && r.message?.includes('No matching token'));
    const hasOnlyNoMatchErrors = errorCount > 0 && noMatchErrors.length === errorCount;

    if (errorCount === 0) {
      figma.notify(`Applied ${successCount} fix${successCount !== 1 ? 'es' : ''} successfully`, { timeout: 2000 });
    } else if (successCount > 0 && hasOnlyNoMatchErrors) {
      figma.notify(`Applied ${successCount} fix${successCount !== 1 ? 'es' : ''}. ${errorCount} skipped (no matching tokens).`, { timeout: 3000 });
    } else if (successCount > 0) {
      figma.notify(`Applied ${successCount} fix${successCount !== 1 ? 'es' : ''}, ${errorCount} failed`, { timeout: 3000 });
    } else if (hasOnlyNoMatchErrors) {
      figma.notify(`No matching tokens found for ${errorCount} value${errorCount !== 1 ? 's' : ''}. Add matching variables to your design tokens.`, { error: true, timeout: 4000 });
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
/**
 * Tokenize a property name / default value for fuzzy layer matching:
 * "showBorder" → ["border"], "action" → ["action"],
 * "dismiss button (default)" → ["dismiss", "button", "default"].
 */
function propertyNameTokens(value: unknown): string[] {
  // LLM recommendations sometimes carry non-string examples (true/false as
  // JSON booleans, numbers) — coerce before any string operation.
  const stripped = String(value ?? '').replace(/^(show|has|is|enable|with)(?=[A-Z_\- ])/i, '');
  return stripped
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .split(/[^a-zA-Z0-9]+/)
    .map((t) => t.toLowerCase())
    .filter((t) => t.length >= 3 && t !== 'default');
}

function nameMatchesTokens(name: string, tokens: string[]): boolean {
  const nameLower = name.toLowerCase();
  return tokens.some((t) => nameLower.includes(t));
}

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
    const typeKey = propertyType.toLowerCase().replace(/[^a-z]/g, '');
    let figmaType: ComponentPropertyType;
    switch (typeKey) {
      case 'boolean':
        figmaType = 'BOOLEAN';
        break;
      case 'text':
        figmaType = 'TEXT';
        break;
      case 'slot':
      case 'instanceswap':
        figmaType = 'INSTANCE_SWAP';
        break;
      case 'variant':
        figmaType = 'VARIANT';
        break;
      default:
        figmaType = 'TEXT';
    }

    // The component roots we can bind layers inside (each variant of a set,
    // or the single component itself).
    const variantRoots: ComponentNode[] = targetNode.type === 'COMPONENT_SET'
      ? (targetNode.children.filter((c) => c.type === 'COMPONENT') as ComponentNode[])
      : [targetNode as ComponentNode];

    const matchTokens = [
      ...propertyNameTokens(propertyName),
      ...propertyNameTokens(defaultValue),
    ];

    // ── VARIANT / state properties are advisory-only ────────────────────────
    // Variant values require child nodes in the component set — there is no
    // canvas-mutation-free way to add them, and generated canvas content
    // can't be managed safely alongside hand-built documentation. The UI
    // doesn't offer an Add button for these; this guard covers stale UIs.
    if (figmaType === 'VARIANT') {
      sendMessageToUI('property-added', {
        success: false,
        propertyName,
        message: `Variant and state properties aren't added automatically — each value needs a designed variant in the component set, so FigmaLint leaves that to you. Use this recommendation as guidance and add variants manually in Figma.`
      });
      return;
    }

    // ── INSTANCE_SWAP: needs a nested instance to control + a real default ──
    let resolvedDefault: string | boolean = defaultValue;
    let swapCandidateName: string | null = null;
    if (figmaType === 'INSTANCE_SWAP') {
      let candidate: InstanceNode | null = null;
      for (const root of variantRoots) {
        const instances = root.findAll((n) => n.type === 'INSTANCE') as InstanceNode[];
        candidate = instances.find((inst) => nameMatchesTokens(inst.name, matchTokens)) || null;
        if (candidate) break;
      }
      if (!candidate) {
        sendMessageToUI('property-added', {
          success: false,
          propertyName,
          message: `Couldn't add "${propertyName}": an instance-swap property has to control a nested instance, and no instance matching "${matchTokens.join('", "')}" exists in this component. Add the instance (e.g. an action button) first, then re-add the property.`
        });
        figma.notify(`No nested instance found for "${propertyName}"`, { error: true });
        return;
      }
      const mainComponent = await candidate.getMainComponentAsync();
      if (!mainComponent) {
        sendMessageToUI('property-added', {
          success: false,
          propertyName,
          message: `Couldn't add "${propertyName}": the matching instance "${candidate.name}" has no accessible main component.`
        });
        return;
      }
      resolvedDefault = mainComponent.id;
      swapCandidateName = candidate.name;
    }

    // BOOLEAN defaults must be actual booleans, not "true" strings
    if (figmaType === 'BOOLEAN') {
      resolvedDefault = /^(true|yes|on|1)$/i.test(String(defaultValue).trim());
    }

    const propertyKey = targetNode.addComponentProperty(propertyName, figmaType, resolvedDefault);

    // ── Bind the property to matching layers so it isn't "unused" ──────────
    // A defined-but-unbound property shows as "Not used within this component"
    // in Figma. Attach it to the layer it plausibly controls in every variant.
    let boundLayerName: string | null = null;
    let boundCount = 0;
    for (const root of variantRoots) {
      let match: SceneNode | null = null;
      if (figmaType === 'TEXT') {
        match = root.findOne((n) => n.type === 'TEXT' && nameMatchesTokens(n.name, matchTokens));
      } else if (figmaType === 'BOOLEAN') {
        match = root.findOne((n) => nameMatchesTokens(n.name, matchTokens));
      } else if (figmaType === 'INSTANCE_SWAP' && swapCandidateName) {
        match = root.findOne((n) => n.type === 'INSTANCE' && n.name === swapCandidateName);
      }
      if (!match) continue;

      const refs = { ...(match.componentPropertyReferences || {}) };
      if (figmaType === 'BOOLEAN') {
        refs.visible = propertyKey;
      } else if (figmaType === 'TEXT') {
        (refs as Record<string, string>).characters = propertyKey;
      } else {
        (refs as Record<string, string>).mainComponent = propertyKey;
      }
      match.componentPropertyReferences = refs;
      boundLayerName = match.name;
      boundCount++;
    }

    let bindingNote: string;
    if (boundCount > 0) {
      const kind = figmaType === 'BOOLEAN' ? 'visibility' : figmaType === 'TEXT' ? 'text' : 'swap target';
      bindingNote = ` and bound to the ${kind} of "${boundLayerName}"${variantRoots.length > 1 ? ` in ${boundCount}/${variantRoots.length} variants` : ''}`;
    } else {
      bindingNote = `, but no layer matching "${matchTokens.join('", "')}" exists to bind it to — it will show as unused until you attach it to a layer (or create that layer first)`;
    }

    const sheetRefreshed = await maybeRefreshInstanceSheet(targetNode);

    sendMessageToUI('property-added', {
      success: true,
      propertyName,
      message: `Property "${propertyName}" added${bindingNote}.${sheetRefreshed ? ' The instance sheet was updated.' : ''}`
    });
    figma.notify(`Property "${propertyName}" added${boundCount > 0 ? ' and bound' : ' (unbound)'}`, { timeout: 3000 });
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

// =============================================================================
// Instance Sheet Generation
// =============================================================================

function rectsOverlap(
  a: { x: number; y: number; width: number; height: number },
  b: { x: number; y: number; width: number; height: number },
  margin: number
): boolean {
  return (
    a.x < b.x + b.width + margin &&
    a.x + a.width + margin > b.x &&
    a.y < b.y + b.height + margin &&
    a.y + a.height + margin > b.y
  );
}

/**
 * Generate a standalone documentation "instance sheet" next to the analyzed
 * component: a labeled grid of instances covering the variant axes plus
 * true/false rows for each boolean property.
 *
 * Deliberately conservative about the user's file:
 * - Always a NEW frame — existing docs frames are never modified (their grid
 *   semantics can't be inferred safely). If something that looks like docs
 *   exists, the result message points it out so the user can merge manually.
 * - Placed collision-free: starts right of the component's top-level
 *   container and slides right past any occupied bounds.
 * - Re-running replaces only the previously FigmaLint-generated sheet for
 *   this component (matched by exact name), in the same position.
 */
async function handleGenerateInstanceSheet(data: { nodeId?: string }): Promise<void> {
  try {
    // Resolve the component (set) to document
    let base: BaseNode | null = null;
    if (data?.nodeId) {
      base = await figma.getNodeByIdAsync(data.nodeId);
    }
    if (!base && lastAnalyzedNode && !(lastAnalyzedNode as SceneNode).removed) {
      base = lastAnalyzedNode as SceneNode;
    }
    if (!base) {
      base = figma.currentPage.selection[0] || null;
    }

    let target: ComponentNode | ComponentSetNode | null = null;
    if (base) {
      if (base.type === 'COMPONENT_SET') {
        target = base;
      } else if (base.type === 'COMPONENT') {
        target = base.parent?.type === 'COMPONENT_SET' ? (base.parent as ComponentSetNode) : base;
      } else if (base.type === 'INSTANCE') {
        const main = await (base as InstanceNode).getMainComponentAsync();
        if (main) {
          target = main.parent?.type === 'COMPONENT_SET' ? (main.parent as ComponentSetNode) : main;
        }
      }
    }

    if (!target) {
      throw new Error('Analyze a component first, then generate the instance sheet.');
    }

    const message = await buildInstanceSheet(target, { focus: true });
    sendMessageToUI('instance-sheet-generated', { success: true, message });
    figma.notify('Instance sheet generated', { timeout: 3000 });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    sendMessageToUI('instance-sheet-generated', { success: false, message: errorMessage });
    figma.notify(`Instance sheet failed: ${errorMessage}`, { error: true });
  }
}

/** The canonical name of the FigmaLint-generated sheet for a component. */
function instanceSheetName(target: ComponentNode | ComponentSetNode): string {
  return `${target.name} — instance sheet (FigmaLint)`;
}

/**
 * If a FigmaLint-generated instance sheet exists for this component,
 * regenerate it in place so it reflects the component's current properties.
 * Called after property changes; never creates a sheet that doesn't exist.
 */
async function maybeRefreshInstanceSheet(target: ComponentNode | ComponentSetNode): Promise<boolean> {
  const existing = figma.currentPage.children.find((c) => c.name === instanceSheetName(target));
  if (!existing) return false;
  try {
    await buildInstanceSheet(target, { focus: false });
    return true;
  } catch (error) {
    console.warn('Could not refresh instance sheet:', error);
    return false;
  }
}

/**
 * Build (or rebuild in place) the instance sheet for a component.
 * Returns the user-facing result message; throws on failure after cleaning
 * up any half-built frame.
 */
async function buildInstanceSheet(
  target: ComponentNode | ComponentSetNode,
  options: { focus: boolean }
): Promise<string> {
  let sheet: FrameNode | null = null;
  try {
    const page = figma.currentPage;
    const displayName = target.name;
    const sheetName = instanceSheetName(target);
    const source: ComponentNode = target.type === 'COMPONENT_SET'
      ? target.defaultVariant
      : target;

    const defs = target.componentPropertyDefinitions;
    const variantEntries = Object.entries(defs).filter(([, d]) => d.type === 'VARIANT');
    const boolEntries = Object.entries(defs).filter(([, d]) => d.type === 'BOOLEAN');

    // Axes: first variant property = rows, second = columns (bounded so a
    // property-heavy set can't explode into hundreds of instances)
    const rowAxis = variantEntries[0] || null;
    const colAxis = variantEntries.length > 1 ? variantEntries[1] : null;
    const rowValues = rowAxis ? (rowAxis[1].variantOptions || []).map((v) => String(v)).slice(0, 12) : [];
    const colValues = colAxis ? (colAxis[1].variantOptions || []).map((v) => String(v)).slice(0, 8) : [];

    const labelFont: FontName = { family: 'Inter', style: 'Regular' };
    const headerFont: FontName = { family: 'Inter', style: 'Semi Bold' };
    await figma.loadFontAsync(labelFont);
    await figma.loadFontAsync(headerFont);

    const makeText = (chars: string, size: number, bold = false, shade = 0.45): TextNode => {
      const t = figma.createText();
      t.fontName = bold ? headerFont : labelFont;
      t.fontSize = size;
      t.characters = chars;
      t.fills = [{ type: 'SOLID', color: { r: shade, g: shade, b: shade } }];
      return t;
    };

    const makeAutoFrame = (direction: 'HORIZONTAL' | 'VERTICAL', spacing: number): FrameNode => {
      const f = figma.createFrame();
      f.layoutMode = direction;
      f.primaryAxisSizingMode = 'AUTO';
      f.counterAxisSizingMode = 'AUTO';
      f.itemSpacing = spacing;
      f.fills = [];
      f.counterAxisAlignItems = direction === 'HORIZONTAL' ? 'CENTER' : 'MIN';
      f.clipsContent = false;
      return f;
    };

    const makeRowLabel = (chars: string): TextNode => {
      const label = makeText(chars, 11);
      label.textAutoResize = 'HEIGHT';
      label.resize(96, label.height);
      return label;
    };

    let created = 0;
    let unavailable = 0;

    const makeDashCell = (): FrameNode => {
      const cell = makeAutoFrame('VERTICAL', 6);
      cell.appendChild(makeText('—', 12, false, 0.7));
      return cell;
    };

    const makeInstanceCell = (
      props: Record<string, string | boolean>,
      labelText?: string
    ): FrameNode => {
      const inst = source.createInstance();
      try {
        inst.setProperties(props);
      } catch {
        // That combination doesn't exist in the set (sparse variants) — show
        // an honest gap instead of failing the whole sheet.
        inst.remove();
        unavailable++;
        return makeDashCell();
      }
      created++;
      const cell = makeAutoFrame('VERTICAL', 6);
      if (labelText) {
        cell.appendChild(makeText(labelText, 10, false, 0.55));
      }
      cell.appendChild(inst);
      return cell;
    };

    // Build the sheet
    sheet = figma.createFrame();
    sheet.name = sheetName;
    sheet.layoutMode = 'VERTICAL';
    sheet.primaryAxisSizingMode = 'AUTO';
    sheet.counterAxisSizingMode = 'AUTO';
    sheet.itemSpacing = 28;
    sheet.paddingLeft = 40;
    sheet.paddingRight = 40;
    sheet.paddingTop = 32;
    sheet.paddingBottom = 40;
    sheet.cornerRadius = 12;
    sheet.fills = [{ type: 'SOLID', color: { r: 1, g: 1, b: 1 } }];
    sheet.strokes = [{ type: 'SOLID', color: { r: 0.9, g: 0.9, b: 0.9 } }];

    const header = makeAutoFrame('VERTICAL', 4);
    header.appendChild(makeText(displayName, 18, true, 0.1));
    header.appendChild(makeText('Instance sheet · generated by FigmaLint', 10, false, 0.55));
    sheet.appendChild(header);

    // Variant grid
    if (rowAxis && rowValues.length > 0) {
      const section = makeAutoFrame('VERTICAL', 16);
      section.appendChild(makeText(colAxis ? `${rowAxis[0]} × ${colAxis[0]}` : rowAxis[0], 13, true, 0.25));
      for (const rowValue of rowValues) {
        const row = makeAutoFrame('HORIZONTAL', 24);
        row.appendChild(makeRowLabel(rowValue));
        if (colAxis && colValues.length > 0) {
          for (const colValue of colValues) {
            row.appendChild(makeInstanceCell(
              { [rowAxis[0]]: rowValue, [colAxis[0]]: colValue },
              `${colAxis[0]}=${colValue}`
            ));
          }
        } else {
          row.appendChild(makeInstanceCell({ [rowAxis[0]]: rowValue }));
        }
        section.appendChild(row);
      }
      sheet.appendChild(section);
    }

    // Boolean toggles — property keys carry their #id suffix; setProperties
    // needs the full key, the label only the base name.
    if (boolEntries.length > 0) {
      const section = makeAutoFrame('VERTICAL', 16);
      section.appendChild(makeText('Boolean properties', 13, true, 0.25));
      for (const [key] of boolEntries.slice(0, 8)) {
        const row = makeAutoFrame('HORIZONTAL', 24);
        row.appendChild(makeRowLabel(key.split('#')[0]));
        row.appendChild(makeInstanceCell({ [key]: true }, 'true'));
        row.appendChild(makeInstanceCell({ [key]: false }, 'false'));
        section.appendChild(row);
      }
      sheet.appendChild(section);
    }

    // No permutable properties at all: show the base component
    if (created === 0 && unavailable === 0) {
      sheet.appendChild(makeInstanceCell({}));
    }

    // ── Placement ──────────────────────────────────────────────────────────
    let container: SceneNode = target as SceneNode;
    while (container.parent && container.parent.type !== 'PAGE') {
      container = container.parent as SceneNode;
    }

    const previous = page.children.find((c) => c.name === sheetName && c.id !== sheet!.id);
    let targetX: number;
    let targetY: number;
    let replacedPrevious = false;
    if (previous) {
      // Regeneration: take over the previously generated sheet's spot
      targetX = previous.x;
      targetY = previous.y;
      previous.remove();
      replacedPrevious = true;
    } else {
      // Start right of the component's container, slide right past anything
      // occupied so the sheet can never land on existing content.
      targetY = container.y;
      targetX = container.x + container.width + 120;
      const margin = 80;
      let guard = 0;
      while (guard++ < 100) {
        const rect = { x: targetX, y: targetY, width: sheet.width, height: sheet.height };
        const hit = page.children.find(
          (c) => c.id !== sheet!.id && rectsOverlap(rect, { x: c.x, y: c.y, width: c.width, height: c.height }, margin)
        );
        if (!hit) break;
        targetX = hit.x + hit.width + 120;
      }
    }
    sheet.x = targetX;
    sheet.y = targetY;

    // Point at likely existing docs without touching them
    const docsFrame = page.children.find(
      (c) =>
        c.id !== sheet!.id &&
        c.id !== container.id &&
        'children' in c &&
        /docs?\b|sheet|spec|table|guide/i.test(c.name)
    );

    if (options.focus) {
      figma.currentPage.selection = [sheet];
      figma.viewport.scrollAndZoomIntoView([sheet]);
    }

    const parts = [
      `Instance sheet generated with ${created} instance${created === 1 ? '' : 's'}.`,
    ];
    if (unavailable > 0) {
      parts.push(`${unavailable} combination${unavailable === 1 ? '' : 's'} don't exist in the set yet (shown as "—").`);
    }
    if (replacedPrevious) {
      parts.push('Replaced the previously generated sheet.');
    }
    if (docsFrame) {
      parts.push(`Your existing "${docsFrame.name}" was left untouched — move rows over if you want them combined.`);
    }
    return parts.join(' ');
  } catch (error) {
    if (sheet && !sheet.removed) {
      sheet.remove(); // never leave a half-built sheet on the canvas
    }
    throw error;
  }
}
