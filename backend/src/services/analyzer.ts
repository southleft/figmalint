import { detectPageType, generateReview } from './claude.js';
import { runReferoComparison, type ReferoComparison } from './refero.js';
import { startSession, loadSession, saveAnalysisResult, saveReferoResult } from './session.js';
import Anthropic from '@anthropic-ai/sdk';

let anthropicClient: Anthropic | null = null;
function getAnthropicClient(): Anthropic {
  if (!anthropicClient) {
    anthropicClient = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }
  return anthropicClient;
}

export interface AnalyzeRequest {
  screenshot: string;
  lintResult: {
    summary: {
      totalErrors: number;
      byType: Record<string, number>;
      totalNodes: number;
      nodesWithErrors: number;
    };
    errors: Array<{
      nodeId: string;
      nodeName: string;
      errorType: string;
      message: string;
      value: string;
    }>;
  };
  extractedData: {
    componentName: string;
    componentDescription?: string;
    properties?: Array<{ name: string; type: string }>;
    states?: string[];
    metadata?: {
      nodeId: string;
      nodeType: string;
      width: number;
      height: number;
      hasAutoLayout: boolean;
      childCount: number;
    };
  };
  sessionId?: string;
  mode: 'quick' | 'deep';
}

export interface AnalysisResult {
  sessionId: string;
  pageType: string;
  lintResult: AnalyzeRequest['lintResult'];
  aiReview: {
    visualHierarchy: { score: number; notes: string };
    spacingRhythm: { score: number; notes: string };
    colorHarmony: { score: number; notes: string };
    missingStates: string[];
    recommendations: Array<{ title: string; description: string; severity: string }>;
    overallScore: number;
    summary: string;
  };
  referoComparison?: ReferoComparison;
  combinedScore: number;
}

/**
 * Run full analysis: page type detection + AI review + Refero comparison.
 */
export async function runAnalysis(req: AnalyzeRequest): Promise<AnalysisResult> {
  let sessionId: string;
  if (req.sessionId) {
    const existing = loadSession(req.sessionId);
    if (!existing) {
      throw new Error(`Session not found: ${req.sessionId}`);
    }
    sessionId = req.sessionId;
  } else {
    sessionId = startSession(
      req.extractedData.metadata?.nodeId,
      req.extractedData.componentName
    );
  }

  // Build lint summary text — safely access byType keys with fallback to 0
  const bt = req.lintResult.summary.byType || {};
  const lintSummary = `${req.lintResult.summary.totalErrors} issues: ${bt.fill ?? 0} fills, ${bt.stroke ?? 0} strokes, ${bt.effect ?? 0} effects, ${bt.text ?? 0} text, ${bt.radius ?? 0} radius, ${bt.spacing ?? 0} spacing, ${bt.autoLayout ?? 0} auto-layout`;

  // Build component info
  const meta = req.extractedData.metadata;
  const componentInfo = [
    `Name: ${req.extractedData.componentName}`,
    req.extractedData.componentDescription ? `Description: ${req.extractedData.componentDescription}` : '',
    meta ? `Type: ${meta.nodeType}, Size: ${meta.width}x${meta.height}, Children: ${meta.childCount}` : '',
    req.extractedData.states?.length ? `States: ${req.extractedData.states.join(', ')}` : '',
  ].filter(Boolean).join('\n');

  // Phase 1: Run page type detection and AI review in parallel
  // Use allSettled so a single AI failure doesn't discard the lint results
  const [pageTypeResult, aiReviewResult] = await Promise.allSettled([
    detectPageType(req.screenshot),
    generateReview(req.screenshot, lintSummary, componentInfo),
  ]);

  const pageType = pageTypeResult.status === 'fulfilled' ? pageTypeResult.value : 'unknown';
  const aiReview = aiReviewResult.status === 'fulfilled'
    ? aiReviewResult.value
    : {
        visualHierarchy: { score: 0, notes: 'AI review unavailable' },
        spacingRhythm: { score: 0, notes: 'AI review unavailable' },
        colorHarmony: { score: 0, notes: 'AI review unavailable' },
        missingStates: [] as string[],
        recommendations: [] as Array<{ title: string; description: string; severity: string }>,
        overallScore: 0,
        summary: 'AI review was unavailable for this analysis.',
      };

  // Phase 2: Run Refero comparison (depends on pageType, non-blocking)
  // In 'deep' mode or when Refero is available, fetch comparisons
  let referoComparison: ReferoComparison | null = null;
  if (req.mode === 'deep') {
    referoComparison = await runReferoComparison(
      pageType,
      componentInfo,
      req.screenshot,
      getAnthropicClient(),
    );
  } else {
    // In quick mode, fire Refero in background — don't block the response
    runReferoComparison(pageType, componentInfo, req.screenshot, getAnthropicClient())
      .then(result => {
        if (result) {
          saveReferoResult(sessionId, result);
        }
      })
      .catch(() => { /* Refero failure is non-critical */ });
  }

  // Compute combined score: 5-category weighted model
  const byType = req.lintResult.summary.byType || {};
  const total = Math.max(req.lintResult.summary.totalNodes, 1);
  const tokenFailed = (byType.fill ?? 0) + (byType.stroke ?? 0) + (byType.effect ?? 0) + (byType.text ?? 0);
  const tokensScore = Math.max(0, Math.round((1 - tokenFailed / (total * 4)) * 100));
  const spacingScore = Math.max(0, Math.round((1 - (byType.spacing ?? 0) / total) * 100));
  const layoutScore = Math.max(0, Math.round((1 - (byType.autoLayout ?? 0) / total) * 100));
  const a11yFailed = byType.accessibility ?? 0;
  const a11yScore = Math.max(0, Math.round((1 - a11yFailed / Math.max(total, a11yFailed)) * 100));
  const combinedScore = Math.round(
    tokensScore * 0.25 + spacingScore * 0.15 + layoutScore * 0.10 + a11yScore * 0.25 + aiReview.overallScore * 0.25
  );

  // Save to session
  saveAnalysisResult(sessionId, pageType, aiReview, req.lintResult, combinedScore, referoComparison);

  return {
    sessionId,
    pageType,
    lintResult: req.lintResult,
    aiReview,
    ...(referoComparison && { referoComparison }),
    combinedScore,
  };
}

