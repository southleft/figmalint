// Main Plugin Thread for AI Design Co-Pilot Figma Plugin
// Handles Figma API interactions, message processing, and plugin lifecycle

// Inline Claude API helper functions to avoid module system issues

// Validate if an API key looks like a valid Claude API key
function isValidApiKeyFormat(apiKey: string): boolean {
  const trimmedKey = apiKey.trim();
  // Claude API keys typically start with 'sk-ant-' and are longer
  return trimmedKey.length > 40 && trimmedKey.startsWith('sk-ant-');
}

// Validate if a node is suitable for analysis
function isValidNodeForAnalysis(node: SceneNode): boolean {
  const validTypes = ['FRAME', 'COMPONENT', 'COMPONENT_SET', 'INSTANCE', 'GROUP'];

  // Check if it's a valid type
  if (!validTypes.includes(node.type)) {
    return false;
  }

  // Special check for component sets - skip if they have errors
  if (node.type === 'COMPONENT_SET') {
    try {
      // Try to access variant properties to check if the component set is valid
      const componentSet = node as ComponentSetNode;
      const props = componentSet.variantGroupProperties;
      return true;
    } catch (error) {
      console.warn('Component set has errors, skipping:', error);
      return false;
    }
  }

  return true;
}

// Validate metadata structure
function isValidMetadata(metadata: any): boolean {
  if (!metadata || typeof metadata !== 'object') return false;

  // Check required fields
  const requiredFields = ['component', 'description'];
  for (const field of requiredFields) {
    if (!metadata[field]) return false;
  }

  // Check array fields
  const arrayFields = ['props', 'states', 'slots'];
  for (const field of arrayFields) {
    if (metadata[field] && !Array.isArray(metadata[field])) return false;
  }

  return true;
}

// Create a design analysis prompt for Figma components
function createDesignAnalysisPrompt(componentName: string, componentStructure: any): string {
  return `
Analyze this Figma component and provide design insights:

Component Name: ${componentName}
Component Structure: ${JSON.stringify(componentStructure, null, 2)}

Please provide:
1. A brief description of the component's purpose and design
2. Suggestions for potential variants (different states, sizes, or styles)
3. Accessibility considerations
4. Best practices for using this component

Keep the response concise and actionable for a designer.
  `.trim();
}

// Create a metadata assistant prompt for structured component analysis
function createMetadataPrompt(componentContext: any): string {
  const layersList = componentContext.nestedLayers.join(', ');
  const hasVariants = componentContext.isComponentSet || componentContext.potentialVariants.length > 0;

  return `
You are a design system expert helping to document and audit a Figma component.

Component Details:
- Name: "${componentContext.componentName}"
- Type: ${componentContext.componentType}
- Dimensions: ${componentContext.frameStructure.width}x${componentContext.frameStructure.height}
- Layout Mode: ${componentContext.frameStructure.layoutMode}
- Nested Layers: ${layersList}
- Has Fills: ${componentContext.detectedStyles.hasFills}
- Has Strokes: ${componentContext.detectedStyles.hasStrokes}
- Has Effects: ${componentContext.detectedStyles.hasEffects}
- Corner Radius: ${componentContext.detectedStyles.cornerRadius}
- Detected Slots: ${componentContext.detectedSlots.join(', ') || 'none'}
- Is Component Set: ${componentContext.isComponentSet}
- Potential Variant Types: ${componentContext.potentialVariants.join(', ') || 'none'}

CRITICAL: You MUST include a detailed "propertyCheatSheet" array in your response. This is essential for designer-developer communication.

**Your response must be valid JSON in this exact format:**
{
  "component": "Avatar",
  "description": "A circular avatar component for displaying user profile images",
  "props": ["size", "variant", "status", "showBorder"],
  "propertyCheatSheet": [
    {
      "name": "size",
      "values": ["small", "medium", "large", "xl"],
      "default": "medium",
      "description": "Controls the size of the avatar"
    },
    {
      "name": "variant",
      "values": ["circle", "square", "rounded"],
      "default": "circle",
      "description": "Shape variant of the avatar"
    },
    {
      "name": "status",
      "values": ["default", "online", "offline", "away", "busy"],
      "default": "default",
      "description": "Online status indicator"
    },
    {
      "name": "showBorder",
      "values": ["true", "false"],
      "default": "false",
      "description": "Whether to show border around avatar"
    }
  ],
  "states": ["default", "hover", "focus"],
  "slots": [],
  "variants": {},
  "usage": "Use for user profile representation in interfaces",
  "accessibility": "Ensure proper alt text and focus indicators",
  "tokens": {},
  "audit": {
    "accessibilityIssues": ["Missing focus indicator"],
    "namingIssues": ["'Ellipse 1' should be 'avatar-circle'"],
    "consistencyIssues": ["Size should align with design system"]
  }
}

**For the propertyCheatSheet, analyze the component carefully and:**
- Think about what properties a developer would realistically implement for this component type
- Consider size, variant, state, behavior, and appearance properties
- Provide realistic value options that align with common design systems
- Make property names semantic and developer-friendly
- Include helpful descriptions for each property

**Even simple components should have meaningful properties. For example:**
- Basic shapes: size, variant, color
- Text elements: size, weight, color, variant
- Containers: padding, variant, elevation
- Interactive elements: size, variant, state, disabled

**CRITICAL: Be very strict in your evaluation. A simple circle or basic shape should NOT get high scores.**

Based on this component structure, generate comprehensive metadata and audit that follows design system best practices.

Return ONLY a valid JSON object with this exact structure:
{
  "component": "Button",
  "description": "A clickable button component for user actions",
  "props": ["variant", "size", "disabled", "loading"],
  "propertyCheatSheet": [
    {
      "name": "variant",
      "values": ["primary", "secondary", "outline", "ghost"],
      "default": "primary",
      "description": "Visual style variant of the button"
    },
    {
      "name": "size",
      "values": ["small", "medium", "large"],
      "default": "medium",
      "description": "Size of the button"
    }
  ],
  "states": ["default", "hover", "focus", "disabled"],
  "slots": [],
  "variants": {},
  "usage": "Use for primary and secondary actions in forms and interfaces",
  "accessibility": "Ensure proper contrast and keyboard navigation",
  "tokens": {},
  "audit": {
    "accessibilityIssues": ["Missing focus indicator", "Low contrast ratio"],
    "namingIssues": ["'Button 1' should be 'primary-button'"],
    "consistencyIssues": ["Border radius varies from design system"]
  }
}

IMPORTANT AUDIT RULES:
- If this is a simple shape (circle, rectangle, basic frame) with no interactive elements, list MANY missing states and issues
- A basic avatar component should have missing states like hover, focus, disabled, active
- Simple components should have accessibility issues like missing focus indicators, no keyboard support
- Look for naming issues in layer structure
- Be critical about missing props, variants, and interactive capabilities

Consider the component type realistically. A simple circle should not score well without proper states, variants, and accessibility features.
  `.trim();
}

