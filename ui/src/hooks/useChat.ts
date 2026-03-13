import { useState, useCallback } from 'react';
import type { ChatMessage, ChatMessageType, LintResult, LintError, ScoreBreakdown, CategoryScore, ScoreGrade, AiReviewData, ReferoComparisonData } from '../lib/messages';

let messageIdCounter = 0;
function nextId(): string {
  return `msg-${++messageIdCounter}-${Date.now()}`;
}

function createMessage(message: ChatMessageType): ChatMessage {
  return { id: nextId(), timestamp: Date.now(), message };
}

/** Severity weights for the Design Health Score (Cypress model). */
const SEVERITY_WEIGHT: Record<string, number> = { critical: 10, warning: 3, info: 1 };

function getGrade(score: number): ScoreGrade {
  if (score >= 90) return 'excellent';
  if (score >= 70) return 'needs-work';
  return 'poor';
}

/**
 * Compute a severity-weighted category score.
 * Each error's severity drives its weight. Passed nodes get the max weight (10).
 */
function severityScore(errors: LintError[], totalCheckable: number): CategoryScore {
  const failed = errors.length;
  const passed = Math.max(0, totalCheckable - failed);
  const weightedFailed = errors.reduce((sum, e) => sum + (SEVERITY_WEIGHT[e.severity || 'warning'] || 3), 0);
  const weightedPassed = passed * 10; // passed nodes assumed weight 10 (critical-level pass)
  const total = weightedPassed + weightedFailed;
  const score = total > 0 ? Math.round((weightedPassed / total) * 100) : 100;
  return { score, passed, failed };
}

/** Generic name pattern for naming category. */
const GENERIC_NAME_RE = /^(Frame|Group|Rectangle|Ellipse|Vector|Line|Polygon|Star)\s*\d+$/i;

/**
 * Compute Design Health Score — purely deterministic, no AI.
 * 5 categories: Tokens (30%), Spacing (20%), Layout (10%), Accessibility (30%), Naming (10%).
 */
function computeScoreBreakdown(result: LintResult): ScoreBreakdown {
  const total = result.summary.totalNodes || 1;

  // Tokens = fill + stroke + effect + text
  const tokenErrors = result.errors.filter(e =>
    e.errorType === 'fill' || e.errorType === 'stroke' || e.errorType === 'effect' || e.errorType === 'text'
  );
  const tokens = severityScore(tokenErrors, total * 4);

  // Spacing
  const spacingErrors = result.errors.filter(e => e.errorType === 'spacing');
  const spacing = severityScore(spacingErrors, total);

  // Layout (auto-layout)
  const layoutErrors = result.errors.filter(e => e.errorType === 'autoLayout');
  const layout = severityScore(layoutErrors, total);

  // Accessibility — all a11y errors except generic naming
  const a11yErrors = result.errors.filter(e =>
    e.errorType === 'accessibility' && !GENERIC_NAME_RE.test(e.nodeName)
  );
  const accessibility = severityScore(a11yErrors, total);

  // Naming — generic names (from a11y tier 2) + radius as naming proxy
  const namingErrors = result.errors.filter(e =>
    (e.errorType === 'accessibility' && GENERIC_NAME_RE.test(e.nodeName)) ||
    e.errorType === 'radius'
  );
  const naming = severityScore(namingErrors, total);

  // Weighted average (30/20/10/30/10)
  const overall = Math.round(
    tokens.score * 0.30 +
    spacing.score * 0.20 +
    layout.score * 0.10 +
    accessibility.score * 0.30 +
    naming.score * 0.10
  );

  return { overall, grade: getGrade(overall), tokens, spacing, layout, accessibility, naming };
}

export interface ChatState {
  messages: ChatMessage[];
  lintResult: LintResult | null;
  score: ScoreBreakdown | null;
  isAnalyzing: boolean;
  issuesFixed: number;
  sessionId: string | null;
  aiReview: AiReviewData | null;
  isStreaming: boolean;
}

