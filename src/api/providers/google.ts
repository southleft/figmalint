/**
 * Google (Gemini) LLM Provider Implementation
 *
 * Implements the LLMProvider interface for Google's Generative AI (Gemini) API.
 * Supports Gemini 3 Pro, Gemini 2.5 Pro, and Gemini 2.5 Flash models.
 *
 * Note: Google uses URL-based authentication rather than header-based.
 * The API key is appended to the URL as a query parameter.
 */

import {
  LLMProvider,
  LLMModel,
  RequestConfig,
  LLMResponse,
  ApiKeyValidationResult,
  RequestHeaders,
  LLMError,
  LLMErrorCode,
} from './types';

/**
 * Available Google Gemini models
 */
export const GOOGLE_MODELS: LLMModel[] = [
  {
    id: 'gemini-3-pro-preview',
    name: 'Gemini 3 Pro',
    description: 'Flagship model with advanced reasoning and multimodal capabilities',
    contextWindow: 1000000,
    isDefault: true,
  },
  {
    id: 'gemini-2.5-pro',
    name: 'Gemini 2.5 Pro',
    description: 'Standard reasoning model with excellent performance',
    contextWindow: 1000000,
    isDefault: false,
  },
  {
    id: 'gemini-2.5-flash',
    name: 'Gemini 2.5 Flash',
    description: 'Economy model optimized for speed and efficiency',
    contextWindow: 1000000,
    isDefault: false,
  },
];

/**
 * Google Gemini API response structure
 */
interface GeminiResponse {
  candidates?: Array<{
    content?: {
      parts?: Array<{
        text?: string;
      }>;
    };
    finishReason?: string;
    safetyRatings?: Array<{
      category: string;
      probability: string;
    }>;
  }>;
  usageMetadata?: {
    promptTokenCount?: number;
    candidatesTokenCount?: number;
    totalTokenCount?: number;
  };
  error?: {
    code?: number;
    message?: string;
    status?: string;
    details?: Array<{
      '@type'?: string;
      reason?: string;
      domain?: string;
    }>;
  };
}

/**
 * Google Gemini API error response structure
 */
interface GeminiErrorResponse {
  error?: {
    code?: number;
    message?: string;
    status?: string;
    details?: Array<{
      '@type'?: string;
      reason?: string;
      domain?: string;
      metadata?: Record<string, string>;
    }>;
  };
}

/**
 * Google (Gemini) Provider Implementation
 *
 * Implements the LLMProvider interface for Google's Generative Language API.
 * Uses the v1beta API endpoint for access to latest Gemini models.
 */
class GoogleProvider implements LLMProvider {
  readonly name = 'Google';
  readonly id = 'google';
  readonly endpoint = 'https://generativelanguage.googleapis.com/v1beta/models';
  readonly keyPrefix = 'AIza';
  readonly keyPlaceholder = 'AIza...';
  readonly models = GOOGLE_MODELS;

  /**
   * Format a request for the Gemini API
   *
   * Gemini uses a different request structure than OpenAI/Anthropic:
   * - contents: Array of content objects with parts
   * - generationConfig: Configuration for the generation
   *
   * @param config - Request configuration
   * @returns Formatted request body for Gemini API
   */
  formatRequest(config: RequestConfig): Record<string, unknown> {
    const request: Record<string, unknown> = {
      contents: [
        {
          parts: [
            {
              text: config.prompt,
            },
          ],
        },
      ],
      generationConfig: {
        maxOutputTokens: config.maxTokens,
        temperature: config.temperature,
      },
    };

    // Add any additional parameters if provided
    if (config.additionalParams) {
      const { topP, topK, stopSequences } = config.additionalParams as {
        topP?: number;
        topK?: number;
        stopSequences?: string[];
      };

      if (topP !== undefined) {
        (request.generationConfig as Record<string, unknown>).topP = topP;
      }
      if (topK !== undefined) {
        (request.generationConfig as Record<string, unknown>).topK = topK;
      }
      if (stopSequences !== undefined) {
        (request.generationConfig as Record<string, unknown>).stopSequences = stopSequences;
      }
    }

    return request;
  }

