// ──────────────────────────────────────────────
// Message type definitions for Plugin ↔ UI communication
// ──────────────────────────────────────────────

export type LintErrorType = 'fill' | 'stroke' | 'effect' | 'text' | 'radius' | 'spacing' | 'autoLayout' | 'accessibility';

export interface LintError {
  nodeId: string;
  nodeName: string;
  nodeType: string;
  errorType: LintErrorType;
  message: string;
  value: string;
  path: string;
  /** Spacing property name (for spacing errors) */
  property?: string;
  /** Severity level for weighted scoring */
  severity?: 'critical' | 'warning' | 'info';
}

export interface LintSummary {
  totalErrors: number;
  byType: Record<LintErrorType, number>;
  totalNodes: number;
  nodesWithErrors: number;
}

export interface LintResult {
  errors: LintError[];
  ignoredNodeIds: string[];
  ignoredErrorKeys: string[];
  summary: LintSummary;
}

export interface AuditCheck {
  check: string;
  status: 'pass' | 'fail' | 'warning';
  suggestion: string;
}

export interface DetailedAuditResults {
  states: Array<{ name: string; found: boolean }>;
  componentReadiness: AuditCheck[];
  accessibility: AuditCheck[];
  designLint?: AuditCheck[];
}

export interface DesignReviewFinding {
  severity: 'critical' | 'warning' | 'info' | 'suggestion';
  category: string;
  title: string;
  description: string;
  nodeId?: string;
  nodeName?: string;
  autoFixable: boolean;
}

export interface DesignReviewSummary {
  verdict: 'pass' | 'warn' | 'fail';
  headline: string;
  findings: DesignReviewFinding[];
  nextSteps: string[];
}

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

export interface TokenAnalysis {
  summary: {
    totalTokens: number;
    actualTokens: number;
    hardCodedValues: number;
  };
}

export interface EnhancedAnalysisResult {
  metadata: {
    component: string;
    description: string;
    props: Array<{ name: string; type: string; description: string; defaultValue: string; required: boolean }>;
    states: string[];
    audit: { accessibilityIssues: string[] };
  };
  tokens: TokenAnalysis;
  audit: DetailedAuditResults;
  properties: Array<{ name: string; values: string[]; default: string }>;
  recommendations?: Array<{ name: string; type: string; description: string; examples: string[] }>;
  namingIssues?: NamingIssue[];
  lintResult?: LintResult;
  designReview?: DesignReviewSummary;
}

// Chat message types for the UI
export type ChatMessageType =
  | { kind: 'ai-text'; content: string; streaming?: boolean }
  | { kind: 'user-text'; content: string }
  | { kind: 'score-card'; data: ScoreBreakdown }
  | { kind: 'issues-list'; data: LintError[]; fixableCount: number }
  | { kind: 'issue-detail'; data: LintError }
  | { kind: 'fix-result'; data: { nodeId: string; nodeName: string; applied: boolean; oldValue?: string; newValue?: string; property?: string } }
  | { kind: 'action-buttons'; buttons: ActionButton[] }
  | { kind: 'batch-summary'; data: { total: number; applied: number; failed: number } }
  | { kind: 'score-update'; data: { oldScore: number; newScore: number; issuesRemaining: number } }
  | { kind: 'ai-review'; data: AiReviewData }
  | { kind: 'refero-gallery'; data: ReferoComparisonData }
  | { kind: 'combined-score'; data: { lintScore: number; aiScore: number; combined: number } };

export interface AiReviewData {
  visualHierarchy: { score: number; notes: string };
  spacingRhythm: { score: number; notes: string };
  colorHarmony: { score: number; notes: string };
  missingStates: string[];
  recommendations: Array<{ title: string; description: string; severity: string }>;
  overallScore: number;
  summary: string;
}

export interface ReferoScreen {
  id: string;
  title: string;
  company: string;
  pageType: string;
  thumbnailUrl: string;
  fullUrl: string;
  platform: 'web' | 'ios' | 'android';
  tags?: string[];
}

export interface ReferoComparisonData {
  matchingPatterns: Array<{ pattern: string; frequency: string }>;
  missingPatterns: Array<{ pattern: string; frequency: string; exampleCompanies: string[] }>;
  stylePositioning: { closest: string[]; different: string[] };
  suggestions: Array<{ title: string; description: string; evidence: string }>;
  summary: string;
  screenshots: ReferoScreen[];
}

export interface CategoryScore {
  score: number;
  passed: number;
  failed: number;
}

export interface ScoreBreakdown {
  overall: number;
  tokens: CategoryScore;
  spacing: CategoryScore;
  layout: CategoryScore;
  accessibility: CategoryScore;
  aiReview: { score: number };
}

export interface ActionButton {
  id: string;
  label: string;
  variant: 'primary' | 'secondary' | 'ghost';
  action: string;
  params?: Record<string, unknown>;
}

export interface ChatMessage {
  id: string;
  timestamp: number;
  message: ChatMessageType;
}

// Plugin → UI message events
export type PluginEvent =
  | { type: 'design-lint-result'; data: LintResult }
  | { type: 'enhanced-analysis-result'; data: EnhancedAnalysisResult }
  | { type: 'analysis-error'; data: { error: string } }
  | { type: 'fix-applied'; data: { type: string; nodeId: string; nodeName: string; oldValue: unknown; newValue: unknown; property?: string; success?: boolean; error?: string } }
  | { type: 'fix-error'; data: { error: string } }
  | { type: 'batch-fix-v2-result'; data: { total: number; applied: number; failed: number; results: Array<{ nodeId: string; nodeName: string; success: boolean; message: string; oldValue?: string; newValue?: string }> } }
  | { type: 'rescan-complete'; data: { totalErrors: number; nodesWithErrors: number } }
  | { type: 'api-key-status'; data: { hasKey: boolean; provider: string; model?: string } }
  | { type: 'api-key-saved'; data: { success: boolean } }
  | { type: 'screenshot-result'; data: { nodeId: string; nodeName: string; screenshot: string; width: number; height: number } }
  | { type: string; data: unknown };

// UI → Plugin message commands
export function postToPlugin(type: string, data?: unknown): void {
  parent.postMessage({ pluginMessage: { type, data } }, '*');
}
