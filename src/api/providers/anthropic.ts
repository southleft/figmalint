/**
 * Anthropic (Claude) Provider Implementation
 *
 * Implements the LLMProvider interface for Anthropic's Claude API.
 * Supports Claude Opus 5, Sonnet 5, and Haiku 4.5 models.
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
 * Minimum `max_tokens` for Anthropic requests. Current Claude models think by
 * default and charge that thinking against the same output budget as the reply,
 * so the caller's budget is treated as a floor for the visible answer rather than
 * a ceiling on the whole response. Well under every model's output cap (64K on
 * Haiku 4.5, 128K on Opus 5 / Sonnet 5).
 */
const MIN_THINKING_HEADROOM_TOKENS = 8192;

/**
 * Available Anthropic Claude models
 */
export const ANTHROPIC_MODELS: LLMModel[] = [
  {
    id: 'claude-opus-5',
    name: 'Claude Opus 5',
    description: 'Flagship model - Most intelligent, best for complex agents and coding',
    contextWindow: 1000000,
    isDefault: false,
  },
  {
    id: 'claude-sonnet-5',
    name: 'Claude Sonnet 5',
    description: 'Standard model - Best combination of speed and intelligence, recommended for most tasks',
    contextWindow: 1000000,
    isDefault: true,
  },
  {
    id: 'claude-haiku-4-5',
    name: 'Claude Haiku 4.5',
    description: 'Economy model - Fastest with near-frontier intelligence',
    contextWindow: 200000,
    isDefault: false,
  },
];

/**
 * Anthropic API response structure
 */
interface AnthropicAPIResponse {
  id: string;
  type: string;
  role: string;
  content: Array<{
    type: string;
    text: string;
  }>;
  model: string;
  stop_reason: string;
  stop_sequence: string | null;
  usage: {
    input_tokens: number;
    output_tokens: number;
  };
}

/**
 * Anthropic API error response structure
 */
interface AnthropicErrorResponse {
  type: string;
  error: {
    type: string;
    message: string;
  };
}

/**
 * Anthropic (Claude) LLM Provider
 *
 * Provides integration with Anthropic's Claude API for design analysis,
 * component metadata generation, and chat functionality.
 */
export class AnthropicProvider implements LLMProvider {
  readonly name = 'Anthropic';
  readonly id = 'anthropic';
  readonly endpoint = 'https://api.anthropic.com/v1/messages';
  readonly keyPrefix = 'sk-ant-';
  readonly keyPlaceholder = 'sk-ant-...';
  readonly models: LLMModel[] = ANTHROPIC_MODELS;

  /**
   * Format a request for the Anthropic API
   */
  formatRequest(config: RequestConfig): Record<string, unknown> {
    const request: Record<string, unknown> = {
      model: config.model,
      messages: [
        {
          role: 'user',
          content: config.prompt.trim(),
        },
      ],
      // Claude Opus 5 and Sonnet 5 run adaptive thinking by default, and `max_tokens`
      // caps thinking *plus* the response text. A budget sized around the JSON alone
      // truncates mid-answer once thinking takes a share of it, which surfaces as a
      // parse failure rather than an API error. Floor the budget so both fit; models
      // only bill what they actually emit, so this costs nothing on short responses.
      max_tokens: Math.max(config.maxTokens, MIN_THINKING_HEADROOM_TOKENS),
    };

    // `config.temperature` is intentionally dropped for Anthropic. Newer Claude 4.x
    // models reject `temperature` with HTTP 400 ("temperature is deprecated for this
    // model"). Determinism is enforced upstream via deterministic prompts and JSON
    // extraction, so omitting temperature is safe for both analyze and chat paths.

    // Add additional provider-specific parameters
    if (config.additionalParams) {
      Object.assign(request, config.additionalParams);
    }

    return request;
  }

  /**
   * Parse Anthropic API response into standardized format
   */
  parseResponse(response: unknown): LLMResponse {
    const anthropicResponse = response as AnthropicAPIResponse;

    // Validate response structure
    if (!anthropicResponse.content || !Array.isArray(anthropicResponse.content)) {
      throw new LLMError(
        'Invalid response format from Anthropic API: missing content array',
        LLMErrorCode.INVALID_REQUEST
      );
    }

    // Extract text from content blocks
    const textContent = anthropicResponse.content
      .filter((block) => block.type === 'text')
      .map((block) => block.text)
      .join('\n');

    if (!textContent) {
      throw new LLMError(
        'Invalid response format from Anthropic API: no text content found',
        LLMErrorCode.INVALID_REQUEST
      );
    }

    return {
      content: textContent.trim(),
      model: anthropicResponse.model,
      usage: anthropicResponse.usage
        ? {
            promptTokens: anthropicResponse.usage.input_tokens,
            completionTokens: anthropicResponse.usage.output_tokens,
            totalTokens:
              anthropicResponse.usage.input_tokens +
              anthropicResponse.usage.output_tokens,
          }
        : undefined,
      metadata: {
        id: anthropicResponse.id,
        stopReason: anthropicResponse.stop_reason,
      },
    };
  }