export function useChat() {
  const [state, setState] = useState<ChatState>({
    messages: [],
    lintResult: null,
    score: null,
    isAnalyzing: false,
    issuesFixed: 0,
    sessionId: null,
    aiReview: null,
    isStreaming: false,
  });

  const addMessage = useCallback((msg: ChatMessageType) => {
    setState(prev => ({
      ...prev,
      messages: [...prev.messages, createMessage(msg)],
    }));
  }, []);

  const startAnalysis = useCallback(() => {
    setState(prev => ({
      ...prev,
      isAnalyzing: true,
      messages: [],
      lintResult: null,
      score: null,
      issuesFixed: 0,
    }));
  }, []);

  const handleLintResult = useCallback((result: LintResult) => {
    const score = computeScoreBreakdown(result);
    const fixableCount = result.errors.filter(e => e.errorType === 'spacing' || e.errorType === 'radius').length;

    const messages: ChatMessage[] = [
      createMessage({ kind: 'score-card', data: score }),
      createMessage({
        kind: 'ai-text',
        content: buildLintSummaryText(result, score),
      }),
      createMessage({
        kind: 'issues-list',
        data: result.errors,
        fixableCount,
      }),
    ];

    if (fixableCount > 0 || result.errors.length > 0) {
      messages.push(
        createMessage({
          kind: 'action-buttons',
          buttons: [
            ...(fixableCount > 0
              ? [{ id: 'fix-all', label: `Fix all auto-fixable (${fixableCount})`, variant: 'primary' as const, action: 'fix-all' }]
              : []),
            { id: 'walkthrough', label: 'Walk through issues', variant: 'secondary' as const, action: 'walkthrough' },
            { id: 'rescan', label: 'Re-scan', variant: 'ghost' as const, action: 'rescan' },
          ],
        })
      );
    }

    setState(prev => ({
      ...prev,
      isAnalyzing: false,
      lintResult: result,
      score,
      messages: [...prev.messages, ...messages],
    }));
  }, []);

  const handleFixApplied = useCallback((data: { nodeId: string; nodeName: string; oldValue: unknown; newValue: unknown; property?: string; success?: boolean }) => {
    if (data.success === false) return; // Skip failed fixes (error is shown separately)

    setState(prev => ({
      ...prev,
      issuesFixed: prev.issuesFixed + 1,
      messages: [
        ...prev.messages,
        createMessage({
          kind: 'fix-result',
          data: {
            nodeId: data.nodeId,
            nodeName: data.nodeName,
            applied: true,
            oldValue: String(data.oldValue),
            newValue: String(data.newValue),
            property: data.property,
          },
        }),
      ],
    }));
  }, []);

  const handleBatchFixResult = useCallback((data: { total: number; applied: number; failed: number; results: Array<{ nodeId: string; nodeName: string; success: boolean; message: string; oldValue?: string; newValue?: string }> }) => {
    const messages: ChatMessage[] = [];

    // Add individual fix results
    for (const r of data.results) {
      if (r.success) {
        messages.push(createMessage({
          kind: 'fix-result',
          data: {
            nodeId: r.nodeId,
            nodeName: r.nodeName,
            applied: true,
            oldValue: r.oldValue,
            newValue: r.newValue,
          },
        }));
      }
    }

    // Add batch summary
    messages.push(createMessage({
      kind: 'batch-summary',
      data: { total: data.total, applied: data.applied, failed: data.failed },
    }));

    setState(prev => ({
      ...prev,
      issuesFixed: prev.issuesFixed + data.applied,
      messages: [...prev.messages, ...messages],
    }));
  }, []);

  const handleRescan = useCallback((result: LintResult) => {
    const newScore = computeScoreBreakdown(result);
    const oldOverall = state.score?.overall || 0;

    const messages: ChatMessage[] = [];

    if (result.summary.totalErrors === 0) {
      messages.push(createMessage({
        kind: 'ai-text',
        content: 'All issues resolved! Component is clean.',
      }));
    } else {
      messages.push(createMessage({
        kind: 'score-update',
        data: {
          oldScore: oldOverall,
          newScore: newScore.overall,
          issuesRemaining: result.summary.totalErrors,
        },
      }));
    }

    messages.push(createMessage({ kind: 'score-card', data: newScore }));

    if (result.errors.length > 0) {
      const fixableCount = result.errors.filter(e => e.errorType === 'spacing' || e.errorType === 'radius').length;
      messages.push(createMessage({
        kind: 'issues-list',
        data: result.errors,
        fixableCount,
      }));
    }

    setState(prev => ({
      ...prev,
      lintResult: result,
      score: newScore,
      messages: [...prev.messages, ...messages],
    }));
  }, [state.score]);

  const handleAiReview = useCallback((data: {
    sessionId: string;
    aiReview: AiReviewData;
    referoComparison?: ReferoComparisonData;
  }) => {
    const messages: ChatMessage[] = [];

    // AI review card (rubric-based: Pass/NI/Fail)
    messages.push(createMessage({
      kind: 'ai-review',
      data: data.aiReview,
    }));

    // Summary text
    messages.push(createMessage({
      kind: 'ai-text',
      content: data.aiReview.summary,
    }));

    // Recommendations
    if (data.aiReview.recommendations.length > 0) {
      const recText = data.aiReview.recommendations
        .map(r => `- **[${r.severity}]** ${r.title}: ${r.description}`)
        .join('\n');
      messages.push(createMessage({
        kind: 'ai-text',
        content: `**AI Recommendations:**\n${recText}`,
      }));
    }

    // Missing states (from statesCoverage)
    const missingStates = data.aiReview.statesCoverage?.missingStates || [];
    if (missingStates.length > 0) {
      messages.push(createMessage({
        kind: 'ai-text',
        content: `**Missing states:** ${missingStates.join(', ')}`,
      }));
    }

    // Refero comparison gallery (if available)
    if (data.referoComparison) {
      messages.push(createMessage({
        kind: 'refero-gallery',
        data: data.referoComparison,
      }));

      // Refero suggestions as AI text
      if (data.referoComparison.suggestions.length > 0) {
        const sugText = data.referoComparison.suggestions
          .map(s => `- **${s.title}:** ${s.description} _(${s.evidence})_`)
          .join('\n');
        messages.push(createMessage({
          kind: 'ai-text',
          content: `**Refero-based suggestions:**\n${sugText}`,
        }));
      }
    }

    // Quick actions after AI review
    const buttons = [
      { id: 'walkthrough', label: 'Walk through issues', variant: 'secondary' as const, action: 'walkthrough' },
      { id: 'rescan', label: 'Re-scan', variant: 'ghost' as const, action: 'rescan' },
      { id: 'export', label: 'Export report', variant: 'ghost' as const, action: 'export' },
    ];
    messages.push(createMessage({ kind: 'action-buttons', buttons }));

    setState(prev => ({
      ...prev,
      isAnalyzing: false,
      sessionId: data.sessionId,
      aiReview: data.aiReview,
      messages: [...prev.messages, ...messages],
    }));
  }, []);

  const setSessionId = useCallback((id: string) => {
    setState(prev => ({ ...prev, sessionId: id }));
  }, []);

  const appendStreamChunk = useCallback((text: string) => {
    setState(prev => {
      const msgs = [...prev.messages];
      const last = msgs[msgs.length - 1];
      if (last && last.message.kind === 'ai-text' && last.message.streaming) {
        // Append to existing streaming message
        msgs[msgs.length - 1] = {
          ...last,
          message: { kind: 'ai-text', content: last.message.content + text, streaming: true },
        };
        return { ...prev, messages: msgs, isStreaming: true };
      }
      // Start new streaming message
      return {
        ...prev,
        isStreaming: true,
        messages: [...msgs, createMessage({ kind: 'ai-text', content: text, streaming: true })],
      };
    });
  }, []);

  const finishStream = useCallback(() => {
    setState(prev => {
      const msgs = prev.messages.map(m =>
        m.message.kind === 'ai-text' && m.message.streaming
          ? { ...m, message: { ...m.message, streaming: false } as ChatMessageType }
          : m
      );
      return { ...prev, isStreaming: false, messages: msgs };
    });
  }, []);

  const clearMessages = useCallback(() => {
    setState({
      messages: [],
      lintResult: null,
      score: null,
      isAnalyzing: false,
      issuesFixed: 0,
      sessionId: null,
      aiReview: null,
      isStreaming: false,
    });
  }, []);

  return {
    ...state,
    addMessage,
    startAnalysis,
    handleLintResult,
    handleFixApplied,
    handleBatchFixResult,
    handleRescan,
    handleAiReview,
    setSessionId,
    appendStreamChunk,
    finishStream,
    clearMessages,
  };
}

