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
  existingDescription?: string;
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
  | 'select-node'
  // Auto-fix message types
  | 'preview-fix'
  | 'apply-token-fix'
  | 'apply-naming-fix'
  | 'apply-batch-fix'
  | 'update-description'
  | 'add-component-property'
  // Design Lint message types (deterministic, no AI)
  | 'run-design-lint'
  | 'lint-ignore-node'
  | 'lint-ignore-error'
  | 'lint-ignore-all-of-type'
  | 'lint-clear-ignored'
  | 'lint-select-node'
  | 'lint-select-all-with-value'
  | 'lint-save-settings'
  | 'lint-load-settings'
  // Chat UI message types
  | 'jump-to-node'
  | 'fix-spacing'
  | 'export-screenshot';

// Auto-fix Types
export interface FixRequest {
  type: 'token' | 'naming' | 'property';
  nodeId: string;
  propertyPath?: string;
  tokenId?: string;
  newValue?: string;
}

export interface FixPreviewRequest {
  type: 'token' | 'naming';
  nodeId: string;
  propertyPath?: string;
  suggestedValue?: string;
}

export interface BatchFixRequest {
  fixes: FixRequest[];
  confirmAll?: boolean;
}

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

export interface AuditCheck {
  check: string;
  status: 'pass' | 'fail' | 'warning';
  suggestion: string;
}

export interface DetailedAuditResults {
  states: Array<{ name: string; found: boolean }>;
  /** Property configuration and description checks (formerly "Accessibility") */
  componentReadiness: AuditCheck[];
  /** Real WCAG-informed accessibility checks (contrast, touch targets, focus state, font size) */
  accessibility: AuditCheck[];
  /** Deterministic lint findings (fills, strokes, effects, text, radius) */
  designLint?: AuditCheck[];
}

export interface EnhancedAnalysisResult {
  metadata: ComponentMetadata;
  tokens: TokenAnalysis;
  audit: DetailedAuditResults;
  properties: Array<{ name: string; values: string[]; default: string }>;
  recommendations?: Array<{ name: string; type: string; description: string; examples: string[] }>;
  namingIssues?: NamingIssue[];
  existingDescription?: string;
  /** Lint errors from deterministic analysis, grouped by type */
  lintResult?: LintResult;
  /** AI-generated review summary based on combined lint + analysis (CodeRabbit-style) */
  designReview?: DesignReviewSummary;
}

export interface DesignReviewSummary {
  /** Overall verdict: pass, warn, fail */
  verdict: 'pass' | 'warn' | 'fail';
  /** One-line summary */
  headline: string;
  /** Grouped findings by severity */
  findings: DesignReviewFinding[];
  /** AI-generated actionable next steps */
  nextSteps: string[];
}

export type DesignReviewSeverity = 'critical' | 'warning' | 'info' | 'suggestion';

export interface DesignReviewFinding {
  severity: DesignReviewSeverity;
  category: string;
  title: string;
  description: string;
  nodeId?: string;
  nodeName?: string;
  autoFixable: boolean;
}

// Re-export NamingIssue shape for use in UI messages
export interface NamingIssue {
  nodeId: string;
  nodeName: string;
  currentName: string;
  suggestedName: string;
  severity: 'error' | 'warning' | 'info';
  reason: string;
  layerType: string;
  depth: number;
  path: string;
}

export interface DetailedAudit {
  states: StateAudit[];
  accessibility: AccessibilityAudit[];
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

// ──────────────────────────────────────────────
// Design Lint Types (deterministic, non-AI rules)
// ──────────────────────────────────────────────

export type LintErrorType = 'fill' | 'stroke' | 'effect' | 'text' | 'radius' | 'spacing' | 'autoLayout';

export interface LintError {
  nodeId: string;
  nodeName: string;
  nodeType: string;
  errorType: LintErrorType;
  message: string;
  value: string;
  path: string;
}

export interface LintResult {
  errors: LintError[];
  ignoredNodeIds: string[];
  ignoredErrorKeys: string[];
  summary: LintSummary;
}

export interface LintSummary {
  totalErrors: number;
  byType: Record<LintErrorType, number>;
  totalNodes: number;
  nodesWithErrors: number;
}

export interface LintSettings {
  checkFills: boolean;
  checkStrokes: boolean;
  checkEffects: boolean;
  checkTextStyles: boolean;
  checkRadius: boolean;
  checkSpacing: boolean;
  checkAutoLayout: boolean;
  allowedRadii: number[];
  skipLockedLayers: boolean;
  skipHiddenLayers: boolean;
}

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
