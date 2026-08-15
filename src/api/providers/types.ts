/**
 * Multi-Provider LLM Abstraction Layer - Type Definitions
 *
 * This module defines the type system for supporting multiple LLM providers
 * (Anthropic/Claude, OpenAI, Google/Gemini) with a unified interface.
 *
 * @module providers/types
 */

// =============================================================================
// Provider Identification Types
// =============================================================================

/**
 * Supported LLM provider identifiers
 */
export type ProviderId = 'anthropic' | 'openai' | 'google' | 'openrouter';

/**
 * Model tier classification for pricing and capability guidance
 * - flagship: Most capable models, highest cost
 * - standard: Balanced performance and cost (recommended for most tasks)
 * - economy: Fast and cost-effective for routine tasks
 */
export type ModelTier = 'flagship' | 'standard' | 'economy';

// =============================================================================
// Model Configuration Types
// =============================================================================

/**
 * Configuration for an individual LLM model
 *
 * @example
 * ```typescript
 * const sonnetModel: LLMModel = {
 *   id: 'claude-sonnet-5',
 *   name: 'Claude Sonnet 5',
 *   description: 'Balanced performance and cost, ideal for most design analysis tasks',
 *   tier: 'standard',
 *   contextWindow: 1000000,
 *   maxOutputTokens: 128000
 * };
 * ```
 */
export interface LLMModel {
  /** Unique model identifier used in API requests */
  id: string;

  /** Human-readable display name */
  name: string;

  /** Brief description of model capabilities and recommended use cases */
  description: string;

  /** Maximum input context window in tokens */
  contextWindow: number;

  /** Whether this is the default model for the provider */
  isDefault?: boolean;

  /** Pricing and capability tier classification (optional for backward compatibility) */
  tier?: ModelTier;

  /** Maximum output tokens the model can generate (optional for backward compatibility) */
  maxOutputTokens?: number;
}

// =============================================================================
// Request Configuration Types
// =============================================================================

/**
 * Configuration options for LLM API requests
 *
 * @example
 * ```typescript
 * const config: RequestConfig = {
 *   prompt: 'Analyze this component...',
 *   model: 'claude-sonnet-5',
 *   maxTokens: 2048,
 *   temperature: 0.1
 * };
 * ```
 */
export interface RequestConfig {
  /** The prompt to send to the model */
  prompt: string;

  /** The model ID to use */
  model: string;

  /** Maximum tokens to generate in the response */
  maxTokens: number;

  /** Temperature for response randomness (0.0-1.0) */
  temperature: number;

  /** Optional additional parameters specific to the provider */
  additionalParams?: Record<string, unknown>;

  /**
   * When true, applies deterministic settings for consistent responses
   * Useful for design analysis where reproducibility is important
   */
  isDeterministic?: boolean;
}

// =============================================================================
// Response Types
// =============================================================================

/**
 * Unified response structure from any LLM provider
 * Normalizes different provider response formats into a consistent interface
 */
export interface ProviderResponse {
  /** The generated text content from the model */
  content: string;

  /** The model that generated the response */
  model: string;

  /** The provider that handled the request */
  provider: ProviderId;

  /** Token usage statistics */
  usage?: {
    /** Number of tokens in the input prompt */
    promptTokens: number;
    /** Number of tokens in the generated response */
    completionTokens: number;
    /** Total tokens used (prompt + completion) */
    totalTokens: number;
  };

  /**
   * Reason the model stopped generating
   * Common values: 'end_turn', 'stop', 'max_tokens', 'content_filter'
   */
  stopReason?: string;

  /** Original raw response from the provider (for debugging) */
  raw?: unknown;
}

/**
 * Standardized API response structure
 */
export interface LLMResponse {
  /** The generated text content */
  content: string;
  /** Model that generated the response */
  model: string;
  /** Token usage statistics */
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  /** Provider-specific metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Error response structure for failed API calls
 */
export interface ProviderError {
  /** HTTP status code from the provider */
  statusCode: number;