function buildLintSummaryText(result: LintResult, score: ScoreBreakdown): string {
  const { totalErrors } = result.summary;
  const byType = result.summary.byType;

  if (totalErrors === 0) {
    return 'All layers use proper design styles. No lint issues found!';
  }

  const parts: string[] = [];
  if (byType.fill > 0) parts.push(`${byType.fill} missing fill styles`);
  if (byType.stroke > 0) parts.push(`${byType.stroke} missing stroke styles`);
  if (byType.effect > 0) parts.push(`${byType.effect} missing effect styles`);
  if (byType.text > 0) parts.push(`${byType.text} missing text styles`);
  if (byType.radius > 0) parts.push(`${byType.radius} non-standard radii`);
  if (byType.spacing > 0) parts.push(`${byType.spacing} off-grid spacing`);
  if (byType.autoLayout > 0) parts.push(`${byType.autoLayout} missing auto-layout`);
  if (byType.accessibility > 0) parts.push(`${byType.accessibility} accessibility issues`);

  const fixable = result.errors.filter(e => e.errorType === 'spacing' || e.errorType === 'radius').length;

  return `Found **${totalErrors} issues** (score: ${score.overall}/100):\n${parts.join(', ')}.\n${fixable > 0 ? `\n${fixable} can be auto-fixed.` : ''}`;
}
