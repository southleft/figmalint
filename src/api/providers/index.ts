/**
 * Multi-Provider LLM Registry
 *
 * Central registry for all LLM providers with unified access methods.
 * Provides factory functions for creating and managing provider instances.
 *
 * @module providers
 */

import { anthropicProvider } from './anthropic';
import { OpenAIProvider as openaiProvider } from './openai';
import { googleProvider } from './google';
import { openrouterProvider } from './openrouter';
import {
  LLMProvider,
  ProviderId,
  ProviderRegistry,
  LLMModel,
  RequestConfig,
  LLMResponse,
  LLMError,
  LLMErrorCode,
  detectProviderFromKey,
  DEFAULT_MODELS,
} from './types';

// Re-export all types and utilities
export * from './types';
export { anthropicProvider } from './anthropic';
export { OpenAIProvider as openaiProvider } from './openai';
export { googleProvider } from './google';
export { openrouterProvider } from './openrouter';

// =============================================================================
// Provider Registry
// =============================================================================

/**
 * Registry of all available LLM providers
 */
export const providers: ProviderRegistry = {
  anthropic: anthropicProvider,
  openai: openaiProvider,
  google: googleProvider,
  openrouter: openrouterProvider,
};

/**
 * Array of all provider IDs for iteration
 */
export const providerIds: ProviderId[] = ['anthropic', 'openai', 'google', 'openrouter'];

/**
 * Provider metadata for UI display
 */
export const providerMeta: Record<ProviderId, { name: string; icon: string; description: string }> = {
  anthropic: {
    name: 'Anthropic (Claude)',
    icon: '🟣',
    description: 'Claude models with strong reasoning and design analysis capabilities',
  },
  openai: {
    name: 'OpenAI (GPT)',
    icon: '🟢',
    description: 'GPT models with broad knowledge and versatile capabilities',
  },
  google: {
    name: 'Google (Gemini)',
    icon: '🔵',
    description: 'Gemini models with multimodal understanding and large context windows',
  },
  openrouter: {
    name: 'OpenRouter',
    icon: '🟠',
    description: 'Gateway to models from many vendors — Claude, GPT, Gemini and more — behind one key and one bill',
  },
};

// =============================================================================
// Provider Access Functions
// =============================================================================

/**
 * Get a provider by its ID
 *
 * @param providerId - The provider identifier
 * @returns The provider instance
 * @throws LLMError if provider not found
 */
export function getProvider(providerId: ProviderId): LLMProvider {
  const provider = providers[providerId];
  if (!provider) {
    throw new LLMError(
      `Unknown provider: ${providerId}`,
      LLMErrorCode.INVALID_REQUEST,
      400
    );
  }
  return provider;
}

/**
 * Get a provider by detecting it from an API key
 *
 * @param apiKey - The API key to detect provider from
 * @returns The provider instance or undefined if not detected
 */
export function getProviderFromKey(apiKey: string): LLMProvider | undefined {
  const providerId = detectProviderFromKey(apiKey);
  if (providerId) {
    return providers[providerId];
  }
  return undefined;
}

/**
 * Get all models from all providers
 *
 * @returns Array of all models with provider context
 */
export function getAllProviderModels(): Array<{ provider: LLMProvider; model: LLMModel }> {
  const result: Array<{ provider: LLMProvider; model: LLMModel }> = [];

  for (const providerId of providerIds) {
    const provider = providers[providerId];
    for (const model of provider.models) {
      result.push({ provider, model });
    }
  }

  return result;
}

/**
 * List the providers that currently have an API key in storage.
 *
 * The UI keeps its own `apiKeySaved` flag, which it resets whenever the provider
 * dropdown changes. Without a way to ask what is actually stored, switching away
 * from a configured provider and back left the UI believing it was unconfigured —
 * keys live plugin-side and are never echoed back, so it had nothing to re-check
 * against.
 *
 * @returns Provider IDs with a non-empty stored key
 */
