/**
 * OpenRouter Provider Implementation for FigmaLint Plugin
 *
 * OpenRouter is an OpenAI-compatible gateway: same `/chat/completions` shape, same
 * `Authorization: Bearer` auth, same response envelope. Request and response
 * shaping therefore delegate to the OpenAI provider rather than being duplicated —
 * only the endpoint, credentials, and model namespace differ.
 *
 * It is a separate provider rather than an OpenAI endpoint override because what
 * it routes to is not OpenAI: a slug like `anthropic/claude-opus-5` runs Claude.
 * Surfacing it under "OpenAI (GPT)" hid it from the people most likely to want it
 * — teams whose org can't issue a direct Anthropic or OpenAI key.
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
  OPENROUTER_MODELS,
} from './types';
import { OpenAIProvider as openaiProvider } from './openai';

/**
 * Attribution headers. OpenRouter uses these to label the request in the user's
 * activity log; neither affects routing or auth, and neither carries user or
 * document data.
 */
const ATTRIBUTION_HEADERS = {
  'HTTP-Referer': 'https://www.figma.com/community/plugin/1521241390290871981',
  'X-Title': 'FigmaLint',
};

/**
 * OpenRouter provider class implementing the LLMProvider interface
 */
class OpenRouterProviderClass implements LLMProvider {
  readonly name = 'OpenRouter';
  readonly id = 'openrouter';
  readonly endpoint = 'https://openrouter.ai/api/v1/chat/completions';
  readonly keyPrefix = 'sk-or-';
  readonly keyPlaceholder = 'sk-or-v1-...';
  readonly models = OPENROUTER_MODELS;

  /**
   * Identical wire format to OpenAI — delegate rather than duplicate.
   */
  formatRequest(config: RequestConfig): Record<string, unknown> {
    return openaiProvider.formatRequest(config);
  }

  /**
   * Identical response envelope to OpenAI — delegate rather than duplicate.
   */
  parseResponse(response: unknown): LLMResponse {
    return openaiProvider.parseResponse(response);
  }

  /**
   * Validate API key format for OpenRouter
   */
  validateApiKey(apiKey: string): ApiKeyValidationResult {
    if (!apiKey || typeof apiKey !== 'string') {
      return {
        isValid: false,
        error: 'API Key Required: Please provide a valid OpenRouter API key.',
      };
    }

    const trimmedKey = apiKey.trim();

    if (trimmedKey.length === 0) {
      return {
        isValid: false,
        error: 'API Key Required: The OpenRouter API key cannot be empty.',
      };
    }

    if (!trimmedKey.startsWith(this.keyPrefix)) {
      return {
        isValid: false,
        error: `Invalid API Key Format: OpenRouter API keys start with "${this.keyPrefix}". Create one at openrouter.ai/keys.`,
      };
    }

    if (trimmedKey.length < 20) {
      return {
        isValid: false,
        error:
          'Invalid API Key Format: The API key appears to be too short. Please verify you copied the complete key.',
      };
    }

    return { isValid: true };
  }

  /**
   * Get HTTP headers for OpenRouter requests
   */
  getHeaders(apiKey: string): RequestHeaders {
    return {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey.trim()}`,
      ...ATTRIBUTION_HEADERS,
    };
  }

  /**
   * Get the default model for OpenRouter
   */
  getDefaultModel(): LLMModel {
    const defaultModel = this.models.find((model) => model.isDefault);
    return defaultModel || this.models[0];
  }

  /**
   * Handle OpenRouter-specific error responses.
   *
   * OpenRouter returns OpenAI-shaped errors, but the causes differ enough to be
   * worth naming: a 404 is almost always a bad model slug rather than a bad
   * endpoint, and a 402 (which OpenAI does not use) means the account is out of
   * credits.
   */
  handleError(statusCode: number, response: unknown): LLMError {
    const errorResponse = response as { error?: { message?: string } } | null;
    const errorMessage =
      errorResponse?.error?.message ||
      (typeof response === 'string' ? response : 'Unknown error');

    switch (statusCode) {
      case 401:
        return new LLMError(
          `OpenRouter API Error (401): ${errorMessage} Check your OpenRouter API key in settings — it should start with "sk-or-" and be active at openrouter.ai/keys.`,
          LLMErrorCode.INVALID_API_KEY,
          401
        );

      case 402:
        return new LLMError(
          `OpenRouter API Error (402): ${errorMessage} Your OpenRouter account is out of credits — add credits at openrouter.ai/credits.`,
          LLMErrorCode.INVALID_REQUEST,
          402
        );

      case 404:
        return new LLMError(
          `OpenRouter API Error (404): ${errorMessage} The model slug was not recognized — check it against openrouter.ai/models (slugs look like "anthropic/claude-sonnet-5").`,
          LLMErrorCode.MODEL_NOT_FOUND,
          404
        );

      default:
        // Everything else maps cleanly onto OpenAI's handling.
        return openaiProvider.handleError(statusCode, response);
    }
  }
}

/**
 * Singleton instance of the OpenRouter provider
 */
export const openrouterProvider = new OpenRouterProviderClass();

export default openrouterProvider;
