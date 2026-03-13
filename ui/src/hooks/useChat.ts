import { useState, useCallback } from 'react';
import type { ChatMessage, ChatMessageType, LintResult, LintError, ScoreBreakdown } from '../lib/messages';

let messageIdCounter = 0;
function nextId(): string {
  return `msg-${++messageIdCounter}-${Date.now()}`;
}

function createMessage(message: ChatMessageType): ChatMessage {
  return { id: nextId(), timestamp: Date.now(), message };
}

/**
 * Compute a score breakdown from a LintResult.
 */
function computeScoreBreakdown(result: LintResult): ScoreBreakdown {
  const s = result.summary;
  const total = s.totalNodes || 1;

  function category(type: string): { passed: number; failed: number } {
    const failed = (s.byType as Record<string, number>)[type] || 0;
    return { passed: Math.max(0, total - failed), failed };
  }

  const fills = category('fill');
  const strokes = category('stroke');
  const effects = category('effect');
  const textStyles = category('text');
  const radius = category('radius');
  const spacing = category('spacing');
  const autoLayout = category('autoLayout');

  // Weighted score (lower is worse)
  const totalIssues = s.totalErrors;
  const maxIssues = total * 7; // 7 check types
  const overall = Math.max(0, Math.min(100, Math.round((1 - totalIssues / Math.max(maxIssues, 1)) * 100)));

  return { overall, fills, strokes, effects, textStyles, radius, spacing, autoLayout };
}

export interface ChatState {
  messages: ChatMessage[];
  lintResult: LintResult | null;
  score: ScoreBreakdown | null;
  isAnalyzing: boolean;
  issuesFixed: number;
}

export function useChat() {
  const [state, setState] = useState<ChatState>({
    messages: [],
    lintResult: null,
    score: null,
    isAnalyzing: false,
    issuesFixed: 0,
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
    const fixableCount = result.errors.filter(e => e.errorType === 'spacing').length;

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
      const fixableCount = result.errors.filter(e => e.errorType === 'spacing').length;
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

  const clearMessages = useCallback(() => {
    setState({
      messages: [],
      lintResult: null,
      score: null,
      isAnalyzing: false,
      issuesFixed: 0,
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

  const fixable = result.errors.filter(e => e.errorType === 'spacing').length;

  return `Found **${totalErrors} issues** (score: ${score.overall}/100):\n${parts.join(', ')}.\n${fixable > 0 ? `\n${fixable} can be auto-fixed.` : ''}`;
}