export async function listProvidersWithKeys(): Promise<ProviderId[]> {
  const configured: ProviderId[] = [];
  for (const providerId of providerIds) {
    try {
      const key = (await figma.clientStorage.getAsync(
        STORAGE_KEYS.apiKey(providerId)
      )) as string | null;
      if (key && key.trim()) {
        configured.push(providerId);
      }
    } catch {
      // A single unreadable entry shouldn't hide the rest.
    }
  }
  return configured;
}

/**
 * Find a model by ID across all providers
 *
 * @param modelId - The model identifier to find
 * @returns The model and its provider, or undefined if not found
 */
export function findModel(modelId: string): { provider: LLMProvider; model: LLMModel } | undefined {
  for (const providerId of providerIds) {
    const provider = providers[providerId];
    const model = provider.models.find(m => m.id === modelId);
    if (model) {
      return { provider, model };
    }
  }
  return undefined;
}

// =============================================================================
// Unified API Call Function
// =============================================================================

/**
 * Make an API call to any provider with unified interface
 *
 * @param providerId - The provider to use
 * @param apiKey - The API key for authentication
 * @param config - Request configuration
 * @returns The LLM response
 * @throws LLMError on API failures
 */
export async function callProvider(
  providerId: ProviderId,
  apiKey: string,
  config: RequestConfig
): Promise<LLMResponse> {
  const provider = getProvider(providerId);

  // OpenAI can be pointed at a custom OpenAI-compatible endpoint (Azure OpenAI /
  // Azure AI Foundry, OpenRouter). Resolve that first — it changes endpoint, auth
  // header, the request `model` (Azure deployments and OpenRouter slugs are not
  // OpenAI model IDs), and relaxes key-format validation (gateway keys are not
  // always `sk-...`).
  let customOpenAIEndpoint = '';
  let effectiveConfig = config;
  if (providerId === 'openai') {
    const custom = await loadOpenAIEndpointConfig();
    if (custom.endpoint) {
      customOpenAIEndpoint = custom.endpoint;
      if (custom.deployment) {
        effectiveConfig = { ...config, model: custom.deployment };
      }
    }
  } else if (providerId === 'openrouter') {
    // The dropdown carries a shortlist; a typed slug wins so any of OpenRouter's
    // catalog is reachable without shipping (and re-shipping) the whole list.
    const customSlug = await loadOpenRouterCustomModel();
    if (customSlug) {
      effectiveConfig = { ...config, model: customSlug };
    }
  }

  // Validate API key. Skip the provider's format check for custom OpenAI
  // endpoints, whose keys (Azure, gateways) don't follow the `sk-` convention —
  // just require a non-empty key.
  if (customOpenAIEndpoint) {
    if (!apiKey || !apiKey.trim()) {
      throw new LLMError('API key is required', LLMErrorCode.INVALID_API_KEY, 401);
    }
  } else {
    const validation = provider.validateApiKey(apiKey);
    if (!validation.isValid) {
      throw new LLMError(
        validation.error || 'Invalid API key format',
        LLMErrorCode.INVALID_API_KEY,
        401
      );
    }
  }

  // Build request
  const requestBody = provider.formatRequest(effectiveConfig);
  let headers = provider.getHeaders(apiKey);

  // Determine endpoint (Google has special URL handling)
  let endpoint = provider.endpoint;
  if (providerId === 'google') {
    // Google requires model and key in URL
    endpoint = `${provider.endpoint}/${config.model}:generateContent?key=${apiKey.trim()}`;
  } else if (customOpenAIEndpoint) {
    // Accept a base URL (e.g. `.../openai/v1`) as well as a full one — Azure's docs
    // present the endpoint as a base and expect the client to add the chat route.
    endpoint = normalizeChatCompletionsEndpoint(customOpenAIEndpoint);
    // Azure authenticates with an `api-key` header instead of Bearer. Other
    // OpenAI-compatible gateways (OpenRouter, LiteLLM, ...) keep the standard
    // Bearer header.
    if (isAzureEndpoint(customOpenAIEndpoint)) {
      headers = { 'Content-Type': 'application/json', 'api-key': apiKey.trim() };
    } else if (isOpenRouterEndpoint(customOpenAIEndpoint)) {
      // Optional attribution headers — OpenRouter uses them to label the request
      // in the user's activity log. Neither affects routing or auth.
      headers = {
        ...headers,
        'HTTP-Referer': 'https://www.figma.com/community/plugin/1521241390290871981',
        'X-Title': 'FigmaLint',
      };
    }
  }

  try {
    console.log(`Making ${provider.name} API call to ${endpoint}...`);

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: headers,
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      let errorData: unknown;
      try {
        errorData = await response.json();
      } catch {
        errorData = await response.text();
      }

      throw provider.handleError(response.status, errorData);
    }

    const data = await response.json();
    console.log(`${provider.name} API response status: ${response.status}`);
    console.log(`${provider.name} API response keys:`, Object.keys(data));
    if (providerId === 'google') {
      console.log(`Gemini response candidates:`, data.candidates ? data.candidates.length : 'none');
      if (data.candidates?.[0]) {
        console.log(`Gemini candidate[0] keys:`, Object.keys(data.candidates[0]));
        if (data.candidates[0].content) {
          console.log(`Gemini content parts:`, data.candidates[0].content.parts?.length || 'none');
        }
      }
      if (data.error) {
        console.log(`Gemini error:`, JSON.stringify(data.error));
      }
    }
    return provider.parseResponse(data);

  } catch (error) {
    // Re-throw LLMErrors directly
    if (error instanceof LLMError) {
      throw error;
    }

    // Log the raw throw for the dev console — the flattened message below can lose
    // detail when a non-Error crosses the sandbox boundary.
    console.error(`${provider.name} request to ${endpoint} failed:`, error);

    // Figma's plugin sandbox throws when a request targets a domain that isn't in
    // the manifest `allowedDomains`. The rejection crosses the realm boundary and
    // often arrives as a non-Error value, so `error.message` alone loses it — pull
    // the message out however it's shaped.
    const rawMessage =
      error instanceof Error
        ? error.message
        : typeof error === 'string'
          ? error
          : (() => {
              try {
                return JSON.stringify(error);
              } catch {
                return String(error);
              }
            })();

    let host = endpoint;
    try {
      host = new URL(endpoint).host;
    } catch {
      // endpoint isn't a valid URL — surface it verbatim below (likely the cause).
    }

    // A blocked-domain failure is the most common custom-endpoint (Azure) problem.
    // Figma's message contains "whitelist"/"allowed"; a bad URL throws a TypeError.
    const lower = rawMessage.toLowerCase();
    if (
      lower.includes('whitelist') ||
      lower.includes('not allowed') ||
      lower.includes('allowedDomains'.toLowerCase()) ||
      lower.includes('non-whitelisted')
    ) {
      throw new LLMError(
        `Figma blocked the request to "${host}". This domain isn't in the plugin's network allowlist. ` +
          `Custom endpoints are supported for Azure model hosts and OpenRouter ` +
          `(${SUPPORTED_CUSTOM_ENDPOINT_HOSTS}). Check that your Endpoint URL points at one of these. (${rawMessage})`,
        LLMErrorCode.NETWORK_ERROR
      );
    }

    // Network / connectivity failures.
    if (
      lower.includes('failed to fetch') ||
      lower.includes('networkerror') ||
      lower.includes('network request')
    ) {
      throw new LLMError(
        `Network error connecting to ${provider.name} at "${host}". ` +
          `Check your internet connection and that the endpoint URL is correct and reachable. (${rawMessage})`,
        LLMErrorCode.NETWORK_ERROR
      );
    }

    // Everything else — surface the real message and where it was going, instead
    // of a bare "Unknown error".
    throw new LLMError(
      `Unexpected error calling ${provider.name} at "${host}": ${rawMessage || 'no error detail was provided by the runtime'}`,
      LLMErrorCode.UNKNOWN_ERROR
    );
  }
}

