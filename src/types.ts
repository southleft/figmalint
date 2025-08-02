/// <reference types="@figma/plugin-typings" />

// Core Plugin Types
export interface PluginMessage {
  type: string;
  data?: any;
}

// Component Analysis Types
export interface ComponentMetadata {
  component: string;
  description: string;
  props: PropertyDefinition[];
  propertyCheatSheet: PropertyCheatSheet[];
  states: string[];
  slots: string[];
  variants: Record<string, string[]>;
  usage: string;
  accessibility: AccessibilityInfo;
  tokens: TokenRecommendations;
  audit: AuditResults;
  mcpReadiness?: MCPReadiness;
}

export interface PropertyDefinition {
  name: string;
  type: 'string' | 'boolean' | 'number' | 'variant';
  description: string;
  defaultValue: string;
  required: boolean;
}

export interface PropertyCheatSheet {
  name: string;
  values: string[];
  default: string;
  description: string;
}

export interface AccessibilityInfo {
  ariaLabels?: string[];
  keyboardSupport?: string;
  colorContrast?: string;
  focusManagement?: string;
}

export interface TokenRecommendations {
  colors?: string[];
  spacing?: string[];
  typography?: string[];
  effects?: string[];
  borders?: string[];
}

export interface AuditResults {
  accessibilityIssues: string[];
  namingIssues: string[];
  consistencyIssues: string[];
  tokenOpportunities?: string[];
}

export interface MCPReadiness {
  score: number;
  strengths: string[];
  gaps: string[];
  recommendations: string[];
  implementationNotes: string;
}

// Token Analysis Types
export interface DesignToken {
  name: string;
  value: string;
  type: string;
  isToken: boolean;
  isActualToken?: boolean;
  source: 'figma-style' | 'figma-variable' | 'hard-coded' | 'ai-suggestion';
  recommendation?: string;
  suggestion?: string;
  strokeColor?: string;
  isDefaultVariantStyle?: boolean;
  context?: {
    nodeType?: string;
    nodeName?: string;
    nodeId?: string;
    hasVisibleStroke?: boolean;
    path?: string;
    description?: string;
    property?: string;
  };
}

export interface TokenAnalysis {
  colors: DesignToken[];
  spacing: DesignToken[];
  typography: DesignToken[];
  effects: DesignToken[];
  borders: DesignToken[];
  summary: TokenSummary;
}

export interface TokenSummary {
  totalTokens: number;
  actualTokens: number;
  hardCodedValues: number;
  aiSuggestions: number;
  byCategory: Record<string, CategorySummary>;
}

export interface CategorySummary {
  total: number;
  tokens: number;
  hardCoded: number;
  suggestions: number;
}

// Component Context Types
export interface ComponentContext {
  name: string;
  type: string;
  hierarchy: LayerHierarchy[];
  colors?: string[];
  spacing?: string[];
  textContent?: string;
  frameStructure: {
    width: number;
    height: number;
    layoutMode: string;
  };
  detectedStyles: {
    hasFills: boolean;
    hasStrokes: boolean;
    hasEffects: boolean;
    cornerRadius: number;
  };
  detectedSlots: string[];
  isComponentSet: boolean;
  potentialVariants: string[];
  nestedLayers: string[];
  additionalContext?: {
    hasInteractiveElements: boolean;
    possibleUseCase: string;
    designPatterns: string[];
    componentFamily: string;
    suggestedConsiderations: string[];
  };
}

export interface LayerHierarchy {
  name: string;
  type: string;
  depth: number;
  children?: LayerHierarchy[];
}

// API Types
export interface ClaudeAPIResponse {
  content: Array<{
    text: string;
    type: string;
  }>;
}

export interface ClaudeAPIRequest {
  model: string;
  messages: Array<{
    role: 'user' | 'assistant';
    content: string;
  }>;
  max_tokens: number;
  temperature?: number;
  top_p?: number;
}

// Plugin State Types
export interface PluginState {
  apiKey: string | null;
  selectedModel: string;
  lastAnalyzedNode: SceneNode | null;
  lastAnalyzedMetadata: ComponentMetadata | null;
}

// UI Message Types
export type UIMessageType =
  | 'check-api-key'
  | 'save-api-key'
  | 'update-model'
  | 'analyze'
  | 'analyze-enhanced'
  | 'clear-api-key'
  | 'chat-message'
  | 'chat-clear-history'
  | 'select-node';

// Enhanced Analysis Types
export interface EnhancedAnalysisOptions {
  batchMode?: boolean;
  enableAudit?: boolean;
  includeTokenAnalysis?: boolean;
  enableMCPEnhancement?: boolean;
  node?: SceneNode;
  mcpServerUrl?: string;
  useMCP?: boolean;
}

export interface DetailedAuditResults {
  states: Array<{ name: string; found: boolean }>;
  accessibility: Array<{ check: string; status: 'pass' | 'fail' | 'warning'; suggestion: string }>;
  naming: Array<{ layer: string; issue: string; suggestion: string }>;
  consistency: Array<{ property: string; issue: string; suggestion: string }>;
}

export interface EnhancedAnalysisResult {
  metadata: ComponentMetadata;
  tokens: TokenAnalysis;
  audit: DetailedAuditResults;
  properties: Array<{ name: string; values: string[]; default: string }>;
  recommendations?: Array<{ name: string; type: string; description: string; examples: string[] }>;
}

export interface DetailedAudit {
  states: StateAudit[];
  accessibility: AccessibilityAudit[];
  naming: NamingAudit[];
  consistency: ConsistencyAudit[];
}

export interface StateAudit {
  name: string;
  found: boolean;
}

export interface AccessibilityAudit {
  check: string;
  status: 'pass' | 'fail' | 'warning';
  suggestion: string;
}

export interface NamingAudit {
  layer: string;
  issue: string;
  suggestion: string;
}

export interface ConsistencyAudit {
  property: string;
  issue: string;
  suggestion: string;
}

export interface Suggestion {
  category: 'token' | 'accessibility' | 'naming' | 'state';
  priority: 'high' | 'medium' | 'low';
  title: string;
  description: string;
  action?: string;
}

// Batch Analysis Types
export interface BatchAnalysisResult {
  summary: {
    totalComponents: number;
    averageScore: number;
    commonIssues: string[];
    topRecommendations: string[];
  };
  components: Array<{
    name: string;
    score: number;
    issues: string[];
    metadata?: ComponentMetadata;
  }>;
}

// Export utility types
export type ValidNodeType = 'FRAME' | 'COMPONENT' | 'COMPONENT_SET' | 'INSTANCE' | 'GROUP';
export type TokenCategory = 'colors' | 'spacing' | 'typography' | 'effects' | 'borders';

// Chat Types
export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  isLoading?: boolean;
}

export interface ChatHistory {
  messages: ChatMessage[];
  sessionId: string;
}

export interface ChatResponse {
  message: string;
  sources?: Array<{
    title: string;
    content: string;
    category: string;
  }>;
}
