import { fetchDesignSystemContext, type SourceReference } from './design-knowledge.js';
import { buildDesignKnowledgeSection } from '../prompts/design-knowledge.js';
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

export interface AiReviewCategory {
  rating: 'pass' | 'needs_improvement' | 'fail';
  evidence: string[];
  recommendation: string | null;
}

export interface AiReviewResult {
  visualHierarchy: AiReviewCategory;
  statesCoverage: AiReviewCategory & { missingStates: string[] };
  platformAlignment: AiReviewCategory & { detectedPlatform: string };
  colorHarmony: AiReviewCategory;
  recommendations: Array<{ title: string; description: string; severity: string }>;
  summary: string;
}

export interface AnalysisResult {
  sessionId: string;
  pageType: string;
  lintResult: AnalyzeRequest['lintResult'];
  aiReview: AiReviewResult;
  referoComparison?: ReferoComparison;
  designHealthScore: number;
  /** Authoritative sources used to ground the AI review (Thesis #50) */
  designSystemSources?: SourceReference[];
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

  // Phase 1a: page type + design knowledge in parallel (both fast)
  const componentFamily = inferComponentFamily(req.extractedData.componentName);

  const [pageTypeResult, designKnowledgeResult] = await Promise.allSettled([
    detectPageType(req.screenshot),
    fetchDesignSystemContext(req.extractedData.componentName, componentFamily),
  ]);

  const pageType = pageTypeResult.status === 'fulfilled' ? pageTypeResult.value : 'unknown';
  const designKnowledge = designKnowledgeResult.status === 'fulfilled'
    ? designKnowledgeResult.value
    : null;

  // Phase 1b: AI review with design knowledge context
  const designKnowledgeText = designKnowledge
    ? buildDesignKnowledgeSection(designKnowledge)
    : undefined;

  const [aiReviewSettled] = await Promise.allSettled([
    generateReview(req.screenshot, lintSummary, componentInfo, designKnowledgeText),
  ]);

  const defaultCategory: AiReviewCategory = { rating: 'fail', evidence: ['AI review unavailable'], recommendation: null };
  const aiReview: AiReviewResult = aiReviewSettled.status === 'fulfilled'
    ? aiReviewSettled.value
    : {
        visualHierarchy: { ...defaultCategory },
        statesCoverage: { ...defaultCategory, missingStates: [] },
        platformAlignment: { ...defaultCategory, detectedPlatform: 'unknown' },
        colorHarmony: { ...defaultCategory },
        recommendations: [],
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

  // Compute Design Health Score — severity-weighted, no AI component
  // Matches frontend formula: Tokens 30%, Spacing 20%, Layout 10%, A11y 30%, Naming 10%
  const SEVERITY_WEIGHT: Record<string, number> = { critical: 10, warning: 3, info: 1 };
  const errors = req.lintResult.errors;
  const total = Math.max(req.lintResult.summary.totalNodes, 1);

  function severityScore(errs: typeof errors, checkable: number): number {
    const failed = errs.length;
    const passed = Math.max(0, checkable - failed);
    const weightedFailed = errs.reduce((sum, e) => sum + (SEVERITY_WEIGHT[(e as any).severity || 'warning'] || 3), 0);
    const weightedPassed = passed * 10;
    const t = weightedPassed + weightedFailed;
    return t > 0 ? Math.round((weightedPassed / t) * 100) : 100;
  }

  const GENERIC_NAME_RE = /^(Frame|Group|Rectangle|Ellipse|Vector|Line|Polygon|Star)\s*\d+$/i;

  const tokenErrors = errors.filter(e => ['fill', 'stroke', 'effect', 'text'].includes(e.errorType));
  const spacingErrors = errors.filter(e => e.errorType === 'spacing');
  const layoutErrors = errors.filter(e => e.errorType === 'autoLayout');
  const a11yErrors = errors.filter(e => e.errorType === 'accessibility' && !GENERIC_NAME_RE.test(e.nodeName));
  const namingErrors = errors.filter(e =>
    (e.errorType === 'accessibility' && GENERIC_NAME_RE.test(e.nodeName)) || e.errorType === 'radius'
  );

  const designHealthScore = Math.round(
    severityScore(tokenErrors, total * 4) * 0.30 +
    severityScore(spacingErrors, total) * 0.20 +
    severityScore(layoutErrors, total) * 0.10 +
    severityScore(a11yErrors, total) * 0.30 +
    severityScore(namingErrors, total) * 0.10
  );

  // Save to session
  saveAnalysisResult(sessionId, pageType, aiReview, req.lintResult, designHealthScore, referoComparison);

  return {
    sessionId,
    pageType,
    lintResult: req.lintResult,
    aiReview,
    ...(referoComparison && { referoComparison }),
    designHealthScore,
    ...(designKnowledge && { designSystemSources: designKnowledge.sources }),
  };
}

/** Infer component family from name for targeted MCP queries. */
function inferComponentFamily(name: string): string | undefined {
  const lower = name.toLowerCase();
  const families: Array<[RegExp, string]> = [
    [/button/i, "button"],
    [/avatar/i, "avatar"],
    [/card/i, "card"],
    [/badge|tag|chip/i, "badge"],
    [/input|field|text.?area|search/i, "input"],
    [/modal|dialog|drawer|sheet/i, "modal"],
    [/nav|menu|sidebar|tab/i, "navigation"],
    [/table|list|grid/i, "data-display"],
    [/icon/i, "icon"],
    [/toggle|switch|checkbox|radio/i, "toggle"],
    [/select|dropdown|picker|combo/i, "select"],
    [/toast|alert|notification|banner/i, "feedback"],
    [/tooltip|popover/i, "overlay"],
    [/skeleton|spinner|loader/i, "loading"],
  ];

  for (const [re, family] of families) {
    if (re.test(lower)) return family;
  }

  return undefined;
}

