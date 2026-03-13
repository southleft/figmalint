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
  initialScore: number
): void {
  updateSession(sessionId, {
    page_type: pageType,
    ai_review: aiReview,
    lint_result: lintResult,
    score_initial: initialScore,
    score_current: initialScore,
    issues_found: (lintResult as any)?.summary?.totalErrors || 0,
  });
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

  return parts.join('\n');
}
