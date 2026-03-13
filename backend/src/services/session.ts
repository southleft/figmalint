import { nanoid } from 'nanoid';
import { createSession, getSession, updateSession, appendConversation, type SessionRow } from '../db/queries.js';

export function startSession(nodeId?: string, nodeName?: string): string {
  const id = nanoid(12);
  createSession(id, nodeId, nodeName);
  return id;
}

export function loadSession(id: string): SessionRow | undefined {
  return getSession(id);
}

export function saveAnalysisResult(
  sessionId: string,
  pageType: string,
  aiReview: unknown,
  lintResult: unknown,
  initialScore: number,
  referoData?: unknown,
): void {
  const existing = getSession(sessionId);
  const updates: Record<string, unknown> = {
    page_type: pageType,
    ai_review: aiReview,
    lint_result: lintResult,
    score_current: initialScore,
    issues_found: (lintResult as any)?.summary?.totalErrors || 0,
  };
  // Only set score_initial on the first analysis — never overwrite it
  if (!existing || existing.score_initial === null || existing.score_initial === undefined) {
    updates.score_initial = initialScore;
  }
  if (referoData) {
    updates.refero_data = referoData;
  }
  updateSession(sessionId, updates);
}

export function saveReferoResult(sessionId: string, referoData: unknown): void {
  updateSession(sessionId, { refero_data: referoData });
}

export function addMessage(sessionId: string, role: string, content: string): void {
  appendConversation(sessionId, role, content);
}

export function getConversation(sessionId: string): Array<{ role: string; content: string }> {
  const session = loadSession(sessionId);
  if (!session) return [];
  try {
    return JSON.parse(session.conversation || '[]');
  } catch {
    return [];
  }
}

export function getSessionContext(sessionId: string): string {
  const session = loadSession(sessionId);
  if (!session) return 'No session context available.';

  const parts: string[] = [];
  if (session.node_name) parts.push(`Component: ${session.node_name}`);
  if (session.page_type) parts.push(`Page type: ${session.page_type}`);
  if (session.score_current !== null) parts.push(`Current score: ${session.score_current}/100`);
  if (session.issues_found > 0) parts.push(`Issues: ${session.issues_found} found, ${session.issues_fixed} fixed`);

  if (session.ai_review) {
    try {
      const review = JSON.parse(session.ai_review);
      if (review.summary) parts.push(`Review summary: ${review.summary}`);
    } catch { /* ignore */ }
  }

  if (session.refero_data) {
    try {
      const refero = JSON.parse(session.refero_data);
      if (refero.summary) parts.push(`Refero comparison: ${refero.summary}`);
      if (refero.screenshots?.length) {
        parts.push(`Refero examples: ${refero.screenshots.length} screens from ${refero.screenshots.map((s: { company: string }) => s.company).filter(Boolean).join(', ')}`);
      }
    } catch { /* ignore */ }
  }

  return parts.join('\n');
}
