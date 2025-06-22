// Enhanced Main Plugin Thread for AI Design Co-Pilot Figma Plugin
// Handles Figma API interactions, message processing, and plugin lifecycle
// Inline Claude API helper functions to avoid module system issues
// Validate if an API key looks like a valid Claude API key
function isValidApiKeyFormat(apiKey) {
    const trimmedKey = apiKey.trim();
    // Claude API keys typically start with 'sk-ant-' and are longer
    return trimmedKey.length > 40 && trimmedKey.startsWith('sk-ant-');
}
// Validate if a node is suitable for analysis
function isValidNodeForAnalysis(node) {
    const validTypes = ['FRAME', 'COMPONENT', 'COMPONENT_SET', 'INSTANCE', 'GROUP'];
    // Check if it's a valid type
    if (!validTypes.includes(node.type)) {
        return false;
    }
    // Special check for component sets - skip if they have errors
    if (node.type === 'COMPONENT_SET') {
        try {
            // Try to access variant properties to check if the component set is valid
            const componentSet = node;
            const props = componentSet.variantGroupProperties;
            return true;
        }
        catch (error) {
            console.warn('Component set has errors, skipping:', error);
            return false;
        }
    }
    return true;
}
// Validate metadata structure
function isValidMetadata(metadata) {
    if (!metadata || typeof metadata !== 'object')
        return false;
    // Check required fields
    const requiredFields = ['component', 'description'];
    for (const field of requiredFields) {
        if (!metadata[field])
            return false;
    }
    // Check array fields
    const arrayFields = ['props', 'states', 'slots'];
    for (const field of arrayFields) {
        if (metadata[field] && !Array.isArray(metadata[field]))
            return false;
    }
    return true;
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
// Create an enhanced metadata assistant prompt with audit capabilities
function createEnhancedMetadataPrompt(componentContext) {
    return `You are an expert design system architect analyzing a Figma component for comprehensive metadata and design token recommendations.

**Component Analysis Context:**
- Component Name: ${componentContext.name}
- Component Type: ${componentContext.type}
- Layer Structure: ${JSON.stringify(componentContext.hierarchy, null, 2)}
- Detected Colors: ${componentContext.colors && componentContext.colors.length > 0 ? componentContext.colors.join(', ') : 'None detected'}
- Detected Spacing: ${componentContext.spacing && componentContext.spacing.length > 0 ? componentContext.spacing.join(', ') : 'None detected'}
- Text Content: ${componentContext.textContent || 'No text content'}

**Analysis Requirements:**

1. **Component Metadata**: Provide comprehensive component documentation
2. **Design Token Analysis**: Analyze and recommend semantic design tokens
3. **Accessibility Assessment**: Evaluate accessibility compliance
4. **Naming Convention Review**: Check layer naming consistency
5. **Design System Integration**: Suggest improvements for scalability

**Design Token Focus Areas:**
- **Color Tokens**: Semantic color usage (primary, secondary, neutral, semantic colors)
- **Spacing Tokens**: Consistent spacing patterns (padding, margins, gaps)
- **Typography Tokens**: Font sizes, weights, line heights, letter spacing
- **Effect Tokens**: Shadows, blurs, and other visual effects
- **Border Tokens**: Border radius, stroke weights
- **Layout Tokens**: Grid systems, breakpoints, container sizes

**Response Format (JSON only):**
{
  "component": "Component name and purpose",
  "description": "Detailed component description and use cases",
  "props": [
    {
      "name": "property name",
      "type": "string|boolean|number|variant",
      "description": "Property purpose and usage",
      "defaultValue": "default value",
      "required": true/false
    }
  ],
  "states": ["default", "hover", "focus", "disabled", "pressed", "active", "loading"],
  "slots": ["slot descriptions for content areas"],
  "variants": {
    "size": ["small", "medium", "large"],
    "variant": ["primary", "secondary", "outline"],
    "theme": ["light", "dark"]
  },
  "usage": "When and how to use this component",
  "accessibility": {
    "ariaLabels": ["required aria labels"],
    "keyboardSupport": "keyboard interaction requirements",
    "colorContrast": "contrast compliance status",
    "focusManagement": "focus behavior description"
  },
  "tokens": {
    "colors": [
      "semantic-color-primary",
      "semantic-color-secondary",
      "neutral-background-default",
      "neutral-text-primary",
      "semantic-color-success",
      "semantic-color-error",
      "semantic-color-warning"
    ],
    "spacing": [
      "spacing-xs-4px",
      "spacing-sm-8px",
      "spacing-md-16px",
      "spacing-lg-24px",
      "spacing-xl-32px"
    ],
    "typography": [
      "text-size-sm-12px",
      "text-size-base-14px",
      "text-size-lg-16px",
      "text-size-xl-18px",
      "text-weight-normal-400",
      "text-weight-medium-500",
      "text-weight-semibold-600"
    ],
    "effects": [
      "shadow-sm-subtle",
      "shadow-md-default",
      "shadow-lg-prominent",
      "blur-backdrop-light"
    ],
    "borders": [
      "radius-sm-4px",
      "radius-md-8px",
      "radius-lg-12px",
      "radius-full-999px"
    ]
  },
  "propertyCheatSheet": [
    {
      "name": "Property name",
      "values": ["value1", "value2", "value3"],
      "default": "default value",
      "description": "What this property controls"
    }
  ],
  "audit": {
    "accessibilityIssues": ["List specific accessibility issues found"],
    "namingIssues": ["List layer naming problems with suggestions"],
    "consistencyIssues": ["List design consistency issues"],
    "tokenOpportunities": ["Specific recommendations for design token implementation"]
  }
}

**Analysis Guidelines:**

1. **Be Specific**: Provide actionable, specific recommendations
2. **Modern Practices**: Follow current design system best practices
3. **Semantic Naming**: Use semantic token names that describe purpose, not appearance
4. **Scalability**: Consider how tokens support design system growth
5. **Accessibility**: Ensure recommendations support inclusive design
6. **Consistency**: Identify patterns that can be systematized

**Token Naming Convention:**
- Colors: \`semantic-[purpose]-[variant]\` (e.g., "semantic-color-primary", "neutral-background-subtle")
- Spacing: \`spacing-[size]-[value]\` (e.g., "spacing-md-16px", "spacing-lg-24px")
- Typography: \`text-[property]-[variant]-[value]\` (e.g., "text-size-lg-18px", "text-weight-semibold-600")
- Effects: \`[effect]-[intensity]-[purpose]\` (e.g., "shadow-md-default", "blur-backdrop-light")
- Borders: \`radius-[size]-[value]\` (e.g., "radius-md-8px", "radius-full-999px")

Focus on creating a comprehensive analysis that helps designers build scalable, consistent, and accessible design systems.`;
}
// Send a prompt to Claude API and get a response
async function fetchClaude(prompt, apiKey) {
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
        }
        else {
            throw new Error('Invalid response format from Claude API');
        }
    }
    catch (error) {
        console.error('Error calling Claude API:', error);
        // Provide helpful error messages
        if (error instanceof Error) {
            if (error.message.includes('Failed to fetch')) {
                throw new Error('Failed to connect to Claude API. Please check your internet connection.');
            }
            else if (error.message.includes('401')) {
                throw new Error('Invalid API key. Please check your Claude API key.');
            }
            else if (error.message.includes('429')) {
                throw new Error('Rate limit exceeded. Please try again later.');
            }
        }
        throw error;
    }
}
// Plugin configuration
const PLUGIN_WINDOW_SIZE = { width: 400, height: 700 };
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
if (typeof figma.ui.onmessage === 'function') {
    figma.ui.onmessage(handleUIMessage);
}
else {
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
    }
    catch (error) {
        console.error('Error loading saved API key:', error);
    }
    // Check current selection
    checkSelectionForBatchMode();
}
// Initialize on startup
initializePlugin();
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
        }
        else {
            sendMessageToUI('api-key-status', { hasKey: false });
        }
    }
    catch (error) {
        console.error('Error checking API key:', error);
        sendMessageToUI('api-key-status', { hasKey: false });
    }
}
// Save API key to memory and persistent storage
async function handleSaveApiKey(apiKey) {
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
    }
    catch (error) {
        console.error('Error saving API key:', error);
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        sendMessageToUI('api-key-saved', { success: false, error: errorMessage });
    }
}
// Enhanced analysis with audit features
async function handleEnhancedAnalyze(options) {
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
            const instance = selectedNode;
            if (instance.mainComponent) {
                figma.notify('Analyzing main component instead of instance...', { timeout: 2000 });
                selectedNode = instance.mainComponent;
            }
            else {
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
            }
            else {
                throw new Error('No JSON found in response');
            }
            // Process the enhanced data
            const result = await processEnhancedAnalysis(enhancedData, selectedNode);
            // Store metadata for later use
            globalThis.lastAnalyzedMetadata = result.metadata;
            globalThis.lastAnalyzedNode = selectedNode;
            // Send the enhanced results to UI
            sendMessageToUI('enhanced-analysis-result', result);
            figma.notify('Enhanced analysis complete!', { timeout: 3000 });
        }
        catch (parseError) {
            console.error('Failed to parse enhanced response:', parseError);
            throw new Error('Failed to parse analysis results');
        }
    }
    catch (error) {
        console.error('Error during enhanced analysis:', error);
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        figma.notify(`Analysis failed: ${errorMessage}`, { error: true });
        sendMessageToUI('analysis-error', { error: errorMessage });
    }
}
// Process enhanced analysis data
async function processEnhancedAnalysis(data, node) {
    // Extract audit results
    const audit = {
        states: [],
        accessibility: [],
        naming: [],
        consistency: []
    };

    // Check for missing states
    const expectedStates = ['default', 'hover', 'focus', 'disabled', 'pressed'];
    const foundStates = data.states || [];
    expectedStates.forEach(state => {
        audit.states.push({
            name: state,
            found: foundStates.includes(state)
        });
    });

    // Process accessibility audit
    if (data.audit && data.audit.accessibilityIssues) {
        data.audit.accessibilityIssues.forEach((issue) => {
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
        data.audit.namingIssues.forEach((issue) => {
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

    // Add client-side naming validation to catch obvious issues
    function validateLayerNaming(node) {
        const issues = [];

        function checkNode(currentNode) {
            const name = currentNode.name;

            // Check for obvious problematic patterns
            if (name.includes('renamed to ')) {
                const suggestedName = name.split('renamed to ')[1].trim();
                issues.push({
                    layer: name,
                    name: name,
                    valid: false,
                    suggestion: suggestedName
                });
            } else if (name.includes('should be ')) {
                const suggestedName = name.split('should be ')[1].trim();
                issues.push({
                    layer: name,
                    name: name,
                    valid: false,
                    suggestion: suggestedName
                });
            }
            // Check for generic layer names that should be more descriptive
            else if (/^(Ellipse|Rectangle|Frame|Group)\s*\d*$/i.test(name)) {
                const nodeType = currentNode.type.toLowerCase();
                let suggestion = '';

                if (nodeType === 'ellipse') {
                    suggestion = name.toLowerCase().includes('avatar') ? 'avatar-image' : 'icon';
                } else if (nodeType === 'rectangle') {
                    suggestion = 'background';
                } else if (nodeType === 'frame') {
                    suggestion = 'container';
                } else {
                    suggestion = 'element';
                }

                issues.push({
                    layer: name,
                    name: name,
                    valid: false,
                    suggestion: suggestion
                });
            }

            // Check children if they exist
            if ('children' in currentNode && currentNode.children) {
                currentNode.children.forEach(child => checkNode(child));
            }
        }

        checkNode(node);
        return issues;
    }

    // Add client-side detected issues
    const clientSideIssues = validateLayerNaming(node);
    clientSideIssues.forEach(issue => {
        // Avoid duplicates
        const existingIssue = audit.naming.find(existing => existing.layer === issue.layer);
        if (!existingIssue) {
            audit.naming.push(issue);
        }
    });

    // Generate property cheat sheet - 100% AI-driven, no hard-coded fallbacks
    const properties = data.propertyCheatSheet || [];

    // Extract comprehensive design tokens from the component
    const extractedTokens = await extractDesignTokensFromNode(node);
    console.log('🎯 Comprehensive token extraction complete:', extractedTokens);

    // Use extracted tokens as the primary source - no hard-coded fallbacks
    const tokens = {
        colors: extractedTokens.colors || [],
        spacing: extractedTokens.spacing || [],
        typography: extractedTokens.typography || [],
        effects: extractedTokens.effects || [],
        borders: extractedTokens.borders || [],
        layout: extractedTokens.layout || []
    };

    // Enhance with AI suggestions only if available and if they add value
    if (data.tokens) {
        console.log('🤖 Processing AI token suggestions:', data.tokens);

        // Add AI-suggested color tokens as additional suggestions (not replacements)
        if (data.tokens.colors && data.tokens.colors.length > 0) {
            const aiColorSuggestions = data.tokens.colors.map((name) => ({
                name: name,
                value: getColorValueForToken(name), // Only used for AI suggestions
                type: 'ai-suggestion',
                usage: 'AI-suggested semantic token',
                isActualToken: false,
                recommendation: '🤖 AI suggests this semantic token for better consistency',
                suggestion: `Consider implementing this semantic token in your design system`
            }));

            // Only add AI suggestions that provide new value
            aiColorSuggestions.forEach(aiToken => {
                const exists = tokens.colors.find(existing =>
                    existing.value === aiToken.value || existing.name === aiToken.name);
                if (!exists && tokens.colors.length < 10) { // Limit to prevent overwhelming
                    tokens.colors.push(aiToken);
                }
            });
        }

        // Add AI-suggested spacing tokens
        if (data.tokens.spacing && data.tokens.spacing.length > 0) {
            const aiSpacingTokens = data.tokens.spacing.map((name) => ({
                name: name,
                value: getSpacingValueForToken(name), // Only used for AI suggestions
                type: 'ai-suggestion',
                usage: 'AI-suggested spacing token',
                isActualToken: false,
                recommendation: '🤖 AI suggests this spacing token for consistency',
                suggestion: `Consider implementing this spacing token in your design system`
            }));

            aiSpacingTokens.forEach(aiToken => {
                const exists = tokens.spacing.find(existing =>
                    existing.value === aiToken.value || existing.name === aiToken.name);
                if (!exists && tokens.spacing.length < 8) { // Limit to prevent overwhelming
                    tokens.spacing.push(aiToken);
                }
            });
        }

        // Add AI-suggested typography tokens
        if (data.tokens.typography && data.tokens.typography.length > 0) {
            const aiTypographyTokens = data.tokens.typography.map((name) => ({
                name: name,
                value: getTypographyValueForToken(name).size, // Only used for AI suggestions
                type: 'ai-suggestion',
                usage: 'AI-suggested typography token',
                isActualToken: false,
                context: {
                    fontWeight: getTypographyValueForToken(name).weight,
                    fontFamily: 'System Default'
                },
                recommendation: '🤖 AI suggests this typography token for consistency',
                suggestion: `Consider implementing this typography token in your design system`
            }));

            aiTypographyTokens.forEach(aiToken => {
                const exists = tokens.typography.find(existing =>
                    existing.value === aiToken.value || existing.name === aiToken.name);
                if (!exists && tokens.typography.length < 6) { // Limit to prevent overwhelming
                    tokens.typography.push(aiToken);
                }
            });
        }
    }

    // Log final token analysis
    const totalTokens = tokens.colors.length + tokens.spacing.length + tokens.typography.length +
                       tokens.effects.length + tokens.borders.length;
    const actualTokens = [
        ...tokens.colors,
        ...tokens.spacing,
        ...tokens.typography,
        ...tokens.effects,
        ...tokens.borders
    ].filter(token => token.isActualToken).length;

    console.log('📊 Final token analysis:', {
        total: totalTokens,
        actualTokens: actualTokens,
        hardCoded: totalTokens - actualTokens,
        breakdown: {
            colors: tokens.colors.length,
            spacing: tokens.spacing.length,
            typography: tokens.typography.length,
            effects: tokens.effects.length,
            borders: tokens.borders.length
        }
    });

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
// Enhanced design token extraction with comprehensive analysis
async function extractDesignTokensFromNode(node) {
    const tokens = {
        colors: [],
        spacing: [],
        typography: [],
        effects: [],
        borders: [],
        layout: [],
        semantic: []
    };

    const extractedSets = {
        colors: new Set(),
        spacing: new Set(),
        typography: new Set(),
        effects: new Set(),
        borders: new Set(),
        layout: new Set()
    };

    function rgbToHex(r, g, b) {
        const toHex = (n) => {
            const hex = Math.round(n * 255).toString(16);
            return hex.length === 1 ? '0' + hex : hex;
        };
        return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
    }

    // Enhanced variable name detection
    function getVariableName(variableId) {
        try {
            if (figma.variables && typeof figma.variables.getVariableById === 'function') {
                const variable = figma.variables.getVariableById(variableId);
                return variable ? variable.name : null;
            } else if (figma.getVariableById && typeof figma.getVariableById === 'function') {
                const variable = figma.getVariableById(variableId);
                return variable ? variable.name : null;
            }
        } catch (error) {
            console.log('Could not access variable:', variableId, error);
        }
        return null;
    }

    // Comprehensive bound variables extraction
    async function extractBoundVariables(currentNode) {
        const boundVars = {
            fills: [],
            strokes: [],
            effects: [],
            fontSize: [],
            fontFamily: [],
            letterSpacing: [],
            lineHeight: [],
            paddingTop: null,
            paddingRight: null,
            paddingBottom: null,
            paddingLeft: null,
            itemSpacing: null,
            cornerRadius: null,
            strokeWeight: null,
            opacity: null
        };

        try {
            console.log('🔍 Checking node for variables/styles:', currentNode.name, {
                hasBoundVariables: !!currentNode.boundVariables,
                hasFillStyleId: !!currentNode.fillStyleId,
                hasStrokeStyleId: !!currentNode.strokeStyleId,
                hasTextStyleId: !!currentNode.textStyleId,
                hasEffectStyleId: !!currentNode.effectStyleId
            });

            // First, check for Figma Variables (new system)
            if (currentNode.boundVariables) {
                console.log('🔍 Found boundVariables:', Object.keys(currentNode.boundVariables));

                // Process all array-based variables
                ['fills', 'strokes', 'effects', 'fontSize', 'fontFamily', 'letterSpacing', 'lineHeight'].forEach(prop => {
                    if (currentNode.boundVariables[prop] && Array.isArray(currentNode.boundVariables[prop])) {
                        currentNode.boundVariables[prop].forEach(variable => {
                            if (variable && variable.id) {
                                const varName = getVariableName(variable.id);
                                console.log(`🎯 Variable found for ${prop}:`, varName);
                                if (varName) {
                                    boundVars[prop].push(varName);
                                }
                            }
                        });
                    }
                });

                // Process single-value variables
                ['paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft', 'itemSpacing', 'cornerRadius', 'strokeWeight', 'opacity'].forEach(prop => {
                    if (currentNode.boundVariables[prop] && currentNode.boundVariables[prop].id) {
                        const varName = getVariableName(currentNode.boundVariables[prop].id);
                        console.log(`🎯 Variable found for ${prop}:`, varName);
                        if (varName) {
                            boundVars[prop] = varName;
                        }
                    }
                });
            }

            // Second, check for Figma Styles (older system that might still be in use)
            // These are also considered "tokens" since they represent design decisions

            // Store promises for all async style lookups
            const stylePromises = [];

            if (currentNode.fillStyleId) {
                stylePromises.push(
                    figma.getStyleByIdAsync(currentNode.fillStyleId)
                        .then(style => {
                            if (style && style.name) {
                                console.log('🎨 Fill style found:', style.name);
                                boundVars.fills.push(style.name);
                            }
                        })
                        .catch(error => {
                            console.log('Could not access fill style:', error);
                        })
                );
            }

            if (currentNode.strokeStyleId) {
                stylePromises.push(
                    figma.getStyleByIdAsync(currentNode.strokeStyleId)
                        .then(style => {
                            if (style && style.name) {
                                console.log('🖊️ Stroke style found:', style.name);
                                boundVars.strokes.push(style.name);
                            }
                        })
                        .catch(error => {
                            console.log('Could not access stroke style:', error);
                        })
                );
            }

            if (currentNode.type === 'TEXT' && currentNode.textStyleId) {
                stylePromises.push(
                    figma.getStyleByIdAsync(currentNode.textStyleId)
                        .then(style => {
                            if (style && style.name) {
                                console.log('📝 Text style found:', style.name);
                                boundVars.fontSize.push(style.name);
                            }
                        })
                        .catch(error => {
                            console.log('Could not access text style:', error);
                        })
                );
            }

            if (currentNode.effectStyleId) {
                stylePromises.push(
                    figma.getStyleByIdAsync(currentNode.effectStyleId)
                        .then(style => {
                            if (style && style.name) {
                                console.log('✨ Effect style found:', style.name);
                                boundVars.effects.push(style.name);
                            }
                        })
                        .catch(error => {
                            console.log('Could not access effect style:', error);
                        })
                );
            }

            // Wait for all style lookups to complete before continuing
            if (stylePromises.length > 0) {
                await Promise.all(stylePromises);
            }

        } catch (error) {
            console.log('Error extracting bound variables:', error);
        }

        return boundVars;
    }

    // Intelligent semantic token naming based on context and design patterns
    function generateSemanticTokenName(value, type, nodeType, context = {}) {
        const { isInteractive = false, hierarchy = 'primary', usage = 'default' } = context;

        if (type === 'color') {
            const hex = value.toLowerCase();

            // Analyze color properties
            const r = parseInt(hex.substr(1, 2), 16);
            const g = parseInt(hex.substr(3, 2), 16);
            const b = parseInt(hex.substr(5, 2), 16);
            const brightness = (r + g + b) / 3;
            const isGrayscale = Math.abs(r - g) < 15 && Math.abs(g - b) < 15 && Math.abs(r - b) < 15;

            // Generate semantic names based on context
            if (nodeType === 'TEXT') {
                if (brightness < 80) return 'text-primary-dark';
                if (brightness > 200) return 'text-primary-light';
                return 'text-primary-default';
            }

            if (isInteractive) {
                if (usage === 'fill') return `interactive-${hierarchy}-background`;
                if (usage === 'stroke') return `interactive-${hierarchy}-border`;
            }

            if (nodeType === 'ELLIPSE') {
                return usage === 'stroke' ? 'avatar-border' : 'avatar-background';
            }

            // Surface and background detection
            if (brightness > 240) return 'surface-primary';
            if (brightness < 40) return 'surface-inverse';
            if (isGrayscale) return `neutral-${Math.round(brightness / 25.5) * 100}`;

            return `color-${hierarchy}-${usage}`;
        }

        if (type === 'spacing') {
            const numValue = parseInt(value);
            if (numValue <= 4) return 'spacing-xs';
            if (numValue <= 8) return 'spacing-sm';
            if (numValue <= 16) return 'spacing-md';
            if (numValue <= 24) return 'spacing-lg';
            if (numValue <= 32) return 'spacing-xl';
            return 'spacing-xxl';
        }

        if (type === 'fontSize') {
            const numValue = parseInt(value);
            if (numValue <= 12) return 'text-xs';
            if (numValue <= 14) return 'text-sm';
            if (numValue <= 16) return 'text-base';
            if (numValue <= 18) return 'text-lg';
            if (numValue <= 24) return 'text-xl';
            return 'text-xxl';
        }

        return `${type}-${usage}-default`;
    }

    // Enhanced node traversal with comprehensive token extraction
    async function traverseNode(currentNode) {
        const boundVars = await extractBoundVariables(currentNode);
        const isInteractive = ['INSTANCE', 'COMPONENT'].includes(currentNode.type) &&
                             (currentNode.name.toLowerCase().includes('button') ||
                              currentNode.name.toLowerCase().includes('link') ||
                              currentNode.name.toLowerCase().includes('input'));

        // Extract color tokens from fills
        if ('fills' in currentNode && currentNode.fills && Array.isArray(currentNode.fills)) {
            currentNode.fills.forEach((fill, index) => {
                if (fill.type === 'SOLID' && fill.visible !== false) {
                    const hex = rgbToHex(fill.color.r, fill.color.g, fill.color.b);
                    const colorKey = `${hex}-fill-${currentNode.type}`;

                    if (!extractedSets.colors.has(colorKey)) {
                        extractedSets.colors.add(colorKey);

                        const tokenName = boundVars.fills[index] ||
                                        generateSemanticTokenName(hex, 'color', currentNode.type, {
                                            isInteractive,
                                            usage: 'fill',
                                            hierarchy: currentNode.name.toLowerCase().includes('primary') ? 'primary' : 'secondary'
                                        });
                        const isRealToken = !!boundVars.fills[index];

                        tokens.colors.push({
                            name: tokenName,
                            value: hex,
                            type: 'fill',
                            usage: 'background',
                            isActualToken: isRealToken,
                            context: {
                                nodeType: currentNode.type,
                                nodeName: currentNode.name,
                                isInteractive: isInteractive
                            },
                            recommendation: isRealToken ?
                                '✅ Using design token - excellent!' :
                                `💡 Consider creating a semantic token: ${tokenName}`,
                            suggestion: isRealToken ?
                                `Continue using this design token for consistency` :
                                `Replace hard-coded color with semantic token for better maintainability`
                        });
                    }
                }
            });
        }

        // Extract color tokens from strokes with enhanced analysis
        if ('strokes' in currentNode && currentNode.strokes && Array.isArray(currentNode.strokes)) {
            currentNode.strokes.forEach((stroke, index) => {
                if (stroke.type === 'SOLID' && stroke.visible !== false) {
                    const hex = rgbToHex(stroke.color.r, stroke.color.g, stroke.color.b);
                    const strokeKey = `${hex}-stroke-${currentNode.type}`;

                    if (!extractedSets.colors.has(strokeKey)) {
                        extractedSets.colors.add(strokeKey);

                        const tokenName = boundVars.strokes[index] ||
                                        generateSemanticTokenName(hex, 'color', currentNode.type, {
                                            isInteractive,
                                            usage: 'stroke',
                                            hierarchy: 'primary'
                                        });
                        const isRealToken = !!boundVars.strokes[index];

                        tokens.colors.push({
                            name: tokenName,
                            value: hex,
                            type: 'stroke',
                            usage: 'border',
                            isActualToken: isRealToken,
                            context: {
                                nodeType: currentNode.type,
                                nodeName: currentNode.name,
                                strokeWeight: currentNode.strokeWeight || 1
                            },
                            recommendation: isRealToken ?
                                '✅ Using design token - excellent!' :
                                `💡 Consider creating a semantic token: ${tokenName}`,
                            suggestion: isRealToken ?
                                `Continue using this design token for consistency` :
                                `Replace hard-coded border color with semantic token`
                        });
                    }
                }
            });
        }

        // Extract effects (shadows, blurs, etc.)
        if ('effects' in currentNode && currentNode.effects && Array.isArray(currentNode.effects)) {
            currentNode.effects.forEach((effect, index) => {
                if (effect.visible !== false) {
                                        const offsetX = effect.offset && effect.offset.x ? effect.offset.x : 0;
                    const offsetY = effect.offset && effect.offset.y ? effect.offset.y : 0;
                    const effectKey = `${effect.type}-${effect.radius || 0}-${offsetX}-${offsetY}`;

                    if (!extractedSets.effects.has(effectKey)) {
                        extractedSets.effects.add(effectKey);

                        const tokenName = boundVars.effects[index] ||
                                        `effect-${effect.type.toLowerCase()}-${effect.radius || 'default'}`;
                        const isRealToken = !!boundVars.effects[index];

                        let effectValue = '';
                        if (effect.type === 'DROP_SHADOW') {
                            const color = effect.color ?
                                `rgba(${Math.round(effect.color.r * 255)}, ${Math.round(effect.color.g * 255)}, ${Math.round(effect.color.b * 255)}, ${effect.color.a})` :
                                'rgba(0, 0, 0, 0.1)';
                            effectValue = `${offsetX}px ${offsetY}px ${effect.radius || 0}px ${color}`;
                        } else if (effect.type === 'BLUR') {
                            effectValue = `blur(${effect.radius || 0}px)`;
                        }

                        tokens.effects.push({
                            name: tokenName,
                            value: effectValue,
                            type: effect.type.toLowerCase(),
                            isActualToken: isRealToken,
                            context: {
                                nodeType: currentNode.type,
                                nodeName: currentNode.name,
                                effectType: effect.type
                            },
                            recommendation: isRealToken ?
                                '✅ Using design token for effects' :
                                `💡 Consider creating an effect token: ${tokenName}`,
                            suggestion: isRealToken ?
                                `Effect token provides consistent visual depth` :
                                `Standardize shadow/blur effects with design tokens`
                        });
                    }
                }
            });
        }

        // Extract border radius tokens
        if ('cornerRadius' in currentNode && currentNode.cornerRadius && currentNode.cornerRadius > 0) {
            const radiusKey = `radius-${currentNode.cornerRadius}`;

            if (!extractedSets.borders.has(radiusKey)) {
                extractedSets.borders.add(radiusKey);

                const tokenName = boundVars.cornerRadius ||
                                generateSemanticTokenName(`${currentNode.cornerRadius}px`, 'radius', currentNode.type);
                const isRealToken = !!boundVars.cornerRadius;

                tokens.borders.push({
                    name: tokenName,
                    value: `${currentNode.cornerRadius}px`,
                    type: 'border-radius',
                    isActualToken: isRealToken,
                    context: {
                        nodeType: currentNode.type,
                        nodeName: currentNode.name
                    },
                    recommendation: isRealToken ?
                        '✅ Using border radius token' :
                        `💡 Consider creating a radius token: ${tokenName}`,
                    suggestion: isRealToken ?
                        `Radius token ensures consistent corner styling` :
                        `Standardize border radius values with design tokens`
                });
            }
        }

        // Enhanced typography token extraction
        if (currentNode.type === 'TEXT') {
            const textNode = currentNode;
            const fontSize = textNode.fontSize;
            const fontName = textNode.fontName;
            const letterSpacing = textNode.letterSpacing;
            const lineHeight = textNode.lineHeight;

            // Font size tokens
            if (fontSize && typeof fontSize === 'number') {
                const sizeKey = `fontSize-${fontSize}`;
                if (!extractedSets.typography.has(sizeKey)) {
                    extractedSets.typography.add(sizeKey);

                    const fontSizeTokenName = (boundVars.fontSize && boundVars.fontSize[0]) ||
                                            generateSemanticTokenName(`${fontSize}px`, 'fontSize', 'TEXT');
                    const isRealFontSizeToken = !!(boundVars.fontSize && boundVars.fontSize.length > 0);

                    tokens.typography.push({
                        name: fontSizeTokenName,
                        value: `${fontSize}px`,
                        type: 'font-size',
                        isActualToken: isRealFontSizeToken,
                        context: {
                            fontFamily: fontName ? fontName.family : 'Unknown',
                            fontWeight: (fontName && fontName.style && fontName.style.toLowerCase().includes('bold')) ? '700' :
                                       (fontName && fontName.style && fontName.style.toLowerCase().includes('medium')) ? '500' : '400',
                            textContent: textNode.characters ? textNode.characters.substring(0, 20) + '...' : ''
                        },
                        recommendation: isRealFontSizeToken ?
                            '✅ Using typography token for font size' :
                            `💡 Consider creating a font size token: ${fontSizeTokenName}`,
                        suggestion: isRealFontSizeToken ?
                            `Typography token ensures consistent text sizing` :
                            `Standardize font sizes with semantic typography tokens`
                    });
                }
            }

            // Line height tokens
            if (lineHeight && typeof lineHeight === 'object' && lineHeight.unit) {
                const lineHeightKey = `lineHeight-${lineHeight.value}-${lineHeight.unit}`;
                if (!extractedSets.typography.has(lineHeightKey)) {
                    extractedSets.typography.add(lineHeightKey);

                    const lineHeightValue = lineHeight.unit === 'PERCENT' ?
                        `${lineHeight.value}%` :
                        `${lineHeight.value}${lineHeight.unit.toLowerCase()}`;

                    tokens.typography.push({
                        name: `line-height-${lineHeight.value}${lineHeight.unit.toLowerCase()}`,
                        value: lineHeightValue,
                        type: 'line-height',
                        isActualToken: false,
                        context: {
                            fontSize: fontSize,
                            fontFamily: fontName ? fontName.family : 'Unknown'
                        },
                        recommendation: `💡 Consider creating a line height token`,
                        suggestion: `Standardize line heights for better typography consistency`
                    });
                }
            }
        }

        // Enhanced spacing token extraction with layout context
        if ('paddingLeft' in currentNode) {
            const paddings = [
                { prop: 'paddingTop', value: currentNode.paddingTop, token: boundVars.paddingTop },
                { prop: 'paddingRight', value: currentNode.paddingRight, token: boundVars.paddingRight },
                { prop: 'paddingBottom', value: currentNode.paddingBottom, token: boundVars.paddingBottom },
                { prop: 'paddingLeft', value: currentNode.paddingLeft, token: boundVars.paddingLeft }
            ];

            paddings.forEach(({ prop, value, token }) => {
                if (value && value > 0) {
                    const spacingKey = `${prop}-${value}`;
                    if (!extractedSets.spacing.has(spacingKey)) {
                        extractedSets.spacing.add(spacingKey);

                        const tokenName = token || generateSemanticTokenName(`${value}px`, 'spacing', currentNode.type);
                        const isRealToken = !!token;

                        tokens.spacing.push({
                            name: tokenName,
                            value: `${value}px`,
                            type: 'padding',
                            property: prop,
                            isActualToken: isRealToken,
                            context: {
                                nodeType: currentNode.type,
                                nodeName: currentNode.name,
                                layoutMode: currentNode.layoutMode || 'none'
                            },
                            recommendation: isRealToken ?
                                '✅ Using spacing token for padding' :
                                `💡 Consider creating a spacing token: ${tokenName}`,
                            suggestion: isRealToken ?
                                `Spacing token ensures consistent layout patterns` :
                                `Standardize padding values with semantic spacing tokens`
                        });
                    }
                }
            });
        }

        // Item spacing (gap) tokens
        if ('itemSpacing' in currentNode && currentNode.itemSpacing && currentNode.itemSpacing > 0) {
            const spacingKey = `itemSpacing-${currentNode.itemSpacing}`;
            if (!extractedSets.spacing.has(spacingKey)) {
                extractedSets.spacing.add(spacingKey);

                const tokenName = boundVars.itemSpacing ||
                                generateSemanticTokenName(`${currentNode.itemSpacing}px`, 'spacing', currentNode.type);
                const isRealToken = !!boundVars.itemSpacing;

                tokens.spacing.push({
                    name: tokenName,
                    value: `${currentNode.itemSpacing}px`,
                    type: 'gap',
                    property: 'itemSpacing',
                    isActualToken: isRealToken,
                    context: {
                        nodeType: currentNode.type,
                        nodeName: currentNode.name,
                        layoutMode: currentNode.layoutMode || 'none',
                        direction: currentNode.layoutMode === 'HORIZONTAL' ? 'horizontal' : 'vertical'
                    },
                    recommendation: isRealToken ?
                        '✅ Using spacing token for gap' :
                        `💡 Consider creating a gap token: ${tokenName}`,
                    suggestion: isRealToken ?
                        `Gap token provides consistent spacing between elements` :
                        `Standardize gap values for better layout consistency`
                });
            }
        }

        // Traverse children recursively
        if ('children' in currentNode) {
            for (const child of currentNode.children) {
                await traverseNode(child);
            }
        }
    }

    // Start traversal from the root node
    await traverseNode(node);

    // Sort tokens by usage frequency and importance
    tokens.colors.sort((a, b) => {
        // Prioritize actual tokens over suggestions
        if (a.isActualToken && !b.isActualToken) return -1;
        if (!a.isActualToken && b.isActualToken) return 1;
        return 0;
    });

    tokens.spacing.sort((a, b) => parseInt(a.value) - parseInt(b.value));

    console.log('🎨 Comprehensive token extraction complete:', {
        colors: tokens.colors.length,
        spacing: tokens.spacing.length,
        typography: tokens.typography.length,
        effects: tokens.effects.length,
        borders: tokens.borders.length
    });

    return tokens;
}

// Remove hard-coded token value functions - rely on extracted tokens only
function getColorValueForToken(tokenName) {
    // This function should only be used for AI-generated token suggestions
    // and should ideally be replaced with actual design system integration
    console.warn('⚠️ Using fallback color value for AI suggestion:', tokenName);
    return '#CCCCCC'; // Generic fallback for AI suggestions only
}

function getSpacingValueForToken(tokenName) {
    console.warn('⚠️ Using fallback spacing value for AI suggestion:', tokenName);
    return '8px'; // Generic fallback for AI suggestions only
}

function getTypographyValueForToken(tokenName) {
    console.warn('⚠️ Using fallback typography value for AI suggestion:', tokenName);
    return { size: '14px', weight: '400' }; // Generic fallback for AI suggestions only
}
// Handle batch analysis for multiple components
async function handleBatchAnalysis(nodes, options) {
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
            const analysis = await fetchClaudeAnalysis(prompt, storedApiKey);
            // Parse response
            const jsonMatch = analysis.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                const enhancedData = JSON.parse(jsonMatch[0]);
                const result = await processEnhancedAnalysis(enhancedData, node);
                results.push({
                    node: node,
                    name: node.name,
                    result: result
                });
                successCount++;
            }
            else {
                failureCount++;
            }
        }
        catch (error) {
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
async function handleGeneratePlayground(metadata) {
    try {
        // Get the last analyzed node
        const sourceNode = globalThis.lastAnalyzedNode;
        if (!sourceNode) {
            throw new Error('No component was analyzed. Please analyze a component first.');
        }
        // Get the main component
        let componentNode = sourceNode;
        if (sourceNode.type === 'INSTANCE') {
            const instance = sourceNode;
            if (instance.mainComponent) {
                componentNode = instance.mainComponent;
            }
            else {
                throw new Error('Cannot generate playground: Instance has no main component');
            }
        }
        if (componentNode.type !== 'COMPONENT') {
            throw new Error('Please select a component to generate playground');
        }
        const component = componentNode;
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
            playgroundFrame.resize(Math.max(680, currentX + 40), currentY + maxRowHeight + 40);
            // Add to parent
            if (component.parent) {
                component.parent.appendChild(playgroundFrame);
            }
            // Select and zoom
            figma.currentPage.selection = [playgroundFrame];
            figma.viewport.scrollAndZoomIntoView([playgroundFrame]);
        }
        catch (error) {
            console.error('Error creating playground:', error);
            playgroundFrame.remove();
            throw error;
        }
        sendMessageToUI('playground-generated', {
            success: true,
            count: totalInstances,
            message: `Generated ${totalInstances} playground instances`
        });
    }
    catch (error) {
        console.error('Error generating playground:', error);
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        sendMessageToUI('playground-generated', { success: false, error: errorMessage });
    }
}
// Generate documentation frame in Figma
async function handleGenerateDocsFrame(data) {
    try {
        const { metadata, notes } = data;
        // Get the last analyzed node
        const sourceNode = globalThis.lastAnalyzedNode;
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
                propsList.characters = metadata.props.map((p) => `• ${p}`).join('\n');
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
                statesList.characters = metadata.states.map((s) => `• ${s}`).join('\n');
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
                slotsList.characters = metadata.slots.map((s) => `• ${s}`).join('\n');
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
        }
        catch (error) {
            console.error('Error creating documentation frame:', error);
            docsFrame.remove();
            throw error;
        }
        sendMessageToUI('docs-frame-generated', { success: true });
        figma.notify('Documentation frame generated!', { timeout: 3000 });
    }
    catch (error) {
        console.error('Error generating docs frame:', error);
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        sendMessageToUI('docs-frame-generated', { success: false, error: errorMessage });
    }
}
// Save collaboration notes
async function handleSaveCollabNotes(notes) {
    try {
        const lastNode = globalThis.lastAnalyzedNode;
        if (!lastNode) {
            throw new Error('No component selected');
        }
        // Store notes in plugin data
        lastNode.setPluginData('ai-design-copilot-notes', notes);
        // Create or update visual notes indicator
        await createNotesIndicator(lastNode, notes);
        figma.notify('Notes saved successfully with visual indicator', { timeout: 2000 });
        sendMessageToUI('notes-saved', { success: true });
    }
    catch (error) {
        console.error('Error saving notes:', error);
        figma.notify('Failed to save notes', { error: true });
        sendMessageToUI('notes-saved', { success: false, error: error instanceof Error ? error.message : 'Unknown error' });
    }
}
// Create visual indicator for saved notes
async function createNotesIndicator(node, notes) {
    try {
        // Load font
        await figma.loadFontAsync({ family: "Inter", style: "Medium" });
        // Check if a notes indicator already exists
        const existingIndicatorId = node.getPluginData('ai-design-copilot-notes-indicator-id');
        if (existingIndicatorId) {
            const existingIndicator = await figma.getNodeByIdAsync(existingIndicatorId);
            if (existingIndicator && existingIndicator.type === 'FRAME') {
                // Update existing indicator
                const textNode = existingIndicator.children.find(child => child.type === 'TEXT');
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
    }
    catch (error) {
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
    }
    else {
        sendMessageToUI('batch-selection-update', { components: [] });
    }
}
// Listen for selection changes
figma.on('selectionchange', () => {
    checkSelectionForBatchMode();
});
// Extract detailed information from a Figma node including nested structure
function extractComponentInfo(node) {
    // Helper function to extract style information
    function extractStyles(node) {
        const styles = {};
        // Extract fill styles
        if ('fills' in node && node.fills && Array.isArray(node.fills)) {
            styles.fills = node.fills.map((fill) => ({
                type: fill.type,
                visible: fill.visible,
                opacity: fill.opacity,
                color: fill.type === 'SOLID' ? fill.color : undefined
            }));
        }
        // Extract stroke styles
        if ('strokes' in node && node.strokes && Array.isArray(node.strokes)) {
            styles.strokes = node.strokes.map((stroke) => ({
                type: stroke.type,
                visible: stroke.visible,
                opacity: stroke.opacity,
                color: stroke.type === 'SOLID' ? stroke.color : undefined
            }));
            styles.strokeWeight = node.strokeWeight;
            styles.strokeAlign = node.strokeAlign;
        }
        // Extract effects
        if ('effects' in node && node.effects && Array.isArray(node.effects)) {
            styles.effects = node.effects.map((effect) => ({
                type: effect.type,
                visible: effect.visible,
                radius: effect.radius,
                offset: effect.offset
            }));
        }
        // Extract corner radius
        if ('cornerRadius' in node) {
            styles.cornerRadius = node.cornerRadius;
        }
        // Extract opacity
        if ('opacity' in node) {
            styles.opacity = node.opacity;
        }
        return styles;
    }
    // Helper function to extract layer hierarchy
    function extractLayerHierarchy(node, depth = 0) {
        if (depth > 5)
            return null; // Limit depth to prevent excessive recursion
        const layer = {
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
            layer.characters = node.characters;
        }
        return layer;
    }
    // Build comprehensive info object
    const info = {
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
        info.constraints = node.constraints;
    }
    // Add layout mode information for frames
    if (node.type === 'FRAME' || node.type === 'COMPONENT' || node.type === 'INSTANCE') {
        const frameNode = node;
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
        const textNode = node;
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
        const componentNode = node;
        info.description = componentNode.description;
        info.documentationLinks = componentNode.documentationLinks;
    }
    // Add instance information
    if (node.type === 'INSTANCE') {
        const instanceNode = node;
        info.mainComponent = instanceNode.mainComponent ? {
            name: instanceNode.mainComponent.name,
            id: instanceNode.mainComponent.id,
            description: instanceNode.mainComponent.description
        } : null;
    }
    // Detect common patterns (slots, states)
    if ('children' in node && node.children) {
        // Look for common slot patterns
        const potentialSlots = node.children.filter(child => child.name.toLowerCase().includes('slot') ||
            child.name.toLowerCase().includes('icon') ||
            child.name.toLowerCase().includes('content'));
        if (potentialSlots.length > 0) {
            info.detectedSlots = potentialSlots.map(slot => slot.name);
        }
        // Detect variant patterns in component sets
        if (node.type === 'COMPONENT_SET') {
            try {
                const componentSet = node;
                info.variantProperties = componentSet.variantGroupProperties;
            }
            catch (error) {
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
function extractComponentContext(node) {
    const fullInfo = extractComponentInfo(node);
    // Extract clean layer names for better AI understanding
    function getLayerNames(hierarchy) {
        const names = [];
        if (hierarchy.name)
            names.push(hierarchy.name);
        if (hierarchy.children) {
            hierarchy.children.forEach((child) => {
                names.push(...getLayerNames(child));
            });
        }
        return names;
    }
    // Detect potential variants from naming patterns
    function detectVariantPatterns(node) {
        const patterns = [];
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
    // Extract colors and spacing from the node
    function extractBasicTokens(node) {
        const colors = [];
        const spacing = [];
        const textContent = [];

        function traverseNode(currentNode) {
            // Extract colors from fills
            if ('fills' in currentNode && currentNode.fills && Array.isArray(currentNode.fills)) {
                currentNode.fills.forEach((fill) => {
                    if (fill.type === 'SOLID' && fill.visible !== false && fill.color) {
                        const hex = rgbToHex(fill.color.r, fill.color.g, fill.color.b);
                        if (!colors.includes(hex)) {
                            colors.push(hex);
                        }
                    }
                });
            }

            // Extract colors from strokes
            if ('strokes' in currentNode && currentNode.strokes && Array.isArray(currentNode.strokes)) {
                currentNode.strokes.forEach((stroke) => {
                    if (stroke.type === 'SOLID' && stroke.visible !== false && stroke.color) {
                        const hex = rgbToHex(stroke.color.r, stroke.color.g, stroke.color.b);
                        if (!colors.includes(hex)) {
                            colors.push(hex);
                        }
                    }
                });
            }

            // Extract spacing from padding
            if ('paddingLeft' in currentNode) {
                const paddings = [currentNode.paddingLeft, currentNode.paddingRight, currentNode.paddingTop, currentNode.paddingBottom];
                paddings.forEach(padding => {
                    if (padding && padding > 0 && !spacing.includes(padding + 'px')) {
                        spacing.push(padding + 'px');
                    }
                });
            }

            // Extract item spacing
            if ('itemSpacing' in currentNode && currentNode.itemSpacing && currentNode.itemSpacing > 0) {
                const gap = currentNode.itemSpacing + 'px';
                if (!spacing.includes(gap)) {
                    spacing.push(gap);
                }
            }

            // Extract text content
            if (currentNode.type === 'TEXT') {
                const textNode = currentNode;
                if (textNode.characters && textNode.characters.trim()) {
                    textContent.push(textNode.characters.trim());
                }
            }

            // Traverse children
            if ('children' in currentNode) {
                currentNode.children.forEach(child => traverseNode(child));
            }
        }

        // Helper function for RGB to hex conversion
        function rgbToHex(r, g, b) {
            const toHex = (n) => {
                const hex = Math.round(n * 255).toString(16);
                return hex.length === 1 ? '0' + hex : hex;
            };
            return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
        }

        traverseNode(node);
        return { colors, spacing, textContent };
    }

    const extractedTokens = extractBasicTokens(node);

    // Build clean context object
    const context = {
        name: fullInfo.name,
        type: node.type,
        hierarchy: fullInfo.structure.layerHierarchy,
        colors: extractedTokens.colors,
        spacing: extractedTokens.spacing,
        textContent: extractedTokens.textContent.join(' '),
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
// Generate all combinations of variants
function generateVariantCombinations(variants) {
    const keys = Object.keys(variants);
    if (keys.length === 0)
        return [];
    const combinations = [];
    function generateCombination(index, current) {
        if (index === keys.length) {
            combinations.push(Object.assign({}, current));
            return;
        }
        const key = keys[index];
        const values = variants[key];
        if (Array.isArray(values)) {
            for (const value of values) {
                current[key] = value;
                generateCombination(index + 1, current);
            }
        }
        else {
            current[key] = values;
            generateCombination(index + 1, current);
        }
    }
    generateCombination(0, {});
    return combinations;
}
// Apply variant-specific styling
function applyVariantStyles(instance, combination, metadata) {
    // Apply size variants
    if (combination.size) {
        const sizeMap = {
            'small': 0.8,
            'medium': 1,
            'large': 1.2,
            'xl': 1.5
        };
        const scale = sizeMap[combination.size.toLowerCase()] || 1;
        if (scale !== 1) {
            instance.resize((instance.width || 100) * scale, (instance.height || 40) * scale);
        }
    }
    // Apply variant style (primary, secondary, etc.)
    if (combination.variant) {
        const variant = combination.variant.toLowerCase();
        // Helper function to modify fills
        function modifyFills(node, modifier) {
            if ('fills' in node && Array.isArray(node.fills)) {
                const newFills = node.fills.map(fill => {
                    if (fill.type === 'SOLID') {
                        const modified = modifier(fill);
                        return modified || fill;
                    }
                    return fill;
                }).filter(Boolean);
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
        }
        else if (variant === 'secondary') {
            // Lighter background, darker text
            modifyFills(instance, (fill) => {
                if (fill.type === 'SOLID' && fill.color) {
                    // Check if it's likely a background (lighter color)
                    const brightness = (fill.color.r + fill.color.g + fill.color.b) / 3;
                    if (brightness > 0.5) {
                        // Make it very light
                        return Object.assign(Object.assign({}, fill), { color: { r: 0.95, g: 0.95, b: 0.98 } });
                    }
                    else {
                        // Make text darker
                        return Object.assign(Object.assign({}, fill), { color: { r: 0.2, g: 0.2, b: 0.3 } });
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
                instance.strokeWeight = 1;
                instance.strokeAlign = 'INSIDE';
            }
        }
        else if (variant === 'tertiary' || variant === 'ghost') {
            // Transparent background
            modifyFills(instance, (fill) => {
                if (fill.type === 'SOLID' && fill.color) {
                    const brightness = (fill.color.r + fill.color.g + fill.color.b) / 3;
                    if (brightness > 0.5) {
                        // Make background transparent
                        return Object.assign(Object.assign({}, fill), { opacity: 0 });
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
function applyStateOverrides(instance, state, metadata) {
    const stateLower = state.toLowerCase();
    // Helper function to find and modify all fills recursively
    function modifyFills(node, modifier) {
        if ('fills' in node && Array.isArray(node.fills)) {
            const newFills = node.fills.map(fill => {
                if (fill.type === 'SOLID') {
                    const modified = modifier(fill);
                    return modified || fill;
                }
                return fill;
            }).filter(Boolean);
            if (newFills.length > 0) {
                node.fills = newFills;
            }
        }
        if ('children' in node && node.children) {
            node.children.forEach(child => modifyFills(child, modifier));
        }
    }
    // Helper function to add stroke
    function addStroke(node, color, weight) {
        if ('strokes' in node) {
            node.strokes = [{
                    type: 'SOLID',
                    color: color,
                    opacity: 1
                }];
            node.strokeWeight = weight;
        }
    }
    // Common state patterns with visual modifications
    if (stateLower === 'hover') {
        // Lighten fills slightly
        modifyFills(instance, (fill) => {
            if (fill.type === 'SOLID') {
                return Object.assign(Object.assign({}, fill), { color: {
                        r: Math.min(1, ((fill.color && fill.color.r) || 0) + 0.05),
                        g: Math.min(1, ((fill.color && fill.color.g) || 0) + 0.05),
                        b: Math.min(1, ((fill.color && fill.color.b) || 0) + 0.05)
                    } });
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
                }
            ];
        }
    }
    else if (stateLower === 'pressed' || stateLower === 'active') {
        // Darken fills slightly
        modifyFills(instance, (fill) => {
            if (fill.type === 'SOLID') {
                return Object.assign(Object.assign({}, fill), { color: {
                        r: Math.max(0, ((fill.color && fill.color.r) || 0) - 0.1),
                        g: Math.max(0, ((fill.color && fill.color.g) || 0) - 0.1),
                        b: Math.max(0, ((fill.color && fill.color.b) || 0) - 0.1)
                    } });
            }
            return fill;
        });
        // Remove shadows for pressed state
        if ('effects' in instance) {
            instance.effects = (instance.effects || []).filter(effect => effect.type !== 'DROP_SHADOW');
        }
    }
    else if (stateLower === 'disabled') {
        // Reduce opacity and desaturate
        instance.opacity = 0.5;
        // Convert colors to grayscale
        modifyFills(instance, (fill) => {
            if (fill.type === 'SOLID') {
                const gray = (((fill.color && fill.color.r) || 0) + ((fill.color && fill.color.g) || 0) + ((fill.color && fill.color.b) || 0)) / 3;
                return Object.assign(Object.assign({}, fill), { color: { r: gray, g: gray, b: gray } });
            }
            return fill;
        });
    }
    else if (stateLower === 'focus' || stateLower === 'focused') {
        // Add focus ring
        if ('strokes' in instance) {
            instance.strokes = [{
                    type: 'SOLID',
                    color: { r: 0, g: 0.4, b: 0.8 }, // Blue focus ring
                    opacity: 1
                }];
            instance.strokeWeight = 2;
            instance.strokeAlign = 'OUTSIDE';
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
            const instance = selectedNode;
            if (instance.mainComponent) {
                figma.notify('Analyzing main component instead of instance...', { timeout: 2000 });
                selectedNode = instance.mainComponent;
            }
            else {
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
            }
            else {
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
        }
        catch (parseError) {
            console.error('Failed to parse JSON response:', parseError);
            // Fallback to showing raw analysis
            sendMessageToUI('analysis-result', { analysis });
            sendMessageToUI('analysis-complete', { success: true, message: 'Analysis completed (raw format)' });
            return;
        }
        // Store metadata for later use (variant generation, etc.)
        globalThis.lastAnalyzedMetadata = metadata;
        globalThis.lastAnalyzedNode = selectedNode;
        // Display the analysis result
        figma.notify(`Analysis complete! Check the plugin panel for details.`, { timeout: 5000 });
        // Send the structured metadata to UI for display
        sendMessageToUI('metadata-result', { metadata });
        // Send success message to UI
        sendMessageToUI('analysis-complete', { success: true, message: 'Analysis completed successfully' });
        console.log('Parsed metadata:', metadata);
    }
    catch (error) {
        console.error('Error during analysis:', error);
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        figma.notify(`Analysis failed: ${errorMessage}`, { error: true });
        sendMessageToUI('analysis-error', { error: errorMessage });
    }
}
// Generate component variants based on metadata
async function handleGenerateVariants(metadata) {
    try {
        // Get the last analyzed node
        const sourceNode = globalThis.lastAnalyzedNode;
        if (!sourceNode) {
            throw new Error('No component was analyzed. Please analyze a component first.');
        }
        // Get the main component (not instance)
        let componentNode = sourceNode;
        if (sourceNode.type === 'INSTANCE') {
            const instance = sourceNode;
            if (instance.mainComponent) {
                componentNode = instance.mainComponent;
                figma.notify('Using main component for generation...', { timeout: 2000 });
            }
            else {
                throw new Error('Cannot generate variants: Instance has no main component');
            }
        }
        // Check if source is a component
        if (componentNode.type !== 'COMPONENT') {
            throw new Error('Please select a component to generate variants. Selected node type: ' + componentNode.type);
        }
        const component = componentNode;
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
            }
            else {
                component.description = metadataDescription;
            }
            // Store full metadata in plugin data
            const metadataString = JSON.stringify(metadata, null, 2);
            component.setPluginData('ai-design-copilot-metadata', metadataString);
            metadataUpdated = true;
        }
        catch (error) {
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
                    }
                    catch (instanceError) {
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
                if (numCombinations <= 2)
                    cols = numCombinations;
                else if (numCombinations <= 4)
                    cols = 2;
                else if (numCombinations <= 9)
                    cols = 3;
                else
                    cols = 4;
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
                    }
                    catch (variantError) {
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
        }
        catch (error) {
            console.error('Error creating grid layout:', error);
            // Clean up container if something went wrong
            containerFrame.remove();
            throw error;
        }
        // Send success message
        let message;
        if (totalInstances > 0) {
            message = `✅ Generated ${totalInstances} component instances in organized grid!`;
            if (metadataUpdated) {
                message += ' Component metadata also updated.';
            }
        }
        else {
            message = '⚠️ Could not generate instances (file might be read-only)';
        }
        figma.notify(message, { timeout: 4000 });
        sendMessageToUI('variants-generated', {
            success: totalInstances > 0,
            count: totalInstances,
            message
        });
    }
    catch (error) {
        console.error('Error generating variants:', error);
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        figma.notify(`Failed to generate variants: ${errorMessage}`, { error: true });
        sendMessageToUI('variants-generated', { success: false, error: errorMessage });
    }
}
// Embed metadata in Figma node
async function handleEmbedMetadata(metadata) {
    try {
        // Get the last analyzed node
        let targetNode = globalThis.lastAnalyzedNode;
        if (!targetNode) {
            throw new Error('No component was analyzed. Please analyze a component first.');
        }
        // If it's an instance, get the main component
        if (targetNode.type === 'INSTANCE') {
            const instance = targetNode;
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
            const componentNode = targetNode;
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
            metadataFrame.strokeWeight = 1;
            metadataFrame.cornerRadius = 4;
            // Add text content
            const textNode = figma.createText();
            await figma.loadFontAsync({ family: "Inter", style: "Regular" });
            await figma.loadFontAsync({ family: "Inter", style: "Bold" });
            textNode.fontName = { family: "Inter", style: "Regular" };
            textNode.fontSize = 11;
            textNode.characters = `${metadata.component}\n\n${metadata.description}\n\nStates: ${metadata.states.join(', ')}\nProps: ${metadata.props.join(', ')}`;
            textNode.resize(280, 180);
            textNode.x = 10;
            textNode.y = 10;
            metadataFrame.appendChild(textNode);
            targetNode.parent.appendChild(metadataFrame);
        }
        figma.notify('Metadata embedded successfully!', { timeout: 3000 });
        sendMessageToUI('metadata-embedded', { success: true });
    }
    catch (error) {
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
    }
    catch (error) {
        console.error('Error clearing API key:', error);
        figma.notify('Failed to clear API key', { error: true });
    }
}
// Handle Add State
async function handleAddState(data) {
    try {
        const { state, metadata } = data;
        const lastNode = globalThis.lastAnalyzedNode;
        if (!lastNode) {
            throw new Error('No component selected');
        }
        // Get the component node
        let componentNode = lastNode;
        if (lastNode.type === 'INSTANCE') {
            const instance = lastNode;
            if (instance.mainComponent) {
                componentNode = instance.mainComponent;
            }
        }
        if (componentNode.type !== 'COMPONENT') {
            throw new Error('Please select a component to add states');
        }
        const component = componentNode;
        // Create a new instance for the state
        const stateInstance = component.createInstance();
        stateInstance.name = `${component.name} / ${state}`;

        // Smart positioning: Find existing state instances to avoid overlap
        // This ensures state instances are arranged in a row instead of stacking on top of each other
        const spacing = 24; // Space between instances
        let targetX = (component.x || 0) + (component.width || 100) + spacing;
        const targetY = component.y || 0;

        // Look for existing state instances in the same parent
        const parentNode = component.parent || figma.currentPage;
        if (parentNode && 'children' in parentNode) {
            const existingStateInstances = parentNode.children.filter((child) => {
                // Check if this is a state instance of the same component
                return child.type === 'INSTANCE' &&
                       child.name.startsWith(`${component.name} /`) &&
                       child !== component &&
                       Math.abs((child.y || 0) - targetY) < 10; // Same row (within 10px vertically)
            });

            // Find the rightmost position of existing state instances
            if (existingStateInstances.length > 0) {
                let rightmostX = targetX;
                existingStateInstances.forEach((instance) => {
                    const instanceRight = (instance.x || 0) + (instance.width || 100);
                    rightmostX = Math.max(rightmostX, instanceRight);
                });
                targetX = rightmostX + spacing;
            }
        }

        // Position the new instance
        stateInstance.x = targetX;
        stateInstance.y = targetY;
        // Apply state styling
        applyStateOverrides(stateInstance, state, metadata);
        // Add to parent (or current page if no parent)
        if (component.parent) {
            component.parent.appendChild(stateInstance);
        }
        else {
            figma.currentPage.appendChild(stateInstance);
        }
        // Select and zoom to the new instance
        figma.currentPage.selection = [stateInstance];
        figma.viewport.scrollAndZoomIntoView([stateInstance]);

        // Enhanced notification with positioning context
        const existingCount = parentNode && 'children' in parentNode ?
            parentNode.children.filter((child) =>
                child.type === 'INSTANCE' &&
                child.name.startsWith(`${component.name} /`) &&
                child !== component
            ).length : 0;

        let notificationMsg = `Created ${state} state instance`;
        if (existingCount > 0) {
            notificationMsg += ` (positioned next to ${existingCount} existing state${existingCount > 1 ? 's' : ''})`;
        }

        figma.notify(notificationMsg, { timeout: 3000 });
        sendMessageToUI('state-added', { success: true, state });
    }
    catch (error) {
        console.error('Error adding state:', error);
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        sendMessageToUI('state-added', { success: false, error: errorMessage });
    }
}
// Handle Fix Accessibility
async function handleFixAccessibility(data) {
    try {
        const { issue, metadata } = data;
        const lastNode = globalThis.lastAnalyzedNode;
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
            }
            catch (error) {
                console.error('Error creating note:', error);
                figma.notify('Alt text is added in code, not in Figma', { timeout: 3000 });
            }
        }
        else if (issue.toLowerCase().includes('contrast')) {
            // Improve color contrast by darkening colors
            if ('fills' in lastNode && lastNode.fills && lastNode.fills.length > 0) {
                const fills = [...lastNode.fills];
                let modified = false;
                fills.forEach((fill, index) => {
                    if (fill.type === 'SOLID' && fill.visible !== false) {
                        const solidFill = fill;
                        // Darken the color for better contrast
                        fills[index] = Object.assign(Object.assign({}, solidFill), { color: {
                                r: Math.max(0, solidFill.color.r * 0.7),
                                g: Math.max(0, solidFill.color.g * 0.7),
                                b: Math.max(0, solidFill.color.b * 0.7)
                            } });
                        modified = true;
                    }
                });
                if (modified) {
                    lastNode.fills = fills;
                    figma.notify('Improved color contrast by darkening colors', { timeout: 3000 });
                }
                else {
                    figma.notify('No solid fills to modify for contrast', { timeout: 3000 });
                }
            }
            else {
                figma.notify('Component has no fills to adjust', { timeout: 3000 });
            }
        }
        else if (issue.toLowerCase().includes('focus')) {
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
            }
            else {
                figma.notify('Cannot add stroke to this node type', { timeout: 3000 });
            }
        }
        else {
            figma.notify(`Cannot auto-fix: ${issue}`, { timeout: 3000 });
        }
        sendMessageToUI('accessibility-fixed', { success: true, issue });
    }
    catch (error) {
        console.error('Error fixing accessibility:', error);
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        figma.notify(`Failed to fix: ${errorMessage}`, { error: true });
        sendMessageToUI('accessibility-fixed', { success: false, error: errorMessage });
    }
}
// Handle Fix Naming
async function handleFixNaming(data) {
    try {
        const { layer, newName } = data;
        const lastNode = globalThis.lastAnalyzedNode;
        if (!lastNode) {
            throw new Error('No component selected');
        }
        // Find the layer by name
        function findAndRename(node, targetName, replacement) {
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
        }
        else {
            // Try to find the layer more broadly
            let foundNode = null;
            function findLayer(node) {
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
            }
            else {
                throw new Error(`Layer "${layer}" not found in component`);
            }
        }
    }
    catch (error) {
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