  /** Error message from the provider */
  message: string;

  /** Provider-specific error type/code */
  errorType?: string;

  /** The provider that returned the error */
  provider: ProviderId;

  /** Whether the error is retryable (e.g., rate limits) */
  retryable: boolean;

  /** Suggested retry delay in seconds (for rate limit errors) */
  retryAfter?: number;
}

/**
 * Error codes specific to LLM API interactions
 */
export enum LLMErrorCode {
  INVALID_API_KEY = 'INVALID_API_KEY',
  RATE_LIMIT_EXCEEDED = 'RATE_LIMIT_EXCEEDED',
  MODEL_NOT_FOUND = 'MODEL_NOT_FOUND',
  CONTEXT_LENGTH_EXCEEDED = 'CONTEXT_LENGTH_EXCEEDED',
  SERVER_ERROR = 'SERVER_ERROR',
  SERVICE_UNAVAILABLE = 'SERVICE_UNAVAILABLE',
  NETWORK_ERROR = 'NETWORK_ERROR',
  INVALID_REQUEST = 'INVALID_REQUEST',
  UNKNOWN_ERROR = 'UNKNOWN_ERROR',
}

/**
 * Custom error class for LLM API errors
 */
export class LLMError extends Error {
  constructor(
    message: string,
    public readonly code: LLMErrorCode,
    public readonly statusCode?: number,
    public readonly retryAfter?: number
  ) {
    super(message);
    this.name = 'LLMError';
  }
}

/**
 * Result of API key validation
 */
export interface ApiKeyValidationResult {
  /** Whether the API key is valid */
  isValid: boolean;
  /** Error message if validation failed */
  error?: string;
}

/**
 * HTTP headers for API requests
 */
export interface RequestHeaders {
  [key: string]: string;
}

// =============================================================================
// Provider Interface
// =============================================================================

/**
 * Interface that all LLM providers must implement
 * Provides a consistent API for interacting with different LLM services
 *
 * @example
 * ```typescript
 * class MyProvider implements LLMProvider {
 *   readonly name = 'MyProvider';
 *   readonly id = 'anthropic';
 *   readonly endpoint = 'https://api.example.com/v1/messages';
 *   readonly keyPrefix = 'sk-';
 *   readonly keyPlaceholder = 'sk-...';
 *   readonly models = [...];
 *   // ... implement methods
 * }
 * ```
 */
export interface LLMProvider {
  /** Human-readable provider name for display */
  readonly name: string;

  /** Unique provider identifier */
  readonly id: string;

  /** Base API endpoint URL */
  readonly endpoint: string;

  /** Expected prefix for API keys (for validation) */
  readonly keyPrefix: string;

  /** Placeholder text showing API key format */
  readonly keyPlaceholder: string;

  /** Available models for this provider */
  readonly models: LLMModel[];

  /**
   * Format a request payload for this provider's API
   *
   * @param config - Request configuration options
   * @returns Provider-specific request payload object
   */
  formatRequest(config: RequestConfig): Record<string, unknown>;

  /**
   * Parse the provider's response into a unified format
   *
   * @param response - Raw response from the provider's API
   * @returns Standardized LLM response
   */
  parseResponse(response: unknown): LLMResponse;

  /**
   * Validate an API key format for this provider
   *
   * @param apiKey - The API key to validate
   * @returns Validation result with isValid flag and optional error message
   */
  validateApiKey(apiKey: string): ApiKeyValidationResult;

  /**
   * Get the required HTTP headers for API requests
   *
   * @param apiKey - The API key to include in headers
   * @returns Headers object for fetch requests
   */
  getHeaders(apiKey: string): RequestHeaders;

  /**
   * Get the default model for this provider
   *
   * @returns The default model configuration
   */
  getDefaultModel(): LLMModel;

