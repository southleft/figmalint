// ──────────────────────────────────────────────
// Message type definitions for Plugin ↔ UI communication
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
  | { kind: 'fix-result'; data: { nodeId: string; nodeName: string; applied: boolean; oldValue?: string; newValue?: string } }
  | { kind: 'action-buttons'; buttons: ActionButton[] };

export interface ScoreBreakdown {
  overall: number;
  fills: { passed: number; failed: number };
  strokes: { passed: number; failed: number };
  effects: { passed: number; failed: number };
  textStyles: { passed: number; failed: number };
  radius: { passed: number; failed: number };
  spacing: { passed: number; failed: number };
  autoLayout: { passed: number; failed: number };
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
  | { type: 'fix-applied'; data: { type: string; nodeId: string; nodeName: string; oldValue: unknown; newValue: unknown } }
  | { type: 'fix-error'; data: { error: string } }
  | { type: 'api-key-status'; data: { hasKey: boolean; provider: string; model?: string } }
  | { type: 'api-key-saved'; data: { success: boolean } }
  | { type: 'screenshot-result'; data: { nodeId: string; nodeName: string; screenshot: string; width: number; height: number } }
  | { type: string; data: unknown };

// UI → Plugin message commands
export function postToPlugin(type: string, data?: unknown): void {
  parent.postMessage({ pluginMessage: { type, data } }, '*');
}