  /**
   * Validate API key format for Anthropic
   */
  validateApiKey(apiKey: string): ApiKeyValidationResult {
    if (!apiKey || typeof apiKey !== 'string') {
      return {
        isValid: false,
        error: 'API Key Required: Please provide a valid Claude API key.',
      };
    }

    const trimmedKey = apiKey.trim();

    if (trimmedKey.length === 0) {
      return {
        isValid: false,
        error: 'API Key Required: The Claude API key cannot be empty.',
      };
    }

    if (!trimmedKey.startsWith(this.keyPrefix)) {
      return {
        isValid: false,
        error: `Invalid API Key Format: Claude API keys should start with "${this.keyPrefix}". Please check your API key.`,
      };
    }

    // Anthropic Admin API keys (sk-ant-admin...) manage an organization and are
    // rejected by the model API (/v1/messages). Org admins often generate these
    // by mistake when asked for "an API key" — catch it here with a clear
    // explanation instead of a generic 401 at analyze time.
    if (trimmedKey.startsWith('sk-ant-admin')) {
      return {
        isValid: false,
        error:
          'This is an Anthropic Admin API key (sk-ant-admin...), which manages your organization but cannot call Claude models. ' +
          'Ask your admin to create a standard API key instead (Console → API Keys → Create Key), which starts with "sk-ant-api...".',
      };
    }

    // Anthropic API keys are typically longer than 40 characters
    if (trimmedKey.length < 40) {
      return {
        isValid: false,
        error:
          'Invalid API Key Format: The API key appears to be too short. Please verify you copied the complete key.',
      };
    }

    return { isValid: true };
  }

  /**
   * Get HTTP headers for Anthropic API requests
   */
  getHeaders(apiKey: string): RequestHeaders {
    return {
      'content-type': 'application/json',
      'x-api-key': apiKey.trim(),
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    };
  }

  /**
   * Get the default model for Anthropic
   */
  getDefaultModel(): LLMModel {
    const defaultModel = this.models.find((model) => model.isDefault);
    return defaultModel || this.models[1]; // Sonnet is the default
  }

  /**
   * Handle Anthropic-specific error responses
   */
  handleError(statusCode: number, response: unknown): LLMError {
    const errorResponse = response as AnthropicErrorResponse | null;
    const errorMessage =
      errorResponse?.error?.message ||
      (typeof response === 'string' ? response : 'Unknown error');

    switch (statusCode) {
      case 400:
        // Billing errors surface as 400s ("credit balance is too low") — say so
        // instead of the misleading "check your request format".
        if (errorMessage.toLowerCase().includes('credit balance')) {
          return new LLMError(
            `Claude API Error (400): ${errorMessage} Add credits to the account that issued this key at platform.claude.com — API usage is billed separately from Claude subscriptions.`,
            LLMErrorCode.INVALID_REQUEST,
            400
          );
        }
        return new LLMError(
          `Claude API Error (400): ${errorMessage}. Please check your request format.`,
          LLMErrorCode.INVALID_REQUEST,
          400
        );

      case 401:
        // Include Anthropic's actual message — for org-issued keys it explains
        // exactly what's wrong (revoked, wrong key type, workspace restrictions),
        // which a generic "invalid key" hides.
        return new LLMError(
          `Claude API Error (401): ${errorMessage} Check your Claude API key in settings — it must be a standard API key (sk-ant-api...), not an Admin key, and must be active in your organization's Console.`,
          LLMErrorCode.INVALID_API_KEY,
          401
        );

      case 403:
        return new LLMError(
          `Claude API Error (403): ${errorMessage} Your key was recognized but lacks permission — common causes: the organization restricts which models or workspaces this key can use, or the key's workspace has a spend limit of $0. Ask your admin to check the key's permissions in the Anthropic Console.`,
          LLMErrorCode.INVALID_API_KEY,
          403
        );

      case 404:
        return new LLMError(
          `Claude API Error (404): ${errorMessage}. The requested model may not be available.`,
          LLMErrorCode.MODEL_NOT_FOUND,
          404
        );

      case 429:
        return new LLMError(
          'Claude API Error (429): Rate limit exceeded. Please try again later.',
          LLMErrorCode.RATE_LIMIT_EXCEEDED,
          429
        );

      case 500:
        return new LLMError(
          'Claude API Error (500): Server error. The Claude API is experiencing issues. Please try again later.',
          LLMErrorCode.SERVER_ERROR,
          500
        );

      case 503:
        return new LLMError(
          'Claude API Error (503): Service unavailable. The Claude API is temporarily down. Please try again later.',
          LLMErrorCode.SERVICE_UNAVAILABLE,
          503
        );

      default:
        return new LLMError(
          `Claude API Error (${statusCode}): ${errorMessage}`,
          LLMErrorCode.UNKNOWN_ERROR,
          statusCode
        );
    }
  }
}

/**
 * Singleton instance of the Anthropic provider
 */
export const anthropicProvider = new AnthropicProvider();

/**
 * Export default for convenience
 */
export default anthropicProvider;
