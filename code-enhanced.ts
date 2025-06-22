// Enhanced Main Plugin Thread for AI Design Co-Pilot Figma Plugin
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

// Create an enhanced metadata assistant prompt with audit capabilities
function createEnhancedMetadataPrompt(componentContext: any): string {
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

Based on this component structure, generate comprehensive metadata that follows design system best practices.

Return ONLY a valid JSON object with this exact structure:
{
  "component": "ComponentName",
  "description": "Brief description of the component's purpose",
  "props": ["prop1", "prop2", "prop3"],
  "states": ["default", "hover", "pressed", "disabled", "focus"],
  "slots": ["icon", "label", "content"],
  "variants": {
    "size": ["small", "medium", "large"],
    "variant": ["primary", "secondary", "tertiary"],
    "hasIcon": [true, false]
  },
  "usage": "Usage guidelines and best practices",
  "accessibility": "Accessibility considerations",
  "tokens": {
    "spacing": ["spacing-xs", "spacing-sm"],
    "colors": ["primary-500", "neutral-700"],
    "typography": ["body-md", "label-sm"]
  },
  "audit": {
    "missingStates": ["focus", "error"],
    "namingIssues": ["layer1 should be 'icon-container'"],
    "accessibilityIssues": ["Missing focus indicator", "Low contrast ratio"],
    "consistencyIssues": ["Inconsistent spacing values"]
  },
  "propertyCheatSheet": [
    {
      "name": "size",
      "values": ["sm", "md", "lg"],
      "default": "md",
      "description": "Controls the overall size of the component"
    }
  ]
}

Consider the component's name, structure, and common design patterns. If this appears to be a button, card, input, or other common UI element, provide appropriate metadata for that component type.

Include comprehensive audit information identifying missing states, naming convention issues, accessibility problems, and design consistency issues.
  `.trim();
}

// Send a prompt to Claude API and get a response
async function fetchClaude(prompt: string, apiKey: string): Promise<string> {
  console.log('Making Claude API call directly...');

  // Direct API endpoint for Anthropic
  const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';

  // Prepare the request payload for Anthropic API
  const requestBody = {
    model: 'claude-3-opus-20240229',
    messages: [
      {
        role: 'user',
        content: prompt.trim()
      }
    ],
    max_tokens: 2048 // Increased for more comprehensive responses
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
const PLUGIN_WINDOW_SIZE = { width: 400, height: 700 };

// In-memory storage for API key (in production, consider using clientStorage)
let storedApiKey: string | null = null;

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
    const savedKey = await figma.clientStorage.getAsync('claude-api-key');
    if (savedKey && isValidApiKeyFormat(savedKey)) {
      storedApiKey = savedKey;
      console.log('Loaded saved API key from storage');
    }
  } catch (error) {
    console.error('Error loading saved API key:', error);
  }

  // Check current selection
  checkSelectionForBatchMode();
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
        await handleSaveApiKey(data.apiKey);
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

      case 'save-collab-notes':
        await handleSaveCollabNotes(data.notes);
        break;

      case 'embed-metadata':
        await handleEmbedMetadata(data.metadata);
        break;

      case 'clear-api-key':
        await handleClearApiKey();
        break;

      case 'add-state':
        await handleAddState(data);
        break;

      case 'fix-accessibility':
        await handleFixAccessibility(data);
        break;

      case 'fix-naming':
        await handleFixNaming(data);
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

// Save API key to memory and persistent storage
async function handleSaveApiKey(apiKey: string) {
  try {
    // Validate API key format
    if (!isValidApiKeyFormat(apiKey)) {
      throw new Error('Invalid API key format. Claude API keys should start with "sk-ant-" and be at least 40 characters long');
    }

    // Store the API key in memory
    storedApiKey = apiKey;

    // Persist the API key to client storage
    await figma.clientStorage.setAsync('claude-api-key', apiKey);

    console.log('API key saved successfully to persistent storage');
    sendMessageToUI('api-key-saved', { success: true });

  } catch (error) {
    console.error('Error saving API key:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    sendMessageToUI('api-key-saved', { success: false, error: errorMessage });
  }
}

// Enhanced analysis with audit features
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

    // Handle batch mode
    if (options.batchMode && selection.length > 1) {
      await handleBatchAnalysis(selection, options);
      return;
    }

    // Single component analysis
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
    const prompt = createEnhancedMetadataPrompt(componentContext);

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

      // Store metadata for later use
      (globalThis as any).lastAnalyzedMetadata = result.metadata;
      (globalThis as any).lastAnalyzedNode = selectedNode;

      // Send the enhanced results to UI
      sendMessageToUI('enhanced-analysis-result', result);

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

// Process enhanced analysis data
function processEnhancedAnalysis(data: any, node: SceneNode): any {
  // Extract audit results
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

  // Check for missing states
  const expectedStates = ['default', 'hover', 'focus', 'disabled', 'pressed'];
  const foundStates = data.states || [];

  expectedStates.forEach(state => {
    (audit.states as any[]).push({
      name: state,
      found: foundStates.includes(state)
    });
  });

  // Process accessibility audit
  if (data.audit && data.audit.accessibilityIssues) {
    data.audit.accessibilityIssues.forEach((issue: string) => {
      audit.accessibility.push({
        check: issue,
        status: 'fail',
        suggestion: 'Fix required'
      });
    });
  } else {
    audit.accessibility.push({
      check: 'Color contrast',
      status: 'pass',
      suggestion: null
    });
  }

  // Process naming convention audit
  if (data.audit && data.audit.namingIssues) {
    data.audit.namingIssues.forEach((issue: string) => {
      const [layer, suggestion] = issue.split(' should be ');
      // Extract just the layer name without quotes
      const cleanLayer = layer.replace(/['"]/g, '').trim();
      audit.naming.push({
        layer: cleanLayer,
        name: cleanLayer,
        valid: false,
        suggestion: suggestion ? suggestion.replace(/['"]/g, '').trim() : null
      });
    });
  }

  // Generate property cheat sheet
  const properties = data.propertyCheatSheet || [];

  // Generate token suggestions with visual previews
  const tokens = {
    colors: [],
    spacing: [],
    typography: []
  };

  // Extract real design tokens from the component
  const extractedTokens = extractDesignTokensFromNode(node);

  if (data.tokens) {
    // Use real colors from the component
    if (data.tokens.colors && extractedTokens.colors.length > 0) {
      tokens.colors = extractedTokens.colors.slice(0, 5); // Limit to 5 tokens
    } else if (data.tokens.colors) {
      // Fallback to mock if no real colors found
      tokens.colors = data.tokens.colors.map((name: string) => ({
        name: name,
        value: getColorValueForToken(name)
      }));
    }

    // Use real spacing from the component
    if (data.tokens.spacing && extractedTokens.spacing.length > 0) {
      tokens.spacing = extractedTokens.spacing.slice(0, 5); // Limit to 5 tokens
    } else if (data.tokens.spacing) {
      // Fallback to mock if no real spacing found
      tokens.spacing = data.tokens.spacing.map((name: string) => ({
        name: name,
        value: getSpacingValueForToken(name)
      }));
    }

    // Use real typography from the component
    if (data.tokens.typography && extractedTokens.typography.length > 0) {
      tokens.typography = extractedTokens.typography.slice(0, 5); // Limit to 5 tokens
    } else if (data.tokens.typography) {
      // Fallback to mock if no real typography found
      tokens.typography = data.tokens.typography.map((name: string) => ({
        name: name,
        size: getTypographyValueForToken(name).size,
        weight: getTypographyValueForToken(name).weight
      }));
    }
  }

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

// Extract real design tokens from the component
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
    // Extract colors
    if ('fills' in currentNode && currentNode.fills && Array.isArray(currentNode.fills)) {
      currentNode.fills.forEach(fill => {
        if (fill.type === 'SOLID' && fill.visible !== false) {
          const hex = rgbToHex(fill.color.r, fill.color.g, fill.color.b);
          if (!colorSet.has(hex)) {
            colorSet.add(hex);
            colors.push({
              name: `color-${colors.length + 1}`,
              value: hex
            });
          }
        }
      });
    }

    // Extract strokes
    if ('strokes' in currentNode && currentNode.strokes && Array.isArray(currentNode.strokes)) {
      currentNode.strokes.forEach(stroke => {
        if (stroke.type === 'SOLID' && stroke.visible !== false) {
          const hex = rgbToHex(stroke.color.r, stroke.color.g, stroke.color.b);
          if (!colorSet.has(hex)) {
            colorSet.add(hex);
            colors.push({
              name: `stroke-color-${colors.length + 1}`,
              value: hex
            });
          }
        }
      });
    }

    // Extract spacing (padding, gaps)
    if ('paddingLeft' in currentNode) {
      const paddings = [
        currentNode.paddingLeft,
        currentNode.paddingRight,
        currentNode.paddingTop,
        currentNode.paddingBottom
      ];
      paddings.forEach(padding => {
        if (padding && !spacingSet.has(padding)) {
          spacingSet.add(padding);
          spacing.push({
            name: `spacing-${padding}`,
            value: `${padding}px`
          });
        }
      });
    }

    if ('itemSpacing' in currentNode && currentNode.itemSpacing) {
      if (!spacingSet.has(currentNode.itemSpacing)) {
        spacingSet.add(currentNode.itemSpacing);
        spacing.push({
          name: `gap-${currentNode.itemSpacing}`,
          value: `${currentNode.itemSpacing}px`
        });
      }
    }

    // Extract typography
    if (currentNode.type === 'TEXT') {
      const textNode = currentNode as TextNode;
      const fontName = textNode.fontName as FontName;
      const fontSize = textNode.fontSize as number;

      if (fontName && fontSize) {
        const typographyKey = `${fontName.family}-${fontName.style}-${fontSize}`;
        if (!typographySet.has(typographyKey)) {
          typographySet.add(typographyKey);
          typography.push({
            name: `text-${typography.length + 1}`,
            size: `${fontSize}px`,
            weight: fontName.style.toLowerCase().includes('bold') ? '700' :
                   fontName.style.toLowerCase().includes('medium') ? '500' : '400'
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

// Mock token value functions (replace with actual design system values)
function getColorValueForToken(tokenName: string): string {
  const colorMap: { [key: string]: string } = {
    'primary-500': '#18A0FB',
    'primary-600': '#0090F0',
    'neutral-700': '#5E6470',
    'neutral-900': '#1C1C1C',
    'success-500': '#06C167',
    'error-500': '#F24822'
  };
  return colorMap[tokenName] || '#CCCCCC';
}

function getSpacingValueForToken(tokenName: string): string {
  const spacingMap: { [key: string]: string } = {
    'spacing-xs': '4px',
    'spacing-sm': '8px',
    'spacing-md': '16px',
    'spacing-lg': '24px',
    'spacing-xl': '32px'
  };
  return spacingMap[tokenName] || '8px';
}

function getTypographyValueForToken(tokenName: string): { size: string; weight: string } {
  const typographyMap: { [key: string]: { size: string; weight: string } } = {
    'heading-lg': { size: '24px', weight: '600' },
    'heading-md': { size: '20px', weight: '600' },
    'body-md': { size: '14px', weight: '400' },
    'body-sm': { size: '12px', weight: '400' },
    'label-sm': { size: '11px', weight: '500' }
  };
  return typographyMap[tokenName] || { size: '14px', weight: '400' };
}

// Handle batch analysis for multiple components
async function handleBatchAnalysis(nodes: readonly SceneNode[], options: any) {
  const results = [];
  let successCount = 0;
  let failureCount = 0;

  figma.notify(`Analyzing ${nodes.length} components...`, { timeout: 3000 });

  for (const node of nodes) {
    try {
      if (!isValidNodeForAnalysis(node)) {
        failureCount++;
        continue;
      }

      // Extract component context
      const componentContext = extractComponentContext(node);
      const prompt = createEnhancedMetadataPrompt(componentContext);

      // Call Claude API
      const analysis = await fetchClaudeAnalysis(prompt, storedApiKey!);

      // Parse response
      const jsonMatch = analysis.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const enhancedData = JSON.parse(jsonMatch[0]);
        const result = processEnhancedAnalysis(enhancedData, node);

        results.push({
          node: node,
          name: node.name,
          result: result
        });

        successCount++;
      } else {
        failureCount++;
      }

    } catch (error) {
      console.error(`Error analyzing ${node.name}:`, error);
      failureCount++;
    }
  }

  // Send batch results to UI
  sendMessageToUI('batch-analysis-complete', {
    results: results,
    summary: {
      total: nodes.length,
      success: successCount,
      failed: failureCount
    }
  });

  figma.notify(`Batch analysis complete: ${successCount} succeeded, ${failureCount} failed`, { timeout: 4000 });
}

// Generate playground instances
async function handleGeneratePlayground(metadata: any) {
  try {
    // Get the last analyzed node
    const sourceNode = (globalThis as any).lastAnalyzedNode;
    if (!sourceNode) {
      throw new Error('No component was analyzed. Please analyze a component first.');
    }

    // Get the main component
    let componentNode = sourceNode;
    if (sourceNode.type === 'INSTANCE') {
      const instance = sourceNode as InstanceNode;
      if (instance.mainComponent) {
        componentNode = instance.mainComponent;
      } else {
        throw new Error('Cannot generate playground: Instance has no main component');
      }
    }

    if (componentNode.type !== 'COMPONENT') {
      throw new Error('Please select a component to generate playground');
    }

    const component = componentNode as ComponentNode;

    // Create playground frame
    const playgroundFrame = figma.createFrame();
    playgroundFrame.name = `${component.name} - Playground`;
    playgroundFrame.x = (component.x || 0) + (component.width || 100) + 100;
    playgroundFrame.y = component.y || 0;

    // Style the playground
    playgroundFrame.fills = [{ type: 'SOLID', color: { r: 0.98, g: 0.98, b: 0.98 } }];
    playgroundFrame.layoutMode = 'NONE';

    let currentX = 40;
    let currentY = 40;
    let maxRowHeight = 0;
    let totalInstances = 0;

    try {
      // Load fonts
      await figma.loadFontAsync({ family: "Inter", style: "Medium" });
      await figma.loadFontAsync({ family: "Inter", style: "Regular" });

      // Generate state instances
      if (metadata.states && metadata.states.length > 0) {
        // Create states section label
        const statesLabel = figma.createText();
        statesLabel.fontName = { family: "Inter", style: "Medium" };
        statesLabel.fontSize = 16;
        statesLabel.characters = "STATES";
        statesLabel.fills = [{ type: 'SOLID', color: { r: 0.4, g: 0.4, b: 0.4 } }];
        statesLabel.x = currentX;
        statesLabel.y = currentY;
        playgroundFrame.appendChild(statesLabel);

        currentY += 40;

        // Create instances for each state
        for (const state of metadata.states) {
          const instance = component.createInstance();
          instance.name = `${component.name} / ${state}`;
          instance.x = currentX;
          instance.y = currentY;

          // Apply state styling
          if (state.toLowerCase() !== 'default') {
            applyStateOverrides(instance, state, metadata);
          }

          playgroundFrame.appendChild(instance);

          // Add state label
          const stateLabel = figma.createText();
          stateLabel.fontName = { family: "Inter", style: "Regular" };
          stateLabel.fontSize = 12;
          stateLabel.characters = state;
          stateLabel.fills = [{ type: 'SOLID', color: { r: 0.5, g: 0.5, b: 0.5 } }];
          stateLabel.x = currentX;
          stateLabel.y = currentY + (instance.height || 40) + 8;
          playgroundFrame.appendChild(stateLabel);

          currentX += (instance.width || 100) + 40;
          maxRowHeight = Math.max(maxRowHeight, (instance.height || 40) + 40);
          totalInstances++;

          // Wrap to next row if needed
          if (currentX > 600) {
            currentX = 40;
            currentY += maxRowHeight + 20;
            maxRowHeight = 0;
          }
        }

        currentX = 40;
        currentY += maxRowHeight + 60;
      }

      // Generate variant instances
      if (metadata.variants && Object.keys(metadata.variants).length > 0) {
        // Create variants section label
        const variantsLabel = figma.createText();
        variantsLabel.fontName = { family: "Inter", style: "Medium" };
        variantsLabel.fontSize = 16;
        variantsLabel.characters = "VARIANTS";
        variantsLabel.fills = [{ type: 'SOLID', color: { r: 0.4, g: 0.4, b: 0.4 } }];
        variantsLabel.x = currentX;
        variantsLabel.y = currentY;
        playgroundFrame.appendChild(variantsLabel);

        currentY += 40;

        // Generate variant combinations
        const variantCombinations = generateVariantCombinations(metadata.variants);

        for (const combination of variantCombinations.slice(0, 12)) { // Limit to 12 for performance
          const instance = component.createInstance();
          const variantName = Object.entries(combination).map(([k, v]) => `${v}`).join(' / ');
          instance.name = `${component.name} / ${variantName}`;
          instance.x = currentX;
          instance.y = currentY;

          // Apply variant styling
          applyVariantStyles(instance, combination, metadata);

          playgroundFrame.appendChild(instance);

          // Add variant label
          const variantLabel = figma.createText();
          variantLabel.fontName = { family: "Inter", style: "Regular" };
          variantLabel.fontSize = 11;
          variantLabel.characters = variantName;
          variantLabel.fills = [{ type: 'SOLID', color: { r: 0.5, g: 0.5, b: 0.5 } }];
          variantLabel.x = currentX;
          variantLabel.y = currentY + (instance.height || 40) + 8;
          playgroundFrame.appendChild(variantLabel);

          currentX += (instance.width || 100) + 40;
          maxRowHeight = Math.max(maxRowHeight, (instance.height || 40) + 40);
          totalInstances++;

          // Wrap to next row
          if (currentX > 600) {
            currentX = 40;
            currentY += maxRowHeight + 20;
            maxRowHeight = 0;
          }
        }
      }

      // Resize playground frame to fit content
      playgroundFrame.resize(
        Math.max(680, currentX + 40),
        currentY + maxRowHeight + 40
      );

      // Add to parent
      if (component.parent) {
        component.parent.appendChild(playgroundFrame);
      }

      // Select and zoom
      figma.currentPage.selection = [playgroundFrame];
      figma.viewport.scrollAndZoomIntoView([playgroundFrame]);

    } catch (error) {
      console.error('Error creating playground:', error);
      playgroundFrame.remove();
      throw error;
    }

    sendMessageToUI('playground-generated', {
      success: true,
      count: totalInstances,
      message: `Generated ${totalInstances} playground instances`
    });

  } catch (error) {
    console.error('Error generating playground:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    sendMessageToUI('playground-generated', { success: false, error: errorMessage });
  }
}

// Generate documentation frame in Figma
async function handleGenerateDocsFrame(data: any) {
  try {
    const { metadata, notes } = data;

    // Get the last analyzed node
    const sourceNode = (globalThis as any).lastAnalyzedNode;
    if (!sourceNode) {
      throw new Error('No component was analyzed. Please analyze a component first.');
    }

    // Create documentation frame
    const docsFrame = figma.createFrame();
    docsFrame.name = `${metadata.component} - Documentation`;
    docsFrame.x = (sourceNode.x || 0);
    docsFrame.y = (sourceNode.y || 0) + (sourceNode.height || 100) + 100;
    docsFrame.resize(600, 800);

    // Style the documentation frame
    docsFrame.fills = [{ type: 'SOLID', color: { r: 1, g: 1, b: 1 } }];
    docsFrame.strokes = [{ type: 'SOLID', color: { r: 0.88, g: 0.88, b: 0.88 } }];
    docsFrame.strokeWeight = 1;
    docsFrame.cornerRadius = 8;

    try {
      // Load fonts
      await figma.loadFontAsync({ family: "Inter", style: "Bold" });
      await figma.loadFontAsync({ family: "Inter", style: "Medium" });
      await figma.loadFontAsync({ family: "Inter", style: "Regular" });

      let currentY = 40;
      const leftMargin = 40;
      const rightMargin = 40;
      const contentWidth = 600 - leftMargin - rightMargin;

      // Title
      const title = figma.createText();
      title.fontName = { family: "Inter", style: "Bold" };
      title.fontSize = 24;
      title.characters = metadata.component;
      title.x = leftMargin;
      title.y = currentY;
      title.resize(contentWidth, 40);
      docsFrame.appendChild(title);
      currentY += 50;

      // Description
      const description = figma.createText();
      description.fontName = { family: "Inter", style: "Regular" };
      description.fontSize = 14;
      description.characters = metadata.description;
      description.x = leftMargin;
      description.y = currentY;
      description.resize(contentWidth, 60);
      docsFrame.appendChild(description);
      currentY += (description.height || 60) + 30;

      // Properties section
      if (metadata.props && metadata.props.length > 0) {
        const propsTitle = figma.createText();
        propsTitle.fontName = { family: "Inter", style: "Medium" };
        propsTitle.fontSize = 16;
        propsTitle.characters = "Properties";
        propsTitle.x = leftMargin;
        propsTitle.y = currentY;
        docsFrame.appendChild(propsTitle);
        currentY += 30;

        const propsList = figma.createText();
        propsList.fontName = { family: "Inter", style: "Regular" };
        propsList.fontSize = 13;
        propsList.characters = metadata.props.map((p: string) => `• ${p}`).join('\n');
        propsList.x = leftMargin;
        propsList.y = currentY;
        propsList.resize(contentWidth, 100);
        propsList.textAutoResize = 'HEIGHT';
        docsFrame.appendChild(propsList);
        currentY += propsList.height + 30;
      }

      // States section
      if (metadata.states && metadata.states.length > 0) {
        const statesTitle = figma.createText();
        statesTitle.fontName = { family: "Inter", style: "Medium" };
        statesTitle.fontSize = 16;
        statesTitle.characters = "States";
        statesTitle.x = leftMargin;
        statesTitle.y = currentY;
        docsFrame.appendChild(statesTitle);
        currentY += 30;

        const statesList = figma.createText();
        statesList.fontName = { family: "Inter", style: "Regular" };
        statesList.fontSize = 13;
        statesList.characters = metadata.states.map((s: string) => `• ${s}`).join('\n');
        statesList.x = leftMargin;
        statesList.y = currentY;
        statesList.resize(contentWidth, 100);
        statesList.textAutoResize = 'HEIGHT';
        docsFrame.appendChild(statesList);
        currentY += statesList.height + 30;
      }

      // Slots section
      if (metadata.slots && metadata.slots.length > 0) {
        const slotsTitle = figma.createText();
        slotsTitle.fontName = { family: "Inter", style: "Medium" };
        slotsTitle.fontSize = 16;
        slotsTitle.characters = "Slots";
        slotsTitle.x = leftMargin;
        slotsTitle.y = currentY;
        docsFrame.appendChild(slotsTitle);
        currentY += 30;

        const slotsList = figma.createText();
        slotsList.fontName = { family: "Inter", style: "Regular" };
        slotsList.fontSize = 13;
        slotsList.characters = metadata.slots.map((s: string) => `• ${s}`).join('\n');
        slotsList.x = leftMargin;
        slotsList.y = currentY;
        slotsList.resize(contentWidth, 100);
        slotsList.textAutoResize = 'HEIGHT';
        docsFrame.appendChild(slotsList);
        currentY += slotsList.height + 30;
      }

      // Usage guidelines
      if (metadata.usage) {
        const usageTitle = figma.createText();
        usageTitle.fontName = { family: "Inter", style: "Medium" };
        usageTitle.fontSize = 16;
        usageTitle.characters = "Usage Guidelines";
        usageTitle.x = leftMargin;
        usageTitle.y = currentY;
        docsFrame.appendChild(usageTitle);
        currentY += 30;

        const usageText = figma.createText();
        usageText.fontName = { family: "Inter", style: "Regular" };
        usageText.fontSize = 13;
        usageText.characters = metadata.usage;
        usageText.x = leftMargin;
        usageText.y = currentY;
        usageText.resize(contentWidth, 100);
        usageText.textAutoResize = 'HEIGHT';
        docsFrame.appendChild(usageText);
        currentY += usageText.height + 30;
      }

      // Accessibility
      if (metadata.accessibility) {
        const a11yTitle = figma.createText();
        a11yTitle.fontName = { family: "Inter", style: "Medium" };
        a11yTitle.fontSize = 16;
        a11yTitle.characters = "Accessibility";
        a11yTitle.x = leftMargin;
        a11yTitle.y = currentY;
        docsFrame.appendChild(a11yTitle);
        currentY += 30;

        const a11yText = figma.createText();
        a11yText.fontName = { family: "Inter", style: "Regular" };
        a11yText.fontSize = 13;
        a11yText.characters = metadata.accessibility;
        a11yText.x = leftMargin;
        a11yText.y = currentY;
        a11yText.resize(contentWidth, 100);
        a11yText.textAutoResize = 'HEIGHT';
        docsFrame.appendChild(a11yText);
        currentY += a11yText.height + 30;
      }

      // Collaboration notes
      if (notes) {
        const notesTitle = figma.createText();
        notesTitle.fontName = { family: "Inter", style: "Medium" };
        notesTitle.fontSize = 16;
        notesTitle.characters = "Notes";
        notesTitle.x = leftMargin;
        notesTitle.y = currentY;
        docsFrame.appendChild(notesTitle);
        currentY += 30;

        const notesText = figma.createText();
        notesText.fontName = { family: "Inter", style: "Regular" };
        notesText.fontSize = 13;
        notesText.characters = notes;
        notesText.x = leftMargin;
        notesText.y = currentY;
        notesText.resize(contentWidth, 100);
        notesText.textAutoResize = 'HEIGHT';
        docsFrame.appendChild(notesText);
        currentY += notesText.height + 30;
      }

      // Add metadata footer
      const footer = figma.createText();
      footer.fontName = { family: "Inter", style: "Regular" };
      footer.fontSize = 11;
      footer.characters = `Generated by AI Design Co-Pilot on ${new Date().toLocaleDateString()}`;
      footer.fills = [{ type: 'SOLID', color: { r: 0.6, g: 0.6, b: 0.6 } }];
      footer.x = leftMargin;
      footer.y = currentY + 20;
      docsFrame.appendChild(footer);

      // Resize frame to fit content
      docsFrame.resize(600, currentY + 80);

      // Add to parent
      if (sourceNode.parent) {
        sourceNode.parent.appendChild(docsFrame);
      }

      // Select and zoom
      figma.currentPage.selection = [docsFrame];
      figma.viewport.scrollAndZoomIntoView([docsFrame]);

    } catch (error) {
      console.error('Error creating documentation frame:', error);
      docsFrame.remove();
      throw error;
    }

    sendMessageToUI('docs-frame-generated', { success: true });
    figma.notify('Documentation frame generated!', { timeout: 3000 });

  } catch (error) {
    console.error('Error generating docs frame:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    sendMessageToUI('docs-frame-generated', { success: false, error: errorMessage });
  }
}

// Save collaboration notes
async function handleSaveCollabNotes(notes: string) {
  try {
    const lastNode = (globalThis as any).lastAnalyzedNode;
    if (!lastNode) {
      throw new Error('No component selected');
    }

    // Store notes in plugin data
    lastNode.setPluginData('ai-design-copilot-notes', notes);

    // Create or update visual notes indicator
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

    // Check if a notes indicator already exists
    const existingIndicatorId = node.getPluginData('ai-design-copilot-notes-indicator-id');
    if (existingIndicatorId) {
      const existingIndicator = await figma.getNodeByIdAsync(existingIndicatorId);
      if (existingIndicator && existingIndicator.type === 'FRAME') {
        // Update existing indicator
        const textNode = existingIndicator.children.find(child => child.type === 'TEXT') as TextNode;
        if (textNode) {
          textNode.characters = `📝 Notes: ${notes.substring(0, 50)}${notes.length > 50 ? '...' : ''}`;
        }
        return;
      }
    }

    // Create new notes indicator
    const indicator = figma.createFrame();
    indicator.name = '📝 Component Notes';
    indicator.resize(200, 32);

    // Position near the component
    indicator.x = (node.x || 0) + (node.width || 100) + 20;
    indicator.y = (node.y || 0) - 40;

    // Style the indicator
    indicator.fills = [{ type: 'SOLID', color: { r: 1, g: 0.98, b: 0.88 } }]; // Light yellow
    indicator.strokes = [{ type: 'SOLID', color: { r: 1, g: 0.8, b: 0 } }]; // Orange border
    indicator.strokeWeight = 1;
    indicator.cornerRadius = 4;
    indicator.effects = [{
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

// Check selection for batch mode
function checkSelectionForBatchMode() {
  const selection = figma.currentPage.selection;

  if (selection.length > 1) {
    const validComponents = selection.filter(node => isValidNodeForAnalysis(node));

    sendMessageToUI('batch-selection-update', {
      components: validComponents.map(node => ({
        id: node.id,
        name: node.name,
        type: node.type
      }))
    });
  } else {
    sendMessageToUI('batch-selection-update', { components: [] });
  }
}

// Listen for selection changes
figma.on('selectionchange', () => {
  checkSelectionForBatchMode();
});

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

// Analyze the selected Figma component (original function for backwards compatibility)
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
    const prompt = createEnhancedMetadataPrompt(componentContext);

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

// Handle Add State
async function handleAddState(data: any) {
  try {
    const { state, metadata } = data;
    const lastNode = (globalThis as any).lastAnalyzedNode;

    if (!lastNode) {
      throw new Error('No component selected');
    }

    // Get the component node
    let componentNode = lastNode;
    if (lastNode.type === 'INSTANCE') {
      const instance = lastNode as InstanceNode;
      if (instance.mainComponent) {
        componentNode = instance.mainComponent;
      }
    }

    if (componentNode.type !== 'COMPONENT') {
      throw new Error('Please select a component to add states');
    }

    const component = componentNode as ComponentNode;

    // Create a new instance for the state
    const stateInstance = component.createInstance();
    stateInstance.name = `${component.name} / ${state}`;

    // Position it next to the original
    stateInstance.x = (component.x || 0) + (component.width || 100) + 20;
    stateInstance.y = component.y || 0;

    // Apply state styling
    applyStateOverrides(stateInstance, state, metadata);

    // Add to parent (or current page if no parent)
    if (component.parent) {
      component.parent.appendChild(stateInstance);
    } else {
      figma.currentPage.appendChild(stateInstance);
    }

    // Select and zoom to the new instance
    figma.currentPage.selection = [stateInstance];
    figma.viewport.scrollAndZoomIntoView([stateInstance]);

    figma.notify(`Created ${state} state instance`, { timeout: 3000 });

    sendMessageToUI('state-added', { success: true, state });

  } catch (error) {
    console.error('Error adding state:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    sendMessageToUI('state-added', { success: false, error: errorMessage });
  }
}

// Handle Fix Accessibility
async function handleFixAccessibility(data: any) {
  try {
    const { issue, metadata } = data;
    const lastNode = (globalThis as any).lastAnalyzedNode;

    if (!lastNode) {
      throw new Error('No component selected');
    }

    // Handle different accessibility issues
    if (issue.toLowerCase().includes('alt text')) {
      // Alt text cannot be added in Figma - it's added in code
      // Create a note/annotation instead
      try {
        await figma.loadFontAsync({ family: "Inter", style: "Regular" });

        const noteFrame = figma.createFrame();
        noteFrame.name = '⚠️ Accessibility Note';
        noteFrame.resize(250, 80);
        noteFrame.x = (lastNode.x || 0) + (lastNode.width || 100) + 20;
        noteFrame.y = lastNode.y || 0;

        // Style the note
        noteFrame.fills = [{ type: 'SOLID', color: { r: 1, g: 0.95, b: 0.8 } }]; // Light yellow
        noteFrame.strokes = [{ type: 'SOLID', color: { r: 1, g: 0.6, b: 0 } }]; // Orange
        noteFrame.strokeWeight = 1;
        noteFrame.cornerRadius = 4;

        const noteText = figma.createText();
        noteText.fontName = { family: "Inter", style: "Regular" };
        noteText.fontSize = 12;
        noteText.characters = '⚠️ Accessibility:\nRemember to add alt text\nfor this image in code:\nalt="[descriptive text]"';
        noteText.x = 10;
        noteText.y = 10;
        noteText.resize(230, 60);

        noteFrame.appendChild(noteText);

        if (lastNode.parent) {
          lastNode.parent.appendChild(noteFrame);
        }

        figma.notify('Added accessibility reminder note', { timeout: 3000 });
      } catch (error) {
        console.error('Error creating note:', error);
        figma.notify('Alt text is added in code, not in Figma', { timeout: 3000 });
      }
    } else if (issue.toLowerCase().includes('contrast')) {
      // Improve color contrast by darkening colors
      if ('fills' in lastNode && lastNode.fills && lastNode.fills.length > 0) {
        const fills = [...lastNode.fills];
        let modified = false;

        fills.forEach((fill, index) => {
          if (fill.type === 'SOLID' && fill.visible !== false) {
            const solidFill = fill as SolidPaint;
            // Darken the color for better contrast
            fills[index] = {
              ...solidFill,
              color: {
                r: Math.max(0, solidFill.color.r * 0.7),
                g: Math.max(0, solidFill.color.g * 0.7),
                b: Math.max(0, solidFill.color.b * 0.7)
              }
            };
            modified = true;
          }
        });

        if (modified) {
          lastNode.fills = fills;
          figma.notify('Improved color contrast by darkening colors', { timeout: 3000 });
        } else {
          figma.notify('No solid fills to modify for contrast', { timeout: 3000 });
        }
      } else {
        figma.notify('Component has no fills to adjust', { timeout: 3000 });
      }
    } else if (issue.toLowerCase().includes('focus')) {
      // Add focus indicator
      if ('strokes' in lastNode) {
        lastNode.strokes = [{
          type: 'SOLID',
          visible: true,
          opacity: 1,
          color: { r: 0.094, g: 0.627, b: 0.984 } // Primary blue
        }];
        lastNode.strokeWeight = 2;
        figma.notify('Added focus indicator stroke', { timeout: 3000 });
      } else {
        figma.notify('Cannot add stroke to this node type', { timeout: 3000 });
      }
    } else {
      figma.notify(`Cannot auto-fix: ${issue}`, { timeout: 3000 });
    }

    sendMessageToUI('accessibility-fixed', { success: true, issue });

  } catch (error) {
    console.error('Error fixing accessibility:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    figma.notify(`Failed to fix: ${errorMessage}`, { error: true });
    sendMessageToUI('accessibility-fixed', { success: false, error: errorMessage });
  }
}

// Handle Fix Naming
async function handleFixNaming(data: any) {
  try {
    const { layer, newName } = data;
    const lastNode = (globalThis as any).lastAnalyzedNode;

    if (!lastNode) {
      throw new Error('No component selected');
    }

    // Find the layer by name
    function findAndRename(node: SceneNode, targetName: string, replacement: string): boolean {
      if (node.name === targetName) {
        node.name = replacement;
        return true;
      }

      if ('children' in node) {
        for (const child of node.children) {
          if (findAndRename(child, targetName, replacement)) {
            return true;
          }
        }
      }
      return false;
    }

    const renamed = findAndRename(lastNode, layer, newName);

    if (renamed) {
      // Reselect the node to refresh the layers panel
      const currentSelection = figma.currentPage.selection;
      figma.currentPage.selection = [];
      figma.currentPage.selection = currentSelection;

      figma.notify(`Renamed "${layer}" to "${newName}"`, { timeout: 3000 });
      sendMessageToUI('naming-fixed', { success: true, layer, newName });
    } else {
      // Try to find the layer more broadly
      let foundNode: SceneNode | null = null;
      function findLayer(node: SceneNode): void {
        if (node.name.includes('Ellipse')) {
          foundNode = node;
        }
        if ('children' in node) {
          for (const child of node.children) {
            findLayer(child);
          }
        }
      }

      findLayer(lastNode);

      if (foundNode) {
        foundNode.name = newName;
        figma.notify(`Renamed layer to "${newName}"`, { timeout: 3000 });
        sendMessageToUI('naming-fixed', { success: true, layer, newName });
      } else {
        throw new Error(`Layer "${layer}" not found in component`);
      }
    }

  } catch (error) {
    console.error('Error fixing naming:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    sendMessageToUI('naming-fixed', { success: false, error: errorMessage });
  }
}

// Handle plugin closure
figma.on('close', () => {
  // Clean up any resources if needed
  console.log('AI Design Co-Pilot plugin closed');
});