// =============================================================================
// Storage Keys
// =============================================================================

/**
 * Storage key constants for Figma clientStorage
 */
export const STORAGE_KEYS = {
  /** Selected provider ID */
  SELECTED_PROVIDER: 'selected-provider',

  /** Selected model ID */
  SELECTED_MODEL: 'selected-model',

  /** API key storage (per provider) */
  apiKey: (providerId: ProviderId) => `${providerId}-api-key`,

  /**
   * Custom OpenAI-compatible endpoint (Azure OpenAI / Azure AI Foundry).
   * When set, the OpenAI provider routes requests here instead of api.openai.com.
   */
  OPENAI_CUSTOM_ENDPOINT: 'openai-custom-endpoint',

  /**
   * Deployment / model name to send in the request body when a custom OpenAI
   * endpoint is configured (Azure deployments have arbitrary names). Empty =
   * fall back to the selected model from the dropdown.
   */
  OPENAI_CUSTOM_DEPLOYMENT: 'openai-custom-deployment',

  /**
   * Free-text OpenRouter model slug. OpenRouter fronts hundreds of models and the
   * dropdown only carries a shortlist, so this overrides the selection when set.
   * Empty = use the selected model from the dropdown.
   */
  OPENROUTER_CUSTOM_MODEL: 'openrouter-custom-model',

  /** Legacy Claude key (for migration) */
  LEGACY_CLAUDE_KEY: 'claude-api-key',
  LEGACY_CLAUDE_MODEL: 'claude-model',
};