  /**
   * Handle provider-specific error responses
   *
   * @param statusCode - HTTP status code from the response
   * @param response - Error response body
   * @returns Formatted LLMError with appropriate error code
   */
  handleError(statusCode: number, response: unknown): LLMError;
}

// =============================================================================
// Provider Registry Type
// =============================================================================

/**
 * Registry of all available providers, keyed by provider ID
 */
export type ProviderRegistry = Record<ProviderId, LLMProvider>;

// =============================================================================
// Model Registry Constants
// =============================================================================

/**
 * Anthropic (Claude) models configuration
 *
 * Available models:
 * - Claude Opus 5: Flagship model for complex agents and coding
 * - Claude Sonnet 5: Standard balanced model (default)
 * - Claude Haiku 4.5: Economy model for quick tasks
 */
export const ANTHROPIC_MODELS: LLMModel[] = [
  {
    id: 'claude-opus-5',
    name: 'Claude Opus 5',
    description: 'Flagship model - Most intelligent, best for complex agents and coding',
    tier: 'flagship',
    contextWindow: 1000000,
    maxOutputTokens: 128000,
    isDefault: false,
  },
  {
    id: 'claude-sonnet-5',
    name: 'Claude Sonnet 5',
    description: 'Standard model - Best combination of speed and intelligence, recommended for most tasks',
    tier: 'standard',
    contextWindow: 1000000,
    maxOutputTokens: 128000,
    isDefault: true,
  },
  {
    id: 'claude-haiku-4-5',
    name: 'Claude Haiku 4.5',
    description: 'Economy model - Fastest with near-frontier intelligence',
    tier: 'economy',
    contextWindow: 200000,
    maxOutputTokens: 64000,
    isDefault: false,
  },
];

/**
 * OpenAI (GPT) models configuration
 *
 * Available models:
 * - GPT-5.6 Sol: Flagship model for complex reasoning and coding
 * - GPT-5.6 Terra: Standard model balancing intelligence and cost (default)
 * - GPT-5.6 Luna: Economy model for cost-sensitive, high-volume workloads
 */
export const OPENAI_MODELS: LLMModel[] = [
  {
    id: 'gpt-5.6',
    name: 'GPT-5.6 Sol',
    description: 'Flagship model - Frontier reasoning and agentic capabilities for complex coding and analysis',
    tier: 'flagship',
    contextWindow: 1050000,
    maxOutputTokens: 128000,
    isDefault: false,
  },
  {
    id: 'gpt-5.6-terra',
    name: 'GPT-5.6 Terra',
    description: 'Standard model - Balances intelligence and cost, recommended for most tasks',
    tier: 'standard',
    contextWindow: 1050000,
    maxOutputTokens: 128000,
    isDefault: true,
  },
  {
    id: 'gpt-5.6-luna',
    name: 'GPT-5.6 Luna',
    description: 'Economy model - Fastest and cheapest for high-volume tasks',
    tier: 'economy',
    contextWindow: 1050000,
    maxOutputTokens: 128000,
    isDefault: false,
  },
];

/**
 * Google (Gemini) models configuration
 *
 * Available models:
 * - Gemini 3.7 Flash: Flagship GA model for coding and agents (default)
 * - Gemini 3.6 Flash: Standard GA model balancing speed and multimodal capability
 * - Gemini 3.5 Flash-Lite: Economy GA model for high-volume tasks
 */
export const GOOGLE_MODELS: LLMModel[] = [
  {
    id: 'gemini-3.7-flash',
    name: 'Gemini 3.7 Flash',
    description: 'Flagship model - Most intelligent workhorse for coding and agents, recommended for most tasks',
    tier: 'flagship',
    contextWindow: 1000000,
    maxOutputTokens: 64000,
    isDefault: true,
  },
  {
    id: 'gemini-3.6-flash',
    name: 'Gemini 3.6 Flash',
    description: 'Standard model - Balances speed and multimodal capability at lower cost',
    tier: 'standard',
    contextWindow: 1000000,
    maxOutputTokens: 64000,
    isDefault: false,
  },
  {
    id: 'gemini-3.5-flash-lite',
    name: 'Gemini 3.5 Flash-Lite',
    description: 'Economy model - Fastest and most budget-friendly for low-latency, high-volume tasks',
    tier: 'economy',
    contextWindow: 1000000,
    maxOutputTokens: 64000,
    isDefault: false,
  },
];

/**
 * OpenRouter model configuration
 *
 * OpenRouter is a gateway, not a model vendor — it fronts hundreds of models from
 * many vendors behind one key. This list is a curated shortlist for the dropdown,
 * not the full catalog; any slug from openrouter.ai/models can be entered by hand
 * and overrides the selection. Slugs are OpenRouter's own namespace and do not
 * always match the vendor's native ID (e.g. `openai/gpt-5.6-sol` vs `gpt-5.6`).
 */
export const OPENROUTER_MODELS: LLMModel[] = [
  {
    id: 'anthropic/claude-opus-5',
    name: 'Claude Opus 5',
    description: 'Anthropic flagship - Most intelligent, best for complex agents and coding',
    tier: 'flagship',
    contextWindow: 1000000,
    maxOutputTokens: 128000,
    isDefault: false,
  },
  {
    id: 'anthropic/claude-sonnet-5',
    name: 'Claude Sonnet 5',
    description: 'Anthropic standard - Best combination of speed and intelligence, recommended for most tasks',
    tier: 'standard',
    contextWindow: 1000000,
    maxOutputTokens: 128000,
    isDefault: true,
  },
  {
    id: 'openai/gpt-5.6-sol',
    name: 'GPT-5.6 Sol',
    description: 'OpenAI flagship - Frontier reasoning for complex coding and analysis',
    tier: 'flagship',
    contextWindow: 1050000,
    maxOutputTokens: 128000,
    isDefault: false,
  },
  {
    id: 'openai/gpt-5.6-terra',
    name: 'GPT-5.6 Terra',
    description: 'OpenAI standard - Balances intelligence and cost',
    tier: 'standard',
    contextWindow: 1050000,
    maxOutputTokens: 128000,
    isDefault: false,
  },
  {
    id: 'google/gemini-3.7-flash',
    name: 'Gemini 3.7 Flash',
    description: 'Google flagship - Most intelligent workhorse for coding and agents',
    tier: 'flagship',
    contextWindow: 1000000,
    maxOutputTokens: 64000,
    isDefault: false,
  },
  {
    id: 'google/gemini-3.5-flash-lite',
    name: 'Gemini 3.5 Flash-Lite',
    description: 'Google economy - Fastest and most budget-friendly for high-volume tasks',
    tier: 'economy',
    contextWindow: 1000000,
    maxOutputTokens: 64000,
    isDefault: false,
  },
];

// =============================================================================
// Default Model Configuration
// =============================================================================

/**
 * Default models for each provider
 */
export const DEFAULT_MODELS: Record<ProviderId, string> = {
  anthropic: 'claude-sonnet-5',
  openai: 'gpt-5.6-terra',
  google: 'gemini-3.7-flash',
  openrouter: 'anthropic/claude-sonnet-5',
};

// =============================================================================
// Utility Types
// =============================================================================

/**
 * Extract all model IDs from a specific provider
 */
export type AnthropicModelId = (typeof ANTHROPIC_MODELS)[number]['id'];
export type OpenAIModelId = (typeof OPENAI_MODELS)[number]['id'];
export type GoogleModelId = (typeof GOOGLE_MODELS)[number]['id'];

/**
 * Union of all available model IDs across all providers
 */
export type AnyModelId = AnthropicModelId | OpenAIModelId | GoogleModelId;

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Get a model by its ID from any provider's model list
 *
 * @param modelId - The model identifier
 * @param models - Array of models to search
 * @returns The model configuration or undefined if not found
 */
export function findModelById(modelId: string, models: LLMModel[]): LLMModel | undefined {
  return models.find((m) => m.id === modelId);
}

/**
 * Get all models of a specific tier from a model list
 *
 * @param tier - The model tier to filter by
 * @param models - Array of models to search
 * @returns Array of models matching the tier
 */
export function filterModelsByTier(tier: ModelTier, models: LLMModel[]): LLMModel[] {
  return models.filter((m) => m.tier === tier);
}

/**
 * Get the default model from a model list
 *
 * @param models - Array of models to search
 * @returns The default model or the first model if no default is set
 */
export function getDefaultModel(models: LLMModel[]): LLMModel {
  return models.find((m) => m.isDefault) ?? models[0];
}

/**
 * Detect provider from an API key based on its prefix
 *
 * @param apiKey - The API key to analyze
 * @returns The detected provider ID or undefined if not recognized
 */
export function detectProviderFromKey(apiKey: string): ProviderId | undefined {
  const trimmed = apiKey.trim();

  if (trimmed.startsWith('sk-ant-')) {
    return 'anthropic';
  }
  // Checked before the generic `sk-` case below, which it would otherwise match.
  if (trimmed.startsWith('sk-or-')) {
    return 'openrouter';
  }
  if (trimmed.startsWith('sk-')) {
    return 'openai';
  }
  if (trimmed.startsWith('AIza') || trimmed.startsWith('AQ.')) {
    return 'google';
  }

  return undefined;
}

/**
 * Validate an API key format based on provider-specific rules
 *
 * @param apiKey - The API key to validate
 * @param providerId - The provider to validate against
 * @returns True if the key format appears valid
 */
export function validateApiKeyFormat(apiKey: string, providerId: ProviderId): boolean {
  const trimmed = apiKey.trim();

  switch (providerId) {
    case 'anthropic':
      return trimmed.startsWith('sk-ant-') && trimmed.length >= 40;
    case 'openai':
      // `sk-` alone is too loose: Anthropic (sk-ant-) and OpenRouter (sk-or-) keys
      // both match it. Excluding them lets the caller detect a provider mismatch
      // and name the right dropdown entry instead of saving a key that 401s later.
      return (
        trimmed.startsWith('sk-') &&
        !trimmed.startsWith('sk-or-') &&
        !trimmed.startsWith('sk-ant-') &&
        trimmed.length >= 20
      );
    case 'openrouter':
      return trimmed.startsWith('sk-or-') && trimmed.length >= 20;
    case 'google':
      return (
        (trimmed.startsWith('AIza') || trimmed.startsWith('AQ.')) &&
        trimmed.length >= 30 &&
        trimmed.length <= 100
      );
    default:
      return false;
  }
}

/**
 * Get all models across all providers
 *
 * @returns Array of all available models with their provider ID
 */
export function getAllModels(): Array<{ model: LLMModel; providerId: ProviderId }> {
  return [
    ...ANTHROPIC_MODELS.map((model) => ({ model, providerId: 'anthropic' as ProviderId })),
    ...OPENAI_MODELS.map((model) => ({ model, providerId: 'openai' as ProviderId })),
    ...GOOGLE_MODELS.map((model) => ({ model, providerId: 'google' as ProviderId })),
    ...OPENROUTER_MODELS.map((model) => ({ model, providerId: 'openrouter' as ProviderId })),
  ];
}

/**
 * Get models for a specific provider
 *
 * @param providerId - The provider identifier
 * @returns Array of models for the provider
 */
export function getModelsForProvider(providerId: ProviderId): LLMModel[] {
  switch (providerId) {
    case 'anthropic':
      return ANTHROPIC_MODELS;
    case 'openai':
      return OPENAI_MODELS;
    case 'google':
      return GOOGLE_MODELS;
    case 'openrouter':
      return OPENROUTER_MODELS;
    default:
      return [];
  }
}
