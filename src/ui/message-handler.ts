/// <reference types="@figma/plugin-typings" />

import { PluginMessage, UIMessageType, EnhancedAnalysisOptions } from '../types';
import { sendMessageToUI, isValidApiKeyFormat, isValidNodeForAnalysis } from '../utils/figma-helpers';
import { processEnhancedAnalysis, extractComponentContext } from '../core/component-analyzer';
import { fetchClaude, extractJSONFromResponse, createEnhancedMetadataPrompt } from '../api/claude';

// Plugin state
let storedApiKey: string | null = null;
let selectedModel = 'claude-3-sonnet-20240229';

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
 * Enhanced component analysis
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

    // Extract component context
    const componentContext = extractComponentContext(selectedNode);

    // Create enhanced prompt
    const prompt = createEnhancedMetadataPrompt(componentContext);

    // Show loading notification
    figma.notify('Performing enhanced analysis with Claude AI...', { timeout: 3000 });

    // Call Claude API
    const analysis = await fetchClaude(prompt, storedApiKey, selectedModel);

    // Parse JSON response
    const enhancedData = extractJSONFromResponse(analysis);

    // Process the enhanced data with the original selected node for property extraction
    const result = await processEnhancedAnalysis(enhancedData, selectedNode, originalSelectedNode);

    // Store for later use
    (globalThis as any).lastAnalyzedMetadata = result.metadata;
    (globalThis as any).lastAnalyzedNode = selectedNode;

    // Send results to UI
    sendMessageToUI('enhanced-analysis-result', result);
    figma.notify('Enhanced analysis complete!', { timeout: 3000 });

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
 * Handle batch analysis of multiple components
 */
async function handleBatchAnalysis(nodes: readonly SceneNode[], _options: EnhancedAnalysisOptions): Promise<void> {
  const results = [];

  for (const node of nodes) {
    if (isValidNodeForAnalysis(node)) {
      try {
        const componentContext = extractComponentContext(node);
        const prompt = createEnhancedMetadataPrompt(componentContext);
        const analysis = await fetchClaude(prompt, storedApiKey!, selectedModel);
        const data = extractJSONFromResponse(analysis);

        results.push({
          node: node.name,
          success: true,
          data
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

  sendMessageToUI('batch-analysis-result', { results });
  figma.notify(`Batch analysis complete: ${results.length} components processed`, { timeout: 3000 });
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
 * Initialize plugin
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

    console.log('Plugin initialized successfully');
  } catch (error) {
    console.error('Error initializing plugin:', error);
  }
}
