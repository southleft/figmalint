/// <reference types="@figma/plugin-typings" />

import { EnhancedAnalysisResult } from '../../types';

export interface ComponentAnalysisCache {
  hash: string;
  result: EnhancedAnalysisResult;
  timestamp: number;
  mcpKnowledgeVersion: string;
}

export interface DesignSystemsKnowledge {
  version: string;
  components: Record<string, string>;
  tokens: string;
  accessibility: string;
  scoring: string;
  lastUpdated: number;
}

export interface ConsistencyConfig {
  enableCaching?: boolean;
  enableMCPIntegration?: boolean;
  mcpServerUrl?: string;
  consistencyThreshold?: number;
}

export interface MCPSearchRequest {
  query: string;
  limit?: number;
  category?: 'components' | 'tokens' | 'patterns' | 'accessibility';
}

export interface MCPSearchResponse {
  results: Array<{
    title: string;
    content: string;
    category: string;
    relevance: number;
  }>;
}

export interface DeterministicPromptConfig {
  temperature: number;
  maxTokens: number;
  topP: number;
  frequencyPenalty: number;
  presencePenalty: number;
}
