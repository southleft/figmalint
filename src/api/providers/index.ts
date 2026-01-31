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
import {
  LLMProvider,
  ProviderId,
  ProviderRegistry,
  LLMModel,
  RequestConfig,
  LLMResponse,
  LLMError,
  LLMErrorCode,
  getModelsForProvider,
  detectProviderFromKey,
  DEFAULT_MODELS,
} from './types';

// Re-export all types and utilities
export * from './types';
export { anthropicProvider } from './anthropic';
export { OpenAIProvider as openaiProvider } from './openai';
export { googleProvider } from './google';

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
};

/**
 * Array of all provider IDs for iteration
 */
export const providerIds: ProviderId[] = ['anthropic', 'openai', 'google'];

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

  // Validate API key
  const validation = provider.validateApiKey(apiKey);
  if (!validation.isValid) {
    throw new LLMError(
      validation.error || 'Invalid API key format',
      LLMErrorCode.INVALID_API_KEY,
      401
    );
  }

  // Build request
  const requestBody = provider.formatRequest(config);
  const headers = provider.getHeaders(apiKey);

  // Determine endpoint (Google has special URL handling)
  let endpoint = provider.endpoint;
  if (providerId === 'google') {
    // Google requires model and key in URL
    endpoint = `${provider.endpoint}/${config.model}:generateContent?key=${apiKey.trim()}`;
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

    // Handle network errors
    if (error instanceof Error) {
      if (error.message.includes('Failed to fetch') || error.message.includes('NetworkError')) {
        throw new LLMError(
          `Network error connecting to ${provider.name}. Please check your internet connection.`,
          LLMErrorCode.NETWORK_ERROR
        );
      }
    }

    // Unknown error
    throw new LLMError(
      `Unexpected error calling ${provider.name}: ${error instanceof Error ? error.message : 'Unknown error'}`,
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

  /** Legacy Claude key (for migration) */
  LEGACY_CLAUDE_KEY: 'claude-api-key',
  LEGACY_CLAUDE_MODEL: 'claude-model',
};

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
}> {
  // Run migration first if needed
  await migrateLegacyStorage();

  const providerId = (await figma.clientStorage.getAsync(STORAGE_KEYS.SELECTED_PROVIDER) as ProviderId) || DEFAULTS.provider;
  const modelId = (await figma.clientStorage.getAsync(STORAGE_KEYS.SELECTED_MODEL) as string) || DEFAULT_MODELS[providerId];
  const apiKey = await figma.clientStorage.getAsync(STORAGE_KEYS.apiKey(providerId)) as string | null;

  return { providerId, modelId, apiKey };
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