  /**
   * Parse Gemini API response into standardized format
   *
   * Gemini response structure:
   * {
   *   candidates: [{
   *     content: {
   *       parts: [{ text: "..." }]
   *     }
   *   }],
   *   usageMetadata: { ... }
   * }
   *
   * @param response - Raw API response
   * @returns Standardized LLM response
   * @throws Error if response format is invalid
   */
  parseResponse(response: unknown): LLMResponse {
    const geminiResponse = response as GeminiResponse;

    // Check for API error in response
    if (geminiResponse.error) {
      throw new LLMError(
        geminiResponse.error.message || 'Unknown Gemini API error',
        this.mapErrorCodeToLLMErrorCode(geminiResponse.error.code, geminiResponse.error.status),
        geminiResponse.error.code
      );
    }

    // Validate response structure
    if (!geminiResponse.candidates || geminiResponse.candidates.length === 0) {
      throw new LLMError(
        'No candidates returned in Gemini response',
        LLMErrorCode.INVALID_REQUEST
      );
    }

    const candidate = geminiResponse.candidates[0];

    // Check for blocked content
    if (candidate.finishReason === 'SAFETY') {
      throw new LLMError(
        'Response blocked due to safety filters',
        LLMErrorCode.INVALID_REQUEST
      );
    }

    // Extract text from response
    const parts = candidate.content?.parts;
    if (!parts || parts.length === 0 || !parts[0].text) {
      throw new LLMError(
        'No text content in Gemini response',
        LLMErrorCode.INVALID_REQUEST
      );
    }

    const text = parts[0].text;

    // Build standardized response
    const llmResponse: LLMResponse = {
      content: text,
      model: 'gemini', // Model info not always returned in response
    };

    // Add usage metadata if available
    if (geminiResponse.usageMetadata) {
      llmResponse.usage = {
        promptTokens: geminiResponse.usageMetadata.promptTokenCount || 0,
        completionTokens: geminiResponse.usageMetadata.candidatesTokenCount || 0,
        totalTokens: geminiResponse.usageMetadata.totalTokenCount || 0,
      };
    }

    return llmResponse;
  }

  /**
   * Validate Google API key format
   *
   * Google API keys:
   * - Start with 'AIza'
   * - Are typically 39 characters long
   * - Contain alphanumeric characters and underscores
   *
   * @param apiKey - The API key to validate
   * @returns Validation result
   */
  validateApiKey(apiKey: string): ApiKeyValidationResult {
    if (!apiKey || typeof apiKey !== 'string') {
      return {
        isValid: false,
        error: 'API key is required',
      };
    }

    const trimmedKey = apiKey.trim();

    if (trimmedKey.length === 0) {
      return {
        isValid: false,
        error: 'API key cannot be empty',
      };
    }

    if (!trimmedKey.startsWith(this.keyPrefix)) {
      return {
        isValid: false,
        error: `Google API keys should start with "${this.keyPrefix}". Please check your API key.`,
      };
    }

    // Google API keys are typically 39 characters
    if (trimmedKey.length < 30 || trimmedKey.length > 50) {
      return {
        isValid: false,
        error: 'API key appears to have an invalid length. Please verify you copied the complete key.',
      };
    }

    // Check for valid characters (alphanumeric, underscore, hyphen)
    if (!/^[A-Za-z0-9_-]+$/.test(trimmedKey)) {
      return {
        isValid: false,
        error: 'API key contains invalid characters',
      };
    }

    return { isValid: true };
  }

  /**
   * Get headers for API requests
   *
   * Note: Google uses URL-based authentication, so the API key is not
   * included in headers. It is appended to the URL instead.
   *
   * @param _apiKey - The API key (not used in headers for Google)
   * @returns Request headers
   */
  getHeaders(_apiKey: string): RequestHeaders {
    return {
      'Content-Type': 'application/json',
    };
  }

  /**
   * Get the full endpoint URL for a specific model and API key
   *
   * Google's API uses URL-based authentication:
   * https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={API_KEY}
   *
   * @param model - The model ID to use
   * @param apiKey - The API key for authentication
   * @returns Full endpoint URL with API key
   */
  getEndpoint(model: string, apiKey: string): string {
    const trimmedKey = apiKey.trim();
    return `${this.endpoint}/${model}:generateContent?key=${trimmedKey}`;
  }

  /**
   * Get the default model for this provider
   *
   * @returns The default Gemini model
   */
  getDefaultModel(): LLMModel {
    const defaultModel = this.models.find((m) => m.isDefault);
    return defaultModel || this.models[0];
  }

