/**
 * OpenAI Provider Implementation for FigmaLint Plugin
 *
 * Implements the LLMProvider interface for OpenAI's GPT models.
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
 * Available OpenAI models
 */
export const OPENAI_MODELS: LLMModel[] = [
  {
    id: 'gpt-5.2',
    name: 'GPT-5.2',
    description: 'Flagship model with advanced reasoning capabilities',
    contextWindow: 128000,
    isDefault: true,
  },
  {
    id: 'gpt-5.2-pro',
    name: 'GPT-5.2 Pro',
    description: 'Premium model with extended reasoning for complex tasks',
    contextWindow: 128000,
    isDefault: false,
  },
  {
    id: 'gpt-5-mini',
    name: 'GPT-5 Mini',
    description: 'Economy model - fast and cost-effective',
    contextWindow: 128000,
    isDefault: false,
  },
];

/**
 * OpenAI API response structure
 */
interface OpenAIResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    message: {
      role: string;
      content: string;
    };
    finish_reason: string;
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

/**
 * OpenAI error response structure
 */
interface OpenAIErrorResponse {
  error?: {
    message: string;
    type: string;
    param?: string;
    code?: string;
  };
  message?: string;
}

/**
 * OpenAI Provider class implementing the LLMProvider interface
 */
class OpenAIProviderClass implements LLMProvider {
  readonly name = 'OpenAI';
  readonly id = 'openai';
  readonly endpoint = 'https://api.openai.com/v1/chat/completions';
  readonly keyPrefix = 'sk-';
  readonly keyPlaceholder = 'sk-...';
  readonly models = OPENAI_MODELS;

  /**
   * Format a request for OpenAI's chat completions API
   */
  formatRequest(config: RequestConfig): Record<string, unknown> {
    const request: Record<string, unknown> = {
      model: config.model,
      messages: [
        {
          role: 'user',
          content: config.prompt,
        },
      ],
      max_completion_tokens: config.maxTokens,
      temperature: config.temperature,
    };

    // Merge any additional parameters
    if (config.additionalParams) {
      Object.assign(request, config.additionalParams);
    }

    return request;
  }

  /**
   * Parse OpenAI's response into standardized format
   */
  parseResponse(response: unknown): LLMResponse {
    const openaiResponse = response as OpenAIResponse;

    // Validate response structure
    if (!openaiResponse.choices || openaiResponse.choices.length === 0) {
      throw new LLMError(
        'Invalid response format: no choices returned',
        LLMErrorCode.INVALID_REQUEST
      );
    }

    const choice = openaiResponse.choices[0];
    if (!choice.message || typeof choice.message.content !== 'string') {
      throw new LLMError(
        'Invalid response format: missing message content',
        LLMErrorCode.INVALID_REQUEST
      );
    }

    const result: LLMResponse = {
      content: choice.message.content.trim(),
      model: openaiResponse.model,
    };

    // Include usage statistics if available
    if (openaiResponse.usage) {
      result.usage = {
        promptTokens: openaiResponse.usage.prompt_tokens,
        completionTokens: openaiResponse.usage.completion_tokens,
        totalTokens: openaiResponse.usage.total_tokens,
      };
    }

    // Include additional metadata
    result.metadata = {
      id: openaiResponse.id,
      finishReason: choice.finish_reason,
      created: openaiResponse.created,
    };

    return result;
  }

  /**
   * Validate OpenAI API key format
   */
  validateApiKey(apiKey: string): ApiKeyValidationResult {
    if (!apiKey || typeof apiKey !== 'string') {
      return {
        isValid: false,
        error: 'API Key Required: Please provide a valid OpenAI API key.',
      };
    }

    const trimmedKey = apiKey.trim();

    if (trimmedKey.length === 0) {
      return {
        isValid: false,
        error: 'API Key Required: The OpenAI API key cannot be empty.',
      };
    }

    // OpenAI keys start with 'sk-'
    if (!trimmedKey.startsWith(this.keyPrefix)) {
      return {
        isValid: false,
        error: `Invalid API Key Format: OpenAI API keys should start with "${this.keyPrefix}". Please check your API key.`,
      };
    }

    // OpenAI keys are typically 51+ characters
    if (trimmedKey.length < 20) {
      return {
        isValid: false,
        error: 'Invalid API Key Format: The API key appears to be too short. Please verify you copied the complete key.',
      };
    }

    return { isValid: true };
  }

