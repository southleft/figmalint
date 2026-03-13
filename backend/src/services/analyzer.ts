import { detectPageType, generateReview } from './claude.js';
import { startSession, loadSession, saveAnalysisResult } from './session.js';

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
  combinedScore: number;
}

/**
 * Run full analysis: page type detection + AI review in parallel.
 */
export async function runAnalysis(req: AnalyzeRequest): Promise<AnalysisResult> {
  let sessionId: string;
  if (req.sessionId) {
    // Validate that the provided session actually exists
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

  // Run page type detection and AI review in parallel
  const [pageType, aiReview] = await Promise.all([
    detectPageType(req.screenshot),
    generateReview(req.screenshot, lintSummary, componentInfo),
  ]);

  // Compute combined score: lint 40% + AI 60%
  const lintScore = Math.max(0, 100 - req.lintResult.summary.totalErrors * 5);
  const combinedScore = Math.round(lintScore * 0.4 + aiReview.overallScore * 0.6);

  // Save to session
  saveAnalysisResult(sessionId, pageType, aiReview, req.lintResult, combinedScore);

  return {
    sessionId,
    pageType,
    lintResult: req.lintResult,
    aiReview,
    combinedScore,
  };
}
