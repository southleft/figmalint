// Main Plugin Thread for AI Design Co-Pilot Figma Plugin
// Handles Figma API interactions, message processing, and plugin lifecycle

import { fetchClaude, createDesignAnalysisPrompt, isValidApiKeyFormat } from './claude';

// Plugin configuration
const PLUGIN_WINDOW_SIZE = { width: 300, height: 200 };

// In-memory storage for API key (in production, consider using clientStorage)
let storedApiKey: string | null = null;

// Plugin initialization
figma.showUI(__html__, PLUGIN_WINDOW_SIZE);
figma.ui.onmessage = handleUIMessage;

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

      default:
        console.warn('Unknown message type:', type);
    }
  } catch (error) {
    console.error('Error handling message:', error);
    sendMessageToUI('analysis-error', { error: error.message });
  }
}

// Check if API key is already saved
async function handleCheckApiKey() {
  try {
    // In a real implementation, you might want to use figma.clientStorage
    // to persist the API key across plugin sessions
    const hasKey = storedApiKey !== null;

    sendMessageToUI('api-key-status', { hasKey });
  } catch (error) {
    console.error('Error checking API key:', error);
    sendMessageToUI('api-key-status', { hasKey: false });
  }
}

// Save API key to memory
async function handleSaveApiKey(apiKey: string) {
  try {
    // Validate API key format
    if (!isValidApiKeyFormat(apiKey)) {
      throw new Error('Invalid API key format. Claude API keys should start with "sk-"');
    }

    // Store the API key (in production, consider using figma.clientStorage for persistence)
    storedApiKey = apiKey;

    // For production, you might want to persist the key:
    // await figma.clientStorage.setAsync('claude-api-key', apiKey);

    console.log('API key saved successfully');
    sendMessageToUI('api-key-saved', { success: true });

  } catch (error) {
    console.error('Error saving API key:', error);
    sendMessageToUI('api-key-saved', { success: false, error: error.message });
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

    const selectedNode = selection[0];

    // Extract component information
    const componentInfo = extractComponentInfo(selectedNode);

    // Create analysis prompt
    const prompt = createDesignAnalysisPrompt(componentInfo.name, componentInfo.structure);

    // Show loading notification
    figma.notify('Analyzing component with Claude AI...', { timeout: 3000 });

    // Call Claude API (this is a placeholder - actual implementation would use the real API)
    const analysis = await fetchClaudeAnalysis(prompt, storedApiKey);

    // Display the analysis result
    figma.notify(`Analysis complete! Claude suggests: ${analysis.substring(0, 100)}...`, { timeout: 10000 });

    // Send success message to UI
    sendMessageToUI('analysis-complete', { success: true, message: 'Analysis completed successfully' });

    console.log('Full analysis:', analysis);

  } catch (error) {
    console.error('Error during analysis:', error);
    figma.notify(`Analysis failed: ${error.message}`, { error: true });
    sendMessageToUI('analysis-error', { error: error.message });
  }
}

// Extract relevant information from a Figma node
function extractComponentInfo(node: SceneNode): { name: string; structure: any } {
  const info = {
    name: node.name,
    type: node.type,
    id: node.id,
    // Add basic properties that are common to most nodes
    ...(node.type !== 'SLICE' && {
      visible: node.visible,
      locked: node.locked,
    }),
    // Add layout properties if available
    ...(('width' in node && 'height' in node) && {
      width: node.width,
      height: node.height,
    }),
    // Add fill information if available
    ...(('fills' in node) && {
      fills: node.fills ? node.fills.length : 0,
    }),
    // Add children information if it's a container
    ...(('children' in node) && {
      childCount: node.children.length,
      childTypes: node.children.map(child => child.type),
    }),
    // Add text content if it's a text node
    ...(node.type === 'TEXT' && {
      characters: (node as TextNode).characters,
      fontSize: (node as TextNode).fontSize,
      fontName: (node as TextNode).fontName,
    }),
    // Add component/instance information
    ...(node.type === 'COMPONENT' && {
      description: (node as ComponentNode).description,
    }),
    ...(node.type === 'INSTANCE' && {
      mainComponent: (node as InstanceNode).mainComponent?.name,
    }),
  };

  return {
    name: node.name,
    structure: info
  };
}

// Wrapper function for Claude API call with error handling
async function fetchClaudeAnalysis(prompt: string, apiKey: string): Promise<string> {
  try {
    // For now, return a placeholder response
    // In the real implementation, this would call the actual Claude API
    const analysis = await fetchClaude(prompt, apiKey);
    return analysis;

  } catch (error) {
    // If the API call fails, provide a fallback response
    console.error('Claude API call failed:', error);

    // Return a placeholder analysis for development
    return `
Component Analysis (Placeholder):
This appears to be a ${prompt.includes('Component Name:') ? prompt.split('Component Name:')[1].split('\n')[0].trim() : 'design component'}.

Suggested Variants:
• Default state
• Hover state
• Disabled state
• Active/Selected state

Accessibility Considerations:
• Ensure proper color contrast ratios
• Add descriptive alt text for images
• Implement keyboard navigation support
• Use semantic HTML elements

Best Practices:
• Maintain consistent spacing and typography
• Follow your design system guidelines
• Test across different screen sizes
• Consider user interaction patterns

Note: This is a placeholder response. Enable Claude API for detailed AI analysis.
    `.trim();
  }
}

// Send message to UI
function sendMessageToUI(type: string, data: any) {
  figma.ui.postMessage({
    type,
    data
  });
}

// Handle plugin closure
figma.on('close', () => {
  // Clean up any resources if needed
  console.log('AI Design Co-Pilot plugin closed');
});

// Export functions for potential testing or extension
export {
  handleUIMessage,
  extractComponentInfo,
  fetchClaudeAnalysis
};
