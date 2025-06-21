// Main Plugin Thread for AI Design Co-Pilot Figma Plugin
// Handles Figma API interactions, message processing, and plugin lifecycle
// Inline Claude API helper functions to avoid module system issues
// Validate if an API key looks like a valid Claude API key
function isValidApiKeyFormat(apiKey) {
    const trimmedKey = apiKey.trim();
    // Claude API keys typically start with 'sk-ant-' and are longer
    return trimmedKey.length > 40 && trimmedKey.startsWith('sk-ant-');
}
// Create a design analysis prompt for Figma components
function createDesignAnalysisPrompt(componentName, componentStructure) {
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
// Send a prompt to Claude API and get a response
async function fetchClaude(prompt, apiKey) {
    console.log('Making real Claude API call...');
    const CLAUDE_API_URL = 'https://api.anthropic.com/v1/messages';
    // Prepare the request payload
    const requestBody = {
        model: 'claude-3-opus-20240229',
        messages: [
            {
                role: 'user',
                content: prompt.trim()
            }
        ],
        max_tokens: 500
    };
    // Prepare request headers
    const headers = {
        'x-api-key': apiKey.trim(),
        'content-type': 'application/json',
        'anthropic-version': '2023-06-01'
    };
    try {
        // Make the API request
        // Note: Figma plugins may have network restrictions, so we'll handle errors gracefully
        console.log('Sending request to Claude API...');
        const response = await fetch(CLAUDE_API_URL, {
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
        }
        else {
            throw new Error('Invalid response format from Claude API');
        }
    }
    catch (error) {
        console.error('Claude API call failed:', error);
        // Return a helpful error message
        return `Error connecting to Claude API: ${error instanceof Error ? error.message : 'Unknown error'}

Please check:
• Your API key is valid and starts with 'sk-ant-'
• You have an active Claude API subscription
• Your internet connection is working
• The API key has the necessary permissions

For development, you can use this placeholder analysis:

Component Analysis:
This appears to be a UI component that could benefit from:
• Multiple visual states (hover, active, disabled)
• Consistent spacing and typography
• Accessibility improvements
• Clear documentation

Try fixing the API connection and analyzing again.`;
    }
}
// Plugin configuration
const PLUGIN_WINDOW_SIZE = { width: 300, height: 200 };
// In-memory storage for API key (in production, consider using clientStorage)
let storedApiKey = null;
// Plugin initialization
// Try to show UI, but handle the case where it might already be shown (in inspect panel)
try {
    figma.showUI(__html__, PLUGIN_WINDOW_SIZE);
    console.log('UI shown successfully');
}
catch (error) {
    console.log('UI might already be shown in inspect panel:', error);
}
// Always set up message handler
figma.ui.onmessage = handleUIMessage;
// Handle incoming messages from the UI
async function handleUIMessage(msg) {
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
    }
    catch (error) {
        console.error('Error handling message:', error);
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        sendMessageToUI('analysis-error', { error: errorMessage });
    }
}
// Check if API key is already saved
async function handleCheckApiKey() {
    try {
        // In a real implementation, you might want to use figma.clientStorage
        // to persist the API key across plugin sessions
        const hasKey = storedApiKey !== null;
        sendMessageToUI('api-key-status', { hasKey });
    }
    catch (error) {
        console.error('Error checking API key:', error);
        sendMessageToUI('api-key-status', { hasKey: false });
    }
}
// Save API key to memory
async function handleSaveApiKey(apiKey) {
    try {
        // Validate API key format
        if (!isValidApiKeyFormat(apiKey)) {
            throw new Error('Invalid API key format. Claude API keys should start with "sk-ant-" and be at least 40 characters long');
        }
        // Store the API key (in production, consider using figma.clientStorage for persistence)
        storedApiKey = apiKey;
        // For production, you might want to persist the key:
        // await figma.clientStorage.setAsync('claude-api-key', apiKey);
        console.log('API key saved successfully');
        sendMessageToUI('api-key-saved', { success: true });
    }
    catch (error) {
        console.error('Error saving API key:', error);
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        sendMessageToUI('api-key-saved', { success: false, error: errorMessage });
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
        figma.notify(`Analysis complete! Check the plugin panel for details.`, { timeout: 5000 });
        // Send the full analysis to UI for display
        sendMessageToUI('analysis-result', { analysis });
        // Send success message to UI
        sendMessageToUI('analysis-complete', { success: true, message: 'Analysis completed successfully' });
        console.log('Full analysis:', analysis);
    }
    catch (error) {
        console.error('Error during analysis:', error);
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        figma.notify(`Analysis failed: ${errorMessage}`, { error: true });
        sendMessageToUI('analysis-error', { error: errorMessage });
    }
}
// Extract relevant information from a Figma node
function extractComponentInfo(node) {
    // Build info object step by step to avoid conditional spread operator issues
    const info = {
        name: node.name,
        type: node.type,
        id: node.id
    };
    // Add basic properties that are common to most nodes
    if (node.type !== 'SLICE') {
        info.visible = node.visible;
        info.locked = node.locked;
    }
    // Add layout properties if available
    if ('width' in node && 'height' in node) {
        info.width = node.width;
        info.height = node.height;
    }
    // Add fill information if available
    if ('fills' in node) {
        info.fills = node.fills ? node.fills.length : 0;
    }
    // Add children information if it's a container
    if ('children' in node && node.children) {
        info.childCount = node.children.length;
        info.childTypes = node.children.map(child => child.type);
    }
    // Add text content if it's a text node
    if (node.type === 'TEXT') {
        info.characters = node.characters;
        info.fontSize = node.fontSize;
        info.fontName = node.fontName;
    }
    // Add component/instance information
    if (node.type === 'COMPONENT') {
        info.description = node.description;
    }
    if (node.type === 'INSTANCE') {
        const instanceNode = node;
        info.mainComponent = instanceNode.mainComponent ? instanceNode.mainComponent.name : null;
    }
    return {
        name: node.name,
        structure: info
    };
}
// Wrapper function for Claude API call with error handling
async function fetchClaudeAnalysis(prompt, apiKey) {
    try {
        // Call the actual Claude API
        const analysis = await fetchClaude(prompt, apiKey);
        return analysis;
    }
    catch (error) {
        // If the API call fails, throw the error to be handled by the caller
        console.error('Claude API call failed:', error);
        throw error;
    }
}
// Send message to UI
function sendMessageToUI(type, data) {
    try {
        figma.ui.postMessage({
            type,
            data
        });
        console.log('Sent message to UI:', type, data);
    }
    catch (error) {
        console.error('Failed to send message to UI:', type, error);
        // Try to show notification as fallback
        if (type === 'api-key-saved' && data.success) {
            figma.notify('API key saved successfully!');
        }
    }
}
// Handle plugin closure
figma.on('close', () => {
    // Clean up any resources if needed
    console.log('AI Design Co-Pilot plugin closed');
});