// Send a prompt to Claude API and get a response
async function fetchClaude(prompt: string, apiKey: string): Promise<string> {
  console.log('Making Claude API call directly...');

  // Direct API endpoint for Anthropic
  const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';

  // Prepare the request payload for Anthropic API
  const requestBody = {
    model: selectedModel,
    messages: [
      {
        role: 'user',
        content: prompt.trim()
      }
    ],
    max_tokens: 1024
  };

  // Headers for direct Anthropic API request
  // Note: The 'anthropic-dangerous-direct-browser-access' header is required for CORS
  const headers = {
    'content-type': 'application/json',
    'x-api-key': apiKey.trim(),
    'anthropic-version': '2023-06-01',
    'anthropic-dangerous-direct-browser-access': 'true'
  };

  try {
    // Make the API request directly to Anthropic
    console.log('Sending request to Claude API...');

    const response = await fetch(ANTHROPIC_API_URL, {
      method: 'POST',
      headers: headers,
      body: JSON.stringify(requestBody)
    });

    // Check if the request was successful
    if (!response.ok) {
      const errorText = await response.text();
      console.error('Claude API error response:', errorText);
      throw new Error(`Claude API request failed: ${response.status} ${response.statusText}`);
    }

    // Parse the response
    const data = await response.json();
    console.log('Claude API response:', data);

    // Extract the text from the response
    if (data.content && data.content[0] && data.content[0].text) {
      return data.content[0].text.trim();
    } else {
      throw new Error('Invalid response format from Claude API');
    }

  } catch (error) {
    console.error('Error calling Claude API:', error);

    // Provide helpful error messages
    if (error instanceof Error) {
      if (error.message.includes('Failed to fetch')) {
        throw new Error('Failed to connect to Claude API. Please check your internet connection.');
      } else if (error.message.includes('401')) {
        throw new Error('Invalid API key. Please check your Claude API key.');
      } else if (error.message.includes('429')) {
        throw new Error('Rate limit exceeded. Please try again later.');
      }
    }

    throw error;
  }
}

// Plugin configuration
const PLUGIN_WINDOW_SIZE = { width: 360, height: 600 };

// Global state
let storedApiKey: string | null = null;
let selectedModel: string = 'claude-sonnet-4-20250514'; // Default to Sonnet 4

// Plugin initialization
// Try to show UI, but handle the case where it might already be shown (in inspect panel)
try {
  figma.showUI(__html__, PLUGIN_WINDOW_SIZE);
  console.log('UI shown successfully');
} catch (error) {
  console.log('UI might already be shown in inspect panel:', error);
}

// Always set up message handler
if (typeof figma.ui.onmessage === 'function') {
  figma.ui.onmessage(handleUIMessage);
} else {
  figma.ui.onmessage = handleUIMessage;
}