// =============================================================================
// Custom OpenAI-compatible endpoint (Azure, OpenRouter) support
// =============================================================================

/**
 * Configuration for a custom OpenAI-compatible endpoint.
 */
export interface OpenAIEndpointConfig {
  /** Full endpoint URL (empty string when using the default api.openai.com). */
  endpoint: string;
  /** Deployment / model name to send in the request body (empty = use selected model). */
  deployment: string;
}

/**
 * A request host is treated as Azure when it lives under an azure.com subdomain.
 * Azure authenticates with an `api-key` header rather than `Authorization: Bearer`.
 */
export function isAzureEndpoint(endpoint: string): boolean {
  return /\.azure\.com(?:[:/]|$)/i.test(endpoint.trim());
}

/**
 * OpenRouter is an OpenAI-compatible gateway, so it needs no special auth or body
 * handling — but it does read two optional headers to attribute traffic to the
 * calling app. Identifying FigmaLint keeps requests off the "unknown app" bucket
 * in the user's OpenRouter activity log.
 */
export function isOpenRouterEndpoint(endpoint: string): boolean {
  return /(^|\/\/|\.)openrouter\.ai(?:[:/]|$)/i.test(endpoint.trim());
}

/**
 * Hosts the plugin's manifest allowlist permits for a custom endpoint. Figma's
 * sandbox rejects anything else before the request leaves, so this list drives
 * the error message users see when they paste an unsupported URL.
 */
export const SUPPORTED_CUSTOM_ENDPOINT_HOSTS =
  '*.openai.azure.com, *.ai.azure.com, *.cognitiveservices.azure.com, openrouter.ai';

/**
 * Normalize a custom OpenAI-compatible endpoint so a base URL works as well as a
 * full one. Azure's docs (and the OpenAI SDK) present the endpoint as a base URL
 * ending in `/openai/v1`; the chat route `/chat/completions` is appended by the
 * client. Users paste the base URL and get a 404, so append the route when it's
 * missing. If the URL already points at a chat/completions path, leave it alone.
 */