  /**
   * Get headers required for OpenAI API requests
   */
  getHeaders(apiKey: string): RequestHeaders {
    return {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey.trim()}`,
    };
  }

  /**
   * Get the default model for OpenAI
   */
  getDefaultModel(): LLMModel {
    const defaultModel = this.models.find((model) => model.isDefault);
    return defaultModel || this.models[0];
  }

  /**
   * Handle OpenAI-specific error responses
   */
  handleError(statusCode: number, response: unknown): LLMError {
    const errorResponse = response as OpenAIErrorResponse;
    const errorMessage = errorResponse?.error?.message ||
      errorResponse?.message ||
      'Unknown error occurred';

    switch (statusCode) {
      case 400:
        // Bad Request - invalid request format or parameters
        if (errorMessage.toLowerCase().includes('context_length_exceeded') ||
            errorMessage.toLowerCase().includes('maximum context length')) {
          return new LLMError(
            `OpenAI API Error (400): Context length exceeded. ${errorMessage}`,
            LLMErrorCode.CONTEXT_LENGTH_EXCEEDED,
            statusCode
          );
        }
        return new LLMError(
          `OpenAI API Error (400): ${errorMessage}. Please check your request format.`,
          LLMErrorCode.INVALID_REQUEST,
          statusCode
        );

      case 401:
        // Unauthorized - invalid API key
        return new LLMError(
          'OpenAI API Error (401): Invalid API key. Please check your OpenAI API key in settings.',
          LLMErrorCode.INVALID_API_KEY,
          statusCode
        );

      case 403:
        // Forbidden - access denied
        return new LLMError(
          'OpenAI API Error (403): Access forbidden. Please check your API key permissions or account status.',
          LLMErrorCode.INVALID_API_KEY,
          statusCode
        );

      case 404:
        // Not Found - model not found
        return new LLMError(
          `OpenAI API Error (404): Model not found. ${errorMessage}`,
          LLMErrorCode.MODEL_NOT_FOUND,
          statusCode
        );

      case 429:
        // Rate limit exceeded
        // Try to extract retry-after information from the error message
        const retryMatch = errorMessage.match(/try again in (\d+)/i);
        const retryAfter = retryMatch ? parseInt(retryMatch[1], 10) : undefined;

        return new LLMError(
          `OpenAI API Error (429): Rate limit exceeded. ${retryAfter ? `Please try again in ${retryAfter} seconds.` : 'Please try again later.'}`,
          LLMErrorCode.RATE_LIMIT_EXCEEDED,
          statusCode,
          retryAfter
        );

      case 500:
        // Internal Server Error
        return new LLMError(
          'OpenAI API Error (500): Server error. The OpenAI API is experiencing issues. Please try again later.',
          LLMErrorCode.SERVER_ERROR,
          statusCode
        );

      case 502:
        // Bad Gateway
        return new LLMError(
          'OpenAI API Error (502): Bad gateway. The OpenAI API is temporarily unavailable. Please try again later.',
          LLMErrorCode.SERVICE_UNAVAILABLE,
          statusCode
        );

      case 503:
        // Service Unavailable
        return new LLMError(
          'OpenAI API Error (503): Service unavailable. The OpenAI API is temporarily down. Please try again later.',
          LLMErrorCode.SERVICE_UNAVAILABLE,
          statusCode
        );

      case 504:
        // Gateway Timeout
        return new LLMError(
          'OpenAI API Error (504): Gateway timeout. The request took too long. Please try again.',
          LLMErrorCode.SERVICE_UNAVAILABLE,
          statusCode
        );

      default:
        return new LLMError(
          `OpenAI API Error (${statusCode}): ${errorMessage}`,
          LLMErrorCode.UNKNOWN_ERROR,
          statusCode
        );
    }
  }
}

/**
 * Singleton instance of the OpenAI provider
 */
export const OpenAIProvider: LLMProvider = new OpenAIProviderClass();

/**
 * Export the class for testing purposes
 */
export { OpenAIProviderClass };