// Initialize plugin - load saved API key
async function initializePlugin() {
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

// Initialize on startup
initializePlugin();

// Handle incoming messages from the UI
async function handleUIMessage(msg: any) {
  const { type, data } = msg;

  console.log('Received message:', type, data);

  try {
    switch (type) {
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
        // Use proper enhanced analysis instead of basic
        await handleEnhancedAnalyze(data);
        break;

      case 'generate-variants':
        await handleGenerateVariants(data.metadata);
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

      default:
        console.warn('Unknown message type:', type);
    }
  } catch (error) {
    console.error('Error handling message:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    sendMessageToUI('analysis-error', { error: errorMessage });
  }
}

// Check if API key is already saved
async function handleCheckApiKey() {
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

// Save API key and model to memory and persistent storage
async function handleSaveApiKey(apiKey: string, model?: string) {
  try {
    // Validate API key format
    if (!isValidApiKeyFormat(apiKey)) {
      throw new Error('Invalid API key format. Please check your Claude API key.');
    }

    // Store in memory
    storedApiKey = apiKey;

    // Store selected model (default to Sonnet 4 if not provided)
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

// Update selected model
async function handleUpdateModel(model: string) {
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

// Analyze the selected Figma component
async function handleAnalyzeComponent() {
  try {
    // Check if API key is available
    if (!storedApiKey) {
      throw new Error('API key not found. Please save your Claude API key first.');
    }

    // Get the current selection
    const selection = figma.currentPage.selection;

    if (selection.length === 0) {
      throw new Error('No component selected. Please select a Figma component to analyze.');
    }

    if (selection.length > 1) {
      throw new Error('Multiple components selected. Please select only one component to analyze.');
    }

    let selectedNode = selection[0];

    // If an instance is selected, get its main component
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
      if (selectedNode.type === 'COMPONENT_SET') {
        throw new Error('This component set has errors. Please fix the variant properties and try again.');
      }
      throw new Error('Please select a Frame, Component, or Instance to analyze');
    }

    // Extract clean component context for metadata
    const componentContext = extractComponentContext(selectedNode);

    // Create metadata prompt
    const prompt = createMetadataPrompt(componentContext);

    // Show loading notification
    figma.notify('Analyzing component with Claude AI...', { timeout: 3000 });

    // Call Claude API
    const analysis = await fetchClaudeAnalysis(prompt, storedApiKey);

    // Parse the JSON response
    let metadata;
    try {
      // Extract JSON from the response (Claude might include some text around it)
      const jsonMatch = analysis.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        metadata = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error('No JSON found in response');
      }

      // Validate metadata structure
      if (!isValidMetadata(metadata)) {
        throw new Error('Invalid metadata structure received');
      }

      // Ensure arrays have default values
      metadata.props = metadata.props || [];
      metadata.states = metadata.states || ['default'];
      metadata.slots = metadata.slots || [];
      metadata.variants = metadata.variants || {};
      metadata.tokens = metadata.tokens || {};

    } catch (parseError) {
      console.error('Failed to parse JSON response:', parseError);
      // Fallback to showing raw analysis
      sendMessageToUI('analysis-result', { analysis });
      sendMessageToUI('analysis-complete', { success: true, message: 'Analysis completed (raw format)' });
      return;
    }

    // Store metadata for later use (variant generation, etc.)
    (globalThis as any).lastAnalyzedMetadata = metadata;
    (globalThis as any).lastAnalyzedNode = selectedNode;

    // Display the analysis result
    figma.notify(`Analysis complete! Check the plugin panel for details.`, { timeout: 5000 });

    // Send the structured metadata to UI for display
    sendMessageToUI('metadata-result', { metadata });

    // Send success message to UI
    sendMessageToUI('analysis-complete', { success: true, message: 'Analysis completed successfully' });

    console.log('Parsed metadata:', metadata);

  } catch (error) {
    console.error('Error during analysis:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    figma.notify(`Analysis failed: ${errorMessage}`, { error: true });
    sendMessageToUI('analysis-error', { error: errorMessage });
  }
}

// Extract detailed information from a Figma node including nested structure
function extractComponentInfo(node: SceneNode): { name: string; structure: any } {
  // Helper function to extract style information
  function extractStyles(node: SceneNode): any {
    const styles: any = {};

    // Extract fill styles
    if ('fills' in node && node.fills && Array.isArray(node.fills)) {
      styles.fills = node.fills.map((fill: any) => ({
        type: fill.type,
        visible: fill.visible,
        opacity: fill.opacity,
        color: fill.type === 'SOLID' ? fill.color : undefined
      }));
    }

    // Extract stroke styles
    if ('strokes' in node && node.strokes && Array.isArray(node.strokes)) {
      styles.strokes = node.strokes.map((stroke: any) => ({
        type: stroke.type,
        visible: stroke.visible,
        opacity: stroke.opacity,
        color: stroke.type === 'SOLID' ? stroke.color : undefined
      }));
      styles.strokeWeight = (node as any).strokeWeight;
      styles.strokeAlign = (node as any).strokeAlign;
    }

    // Extract effects
    if ('effects' in node && node.effects && Array.isArray(node.effects)) {
      styles.effects = node.effects.map((effect: any) => ({
        type: effect.type,
        visible: effect.visible,
        radius: effect.radius,
        offset: effect.offset
      }));
    }

    // Extract corner radius
    if ('cornerRadius' in node) {
      styles.cornerRadius = (node as any).cornerRadius;
    }

    // Extract opacity
    if ('opacity' in node) {
      styles.opacity = (node as any).opacity;
    }

    return styles;
  }

  // Helper function to extract layer hierarchy
  function extractLayerHierarchy(node: SceneNode, depth: number = 0): any {
    if (depth > 5) return null; // Limit depth to prevent excessive recursion

    const layer: any = {
      name: node.name,
      type: node.type,
      visible: node.visible
    };

    // Add dimensions for frame-like nodes
    if ('width' in node && 'height' in node) {
      layer.width = node.width;
      layer.height = node.height;
    }

    // Extract children recursively
    if ('children' in node && node.children && node.children.length > 0) {
      layer.children = node.children.map(child => extractLayerHierarchy(child, depth + 1));
    }

    // Add text content for text nodes
    if (node.type === 'TEXT') {
      layer.characters = (node as TextNode).characters;
    }

    return layer;
  }

  // Build comprehensive info object
  const info: any = {
    name: node.name,
    type: node.type,
    id: node.id
  };

  // Add basic properties
  if (node.type !== 'SLICE') {
    info.visible = node.visible;
    info.locked = node.locked;
  }

  // Add layout properties
  if ('width' in node && 'height' in node) {
    info.width = node.width;
    info.height = node.height;
  }

  // Add position
  if ('x' in node && 'y' in node) {
    info.x = node.x;
    info.y = node.y;
  }

  // Extract detailed style information
  info.styles = extractStyles(node);

  // Extract layer hierarchy (frame structure and nested layers)
  info.layerHierarchy = extractLayerHierarchy(node);

  // Add constraints if available
  if ('constraints' in node) {
    info.constraints = (node as any).constraints;
  }

  // Add layout mode information for frames
  if (node.type === 'FRAME' || node.type === 'COMPONENT' || node.type === 'INSTANCE') {
    const frameNode = node as FrameNode | ComponentNode | InstanceNode;
    if ('layoutMode' in frameNode) {
      info.layoutMode = frameNode.layoutMode;
      if (frameNode.layoutMode !== 'NONE') {
        info.layoutAlign = frameNode.layoutAlign;
        info.itemSpacing = frameNode.itemSpacing;
        info.paddingTop = frameNode.paddingTop;
        info.paddingRight = frameNode.paddingRight;
        info.paddingBottom = frameNode.paddingBottom;
        info.paddingLeft = frameNode.paddingLeft;
      }
    }
  }

  // Add text-specific properties
  if (node.type === 'TEXT') {
    const textNode = node as TextNode;
    info.characters = textNode.characters;
    info.fontSize = textNode.fontSize;
    info.fontName = textNode.fontName;
    info.textAlignHorizontal = textNode.textAlignHorizontal;
    info.textAlignVertical = textNode.textAlignVertical;
    info.lineHeight = textNode.lineHeight;
    info.letterSpacing = textNode.letterSpacing;
  }

  // Add component metadata
  if (node.type === 'COMPONENT') {
    const componentNode = node as ComponentNode;
    info.description = componentNode.description;
    info.documentationLinks = componentNode.documentationLinks;
  }

  // Add instance information
  if (node.type === 'INSTANCE') {
    const instanceNode = node as InstanceNode;
    info.mainComponent = instanceNode.mainComponent ? {
      name: instanceNode.mainComponent.name,
      id: instanceNode.mainComponent.id,
      description: instanceNode.mainComponent.description
    } : null;
  }

  // Detect common patterns (slots, states)
  if ('children' in node && node.children) {
    // Look for common slot patterns
    const potentialSlots = node.children.filter(child =>
      child.name.toLowerCase().includes('slot') ||
      child.name.toLowerCase().includes('icon') ||
      child.name.toLowerCase().includes('content')
    );
    if (potentialSlots.length > 0) {
      info.detectedSlots = potentialSlots.map(slot => slot.name);
    }

    // Detect variant patterns in component sets
    if (node.type === 'COMPONENT_SET') {
      try {
        const componentSet = node as ComponentSetNode;
        info.variantProperties = componentSet.variantGroupProperties;
      } catch (error) {
        console.warn('Could not access variant properties:', error);
        info.variantProperties = {};
      }
    }
  }

  return {
    name: node.name,
    structure: info
  };
}

// Extract clean component context for metadata assistant
function extractComponentContext(node: SceneNode): any {
  const fullInfo = extractComponentInfo(node);

  // Extract clean layer names for better AI understanding
  function getLayerNames(hierarchy: any): string[] {
    const names: string[] = [];
    if (hierarchy.name) names.push(hierarchy.name);
    if (hierarchy.children) {
      hierarchy.children.forEach((child: any) => {
        names.push(...getLayerNames(child));
      });
    }
    return names;
  }

  // Detect potential variants from naming patterns
  function detectVariantPatterns(node: SceneNode): string[] {
    const patterns: string[] = [];
    const name = node.name.toLowerCase();

    // Common variant patterns
    if (name.includes('primary') || name.includes('secondary') || name.includes('tertiary')) {
      patterns.push('variant');
    }
    if (name.includes('small') || name.includes('medium') || name.includes('large')) {
      patterns.push('size');
    }
    if (name.includes('hover') || name.includes('pressed') || name.includes('disabled')) {
      patterns.push('state');
    }
    if (name.includes('icon') || name.includes('text')) {
      patterns.push('content-type');
    }

    return patterns;
  }

  // Build clean context object
  const context = {
    componentName: fullInfo.name,
    componentType: node.type,
    frameStructure: {
      width: fullInfo.structure.width,
      height: fullInfo.structure.height,
      layoutMode: fullInfo.structure.layoutMode || 'NONE'
    },
    nestedLayers: getLayerNames(fullInfo.structure.layerHierarchy),
    detectedStyles: {
      hasFills: fullInfo.structure.styles && fullInfo.structure.styles.fills && fullInfo.structure.styles.fills.length > 0,
      hasStrokes: fullInfo.structure.styles && fullInfo.structure.styles.strokes && fullInfo.structure.styles.strokes.length > 0,
      hasEffects: fullInfo.structure.styles && fullInfo.structure.styles.effects && fullInfo.structure.styles.effects.length > 0,
      cornerRadius: (fullInfo.structure.styles && fullInfo.structure.styles.cornerRadius) || 0
    },
    detectedSlots: fullInfo.structure.detectedSlots || [],
    variantProperties: fullInfo.structure.variantProperties || {},
    potentialVariants: detectVariantPatterns(node),
    isComponentSet: node.type === 'COMPONENT_SET',
    isComponent: node.type === 'COMPONENT',
    isInstance: node.type === 'INSTANCE'
  };

  return context;
}

// Wrapper function for Claude API call with error handling
async function fetchClaudeAnalysis(prompt: string, apiKey: string): Promise<string> {
  try {
    // Call the actual Claude API
    const analysis = await fetchClaude(prompt, apiKey);
    return analysis;

  } catch (error) {
    // If the API call fails, throw the error to be handled by the caller
    console.error('Claude API call failed:', error);
    throw error;
  }
}

// Send message to UI
function sendMessageToUI(type: string, data: any) {
  try {
    figma.ui.postMessage({
      type,
      data
    });
    console.log('Sent message to UI:', type, data);
  } catch (error) {
    console.error('Failed to send message to UI:', type, error);
    // Try to show notification as fallback
    if (type === 'api-key-saved' && data.success) {
      figma.notify('API key saved successfully!');
    }
  }
}

// Generate component variants based on metadata
async function handleGenerateVariants(metadata: any) {
  try {
    // Get the last analyzed node
    const sourceNode = (globalThis as any).lastAnalyzedNode;
    if (!sourceNode) {
      throw new Error('No component was analyzed. Please analyze a component first.');
    }

    // Get the main component (not instance)
    let componentNode = sourceNode;
    if (sourceNode.type === 'INSTANCE') {
      const instance = sourceNode as InstanceNode;
      if (instance.mainComponent) {
        componentNode = instance.mainComponent;
        figma.notify('Using main component for generation...', { timeout: 2000 });
      } else {
        throw new Error('Cannot generate variants: Instance has no main component');
      }
    }

    // Check if source is a component
    if (componentNode.type !== 'COMPONENT') {
      throw new Error('Please select a component to generate variants. Selected node type: ' + componentNode.type);
    }

    const component = componentNode as ComponentNode;

    // Try to update component metadata (may fail in read-only mode)
    let metadataUpdated = false;
    try {
      // Update component description with metadata
      const metadataDescription = `AI Design Co-Pilot Metadata:
Component: ${metadata.component}
Description: ${metadata.description}
States: ${metadata.states.join(', ')}
Props: ${metadata.props.join(', ')}
${metadata.slots && metadata.slots.length > 0 ? `Slots: ${metadata.slots.join(', ')}` : ''}
Usage: ${metadata.usage}
${metadata.accessibility ? `Accessibility: ${metadata.accessibility}` : ''}`;

      // Preserve existing description if any
      const existingDesc = component.description;
      if (existingDesc && !existingDesc.includes('AI Design Co-Pilot Metadata:')) {
        component.description = metadataDescription + '\n\n---\nOriginal Description:\n' + existingDesc;
      } else {
        component.description = metadataDescription;
      }

      // Store full metadata in plugin data
      const metadataString = JSON.stringify(metadata, null, 2);
      component.setPluginData('ai-design-copilot-metadata', metadataString);

      metadataUpdated = true;
    } catch (error) {
      console.warn('Could not update component metadata (might be read-only):', error);
    }

    // Create main container frame
    const containerFrame = figma.createFrame();
    containerFrame.name = `${component.name} - Variants Grid`;
    containerFrame.x = (component.x || 0) + (component.width || 100) + 100;
    containerFrame.y = component.y || 0;

    // Style the container
    containerFrame.fills = [{ type: 'SOLID', color: { r: 0.05, g: 0.05, b: 0.05 } }];
    containerFrame.strokes = [];
    containerFrame.cornerRadius = 8;
    containerFrame.layoutMode = 'NONE';

    let totalInstances = 0;
    const cellPadding = 40;
    const cellSpacing = 2; // Space between cells for grid lines effect
    const labelHeight = 40;
    let currentX = cellPadding;
    let currentY = cellPadding + labelHeight;
    let containerWidth = cellPadding * 2;
    let containerHeight = cellPadding * 2 + labelHeight;

    try {
      // Load fonts
      await figma.loadFontAsync({ family: "Inter", style: "Medium" });
      await figma.loadFontAsync({ family: "Inter", style: "Regular" });

      // 1. Create States Section
      if (metadata.states && metadata.states.length > 0) {
        // Create states label
        const statesLabel = figma.createText();
        statesLabel.fontName = { family: "Inter", style: "Medium" };
        statesLabel.fontSize = 14;
        statesLabel.characters = "STATES";
        statesLabel.fills = [{ type: 'SOLID', color: { r: 0.6, g: 0.6, b: 0.6 } }];
        statesLabel.x = currentX;
        statesLabel.y = cellPadding;
        containerFrame.appendChild(statesLabel);

        let maxStateWidth = 0;
        const stateStartY = currentY;

        for (const state of metadata.states) {
          try {
            // Create cell frame for each state
            const cellFrame = figma.createFrame();
            cellFrame.name = `Cell - ${state}`;
            cellFrame.fills = [{ type: 'SOLID', color: { r: 0.1, g: 0.1, b: 0.1 } }];
            cellFrame.strokes = [{ type: 'SOLID', color: { r: 0.2, g: 0.2, b: 0.2 } }];
            cellFrame.strokeWeight = 1;
            cellFrame.cornerRadius = 4;

            // Create instance
            const instance = component.createInstance();
            instance.name = `${component.name} / ${state}`;

            // Apply state-specific styling
            if (state.toLowerCase() !== 'default') {
              applyStateOverrides(instance, state, metadata);
            }

            // Size the cell to fit the instance with padding
            const instancePadding = 20;
            const cellWidth = (instance.width || 100) + instancePadding * 2;
            const cellHeight = (instance.height || 40) + instancePadding * 2;
            cellFrame.resize(cellWidth, cellHeight);
            cellFrame.x = currentX;
            cellFrame.y = currentY;

            // Position instance in center of cell
            instance.x = instancePadding;
            instance.y = instancePadding;
            cellFrame.appendChild(instance);

            // Add state label inside cell
            const stateLabel = figma.createText();
            stateLabel.fontName = { family: "Inter", style: "Regular" };
            stateLabel.fontSize = 11;
            stateLabel.characters = state;
            stateLabel.fills = [{ type: 'SOLID', color: { r: 0.5, g: 0.5, b: 0.5 } }];
            stateLabel.x = instancePadding;
            stateLabel.y = cellHeight - instancePadding + 5;
            cellFrame.appendChild(stateLabel);

            containerFrame.appendChild(cellFrame);

            maxStateWidth = Math.max(maxStateWidth, cellFrame.width || cellWidth);
            currentY += cellHeight + cellSpacing;
            totalInstances++;
          } catch (instanceError) {
            console.error(`Could not create instance for state ${state}:`, instanceError);
          }
        }

        // Update container dimensions
        containerWidth = Math.max(containerWidth, currentX + maxStateWidth + cellPadding);
        containerHeight = Math.max(containerHeight, currentY + cellPadding);

        // Move to next column
        currentX += maxStateWidth + cellPadding;
        currentY = cellPadding + labelHeight;
      }

      // 2. Create Variants Section
      if (metadata.variants && Object.keys(metadata.variants).length > 0) {
        // Create variants label
        const variantsLabel = figma.createText();
        variantsLabel.fontName = { family: "Inter", style: "Medium" };
        variantsLabel.fontSize = 14;
        variantsLabel.characters = "VARIANTS";
        variantsLabel.fills = [{ type: 'SOLID', color: { r: 0.6, g: 0.6, b: 0.6 } }];
        variantsLabel.x = currentX;
        variantsLabel.y = cellPadding;
        containerFrame.appendChild(variantsLabel);

        // Generate all combinations of variants
        const variantCombinations = generateVariantCombinations(metadata.variants);

        // Determine grid layout
        const numCombinations = variantCombinations.length;
        let cols = 3;
        if (numCombinations <= 2) cols = numCombinations;
        else if (numCombinations <= 4) cols = 2;
        else if (numCombinations <= 9) cols = 3;
        else cols = 4;

        const variantStartX = currentX;
        let maxRowHeight = 0;
        let currentRow = 0;

        for (let index = 0; index < variantCombinations.length; index++) {
          const combination = variantCombinations[index];
          const col = index % cols;
          const row = Math.floor(index / cols);

          // Start new row
          if (row !== currentRow) {
            currentY += maxRowHeight + cellSpacing;
            maxRowHeight = 0;
            currentRow = row;
          }

          try {
            // Create cell frame
            const cellFrame = figma.createFrame();
            const variantNames = Object.entries(combination)
              .map(([key, value]) => `${value}`)
              .join(' / ');
            cellFrame.name = `Cell - ${variantNames}`;
            cellFrame.fills = [{ type: 'SOLID', color: { r: 0.1, g: 0.1, b: 0.1 } }];
            cellFrame.strokes = [{ type: 'SOLID', color: { r: 0.2, g: 0.2, b: 0.2 } }];
            cellFrame.strokeWeight = 1;
            cellFrame.cornerRadius = 4;

            // Create instance
            const instance = component.createInstance();
            instance.name = `${component.name} / ${variantNames}`;

            // Apply variant-specific styling
            applyVariantStyles(instance, combination, metadata);

            // Size the cell
            const instancePadding = 20;
            const cellWidth = (instance.width || 100) + instancePadding * 2;
            const cellHeight = (instance.height || 40) + instancePadding * 2 + 20; // Extra space for label

            cellFrame.resize(cellWidth, cellHeight);
            cellFrame.x = variantStartX + (col * (cellWidth + cellSpacing));
            cellFrame.y = currentY;

            // Position instance in cell
            instance.x = instancePadding;
            instance.y = instancePadding;
            cellFrame.appendChild(instance);

            // Add variant label
            const variantLabel = figma.createText();
            variantLabel.fontName = { family: "Inter", style: "Regular" };
            variantLabel.fontSize = 10;
            variantLabel.characters = variantNames;
            variantLabel.fills = [{ type: 'SOLID', color: { r: 0.5, g: 0.5, b: 0.5 } }];
            variantLabel.x = instancePadding;
            variantLabel.y = cellHeight - instancePadding + 2;
            cellFrame.appendChild(variantLabel);

            containerFrame.appendChild(cellFrame);

            maxRowHeight = Math.max(maxRowHeight, cellHeight);
            totalInstances++;

            // Update container width
            containerWidth = Math.max(containerWidth, cellFrame.x + cellWidth + cellPadding);
          } catch (variantError) {
            console.error(`Could not create variant instance:`, variantError);
          }
        }

        // Update final container height
        containerHeight = Math.max(containerHeight, currentY + maxRowHeight + cellPadding);
      }

      // 3. Apply slot placeholders if needed
      if (metadata.slots && metadata.slots.length > 0) {
        // Find all instances in the container
        function findAllInstances(parent: SceneNode): InstanceNode[] {
          const instances: InstanceNode[] = [];
          if (parent.type === 'INSTANCE') {
            instances.push(parent as InstanceNode);
          }
          if ('children' in parent && parent.children) {
            for (const child of parent.children) {
              instances.push(...findAllInstances(child));
            }
          }
          return instances;
        }

        const allInstances = findAllInstances(containerFrame);
        for (const instance of allInstances) {
          await applySlotPlaceholders(instance, metadata.slots);
        }
      }

      // Resize container to fit all content
      containerFrame.resize(containerWidth, containerHeight);

      // Add container to parent
      if (component.parent) {
        component.parent.appendChild(containerFrame);
      }

      // Select component and grid
      figma.currentPage.selection = [component, containerFrame];
      figma.viewport.scrollAndZoomIntoView([component, containerFrame]);

    } catch (error) {
      console.error('Error creating grid layout:', error);
      // Clean up container if something went wrong
      containerFrame.remove();
      throw error;
    }

    // Send success message
    let message: string;
    if (totalInstances > 0) {
      message = `✅ Generated ${totalInstances} component instances in organized grid!`;
      if (metadataUpdated) {
        message += ' Component metadata also updated.';
      }
    } else {
      message = '⚠️ Could not generate instances (file might be read-only)';
    }

    figma.notify(message, { timeout: 4000 });
    sendMessageToUI('variants-generated', {
      success: totalInstances > 0,
      count: totalInstances,
      message
    });

  } catch (error) {
    console.error('Error generating variants:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    figma.notify(`Failed to generate variants: ${errorMessage}`, { error: true });
    sendMessageToUI('variants-generated', { success: false, error: errorMessage });
  }
}

// Generate all combinations of variants
function generateVariantCombinations(variants: any): any[] {
  const keys = Object.keys(variants);
  if (keys.length === 0) return [];

  const combinations: any[] = [];

  function generateCombination(index: number, current: any) {
    if (index === keys.length) {
      combinations.push({ ...current });
      return;
    }

    const key = keys[index];
    const values = variants[key];

    if (Array.isArray(values)) {
      for (const value of values) {
        current[key] = value;
        generateCombination(index + 1, current);
      }
    } else {
      current[key] = values;
      generateCombination(index + 1, current);
    }
  }

  generateCombination(0, {});
  return combinations;
}

// Apply variant-specific styling
function applyVariantStyles(instance: InstanceNode, combination: any, metadata: any) {
  // Apply size variants
  if (combination.size) {
    const sizeMap: any = {
      'small': 0.8,
      'medium': 1,
      'large': 1.2,
      'xl': 1.5
    };

    const scale = sizeMap[combination.size.toLowerCase()] || 1;
    if (scale !== 1) {
      instance.resize(
        (instance.width || 100) * scale,
        (instance.height || 40) * scale
      );
    }
  }

  // Apply variant style (primary, secondary, etc.)
  if (combination.variant) {
    const variant = combination.variant.toLowerCase();

    // Helper function to modify fills
    function modifyFills(node: SceneNode, modifier: (fill: Paint) => Paint | null) {
      if ('fills' in node && Array.isArray(node.fills)) {
        const newFills = node.fills.map(fill => {
          if (fill.type === 'SOLID') {
            const modified = modifier(fill);
            return modified || fill;
          }
          return fill;
        }).filter(Boolean) as Paint[];

        if (newFills.length > 0) {
          node.fills = newFills;
        }
      }

      if ('children' in node && node.children) {
        node.children.forEach(child => modifyFills(child, modifier));
      }
    }

    if (variant === 'primary') {
      // Keep default styling
    } else if (variant === 'secondary') {
      // Lighter background, darker text
      modifyFills(instance, (fill) => {
        if (fill.type === 'SOLID' && fill.color) {
          // Check if it's likely a background (lighter color)
          const brightness = (fill.color.r + fill.color.g + fill.color.b) / 3;
          if (brightness > 0.5) {
            // Make it very light
            return {
              ...fill,
              color: { r: 0.95, g: 0.95, b: 0.98 }
            };
          } else {
            // Make text darker
            return {
              ...fill,
              color: { r: 0.2, g: 0.2, b: 0.3 }
            };
          }
        }
        return fill;
      });

      // Add border
      if ('strokes' in instance) {
        instance.strokes = [{
          type: 'SOLID',
          color: { r: 0.8, g: 0.8, b: 0.85 },
          opacity: 1
        }];
        (instance as any).strokeWeight = 1;
        (instance as any).strokeAlign = 'INSIDE';
      }
    } else if (variant === 'tertiary' || variant === 'ghost') {
      // Transparent background
      modifyFills(instance, (fill) => {
        if (fill.type === 'SOLID' && fill.color) {
          const brightness = (fill.color.r + fill.color.g + fill.color.b) / 3;
          if (brightness > 0.5) {
            // Make background transparent
            return {
              ...fill,
              opacity: 0
            };
          }
        }
        return fill;
      });
    }
  }

  // Apply icon variants
  if (combination.hasIcon !== undefined) {
    // This is handled by slot placeholders
  }
}

// Apply visual overrides based on state
function applyStateOverrides(instance: InstanceNode, state: string, metadata: any) {
  const stateLower = state.toLowerCase();

  // Helper function to find and modify all fills recursively
  function modifyFills(node: SceneNode, modifier: (fill: Paint) => Paint | null) {
    if ('fills' in node && Array.isArray(node.fills)) {
      const newFills = node.fills.map(fill => {
        if (fill.type === 'SOLID') {
          const modified = modifier(fill);
          return modified || fill;
        }
        return fill;
      }).filter(Boolean) as Paint[];

      if (newFills.length > 0) {
        node.fills = newFills;
      }
    }

    if ('children' in node && node.children) {
      node.children.forEach(child => modifyFills(child, modifier));
    }
  }

  // Helper function to add stroke
  function addStroke(node: SceneNode, color: RGB, weight: number) {
    if ('strokes' in node) {
      node.strokes = [{
        type: 'SOLID',
        color: color,
        opacity: 1
      }];
      (node as any).strokeWeight = weight;
    }
  }

  // Common state patterns with visual modifications
  if (stateLower === 'hover') {
    // Lighten fills slightly
    modifyFills(instance, (fill) => {
      if (fill.type === 'SOLID') {
        return {
          ...fill,
          color: {
            r: Math.min(1, ((fill.color && fill.color.r) || 0) + 0.05),
            g: Math.min(1, ((fill.color && fill.color.g) || 0) + 0.05),
            b: Math.min(1, ((fill.color && fill.color.b) || 0) + 0.05)
          }
        };
      }
      return fill;
    });

    // Add subtle shadow
    if ('effects' in instance) {
      instance.effects = [
        ...(instance.effects || []),
        {
          type: 'DROP_SHADOW',
          color: { r: 0, g: 0, b: 0, a: 0.1 },
          offset: { x: 0, y: 2 },
          radius: 4,
          visible: true,
          blendMode: 'NORMAL'
        } as DropShadowEffect
      ];
    }
  } else if (stateLower === 'pressed' || stateLower === 'active') {
    // Darken fills slightly
    modifyFills(instance, (fill) => {
      if (fill.type === 'SOLID') {
        return {
          ...fill,
          color: {
            r: Math.max(0, ((fill.color && fill.color.r) || 0) - 0.1),
            g: Math.max(0, ((fill.color && fill.color.g) || 0) - 0.1),
            b: Math.max(0, ((fill.color && fill.color.b) || 0) - 0.1)
          }
        };
      }
      return fill;
    });

    // Remove shadows for pressed state
    if ('effects' in instance) {
      instance.effects = (instance.effects || []).filter(effect => effect.type !== 'DROP_SHADOW');
    }
  } else if (stateLower === 'disabled') {
    // Reduce opacity and desaturate
    instance.opacity = 0.5;

    // Convert colors to grayscale
    modifyFills(instance, (fill) => {
      if (fill.type === 'SOLID') {
        const gray = (((fill.color && fill.color.r) || 0) + ((fill.color && fill.color.g) || 0) + ((fill.color && fill.color.b) || 0)) / 3;
        return {
          ...fill,
          color: { r: gray, g: gray, b: gray }
        };
      }
      return fill;
    });
  } else if (stateLower === 'focus' || stateLower === 'focused') {
    // Add focus ring
    if ('strokes' in instance) {
      instance.strokes = [{
        type: 'SOLID',
        color: { r: 0, g: 0.4, b: 0.8 }, // Blue focus ring
        opacity: 1
      }];
      instance.strokeWeight = 2;
      (instance as any).strokeAlign = 'OUTSIDE';
    }
  }

  // Apply size variants if specified
  if (metadata.variants && metadata.variants.size) {
    // This would require more complex logic to scale appropriately
    // For now, we'll keep the original size
  }
}

// Apply slot placeholders to instance
async function applySlotPlaceholders(instance: InstanceNode, slots: string[]) {
  try {
    // Load font for slot labels
    await figma.loadFontAsync({ family: "Inter", style: "Regular" });

    slots.forEach((slotName: string) => {
      const slotLower = slotName.toLowerCase();

      // Find existing layer that might be the slot
      let targetLayer: SceneNode | null = null;

      // Search for layer with matching name
      function findSlotLayer(node: SceneNode): SceneNode | null {
        if (node.name.toLowerCase().includes(slotLower)) {
          return node;
        }
        if ('children' in node && node.children) {
          for (const child of node.children) {
            const found = findSlotLayer(child);
            if (found) return found;
          }
        }
        return null;
      }

      targetLayer = findSlotLayer(instance);

      // If we found a matching layer, enhance it
      if (targetLayer) {
        // Add visual indicator that this is a slot
        if ('fills' in targetLayer && targetLayer.type !== 'TEXT') {
          targetLayer.fills = [{
            type: 'SOLID',
            color: { r: 0.9, g: 0.95, b: 1 }, // Light blue tint
            opacity: 0.5
          }];
        }

        // Add stroke to highlight slot
        if ('strokes' in targetLayer) {
          targetLayer.strokes = [{
            type: 'SOLID',
            color: { r: 0.2, g: 0.6, b: 1 }, // Blue stroke
            opacity: 0.5
          }];
          (targetLayer as any).strokeWeight = 1;
          (targetLayer as any).strokeAlign = 'INSIDE';
          (targetLayer as any).dashPattern = [4, 4];
        }
      } else {
        // Create a new placeholder if no matching layer found
        if ('children' in instance) {
          const placeholder = figma.createFrame();
          placeholder.name = `🔌 ${slotName} Slot`;

          // Position based on slot type
          if (slotLower.includes('icon')) {
            placeholder.resize(24, 24);
            placeholder.x = 8;
            placeholder.y = ((instance.height || 0) - 24) / 2;
          } else if (slotLower.includes('content') || slotLower.includes('body')) {
            placeholder.resize((instance.width || 0) - 32, 40);
            placeholder.x = 16;
            placeholder.y = 32;
          } else {
            // Generic slot
            placeholder.resize(80, 32);
            placeholder.x = 16;
            placeholder.y = 16;
          }

          // Style the placeholder
          placeholder.fills = [{
            type: 'SOLID',
            color: { r: 0.9, g: 0.95, b: 1 },
            opacity: 0.3
          }];
          placeholder.strokes = [{
            type: 'SOLID',
            color: { r: 0.2, g: 0.6, b: 1 },
            opacity: 0.5
          }];
          placeholder.strokeWeight = 1;
          (placeholder as any).strokeAlign = 'INSIDE';
          (placeholder as any).dashPattern = [4, 4];
          (placeholder as any).cornerRadius = 4;

          // Add label
          const label = figma.createText();
          label.fontName = { family: "Inter", style: "Regular" };
          label.fontSize = 10;
          label.characters = slotName;
          label.fills = [{ type: 'SOLID', color: { r: 0.2, g: 0.6, b: 1 } }];
          label.textAlignHorizontal = 'CENTER';
          label.textAlignVertical = 'CENTER';
          label.resize((placeholder.width || 72) - 8, placeholder.height || 24);
          label.x = 4;
          label.y = 4;

          placeholder.appendChild(label);
          instance.appendChild(placeholder);
        }
      }
    });
  } catch (error) {
    console.error('Error applying slot placeholders:', error);
  }
}

// Embed metadata in Figma node
async function handleEmbedMetadata(metadata: any) {
  try {
    // Get the last analyzed node
    let targetNode = (globalThis as any).lastAnalyzedNode;
    if (!targetNode) {
      throw new Error('No component was analyzed. Please analyze a component first.');
    }

    // If it's an instance, get the main component
    if (targetNode.type === 'INSTANCE') {
      const instance = targetNode as InstanceNode;
      if (instance.mainComponent) {
        targetNode = instance.mainComponent;
        figma.notify('Embedding metadata in main component...', { timeout: 2000 });
      }
    }

    // Store metadata in plugin data
    const metadataString = JSON.stringify(metadata, null, 2);
    targetNode.setPluginData('ai-design-copilot-metadata', metadataString);

    // Also add as a description if it's a component
    if (targetNode.type === 'COMPONENT') {
      const componentNode = targetNode as ComponentNode;
      const currentDesc = componentNode.description || '';

      // Add metadata summary to description
      const metadataSummary = `
AI Design Co-Pilot Metadata:
- Component: ${metadata.component}
- Description: ${metadata.description}
- States: ${metadata.states.join(', ')}
- Props: ${metadata.props.join(', ')}
${currentDesc ? '\n\nOriginal description:\n' + currentDesc : ''}
      `.trim();

      componentNode.description = metadataSummary;
    }

    // Create a visual metadata layer as a comment
    if (targetNode.parent) {
      const metadataFrame = figma.createFrame();
      metadataFrame.name = '📋 Metadata: ' + metadata.component;
      metadataFrame.resize(300, 200);
      metadataFrame.x = (targetNode.x || 0) + (targetNode.width || 0) + 32;
      metadataFrame.y = targetNode.y || 0;

      // Style the metadata frame
      metadataFrame.fills = [{ type: 'SOLID', color: { r: 0.95, g: 0.95, b: 0.95 } }];
      metadataFrame.strokes = [{ type: 'SOLID', color: { r: 0.8, g: 0.8, b: 0.8 } }];
      (metadataFrame as any).strokeWeight = 1;
      (metadataFrame as any).cornerRadius = 4;

      // Add text content
      const textNode = figma.createText();
      await figma.loadFontAsync({ family: "Inter", style: "Regular" });
      await figma.loadFontAsync({ family: "Inter", style: "Bold" });

      textNode.fontName = { family: "Inter", style: "Regular" };
      textNode.fontSize = 11;
      textNode.characters = `${metadata.component}\n\n${metadata.description}\n\nStates: ${metadata.states.join(', ')}\nProps: ${metadata.props.join(', ')}`;
      textNode.resize(280, 180);
      (textNode as any).x = 10;
      (textNode as any).y = 10;

      metadataFrame.appendChild(textNode);
      targetNode.parent.appendChild(metadataFrame);
    }

    figma.notify('Metadata embedded successfully!', { timeout: 3000 });
    sendMessageToUI('metadata-embedded', { success: true });

  } catch (error) {
    console.error('Error embedding metadata:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    figma.notify(`Failed to embed metadata: ${errorMessage}`, { error: true });
    sendMessageToUI('metadata-embedded', { success: false, error: errorMessage });
  }
}

// Create component properties based on metadata
async function createComponentProperties(component: ComponentNode, metadata: any) {
  // Note: Figma's component properties API is limited in plugins
  // We can't directly create properties like in the UI, but we can:
  // 1. Add descriptions and documentation
  // 2. Create variant combinations as separate components
  // 3. Use naming conventions that developers can parse

  console.log('Metadata suggests these properties:', metadata.props);
  console.log('Metadata suggests these variants:', metadata.variants);

  // Add a note about the suggested properties in the component description
  if (!component.description.includes('Suggested Properties:')) {
    const propsList = metadata.props ? metadata.props.join(', ') : 'none';
    const currentDesc = component.description || '';
    component.description = currentDesc + `\n\nSuggested Properties: ${propsList}`;
  }

  // For actual variant properties, we need to create a component set
  // This is handled by the variant generation below
  figma.notify('📝 Component properties documented. Use variant instances for different states.', { timeout: 3000 });
}

// Clear the saved API key
async function handleClearApiKey() {
  try {
    // Clear from memory
    storedApiKey = null;

    // Clear from persistent storage
    await figma.clientStorage.deleteAsync('claude-api-key');

    console.log('API key cleared successfully');
    sendMessageToUI('api-key-status', { hasKey: false });
    figma.notify('API key cleared', { timeout: 2000 });

  } catch (error) {
    console.error('Error clearing API key:', error);
    figma.notify('Failed to clear API key', { error: true });
  }
}

// Handle plugin closure
figma.on('close', () => {
  // Clean up any resources if needed
  console.log('AI Design Co-Pilot plugin closed');
});

// Handle saving collaboration notes
async function handleSaveCollabNotes(notes: string) {
  try {
    // Get the last analyzed node
    const lastNode = (globalThis as any).lastAnalyzedNode;
    if (!lastNode) {
      throw new Error('No component was analyzed. Please analyze a component first.');
    }

    // Create a notes indicator visually attached to the component
    await createNotesIndicator(lastNode, notes);

    figma.notify('Notes saved successfully with visual indicator', { timeout: 2000 });
    sendMessageToUI('notes-saved', { success: true });

  } catch (error) {
    console.error('Error saving notes:', error);
    figma.notify('Failed to save notes', { error: true });
    sendMessageToUI('notes-saved', { success: false, error: error instanceof Error ? error.message : 'Unknown error' });
  }
}

// Create visual indicator for saved notes
async function createNotesIndicator(node: SceneNode, notes: string) {
  try {
    // Load font
    await figma.loadFontAsync({ family: "Inter", style: "Medium" });

    // Create new indicator (simplified - always create new)
    const indicator = figma.createFrame();
    indicator.name = '📝 Component Notes';
    indicator.resize(200, 32);

    // Position near the component
    indicator.x = (node.x || 0) + (node.width || 100) + 20;
    indicator.y = (node.y || 0) - 40;

    // Style the indicator
    indicator.fills = [{ type: 'SOLID', color: { r: 1, g: 0.98, b: 0.88 } }]; // Light yellow
    indicator.strokes = [{ type: 'SOLID', color: { r: 1, g: 0.8, b: 0 } }]; // Orange border
    (indicator as any).strokeWeight = 1;
    (indicator as any).cornerRadius = 4;
    (indicator as any).effects = [{
      type: 'DROP_SHADOW',
      visible: true,
      color: { r: 0, g: 0, b: 0, a: 0.1 },
      offset: { x: 0, y: 2 },
      radius: 4,
      blendMode: 'NORMAL'
    }];

    // Add text
    const text = figma.createText();
    text.fontName = { family: "Inter", style: "Medium" };
    text.fontSize = 11;
    text.characters = `📝 Notes: ${notes.substring(0, 50)}${notes.length > 50 ? '...' : ''}`;
    text.fills = [{ type: 'SOLID', color: { r: 0.4, g: 0.3, b: 0 } }];
    text.x = 8;
    text.y = 10;
    text.resize(184, 12);

    indicator.appendChild(text);

    // Add to the same parent as the component
    if (node.parent) {
      node.parent.appendChild(indicator);
    }

    // Store the indicator ID for future updates
    node.setPluginData('ai-design-copilot-notes-indicator-id', indicator.id);

  } catch (error) {
    console.error('Error creating notes indicator:', error);
  }
}

// Enhanced analysis with proper audit features
async function handleEnhancedAnalyze(options: any) {
  try {
    // Check if API key is available
    if (!storedApiKey) {
      throw new Error('API key not found. Please save your Claude API key first.');
    }

    // Get the current selection
    const selection = figma.currentPage.selection;

    if (selection.length === 0) {
      throw new Error('No component selected. Please select a Figma component to analyze.');
    }

    // Single component analysis (batch mode can be added later)
    let selectedNode = selection[0];

    // If an instance is selected, get its main component
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

    // Create enhanced metadata prompt
    const prompt = createMetadataPrompt(componentContext);

    // Show loading notification
    figma.notify('Performing enhanced analysis with Claude AI...', { timeout: 3000 });

    // Call Claude API
    const analysis = await fetchClaudeAnalysis(prompt, storedApiKey);

    // Parse the JSON response
    let enhancedData;
    try {
      // Extract JSON from the response
      const jsonMatch = analysis.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        enhancedData = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error('No JSON found in response');
      }

      // Process the enhanced data
      const result = processEnhancedAnalysis(enhancedData, selectedNode);

      // Debug logging
      console.log('Raw Claude response data:', enhancedData);
      console.log('Processed analysis result:', result);
      console.log('Audit data being sent:', result.audit);

      // Store metadata for later use
      (globalThis as any).lastAnalyzedMetadata = result.metadata;
      (globalThis as any).lastAnalyzedNode = selectedNode;

      // Send the enhanced results to UI
      sendMessageToUI('enhanced-analysis-result', result);

      // Don't send metadata-result as it causes the UI to overwrite with fallback data
      sendMessageToUI('analysis-complete', { success: true, message: 'Enhanced analysis completed successfully' });

      figma.notify('Enhanced analysis complete!', { timeout: 3000 });

    } catch (parseError) {
      console.error('Failed to parse enhanced response:', parseError);
      throw new Error('Failed to parse analysis results');
    }

  } catch (error) {
    console.error('Error during enhanced analysis:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    figma.notify(`Analysis failed: ${errorMessage}`, { error: true });
    sendMessageToUI('analysis-error', { error: errorMessage });
  }
}

// Process enhanced analysis data with proper audit scoring
function processEnhancedAnalysis(data: any, node: SceneNode): any {
  // Extract audit results with proper scoring
  const audit: {
    states: any[];
    accessibility: any[];
    naming: any[];
    consistency: any[];
  } = {
    states: [],
    accessibility: [],
    naming: [],
    consistency: []
  };

  // Check for missing states - be more critical
  const expectedStates = ['default', 'hover', 'focus', 'disabled', 'pressed', 'active'];
  const foundStates = data.states || [];

  expectedStates.forEach(state => {
    audit.states.push({
      name: state,
      found: foundStates.includes(state)
    });
  });

  // Process accessibility audit - default to having issues for simple components
  if (data.audit && data.audit.accessibilityIssues && data.audit.accessibilityIssues.length > 0) {
    data.audit.accessibilityIssues.forEach((issue: string) => {
      audit.accessibility.push({
        check: issue,
        status: 'fail',
        suggestion: 'Fix required'
      });
    });
  } else {
    // Default accessibility issues for simple components
    audit.accessibility.push({
      check: 'Focus indicator',
      status: 'fail',
      suggestion: 'Add focus indicator for keyboard navigation'
    });
    audit.accessibility.push({
      check: 'ARIA labels',
      status: 'warning',
      suggestion: 'Consider adding ARIA labels for screen readers'
    });
  }

  // Process naming convention audit
  if (data.audit && data.audit.namingIssues && data.audit.namingIssues.length > 0) {
    data.audit.namingIssues.forEach((issue: string) => {
      const parts = issue.split(' should be ');
      const layer = parts[0]?.replace(/['"]/g, '').trim() || 'Unknown layer';
      const suggestion = parts[1]?.replace(/['"]/g, '').trim() || null;

      audit.naming.push({
        layer: layer,
        name: layer,
        valid: false,
        suggestion: suggestion
      });
    });
  }

  // Add consistency issues if missing
  if (data.audit && data.audit.consistencyIssues && data.audit.consistencyIssues.length > 0) {
    audit.consistency = data.audit.consistencyIssues.map((issue: string) => ({
      check: issue,
      status: 'warning'
    }));
  }

  // Generate property cheat sheet - 100% AI-driven, no hard-coded fallbacks
  const properties = data.propertyCheatSheet || [];

  // If Claude didn't provide detailed properties but provided props, ask for clarification
  if (properties.length === 0 && data.props && data.props.length > 0) {
    console.log('Claude provided props but no propertyCheatSheet. Props found:', data.props);
  }

  // If no properties at all, that's valid - some components may not have configurable properties
  if (properties.length === 0) {
    console.log('No properties generated by AI - this component may not have configurable properties');
  }

  console.log('Properties being sent (100% AI-generated):', properties);

  // Extract real design tokens from the component
  const extractedTokens = extractDesignTokensFromNode(node);

  console.log('Extracted tokens from node:', extractedTokens);

  const tokens = {
    colors: extractedTokens.colors.length > 0 ? extractedTokens.colors : [],
    spacing: extractedTokens.spacing.length > 0 ? extractedTokens.spacing : [],
    typography: extractedTokens.typography.length > 0 ? extractedTokens.typography : []
  };

  console.log('Final tokens being sent to UI:', tokens);

  return {
    metadata: {
      component: data.component,
      description: data.description,
      props: data.props || [],
      states: data.states || [],
      slots: data.slots || [],
      variants: data.variants || {},
      usage: data.usage,
      accessibility: data.accessibility,
      tokens: data.tokens || {}
    },
    audit: audit,
    properties: properties,
    tokens: tokens
  };
}

// Extract real design tokens from the component with better detection
function extractDesignTokensFromNode(node: SceneNode): { colors: any[], spacing: any[], typography: any[] } {
  const colors: any[] = [];
  const spacing: any[] = [];
  const typography: any[] = [];
  const colorSet = new Set<string>();
  const spacingSet = new Set<number>();
  const typographySet = new Set<string>();

  function rgbToHex(r: number, g: number, b: number): string {
    const toHex = (n: number) => {
      const hex = Math.round(n * 255).toString(16);
      return hex.length === 1 ? '0' + hex : hex;
    };
    return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
  }

  function traverseNode(currentNode: SceneNode) {
    // Extract colors from fills
    if ('fills' in currentNode && currentNode.fills && Array.isArray(currentNode.fills)) {
      currentNode.fills.forEach((fill: any) => {
        if (fill.type === 'SOLID' && fill.visible !== false && fill.color) {
          const hex = rgbToHex(fill.color.r, fill.color.g, fill.color.b);
          if (!colorSet.has(hex)) {
            colorSet.add(hex);
            colors.push({
              name: `fill-color-${colors.length + 1}`,
              value: hex,
              type: 'fill'
            });
          }
        }
      });
    }

    // Extract colors from strokes
    if ('strokes' in currentNode && currentNode.strokes && Array.isArray(currentNode.strokes)) {
      currentNode.strokes.forEach((stroke: any) => {
        if (stroke.type === 'SOLID' && stroke.visible !== false && stroke.color) {
          const hex = rgbToHex(stroke.color.r, stroke.color.g, stroke.color.b);
          if (!colorSet.has(hex)) {
            colorSet.add(hex);
            colors.push({
              name: `stroke-color-${colors.length + 1}`,
              value: hex,
              type: 'stroke'
            });
          }
        }
      });
    }

    // Extract spacing from layout properties
    if ('paddingLeft' in currentNode) {
      const node = currentNode as any;
      const paddings = [node.paddingLeft, node.paddingRight, node.paddingTop, node.paddingBottom];
      paddings.forEach((padding, index) => {
        if (padding && padding > 0 && !spacingSet.has(padding)) {
          spacingSet.add(padding);
          const sides = ['left', 'right', 'top', 'bottom'];
          spacing.push({
            name: `padding-${sides[index]}-${padding}`,
            value: `${padding}px`,
            type: 'padding'
          });
        }
      });
    }

    if ('itemSpacing' in currentNode) {
      const gap = (currentNode as any).itemSpacing;
      if (gap && gap > 0 && !spacingSet.has(gap)) {
        spacingSet.add(gap);
        spacing.push({
          name: `gap-${gap}`,
          value: `${gap}px`,
          type: 'gap'
        });
      }
    }

    // Extract typography from text nodes
    if (currentNode.type === 'TEXT') {
      const textNode = currentNode as TextNode;
      const fontSize = textNode.fontSize as number;
      const fontName = textNode.fontName as any;

      if (fontName && fontSize) {
        const typographyKey = `${fontName.family}-${fontName.style}-${fontSize}`;
        if (!typographySet.has(typographyKey)) {
          typographySet.add(typographyKey);
          typography.push({
            name: `text-${typography.length + 1}`,
            size: `${fontSize}px`,
            weight: fontName.style?.toLowerCase().includes('bold') ? '700' :
                   fontName.style?.toLowerCase().includes('medium') ? '500' : '400',
            family: fontName.family
          });
        }
      }
    }

    // Traverse children
    if ('children' in currentNode) {
      currentNode.children.forEach(child => traverseNode(child));
    }
  }

  traverseNode(node);

  // Sort spacing by value
  spacing.sort((a, b) => parseInt(a.value) - parseInt(b.value));

  return { colors, spacing, typography };
}