export function normalizeChatCompletionsEndpoint(endpoint: string): string {
  const trimmed = endpoint.trim().replace(/\/+$/, '');
  if (/\/chat\/completions$/i.test(trimmed)) return trimmed;
  // OpenRouter's API lives under `/api/v1`, and users typically paste the bare
  // host (`https://openrouter.ai`) copied from the browser. Fill in the API base
  // so that works, rather than 404ing on `https://openrouter.ai/chat/completions`.
  if (isOpenRouterEndpoint(trimmed) && !/\/api\/v\d/i.test(trimmed)) {
    return `${trimmed}/api/v1/chat/completions`;
  }
  // The chat route for any OpenAI-compatible endpoint is `<base>/chat/completions`.
  return `${trimmed}/chat/completions`;
}

/**
 * Load the free-text OpenRouter model slug, or '' when none is set.
 */
export async function loadOpenRouterCustomModel(): Promise<string> {
  try {
    const slug = (await figma.clientStorage.getAsync(
      STORAGE_KEYS.OPENROUTER_CUSTOM_MODEL
    )) as string | undefined;
    return (slug || '').trim();
  } catch {
    return '';
  }
}

/**
 * Persist (or clear) the free-text OpenRouter model slug. Empty clears it, so the
 * dropdown selection takes over again.
 */
export async function saveOpenRouterCustomModel(slug: string): Promise<void> {
  const trimmed = (slug || '').trim();
  if (!trimmed) {
    await figma.clientStorage.deleteAsync(STORAGE_KEYS.OPENROUTER_CUSTOM_MODEL);
    return;
  }
  await figma.clientStorage.setAsync(STORAGE_KEYS.OPENROUTER_CUSTOM_MODEL, trimmed);
}

/**
 * Load the custom OpenAI endpoint configuration from clientStorage.
 * Returns empty strings when no custom endpoint is configured.
 */
export async function loadOpenAIEndpointConfig(): Promise<OpenAIEndpointConfig> {
  try {
    const endpoint = (await figma.clientStorage.getAsync(STORAGE_KEYS.OPENAI_CUSTOM_ENDPOINT)) as string | undefined;
    const deployment = (await figma.clientStorage.getAsync(STORAGE_KEYS.OPENAI_CUSTOM_DEPLOYMENT)) as string | undefined;
    return { endpoint: (endpoint || '').trim(), deployment: (deployment || '').trim() };
  } catch {
    return { endpoint: '', deployment: '' };
  }
}

/**
 * Persist (or clear) the custom OpenAI endpoint configuration.
 * Passing an empty endpoint clears both keys so the provider reverts to api.openai.com.
 */
export async function saveOpenAIEndpointConfig(endpoint: string, deployment: string): Promise<void> {
  const trimmedEndpoint = (endpoint || '').trim();
  if (!trimmedEndpoint) {
    await figma.clientStorage.deleteAsync(STORAGE_KEYS.OPENAI_CUSTOM_ENDPOINT);
    await figma.clientStorage.deleteAsync(STORAGE_KEYS.OPENAI_CUSTOM_DEPLOYMENT);
    return;
  }
  await figma.clientStorage.setAsync(STORAGE_KEYS.OPENAI_CUSTOM_ENDPOINT, trimmedEndpoint);
  await figma.clientStorage.setAsync(STORAGE_KEYS.OPENAI_CUSTOM_DEPLOYMENT, (deployment || '').trim());
}

/**
 * Default provider and model configuration
 */
export const DEFAULTS = {
  provider: 'anthropic' as ProviderId,
  model: DEFAULT_MODELS.anthropic,
};

// =============================================================================
// Migration Utilities
// =============================================================================

/**
 * Check if legacy Claude storage exists and needs migration
 *
 * @returns Migration status
 */