  /**
   * Handle provider-specific error responses
   *
   * @param statusCode - HTTP status code
   * @param response - Error response body
   * @returns Formatted LLMError
   */
  handleError(statusCode: number, response: unknown): LLMError {
    const errorResponse = response as GeminiErrorResponse;
    const errorInfo = errorResponse?.error;

    // Extract error details
    const message = errorInfo?.message || 'Unknown Google API error';
    const status = errorInfo?.status;
    const code = errorInfo?.code || statusCode;

    // Map to appropriate error code
    const llmErrorCode = this.mapErrorCodeToLLMErrorCode(code, status);

    // Check for retry-after information
    let retryAfter: number | undefined;
    if (statusCode === 429) {
      // Default retry after 60 seconds for rate limits
      retryAfter = 60000;

      // Try to extract retry information from error details
      const retryDetail = errorInfo?.details?.find(
        (d) => d['@type']?.includes('RetryInfo')
      );
      if (retryDetail?.metadata?.retryDelay) {
        // Parse retry delay (format: "Xs" where X is seconds)
        const delayMatch = retryDetail.metadata.retryDelay.match(/(\d+)s/);
        if (delayMatch) {
          retryAfter = parseInt(delayMatch[1], 10) * 1000;
        }
      }
    }

    // Create user-friendly error messages
    let userMessage = message;
    switch (llmErrorCode) {
      case LLMErrorCode.INVALID_API_KEY:
        userMessage = 'Google API Error: Invalid API key. Please check your API key in settings.';
        break;
      case LLMErrorCode.RATE_LIMIT_EXCEEDED:
        userMessage = `Google API Error: Rate limit exceeded. ${retryAfter ? `Please try again in ${Math.ceil(retryAfter / 1000)} seconds.` : 'Please try again later.'}`;
        break;
      case LLMErrorCode.MODEL_NOT_FOUND:
        userMessage = 'Google API Error: Model not found. Please select a valid model.';
        break;
      case LLMErrorCode.CONTEXT_LENGTH_EXCEEDED:
        userMessage = 'Google API Error: Input too long. Please reduce the size of your request.';
        break;
      case LLMErrorCode.SERVER_ERROR:
        userMessage = 'Google API Error: Server error. Please try again later.';
        break;
      case LLMErrorCode.SERVICE_UNAVAILABLE:
        userMessage = 'Google API Error: Service temporarily unavailable. Please try again later.';
        break;
    }

    return new LLMError(userMessage, llmErrorCode, statusCode, retryAfter);
  }

  /**
   * Map Google error codes/status to LLMErrorCode
   *
   * @param code - HTTP status code or Google error code
   * @param status - Google error status string
   * @returns Appropriate LLMErrorCode
   */
  private mapErrorCodeToLLMErrorCode(
    code?: number,
    status?: string
  ): LLMErrorCode {
    // Check status string first
    if (status) {
      const statusUpper = status.toUpperCase();
      if (statusUpper === 'INVALID_ARGUMENT') {
        return LLMErrorCode.INVALID_REQUEST;
      }
      if (statusUpper === 'PERMISSION_DENIED' || statusUpper === 'UNAUTHENTICATED') {
        return LLMErrorCode.INVALID_API_KEY;
      }
      if (statusUpper === 'NOT_FOUND') {
        return LLMErrorCode.MODEL_NOT_FOUND;
      }
      if (statusUpper === 'RESOURCE_EXHAUSTED') {
        return LLMErrorCode.RATE_LIMIT_EXCEEDED;
      }
      if (statusUpper === 'UNAVAILABLE') {
        return LLMErrorCode.SERVICE_UNAVAILABLE;
      }
    }

    // Fall back to HTTP status codes
    switch (code) {
      case 400:
        return LLMErrorCode.INVALID_REQUEST;
      case 401:
      case 403:
        return LLMErrorCode.INVALID_API_KEY;
      case 404:
        return LLMErrorCode.MODEL_NOT_FOUND;
      case 429:
        return LLMErrorCode.RATE_LIMIT_EXCEEDED;
      case 500:
        return LLMErrorCode.SERVER_ERROR;
      case 503:
        return LLMErrorCode.SERVICE_UNAVAILABLE;
      default:
        return LLMErrorCode.UNKNOWN_ERROR;
    }
  }
}

/**
 * Singleton instance of the Google provider
 */
export const googleProvider = new GoogleProvider();

/**
 * Export the provider class for testing or custom instantiation
 */
export { GoogleProvider };
