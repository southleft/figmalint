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
      case 'generate-variants':
        await handleGenerateVariants(data.metadata);
        break;
      case 'generate-playground':
        await handleGeneratePlayground(data.metadata);
        break;
      case 'generate-docs-frame':
        await handleGenerateDocsFrame(data);
        break;
      case 'embed-metadata':
        await handleEmbedMetadata(data.metadata);
        break;
      case 'clear-api-key':
        await handleClearApiKey();
        break;
      case 'save-collab-notes':
        await handleSaveCollabNotes(data.notes);
        break;
      case 'fix-naming':
        await handleFixNaming(data);
        break;
      case 'add-state':
        await handleAddState(data);
        break;
      case 'fix-accessibility':
        await handleFixAccessibility(data);
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

    // Validate node type
    if (!isValidNodeForAnalysis(selectedNode)) {
      throw new Error('Please select a Frame, Component, or Instance to analyze');
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

    // Process the enhanced data
    const result = await processEnhancedAnalysis(enhancedData, selectedNode);

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

// Placeholder handlers for other functionality
async function handleGenerateVariants(_metadata: any): Promise<void> {
  figma.notify('Variant generation not yet implemented in refactored version', { timeout: 2000 });
}

async function handleGeneratePlayground(metadata: any): Promise<void> {
  try {
    // Check if we have a component selected
    const selection = figma.currentPage.selection;
    if (selection.length === 0) {
      throw new Error('No component selected');
    }

    let selectedNode = selection[0];

    // Handle instances - get the main component
    if (selectedNode.type === 'INSTANCE') {
      const instance = selectedNode as InstanceNode;
      if (instance.mainComponent) {
        selectedNode = instance.mainComponent;
      } else {
        throw new Error('Instance has no main component');
      }
    }

    // Check if it's a component or component set
    if (selectedNode.type !== 'COMPONENT' && selectedNode.type !== 'COMPONENT_SET') {
      throw new Error('Please select a component or component set');
    }

    // Create playground frame
    const playgroundFrame = figma.createFrame();
    playgroundFrame.name = `${selectedNode.name} - Component Playground`;
    playgroundFrame.x = selectedNode.x + selectedNode.width + 100;
    playgroundFrame.y = selectedNode.y;
    playgroundFrame.fills = [{ type: 'SOLID', color: { r: 0.05, g: 0.05, b: 0.05 } }];
    playgroundFrame.layoutMode = 'VERTICAL';
    playgroundFrame.primaryAxisSizingMode = 'AUTO';
    playgroundFrame.counterAxisSizingMode = 'AUTO';
    playgroundFrame.paddingLeft = 48;
    playgroundFrame.paddingRight = 48;
    playgroundFrame.paddingTop = 48;
    playgroundFrame.paddingBottom = 48;
    playgroundFrame.itemSpacing = 48;

    // Add title
    const title = figma.createText();
    await figma.loadFontAsync({ family: 'Inter', style: 'Medium' });
    title.fontName = { family: 'Inter', style: 'Medium' };
    title.fontSize = 24;
    title.characters = selectedNode.name;
    title.fills = [{ type: 'SOLID', color: { r: 0.6, g: 0.6, b: 0.6 } }];
    playgroundFrame.appendChild(title);

    if (selectedNode.type === 'COMPONENT_SET') {
      // Generate variants grid for component set
      await generateComponentSetPlayground(selectedNode as ComponentSetNode, playgroundFrame, metadata);
    } else {
      // Generate states for single component
      await generateSingleComponentPlayground(selectedNode as ComponentNode, playgroundFrame, metadata);
    }

    // Select the playground frame
    figma.currentPage.selection = [playgroundFrame];
    figma.viewport.scrollAndZoomIntoView([playgroundFrame]);

    sendMessageToUI('playground-generated', { success: true });
    figma.notify('Component playground generated successfully!', { timeout: 3000 });
  } catch (error) {
    console.error('Error generating playground:', error);
    const errorMessage = error instanceof Error ? error.message : 'Failed to generate playground';
    figma.notify(`Error: ${errorMessage}`, { error: true });
    sendMessageToUI('playground-generated', { success: false, error: errorMessage });
  }
}

/**
 * Generate playground for a component set with all variants
 */
async function generateComponentSetPlayground(
  componentSet: ComponentSetNode,
  playgroundFrame: FrameNode,
  metadata: any
): Promise<void> {
  // Get variant properties
  const variantProps = componentSet.variantGroupProperties;
  const variantKeys = Object.keys(variantProps);
  
  if (variantKeys.length === 0) {
    // No variants, just create instances of children
    const instancesFrame = createVariantSection('All Variants', playgroundFrame);
    componentSet.children.forEach((variant, index) => {
      if (variant.type === 'COMPONENT') {
        const instance = variant.createInstance();
        instancesFrame.appendChild(instance);
      }
    });
    return;
  }

  // Create a grid based on variant properties
  if (variantKeys.length === 1) {
    // Single property - create a simple row
    const prop = variantKeys[0];
    const values = variantProps[prop].values;
    const section = createVariantSection(prop, playgroundFrame);
    
    values.forEach(value => {
      const variant = findVariantByProperty(componentSet, prop, value);
      if (variant) {
        const instance = variant.createInstance();
        section.appendChild(instance);
      }
    });
  } else if (variantKeys.length === 2) {
    // Two properties - create a grid with rows and columns
    const [prop1, prop2] = variantKeys;
    const values1 = variantProps[prop1].values;
    const values2 = variantProps[prop2].values;
    
    // Create grid container
    const gridFrame = figma.createFrame();
    gridFrame.name = 'Variants Grid';
    gridFrame.layoutMode = 'VERTICAL';
    gridFrame.primaryAxisSizingMode = 'AUTO';
    gridFrame.counterAxisSizingMode = 'AUTO';
    gridFrame.itemSpacing = 24;
    gridFrame.fills = [];
    playgroundFrame.appendChild(gridFrame);
    
    // Add column headers
    const headerRow = figma.createFrame();
    headerRow.layoutMode = 'HORIZONTAL';
    headerRow.primaryAxisSizingMode = 'AUTO';
    headerRow.counterAxisSizingMode = 'AUTO';
    headerRow.itemSpacing = 24;
    headerRow.fills = [];
    gridFrame.appendChild(headerRow);
    
    // Empty cell for row labels
    const emptyCell = figma.createFrame();
    emptyCell.resize(100, 40);
    emptyCell.fills = [];
    headerRow.appendChild(emptyCell);
    
    // Column headers
    for (const value2 of values2) {
      const header = await createLabel(`${prop2}: ${value2}`);
      headerRow.appendChild(header);
    }
    
    // Create rows
    for (const value1 of values1) {
      const row = figma.createFrame();
      row.layoutMode = 'HORIZONTAL';
      row.primaryAxisSizingMode = 'AUTO';
      row.counterAxisSizingMode = 'AUTO';
      row.itemSpacing = 24;
      row.fills = [];
      gridFrame.appendChild(row);
      
      // Row label
      const rowLabel = await createLabel(`${prop1}: ${value1}`);
      row.appendChild(rowLabel);
      
      // Instances
      for (const value2 of values2) {
        const variant = findVariantByProperties(componentSet, {
          [prop1]: value1,
          [prop2]: value2
        });
        
        if (variant) {
          const instance = variant.createInstance();
          row.appendChild(instance);
        } else {
          // Empty placeholder
          const placeholder = figma.createFrame();
          placeholder.resize(100, 40);
          placeholder.fills = [];
          row.appendChild(placeholder);
        }
      }
    }
  } else {
    // More than 2 properties - create sections for each combination
    const mainProp = variantKeys[0];
    const mainValues = variantProps[mainProp].values;
    
    mainValues.forEach(mainValue => {
      const section = createVariantSection(`${mainProp}: ${mainValue}`, playgroundFrame);
      
      // Get all variants with this main property value
      const variants = componentSet.children.filter(child => {
        if (child.type === 'COMPONENT') {
          const component = child as ComponentNode;
          const variantProps = parseVariantProperties(component.name);
          return variantProps[mainProp] === mainValue;
        }
        return false;
      });
      
      // Create instances
      variants.forEach(variant => {
        if (variant.type === 'COMPONENT') {
          const instance = variant.createInstance();
          section.appendChild(instance);
        }
      });
    });
  }
}

/**
 * Generate playground for a single component
 */
async function generateSingleComponentPlayground(
  component: ComponentNode,
  playgroundFrame: FrameNode,
  metadata: any
): Promise<void> {
  // Check if the component should have states based on metadata
  const states = metadata?.states || [];
  const hasStates = states.length > 0;
  
  if (!hasStates) {
    // Just create a single instance
    const section = createVariantSection('Default Instance', playgroundFrame);
    const instance = component.createInstance();
    section.appendChild(instance);
  } else {
    // Create a section for states
    const section = createVariantSection('Recommended States', playgroundFrame);
    
    // Create an instance for each recommended state
    states.forEach((state: string) => {
      const container = figma.createFrame();
      container.layoutMode = 'VERTICAL';
      container.primaryAxisSizingMode = 'AUTO';
      container.counterAxisSizingMode = 'AUTO';
      container.itemSpacing = 8;
      container.fills = [];
      section.appendChild(container);
      
      // State label
      createLabel(state).then(label => {
        container.appendChild(label);
      });
      
      // Instance
      const instance = component.createInstance();
      container.appendChild(instance);
    });
  }
}

/**
 * Create a section for variants
 */
function createVariantSection(title: string, parent: FrameNode): FrameNode {
  const section = figma.createFrame();
  section.name = title;
  section.layoutMode = 'HORIZONTAL';
  section.primaryAxisSizingMode = 'AUTO';
  section.counterAxisSizingMode = 'AUTO';
  section.itemSpacing = 24;
  section.paddingLeft = 24;
  section.paddingRight = 24;
  section.paddingTop = 24;
  section.paddingBottom = 24;
  section.fills = [];
  
  // Add dotted border
  section.strokes = [{
    type: 'SOLID',
    color: { r: 0.5, g: 0.3, b: 0.8 },
    opacity: 0.5
  }];
  section.strokeWeight = 1;
  section.dashPattern = [4, 4];
  section.cornerRadius = 8;
  
  parent.appendChild(section);
  return section;
}

/**
 * Create a text label
 */
async function createLabel(text: string): Promise<TextNode> {
  const label = figma.createText();
  await figma.loadFontAsync({ family: 'Inter', style: 'Regular' });
  label.fontName = { family: 'Inter', style: 'Regular' };
  label.fontSize = 12;
  label.characters = text;
  label.fills = [{ type: 'SOLID', color: { r: 0.5, g: 0.3, b: 0.8 } }];
  return label;
}

/**
 * Find variant by single property
 */
function findVariantByProperty(
  componentSet: ComponentSetNode,
  property: string,
  value: string
): ComponentNode | null {
  return componentSet.children.find(child => {
    if (child.type === 'COMPONENT') {
      const variantProps = parseVariantProperties(child.name);
      return variantProps[property] === value;
    }
    return false;
  }) as ComponentNode | null;
}

/**
 * Find variant by multiple properties
 */
function findVariantByProperties(
  componentSet: ComponentSetNode,
  properties: Record<string, string>
): ComponentNode | null {
  return componentSet.children.find(child => {
    if (child.type === 'COMPONENT') {
      const variantProps = parseVariantProperties(child.name);
      return Object.entries(properties).every(([key, value]) => variantProps[key] === value);
    }
    return false;
  }) as ComponentNode | null;
}

/**
 * Parse variant properties from component name
 */
function parseVariantProperties(name: string): Record<string, string> {
  const props: Record<string, string> = {};
  const parts = name.split(',').map(p => p.trim());
  
  parts.forEach(part => {
    const [key, value] = part.split('=').map(p => p.trim());
    if (key && value) {
      props[key] = value;
    }
  });
  
  return props;
}

async function handleGenerateDocsFrame(_data: any): Promise<void> {
  figma.notify('Documentation frame generation not yet implemented in refactored version', { timeout: 2000 });
}

async function handleEmbedMetadata(_metadata: any): Promise<void> {
  figma.notify('Metadata embedding not yet implemented in refactored version', { timeout: 2000 });
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

async function handleSaveCollabNotes(_notes: string): Promise<void> {
  figma.notify('Collaboration notes not yet implemented in refactored version', { timeout: 2000 });
}

async function handleFixNaming(data: any): Promise<void> {
  try {
    const { layer, newName } = data;
    
    if (!layer || !newName) {
      throw new Error('Layer name and new name are required');
    }

    // Get the currently selected node
    const selection = figma.currentPage.selection;
    if (selection.length === 0) {
      throw new Error('No component selected');
    }

    let selectedNode = selection[0];
    
    // Handle instances
    if (selectedNode.type === 'INSTANCE') {
      const instance = selectedNode as InstanceNode;
      if (instance.mainComponent) {
        selectedNode = instance.mainComponent;
      }
    }

    // Find the layer to rename
    let nodeToRename: SceneNode | null = null;
    
    // First check if the layer name matches the selected node
    if (selectedNode.name === layer) {
      nodeToRename = selectedNode;
    } else {
      // Search in children
      nodeToRename = findNodeByName(selectedNode, layer);
    }

    if (!nodeToRename) {
      throw new Error(`Layer "${layer}" not found in the component`);
    }

    // Rename the node
    const oldName = nodeToRename.name;
    nodeToRename.name = newName;

    sendMessageToUI('fix-naming', { 
      success: true, 
      message: `Renamed "${oldName}" to "${newName}"` 
    });
    figma.notify(`Renamed "${oldName}" to "${newName}"`, { timeout: 2000 });
    
  } catch (error) {
    console.error('Error fixing naming:', error);
    const errorMessage = error instanceof Error ? error.message : 'Failed to rename layer';
    sendMessageToUI('fix-naming', { success: false, error: errorMessage });
    figma.notify(`Error: ${errorMessage}`, { error: true });
  }
}

/**
 * Find a node by name recursively
 */
function findNodeByName(node: SceneNode, name: string): SceneNode | null {
  if (node.name === name) {
    return node;
  }
  
  if ('children' in node) {
    for (const child of node.children) {
      const found = findNodeByName(child, name);
      if (found) {
        return found;
      }
    }
  }
  
  return null;
}

async function handleAddState(data: any): Promise<void> {
  try {
    const { state } = data;
    
    if (!state) {
      throw new Error('State name is required');
    }

    // Get the currently selected node
    const selection = figma.currentPage.selection;
    if (selection.length === 0) {
      throw new Error('No component selected');
    }

    let selectedNode = selection[0];
    
    // Handle instances
    if (selectedNode.type === 'INSTANCE') {
      const instance = selectedNode as InstanceNode;
      if (instance.mainComponent) {
        selectedNode = instance.mainComponent;
      }
    }

    // Check if it's a component
    if (selectedNode.type !== 'COMPONENT') {
      throw new Error('Selected node must be a component to add states');
    }

    const component = selectedNode as ComponentNode;
    const parent = component.parent;
    
    if (!parent) {
      throw new Error('Component must have a parent to create variants');
    }

    // Create a component set if it doesn't exist
    let componentSet: ComponentSetNode;
    
    if (parent.type === 'COMPONENT_SET') {
      componentSet = parent as ComponentSetNode;
    } else {
      // Create a new component set
      componentSet = figma.combineAsVariants([component], parent, parent.children.indexOf(component));
      componentSet.name = component.name;
    }

    // Create the new state variant
    const newVariant = component.clone();
    newVariant.name = `State=${state}`;
    
    // Position the new variant
    newVariant.x = component.x + component.width + 20;
    componentSet.appendChild(newVariant);

    // Apply visual changes based on state
    if (state === 'hover') {
      // Slightly brighten fills
      applyHoverState(newVariant);
    } else if (state === 'focus') {
      // Add focus ring
      applyFocusState(newVariant);
    } else if (state === 'disabled') {
      // Reduce opacity
      applyDisabledState(newVariant);
    } else if (state === 'pressed' || state === 'active') {
      // Darken slightly
      applyPressedState(newVariant);
    }

    sendMessageToUI('state-added', { 
      success: true, 
      state: state,
      message: `Added ${state} state` 
    });
    figma.notify(`Added ${state} state to component`, { timeout: 2000 });
    
  } catch (error) {
    console.error('Error adding state:', error);
    const errorMessage = error instanceof Error ? error.message : 'Failed to add state';
    sendMessageToUI('state-added', { success: false, error: errorMessage });
    figma.notify(`Error: ${errorMessage}`, { error: true });
  }
}

/**
 * Apply hover state visual changes
 */
function applyHoverState(node: SceneNode): void {
  if ('opacity' in node) {
    node.opacity = Math.min(node.opacity * 1.1, 1);
  }
}

/**
 * Apply focus state visual changes
 */
function applyFocusState(node: SceneNode): void {
  if ('strokes' in node) {
    node.strokes = [{
      type: 'SOLID',
      color: { r: 0.33, g: 0.53, b: 1 },
      opacity: 1
    }];
    node.strokeWeight = 2;
  }
}

/**
 * Apply disabled state visual changes
 */
function applyDisabledState(node: SceneNode): void {
  if ('opacity' in node) {
    node.opacity = 0.5;
  }
}

/**
 * Apply pressed/active state visual changes
 */
function applyPressedState(node: SceneNode): void {
  if ('opacity' in node) {
    node.opacity = Math.max(node.opacity * 0.9, 0.1);
  }
}

async function handleFixAccessibility(_data: any): Promise<void> {
  figma.notify('Accessibility fixes not yet implemented in refactored version', { timeout: 2000 });
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
