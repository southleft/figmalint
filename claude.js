"use strict";
// Claude API Helper for AI Design Co-Pilot Figma Plugin
// Handles communication with the Claude 3 API from Anthropic
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
    return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.fetchClaude = fetchClaude;
exports.createDesignAnalysisPrompt = createDesignAnalysisPrompt;
exports.isValidApiKeyFormat = isValidApiKeyFormat;
// Claude API configuration
var CLAUDE_API_URL = 'https://api.anthropic.com/v1/messages';
var CLAUDE_MODEL = 'claude-3-opus-20240229';
/**
 * Send a prompt to Claude API and get a response
 * @param prompt - The prompt to send to Claude
 * @param apiKey - The user's Claude API key
 * @returns Promise<string> - The completion text from Claude
 */
function fetchClaude(prompt, apiKey) {
    return __awaiter(this, void 0, void 0, function () {
        var requestBody, headers, response, errorText, data, error_1;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    // Validate input parameters
                    if (!prompt || prompt.trim().length === 0) {
                        throw new Error('Prompt cannot be empty');
                    }
                    if (!apiKey || apiKey.trim().length === 0) {
                        throw new Error('API key is required');
                    }
                    requestBody = {
                        model: CLAUDE_MODEL,
                        messages: [
                            {
                                role: 'user',
                                content: prompt.trim()
                            }
                        ],
                        max_tokens: 300
                    };
                    headers = {
                        'x-api-key': apiKey.trim(),
                        'content-type': 'application/json',
                        'anthropic-version': '2023-06-01'
                    };
                    _a.label = 1;
                case 1:
                    _a.trys.push([1, 6, , 7]);
                    // Log the request for debugging (without API key)
                    console.log('Sending request to Claude API:', {
                        model: requestBody.model,
                        promptLength: prompt.length,
                        maxTokens: requestBody.max_tokens
                    });
                    return [4 /*yield*/, fetch(CLAUDE_API_URL, {
                            method: 'POST',
                            headers: headers,
                            body: JSON.stringify(requestBody)
                        })];
                case 2:
                    response = _a.sent();
                    if (!!response.ok) return [3 /*break*/, 4];
                    return [4 /*yield*/, response.text()];
                case 3:
                    errorText = _a.sent();
                    throw new Error("Claude API request failed: ".concat(response.status, " ").concat(response.statusText, " - ").concat(errorText));
                case 4: return [4 /*yield*/, response.json()];
                case 5:
                    data = _a.sent();
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
                    return [2 /*return*/, data.content[0].text.trim()];
                case 6:
                    error_1 = _a.sent();
                    // Enhanced error handling with specific error types
                    if (error_1 instanceof TypeError && error_1.message.includes('fetch')) {
                        throw new Error('Network error: Unable to connect to Claude API. Please check your internet connection.');
                    }
                    if (error_1 instanceof Error) {
                        // Re-throw with enhanced context
                        throw new Error("Claude API Error: ".concat(error_1.message));
                    }
                    // Fallback for unknown errors
                    throw new Error('An unknown error occurred while calling Claude API');
                case 7: return [2 /*return*/];
            }
        });
    });
}
/**
 * Create a design analysis prompt for Figma components
 * @param componentName - Name of the Figma component
 * @param componentStructure - JSON structure of the component
 * @returns string - Formatted prompt for Claude
 */
function createDesignAnalysisPrompt(componentName, componentStructure) {
    return "\nAnalyze this Figma component and provide design insights:\n\nComponent Name: ".concat(componentName, "\nComponent Structure: ").concat(JSON.stringify(componentStructure, null, 2), "\n\nPlease provide:\n1. A brief description of the component's purpose and design\n2. Suggestions for potential variants (different states, sizes, or styles)\n3. Accessibility considerations\n4. Best practices for using this component\n\nKeep the response concise and actionable for a designer.\n  ").trim();
}
/**
 * Validate if an API key looks like a valid Claude API key
 * @param apiKey - The API key to validate
 * @returns boolean - Whether the key appears valid
 */
function isValidApiKeyFormat(apiKey) {
    // Basic validation - Claude API keys typically start with 'sk-' and have a certain length
    // This is a simple check and doesn't guarantee the key is valid, just properly formatted
    var trimmedKey = apiKey.trim();
    return trimmedKey.length > 20 && trimmedKey.startsWith('sk-');
}
