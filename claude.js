"use strict";
// Claude API Helper for AI Design Co-Pilot Figma Plugin
// Handles communication with the Claude 3 API from Anthropic
Object.defineProperty(exports, "__esModule", { value: true });
exports.fetchClaude = fetchClaude;
exports.createDesignAnalysisPrompt = createDesignAnalysisPrompt;
exports.isValidApiKeyFormat = isValidApiKeyFormat;
// Claude API configuration
const CLAUDE_API_URL = 'https://api.anthropic.com/v1/messages';
const CLAUDE_MODEL = 'claude-3-opus-20240229';
/**
 * Send a prompt to Claude API and get a response
 * @param prompt - The prompt to send to Claude
 * @param apiKey - The user's Claude API key
 * @returns Promise<string> - The completion text from Claude
 */
async function fetchClaude(prompt, apiKey) {
    // Validate input parameters
    if (!prompt || prompt.trim().length === 0) {
        throw new Error('Prompt cannot be empty');
    }
    if (!apiKey || apiKey.trim().length === 0) {
        throw new Error('API key is required');
    }
    // Prepare the request payload
    const requestBody = {
        model: CLAUDE_MODEL,
        messages: [
            {
                role: 'user',
                content: prompt.trim()
            }
        ],
        max_tokens: 300
    };
    // Prepare request headers
    const headers = {
        'x-api-key': apiKey.trim(),
        'content-type': 'application/json',
        'anthropic-version': '2023-06-01'
    };
    try {
        // Log the request for debugging (without API key)
        console.log('Sending request to Claude API:', {
            model: requestBody.model,
            promptLength: prompt.length,
            maxTokens: requestBody.max_tokens
        });
        // Make the API request
        const response = await fetch(CLAUDE_API_URL, {
            method: 'POST',
            headers: headers,
            body: JSON.stringify(requestBody)
        });
        // Check if the request was successful
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Claude API request failed: ${response.status} ${response.statusText} - ${errorText}`);
        }
        // Parse the response
        const data = await response.json();
        // Validate the response structure
        if (!data.content || !data.content[0] || !data.content[0].text) {
            throw new Error('Invalid response from Claude API: missing content');
        }
        // Log successful response for debugging
        console.log('Claude API response received:', {
            contentLength: data.content[0].text.length,
            stopReason: data.stop_reason,
            model: data.model
        });
        // Return the completion text
        return data.content[0].text.trim();
    }
    catch (error) {
        // Enhanced error handling with specific error types
        if (error instanceof TypeError && error.message.includes('fetch')) {
            throw new Error('Network error: Unable to connect to Claude API. Please check your internet connection.');
        }
        if (error instanceof Error) {
            // Re-throw with enhanced context
            throw new Error(`Claude API Error: ${error.message}`);
        }
        // Fallback for unknown errors
        throw new Error('An unknown error occurred while calling Claude API');
    }
}
/**
 * Create a design analysis prompt for Figma components
 * @param componentName - Name of the Figma component
 * @param componentStructure - JSON structure of the component
 * @returns string - Formatted prompt for Claude
 */
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
/**
 * Validate if an API key looks like a valid Claude API key
 * @param apiKey - The API key to validate
 * @returns boolean - Whether the key appears valid
 */
function isValidApiKeyFormat(apiKey) {
    // Basic validation - Claude API keys typically start with 'sk-' and have a certain length
    // This is a simple check and doesn't guarantee the key is valid, just properly formatted
    const trimmedKey = apiKey.trim();
    return trimmedKey.length > 20 && trimmedKey.startsWith('sk-');
}