export async function checkLegacyMigration(): Promise<{
  needsMigration: boolean;
  legacyKey?: string;
  legacyModel?: string;
}> {
  try {
    const legacyKey = await figma.clientStorage.getAsync(STORAGE_KEYS.LEGACY_CLAUDE_KEY);
    const legacyModel = await figma.clientStorage.getAsync(STORAGE_KEYS.LEGACY_CLAUDE_MODEL);

    if (legacyKey) {
      return {
        needsMigration: true,
        legacyKey: legacyKey as string,
        legacyModel: legacyModel as string | undefined,
      };
    }

    return { needsMigration: false };
  } catch {
    return { needsMigration: false };
  }
}

/**
 * Migrate legacy Claude storage to new multi-provider format
 */
export async function migrateLegacyStorage(): Promise<void> {
  const migration = await checkLegacyMigration();

  if (!migration.needsMigration) {
    return;
  }

  console.log('Migrating legacy Claude storage to multi-provider format...');

  // Save to new format
  if (migration.legacyKey) {
    await figma.clientStorage.setAsync(STORAGE_KEYS.apiKey('anthropic'), migration.legacyKey);
  }

  await figma.clientStorage.setAsync(STORAGE_KEYS.SELECTED_PROVIDER, 'anthropic');

  if (migration.legacyModel) {
    await figma.clientStorage.setAsync(STORAGE_KEYS.SELECTED_MODEL, migration.legacyModel);
  }

  // Clear legacy keys
  await figma.clientStorage.deleteAsync(STORAGE_KEYS.LEGACY_CLAUDE_KEY);
  await figma.clientStorage.deleteAsync(STORAGE_KEYS.LEGACY_CLAUDE_MODEL);

  console.log('Migration complete');
}

/**
 * Load saved provider configuration
 *
 * @returns Current configuration
 */
export async function loadProviderConfig(): Promise<{
  providerId: ProviderId;
  modelId: string;
  apiKey: string | null;
  openaiEndpoint: OpenAIEndpointConfig;
}> {
  // Run migration first if needed
  await migrateLegacyStorage();

  const providerId = (await figma.clientStorage.getAsync(STORAGE_KEYS.SELECTED_PROVIDER) as ProviderId) || DEFAULTS.provider;
  const savedModelId = await figma.clientStorage.getAsync(STORAGE_KEYS.SELECTED_MODEL) as string | undefined;
  const apiKey = await figma.clientStorage.getAsync(STORAGE_KEYS.apiKey(providerId)) as string | null;
  const openaiEndpoint = await loadOpenAIEndpointConfig();

  // A saved model may have been removed from the lineup in a plugin update
  // (providers retire model IDs); fall back to the provider default so stored
  // state never points at a model the UI no longer offers.
  const isKnownModel = savedModelId
    ? providers[providerId].models.some((m) => m.id === savedModelId)
    : false;
  const modelId = isKnownModel && savedModelId ? savedModelId : DEFAULT_MODELS[providerId];
  if (savedModelId && !isKnownModel) {
    await figma.clientStorage.setAsync(STORAGE_KEYS.SELECTED_MODEL, modelId);
  }

  return { providerId, modelId, apiKey, openaiEndpoint };
}

/**
 * Save provider configuration
 *
 * @param providerId - Provider to save
 * @param modelId - Model to save
 * @param apiKey - API key to save (optional)
 */
export async function saveProviderConfig(
  providerId: ProviderId,
  modelId: string,
  apiKey?: string
): Promise<void> {
  await figma.clientStorage.setAsync(STORAGE_KEYS.SELECTED_PROVIDER, providerId);
  await figma.clientStorage.setAsync(STORAGE_KEYS.SELECTED_MODEL, modelId);

  if (apiKey !== undefined) {
    await figma.clientStorage.setAsync(STORAGE_KEYS.apiKey(providerId), apiKey);
  }
}

/**
 * Clear API key for a specific provider
 *
 * @param providerId - Provider to clear key for
 */
export async function clearProviderKey(providerId: ProviderId): Promise<void> {
  await figma.clientStorage.deleteAsync(STORAGE_KEYS.apiKey(providerId));
}
